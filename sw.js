// ============================================================
// Service Worker - 塔防助手 PWA 缓存策略
// 策略：StaleWhileRevalidate（先用缓存秒开，后台静默更新）
// ============================================================

const CACHE_VERSION = 'tfjl-v1';
const CACHE_STATIC = CACHE_VERSION + '-static';
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

// 需要预缓存的核心资源（首次安装时缓存）
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/sw.js'
];

// 不缓存的路径（Gist API、计数器等需要实时数据）
const NEVER_CACHE = [
    'api.github.com',
    'gist.githubusercontent.com',
    'raw.githubusercontent.com',
    'avatars.githubusercontent.com'
];

// ============================================================
// 安装事件：预缓存核心资源
// ============================================================
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            return cache.addAll(PRECACHE_URLS).catch(() => {});
        })
    );
});

// ============================================================
// 激活事件：清理旧版本缓存，保留当前版本
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => {
                        return name.startsWith('tfjl-')
                            && name !== CACHE_STATIC
                            && name !== CACHE_RUNTIME;
                    })
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================================
// 请求拦截：根据资源类型选择缓存策略
// ============================================================
self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 不缓存 API 请求
    if (NEVER_CACHE.some(pattern => url.hostname.includes(pattern))) {
        return;
    }

    // HTML 页面 / 静态资源：StaleWhileRevalidate（先缓存后更新）
    if (request.mode === 'navigate'
        || request.destination === 'document'
        || ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }

    // 其他 GET 请求：NetworkFirst
    event.respondWith(networkFirst(request, CACHE_RUNTIME));
});

// ============================================================
// StaleWhileRevalidate：优先返回缓存（秒开），后台更新缓存
// ============================================================
function staleWhileRevalidate(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
            // 后台静默拉取最新资源，不阻塞页面渲染
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(() => {});

            // 有缓存则立即返回，没有才等网络
            return cachedResponse || fetchPromise;
        });
    });
}

// ============================================================
// NetworkFirst：优先网络，失败回退缓存
// ============================================================
function networkFirst(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        }).catch(() => {
            return cache.match(request);
        });
    });
}

// ============================================================
// 消息通信：允许页面主动清缓存
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'CLEAR_CACHE') {
        caches.keys().then((names) => {
            return Promise.all(names.map((n) => caches.delete(n)));
        }).then(() => {
            if (event.source) event.source.postMessage('CACHE_CLEARED');
        });
    }
});
