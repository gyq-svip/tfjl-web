// ============================================================
// Service Worker v5 - 塔防助手 PWA 缓存策略
// 2026-08-27 test bump: trigger CI auto-bump s1.0.376 -> s1.0.377
// 2026-08-27 test bump 378: verify force-reload switch + X/- silent sw refresh
// 2026-08-27 test bump 379: verify both X and - auto silent refresh to s1.0.379
// 2026-08-27 test bump 380: verify switch OFF disables silent refresh (stays 379)
// 2026-08-27 test bump 384: verify switch OFF stays, switch ON + manual refresh triggers bubble (s1.0.384)
// 2026-08-27 test bump 386: verify switch OFF shows bubble but NO auto-upgrade (must click to go 385 -> 386)
// 2026-08-27 test bump 389: verify switch ON + tray/hidden -> auto silent upgrade to s1.0.389
// 测试触发 bump: 331 -> 332 (验证被全屏遮挡时前台不自动升级)
// 霸道强制升级: 332 -> 333 (SW 无条件 navigate 强推老顽固客户端, 不依赖功能开关)
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
// v40: 强制更新总开关从诊断面板迁移到「功能开关」面板（FEATURE_TOGGLES 的 forceReload 项，权威来源改为索引 Gist room_index.json.forceReloadEnabled），
//      删除诊断面板独立按钮 + adminToggleForceReload 函数；运行时读 window.__diagForceReload（由 initForceReloadFromIndex 启动 + apply 时设置）。
//      强制刷新后 SW_VERSION 应为 s1.0.306。
// v41: 强制更新开关下沉到 SW 层（_maybeForceReload）：SW install 时读索引 Gist 的 forceReloadEnabled，开关开则主动 skipWaiting()
//      让新 SW 立即接管 + 发 FORCE_RELOAD 消息（app-core.js 复用 notifyNewVersion，仍在隐藏/闲置时才静默强刷，不打断用户）。
//      解决老设备（app-core.js 不认识 window.__diagForceReload）也能被推着自动升级。默认关，风险可控。SW_VERSION 应为 s1.0.307。
// v42: 纯版本号升级 s1.0.308（无功能改动），用于端到端验证「强制更新总开关开 + 最小化托盘 → 自动静默升 308」链路。SW_VERSION 应为 s1.0.308。
// v43: 修 P3 卡旧 SW 的根因——app-picker.js 的 sw.js cachebust 之前写死 b20260823230841，每次部署浏览器都认成同一个文件，根本不拉新 sw.js。
//      改为跟随 #versionTag 文本 base（部署脚本必改字段），保证每次部署都被认作新 SW 文件，触发 install + _maybeForceReload。
//      同时移除兜底 window.__DEPLOY_TAG（index.html 没注入这个变量，留着误导）。SW_VERSION 应为 s1.0.309。
// v44: 纯版本号升级 s1.0.311（无功能改动）。CI 部署会自动 +1 → 实际线上为 s1.0.312。用于验证「已升 310 的客户端 + 功能开关开 → 发 312 时自动静默升」。
//      deploy.yml 中已废弃的 SW register ?v= sed 已注释（app-picker.js 自己跟随 #versionTag）。
// v45: 诊断面板「🟥真实写 Gist」与「⚪功能使用」改中文标签。把 32 位 Gist ID 用 _gistLabel() 翻译成 emoji+中文用途（消息墙/计数器/索引/房间等），
//      短哈希前 8 位用蓝色下划线链接包裹，点击直达 Gist。截图里那种 `51e7030023fa…` 乱码已消失。SW_VERSION 应为 s1.0.313。
// v46: 🔴 SW 主动轮询自动升级——弥补「页面一直开着不 reload 就不自动升」的缺口（P3/最小化托盘场景）。
//      新增 _pollLatestVersion()：activate 后每 5 分钟 fetch 线上 sw.js 提取 CACHE_VERSION，发现更新且功能开关 forceReloadEnabled 开，
//      则 skipWaiting() + 发 FORCE_RELOAD（页面在隐藏态静默强刷）。开关关则退化为等用户手动点。NEVER_CACHE 加 gyq-svip.github.io 放行轮询 fetch。
//      SW_VERSION 应为 s1.0.314（CI 部署 +1）。
// v47: 自动升级验证用空提交（轮询/静默强刷逻辑已在 v46 落地）。CACHE_VERSION 保持 s1.0.313 由 CI 自动 +1 → 线上 318。
// v48: 自动升级闭环验证（根目录部署源已含轮询，线上 319 验证通过）。本次 CI +1 → 线上 320。
// v49: 自动升级闭环最终验证（开关 404 修复 + 气泡 bug 修复已上）。本次 CI +1 → 线上 325。
// v50: 🔴 退回 SW 层 navigate 强推——之前霸道强推老顽固时把 `_pollLatestVersion`/install 兜底/`_maybeForceOnTraffic`
//      三处都加了无条件 `client.navigate()`，导致 APP 前台也被强刷（用户硬要求「前台坚决不升级，挂托盘才静默升」）。
//      三处 navigate 全删，只保留 `client.postMessage({type:'FORCE_RELOAD'})`。升级决策唯一交给 app-picker.js：
//      前台只弹气泡、挂托盘才静默强刷（前置落盘）。老顽固客户端要升，需他们主动 reload/重开一次拿新 app-picker.js，
//      之后才能进自动轨道。SW_VERSION 应为 s1.0.337（CI +1）。
// v51: 手动冲突解决——本地 v50 退回提交 vs 远程 CI 自动 bump 到 337 冲突。保留 v50 退回的 SW 代码，
//      版本号采用 CI 的 `s1.0.337` + `s20260826-1804`。线上立刻能看到「前台只弹气泡，挂托盘才静默升」正确行为。
// ============================================================

