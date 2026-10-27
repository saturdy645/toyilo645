/* 토요일645 — 뉴스 교차검증 모듈
   ───────────────────────────────────────────────────────────────
   공식(동행복권) 조회가 늦거나 실패할 때만 씁니다.
   서로 다른 '언론사' 두 곳 이상의 기사 '본문'에서 뽑은 값이
   회차·당첨번호 6개·보너스까지 모두 같을 때만 결과로 인정합니다.
   (검색 결과의 제목·요약만으로는 절대 확정하지 않습니다 — 본문을 받아 파싱합니다)

   ■ 필요한 환경변수
     NAVER_CLIENT_ID      네이버 검색 API 클라이언트 아이디
     NAVER_CLIENT_SECRET  네이버 검색 API 시크릿
     없으면 이 모듈은 아무 일도 하지 않고 {state:'not-configured'} 를 돌려줍니다.
     (키 값은 서버에만 두고 앱으로 내려보내지 않습니다)

   ■ 하지 않는 것
   · 한 곳만 읽고 확정하지 않습니다.
   · 같은 언론사 기사 두 개를 '두 곳'으로 세지 않습니다(도메인으로 가립니다).
   · 숫자를 하나라도 못 뽑으면 그 기사는 버립니다. 추측해서 채우지 않습니다.
   ─────────────────────────────────────────────────────────────── */

const UA = 'toyoil645/1.0 (+result-verify)';

/* ── 바깥 요청 제한 시간 ──
   한 곳이 느리면 그 요청 때문에 최신 결과까지 함께 멈춥니다.
   그래서 바깥으로 나가는 모든 요청에 시간을 겁니다.
   시간이 지나면 그 요청만 포기하고 나머지는 계속 돕니다. */
import { noDeadline } from './deadline.js';

/* 마감이 넘어오지 않으면 '마감 없음' 으로 둡니다 — 기존 호출을 깨지 않습니다 */
const ctxOf = o => (o && o.ctx) || noDeadline();

export function cut(ms){
  try{ if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout)
         return AbortSignal.timeout(ms); }catch(e){}
  const c = new AbortController();
  setTimeout(() => { try{ c.abort(); }catch(e){} }, ms);
  return c.signal;
}
export const T_NEWS = 6000, T_PAGE = 7000, T_EXTRA = 7000, T_OFFICIAL = 6000;

