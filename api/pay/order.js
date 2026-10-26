// 주문 만들기: 결제창을 열기 전에 금액·코스를 서버에 먼저 기록 (결제 후 금액 위변조 확인용)
// 필요한 환경변수: Firebase 서비스 계정
const { adminAuth, adminDb, admin } = require("../_lib/firebaseAdmin");
const { COURSES, RULES, requireUser, readBody, newOrderId } = require("../_lib/pay");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ code: "METHOD" });
  const user = await requireUser(req, adminAuth);
  if (!user) return res.status(401).json({ code: "LOGIN_REQUIRED" });

  const { kind, courseId } = readBody(req);
  const amount = Number(readBody(req).amount);
  if (!RULES[kind]) return res.status(400).json({ code: "BAD_KIND" });
  if (!RULES[kind](amount)) return res.status(400).json({ code: "BAD_AMOUNT" });
  if (kind === "course" && !Object.prototype.hasOwnProperty.call(COURSES, courseId)) return res.status(400).json({ code: "BAD_COURSE" });

  const orderId = newOrderId();
  const orderName = (kind === "course" ? `완주 성공기념 기부 · ${COURSES[courseId]}` : "트레킹 108 개발자 응원").slice(0, 100);
  await adminDb.collection("orders").doc(orderId).set({
    uid: user.uid, kind, courseId: kind === "course" ? courseId : null, amount, orderName,
    status: "READY", createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return res.status(200).json({ orderId, orderName, amount });
};
