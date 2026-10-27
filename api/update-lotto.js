// api/update-lotto.js
// 토요일645 - 검증된 당첨번호 관리자 저장 API
// 외부에 공개하지 않는 관리자용 API

function validDraw(draw) {
  const round = Number(draw?.round);
  const bonus = Number(draw?.bonus);
  const nums = Array.isArray(draw?.nums)
    ? draw.nums.map(Number)
    : [];

  if (!Number.isInteger(round) || round < 1) return false;

  if (nums.length !== 6) return false;
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) {
    return false;
  }
  if (new Set(nums).size !== 6) return false;

  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) {
    return false;
  }
  if (nums.includes(bonus)) return false;

  const date = String(draw?.draw_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.UPDATE_LOTTO_SECRET;
  const suppliedSecret = req.headers["x-update-secret"];

  if (!secret || suppliedSecret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: "Database is not configured"
    });
  }

  const draw = req.body;

  if (!validDraw(draw)) {
    return res.status(400).json({
      error: "Invalid draw data"
    });
  }

  const row = {
    round: Number(draw.round),
    draw_date: String(draw.draw_date),
    nums: draw.nums.map(Number).sort((a, b) => a - b),
    bonus: Number(draw.bonus)
  };

  try {
    // 같은 회차가 이미 있으면 먼저 확인한다.
    const checkUrl =
      `${supabaseUrl}/rest/v1/lotto_draws` +
      `?round=eq.${row.round}` +
      `&select=round,draw_date,nums,bonus`;

    const checkResponse = await fetch(checkUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });

    if (!checkResponse.ok) {
      return res.status(502).json({
        error: "Database check failed"
      });
    }

    const existing = await checkResponse.json();

    // 이미 저장된 회차는 자동 덮어쓰기하지 않는다.
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({
        error: "Round already exists",
        round: row.round
      });
    }

    const insertUrl = `${supabaseUrl}/rest/v1/lotto_draws`;

    const insertResponse = await fetch(insertUrl, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });

    if (!insertResponse.ok) {
      return res.status(502).json({
        error: "Database insert failed"
      });
    }

    const saved = await insertResponse.json();

    return res.status(200).json({
      ok: true,
      saved: saved[0] || row
    });
  } catch (error) {
    return res.status(500).json({
      error: "Update failed"
    });
  }
}
