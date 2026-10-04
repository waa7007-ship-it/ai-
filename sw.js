// ============================================================
// 서비스 워커: 인터넷이 꺼져 있어도 앱이 열리게 해 주는 파일
//
// ▶ 이렇게 작동해요
//   - 인터넷이 될 때: 항상 최신 파일을 받아 오고, 받은 파일을 저장해 둬요.
//   - 인터넷이 안 될 때: 저장해 둔 파일로 열어요.
//   그래서 단어 파일(words-*.js)이나 index.html을 고쳐도 따로 할 일이 없어요.
//
// ▶ 새 파일을 추가했을 때만
//   아래 APP_FILES 목록에 그 파일 이름을 넣고, CACHE_NAME 숫자를 하나 올려 주세요. (v3 → v4)
// ============================================================
const CACHE_NAME = "wordcards-v3";

// 앱을 처음 열 때 미리 저장해 둘 파일들 (단어 파일 3개도 모두 포함)
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./words-easy.js",
  "./words-medium.js",
  "./words-hard.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

// 인터넷이 느릴 때 몇 초까지 기다릴지 (넘으면 저장해 둔 파일 사용)
const NETWORK_TIMEOUT = 3000;

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

// 저장해 둔 파일 찾기 (여러 이름으로 찾아보기)
function fromCache(requests) {
  return requests.reduce(function (found, request) {
    return found.then(function (response) {
      return response || caches.match(request, { ignoreSearch: true });
    });
  }, Promise.resolve(undefined));
}

// 인터넷에서 먼저 받아 보고, 안 되거나 너무 느리면 저장해 둔 파일 쓰기
function networkFirst(request, cacheNames) {
  return new Promise(function (resolve) {
    let done = false;
    function finish(response) {
      if (!done && response) { done = true; resolve(response); }
    }

    // 너무 오래 걸리면 저장해 둔 파일로 먼저 보여 주기
    const timer = setTimeout(function () {
      fromCache(cacheNames).then(finish);
    }, NETWORK_TIMEOUT);

    // cache: "no-cache" → 브라우저에 남아 있는 옛 파일 말고, 서버에 바뀐 게 있는지 꼭 확인하기
    fetch(request, { cache: "no-cache" })
      .then(function (response) {
        clearTimeout(timer);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(cacheNames[0], copy); });
        }
        finish(response);
      })
      .catch(function () {
        clearTimeout(timer);
        fromCache(cacheNames).then(function (saved) {
          finish(saved || Response.error());
        });
      });
  });
}

// 3. 파일 요청이 올 때마다
self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isMyFile   = url.origin === self.location.origin;
  const isFontFile = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

  // 앱 화면(index.html): 인터넷 먼저 → 안 되면 저장된 화면
  if (isMyFile && request.mode === "navigate") {
    event.respondWith(networkFirst(request, [request, "./index.html", "./"]));
    return;
  }

  // 우리 파일(단어 파일, 아이콘 등): 인터넷 먼저 → 안 되면 저장된 파일
  if (isMyFile) {
    event.respondWith(networkFirst(request, [request]));
    return;
  }

  // 글꼴: 저장된 것 먼저 (글꼴은 잘 안 바뀌어서) → 없으면 인터넷에서 받아 저장
  if (isFontFile) {
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
  }
});
