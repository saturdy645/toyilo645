// api/lotto.js
// 토요일645 - 동행복권 공식 당첨번호 중계 API

const OFFICIAL_URL =
  'https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=';

function validDraw(draw) {
  if (!draw || !Number.isInteger(draw.round) || draw.round < 1) return false;
  if (!Array.isArray(draw.nums) || draw.nums.length !== 6) return false;

  const nums = draw.nums.map(Number);

  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(nums).size !== 6) return false;

  const bonus = Number(draw.bonus);

  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return false;
  if (nums.includes(bonus)) return false;

  return /^\d{4}-\d{2}-\d{2}$/.test(draw.date);
}

async function fetchDraw(round) {
  const response = await fetch(OFFICIAL_URL + encodeURIComponent(round), {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html'
    }
  });

  if (!response.ok) return null;

  const html = await response.text();

  // 해당 회차 결과가 실제로 발표된 페이지인지 먼저 확인
  const titleMatch = html.match(
    new RegExp(`${round}\\s*회\\s*당첨결과`)
  );

  if (!titleMatch) return null;

  // 추첨일
  const dateMatch = html.match(
    /\((\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*추첨\)/
  );

  if (!dateMatch) return null;

  const date =
    `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;

  /*
    공식 페이지의 당첨번호 영역에서 숫자를 읽는다.
    ball_645 클래스는 동행복권 로또 번호 표시에 사용된다.
  */
  const ballMatches = [
    ...html.matchAll(/ball_645[^>]*>\s*(\d{1,2})\s*</g)
  ].map(m => Number(m[1]));

  if (ballMatches.length < 7) return null;

  const nums = ballMatches.slice(0, 6).sort((a, b) => a - b);
  const bonus = ballMatches[6];

  const draw = {
    round: Number(round),
    date,
    nums,
    bonus
  };

  return validDraw(draw) ? draw : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const since = Math.max(0, Number.parseInt(req.query.since || '0', 10) || 0);
    const requestedRound =
      Number.parseInt(req.query.round || '0', 10) || 0;

    // 특정 회차 확인용
    if (requestedRound > 0) {
      const draw = await fetchDraw(requestedRound);

      return res.status(200).json({
        latest: draw ? draw.round : null,
        draws: draw ? [draw] : []
      });
    }

    /*
      앱은 ?since=현재 보유 최신회차 로 호출한다.
      미래 회차를 무한 조회하지 않도록 최대 3개만 확인한다.
    */
    const start = since > 0 ? since + 1 : 1;
    const draws = [];

    for (let round = start; round < start + 3; round++) {
      const draw = await fetchDraw(round);

      if (!draw) break;

      draws.push(draw);
    }

    return res.status(200).json({
      latest: draws.length
        ? draws[draws.length - 1].round
        : since || null,
      draws
    });

  } catch (error) {
    console.error('lotto api error:', error);

    return res.status(500).json({
      error: 'Official lottery data could not be loaded',
      draws: []
    });
  }
}
