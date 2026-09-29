// api/sync-lotto.js
// 토요일645 - 동행복권 공식 당첨결과 확인 API
// 안전 테스트 단계: 조회 + 검증만 수행
// DB 저장 없음

function validNumbers(nums, bonus) {
  if (!Array.isArray(nums) || nums.length !== 6) return false;

  if (
    nums.some(
      n => !Number.isInteger(n) || n < 1 || n > 45
    )
  ) return false;

  if (new Set(nums).size !== 6) return false;

  if (
    !Number.isInteger(bonus) ||
    bonus < 1 ||
    bonus > 45 ||
    nums.includes(bonus)
  ) return false;

  return true;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
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
      `?method=allWinPrint` +
      `&gubun=byWin` +
      `&drwNoStart=${round}` +
      `&drwNoEnd=${round}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Toyilo645/1.0)",
        Accept:
          "text/html,application/xhtml+xml"
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
    const text = stripHtml(html);

    // 해당 회차가 실제 응답에 존재하는지 먼저 확인
    const roundIndex = text.indexOf(`${round}회`);

    if (roundIndex === -1) {
      return res.status(502).json({
        error: "Round not found in official result"
      });
    }

    // 해당 회차 주변 텍스트만 사용
    const section = text.slice(
      roundIndex,
      roundIndex + 1000
    );

    // 회차 이후 등장하는 1~45 숫자 후보 추출
    const candidates = (
      section.match(/\b(?:[1-9]|[1-3][0-9]|4[0-5])\b/g) || []
    ).map(Number);

    // 첫 숫자가 회차의 일부일 가능성을 피하고
    // 서로 다른 7개 숫자를 순서대로 찾는다.
    const values = [];

    for (const n of candidates) {
      if (!values.includes(n)) {
        values.push(n);
      }

      if (values.length === 7) break;
    }

    if (values.length !== 7) {
      return res.status(502).json({
        error: "Could not parse official result"
      });
    }

    const nums = values
      .slice(0, 6)
      .sort((a, b) => a - b);

    const bonus = values[6];

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
