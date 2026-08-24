// ============================================================
// Service Worker v5 - 塔防助手 PWA 缓存策略
// 策略：StaleWhileRevalidate（先用缓存秒开，后台静默更新）
// v34: 再次强制刷新缓存——修复"分享加密密码框不显示"（旧 SW 用 cacheFirst 缓存旧 index.html 不更新）；
//      提升 CACHE_VERSION 触发 activate 清空所有 tfjl- 缓存，确保拿到最新前端（含分享密码框）
// v35: 升版本配合 app-core.js 水人首屏渲染修复（commit 5c4338c，把云端卡渲染移出 scanSkins 分支，
//      网页端此前因无 scanSkins 整段被跳过，导致水人「直接没有」）。强制刷新后浮动控制台 SW_VERSION 应为 s1.0.226。
// v36: 升版本配合「API监控→部署日志+定时任务」克隆自拍卖行管理员（index.html/api-core.js 新增 loadActionsLogs/loadRunLog、
//      refreshApiMonitor 补部署日志区块、index.html 增加部署日志+触发方式面板）。强制刷新后 SW_VERSION 应为 s1.0.227。
// v37: 修「双击右下角版本号强制刷新无效」——原绑定 onVersionTagForceRefresh 只弹 confirm + 用废弃的 location.reload(true)
//      （现代浏览器不强制跳缓存）导致刷不到最新。改为直接调 forceRefreshLatest()（清SW缓存+skipWaiting+带时间戳replace）。
//      强制刷新后 SW_VERSION 应为 s1.0.228。
// v38: forceRefreshLatest 改为【无条件 unregister 所有 SW】+ 清空 cache（之前仅"无 waiting 时"才 unregister，
//      导致旧 SW(225) 一直 controlling、新 SW(228) 处于 waiting 时 skipWaiting 异步未生效 → 强刷后仍被旧 SW 接管，
//      页面永远显示 HTML 写死的 fallback "s1.0.225" 拿不到 228）。另：index.html 版本号标签 opacity 0.1→0.6 调亮；
//      APP 端 initAppLocal 用 getAppVersion 回填真实版本（Tauri 无 SW，否则永远显示 225）。
//      强制刷新后 SW_VERSION 应为 s1.0.229。
// v39: 修「点彩气泡(发现新版本)后还是 225」——①彩气泡点击原只发 SKIP_WAITING + 废弃的 location.reload(true)，
//      旧SW仍 controlling → 仍拿旧版；改为直接调 forceRefreshLatest()。②sw.js install 改为【无条件回报 SW_VERSION】
//      （原仅"有 active 旧SW时"才发，forceRefreshLatest unregister 全部SW后 reload，新SW重新register时 active 为 null，
//      不发 → 页面回退 HTML 写死 fallback 225）。强制刷新后 SW_VERSION 应为 s1.0.230。
// ============================================================

const CACHE_VERSION = 's1.0.265';
const DEPLOY_TAG = 's20260824-2046';  // 部署时由 deploy.yml python 脚本注入为 's20260824-HHMM'（北京时区），SW_VERSION 消息携带到页面，根治「版本号日期消失」
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
            return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
                clients.forEach(client => {
                    // 无条件回报缓存版本号（让页面在任意 register 后都能回填版本标签，
                    // 不被 "active 存在才发" 限制坑住——forceRefreshLatest unregister 全部 SW 后 reload，
                    // 新 SW 重新 register 时 active 为 null，若不发则页面回退到 HTML 写死的 fallback 225）
                    client.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION, deployTag: DEPLOY_TAG });
                    // NEW_VERSION_READY 仅在有旧 SW 运行时提示（避免首次安装误弹气泡）
                    if (self.registration && self.registration.active) {
                        client.postMessage({ type: 'NEW_VERSION_READY' });
                    }
                });
            });
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

    // 皮肤元数据 JSON（cards/fusions/skin-attributes/registry 等）随时随版本变动，
    // 且 github.io 偶发不可达时 networkFirst 会回退到旧缓存 → 导致「英雄卡消失」（如 水人）。
    // 故这些 JSON 永远直连拿最新，不走 SW 缓存；图片 .skin/.png 仍走 SWR 离线可用。
    if (url.hostname.includes('github.io') && url.pathname.includes('/skins/') && url.pathname.endsWith('.json')) {
        return;
    }

    // HTML 页面：NetworkFirst（网络优先，保证永远先拿最新 index.html，避免旧缓存不带新菜单项）
    // 仅在网络彻底不可达时回退缓存（离线可用）。修复“诊断菜单项加进 index.html 后用户一直看到旧版”的问题。
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirst(request, CACHE_RUNTIME));
        return;
    }
    // JS/CSS 改为 NetworkFirst（网络优先）：保证永远先拿最新 app-core.js/app-local.js 等脚本，
    // 避免旧 SW 缓存里的占位符 token 版本导致 GitHub API PATCH 403（SW 缓存旧 JS 卡死问题）。
    // 仅当网络彻底不可达时才回退旧缓存，保证离线可用。速度差异极小（GitHub Pages CDN 几十 ms）。
    if (['script', 'style'].includes(request.destination)) {
        event.respondWith(networkFirst(request, CACHE_RUNTIME));
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
        if (event.source) event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION, deployTag: DEPLOY_TAG });
    }
});
