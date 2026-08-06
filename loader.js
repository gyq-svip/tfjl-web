// ============================================================
// loader.js — 阶段2 按需懒加载器
// 首屏必需模块由 index.html 的 <script defer> 负责并行预载；
// 本文件只处理"按需懒加载"的模块（如皮肤制作器 app-skinmaker.js），
// 首次用到时才拉取并注入，减少首屏加载体积。
// ============================================================
(function () {
  // 兜底映射（manifest 拉取失败时使用）
  const FALLBACK = { skinmaker: { src: 'app-skinmaker.js', v: '1' } };
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

  // 全局懒加载接口：window.loadModule('skinmaker') -> Promise
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
})();
