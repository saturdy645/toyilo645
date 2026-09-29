// api/sync-lotto.js
// 토요일645 - 동행복권 공식 당첨결과 확인 API
// 1단계: 공식 페이지 조회 + 검증만 수행
// DB에는 아직 저장하지 않는다.

function validNumbers(nums, bonus) {
  if (!Array.isArray(nums) || nums.length !== 6) return false;

  if (
    nums.some(
      (n) => !Number.isInteger(n) || n < 1 || n > 45
    )
  ) {
    return false;
  }

  if (new Set(nums).size !== 6) return false;

  if (
    !Number.isInteger(bonus) ||
    bonus < 1 ||
    bonus > 45
  ) {
    return false;
  }

  if (nums.includes(bonus)) return false;

  return true;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const round = Number(req.query.round);

  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({
      error: "Invalid round"
    });
  }

  try {
    const url =
      `https://www.dhlottery.co.kr/gameResult.do` +
      `?method=byWin&drwNo=${round}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Toyilo645/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Official source unavailable",
        status: response.status
      });
    }

    const html = await response.text();

    // 공식 페이지의 당첨번호 영역에서 숫자를 찾는다.
    const winMatch = html.match(
      /lotto645_prizerank[^]*?win[^]*?<strong>(\d+)<\/strong>[^]*?<strong>(\d+)<\/strong>[^]*?<strong>(\d+)<\/strong>[^]*?<strong>(\d+)<\/strong>[^]*?<strong>(\d+)<\/strong>[^]*?<strong>(\d+)<\/strong>[^]*?bonus[^]*?<strong>(\d+)<\/strong>/i
    );

    if (!winMatch) {
      return res.status(502).json({
        error: "Could not parse official result"
      });
    }

    const nums = winMatch
      .slice(1, 7)
      .map(Number)
      .sort((a, b) => a - b);

    const bonus = Number(winMatch[7]);

    if (!validNumbers(nums, bonus)) {
      return res.status(502).json({
        error: "Official result validation failed"
      });
    }

    return res.status(200).json({
      ok: true,
      source: "Donghaeng Lottery",
      round,
      nums,
      bonus,
      saved: false
    });

  } catch (error) {
    return res.status(502).json({
      error: "Official source request failed"
    });
  }
}
