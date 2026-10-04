// ============================================================
// 서비스 워커: 인터넷이 꺼져 있어도 앱이 열리게 해 주는 파일
// 파일을 고친 뒤에는 아래 CACHE_NAME의 숫자를 하나 올려 주세요. (v1 → v2)
// 그래야 휴대폰에 설치된 앱도 새 버전으로 바뀌어요.
// ============================================================
const CACHE_NAME = "wordcards-v1";

// 앱을 처음 열 때 미리 저장해 둘 파일들
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

// 1. 설치: 앱 파일을 미리 저장해 두기
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_FILES);
    })
  );
  self.skipWaiting();   // 새 버전을 바로 사용하기
});

// 2. 활성화: 예전 버전의 저장 파일 지우기
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names
        .filter(function (name) { return name !== CACHE_NAME; })
        .map(function (name) { return caches.delete(name); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 3. 파일 요청이 올 때마다
self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isMyFile   = url.origin === self.location.origin;
  const isFontFile = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!isMyFile && !isFontFile) return;

  // 페이지(index.html)는 인터넷에서 먼저 받아 보고, 안 되면 저장해 둔 것 사용
  // → 인터넷이 되면 항상 최신 버전, 안 되면 저장된 버전으로 열려요.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put("./index.html", copy); });
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        })
    );
    return;
  }

  // 나머지(아이콘, 글꼴 등)는 저장해 둔 것을 먼저 쓰고, 없으면 인터넷에서 받아서 저장
  event.respondWith(
    caches.match(request).then(function (saved) {
      if (saved) return saved;
      return fetch(request).then(function (response) {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
