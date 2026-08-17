// ============================================================
// Service Worker v5 - 塔防助手 PWA 缓存策略
// 策略：StaleWhileRevalidate（先用缓存秒开，后台静默更新）
// v34: 再次强制刷新缓存——修复"分享加密密码框不显示"（旧 SW 用 cacheFirst 缓存旧 index.html 不更新）；
//      提升 CACHE_VERSION 触发 activate 清空所有 tfjl- 缓存，确保拿到最新前端（含分享密码框）
// ============================================================

const CACHE_VERSION = 's1.0.148';
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

// 不缓存的路径（Gist API、计数器等需要实时数据）
const NEVER_CACHE = [
    'api.github.com',
    'gist.githubusercontent.com',
    'raw.githubusercontent.com',
    'avatars.githubusercontent.com'
];

// ============================================================
// 安装事件：不 skipWaiting（让新 SW 等待，直到用户刷新/旧页面关闭才接管）。
// 原因：skipWaiting + clients.claim 会在页面运行中强行接管并清空缓存，
// 在 WebView2 下易触发"缓存已删、新缓存未建好"的蓝屏卡死；且 app-picker.js 已改为纯点击更新。
// ============================================================
self.addEventListener('install', (event) => {
    // 故意不调用 skipWaiting()，新 SW 安装后处于 waiting 状态，等用户点更新再激活
    // 🔴 修复更新气泡滞后一个版本：原逻辑把 NEW_VERSION_READY 放在 activate（用户点更新之后）才发，
    // 导致"有新版待更新"的提示永远在更新完成之后才弹。改为 install 完成时即通知现有页面，
    // 且仅当存在已激活的旧 SW（self.registration.active）才提示，避免首次安装误弹。
    event.waitUntil(
        Promise.resolve().then(() => {
            if (self.registration && self.registration.active) {
                return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'NEW_VERSION_READY' });
                        client.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
                    });
                });
            }
        })
    );
});

// ============================================================
// 激活事件：只删除"旧版本"运行时缓存，保留当前版本缓存（避免 reload 时空窗蓝屏）
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.endsWith('-runtime') && name !== CACHE_RUNTIME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => {
            // 拿下所有页面控制权（NEW_VERSION_READY 已在 install 阶段发给现有页面，这里不再重复发，避免更新后重复弹气泡）
            return self.clients.claim();
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

    // HTML 页面：StaleWhileRevalidate（先用缓存秒开，后台静默更新并检测新版本）
    // 改回 SWR 的原因：原 networkFirst 每次启动都走网络拉 index.html（cache:'no-store'），
    // 导致 Tauri 桌面端每次冷启动都要等远程 Pages 下载，黑屏久、达不到秒开。
    // SWR 先返回 SW 缓存的 index.html 即刻渲染，后台 fetch 比较内容，有新版本才提示刷新。
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }
    // JS/CSS 同样 SWR：首次用缓存秒开，后台更新；内容变化自动提示刷新（保留"永不跑旧 JS"安全性）
    if (['script', 'style'].includes(request.destination)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_RUNTIME));
        return;
    }
    // 图片/字体等静态资源：StaleWhileRevalidate（缓存秒开 + 后台更新）
    if (['image', 'font', 'manifest'].includes(request.destination)) {
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
            const fetchPromise = fetch(request, { cache: 'no-store' }).then(async (networkResponse) => {
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
// NetworkFirst：优先网络（保证永远拿到最新脚本），失败回退缓存
// 并在“网络内容 ≠ 缓存内容”时通知页面有新版本（触发自动刷新）
// ============================================================
function networkFirst(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        // cache:'no-store' 强制绕过浏览器/webview 的 HTTP 磁盘缓存，杜绝 GitHub Pages 静态资源 304 返回旧版
        return fetch(request, { cache: 'no-store' }).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                // 比较缓存与网络内容，决定是否通知页面“有新版本”
                cache.match(request).then((cachedResponse) => {
                    const cachedClone = cachedResponse ? cachedResponse.clone() : null;
                    const networkClone = networkResponse.clone();
                    Promise.all([
                        cachedClone ? cachedClone.text() : Promise.resolve(''),
                        networkClone.text()
                    ]).then(([cachedText, networkText]) => {
                        cache.put(request, new Response(networkText, {
                            status: networkResponse.status,
                            statusText: networkResponse.statusText,
                            headers: networkResponse.headers
                        }));
                        if (cachedText !== networkText) {
                            self.clients.matchAll().then(clients => {
                                clients.forEach(client => client.postMessage({ type: 'NEW_VERSION_READY' }));
                            });
                        }
                    }).catch(() => {});
                }).catch(() => {});
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
    // 页面主动询问当前 SW 缓存版本号（页面加载/controllerchange 时调用）
    if (event.data && event.data.type === 'GET_SW_VERSION') {
        if (event.source) event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
    }
});
