/* skins-web.js — 网页版（非 Tauri / 普通浏览器）英雄皮肤系统
 *
 * 背景：app-local.js 整体被 `if (isTauriApp) { ... }` 包裹，只有在 Tauri 桌面端才会执行，
 * 普通浏览器打开 GitHub Pages 时整个皮肤系统不初始化，window.resolveHeroSkinUrl 等从未定义，
 * 因此网页版过去一直不显示皮肤。本文件仅在「非 Tauri」时启用，复用同样的逻辑（远程 registry
 * + 远程 PNG，IndexedDB 缓存），让网页版也能显示皮肤。Tauri 环境下本文件直接 return，
 * 不重复定义（避免覆盖 app-local.js 的磁盘优先版本）。
 */
(function () {
  var isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__ || (navigator.userAgent || '').indexOf('Tauri') >= 0);
  if (isTauri) {
    console.log('[SKIN-WEB] 检测到 Tauri，跳过（皮肤由 app-local.js 负责）');
    return;
  }
  console.log('[SKIN-WEB] 网页版皮肤系统初始化');

  // 🔴 方案 C（2026-08-18）：网页版皮肤走同源 GitHub Pages 静态资源 ./skins/，彻底移除 jsDelivr CDN。
  // 理由：jsDelivr 国内限流/超时是「刷新后皮肤不稳定」最大因素；皮肤文件已随仓库部署到
  // https://gyq-svip.github.io/tfjl-web/skins/，与页面同域，无 CORS、可进 SW/IndexedDB 缓存，更快更稳。
  var SKIN_BASE = (function () {
    try { return new URL('./skins/', location.href).href.replace(/\/$/, ''); }
    catch (e) { return 'skins'; }
  })();
  var SKIN_SOURCES = [SKIN_BASE]; // 仅同源，不再依赖任何 CDN
  var REMOTE_SKIN_BASE = SKIN_BASE;
  var REMOTE_SKIN_REGISTRY_URL = SKIN_BASE + '/registry.json';
  var REMOTE_SKIN_FUSIONS_URL = SKIN_BASE + '/fusions.json';

  window.skinRegistry = {};       // { 英雄名: [{ name, url, path }] }
  window.heroSkinSelections = {};  // { 英雄名: 皮肤名 }

  // 王城低配版阵容优先预热（用户主阵容，开项目秒开）：这些英雄皮肤先拉
  var PRIORITY_HEROES = new Set(['水灵','水人','萌萌','咕咕','钢鬃','木精灵','光精灵','幻精灵','火炮射线','小野酋长','死神海妖','火炮','风灵','死神','骨弓','电法','铁骑','悟空','魂精灵','魔精灵']);

  // 解析 "皮肤名·英雄名" 格式，返回基础英雄名
  function getBaseHeroName(fullName) {
    if (!fullName) return { heroName: '', skinName: null };
    var idx = fullName.indexOf('·');
    if (idx > 0) {
      return { heroName: fullName.substring(idx + 1), skinName: fullName.substring(0, idx) };
    }
    return { heroName: fullName, skinName: null };
  }

  // ==================== IndexedDB 皮肤缓存（网页版） ====================
  var SKIN_DB_NAME = 'tfjl-skin-cache';
  var SKIN_DB_VERSION = 1;
  var SKIN_STORE = 'skins';
  var _skinDbPromise = null;
  function _openSkinDb() {
    if (_skinDbPromise) return _skinDbPromise;
    _skinDbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject('indexeddb unavailable'); return; }
      var req = indexedDB.open(SKIN_DB_NAME, SKIN_DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(SKIN_STORE)) {
          db.createObjectStore(SKIN_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return _skinDbPromise;
  }
  async function _idbGet(key) {
    try {
      var db = await _openSkinDb();
      return await new Promise(function (resolve) {
        var tx = db.transaction(SKIN_STORE, 'readonly');
        var req = tx.objectStore(SKIN_STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { resolve(null); };
      });
    } catch (e) { return null; }
  }
  async function _idbPut(key, blob) {
    try {
      var db = await _openSkinDb();
      return await new Promise(function (resolve) {
        var tx = db.transaction(SKIN_STORE, 'readwrite');
        tx.objectStore(SKIN_STORE).put({ key: key, blob: blob, time: Date.now() });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    } catch (e) { return false; }
  }

  // 获取皮肤 blob URL（网页版：IndexedDB 优先；未命中则同源 fetch .skin + 单飞去重 + 超时重试）
  var _skinInflight = {}; // key -> 进行中的 fetch promise（避免并发重复拉同一张图挤占连接池）
  // 🔴 2026-08-29 内存修复：objectURL 复用缓存。
  // 原实现每次取皮肤都 URL.createObjectURL(blob) 且从不 revokeObjectURL，
  // 导致 reapplyAllSkins 重复执行 / 切项目 / 刷新时无限创建新的 blob URL，
  // 旧 URL 引用的 Blob 与解码纹理无法 GC，长期挂机 → 任务管理器 1.7~3GB 暴涨。
  // 改为按 key 复用一个永久 objectURL（进程生命周期内有效），每个皮肤只 createObjectURL 一次。
  var _objectUrlCache = {}; // key -> 已创建的 objectURL（永不 revoke，复用）
  async function _getCachedSkinUrl(remoteUrl) {
    if (!remoteUrl) return null;
    if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;
    // 从 URL 解析 hero/file（与源无关），保证缓存 key 稳定、切换源后仍命中
    var m = remoteUrl.match(/\/skins\/([^/]+?)\/([^/]+)$/);
    if (!m) return null; // 非标准皮肤 URL：不再裸退回（同源 .skin 直接作 img src 不可靠）
    var hero = decodeURIComponent(m[1]);
    var file = decodeURIComponent(m[2]);
    var key = 'skin:' + hero + '/' + file;
    // 🔴 复用已创建的 objectURL，避免重复 createObjectURL 造成 Blob 泄漏
    if (_objectUrlCache[key]) return _objectUrlCache[key];
    // 1) IndexedDB 命中即返回（毫秒级，离线/弱网也能显示已缓存皮肤）
    var cached = await _idbGet(key);
    if (cached && cached.blob) {
      try {
        var u1 = URL.createObjectURL(cached.blob);
        _objectUrlCache[key] = u1; // 缓存复用
        return u1;
      }
      catch (e) { console.warn('[SKIN-WEB] createObjectURL failed:', e); }
    }
    // 2) 单飞：同一张图正在拉取，复用同一 promise，避免 N 张同英雄并发 N 次 fetch
    if (_skinInflight[key]) return _skinInflight[key];
    var p = (async function () {
      var url = SKIN_BASE + '/' + encodeURIComponent(hero) + '/' + encodeURIComponent(file);
      try {
        var resp = await _fetchWithRetry(url, 10000, 2); // 同源 GitHub Pages，超时 10s + 重试 2 次
        if (resp && resp.ok) {
          var blob = await resp.blob();
          _idbPut(key, blob); // 回写缓存，下次刷新即稳定
          var u2 = URL.createObjectURL(blob);
          _objectUrlCache[key] = u2; // 缓存复用，避免后续重复创建
          return u2;
        }
      } catch (e) { console.warn('[SKIN-WEB] 皮肤加载失败:', url, e); }
      return null; // 全部失败：返回 null（已有 IndexedDB 兜底，多数情况命中）
    })();
    _skinInflight[key] = p;
    try { return await p; } finally { delete _skinInflight[key]; }
  }

  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // fetch + 超时 + 重试（指数退避），单一同源即可（GitHub Pages 已相当稳定）
  async function _fetchWithRetry(url, ms, retries) {
    retries = retries || 2;
    var lastErr;
    for (var i = 0; i <= retries; i++) {
      var ctrl = null, timer = null;
      try {
        ctrl = new AbortController();
        timer = setTimeout(function () { ctrl.abort(); }, ms || 8000);
        var resp = await fetch(url, { cache: 'no-cache', signal: ctrl.signal });
        clearTimeout(timer);
        if (resp.ok) return resp;
        // 铁律：404 = 资源不存在（如用户自定义融合皮肤 .skin 文件缺失），重试无意义，直接放弃避免刷屏
        if (resp.status === 404) { console.warn('[skins-web] 404 资源不存在，跳过重试:', url); return null; }
        lastErr = new Error('HTTP ' + resp.status);
      } catch (e) { lastErr = e; if (timer) clearTimeout(timer); }
      if (i < retries) await _sleep((i + 1) * 400); // 退避后重试
    }
    return null;
  }
  // 拉取 JSON（registry/fusions/attributes），同源 + 超时 + 重试（最多 3 次）
  async function _fetchJsonWithFallback(relPath) {
    return _fetchWithRetry(SKIN_BASE + relPath, 8000, 3);
  }

  // 后台批量预热（网页版：仅下载到 IndexedDB 缓存，绝不参与首屏渲染阻塞）
  // 设计原则（s1.0.101 修正「越改越慢」回归）：
  //  - 全量 410 张预热改为「低并发(3)、可被打断、fire-and-forget」，注册表同步后异步启动，不 await；
  //  - 首屏渲染只依赖「注册表索引」就绪（_ensureSynced 不等预热），卡片取皮走缓存/按需拉单张；
  //  - 真正阻塞首屏的是「预热洪流挤占源站带宽」——故预热必须低压、可让路。
  var _preheatStarted = false;
  var _preheatAbort = false;
  async function _preheatSkins(heroes, opts) {
    opts = opts || {};
    var concurrency = opts.concurrency || 3;
    var heroNames = Object.keys(heroes || {});
    // 王城低配版英雄排前面优先预热
    heroNames.sort(function (a, b) {
      return (PRIORITY_HEROES.has(a) ? 0 : 1) - (PRIORITY_HEROES.has(b) ? 0 : 1);
    });
    var queue = [];
    heroNames.forEach(function (heroName) {
      var skinList = heroes[heroName];
      if (!Array.isArray(skinList)) return;
      skinList.forEach(function (s) {
        // 🔴 跳过 IndexedDB 旧缓存恢复的 stale 皮肤：线上可能已删除/改名，发起请求必 404 刷屏
        if (s.stale) return;
        queue.push({ hero: heroName, file: s.file || (s.name + '.skin') });
      });
    });
    var idx = 0;
    async function worker() {
      while (idx < queue.length) {
        if (_preheatAbort) return; // 用户关页/重刷：立即放弃，不再占用源站
        var item = queue[idx++];
        var url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(item.hero) + '/' + encodeURIComponent(item.file);
        try { await _getCachedSkinUrl(url); } catch (e) {}
      }
    }
    var workers = [];
    for (var i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);
    console.log('[SKIN-WEB] Preheat done:', queue.length, 'skins (cache-first, concurrency=' + concurrency + ')');
  }

  // 首屏可见卡片优先预热（只拉当前项目/手牌/槽位实际用到的英雄皮肤，不等全量）
  var _preheatVisibleStarted = false;
  async function _preheatVisibleSkins() {
    if (_preheatVisibleStarted) return;
    _preheatVisibleStarted = true;
    try {
      // 🔴 必须先等远端 registry 合并完成：否则会用 IndexedDB 旧缓存里过期/改名前的文件名
      //   （如融合卡早期格式「青城掌门·萨满.skin」）发起请求 → 线上 404 刷屏。
      await _ensureSynced();
      var heroes = {};
      // 收集当前所有可见英雄（卡池 + 手牌 + 槽位）
      var names = {};
      document.querySelectorAll('.card-item, .selected-card, .battle-slot').forEach(function (el) {
        var n = el.dataset && (el.dataset.name || el.dataset.hero);
        if (!n) return;
        var base = getBaseHeroName(n).heroName || n;
        if (base) names[base] = true;
      });
      Object.keys(names).forEach(function (hn) {
        var list = window.skinRegistry[hn];
        if (Array.isArray(list)) heroes[hn] = list;
      });
      if (Object.keys(heroes).length === 0) return;
      _preheatSkins(heroes, { concurrency: 4 }); // 可见优先，稍高并发
    } catch (e) { console.warn('[SKIN-WEB] preheat visible failed:', e); }
  }

  // 🔴 2026-08-30 优先默认皮秒开：每个常用英雄只拉「默认那张」皮肤（共 ~20 张，几百 KB），
  //    注册表一就绪立即高并发拉取 —— 冷缓存首开也马上有一批醒目默认皮，页面不空白；
  //    其余皮肤仍由「可见预热(4) + 空闲全量预热(2)」慢慢回填，互不冲突（_getCachedSkinUrl 单飞去重复用）。
  //    默认皮判定与 resolveHeroSkinInfo 一致：与英雄同名的皮肤优先，无则取第一张。
  var _priorityDefaultsStarted = false;
  function _preheatPriorityDefaults() {
    if (_priorityDefaultsStarted) return;
    _priorityDefaultsStarted = true;
    try {
      var heroes = {};
      PRIORITY_HEROES.forEach(function (hn) {
        var list = window.skinRegistry[hn];
        if (!Array.isArray(list) || !list.length) return;
        var def = findSkin(list, hn) || list[0]; // 与渲染层默认皮判定一致
        if (def && !def.stale) heroes[hn] = [def]; // 只拉默认一张；stale(旧缓存恢复)不发起请求防 404
      });
      var n = Object.keys(heroes).length;
      if (!n) return;
      console.log('[SKIN-WEB] 优先默认皮预热:', n, '个英雄');
      _preheatSkins(heroes, { concurrency: 6 }); // 20 张短平快，高并发立即拉完
    } catch (e) { console.warn('[SKIN-WEB] preheat priority defaults failed:', e); }
  }

  // 从同源皮肤注册表合并到 window.skinRegistry（url 用同源路径）
  function _applyRegistry(heroesObj, opts) {
    opts = opts || {};
    if (!heroesObj) return 0;
    var addedCount = 0;
    for (var hn in heroesObj) {
      if (!Object.prototype.hasOwnProperty.call(heroesObj, hn)) continue;
      var skinList = heroesObj[hn];
      if (!Array.isArray(skinList)) continue;
      if (!window.skinRegistry[hn]) window.skinRegistry[hn] = [];
      var localSkins = window.skinRegistry[hn];
      var localNames = {};
      for (var k = 0; k < localSkins.length; k++) localNames[localSkins[k].name] = true;
      for (var j = 0; j < skinList.length; j++) {
        var remoteSkin = skinList[j];
        var skinName = remoteSkin.name;
        if (!skinName) continue;
        var url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(hn) + '/' + encodeURIComponent(remoteSkin.file || (skinName + '.skin'));
        if (localNames[skinName]) {
          var local = null;
          for (var m = 0; m < localSkins.length; m++) { if (localSkins[m].name === skinName) { local = localSkins[m]; break; } }
          // 🔴 2026-08-29 本地优先：本地已扫描到的皮肤，默认保留本地（不覆盖 url/path/remote）。
          // 仅当本地 url 无效（旧缓存 undefined / 空）时才用远端 URL 兜底（修复水人等「英雄名==皮肤名」默认皮缺失问题）。
          // 不再无条件用远端覆盖本地 → 本地 data/skin 已有皮肤启动 0 网络请求、不卡、内存不暴涨（配合 objectURL 复用修复）。
          if (local) {
            // 🔴 2026-08-30 stale 修复：网络同步成功时必须清掉 stale 标记（IndexedDB 恢复时打的）。
            //    否则本会话内该皮肤永远带着 stale → 优先默认皮/全量预热全部跳过它，
            //    「网络已确认存在的皮肤」反而不进缓存。stale 仅在「IndexedDB 旧缓存恢复」场景为 true。
            local.stale = !!opts.stale;
            if (!local.url) { local.url = url; local.path = null; local.remote = true; }
          }
        } else {
          localSkins.push({ name: skinName, url: url, path: null, loaded: true, remote: true, stale: !!opts.stale });
          addedCount++;
        }
      }
    }
    return addedCount;
  }
  // 从 IndexedDB 旧缓存恢复（弱网/离线兜底用）：标记为 stale，不参与预热请求，避免对线上已删除的旧皮肤发起 404 请求
  function _applyRegistryStale(heroesObj) {
    return _applyRegistry(heroesObj, { stale: true });
  }
  // 远端注册表同步成功后，剔除「纯 stale 孤儿」：某英雄在远端 registry 中不存在、且当前皮肤列表全部来自旧缓存(stale)，
  // 说明该英雄线上已删除/改名 → 直接整组移除，避免渲染层对不存在的 .skin 发起 404 请求。
  function _purgeStaleOrphans(remoteHeroes) {
    try {
      var remoteKeys = remoteHeroes ? Object.keys(remoteHeroes) : [];
      var remoteSet = {}; remoteKeys.forEach(function (k) { remoteSet[k] = true; });
      for (var hn in window.skinRegistry) {
        if (!Object.prototype.hasOwnProperty.call(window.skinRegistry, hn)) continue;
        var list = window.skinRegistry[hn];
        if (!Array.isArray(list) || !list.length) { delete window.skinRegistry[hn]; continue; }
        if (remoteSet[hn]) continue; // 远端有该英雄（不会全是孤儿，保留）
        // 远端无此英雄：若整组都是 stale（来自旧缓存），判定为孤儿，移除
        var allStale = list.every(function (s) { return !!s.stale; });
        if (allStale) {
          console.log('[SKIN-WEB] 剔除已下线的旧缓存英雄:', hn, '(' + list.length + ' 个皮肤)');
          delete window.skinRegistry[hn];
        }
      }
    } catch (e) { console.warn('[SKIN-WEB] purge stale orphans failed:', e); }
  }

  // 拉取同源注册表 + 融合/属性表；成功后缓存 registry 到 IndexedDB（下次刷新即使全挂也能显示）
  async function _syncRemoteRegistry() {
    console.log('[SKIN-WEB] 拉取皮肤注册表(同源):', REMOTE_SKIN_REGISTRY_URL);
    var resp = await _fetchJsonWithFallback('/registry.json');
    if (!resp) { console.warn('[SKIN-WEB] 同源注册表拉取失败（保留 IndexedDB/旧缓存兜底）'); return false; }
    var registry = await resp.json();
    if (!registry || !registry.heroes) return false;
    var added = _applyRegistry(registry.heroes);
    if (added > 0) console.log('[SKIN-WEB] 合并', added, '个皮肤');
    // 🔴 远端注册表是事实来源：登录后清除 IndexedDB 旧缓存恢复的「纯 stale 孤儿」
    // （如已删除/改名的「融合仓库」等线上不存在的英雄），避免残留 stale 条目在渲染时仍发起 404 请求。
    _purgeStaleOrphans(registry.heroes);
    // 存 IndexedDB，供离线/弱网刷新兜底（registry 拉不到也能用上次清单 + 已缓存皮肤图）
    try { await _idbPut('skin:registry', new Blob([JSON.stringify(registry)], { type: 'application/json' })); } catch (e) {}
    // 🔴 预热「绝不 await」「绝不挤占首屏」：可见卡片立即触发；全量 low 并发 idle 启动
    // 🔴 2026-08-30 优先默认皮：网络注册表刚确认（stale 已清）→ 立即拉 20 个常用英雄默认皮（并发6），
    //    冷缓存首开也秒有一批醒目皮肤；随后可见预热（并发4）+ 空闲全量预热（并发2）逐步铺满 27MB。
    setTimeout(function () { try { _preheatPriorityDefaults(); } catch (e) {} }, 0);
    setTimeout(function () { try { _preheatVisibleSkins(); } catch (e) {} }, 0);
    var _idleStart = (typeof window.requestIdleCallback === 'function')
      ? function (fn) { window.requestIdleCallback(fn, { timeout: 5000 }); }
      : function (fn) { setTimeout(fn, 1500); }; // 不支持 idle 时延后启动，给首屏足够时间
    _idleStart(function () { try { _preheatSkins(window.skinRegistry, { concurrency: 2 }); } catch (e) {} });
    // 拉取融合卡定义（云端 fusions.json，管理员维护）
    try {
      var fResp = await _fetchJsonWithFallback('/fusions.json');
      if (fResp && fResp.ok) {
        var fData = await fResp.json();
        if (fData && fData.fusions) {
          window.cloudFusions = fData.fusions;
          console.log('[SKIN-WEB] cloud fusions loaded:', Object.keys(fData.fusions).length);
        }
      }
    } catch (fe) { console.warn('[SKIN-WEB] load fusions.json failed:', fe); }
    // 拉取皮肤属性表（云端 skin-attributes.json，管理员维护）
    try {
      var aResp = await _fetchJsonWithFallback('/skin-attributes.json');
      if (aResp && aResp.ok) {
        var aData = await aResp.json();
        window.skinAttributesCloud = aData || {};
        console.log('[SKIN-WEB] skin-attributes.json loaded, heroes:', Object.keys(aData || {}).length);
      }
    } catch (ae) { console.warn('[SKIN-WEB] load skin-attributes.json failed:', ae); }
    return true;
  }

  // 缓存 sync 的 promise，让 resolve* 调用可 await 注册表就绪（解决首屏皮肤不显示的时序问题）
  var _syncInFlight = false;
  var _syncPromise = null;
  function _ensureSynced() {
    // 已有 registry（含 IndexedDB 恢复来的）→ 立即就绪，绝不阻塞首屏
    if (window.skinRegistry && Object.keys(window.skinRegistry).length) {
      // 即使命中本地缓存，也异步补拉一次远端注册表：
      // ① 修复「IndexedDB 缓存的 registry 是旧版（如不含新英雄水人）→ 首屏解析新英雄为 null → 显示诡异/刷新出问题」；
      // ② 远端 sync 成功会把新英雄补进 registry 并触发 reapplyAllSkins 重绘，无需手动设置。
      if (!_syncInFlight) { _startSync().catch(function () {}); }
      return Promise.resolve();
    }
    if (_syncInFlight) return _syncPromise;
    return _startSync();
  }
  async function _startSync() {
    if (_syncInFlight) return _syncPromise;
    _syncInFlight = true;
    _syncPromise = (async function () {
      try {
        var ok = await _syncRemoteRegistry();
        if (!ok) {
          // 🔴 失败不永久锁定：清空 promise，下次调用（或用户刷新）可重试 —— 修复「一次失败整轮刷新全不显示」
          _syncInFlight = false;
          _syncPromise = null;
        }
      } catch (e) {
        console.warn('[SKIN-WEB] syncRemoteRegistry() failed:', String(e).slice(0, 200));
        _syncInFlight = false;
        _syncPromise = null;
      } finally {
        // 无论成功失败都重刷一次：修复「远端失败时皮肤不重刷导致加载卡住不显示」的概率问题
        try { if (typeof window.reapplyAllSkins === 'function') await window.reapplyAllSkins(); } catch (e2) {}
      }
    })();
    return _syncPromise;
  }
  // 兼容旧接口（app-core.js 可能直接调 window.syncRemoteSkins）
  async function syncRemoteSkins(force) {
    if (force) { _syncInFlight = false; _syncPromise = null; }
    return _ensureSynced();
  }

  function getHeroSkinUrl(heroName, skinName) {
    var mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
    var parsed = getBaseHeroName(mainName);
    var baseHero = parsed.heroName;
    var skins = window.skinRegistry[baseHero];
    if (!skins || !skins.length) return null;
    var userSel = window.heroSkinSelections[baseHero];
    if (skinName !== undefined && skinName !== null) {
      if (skinName === '') return null;
      var skin = findSkin(skins, skinName);
      return skin ? (skin.url || null) : null;
    }
    if (userSel === '') return null;
    var target = userSel || parsed.skinName;
    var sk = target ? findSkin(skins, target) : null;
    return sk ? (sk.url || null) : (skins[0].url || null);
  }

  async function resolveHeroSkinInfo(heroName, skinName) {
    await _ensureSynced();
    var mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
    var parsed = getBaseHeroName(mainName);
    var baseHero = parsed.heroName;
    var skins = window.skinRegistry[baseHero];
    if (!skins || !skins.length) return null;
    // 注意：绝不在此把 parsed.skinName（卡名里「·」前的皮肤标签）写入 heroSkinSelections！
    // 否则「天蓬元帅·钢鬃」会把「天蓬元帅」误锁成「钢鬃」的全局默认皮肤并持久化，
    // 导致所有同名英雄默认皮错乱。默认皮肤只应由用户显式选择（selectHeroSkin）写入。
    var userSel = window.heroSkinSelections[baseHero];
    var target = skinName || (userSel !== undefined && userSel !== '' ? userSel : null) || parsed.skinName;
    if (target === null || target === undefined || target === '') {
      var defaultSkin = findSkin(skins, baseHero) || findSkin(skins, heroName);
      if (defaultSkin) target = defaultSkin.name;
      if (userSel === '') target = (defaultSkin ? defaultSkin.name : (skins[0] ? skins[0].name : null));
    }
    if (target === null || target === undefined || target === '') return null;
    var skin = findSkin(skins, target);
    var entry = skin || findSkin(skins, baseHero) || skins[0];
    if (!entry) return null;
    if (entry.url) {
      var cachedUrl = await _getCachedSkinUrl(entry.url);
      return { url: cachedUrl, name: entry.name, path: entry.path };
    }
    return null;
  }

  async function resolveHeroSkinUrl(heroName, skinName) {
    await _ensureSynced();
    var info = await resolveHeroSkinInfo(heroName, skinName);
    return info ? info.url : null;
  }

  function getHeroSkins(heroName) {
    if (heroName && typeof heroName === 'string' && heroName.startsWith('融合')) return [];
    var mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
    var baseHero = getBaseHeroName(mainName).heroName;
    return window.skinRegistry[baseHero] || [];
  }

  function findSkin(skins, name) {
    for (var i = 0; i < skins.length; i++) { if (skins[i].name === name) return skins[i]; }
    return null;
  }

  function selectHeroSkin(heroName, skinName) {
    var mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
    var baseHero = getBaseHeroName(mainName).heroName;
    window.heroSkinSelections[baseHero] = skinName;
    try {
      var all = JSON.parse(localStorage.getItem('tdjl_heroSkinSelections') || '{}');
      if (skinName === null || skinName === undefined) delete all[baseHero];
      else all[baseHero] = skinName;
      localStorage.setItem('tdjl_heroSkinSelections', JSON.stringify(all));
    } catch (e) {}
  }

  function loadSkinSelections() {
    try {
      window.heroSkinSelections = JSON.parse(localStorage.getItem('tdjl_heroSkinSelections') || '{}');
    } catch (e) {
      window.heroSkinSelections = {};
    }
    // 一次性迁移：修复「皮肤·英雄」卡名把皮肤标签误锁成英雄默认皮的脏数据。
    // 旧版本会把 parsed.skinName 写入 heroSkinSelections 并持久化，导致默认皮肤普遍错乱。
    // 置位标记后只清一次，清空后所有英雄默认皮回到「英雄同名那张」，用户可按需重新显式选默认。
    try {
      if (!localStorage.getItem('tdjl_skinfix_v1')) {
        localStorage.removeItem('tdjl_heroSkinSelections');
        window.heroSkinSelections = {};
        localStorage.setItem('tdjl_skinfix_v1', '1');
        console.log('[SKIN] 已重置默认皮肤选择（修复带·卡名误锁默认皮的回归）');
      }
    } catch (e) { /* ignore */ }
  }

  window.resolveHeroSkinUrl = resolveHeroSkinUrl;
  window.resolveHeroSkinInfo = resolveHeroSkinInfo;
  window.getHeroSkinUrl = getHeroSkinUrl;
  window.getHeroSkins = getHeroSkins;
  window.selectHeroSkin = selectHeroSkin;
  window.loadSkinSelections = loadSkinSelections;
  window.syncRemoteSkins = syncRemoteSkins;
  window._ensureSynced = _ensureSynced; // 供默认项目加载后兜底重刷融合皮肤（await 皮肤索引就绪）

  // 🔴 2026-08-30 网页版手动「更新皮肤资源」入口：全量重建缓存（优先英雄排前，后台进行不阻塞 UI）。
  //    此前网页版点「更新皮肤资源」= 清光 IndexedDB + 只重拉 registry 索引 → 皮肤图全部丢失、
  //    靠懒加载一张张回填，用户看到的就是「越更新皮肤越没了」。
  window._webPreheatAll = function (concurrency) {
    try {
      _priorityDefaultsStarted = false; _preheatPriorityDefaults(); // 先秒拉 20 个默认皮
      _preheatSkins(window.skinRegistry, { concurrency: concurrency || 6 }); // 再全量铺（优先英雄在前）
    } catch (e) { console.warn('[SKIN-WEB] webPreheatAll failed:', e); }
  };
  // 🔴 2026-08-30 网页版皮肤缓存安全重置（供「皮肤修复」）：先关旧连接再删库，避免
  //    deleteDatabase 被活跃连接 blocked 挂起（旧 clearSkinIdbCache 直删 → 库删不干净 +
  //    _skinDbPromise 还攥着旧连接 → 之后所有 _idbGet 静默失败 → 皮肤永久消失直到刷新）。
  //    同时 revoke 全部 objectURL，让 reapply 后全部走「新库 + 网络重拉」的干净路径。
  window._webSkinCacheReset = async function () {
    try {
      for (var k in _objectUrlCache) { try { URL.revokeObjectURL(_objectUrlCache[k]); } catch (e) {} }
      _objectUrlCache = {};
      try { var db = await _openSkinDb(); if (db && db.close) db.close(); } catch (e) {}
      _skinDbPromise = null; // 下次访问重新建库
      if (window.indexedDB) {
        await new Promise(function (r) {
          var req = indexedDB.deleteDatabase(SKIN_DB_NAME);
          req.onsuccess = r; req.onerror = r; req.onblocked = r;
        });
      }
      console.log('[SKIN-WEB] 皮肤缓存已安全重置（关连接→删库→待重建）');
      return true;
    } catch (e) { console.warn('[SKIN-WEB] skin cache reset failed:', e); return false; }
  };

  // 🔴 皮肤加载进度条（s1.0.102）：让用户直观看到"已加载 X / 共 Y，剩余 Z"，判断是卡住还是正常加载中
  // 用法：var p = window.showSkinLoadProgress(containerEl, total, '🎨 皮肤加载中');
  //       p.step(); // 每完成一张调一次；自动更新文字与进度条，done===total 时淡出
  //       p.fail(); // 异常时也能正确收尾
  window.showSkinLoadProgress = function (containerEl, total, label) {
    label = label || '🎨 皮肤加载中';
    if (!containerEl) return { step: function () {}, fail: function () {} };
    var bar = containerEl.querySelector(':scope > .skin-load-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'skin-load-bar';
      bar.innerHTML = '<div class="skin-load-track"><div class="skin-load-fill"></div></div>' +
                      '<div class="skin-load-text"></div>';
      containerEl.insertBefore(bar, containerEl.firstChild);
    }
    var fill = bar.querySelector('.skin-load-fill');
    var text = bar.querySelector('.skin-load-text');
    var done = 0;
    var finished = false;
    function render() {
      var pct = total > 0 ? Math.round((done / total) * 100) : 100;
      fill.style.width = pct + '%';
      var remain = Math.max(0, total - done);
      text.textContent = label + ' ' + done + ' / ' + total + '（剩余 ' + remain + '）';
      if (done >= total && !finished) {
        finished = true;
        text.textContent = '✅ 皮肤已就绪 ' + total + ' / ' + total;
        setTimeout(function () { bar.classList.add('skin-load-hidden'); }, 600);
      }
    }
    render();
    return {
      step: function () { done++; render(); },
      fail: function () { done++; render(); }, // 失败也推进，避免进度卡死在 99%
      setTotal: function (t) { total = t; render(); }
    };
  };

  // 启动：恢复已选皮肤 + 从 IndexedDB 恢复上次缓存的皮肤清单（弱网/离线也能立即渲染）
  loadSkinSelections();
  (async function _restoreRegistryCache() {
    try {
      var cached = await _idbGet('skin:registry');
      if (cached && cached.blob) {
        var text = await cached.blob.text();
        var data = JSON.parse(text);
        if (data && data.heroes) {
          _applyRegistryStale(data.heroes);
          console.log('[SKIN-WEB] 已从 IndexedDB 恢复皮肤清单:', Object.keys(window.skinRegistry).length, '英雄（弱网/离线兜底）');
          try { if (typeof window.reapplyAllSkins === 'function') window.reapplyAllSkins(); } catch (e) {}
        }
      }
    } catch (e) {}
  })();
  _ensureSynced();
  // 兜底：页面 load 后再触发一次皮肤重刷，确保异步渲染出来的卡片也能补上皮肤
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { if (typeof window.reapplyAllSkins === 'function') window.reapplyAllSkins(); } catch (e) {}
        try { _preheatVisibleSkins(); } catch (e) {} // 首屏渲染完，补当前可见英雄皮肤缓存
      }, 1200);
    });
  }
})();
