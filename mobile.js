/* ==========================================================================
   mobile.js —— 手机版交互增强（按钮收进抽屉 / 触摸友好）
   --------------------------------------------------------------------------
   背景：桌面版把 12 个工具按钮铺成 3 行彩色方块，手机上横向溢出、视觉噪音大。
   做法：宽 <= 700px 时，把这些按钮「搬」进一个底部抽屉，顶栏只留 ☰。
        按钮是原节点移动（不是克隆），onclick 与 JS 引用全部保持有效。
   ========================================================================== */
(function () {
  'use strict';

  var MQ = window.matchMedia('(max-width: 700px)');
  var drawer = null;
  var moved = [];   // { node, parent, next } 记录原位置，退出移动端时还原

  function shortLabel(btn) {
    var t = (btn.getAttribute('title') || '').trim();
    if (!t) t = (btn.textContent || '').trim();
    t = t.replace(/[（(].*?[)）]/g, '').replace(/[:：].*$/, '').trim();
    if (t.length > 5) t = t.slice(0, 5);
    return t || '工具';
  }

  /* 把按钮搬进抽屉：包一层 .m-tool 加文字标签 */
  function moveToGrid(btn, grid) {
    if (!btn || btn.dataset.mMoved === '1') return;
    var raw = (btn.textContent || '').trim();
    var isTextBtn = raw.length > 2;   // 「导入」「刷新」这类文字按钮，不再重复加标签

    var wrap = document.createElement('div');
    wrap.className = 'm-tool' + (isTextBtn ? ' m-tool--text' : '');
    var label = document.createElement('span');
    label.className = 'm-tool-label';
    label.textContent = shortLabel(btn);
    // 记录原位置，便于还原
    moved.push({ node: wrap, parent: btn.parentNode, next: btn.nextSibling, btn: btn });
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);
    if (!isTextBtn) wrap.appendChild(label);
    btn.dataset.mMoved = '1';
    btn.classList.add('m-tool-btn');
    grid.appendChild(wrap);
  }

  function buildDrawer() {
    if (drawer) return drawer;

    drawer = document.createElement('div');
    drawer.id = 'mDrawer';
    drawer.className = 'm-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<div class="m-drawer-mask" data-close="1"></div>' +
      '<div class="m-drawer-panel" role="dialog" aria-label="工具面板">' +
        '<div class="m-drawer-handle"></div>' +
        '<div class="m-drawer-head">' +
          '<span class="m-drawer-title">工具</span>' +
          '<button class="m-drawer-close" data-close="1" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="m-drawer-body">' +
          '<div class="m-drawer-group" data-group="tool"><div class="m-drawer-glabel">阵容工具</div><div class="m-drawer-grid" id="mGridTool"></div></div>' +
          '<div class="m-drawer-group" data-group="app"><div class="m-drawer-glabel">功能</div><div class="m-drawer-grid" id="mGridApp"></div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(drawer);

    drawer.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-close') === '1') closeDrawer();
      // 点按钮后自动收起，方便看到效果
      if (e.target && e.target.closest && e.target.closest('.m-tool-btn')) {
        setTimeout(closeDrawer, 120);
      }
    });

    return drawer;
  }

  function openDrawer() {
    buildDrawer();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('m-drawer-open');
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('m-drawer-open');
  }

  /* 卡组标题「👤 我的卡组（7格） 洗炼总减伤:0.51 [下拉]」在 185px 宽度里放不下，
     把开头那段纯文本包成 span，让它独占一行，减伤+下拉换到第二行。 */
  function splitCardGroupTitle() {
    Array.prototype.forEach.call(document.querySelectorAll('.battle-column h4'), function (h4) {
      if (h4.dataset.mSplit === '1') return;
      var first = h4.firstChild;
      if (first && first.nodeType === 3 && first.textContent.trim()) {
        var span = document.createElement('span');
        span.className = 'm-h4-title';
        span.textContent = first.textContent.trim();
        h4.replaceChild(span, first);
        h4.dataset.mSplit = '1';
      }
    });
  }

  function addTrigger() {    if (document.getElementById('mToolTrigger')) return;
    var host = document.getElementById('scheme1');
    if (!host) return;
    var row = host.firstElementChild || host;

    var btn = document.createElement('button');
    btn.id = 'mToolTrigger';
    btn.className = 'm-tool-trigger';
    btn.type = 'button';
    btn.setAttribute('aria-label', '打开工具面板');
    btn.innerHTML = '<span class="m-trigger-ico">☰</span><span class="m-trigger-text">工具</span>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openDrawer();
    });
    row.appendChild(btn);
  }

  function collect() {
    var gridTool = document.getElementById('mGridTool');
    var gridApp = document.getElementById('mGridApp');
    if (!gridTool || !gridApp) return;

    // ① 项目栏里的所有工具按钮（搜索/保存/阵容库/导入导出…），保留 3 个下拉和"更多 ⋮"
    var schemeBtns = document.querySelectorAll('#scheme1 button');
    Array.prototype.forEach.call(schemeBtns, function (b) {
      if (b.id === 'mToolTrigger') return;
      // ⋮ 是项目操作菜单，留在外面更顺手
      if ((b.textContent || '').trim() === '⋮') return;
      moveToGrid(b, gridTool);
    });

    // ② 右上角悬浮功能按钮（公告/邀请码/监控等），☰ 保留在原位当主菜单
    var stickyBtns = document.querySelectorAll('.sticky-buttons button');
    Array.prototype.forEach.call(stickyBtns, function (b) {
      var txt = (b.textContent || '').trim();
      if (txt === '☰') return;
      if (b.style.display === 'none') return;   // Tauri 专属按钮在网页里本来就隐藏
      moveToGrid(b, gridApp);
    });

    // 分组空了就藏掉
    Array.prototype.forEach.call(document.querySelectorAll('.m-drawer-group'), function (g) {
      var grid = g.querySelector('.m-drawer-grid');
      if (grid && grid.children.length === 0) g.style.display = 'none';
    });
  }

  /* 免责声明块：桌面跟在主内容后面，手机上一屏装不下，会直接把下方卡池顶出屏幕。
     部分旧 WebView 不支持 CSS :has()，所以这里用 JS 兜底（CSS 里也留了一份）。 */
  function hideDisclaimer() {
    var sc = document.getElementById('scrollableContent');
    if (!sc) return;
    Array.prototype.forEach.call(sc.children, function (el) {
      if (el.dataset.mHideChecked === '1') return;
      var h4 = el.querySelector && el.querySelector('h4');
      if (h4 && /免责声明|免责/.test(h4.textContent || '')) {
        el.style.setProperty('display', 'none', 'important');
        el.dataset.mHideChecked = '1';
      }
    });
  }

  function apply() {
    buildDrawer();
    splitCardGroupTitle();
    hideDisclaimer();
    collect();
    addTrigger();
    document.body.classList.add('m-mobile');
  }

  function revert() {
    document.body.classList.remove('m-mobile');
    closeDrawer();
    var trigger = document.getElementById('mToolTrigger');
    if (trigger) trigger.remove();
    // 还原按钮位置
    moved.forEach(function (rec) {
      try {
        if (rec.next && rec.next.parentNode === rec.parent) {
          rec.parent.insertBefore(rec.node, rec.next);
        } else {
          rec.parent.appendChild(rec.node);
        }
        // 把按钮从 wrapper 里拔出来放回原父级
        var btn = rec.btn;
        if (btn && btn.parentNode && btn.parentNode.classList.contains('m-tool')) {
          var wrap = btn.parentNode;
          wrap.parentNode.insertBefore(btn, wrap);
          wrap.remove();
        }
        btn.classList.remove('m-tool-btn');
        delete btn.dataset.mMoved;
      } catch (e) {}
    });
    moved = [];
  }

  function sync() {
    if (MQ.matches) {
      // apply 内部每一步都做了幂等判断，可安全重复调用
      // （主界面由 app-core 异步渲染，首次 boot 时 h4/按钮可能还不存在，必须再跑一次）
      apply();
    } else if (document.body.classList.contains('m-mobile')) {
      revert();
    }
  }

  // 等主界面渲染完再动 DOM（主内容由 app-core 异步构建）
  function boot() {
    sync();
    if (MQ.addEventListener) MQ.addEventListener('change', sync);
    else if (MQ.addListener) MQ.addListener(sync);
    // 登录后 mainContent 才可见，监听一次 class 变化
    var mc = document.getElementById('mainContent');
    if (mc && window.MutationObserver) {
      var ob = new MutationObserver(function () {
        if (mc.classList.contains('visible')) { sync(); }
      });
      ob.observe(mc, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 600); });
  } else {
    setTimeout(boot, 600);
  }

  // 暴露给调试
  window.__mDrawer = { open: openDrawer, close: closeDrawer, sync: sync };
})();
