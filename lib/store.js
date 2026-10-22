/* 토요일645 — Supabase 저장소 (lotto_draws)
   ───────────────────────────────────────────────────────────────
   당첨번호의 기준 저장소는 예전부터 Supabase 의 lotto_draws 입니다.
   이 파일은 그 표를 읽고 쓰는 길만 한곳에 모읍니다.
   읽는 방식과 열 이름은 기존 api/lotto.js · api/update-lotto.js 와 같습니다
   (round, draw_date, nums, bonus) — 없는 열을 새로 넣지 않습니다.

   ■ 이미 있는 회차는 덮어쓰지 않습니다
     같은 회차가 이미 저장돼 있으면,
       · 번호가 같으면  → 'same'    (아무 일도 하지 않습니다)
       · 번호가 다르면  → 'conflict' (쓰지 않고, 무엇이 달랐는지 남깁니다)
     기존 api/update-lotto.js 가 409 로 거절하는 것과 같은 규칙입니다.
     자동 수집이 사람이 넣어 둔 값을 조용히 바꿔 버리면 안 됩니다.      */

import { noDeadline } from './deadline.js';

export const BUILD = '2026-10-22b';

/* DB 요청 제한 시간. 읽기는 요청 전체 마감에 함께 묶이고,
   쓰기는 '시작했으면 끝내도록' 자기 시간만 씁니다 —
   넣는 중에 끊기면 들어갔는지 아닌지 알 수 없게 되기 때문입니다.
   대신 쓰기는 남은 시간이 넉넉할 때만 시작합니다. */
const T_DB_READ = 6000, T_DB_WRITE = 4000;

export function dbConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, key, ready: !!(url && key) };
}

function headers(key, extra) {
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key }, extra || {});
}

/* 저장된 값인지 검사합니다 — 기존 api/lotto.js 의 validDraw 와 같은 기준입니다 */
export function validDraw(draw) {
  if (!draw || !Number.isInteger(Number(draw.round))) return false;
  const nums = Array.isArray(draw.nums) ? draw.nums.map(Number) : [];
  if (nums.length !== 6) return false;
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(nums).size !== 6) return false;
  const bonus = Number(draw.bonus);
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return false;
  if (nums.includes(bonus)) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(draw.draw_date || draw.date || ''));
}

export function normalize(row) {
  return {
    round: Number(row.round),
    date: String(row.draw_date || row.date).slice(0, 10),
    nums: row.nums.map(Number).sort((a, b) => a - b),
    bonus: Number(row.bonus)
  };
}

const same = (a, b) =>
  a && b &&
  a.nums.slice().sort((x, y) => x - y).join(',') === b.nums.slice().sort((x, y) => x - y).join(',') &&
  Number(a.bonus) === Number(b.bonus);

/* ── 읽기 ──
   기존 api/lotto.js 의 질의를 그대로 옮긴 것입니다.
     round=N → 그 회차만 / since=N → N 다음부터 세 개 / 없으면 최근 60회 */
export async function readDraws({ round = 0, since = 0, ctx } = {}) {
  const dl = ctx || noDeadline();
  const { url, key, ready } = dbConfig();
  if (!ready) throw new Error('Lottery database is not configured');

  let q = `${url}/rest/v1/lotto_draws?select=round,draw_date,nums,bonus`;
  if (round > 0) q += `&round=eq.${round}&limit=1`;
  else if (since > 0) q += `&round=gt.${since}&order=round.asc&limit=3`;
  else q += `&order=round.desc&limit=60`;

  const res = await fetch(q, { headers: headers(key), signal: dl.fetchSignal(T_DB_READ) });
  if (!res.ok) throw new Error('Supabase returned ' + res.status);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter(validDraw).map(normalize);
}

export async function getRound(round, ctx) {
  const rows = await readDraws({ round: Number(round), ctx });
  return rows[0] || null;
}

/* 저장된 회차 번호만 모아 옵니다 — 무엇이 비었는지 보려고 씁니다 */
export async function haveRounds(from, to, ctx) {
  const dl = ctx || noDeadline();
  const { url, key, ready } = dbConfig();
  if (!ready) throw new Error('Lottery database is not configured');
  const q = `${url}/rest/v1/lotto_draws?select=round&round=gte.${from}&round=lte.${to}`;
  const res = await fetch(q, { headers: headers(key), signal: dl.fetchSignal(T_DB_READ) });
  if (!res.ok) throw new Error('Supabase returned ' + res.status);
  const rows = await res.json();
  return new Set((Array.isArray(rows) ? rows : []).map(r => Number(r.round)));
}

/* ── 쓰기 ──
   돌려주는 state
     inserted  새로 넣었습니다
     same      이미 같은 값이 있습니다 (아무 일도 안 함)
     conflict  이미 다른 값이 있습니다 (덮어쓰지 않았습니다)
     invalid   값이 형식을 벗어났습니다
     error     데이터베이스 쪽 문제                                */
export async function saveDraw(draw, ctx) {
  const dl = ctx || noDeadline();
  const { url, key, ready } = dbConfig();
  if (!ready) return { state: 'error', why: 'Lottery database is not configured' };

  const row = {
    round: Number(draw.round),
    draw_date: String(draw.draw_date || draw.date || '').slice(0, 10),
    nums: (draw.nums || []).map(Number).sort((a, b) => a - b),
    bonus: Number(draw.bonus)
  };
  if (!validDraw(row)) return { state: 'invalid', round: row.round };

  let existing = null;
  try {
    existing = await getRound(row.round, dl);
  } catch (e) {
    return { state: 'error', round: row.round, why: String(e && e.message).slice(0, 140) };
  }

  if (existing) {
    if (same(existing, row)) return { state: 'same', round: row.round };
    /* 덮어쓰지 않습니다. 사람이 보고 판단할 수 있게 둘 다 남깁니다. */
    const detail = {
      state: 'conflict', round: row.round,
      stored: { nums: existing.nums, bonus: existing.bonus, date: existing.date },
      incoming: { nums: row.nums, bonus: row.bonus, date: row.draw_date }
    };
    try {
      console.error('lotto conflict — not overwritten:', JSON.stringify(detail));
    } catch (e) {}
    return detail;
  }

  /* 넣기 시작했으면 끝까지 가야 합니다. 그래서 자기 시간만 걸고,
     남은 시간이 그보다 넉넉할 때에만 시작합니다. */
  if (!dl.canStart(T_DB_WRITE + 500))
    return { state: 'skipped', round: row.round, why: '남은 시간이 모자라 저장을 시작하지 않았습니다' };
  try {
    const res = await fetch(`${url}/rest/v1/lotto_draws`, {
      method: 'POST',
      headers: headers(key, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(row),
      signal: (noDeadline()).fetchSignal(T_DB_WRITE)
    });
    if (!res.ok) {
      let head = '';
      try { head = (await res.text()).slice(0, 160); } catch (e) {}
      return { state: 'error', round: row.round, why: 'insert ' + res.status + ' ' + head };
    }
    return { state: 'inserted', round: row.round };
  } catch (e) {
    return { state: 'error', round: row.round, why: String(e && e.message).slice(0, 140) };
  }
}
