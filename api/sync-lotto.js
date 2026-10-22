// api/sync-lotto.js
// 토요일645 - 당첨번호 자동 수집 (공식 + 뉴스·대체 출처 교차 확인)
//
// 예전에는 동행복권 접속 문제로 503 을 돌려주며 꺼 두었습니다.
// 이제는 확인된 값만 Supabase lotto_draws 에 넣습니다.
//
// ■ 지키는 것
//   · 확인되지 않은 값은 저장하지 않습니다. 추측값을 만들지 않습니다.
//   · 이미 있는 회차는 덮어쓰지 않습니다.
//     번호가 다르면 conflict 로 알리고 그대로 둡니다(사람이 판단).
//   · 비밀키는 파일에 없습니다. 환경변수만 씁니다.
//
// ■ 부르는 법
//   GET  /api/sync-lotto            → 빠진 최신 회차 3개까지
//   GET  /api/sync-lotto?n=5        → 개수 조절 (1~10)
//   GET  /api/sync-lotto?round=1246 → 그 회차만 (이미 있어도 다시 맞대어 봅니다)
//   GET  /api/sync-lotto?recheck=1  → 이미 저장된 회차도 다시 맞대어 봅니다
//
// ■ 맞대어 보기(recheck)
//   평소에는 이미 저장된 회차를 건너뜁니다 — 쓸데없이 바깥을 부르지 않으려고요.
//   그런데 그렇게만 하면 저장된 값이 공식값과 다른 경우를 영영 알 수 없습니다.
//   그래서 회차를 집어 부르거나 recheck=1 을 주면, 저장돼 있어도 다시 확인해
//   같으면 same, 다르면 conflict 로 알립니다. 어느 쪽이든 쓰지는 않습니다.
//
// ■ 잠금 (환경변수를 정해 둔 경우에만 요구합니다)
//   CRON_SECRET         → Authorization: Bearer <값>  (Vercel Cron 이 보냅니다)
//   UPDATE_LOTTO_SECRET → x-update-secret: <값>       (기존 관리자 키와 같은 것)
//   둘 다 정해 두지 않았으면 잠그지 않습니다.

import { BUILD, haveRounds, saveDraw } from '../lib/store.js';
import { latestRound, drawStarted, collectRound, notes } from '../lib/collect.js';
import { newDeadline } from '../lib/deadline.js';

/* 요청 하나의 공통 마감. 공식·뉴스 검색·기사 본문·대체 출처·DB 읽기가
   모두 이 신호를 받습니다. 마감이 지나면 진행 중이던 요청도 끊깁니다.
   RESERVE 는 응답을 만들어 보내는 데 남겨 두는 시간입니다. */
const REQUEST_MS = 22000;
const RESERVE_MS = 2000;

function allowed(req) {
  const cron = (process.env.CRON_SECRET || '').trim();
  const admin = (process.env.UPDATE_LOTTO_SECRET || '').trim();
  if (!cron && !admin) return true;                 // 잠금이 설정돼 있지 않습니다

  const auth = String(req.headers['authorization'] || '');
  if (cron && auth === 'Bearer ' + cron) return true;

  const supplied = req.headers['x-update-secret'];
  if (admin && supplied === admin) return true;

  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowed(req)) {
    return res.status(401).json({ error: 'Unauthorized', build: BUILD });
  }

  const q = req.query || {};
  const one = Number(q.round || 0);
  const n = Math.min(10, Math.max(1, Number(q.n) || 3));
  const latest = latestRound();
  const dl = newDeadline(REQUEST_MS);

  try {
    const to = one > 0 ? one : latest;
    const from = one > 0 ? one : Math.max(1, latest - (n - 1));

    let have;
    try { have = await haveRounds(from, to, dl); }
    catch (e) {
      return res.status(500).json({
        error: 'Lottery database is not reachable',
        why: String(e && e.message).slice(0, 140), build: BUILD
      });
    }

    const results = [];
    let partial = false;

    /* 회차를 집어 불렀거나 recheck=1 이면, 저장돼 있어도 다시 맞대어 봅니다 */
    const recheck = one > 0 || String(q.recheck || '') === '1';

    for (let r = to; r >= from; r--) {
      if (have.has(r) && !recheck) { results.push({ round: r, state: 'have' }); continue; }
      if (!drawStarted(r)) { results.push({ round: r, state: 'before-draw' }); continue; }
      /* 남은 시간이 모자라면 새 회차를 시작하지 않습니다 */
      if (dl.left() <= RESERVE_MS + 1500) { partial = true; break; }

      let got = null;
      try { got = await collectRound(r, dl); } catch (e) { got = null; }
      if (!got) {
        const why = dl.expired() ? 'deadline' : 'not-confirmed';
        if (why === 'deadline') partial = true;
        results.push({ round: r, state: why });
        if (dl.expired()) break;
        continue;
      }

      const saved = await saveDraw(got.row, dl);
      if (saved.state === 'skipped') partial = true;
      results.push({
        round: r, state: saved.state, via: got.via,
        srcNames: (got.sources || []).map(s => s && s.provider).filter(Boolean).slice(0, 3),
        ...(saved.state === 'conflict'
          ? { stored: saved.stored, incoming: saved.incoming,
               안내: '이미 저장된 값과 다릅니다. 덮어쓰지 않았습니다. 확인 후 직접 처리하세요.' }
          : {}),
        ...(saved.why ? { why: saved.why } : {})
      });
    }

    const inserted = results.filter(x => x.state === 'inserted').map(x => x.round);
    const conflicts = results.filter(x => x.state === 'conflict').map(x => x.round);

    return res.status(200).json({
      build: BUILD, latest, from, to,
      inserted, conflicts, partial,
      results,
      notes: notes().slice(-20)
    });

  } catch (error) {
    console.error('sync-lotto error:', error);
    return res.status(500).json({
      error: 'Sync failed',
      why: String(error && error.message).slice(0, 140),
      build: BUILD
    });
  } finally {
    dl.done();
  }
}
