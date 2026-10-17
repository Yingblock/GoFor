/* GoFor service worker —— 离线优先的最薄实现。
 *
 * 策略：
 * - 导航请求：网络优先，失败回退到缓存的 index.html（SPA 永远能打开）
 * - 其他同源 GET：缓存优先，命中即用；未命中请求网络并写入缓存
 * - 跨域请求一律不碰（AI/OCR 的 key 与数据不该被我们缓存）
 *
 * 没有用 Workbox：本项目资源集合很小，手写 40 行更可控，
 * 也避免额外的构建期依赖。
 */

const CACHE = 'gofor-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function cachePut(request, response) {
  if (!response) return;
  if (response.status !== 200 || response.type === 'opaque') return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response);
          return response;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          cachePut(request, response);
          return response;
        }),
    ),
  );
});
