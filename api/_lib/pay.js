// 결제 공통: 로그인 확인, 금액 규칙, 토스페이먼츠 승인 호출
const crypto = require("crypto");
const COURSES = require("./courses.json"); // { courseId: "코스 이름" } — 빌드할 때 자동 생성

// 금액 규칙 (서버가 최종 판단 — 화면에서 바꿔 보내도 통과하지 않음)
const RULES = {
  course: (a) => Number.isInteger(a) && a >= 1000 && a <= 10000 && a % 1000 === 0, // 완주 성공기념 기부
  cheer: (a) => Number.isInteger(a) && a >= 1000 && a <= 1000000,                  // 개발자 응원
};

async function requireUser(req, adminAuth) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  if (!m) return null;
  try { return await adminAuth.verifyIdToken(m[1]); } catch (e) { return null; }
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}

// 토스 orderId: 영문·숫자·-·_ 6~64자
function newOrderId() { return "t108-" + Date.now().toString(36) + "-" + crypto.randomBytes(9).toString("hex"); }

async function tossConfirm({ paymentKey, orderId, amount }, fetchImpl = fetch) {
  const key = process.env.TOSS_SECRET_KEY || "";
  if (!key) return { ok: false, status: 500, body: { code: "NO_SECRET_KEY", message: "TOSS_SECRET_KEY 환경변수가 없습니다." } };
  const r = await fetchImpl("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(key + ":").toString("base64"),
      "Content-Type": "application/json",
      "Idempotency-Key": orderId,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  let body = {}; try { body = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body };
}

module.exports = { COURSES, RULES, requireUser, readBody, newOrderId, tossConfirm };
