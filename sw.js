/* 토요일645 — 서비스 워커
   ───────────────────────────────────────────────────────────────
   이것이 있어야 안드로이드가 '앱으로 설치' 를 띄우고, TWA 로 포장할 수 있습니다.
   아이폰에서도 홈 화면에 추가했을 때 인터넷이 끊겨도 화면이 열립니다.

   ■ 지키는 규칙 — 무엇을 담아 두고 무엇을 담지 않는가
     · 화면(index.html)  : 인터넷 먼저. 앱을 자주 고치므로 늘 새것을 봐야 합니다.
                           인터넷이 안 되면 그때만 담아 둔 것을 꺼냅니다.
     · /api/ 로 가는 것  : 절대 담지 않습니다. 당첨번호가 옛날 것으로 보이면 안 됩니다.
     · 그림·매니페스트   : 담아 둔 것을 먼저 주고, 뒤에서 조용히 새것으로 바꿉니다.
     · 그 밖의 바깥 주소 : 건드리지 않습니다.

   ■ 새 버전이 나오면
     CACHE 이름을 바꾸면 예전에 담아 둔 것이 전부 지워집니다.
     앱을 새로 올릴 때마다 아래 VERSION 만 고치면 됩니다.                      */

const VERSION = '10.70.0';
const CACHE   = 'toyoil645-' + VERSION;

/* 처음 설치할 때 미리 담아 둘 것 — 없으면 오프라인에서 화면이 안 뜹니다 */
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* 하나가 없어도 설치가 통째로 실패하지 않도록 하나씩 담습니다 */
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();                 // 새 버전을 기다리지 않고 바로 씁니다
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isDoc = req =>
  req.mode === 'navigate' ||
  (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // 바깥 주소는 그대로 둡니다
  if (url.pathname.startsWith('/api/')) return;      // 당첨번호 등은 담지 않습니다

  /* ── 화면 — 인터넷 먼저 ── */
  if (isDoc(req)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(CACHE);
          c.put('/index.html', res.clone());
        }
        return res;
      } catch (err) {
        const hit = await caches.match('/index.html');
        return hit || Response.error();
      }
    })());
    return;
  }

  /* ── 그림·매니페스트 — 담아 둔 것 먼저, 뒤에서 새것으로 ── */
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const live = fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return hit || (await live) || Response.error();
  })());
});
