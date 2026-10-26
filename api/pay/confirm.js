// 결제 승인: 토스 결제창에서 돌아온 값(paymentKey, orderId, amount)을 주문 기록과 맞춰 본 뒤 승인 요청
// 승인되면 donations/{uid} 에 기록 → 그 코스 메달에 색이 입혀짐. 메달 색은 이 서버만 기록할 수 있음.
// 필요한 환경변수: TOSS_SECRET_KEY (서버 전용), Firebase 서비스 계정
const { adminAuth, adminDb, admin } = require("../_lib/firebaseAdmin");
const { requireUser, readBody, tossConfirm } = require("../_lib/pay");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ code: "METHOD" });
  const user = await requireUser(req, adminAuth);
  if (!user) return res.status(401).json({ code: "LOGIN_REQUIRED" });

  const b = readBody(req);
  const paymentKey = String(b.paymentKey || ""), orderId = String(b.orderId || ""), amount = Number(b.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) return res.status(400).json({ code: "BAD_REQUEST" });

  const ref = adminDb.collection("orders").doc(orderId);
  // 1) 주문 확인 + 중복 승인 막기 (트랜잭션으로 READY → CONFIRMING)
  let order;
  try {
    order = await adminDb.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw { http: 404, code: "NO_ORDER" };
      const o = s.data();
      if (o.uid !== user.uid) throw { http: 403, code: "NOT_YOUR_ORDER" };
      if (o.amount !== amount) throw { http: 400, code: "AMOUNT_MISMATCH" };
      if (o.status === "DONE") return { ...o, already: true };
      if (o.status !== "READY") throw { http: 409, code: "ORDER_" + o.status };
      tx.update(ref, { status: "CONFIRMING", paymentKey });
      return o;
    });
  } catch (e) {
    if (e && e.http) return res.status(e.http).json({ code: e.code });
    throw e;
  }
  if (order.already) return res.status(200).json({ ok: true, kind: order.kind, courseId: order.courseId, amount: order.amount });

  // 2) 토스 승인
  let r;
  try { r = await tossConfirm({ paymentKey, orderId, amount }); }
  catch (e) {
    // 네트워크 오류: 주문을 READY로 되돌려 다시 시도할 수 있게 함 (Idempotency-Key로 이중 승인 방지)
    await ref.update({ status: "READY" });
    return res.status(503).json({ code: "TOSS_UNREACHABLE" });
  }
  if (!r.ok) {
    await ref.update({ status: "FAILED", failCode: r.body.code || String(r.status), failMessage: r.body.message || "" });
    return res.status(402).json({ code: r.body.code || "CONFIRM_FAILED", message: r.body.message || "" });
  }

  // 3) 기록
  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = adminDb.batch();
  batch.update(ref, { status: "DONE", approvedAt: r.body.approvedAt || null, method: r.body.method || null, doneAt: now });
  if (order.kind === "course") {
    batch.set(adminDb.collection("donations").doc(user.uid), {
      courses: { [order.courseId]: { amount, orderId, at: r.body.approvedAt || null } },
      updated: now,
    }, { merge: true });
  } else {
    batch.set(adminDb.collection("donations").doc(user.uid), {
      cheerTotal: admin.firestore.FieldValue.increment(amount), cheerCount: admin.firestore.FieldValue.increment(1), updated: now,
    }, { merge: true });
  }
  await batch.commit();
  return res.status(200).json({ ok: true, kind: order.kind, courseId: order.courseId, amount });
};
