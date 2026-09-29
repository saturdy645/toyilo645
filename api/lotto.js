// api/lotto.js
// 토요일645 - 검증된 당첨번호 조회 API
// Supabase lotto_draws를 기준 저장소로 사용

function validDraw(draw) {
  if (!draw || !Number.isInteger(Number(draw.round))) return false;

  const nums = Array.isArray(draw.nums)
    ? draw.nums.map(Number)
    : [];

  if (nums.length !== 6) return false;
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(nums).size !== 6) return false;

  const bonus = Number(draw.bonus);
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return false;
  if (nums.includes(bonus)) return false;

  return /^\d{4}-\d{2}-\d{2}$/.test(String(draw.draw_date || draw.date || ''));
}

function normalize(row) {
  return {
    round: Number(row.round),
    date: String(row.draw_date || row.date).slice(0, 10),
    nums: row.nums.map(Number).sort((a, b) => a - b),
    bonus: Number(row.bonus)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: 'Lottery database is not configured',
      latest: null,
      draws: []
    });
  }

  try {
    const round = Number(req.query.round || 0);
    const since = Number(req.query.since || 0);

    let query =
      `${supabaseUrl}/rest/v1/lotto_draws` +
      `?select=round,draw_date,nums,bonus`;

    if (round > 0) {
      query += `&round=eq.${round}&limit=1`;
    } else if (since > 0) {
      query += `&round=gt.${since}&order=round.asc&limit=3`;
    } else {
      query += `&order=round.desc&limit=60`;
    }

    const response = await fetch(query, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    const rows = await response.json();

    const draws = (Array.isArray(rows) ? rows : [])
      .filter(validDraw)
      .map(normalize);

    if (!round && !since) {
      draws.sort((a, b) => a.round - b.round);
    }

    const latest = draws.length
      ? Math.max(...draws.map(d => d.round))
      : (since > 0 ? since : null);

    return res.status(200).json({
      latest,
      draws
    });

  } catch (error) {
    console.error('lotto api error:', error);

    return res.status(500).json({
      error: 'Lottery data could not be loaded',
      latest: null,
      draws: []
    });
  }
}
