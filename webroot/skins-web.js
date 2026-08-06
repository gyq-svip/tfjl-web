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

  var REMOTE_SKIN_BASE = 'https://gyq-svip.github.io/tfjl-web/skins';
  var REMOTE_SKIN_BASE_FALLBACK = 'https://gyq-svip.github.io/tfjl-web/skins';
  var REMOTE_SKIN_REGISTRY_URL = REMOTE_SKIN_BASE + '/registry.json';
  var REMOTE_SKIN_FUSIONS_URL = REMOTE_SKIN_BASE + '/fusions.json';

  window.skinRegistry = {};       // { 英雄名: [{ name, url, path }] }
  window.heroSkinSelections = {};  // { 英雄名: 皮肤名 }

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

  // 获取皮肤 blob URL（网页版：IndexedDB 优先，未命中则 fetch 并回写）
  async function _getCachedSkinUrl(remoteUrl) {
    if (!remoteUrl) return null;
    if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;
    var key = 'skin:' + remoteUrl;
    var cached = await _idbGet(key);
    if (cached && cached.blob) {
      try { return URL.createObjectURL(cached.blob); }
      catch (e) { console.warn('[SKIN-WEB] createObjectURL failed:', e); }
    }
    try {
      var resp = await fetch(remoteUrl, { cache: 'force-cache' });
      if (!resp.ok) return remoteUrl;
      var blob = await resp.blob();
      _idbPut(key, blob);
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[SKIN-WEB] fetch skin failed:', remoteUrl, e);
      return remoteUrl;
    }
  }

  // 后台批量预热（网页版：下载到 IndexedDB）
  var _preheatStarted = false;
  async function _preheatSkins(heroes) {
    if (_preheatStarted) return;
    _preheatStarted = true;
    var count = 0;
    for (var heroName in (heroes || {})) {
      if (!Object.prototype.hasOwnProperty.call(heroes, heroName)) continue;
      var skinList = heroes[heroName];
      if (!Array.isArray(skinList)) continue;
      for (var i = 0; i < skinList.length; i++) {
        var s = skinList[i];
        var url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(s.file || (s.name + '.png'));
        _getCachedSkinUrl(url).catch(function () {});
        count++;
        if (count % 20 === 0) await new Promise(function (r) { setTimeout(r, 30); });
      }
    }
    console.log('[SKIN-WEB] Preheat queued:', count, 'skins');
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
      var resp = await fetch(REMOTE_SKIN_REGISTRY_URL, { cache: 'no-cache' });
      if (!resp.ok) {
        console.warn('[SKIN-WEB] Remote registry not found (HTTP ' + resp.status + '), skins disabled');
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
          var remoteUrl = REMOTE_SKIN_BASE + '/' + encodeURIComponent(hn) + '/' + encodeURIComponent(remoteSkin.file || (skinName + '.png'));
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
      // 拉取融合卡定义（云端 fusions.json，管理员维护）
      try {
        var fResp = await fetch(REMOTE_SKIN_FUSIONS_URL, { cache: 'no-cache' });
        if (fResp.ok) {
          var fData = await fResp.json();
          if (fData && fData.fusions) {
            window.cloudFusions = fData.fusions;
            console.log('[SKIN-WEB] cloud fusions loaded:', Object.keys(fData.fusions).length);
          }
        }
      } catch (fe) { console.warn('[SKIN-WEB] load fusions.json failed:', fe); }
      // 拉取皮肤属性表（云端 skin-attributes.json，管理员维护，随 git_push_skins 推送）
      try {
        var aResp = await fetch(REMOTE_SKIN_BASE + '/skin-attributes.json', { cache: 'no-cache' });
        if (aResp.ok) {
          var aData = await aResp.json();
          window.skinAttributesCloud = aData || {};
          console.log('[SKIN-WEB] skin-attributes.json loaded, heroes:', Object.keys(aData || {}).length);
        }
      } catch (ae) { console.warn('[SKIN-WEB] load skin-attributes.json failed:', ae); }
      _preheatSkins(registry.heroes);
      try {
        if (typeof window.reapplyAllSkins === 'function') {
          window.reapplyAllSkins();
          console.log('[SKIN-WEB] 触发皮肤重刷');
        }
      } catch (e) { console.warn('[SKIN-WEB] 皮肤重刷失败:', e); }
    } catch (e) {
      console.warn('[SKIN-WEB] syncRemoteSkins() failed:', String(e).slice(0, 200));
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

  // 启动：恢复已选皮肤并拉取远程皮肤注册表
  loadSkinSelections();
  _ensureSynced();
  // 兜底：页面 load 后再触发一次皮肤重刷，确保异步渲染出来的卡片也能补上皮肤
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { if (typeof window.reapplyAllSkins === 'function') window.reapplyAllSkins(); } catch (e) {}
      }, 1200);
    });
  }
})();
