// 네이버 로그인. 필요한 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, SITE_URL
const { site, newState, checkState, redirect, fail, finish } = require("../_lib/oauth");

module.exports = async (req, res) => {
  const callback = `${site()}/api/auth/naver`;
  const { code, state, error } = req.query || {};
  try {
    if (!code && !error) {
      const u = new URL("https://nid.naver.com/oauth2.0/authorize");
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", process.env.NAVER_CLIENT_ID);
      u.searchParams.set("redirect_uri", callback);
      u.searchParams.set("state", newState(res));
      return redirect(res, u.toString());
    }
    if (error) return fail(res, "naver: " + error);
    if (!checkState(req, state)) return fail(res, "naver: state mismatch");

    const u = new URL("https://nid.naver.com/oauth2.0/token");
    u.searchParams.set("grant_type", "authorization_code");
    u.searchParams.set("client_id", process.env.NAVER_CLIENT_ID);
    u.searchParams.set("client_secret", process.env.NAVER_CLIENT_SECRET);
    u.searchParams.set("code", code);
    u.searchParams.set("state", state);
    const tok = await fetch(u).then(r => r.json());
    if (!tok.access_token) return fail(res, "naver: no access token");

    const me = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then(r => r.json());
    const id = me.response && me.response.id;
    if (!id) return fail(res, "naver: no user id");

    return finish(res, `naver:${id}`, me.response.nickname || me.response.name || "", "naver");
  } catch (e) { return fail(res, "naver: " + e.message); }
};
