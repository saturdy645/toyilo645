// api/lotto.js
// 토요일645 - 검증된 당첨번호 조회 API
// Supabase lotto_draws를 기준 저장소로 사용
//
// 기존 동작(앱이 쓰는 계약)은 그대로입니다.
//   GET /api/lotto            → 최근 60회차
//   GET /api/lotto?since=1244 → 1245회부터
//   GET /api/lotto?round=1246 → 그 회차만
//   응답 { latest, draws:[{round,date,nums,bonus}] }
//
// 여기에 두 가지가 더해졌습니다.
//
//  ① DB 에 아직 없는 '추첨이 끝난 최신 회차' 가 있으면, 그 자리에서
//     공식·뉴스·대체 출처로 확인해 보고, 확인된 값만 DB 에 넣은 뒤 함께 돌려줍니다.
//     확인하지 못하면 아무것도 저장하지 않습니다 — 추측값을 만들지 않습니다.
//     이미 저장된 회차는 덮어쓰지 않습니다(lib/store.js 가 막습니다).
//     끄려면 ?collect=0
//
//  ② 요청 하나에 공통 마감 시각이 있습니다.
//     공식·뉴스 검색·기사 본문·대체 출처·DB 읽기까지 같은 신호를 받습니다.
//     마감이 지나면 진행 중이던 바깥 요청도 끊깁니다.
//     그때는 이미 읽어 둔 DB 결과를 그대로 돌려주고 partial:true 로 알립니다.
//
//  ★ DB 조회가 성공했으면, 추가 수집이 실패하거나 시간이 끝나도
//    그 결과는 반드시 돌아갑니다. 수집 실패가 전체를 500 으로 만들지 않습니다.

import { BUILD, readDraws, haveRounds, saveDraw } from '../lib/store.js';
import { latestRound, drawStarted, collectRound, notes, dhUrl } from '../lib/collect.js';
import { newDeadline } from '../lib/deadline.js';

/* 함수 제한 시간(vercel.json maxDuration 30초) 안에서 넉넉히 끝나도록 잡았습니다.
   RESERVE 는 응답을 만들어 보내는 데 남겨 두는 시간입니다. */
const REQUEST_MS = 12000;
const RESERVE_MS = 1500;
const COLLECT_MAX = 2;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const dl = newDeadline(REQUEST_MS);
  try {
    const round = Number(req.query.round || 0);
    const since = Number(req.query.since || 0);
    const wantCollect = String(req.query.collect || '') !== '0';
    /* ?debug=1 — 왜 못 가져왔는지 그대로 보여 줍니다.
       비밀키가 필요 없습니다. 번호를 지어내지 않고, 받은 것을 그대로 적습니다.
       (바깥 주소와 HTTP 상태, 받은 글의 앞부분 160자까지입니다) */
    const wantWhy = String(req.query.debug || '') === '1';

    /* ── ① 먼저 DB 를 읽습니다 ──
       여기서 실패하면 예전처럼 500 입니다(데이터베이스 문제).
       여기까지 성공했으면, 뒤에서 무슨 일이 있어도 이 결과는 돌아갑니다. */
    let draws = await readDraws({ round, since, ctx: dl });
    if (!round && !since) draws.sort((a, b) => a.round - b.round);

    /* ── ② 빠진 최신 회차를 그 자리에서 확인합니다 ──
       여기서 생기는 어떤 실패도 위 결과를 없애지 못합니다. */
    const collected = [];
    let partial = false;
    const latestByClock = latestRound();

    if (wantCollect && drawStarted(latestByClock) && dl.left() > RESERVE_MS + 1500) {
      try {
        const from = Math.max(1, round > 0 ? round
          : (since > 0 ? since + 1 : latestByClock - (COLLECT_MAX - 1)));
        const to = round > 0 ? round : latestByClock;

        let have = null;
        if (to >= from) {
          try { have = await haveRounds(from, to, dl); }
          catch (e) { have = null; partial = true; }
        }

        if (have) {
          let tried = 0;
          for (let r = to; r >= from && tried < COLLECT_MAX; r--) {
            if (have.has(r)) continue;
            if (!drawStarted(r)) continue;
            /* 남은 시간이 모자라면 새 회차를 시작하지 않습니다 */
            if (dl.left() <= RESERVE_MS + 1500) { partial = true; break; }
            tried++;

            let got = null;
            try { got = await collectRound(r, dl); }
            catch (e) { got = null; }

            if (!got) {
              const why = dl.expired() ? 'deadline' : 'not-confirmed';
              if (why === 'deadline') partial = true;
              collected.push({ round: r, state: why });
              if (dl.expired()) break;
              continue;
            }

            const saved = await saveDraw(got.row, dl);
            if (saved.state === 'skipped') partial = true;
            collected.push({
              round: r, state: saved.state, via: got.via,
              ...(saved.state === 'conflict'
                ? { stored: saved.stored, incoming: saved.incoming }
                : {}),
              ...(saved.why ? { why: saved.why } : {})
            });

            /* 저장됐거나 이미 같은 값이면 이번 응답에 함께 담아 보냅니다.
               넣지 못한(conflict·skipped) 값은 담지 않습니다 —
               DB 에 없는 값을 앱에 내려보내지 않습니다. */
            if (saved.state === 'inserted' || saved.state === 'same') {
              draws.push({
                round: got.row.round,
                date: String(got.row.date || '').slice(0, 10),
                nums: got.row.nums.slice().sort((a, b) => a - b),
                bonus: Number(got.row.bonus),
                via: got.via,
                srcNames: (got.sources || []).map(s => s && s.provider).filter(Boolean).slice(0, 3)
              });
            }
          }
        }
      } catch (e) {
        /* 수집 쪽에서 무슨 일이 나든 DB 결과는 그대로 돌려줍니다 */
        console.error('lotto collect error:', e && e.message);
        partial = true;
      }
    }

    /* 중복 제거 후 회차 순으로 */
    const seen = new Set();
    draws = draws
      .filter(d => { const k = d.round; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.round - b.round);

    const latest = draws.length
      ? Math.max(...draws.map(d => d.round))
      : (since > 0 ? since : null);

    /* 최신 회차를 아직 못 받았거나 중간에 끊겼으면 캐시를 두지 않습니다 —
       빈 응답이 CDN 에 얼어붙어 결과가 나와도 안 내려가는 일을 막습니다. */
    const complete = !partial &&
      (draws.some(d => d.round === latestByClock) || !drawStarted(latestByClock));
    res.setHeader('Cache-Control', complete
      ? 's-maxage=600, stale-while-revalidate=86400'
      : 'no-store, max-age=0');

    return res.status(200).json({
      latest,
      draws,
      build: BUILD,
      ...(partial ? { partial: true } : {}),
      ...(collected.length ? { collected } : {}),
      ...(wantWhy ? {
        region: process.env.VERCEL_REGION || '(모름)',
        officialUrl: dhUrl(latestByClock),
        newsConfigured: !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
        extraConfigured: !!(process.env.EXTRA_SOURCES || '').trim(),
        now: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' KST',
        notes: notes().slice(-12)
      } : {})
    });

  } catch (error) {
    /* 여기로 오는 것은 DB 조회 자체가 안 된 경우입니다 */
    console.error('lotto api error:', error);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(500).json({
      error: 'Lottery data could not be loaded',
      build: BUILD,
      latest: null,
      draws: []
    });
  } finally {
    dl.done();
  }
}

/* 운영자 점검용 — 무엇을 시도했고 왜 실패했는지 봅니다 (번호는 그대로 보입니다) */
export const diagnostics = () => ({ build: BUILD, latest: latestRound(), notes: notes() });