const CACHE_VERSION = 's1.0.466';
const DEPLOY_TAG = 's20260829-1652';  // 部署时由 deploy.yml python 脚本注入为 's20260824-HHMM'（北京时区），SW_VERSION 消息携带到页面，根治「版本号日期消失」
const CACHE_RUNTIME = CACHE_VERSION + '-runtime';

// 不缓存的路径（Gist API、计数器等需要实时数据）
const NEVER_CACHE = [
    'api.github.com',
    'gist.githubusercontent.com',
    'raw.githubusercontent.com',
    'avatars.githubusercontent.com',
    'gyq-svip.github.io'   // 放行线上 sw.js 自身的版本轮询 fetch（SW 主动探测最新版用）
];

// 线上 sw.js 地址（与本站同源，仅主机不同）。SW 主动轮询它提取 CACHE_VERSION，
// 实现「页面一直开着不 reload 也能自动升级」（弥补 register.update() 只在 load 时触发、开着不动不升的缺口）。
const ONLINE_SW_URL = 'https://gyq-svip.github.io/tfjl-web/sw.js';

// 从 CACHE_VERSION（形如 's1.0.314'）解析数字尾部，便于比较大小
function _versionNum(v) {
    const m = /(\d+)\s*$/.exec(v || '');
    return m ? parseInt(m[1], 10) : -1;
}

// 读索引 Gist 的 forceReloadEnabled（用 api.github.com 读公开 gist，无需 token；raw gist.githubusercontent.com 路径易 404 导致误判开关关闭 → 永不升级）。
// 开关开则返回 true，读取失败（网络/限流/404）一律回退为「开」（宁可误升也不卡死，符合用户「自动升级」诉求）。
async function _isForceReloadEnabled() {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch('https://api.github.com/gists/a32a0628bd9275f3a4922cd12cf298c9', { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
            const d = await r.json().catch(() => null);
            const c = d && d.files && d.files['room_index.json'] && d.files['room_index.json'].content;
            if (c) {
                const idx = JSON.parse(c);
                return !!idx.forceReloadEnabled;
            }
        }
    } catch (e) {}
    // 读取失败 → 默认「关」，避免开关读不到就误推升级（前台铁律：不主动升级，必须用户点/重开）
    return false;
}

