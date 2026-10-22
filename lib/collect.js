/* 토요일645 — 당첨번호 수집 (공식 + 뉴스·대체 출처 교차 확인)
   ───────────────────────────────────────────────────────────────
   여기서는 '확인된 값' 을 만들기만 합니다. 저장은 lib/store.js 가 합니다.
   확인되지 않은 값은 돌려주지 않습니다 — 지어내지 않습니다.

   ■ 확인하는 방법
     ① 동행복권 공식 JSON. 요청한 회차와 응답의 회차가 같아야 합니다.
     ② 공식이 안 되면, 뉴스와 등록된 대체 조회원에서 후보를 모아
        서로 다른 사이트 두 곳 이상이 똑같이 말할 때만 받아들입니다.
        한 곳뿐이면 확정하지 않습니다.

   ■ 바깥 요청에는 모두 제한 시간이 걸려 있습니다
     한 곳이 느리다고 전체가 멈추면, 추첨 직후에 결과가 늦어집니다.     */

import { crossCheck, newsCandidates, cut, T_OFFICIAL } from './news.js';
import * as Extra from './sources.js';
import { noDeadline } from './deadline.js';

/* 공식 JSON 조회 주소. 동행복권이 주소를 바꾸면 환경변수로 갈아끼웁니다.
   {round} 자리에 회차가 들어갑니다. 정하지 않으면 지금까지 쓰던 주소입니다. */
const DH_TPL = (process.env.DH_JSON_URL || '').trim()
  || 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={round}';
export const dhUrl = r => DH_TPL.indexOf('{round}') >= 0
  ? DH_TPL.replace(/\{round\}/g, String(r))
  : DH_TPL + String(r);

/* 1241회 추첨 = 2026-09-12 20:45 KST (회차가 넘어가는 시각). 한국 시간으로만 셉니다. */
const BASE_ROUND = 1241;
const BASE_MS = Date.UTC(2026, 8, 12, 11, 45, 0);
const WEEK = 7 * 24 * 60 * 60 * 1000;
/* 추첨 생방송은 20:35 입니다. 조회는 그 시각을 기준으로 해야
   20:45 까지 기다리지 않습니다. */
const DRAW_LIVE = 10 * 60 * 1000;

export const drawStartMs = r => BASE_MS + (r - BASE_ROUND) * WEEK - DRAW_LIVE;
export const drawStarted = r => Date.now() >= drawStartMs(r);
export function latestRound() {
  const diff = Date.now() - (BASE_MS - DRAW_LIVE);
  return BASE_ROUND + Math.max(0, Math.floor(diff / WEEK));
}
export function drawDate(r) {
  const d = new Date(BASE_MS + (r - BASE_ROUND) * WEEK + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

const log = [];
export function note(o) {
  log.push({ at: new Date().toISOString(), ...o });
  if (log.length > 50) log.shift();
}
export const notes = () => log.slice();

export function valid(v) {
  if (!v || !Array.isArray(v.nums) || v.nums.length !== 6) return false;
  const ns = v.nums.map(Number);
  if (ns.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(ns).size !== 6) return false;
  const b = Number(v.bonus);
  return Number.isInteger(b) && b >= 1 && b <= 45 && !ns.includes(b);
}

/* ── ① 공식 ── */
export async function fetchOfficial(round, ctx) {
  const dl = ctx || noDeadline();
  const url = dhUrl(round);
  if (!dl.canStart(1500)) {
    note({ kind: 'official-skip', round, why: '남은 시간이 모자라 시작하지 않았습니다' });
    return null;
  }
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
                      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=byWin'
      },
      signal: dl.fetchSignal(T_OFFICIAL)
    });
  } catch (e) {
    note({ kind: 'official-throw', round, url, ms: Date.now() - t0,
           why: String(e && e.message).slice(0, 140) });
    return null;
  }
  const ms = Date.now() - t0;
  if (!res.ok) {
    let head = '';
    try { head = (await res.text()).slice(0, 160); } catch (e) {}
    note({ kind: 'official-http', round, url, status: res.status, ms, head });
    return null;
  }
  let d, raw = '';
  try { raw = await res.text(); d = JSON.parse(raw); }
  catch (e) {
    note({ kind: 'official-notjson', round, url, status: res.status, ms,
           ctype: res.headers.get('content-type') || '', head: raw.slice(0, 160) });
    return null;
  }
  if (!d || d.returnValue !== 'success') {
    note({ kind: 'official-fail', round, url, status: res.status, ms,
           returnValue: (d && d.returnValue) || '(없음)' });
    return null;
  }
  const row = {
    round: Number(d.drwNo),
    date: String(d.drwNoDate || '').slice(0, 10),
    nums: [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6]
            .map(Number).sort((a, b) => a - b),
    bonus: Number(d.bnusNo)
  };
  /* 요청한 회차와 응답의 회차가 같은지 봅니다.
     다른 회차가 와도 요청한 자리에 넣으면 그 회차의 번호가 바뀝니다. */
  if (row.round !== Number(round)) {
    note({ kind: 'official-mismatch', round, got: row.round, url, ms });
    return null;
  }
  if (!valid(row)) {
    note({ kind: 'official-invalid', round, url, got: JSON.stringify(row).slice(0, 160) });
    return null;
  }
  note({ kind: 'official-ok', round, ms, nums: row.nums.join(','), bonus: row.bonus });
  return row;
}

