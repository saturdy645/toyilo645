// NEW 코스 자동 갱신 — 매년 1월 1일 00:05(한국 시간) Vercel Cron이 호출합니다 (vercel.json "crons").
// 하는 일: 한국관광공사 두루누비(공공데이터포털) 코스 목록에서 "지난해에 새로 등록된 코스"를 찾아
//          Firestore meta/newcourses 에 저장합니다. 앱의 NEW 탭이 이 문서를 읽습니다.
// 필요한 환경변수 (Vercel에만): CRON_SECRET, DURUNUBI_KEY(공공데이터포털 일반 인증키, Decoding 값), Firebase 서버 키
// 수동 실행: Vercel > 프로젝트 > Settings > Cron Jobs > Run, 또는 Authorization: Bearer <CRON_SECRET> 로 GET 호출
// 주의: 두루누비 응답 필드 이름은 공공데이터포털 명세서로 아직 확인하지 못했습니다(작업 환경에서 접속 불가).
//       아래 FIELD 표를 명세서와 맞춰 확인하세요. 필드가 없으면 그 코스는 건너뛰고 log 에 남깁니다.
const { adminDb } = require("../_lib/firebaseAdmin");
const SEED = require("../_lib/newcourses_seed.json");
const COURSES = require("../_lib/courses.json"); // 108코스 + 시리즈 이름 (중복 제외용)

const API = "https://apis.data.go.kr/B551011/Durunubi/courseList";
const FIELD = { id: "crsIdx", name: "crsKorNm", km: "crsDstnc", hours: "crsTotlRqrmHour", region: "sigun", summary: "crsSummary", created: "createdtime" };
const norm = (s) => String(s || "").replace(/[\s·\-—()（）\[\]]/g, "").toLowerCase();

async function fetchAll(key, log) {
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const u = new URL(API);
    u.searchParams.set("serviceKey", key);
    u.searchParams.set("numOfRows", "100");
    u.searchParams.set("pageNo", String(page));
    u.searchParams.set("MobileOS", "ETC");
    u.searchParams.set("MobileApp", "TREKKING108");
    u.searchParams.set("_type", "json");
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (!r.ok) { log.push(`page ${page}: HTTP ${r.status}`); break; }
    let j; try { j = await r.json(); } catch (e) { log.push(`page ${page}: JSON 아님 (인증키·형식 확인 필요)`); break; }
    const body = j && j.response && j.response.body;
    let items = body && body.items && body.items.item;
    if (!items) break;
    if (!Array.isArray(items)) items = [items];
    out.push(...items);
    const total = Number(body.totalCount || 0);
    if (!total || out.length >= total) break;
  }
  return out;
}

// createdtime 예: "20250312101500" 또는 "2025-03-12 10:15:00" → 연도
const yearOf = (v) => { const m = String(v || "").match(/^(\d{4})/); return m ? Number(m[1]) : null; };

module.exports = async (req, res) => {
  const auth = req.headers.authorization || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" });
  const log = [];
  const now = new Date(Date.now() + 9 * 3600 * 1000); // 한국 시간
  const target = Number((req.query && req.query.year) || now.getUTCFullYear() - 1); // 기본: 지난해에 등록된 코스
  const known = new Set(Object.values(COURSES).map(norm));
  const ref = adminDb.doc("meta/newcourses");
  const prev = (await ref.get()).data() || {};
  const keep = (prev.items || []).filter((x) => x && x.auto); // 예전에 자동 수집한 코스는 유지
  let added = 0;

  if (!process.env.DURUNUBI_KEY) log.push("DURUNUBI_KEY 없음 — 자동 수집 건너뜀 (직접 등록한 코스만 반영)");
  else {
    try {
      const rows = await fetchAll(process.env.DURUNUBI_KEY, log);
      log.push(`두루누비 코스 ${rows.length}건 수신`);
      for (const r of rows) {
        const name = r[FIELD.name];
        const y = yearOf(r[FIELD.created]);
        if (!name || !y) { log.push(`필드 없음 건너뜀: ${JSON.stringify(Object.keys(r)).slice(0, 120)}`); continue; }
        if (y !== target) continue;
        if (known.has(norm(name))) continue; // 108코스와 이름이 정확히 같은 코스는 제외
        const id = "drn-" + (r[FIELD.id] || norm(name));
        if (keep.some((k) => k.id === id)) continue;
        const km = parseFloat(r[FIELD.km]);
        keep.push({
          id, name: String(name), region: r[FIELD.region] ? String(r[FIELD.region]) : "",
          km: Number.isFinite(km) ? km : null,
          // 숫자만 오면 단위(분/시간)를 명세서로 확인하기 전까지 화면에 쓰지 않고 원값만 보관
          hours: r[FIELD.hours] && !/^\d+(\.\d+)?$/.test(String(r[FIELD.hours]).trim()) ? String(r[FIELD.hours]) : "", hoursRaw: r[FIELD.hours] ? String(r[FIELD.hours]) : "",
          note: r[FIELD.summary] ? String(r[FIELD.summary]).replace(/<[^>]+>/g, "").slice(0, 160) : "",
          year: y, auto: true, source: "두루누비 (한국관광공사)", sourceUrl: "https://www.durunubi.kr",
        });
        added++;
      }
    } catch (e) { log.push("수집 오류: " + e.message); }
  }

  const items = [...SEED.map((x) => ({ ...x, auto: false })), ...keep.filter((x) => !SEED.some((s) => s.id === x.id))];
  const stamp = now.toISOString().slice(0, 10);
  await ref.set({ items, updated: stamp, year: target, added, log: log.slice(-40) });
  return res.status(200).json({ ok: true, year: target, added, total: items.length, log: log.slice(-10) });
};