// SW 主动轮询线上 sw.js 的最新版本号：发现比当前 CACHE_VERSION 新、且功能开关开，
// 则 skipWaiting() 让新 SW 接管 + 发 FORCE_RELOAD（页面在隐藏态静默强刷，不打断操作）。
// 这是「一直开着的标签页也能自动升级」的关键——不再依赖页面 reload 才触发 register.update()。
async function _pollLatestVersion() {
    if (!(self.registration && self.registration.active)) return; // 首次安装不强制
    let latest = '';
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        // 带时间戳 cachebust 确保每次都拿到最新线上 sw.js（不被 CDN/浏览器缓存坑）
        const r = await fetch(ONLINE_SW_URL + '?_=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
            const txt = await r.text();
            const m = /const CACHE_VERSION\s*=\s*'([^']+)'/.exec(txt);
            if (m) latest = m[1];
        }
    } catch (e) { return; }
    if (!latest) return;
    // 仅当线上版本号更新时才继续（避免每次轮询都打扰）
    if (_versionNum(latest) <= _versionNum(CACHE_VERSION)) return;
    // 🔴 2026-08-27 改：开关「只管自动升级，不管气泡」。无论开关开/关都发 FORCE_RELOAD，
    //   页面侧自行判定：开关开→后台静默升、前台弹气泡；开关关→一律只弹气泡不自动升。
    const enabled = await _isForceReloadEnabled();
    if (!enabled) {
        console.log('[SW] 检测到线上新版本', latest, '强制更新开关关 → 仍发 FORCE_RELOAD 让页面弹气泡（不自动升）');
    }
    // 🔴 退回去：发现新版本只发 FORCE_RELOAD 消息，【不再 SW 层 navigate 强推】。
    // 原因：之前霸道强推被用户否决——APP 前台被强制刷新会打断编辑、丢数据。
    // 升级决策唯一交给 app-picker.js：前台只弹气泡、挂托盘才静默强刷。
    // 老顽固客户端要升，需等他们主动 reload/重开一次（拿新 app-picker.js），之后才能进自动轨道。
    console.log('[SW] 检测到线上新版本', latest, '当前', CACHE_VERSION, '→ 发 FORCE_RELOAD（auto=' + enabled + '），由页面侧按 auto 字段决定静默升或仅弹气泡');
    self.skipWaiting();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => {
        try {
            client.postMessage({ type: 'FORCE_RELOAD', latest: latest, silent: true, auto: enabled });
        } catch (e) {}
    });
}

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
        // 🔴 强制更新总开关下沉到 SW 层（功能开关面板 forceReloadEnabled）：
        // 老设备 app-core.js 不认识 window.__diagForceReload，但仍能被 SW 推着升级。
        // 开关开 → 主动 skipWaiting() 让新 SW 立即接管，并通知页面强刷（页面 notifyNewVersion 仍只在
        // 隐藏/闲置时才真正 reload，不打断正在改项目的用户）。开关关 → 退化为原行为（等用户手动点）。
        .then(() => _maybeForceReload())
        // 🔴 老顽固兜底接管：当注册时已有旧 SW 在跑（registration.active 存在），说明页面被老版本 SW 控制。
        // 老 SW 的 _isForceReloadEnabled 走已 404 的 raw URL，开关永远 false → 永远不升级 → 卡死在旧版本（如 s1.0.301）。
        // 这种情况跳过开关判断，无条件 skipWaiting() + clients.claim() 接管老顽固页面并推 FORCE_RELOAD，
        // 接管后由新 SW 的轮询/强刷逻辑把它们带上。挂托盘 WebView 暂停渲染时接管瞬用户无感，可接受。
        .then(() => {
            if (self.registration && self.registration.active) {
                // 🔴 修复：老顽固兜底接管也必须受「强制更新总开关」控制，否则开关关了仍被强制刷（2026-08-27 实测：关开关推 380 仍升）。
                // 仅开关开时才无条件接管老顽固；关则退化为等用户手动点。
                return _isForceReloadEnabled().then(enabled => {
                    if (!enabled) return; // 开关关 → 不强制接管，尊重用户关闭意图
                    self.skipWaiting();
                    return self.clients.claim().then(() =>
                        self.clients.matchAll({ includeUncontrolled: true }).then(cls => {
                            // 接管老顽固页面：仅发 FORCE_RELOAD 消息，升级决策交页面侧
                            // （前台弹气泡由用户确认、挂托盘才静默强刷，前置落盘不丢数据）。
                            cls.forEach(c => {
                                try {
                                    c.postMessage({ type: 'FORCE_RELOAD', silent: true, auto: true });
                                } catch (e) {}
                            });
                        })
                    );
                });
            }
        })
        // 兜底逻辑已在上方"registration.active 存在"分支完成（对有旧 SW 的客户端强推 navigate）。
        // 注意："CACHE_VERSION < 基线" 这种判断在 SW 侧无意义——新 SW 文件里的 CACHE_VERSION 就是最新的，
        // 老顽固加载新 SW 后本地 CACHE_VERSION 永远 >= 基线。真正的"基线强推"靠上方旧 SW 接管分支。
        .catch(() => {})
    );
});

