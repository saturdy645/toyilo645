/* 토요일645 — 대체 조회원 (공식 외의 출처)
   ───────────────────────────────────────────────────────────────
   공식(동행복권) 조회가 늦거나 막혔을 때 쓰는 '다른 출처들' 입니다.
   복똑방처럼 결과를 먼저 올리는 곳을 여기에 등록해 쓸 수 있습니다.

   ■ 주소를 코드에 적어 두지 않습니다
     어떤 곳의 결과 요청 주소가 무엇인지는 실제로 확인해야 아는 일입니다.
     확인하지 않은 주소를 지어내 적으면, 조용히 실패하거나 엉뚱한 값을
     가져올 수 있습니다. 그래서 주소는 환경변수로 받습니다.

       EXTRA_SOURCES = [{"name":"복똑방","url":"https://…/{round}"}, …]

     · {round} 자리에 회차가 들어갑니다. 없으면 주소를 그대로 씁니다.
     · 환경변수가 비어 있으면 이 모듈은 아무 일도 하지 않습니다.

   ■ 읽는 방법
     받은 것이 JSON 이면 동행복권과 같은 모양(drwtNo1…6, bnusNo)을 먼저 봅니다.
     그 모양이 아니면 글자만 남겨, 뉴스 기사에 쓰던 것과 똑같은 파서로
     '제1245회 … 보너스 N' 을 찾습니다. 이미 실물 기사로 검증된 파서입니다.
     숫자를 하나라도 못 뽑으면 그 출처는 버립니다 — 추측해 채우지 않습니다.

   ■ 혼자서는 확정하지 않습니다
     여기서 얻은 값은 '후보' 입니다. 서로 다른 출처 두 곳 이상이
     회차·번호 여섯 개·보너스까지 모두 같을 때만 반영됩니다.
     판단은 lotto.js 의 agree() 가 합니다.
   ─────────────────────────────────────────────────────────────── */

import { textOf, parseArticle, cut, T_EXTRA } from './news.js';
import { noDeadline } from './deadline.js';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
           'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\.|^m\./, ''); }
  catch (e) { return ''; }
}

/* 환경변수에 등록된 출처 목록. 형식이 깨져 있으면 조용히 빈 목록입니다. */
export function listed() {
  const raw = (process.env.EXTRA_SOURCES || '').trim();
  if (!raw) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .map(x => ({ name: String((x && x.name) || '').trim(),
                 url: String((x && x.url) || '').trim() }))
    .filter(x => x.name && /^https?:\/\//.test(x.url));
}

const okSix = ns =>
  ns.length === 6 && ns.every(n => Number.isInteger(n) && n >= 1 && n <= 45)
  && new Set(ns).size === 6;

/* 동행복권과 같은 JSON 모양일 때 */
function fromDhJson(d, want) {
  if (!d || typeof d !== 'object') return null;
  const r = Number(d.drwNo);
  /* 회차 근거가 없으면 후보로 쓰지 않습니다.
     예전에는 응답에 회차가 없을 때 '요청한 회차' 로 대신 채웠습니다.
     그러면 어느 회차인지 말하지 않은 값이 그 회차의 번호가 되어 버립니다. */
  if (!Number.isInteger(r) || r <= 0) return null;
  if (want && r !== Number(want)) return null;            // 다른 회차면 버립니다
  const ns = [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6]
               .map(Number).filter(n => n >= 1 && n <= 45);
  const b = Number(d.bnusNo);
  if (!okSix(ns) || !Number.isInteger(b) || !(b >= 1 && b <= 45) || ns.includes(b)) return null;
  return { round: r, nums: ns.slice().sort((a, b2) => a - b2), bonus: b,
           date: String(d.drwNoDate || '').slice(0, 10) };
}

/* 한 출처를 읽습니다. 돌려주는 값은 늘 '무엇을 받았는지' 를 함께 담습니다 —
   실패해도 왜 실패했는지 알 수 있게 하려는 것입니다. */
export async function readOne(src, round, opt) {
  const o = opt || {};
  const dl = o.ctx || noDeadline();
  const url = String(src.url).replace(/\{round\}/g, String(round));
  if (!dl.canStart(1500))
    return { name: src.name, host: hostOf(url), url, status: 0, ms: 0,
             why: '남은 시간이 모자라 시작하지 않았습니다' };
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9',
                 'Accept': 'application/json, text/html;q=0.9, */*;q=0.8' },
      redirect: 'follow',
      signal: dl.fetchSignal(T_EXTRA)
    });
  } catch (e) {
    return { name: src.name, host: hostOf(url), url, status: 0, ms: Date.now() - t0,
             why: '연결 실패 · ' + String(e && e.message).slice(0, 120) };
  }
  const ms = Date.now() - t0;
  let body = '';
  try { body = await res.text(); } catch (e) {}
  const base = { name: src.name, host: hostOf(url), url, status: res.status, ms,
                 ctype: res.headers.get('content-type') || '', length: body.length };
  if (o.raw) base.head = body.slice(0, 300);
  if (!res.ok) return { ...base, why: 'HTTP ' + res.status };

  /* ① JSON 모양 먼저 */
  let got = null;
  if (/json/i.test(base.ctype) || /^\s*[{[]/.test(body)) {
    let d = null;
    try { d = JSON.parse(body); } catch (e) {}
    if (d) {
      got = fromDhJson(d, round);
      /* 목록 안에 들어 있는 경우도 봅니다 */
      if (!got && Array.isArray(d)) for (const x of d) { got = fromDhJson(x, round); if (got) break; }
      if (!got && Array.isArray(d && d.draws))
        for (const x of d.draws) { got = fromDhJson(x, round); if (got) break; }
    }
  }
  /* ② 글자에서 — 뉴스 기사에 쓰던 그 파서 */
  if (!got) {
    const text = textOf(body);
    got = parseArticle(text, round);
    if (!got && o.raw) base.textHead = text.slice(0, 300);
  }
  if (!got) return { ...base, why: '그 회차 번호를 찾지 못했습니다' };
  return { ...base, row: got };
}

/* 등록된 모든 출처를 읽어 '후보' 를 모읍니다.
   한 출처가 느려도 전체가 멈추지 않게 나란히 부릅니다. */
export async function collect(round, opt) {
  const srcs = listed();
  if (!srcs.length) return { state: 'not-configured', candidates: [], tried: [] };
  const outs = await Promise.all(srcs.map(s => readOne(s, round, opt).catch(e => ({
    name: s.name, host: hostOf(s.url), url: s.url, status: 0,
    why: '예외 · ' + String(e && e.message).slice(0, 120)
  }))));
  return {
    state: 'ok',
    candidates: outs.filter(x => x.row).map(x => ({
      provider: x.name, host: x.host, url: x.url, kind: 'extra',
      round: x.row.round, nums: x.row.nums, bonus: x.row.bonus, date: x.row.date,
      checkedAt: new Date().toISOString()
    })),
    tried: outs.map(x => ({ name: x.name, host: x.host, status: x.status,
                            ms: x.ms, why: x.why || 'ok',
                            got: x.row ? (x.row.nums.join(',') + '+' + x.row.bonus) : '' }))
  };
}