/* ── 글자만 남기기 ── */
export function textOf(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const okSix = ns =>
  ns.length === 6 && ns.every(n => n >= 1 && n <= 45) && new Set(ns).size === 6;

/* ── 기사 본문에서 한 회차의 결과를 뽑습니다 ──
   같은 글 안에 여러 회차가 섞여 있을 수 있어서, 찾는 회차가 적힌
   자리 '뒤쪽'에서만 번호를 찾습니다. */
export function hostOfUrl(u){
  try{ return new URL(String(u)).hostname.replace(/^www\.|^m\./, '').toLowerCase(); }
  catch(e){ return ''; }
}

export function parseArticle(text, want) {
  const t = String(text || '');
  const round = Number(want);
  if (!(round > 0)) return null;

  /* 찾는 회차가 글에 나오는지 — '제1245회', '1245회' 모두 받습니다 */
  const re = new RegExp('제?\\s*' + round + '\\s*회', 'g');
  let m, best = null;
  while ((m = re.exec(t))) {
    const seg = t.slice(m.index, m.index + 600);   // 그 뒤 600자 안에서만

    /* 보너스를 먼저 떼어 냅니다. 안 그러면 본번호 여섯 개에 섞입니다. */
    const bm = seg.match(/보너스\s*(?:번호)?\s*(?:는|은|:|＝|=)?\s*['"'"‘’“”]?\s*(\d{1,2})/);
    if (!bm) continue;
    const bonus = Number(bm[1]);
    if (!(bonus >= 1 && bonus <= 45)) continue;

    /* 보너스가 적힌 자리 앞쪽에서 본번호 여섯 개를 찾습니다.
       '1244회'처럼 붙어 있는 긴 숫자를 12·44 로 쪼개 읽으면 엉뚱한 번호가
       만들어집니다. 그래서 앞뒤가 숫자가 아닌 '한두 자리 수'만 셉니다. */
    const head = seg.slice(0, bm.index);
    const nums = (head.match(/(?:^|[^\d])(\d{1,2})(?![\d])/g) || [])
      .map(x => Number(x.replace(/[^\d]/g, '')))
      .filter(n => n >= 1 && n <= 45);
    /* 보너스 바로 앞의 여섯 개만 봅니다. 맞지 않으면 다른 구간을 뒤지지 않고
       버립니다 — 뒤지다 보면 회차·당첨금 숫자로 그럴듯한 조합이 만들어집니다. */
    if (nums.length < 6) continue;
    const w = nums.slice(-6);
    if (!okSix(w) || w.includes(bonus)) continue;
    const six = w.slice().sort((a, b) => a - b);

    /* 추첨일 — 있으면 받고, 없으면 비워 둡니다(지어내지 않습니다) */
    let date = '';
    const dm = seg.match(/(20\d{2})[.\-년]\s*(\d{1,2})[.\-월]\s*(\d{1,2})/);
    if (dm) date = dm[1] + '-' + String(dm[2]).padStart(2, '0') + '-' + String(dm[3]).padStart(2, '0');

    best = { round, nums: six, bonus, date };
    break;
  }
  return best;
}

/* ── 지연 안내를 뽑습니다 ──
   '지연·연기' 같은 말이 있고, 바뀐 시각이 적혀 있으면 함께 담습니다.
   시각이 없으면 until 을 비워 둡니다. 시간을 추측하지 않습니다. */
export function parseDelay(text, want) {
  const t = String(text || '');
  const round = Number(want);
  const hit = t.match(/(지연|연기|순연|늦어)/);
  if (!hit) return null;
  const near = t.slice(Math.max(0, hit.index - 300), hit.index + 400);
  if (round > 0 && !new RegExp('제?\\s*' + round + '\\s*회').test(t)) return null;

  /* 사유 — '…로 지연', '…때문에 연기' 앞의 짧은 구절.
     앞말을 너무 길게 물면 '제1245회 로또 추첨은 …' 까지 끌려옵니다.
     그래서 띄어쓰기 기준 네 마디까지만 잡고, 머리말을 떼어 냅니다. */
  let reason = '';
  const rm = near.match(/([가-힣A-Za-z0-9·]+(?:\s[가-힣A-Za-z0-9·]+){0,3})\s*(?:으로|로|때문에)\s*(?:추첨이?\s*)?(?:지연|연기|순연)/);
  if (rm) {
    reason = rm[1]
      .replace(/^제?\s*\d{3,5}\s*회\s*/, '')
      .replace(/^로또\s*/, '')
      .replace(/^추첨[은이]?\s*/, '')
      .replace(/으$/, '')            // '…변경으' + '로' 로 끊긴 경우
      .replace(/[은는이가을를]$/, '')
      .trim();
    const w = reason.split(/\s+/);
    if (w.length > 4) reason = w.slice(-4).join(' ');     // 너무 길면 뒤쪽만
  }
  if (!reason || reason.length < 2) return null;

  let until = '';
  const um = near.match(/(오[전후]\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)/) ||
             near.match(/(\d{1,2}\s*시\s*\d{1,2}\s*분)/) ||
             near.match(/(\d{1,2}:\d{2})/);
  if (um) until = um[1].replace(/\s+/g, ' ').trim();
  return { round, reason, until };
}

const press = url => {
  try { return new URL(url).hostname.replace(/^www\.|^m\./, ''); }
  catch (e) { return ''; }
};

/* ── 네이버 뉴스 검색 ── */
async function search(query, display, ctx) {
  const id = process.env.NAVER_CLIENT_ID, sec = process.env.NAVER_CLIENT_SECRET;
  if (!id || !sec) return null;
  const dl = ctx || noDeadline();
  if (!dl.canStart(1500)) return null;            // 남은 시간이 모자라면 시작하지 않습니다
  const u = 'https://openapi.naver.com/v1/search/news.json?sort=date&display=' +
            (display || 20) + '&query=' + encodeURIComponent(query);
  const r = await fetch(u, {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec, 'User-Agent': UA },
    signal: dl.fetchSignal(T_NEWS)
  });
  if (!r.ok) return null;
  const d = await r.json();
  return Array.isArray(d && d.items) ? d.items : null;
}

async function body(url, ctx) {
  const dl = ctx || noDeadline();
  if (!dl.canStart(1500)) return null;            // 남은 시간이 모자라면 열지 않습니다
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow',
                               signal: dl.fetchSignal(T_PAGE) });
  if (!r.ok) return null;
  const html = await r.text();
  /* 기사 게시·수정 시각 — 메타에 있으면 받아 둡니다 */
  let published = '';
  const pm = html.match(/property=["'](?:article:published_time|article:modified_time)["']\s+content=["']([^"']+)["']/i)
          || html.match(/content=["']([^"']+)["']\s+property=["'](?:article:published_time|article:modified_time)["']/i);
  if (pm) published = pm[1];
  return { text: textOf(html), published };
}

/* ── 교차검증 본체 ──
   돌려주는 값
     {state:'ok',      row:{round,date,nums,bonus}, sources:[…]}   2곳 이상 일치
     {state:'delay',   notice:{round,reason,until,source}, sources:[…]}
     {state:'mismatch',tried:[…]}                                 값이 서로 달라 확정 불가
     {state:'none'|'not-configured'|'error'}
*/
/* ── 기사들을 모읍니다 (판정은 하지 않습니다) ──
   돌려주는 값: {state, results, delays, tried}
   results 한 줄 = 한 언론사의 기사 본문에서 뽑은 {round,nums,bonus,date,url,press,…} */
export async function gather(round, opt) {
  const o = opt || {};
  const max = Math.max(2, Number(o.max) || 6);
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET)
    return { state: 'not-configured', results: [], delays: [], tried: [] };

  const dl = ctxOf(o);
  let items = null;
  try { items = await search(round + '회 로또 당첨번호', 20, dl); }
  catch (e) { return { state: 'error', why: 'search', results: [], delays: [], tried: [] }; }
  if (!items || !items.length) return { state: 'none', results: [], delays: [], tried: [] };

  const seenPress = new Set();
  const results = [], delays = [], tried = [];
  let cut0 = false;
  for (const it of items) {
    if (results.length >= max) break;
    /* ── 기사 하나를 더 열 시간이 남았는지 ──
       여기가 가장 위험한 자리였습니다. 검색 결과를 하나씩 차례로 여는데
       느린 기사가 몇 개만 있어도 함수 제한 시간을 넘겼습니다. */
    if (!dl.canStart(1500)) { cut0 = true; break; }
    const url = it.originallink || it.link;
    const p = press(url);
    if (!p || seenPress.has(p)) continue;          // 같은 언론사는 한 번만
    let b = null;
    try { b = await body(url, dl); } catch (e) { if (dl.expired()) { cut0 = true; break; } continue; }
    if (!b) continue;
    seenPress.add(p);
    const got = parseArticle(b.text, round);
    const at = new Date().toISOString();
    if (got) {
      results.push({ ...got, url, press: p, published: b.published || '', checkedAt: at });
      tried.push({ url, press: p, got: got.nums.join(',') + '+' + got.bonus });
    } else {
      const dly = parseDelay(b.text, round);
      if (dly) delays.push({ ...dly, url, press: p, published: b.published || '', checkedAt: at });
      tried.push({ url, press: p, got: dly ? 'delay' : 'none' });
    }
  }
  return { state: 'ok', results, delays, tried };
}

/* 교차검증 대상이 되는 '후보' 들 — 다른 출처와 맞대어 보려고 모양을 맞춥니다 */
export async function newsCandidates(round, opt) {
  const g = await gather(round, opt);
  return {
    state: g.state,
    candidates: (g.results || []).map(r => ({
      /* host 는 실제 사이트 주소입니다. 언론사 이름을 넣으면 같은 사이트가
         뉴스와 대체 조회원으로 각각 들어왔을 때 두 곳으로 세어집니다. */
      provider: r.press, host: hostOfUrl(r.url) || r.press, url: r.url, kind: 'news',
      round: r.round, nums: r.nums, bonus: r.bonus, date: r.date || '',
      published: r.published || '', checkedAt: r.checkedAt
    })),
    delays: g.delays || [], tried: g.tried || []
  };
}

export async function crossCheck(round, opt) {
  const o = opt || {};
  const need = Math.max(2, Number(o.need) || 2);
  const g = await gather(round, { max: Math.max(need, Number(o.max) || 6) });
  if (g.state === 'not-configured') return { state: 'not-configured' };
  if (g.state === 'error') return { state: 'error', why: g.why };
  if (g.state === 'none') return { state: 'none' };
  const results = g.results, delays = g.delays, tried = g.tried;

  /* ① 결과 — 회차·번호 6개·보너스가 모두 같은 언론사가 need 곳 이상 */
  const key = r => r.round + '|' + r.nums.join(',') + '|' + r.bonus;
  const groups = new Map();
  for (const r of results) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  let top = null;
  for (const [, g] of groups) if (!top || g.length > top.length) top = g;
  if (top && top.length >= need) {
    /* 추첨일은 적어 둔 기사들이 서로 어긋나면 비워 둡니다 */
    const dates = [...new Set(top.map(r => r.date).filter(Boolean))];
    const date = dates.length === 1 ? dates[0] : '';
    return {
      state: 'ok',
      row: { round, date, nums: top[0].nums, bonus: top[0].bonus },
      sources: top.map(r => ({ url: r.url, press: r.press, published: r.published, checkedAt: r.checkedAt }))
    };
  }
  if (results.length >= need) return { state: 'mismatch', tried };

  /* ② 지연 안내 — 사유가 같은 언론사가 need 곳 이상 */
  if (delays.length >= need) {
    const byReason = new Map();
    for (const d of delays) {
      const k = d.reason.replace(/\s+/g, '');
      if (!byReason.has(k)) byReason.set(k, []);
      byReason.get(k).push(d);
    }
    let dtop = null;
    for (const [, g] of byReason) if (!dtop || g.length > dtop.length) dtop = g;
    if (dtop && dtop.length >= need) {
      const untils = [...new Set(dtop.map(d => d.until).filter(Boolean))];
      return {
        state: 'delay',
        notice: {
          round,
          reason: dtop[0].reason,
          until: untils.length === 1 ? untils[0] : '',   // 어긋나면 시각을 비웁니다
          source: dtop[0].url
        },
        sources: dtop.map(d => ({ url: d.url, press: d.press, published: d.published, checkedAt: d.checkedAt }))
      };
    }
  }
  return { state: results.length || delays.length ? 'mismatch' : 'none', tried };
}
