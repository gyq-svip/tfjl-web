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

  // 多源皮肤加载（国内快）：jsDelivr(CDN，镜像 GitHub 仓库，无需 token，国内有节点) 优先，GitHub Pages 兜底。
  // 网页端不能带 Gitee token（会泄露），故只用公开源；任一失败自动切下一个。
  // 想加 Gitee raw 兜底：在数组追加 'https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/raw/<分支>/skins'
  var SKIN_SOURCES = [
    'https://cdn.jsdelivr.net/gh/gyq-svip/tfjl-web@main/skins',
    'https://gyq-svip.github.io/tfjl-web/skins'
  ];
  var REMOTE_SKIN_BASE = SKIN_SOURCES[0];
  var REMOTE_SKIN_REGISTRY_URL = REMOTE_SKIN_BASE + '/registry.json';
  var REMOTE_SKIN_FUSIONS_URL = REMOTE_SKIN_BASE + '/fusions.json';

  window.skinRegistry = {};       // { 英雄名: [{ name, url, path }] }
  window.heroSkinSelections = {};  // { 英雄名: 皮肤名 }

  // 王城低配版阵容优先预热（用户主阵容，开项目秒开）：这些英雄皮肤先拉
  var PRIORITY_HEROES = new Set(['水灵','萌萌','咕咕','钢鬃','木精灵','光精灵','幻精灵','火炮射线','小野酋长','死神海妖','火炮','风灵','死神','骨弓','电法','铁骑','悟空','魂精灵','魔精灵']);

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

  // 获取皮肤 blob URL（网页版：IndexedDB 优先，源无关缓存；未命中则按多源顺序 fetch 并回写）
  async function _getCachedSkinUrl(remoteUrl) {
    if (!remoteUrl) return null;
    if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;
    // 从 URL 解析 hero/file（与源无关），保证切换皮肤源后缓存仍命中、不重复下载
    var m = remoteUrl.match(/\/skins\/([^/]+?)\/([^/]+)$/);
    if (!m) return remoteUrl; // 非标准皮肤 URL，原样返回
    var hero = decodeURIComponent(m[1]);
    var file = decodeURIComponent(m[2]);
    var key = 'skin:' + hero + '/' + file;
    var cached = await _idbGet(key);
    if (cached && cached.blob) {
      try { return URL.createObjectURL(cached.blob); }
      catch (e) { console.warn('[SKIN-WEB] createObjectURL failed:', e); }
    }
    // 未命中：按 SKIN_SOURCES 顺序逐个尝试（jsDelivr → GitHub Pages），首个成功即缓存返回
    for (var si = 0; si < SKIN_SOURCES.length; si++) {
      var url = SKIN_SOURCES[si] + '/' + encodeURIComponent(hero) + '/' + encodeURIComponent(file);
      try {
        var ctrl = new AbortController();
        var _timer = setTimeout(function () { ctrl.abort(); }, 12000);
        var resp;
        try { resp = await fetch(url, { cache: 'force-cache', signal: ctrl.signal }); }
        catch (e) { clearTimeout(_timer); continue; }
        clearTimeout(_timer);
        if (!resp.ok) continue;
        var blob = await resp.blob();
        _idbPut(key, blob);
        return URL.createObjectURL(blob);
      } catch (e) {
        console.warn('[SKIN-WEB] 皮肤源加载失败，尝试下一个:', url, e);
      }
    }
    return remoteUrl; // 全部源失败：退回原 URL，由浏览器自行处理
  }

  // 多源拉取 JSON（registry/fusions/attributes），任一源成功即返回 Response，全失败返回 null
  async function _fetchJsonWithFallback(relPath) {
    for (var si = 0; si < SKIN_SOURCES.length; si++) {
      try {
        var resp = await fetch(SKIN_SOURCES[si] + relPath, { cache: 'no-cache' });
        if (resp.ok) return resp;
      } catch (e) { /* 尝试下一个源 */ }
    }
    return null;
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
  function _preheatVisibleSkins() {
    if (_preheatVisibleStarted) return;
    _preheatVisibleStarted = true;
    try {
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

  // 从 GitHub Pages 拉取远程皮肤注册表
  var _remoteSkinSynced = false;
  var _syncPromise = null;
  // 缓存 syncRemoteSkins 的 promise，让 resolve* 调用可 await 注册表就绪（解决首屏皮肤不显示的时序问题）
  function _ensureSynced() {
    if (!_syncPromise) _syncPromise = syncRemoteSkins();
    return _syncPromise;
  }
  async function syncRemoteSkins(force) {
    if (_remoteSkinSynced && !force) return;
    _remoteSkinSynced = true;
    console.log('[SKIN-WEB] syncRemoteSkins() fetching registry from:', REMOTE_SKIN_REGISTRY_URL);
    try {
      var resp = await _fetchJsonWithFallback('/registry.json');
      if (!resp) {
        console.warn('[SKIN-WEB] Remote registry 拉取失败（所有源均不可用），skins disabled');
        return;
      }
      var registry = await resp.json();
      console.log('[SKIN-WEB] Remote registry loaded, version:', registry.version, 'heroes:', Object.keys(registry.heroes || {}).length);
      if (!registry.heroes) return;

      var addedCount = 0;
      for (var hn in registry.heroes) {
        if (!Object.prototype.hasOwnProperty.call(registry.heroes, hn)) continue;
        var skinList = registry.heroes[hn];
        if (!Array.isArray(skinList)) continue;
        if (!window.skinRegistry[hn]) window.skinRegistry[hn] = [];
        var localSkins = window.skinRegistry[hn];
        var localNames = {};
        for (var k = 0; k < localSkins.length; k++) localNames[localSkins[k].name] = true;
        for (var j = 0; j < skinList.length; j++) {
          var remoteSkin = skinList[j];
          var skinName = remoteSkin.name;
          if (!skinName) continue;
          var remoteUrl = REMOTE_SKIN_BASE + '/' + encodeURIComponent(hn) + '/' + encodeURIComponent(remoteSkin.file || (skinName + '.skin'));
          if (localNames[skinName]) {
            var local = null;
            for (var m = 0; m < localSkins.length; m++) { if (localSkins[m].name === skinName) { local = localSkins[m]; break; } }
            if (local && !local.url && !local.path) local.url = remoteUrl;
          } else {
            localSkins.push({ name: skinName, url: remoteUrl, path: null, loaded: true, remote: true });
            addedCount++;
          }
        }
      }
      if (addedCount > 0) console.log('[SKIN-WEB] added', addedCount, 'remote skins');
      // 🔴 s1.0.101 关键修正：预热「绝不 await」——注册表索引就绪即代表 sync 完成，
      // 首屏渲染（resolveHeroSkinInfo）只依赖索引，不再被 410 张全量预热拖死。
      // 全量预热改为后台 fire-and-forget；可见卡片预热立刻触发（优先填充当前屏幕）。
      setTimeout(function () {
        try {
          _preheatVisibleSkins();                                   // 先补当前可见英雄
          _preheatSkins(registry.heroes, { concurrency: 3 });        // 再低压后台补全量缓存
        } catch (e) {}
      }, 0);
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
      // 拉取皮肤属性表（云端 skin-attributes.json，管理员维护，随 git_push_skins 推送）
      try {
        var aResp = await _fetchJsonWithFallback('/skin-attributes.json');
        if (aResp && aResp.ok) {
          var aData = await aResp.json();
          window.skinAttributesCloud = aData || {};
          console.log('[SKIN-WEB] skin-attributes.json loaded, heroes:', Object.keys(aData || {}).length);
        }
      } catch (ae) { console.warn('[SKIN-WEB] load skin-attributes.json failed:', ae); }
      _preheatSkins(registry.heroes);
    } catch (e) {
      console.warn('[SKIN-WEB] syncRemoteSkins() failed:', String(e).slice(0, 200));
    } finally {
      // 无论远端是否拉取成功都重刷一次：修复「远端失败时皮肤不重刷导致加载卡住不显示」的概率问题
      try { if (typeof window.reapplyAllSkins === 'function') await window.reapplyAllSkins(); } catch(e2) {}
    }
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

  // 启动：恢复已选皮肤并拉取远程皮肤注册表
  loadSkinSelections();
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
