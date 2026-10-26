// 완주 인증서 신청 메일: 메달 현황표(CSV)를 서버가 직접 만들어 첨부해서 보냄
// - 완주 기록: users/{uid}.done, 색 메달: donations/{uid}.courses (결제 승인으로만 기록됨)
// - 신청자 정보(이름·생년월일·주소·연락처)는 메일로만 보내고 서버에 저장하지 않음
// 필요한 환경변수: CERT_MAIL_USER, CERT_MAIL_PASS (Gmail 앱 비밀번호), CERT_MAIL_TO(선택, 기본 toyoil645@gmail.com)
const nodemailer = require("nodemailer");
const { adminAuth, adminDb, admin } = require("../_lib/firebaseAdmin");
const { requireUser, readBody, COURSES } = require("../_lib/pay");
const TOP = require("../_lib/top108.json");

const clean = (v, n) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
const cell = (v) => { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

function buildCsv(info, uid, done, colored, now) {
  const a = TOP.filter((id) => done[id]).length, b = TOP.filter((id) => done[id] && colored[id]).length;
  const rows = [
    ["트레킹 108 완주 인증서 신청"], ["작성 시각", now], ["이름", info.name], ["생년월일", info.birth], ["주소", info.addr], ["연락처", info.phone],
    ["개인정보 수집·이용 동의", "동의 (" + now + ")"], ["계정 확인 코드", uid], ["기준", "서버 기록 (완주: 사용자 기록 / 색 메달: 결제 승인 기록)"],
    ["완주", a + "/108"], ["색 메달", b + "/108"], [], ["번호", "코스", "완주일", "메달"],
  ];
  TOP.forEach((id, i) => rows.push([i + 1, COURSES[id] || id, done[id] || "", done[id] ? (colored[id] ? "색 메달" : "진한 색") : "미완주"]));
  return { csv: "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"), a, b };
}

async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ code: "METHOD" });
  const auth = deps.adminAuth || adminAuth, db = deps.adminDb || adminDb;
  const user = await requireUser(req, auth);
  if (!user) return res.status(401).json({ code: "LOGIN_REQUIRED" });
  const b = readBody(req);
  const info = { name: clean(b.name, 40), birth: clean(b.birth, 10), addr: clean(b.addr, 200), phone: clean(b.phone, 30) };
  if (!info.name || !/^\d{4}-\d{2}-\d{2}$/.test(info.birth) || !info.addr) return res.status(400).json({ code: "BAD_INFO" });
  if (b.agree !== true) return res.status(400).json({ code: "NO_CONSENT" });
  if (!process.env.CERT_MAIL_USER || !process.env.CERT_MAIL_PASS) return res.status(503).json({ code: "MAIL_NOT_SET" });

  // 같은 계정은 10분에 한 번만
  const lim = db.collection("certSend").doc(user.uid);
  const last = await lim.get();
  const nowMs = Date.now();
  if (last.exists && nowMs - (last.data().at || 0) < 10 * 60 * 1000) return res.status(429).json({ code: "TOO_SOON" });

  const [u, d] = await Promise.all([db.collection("users").doc(user.uid).get(), db.collection("donations").doc(user.uid).get()]);
  const done = (u.exists && u.data().done) || {};
  const colored = (d.exists && d.data().courses) || {};
  const now = new Date(nowMs).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const { csv, a, b: cb } = buildCsv(info, user.uid, done, colored, now);
  const fileName = `트레킹108_메달현황_${info.name.replace(/[\\/:*?"<>|\s]+/g, "")}_${now.slice(0, 13).replace(/[^\d]/g, "")}.csv`;

  const transport = (deps.createTransport || nodemailer.createTransport)({ service: "gmail", auth: { user: process.env.CERT_MAIL_USER, pass: process.env.CERT_MAIL_PASS } });
  await transport.sendMail({
    from: `TREKKING 108 <${process.env.CERT_MAIL_USER}>`,
    to: process.env.CERT_MAIL_TO || "toyoil645@gmail.com",
    subject: `[트레킹 108] 완주 인증서 신청 - ${info.name} (완주 ${a}/108 · 색 메달 ${cb}/108)`,
    text: ["트레킹 108 완주 인증서 신청", "", "이름: " + info.name, "생년월일: " + info.birth, "주소: " + info.addr, "연락처: " + (info.phone || "-"),
      "개인정보 수집·이용 동의: 동의", "계정 확인 코드: " + user.uid, "", `완주 ${a}/108 · 색 메달 ${cb}/108 (서버 기록 기준)`, "", "메달 현황표를 첨부합니다."].join("\n"),
    attachments: [{ filename: fileName, content: Buffer.from(csv, "utf8"), contentType: "text/csv; charset=utf-8" }],
  });
  await lim.set({ at: nowMs });
  return res.status(200).json({ ok: true, done: a, colored: cb });
}
module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
module.exports.buildCsv = buildCsv;