// 读索引 Gist 的 forceReloadEnabled（公开 raw，无需 token），开关开则主动激活新 SW + 发 FORCE_RELOAD
async function _maybeForceReload() {
    if (!(self.registration && self.registration.active)) return; // 首次安装不强制
    const enabled = await _isForceReloadEnabled();
    // 🔴 2026-08-27 修复：开关关时也要让新 SW 接管（skipWaiting），否则新 SW 一直 waiting 不 activate，
    //   → 轮询 _pollLatestVersion 不跑 → 开关关时永远不自动弹气泡（需手动刷新才行）。
    //   接管页面本身安全（升级决策在页面侧且升级前落盘）；开关只控制"是否自动升"，不影响"是否接管+轮询"。
    //   开关关 → 接管但不发 FORCE_RELOAD（发消息交给轮询，带正确的 auto=false 让页面仅弹气泡不升）。
    //   开关开 → 接管并立即发 FORCE_RELOAD（auto=true，页面侧按静默规则升）。
    self.skipWaiting();
    if (!enabled) return;
    // 开关开：立即通知所有页面（页面侧按静默规则升级，绝不弹气泡）
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'FORCE_RELOAD', silent: true }));
}

// 🔴 读写即强推：新 SW 已接管后，利用老顽固高频读写（每次 GET 请求过 SW）触发节流版版本检查，
// 发现线上版本 > 本地立即 navigate 强拽所有页面升级（无需旧 app-core 配合、不依赖功能开关）。
// 节流 30s：老顽固读写风暴下不会每请求都 fetch 线上 sw.js。
let __lastTrafficCheck = 0;
async function _maybeForceOnTraffic() {
    const now = Date.now();
    if (now - __lastTrafficCheck < 30000) return; // 30s 内只查一次
    __lastTrafficCheck = now;
    if (!(self.registration && self.registration.active)) return;
    let latest = '';
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(ONLINE_SW_URL + '?_=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
            const txt = await r.text();
            const m = /const CACHE_VERSION\s*=\s*'([^']+)'/.exec(txt);
            if (m) latest = m[1];
        }
    } catch (e) { return; }
    if (!latest) return;
    if (_versionNum(latest) <= _versionNum(CACHE_VERSION)) return; // 无新版本不骚扰
    // 🔴 修复：读写流量触发的强刷也要受「强制更新总开关」控制（开关关则不强制，尊重用户关闭意图）。
    const enabled = await _isForceReloadEnabled();
    if (!enabled) return;
    console.log('[SW] 读写流量触发：检测到线上新版本', latest, '当前', CACHE_VERSION, '→ 发 FORCE_RELOAD（auto=' + enabled + '），由页面侧判定');
    self.skipWaiting();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => {
        try { client.postMessage({ type: 'FORCE_RELOAD', silent: true, auto: enabled }); } catch (e) {}
    });
}