/* ── ② 교차 확인 ── */
const NEED = 2;
const keyOf = c => c.round + '|' + c.nums.join(',') + '|' + c.bonus;

/* '서로 다른 출처' 는 실제 사이트(호스트) 하나를 한 곳으로 셉니다.
   종류(news/extra)가 달라도 같은 사이트면 한 곳입니다 —
   그렇지 않으면 한 사이트가 스스로를 확인해 주는 꼴이 됩니다. */
function hostKey(u) {
  try { return new URL(String(u)).hostname.replace(/^www\.|^m\./, '').toLowerCase(); }
  catch (e) { return ''; }
}
function whoOf(c) {
  if (!c) return '';
  return hostKey(c.url) || String(c.host || c.provider || '').trim().toLowerCase();
}

export function agreeOn(cands, need) {
  const want = Math.max(2, need || NEED);
  const groups = new Map();
  for (const c of (cands || [])) {
    if (!valid(c)) continue;
    const k = keyOf(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  let top = null, topN = 0;
  for (const [, g] of groups) {
    const n = new Set(g.map(whoOf)).size;
    if (n > topN) { top = g; topN = n; }
  }
  if (!top || topN < want) return { ok: false, groups: groups.size, best: topN };
  const dates = [...new Set(top.map(c => c.date).filter(Boolean))];
  return {
    ok: true, agreed: topN,
    row: { round: top[0].round, nums: top[0].nums, bonus: top[0].bonus,
           date: dates.length === 1 ? dates[0] : '' },
    sources: top.map(c => ({ provider: c.provider, host: c.host, url: c.url,
                             kind: c.kind, checkedAt: c.checkedAt })),
    others: [...groups.entries()].filter(([k]) => k !== keyOf(top[0]))
              .map(([k, g]) => ({ value: k, by: g.map(x => x.provider) }))
  };
}

export async function viaCross(round, ctx) {
  const dl = ctx || noDeadline();
  if (!dl.canStart(2000)) {
    note({ kind: 'cross-skip', round, why: '남은 시간이 모자라 시작하지 않았습니다' });
    return null;
  }
  /* 뉴스와 대체 조회원을 나란히 — 한쪽이 막혀도 다른 쪽은 돕니다 */
  const [nw, ex] = await Promise.all([
    newsCandidates(round, { max: 6, ctx: dl }).catch(e => ({ state: 'error',
      why: String(e && e.message).slice(0, 80), candidates: [], delays: [], tried: [] })),
    Extra.collect(round, { ctx: dl }).catch(e => ({ state: 'error',
      why: String(e && e.message).slice(0, 80), candidates: [], tried: [] }))
  ]);
  if (nw.state === 'not-configured') note({ kind: 'news-skip', round, why: 'NAVER 키 없음' });
  if (nw.state === 'error') note({ kind: 'news-error', round, why: nw.why || '' });
  if (ex.state === 'not-configured') note({ kind: 'extra-skip', round, why: 'EXTRA_SOURCES 없음' });
  if (ex.tried && ex.tried.length) note({ kind: 'extra-tried', round, tried: ex.tried });

  const cands = [...(nw.candidates || []), ...(ex.candidates || [])];
  note({ kind: 'cross-pool', round, count: cands.length,
         by: cands.map(c => c.provider + ' ' + c.nums.join(',') + '+' + c.bonus) });

  const a = agreeOn(cands, NEED);
  if (!a.ok) {
    if (cands.length) note({ kind: 'cross-short', round, best: a.best, need: NEED, groups: a.groups });
    return null;
  }
  note({ kind: 'cross-ok', round, agreed: a.agreed,
         nums: a.row.nums.join(','), bonus: a.row.bonus,
         sources: a.sources.map(x => x.provider + ' ' + x.url) });
  return {
    row: { round, date: a.row.date || drawDate(round), nums: a.row.nums, bonus: a.row.bonus },
    via: 'cross',
    sources: a.sources
  };
}

/* ── 한 회차를 확인합니다 ──
   돌려주는 것: { row, via, sources } 또는 null (확인 못 함)
   확인하지 못하면 null 입니다. 추측값은 절대 돌려주지 않습니다. */
export async function collectRound(round, ctx) {
  const dl = ctx || noDeadline();
  const r = Number(round);
  if (!(r > 0)) return null;
  if (!drawStarted(r)) { note({ kind: 'before-draw', round: r }); return null; }

  const off = await fetchOfficial(r, dl);
  if (off) return { row: off, via: 'official', sources: [] };
  if (dl.expired()) { note({ kind: 'deadline', round: r, at: 'official' }); return null; }

  const cross = await viaCross(r, dl);
  if (cross) return cross;

  note({ kind: dl.expired() ? 'deadline' : 'not-confirmed', round: r });
  return null;
}
