// ============================================================
// loader.js — 阶段2/2.5 按需懒加载器
// 首屏必需模块由 index.html 的 <script defer> 负责并行预载；
// 本文件处理"按需懒加载"的模块（皮肤制作器 / 阵容识别 / 深海统计）。
//   - preload:false（如 skinmaker）：纯按需，首次用到才拉。
//   - preload:true（如 recognize/deepsea）：空闲预载，它们自己会创建入口 UI。
// ============================================================
(function () {
  // 兜底映射（manifest 拉取失败时使用）
  const FALLBACK = {
    skinmaker: { src: 'app-skinmaker.js', v: '1', preload: false },
    recognize: { src: 'recognize.js', v: '8', preload: true },
    deepsea: { src: 'app-deepsea.js', v: '1', preload: true }
  };
  const loaded = Object.create(null);
  const loading = Object.create(null);
  let manifestCache = null;

  function getLazyMap() {
    if (manifestCache) return Promise.resolve(manifestCache);
    return fetch('modules.manifest.json?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        const map = (m && m.lazy) ? m.lazy : FALLBACK;
        manifestCache = map;
        return map;
      })
      .catch(function () { manifestCache = FALLBACK; return FALLBACK; });
  }

  // 全局懒加载接口：window.loadModule('recognize') -> Promise
  window.loadModule = function (name) {
    if (loaded[name]) return Promise.resolve();
    if (loading[name]) return loading[name];
    loading[name] = getLazyMap().then(function (map) {
      const info = map[name] || FALLBACK[name];
      if (!info) throw new Error('unknown lazy module: ' + name);
      return new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = info.src + (info.v ? '?v=' + info.v : '');
        s.async = false; // 保持执行顺序（皮肤制作器无依赖，但保持惯例）
        s.onload = function () { loaded[name] = true; delete loading[name]; resolve(); };
        s.onerror = function () { delete loading[name]; reject(new Error('load failed: ' + name)); };
        document.body.appendChild(s);
      });
    });
    return loading[name];
  };

  // 空闲预载需要常驻的懒加载模块（它们自己会创建入口 UI，不能纯按需）
  function preloadLazy() {
    getLazyMap().then(function (map) {
      Object.keys(map).forEach(function (name) {
        if (map[name] && map[name].preload) {
          try { window.loadModule(name); } catch (e) { console.warn('[loader] preload fail', name, e); }
        }
      });
    });
  }
  function schedulePreload() {
    var run = function () {
      if (window.requestIdleCallback) window.requestIdleCallback(preloadLazy);
      else setTimeout(preloadLazy, 200);
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run);
  }
  schedulePreload();
})();