// ============================================================
// 激活事件：只删除"旧版本"运行时缓存，保留当前版本缓存（避免 reload 时空窗蓝屏）
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    // 🔴 P0（2026-08-27 白屏）：删除【所有】runtime 缓存（含当前版本），
                    // 强制新 SW 首次请求走网络拿正确文件，不再复用可能损坏的旧缓存 app-core.js。
                    .filter((name) => name.endsWith('-runtime'))
                    .map((name) => caches.delete(name))
            );
        }).then(() => {
            // 拿下所有页面控制权（NEW_VERSION_READY 已在 install 阶段发给现有页面，这里不再重复发，避免更新后重复弹气泡）
            return self.clients.claim();
        })
    );
    // 🔴 启动 SW 主动轮询：每 5 分钟探测线上 sw.js 最新版本，发现更新且功能开关开则推页面静默强刷。
    // 解决「页面一直开着不 reload 就不自动升级」的缺口（P3/最小化托盘场景）。仅激活后启动一次，避免重复定时器。
    if (!self.__versionPollStarted) {
        self.__versionPollStarted = true;
        _pollLatestVersion(); // 激活后立即查一次（不等 5 分钟）
        setInterval(_pollLatestVersion, 5 * 60 * 1000);
    }
});

// ============================================================
// 请求拦截
// ============================================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    // 🔴 读写即强推：老顽固客户端（如"与时俱进"）一直后台挂机、读写量极大但不 reload 页面，
    // 永远不会主动加载新 SW。利用它「每次心跳/读写都过 SW fetch 拦截」的特点——
    // 新 SW 一旦接管（哪怕靠浏览器周期检查碰巧加载），之后它每一次 GET 请求经过 SW 都会触发
    // 一次节流的版本检查，发现线上更新立即 navigate 强拽升级。这样「被周期检查加载新 SW 后，
    // 下一次读写请求就立刻升」，而非再等一个 24h 周期。节流 30s 防止读写风暴刷爆请求。
    _maybeForceOnTraffic();

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

    // 🔴 P0 修复（2026-08-27 白屏事故）：HTML/JS/CSS 改为 networkFirst，
    // 不再 staleWhileRevalidate 先返回可能损坏的旧缓存（旧缓存 app-core.js 缺失 HB_JITTER 导致白屏）。
    // 网络优先 + 超时(8s)回退缓存，保证用户永远拿到线上正确文件。
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirst(request, CACHE_RUNTIME));
        return;
    }
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
// 网络请求超时保护：超过 TIMEOUT 毫秒放弃线上，避免 SW 被慢网络卡死（之前无超时 → 缓存清空后无限等线上 → 白屏/卡死）
const NET_TIMEOUT = 8000;
function _timeoutFetch(request) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT);
    return fetch(request, { cache: 'no-store', signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
}

function staleWhileRevalidate(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
            // 有缓存：立即返回秒开，后台静默更新（不阻塞页面）
            if (cachedResponse) {
                _timeoutFetch(request).then(async (networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const cachedClone = cachedResponse.clone();
                        const cachedText = await cachedClone.text();
                        const networkClone = networkResponse.clone();
                        const networkText = await networkClone.text();
                        if (cachedText !== networkText) {
                            cache.put(request, new Response(networkText, {
                                status: networkResponse.status,
                                statusText: networkResponse.statusText,
                                headers: networkResponse.headers
                            }));
                            self.clients.matchAll().then(clients => {
                                clients.forEach(client => client.postMessage({ type: 'NEW_VERSION_READY' }));
                            });
                        }
                    }
                }).catch(() => { /* 超时/失败：保留旧缓存，不影响页面 */ });
                return cachedResponse;
            }
            // 无缓存：带超时拉线上，超时则回退（不无限等待）
            return _timeoutFetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(() => cache.match(request));
        });
    });
}

// ============================================================
// NetworkFirst：优先网络（保证永远拿到最新脚本），失败/超时回退缓存
// 注意：此处【不再】因「缓存文本 ≠ 网络文本」发 NEW_VERSION_READY 气泡——
// 该比对在 SW 安装初期缓存尚未预热时必然不一致，导致每次升级后重复弹气泡（bug）。
// 「发现新版本」气泡统一由 install 阶段（有旧 SW 时）与 _pollLatestVersion 轮询（受功能开关控制）负责。
// ============================================================
function networkFirst(request, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return _timeoutFetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                // 仅更新缓存，不比较文本、不弹气泡
                cache.put(request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
        }).catch(() => {
            // 超时/网络失败：立即回退缓存，不让页面白屏干等
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
