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
    self.skipWaiting(); // 跳过等待，立即激活新版
    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            return cache.addAll(PRECACHE_URLS).catch(() => {
                // 预缓存失败不影响安装
            });
        })
    );
});

// ============================================================
// 激活事件：清理旧版本缓存
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('tfjl-') && name !== CACHE_VERSION && !name.endsWith('-runtime'))
                    .map((name) => {
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            return self.clients.claim(); // 立即接管所有页面
        })
    );
});

// ============================================================
// 请求拦截：根据资源类型选择缓存策略
// ============================================================
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // 只处理 GET 请求
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 不缓存 API 请求（Gist、GitHub API 等）
    if (NEVER_CACHE.some(pattern => url.hostname.includes(pattern))) {
        return; // 直接走网络，不拦截
    }

    // HTML 页面：StaleWhileRevalidate（先缓存后更新）
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }

    // 静态资源（JS/CSS/图片/字体）：StaleWhileRevalidate
    if (['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }

    // 其他 GET 请求：NetworkFirst（优先网络，失败回退缓存）
    event.respondWith(networkFirst(request, CACHE_RUNTIME));
});

// ============================================================
// 策略1：StaleWhileRevalidate（先用缓存秒开，后台拉取新资源）
// 关键优化：仅当后台拉到的新资源与缓存【内容不同】时才更新缓存，
// 并通知页面「新版本已就绪」，实现「优先缓存秒开 + 静默获取后启用」
// ============================================================
let _newVersionAnnounced = false;
function notifyNewVersion() {
    if (_newVersionAnnounced) return;
    _newVersionAnnounced = true;
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION_READY' }));
    });
}

function staleWhileRevalidate(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
            // 后台静默拉取最新资源（不阻塞当前渲染，秒开体验不受影响）
            const fetchPromise = fetch(request, { cache: 'no-store' }).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
                    // 比较内容是否与缓存不同，避免无变化时误更新/误通知
                    const netClone = networkResponse.clone();
                    netClone.text().then((netText) => {
                        const applyUpdate = () => {
                            cache.put(request, networkResponse.clone());
                            notifyNewVersion();
                        };
                        if (cachedResponse) {
                            cachedResponse.clone().text().then((cacheText) => {
                                if (netText !== cacheText) applyUpdate();
                            }).catch(applyUpdate);
                        } else {
                            applyUpdate();
                        }
                    }).catch(() => {});
                }
                return networkResponse;
            }).catch(() => {
                // 网络失败，静默忽略（缓存还在）
            });

            // 有缓存就先返回缓存（秒开），没有才等网络
            return cachedResponse || fetchPromise;
        });
    });
}

// ============================================================
// 策略2：NetworkFirst（优先网络，失败回退缓存）
// 适合：需要较新但可离线的数据
// ============================================================
function networkFirst(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        }).catch(() => {
            // 网络失败，回退缓存
            return cache.match(request);
        });
    });
}

// ============================================================
// 消息通信：允许页面主动触发更新
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'CLEAR_CACHE') {
        caches.keys().then((names) => {
            return Promise.all(names.map((n) => caches.delete(n)));
        }).then(() => {
            event.source.postMessage('CACHE_CLEARED');
        });
    }
});
