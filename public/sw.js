// 트레킹 108 서비스 워커 — 신호가 약한 산에서도 화면·코스 정보가 열리도록 저장해 둠
// 로그인·결제(/api/)와 다른 사이트(지도·로그인·결제창)는 저장하지 않고 항상 네트워크로 보냄
const CACHE = "t108-20261026133222";
const CORE = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/cert.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    // 화면: 새 버전 먼저, 안 되면 저장본 (결제·로그인 후 돌아오는 주소 쿼리는 무시하고 같은 화면)
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("/", cp)); return r; })
      .catch(() => caches.match("/")));
    return;
  }
  // 그림·번역 파일: 저장본 먼저 보여주고 뒤에서 새로 받아 둠
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
