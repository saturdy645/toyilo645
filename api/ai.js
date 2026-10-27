import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not configured'
    });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: 'AI usage limit is not configured'
    });
  }

  try {
    const { messages = [], system = '', userId = '' } = req.body || {};

    // 로그인 사용자는 userId, 게스트는 IP + 브라우저 정보로 구분
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(forwardedFor || req.socket?.remoteAddress || '')
          .split(',')[0]
          .trim();

    const userAgent = String(req.headers['user-agent'] || '');

    const rawClientKey = userId
      ? `user:${userId}`
      : `guest:${ip}:${userAgent}`;

    // 개인정보를 DB에 그대로 저장하지 않고 해시값만 저장
    const clientKey = crypto
      .createHash('sha256')
      .update(rawClientKey)
      .digest('hex');

    // Supabase에서 오늘 사용 횟수 1회 차감
    const quotaResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/consume_ai_daily_quota`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          p_client_key: clientKey,
          p_daily_limit: 10
        })
      }
    );

    const quotaData = await quotaResponse.json();

    if (!quotaResponse.ok) {
      console.error('Quota error:', quotaData);
      return res.status(500).json({
        error: 'AI usage limit check failed'
      });
    }

    const quota = Array.isArray(quotaData)
      ? quotaData[0]
      : quotaData;

    if (!quota?.allowed) {
      return res.status(429).json({
        error: '오늘의 AI 상담 10회를 모두 사용했습니다. 내일 다시 이용해주세요.',
        limit: 10,
        remaining: 0
      });
    }

    const input = [
      ...(system
        ? [{ role: 'developer', content: system }]
        : []),
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '')
      }))
    ];

    const response = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-5.6-luna',
          input,
          max_output_tokens: 700
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'OpenAI API error'
      });
    }

    const text = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text')
      .map(item => item.text)
      .join('\n')
      .trim();

    return res.status(200).json({
      text,
      remaining: quota.remaining
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message || 'AI server error'
    });
  }
}
