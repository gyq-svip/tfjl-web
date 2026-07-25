// ============================================================
// Service Worker v5 - 塔防助手 PWA 缓存策略
// 策略：StaleWhileRevalidate（先用缓存秒开，后台静默更新）
// v27: 有皮肤的战斗槽名字去掉背景条/阴影，只留顶部纯文字
// ============================================================

const CACHE_VERSION = 'tfjl-v23';
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

// 不缓存的路径（Gist API、计数器等需要实时数据）
const NEVER_CACHE = [
    'api.github.com',
    'gist.githubusercontent.com',
    'raw.githubusercontent.com',
    'avatars.githubusercontent.com'
];

// ============================================================
// 安装事件：skipWaiting，不预缓存（由runtime按需填充）
// ============================================================
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// ============================================================
// 激活事件：清空所有 tfjl 缓存（包括新创建的），强制走网络
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('tfjl-'))
                    .map((name) => caches.delete(name))
            );
        }).then(() => {
            // 拿下所有页面控制权
            return self.clients.claim();
        }).then(() => {
            // 通知所有已打开的页面有新版本
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'NEW_VERSION_READY' });
                });
            });
        })
    );
});

// ============================================================
// 请求拦截
// ============================================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 不缓存 API 请求
    if (NEVER_CACHE.some(pattern => url.hostname.includes(pattern))) {
        return;
    }

    // HTML 页面：NetworkFirst（优先网络，确保拉到最新版本，避免"该死的缓存"）
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirst(request, CACHE_RUNTIME));
        return;
    }
    // JS/CSS/图片/字体等静态资源：StaleWhileRevalidate（缓存秒开 + 后台更新）
    if (['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }

    // 其他 GET：NetworkFirst
    event.respondWith(networkFirst(request, CACHE_RUNTIME));
});

// ============================================================
// StaleWhileRevalidate：先返回缓存（秒开），后台拉新
// ============================================================
function staleWhileRevalidate(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then(async (networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const cachedClone = cachedResponse ? cachedResponse.clone() : null;
                    const cachedText = cachedClone ? await cachedClone.text() : '';
                    const networkClone = networkResponse.clone();
                    const networkText = await networkClone.text();
                    if (cachedText !== networkText) {
                        cache.put(request, new Response(networkText, {
                            status: networkResponse.status,
                            statusText: networkResponse.statusText,
                            headers: networkResponse.headers
                        }));
                        if (cachedResponse) {
                            self.clients.matchAll().then(clients => {
                                clients.forEach(client => {
                                    client.postMessage({ type: 'NEW_VERSION_READY' });
                                });
                            });
                        }
                    }
                }
                return networkResponse;
            }).catch(() => {});

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
// 消息通信
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
