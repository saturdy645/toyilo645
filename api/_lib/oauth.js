// 카카오·네이버 공통: state 쿠키(CSRF 방지), 사용자 생성, Firebase 커스텀 토큰 발급 후 앱으로 돌려보내기
const crypto = require("crypto");
const { adminAuth } = require("./firebaseAdmin");

const site = () => (process.env.SITE_URL || "").replace(/\/$/, "");

function newState(res) {
  const st = crypto.randomBytes(16).toString("hex");
  res.setHeader("Set-Cookie", `gb_state=${st}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return st;
}
function checkState(req, state) {
  const m = /(?:^|;\s*)gb_state=([a-f0-9]+)/.exec(req.headers.cookie || "");
  return !!(m && state && m[1] === state);
}
function clearState(res) {
  res.setHeader("Set-Cookie", "gb_state=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}
function redirect(res, url) { res.writeHead(302, { Location: url, "Cache-Control": "no-store" }); res.end(); }
function fail(res, why) { console.error("login failed:", why); clearState(res); redirect(res, `${site()}/#loginerror`); }

async function finish(res, uid, displayName, provider) {
  try { await adminAuth.updateUser(uid, displayName ? { displayName } : {}); }
  catch (e) {
    if (e.code === "auth/user-not-found") await adminAuth.createUser(displayName ? { uid, displayName } : { uid });
    else throw e;
  }
  const token = await adminAuth.createCustomToken(uid, { provider });
  clearState(res);
  redirect(res, `${site()}/#ct=${encodeURIComponent(token)}`);
}

module.exports = { site, newState, checkState, redirect, fail, finish };
