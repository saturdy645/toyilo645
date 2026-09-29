// api/sync-lotto.js
// 토요일645 - 동행복권 응답 진단용
// DB 저장/수정 없음

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
        Accept: "text/html,application/xhtml+xml"
      },
      redirect: "follow"
    });

    const html = await response.text();

    const titleMatch = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, " ").trim()
      : null;

    const textPreview = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    return res.status(200).json({
      diagnostic: true,
      requestedRound: round,
      httpStatus: response.status,
      finalUrl: response.url,
      title,
      htmlLength: html.length,
      containsRound: html.includes(String(round)),
      preview: textPreview
    });

  } catch (error) {
    return res.status(502).json({
      diagnostic: true,
      error: "Official source request failed"
    });
  }
}
