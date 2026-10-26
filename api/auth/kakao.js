// 카카오 로그인 (서버 방식). 필요한 환경변수: KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET(설정한 경우), SITE_URL
const { site, newState, checkState, redirect, fail, finish } = require("../_lib/oauth");

module.exports = async (req, res) => {
  const callback = `${site()}/api/auth/kakao`;
  const { code, state, error } = req.query || {};
  try {
    if (!code && !error) {
      const u = new URL("https://kauth.kakao.com/oauth/authorize");
      u.searchParams.set("client_id", process.env.KAKAO_REST_API_KEY);
      u.searchParams.set("redirect_uri", callback);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("state", newState(res));
      return redirect(res, u.toString());
    }
    if (error) return fail(res, "kakao: " + error);
    if (!checkState(req, state)) return fail(res, "kakao: state mismatch");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_REST_API_KEY,
      redirect_uri: callback,
      code,
    });
    if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
    const tok = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    }).then(r => r.json());
    if (!tok.access_token) return fail(res, "kakao: no access token");

    const me = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then(r => r.json());
    if (!me.id) return fail(res, "kakao: no user id");

    const nick = me.kakao_account?.profile?.nickname || me.properties?.nickname || "";
    return finish(res, `kakao:${me.id}`, nick, "kakao");
  } catch (e) { return fail(res, "kakao: " + e.message); }
};
