/* ============================================================================
 * admin-ctl.js — 管理员工具箱（定向指令通道）
 * ----------------------------------------------------------------------------
 * 职责：前端只读「管理员指令 Gist」(ADMIN_CTL_GIST_ID)，根据其中针对本设备的
 *       指令执行操作：强制刷新 / 飘屏通知 / 双向会话 / 拉黑锁机。
 *
 * 设计原则：
 *  - 纯只读 + 本地执行，前端绝不主动写指令 Gist（写权只属于管理员手工编辑）。
 *  - 指令由管理员在 Gist 里按 deviceId 定向投放，离线设备上线首跳即可收到（带 expire）。
 *  - 每条指令有唯一 id，处理过即记 localStorage，避免重复弹窗/重复刷新。
 *  - 普通用户永远不会看到飘窗（除非管理员定向推），拉黑只针对异常/搞破坏设备。
 *
 * 指令 Gist 结构（admin_ctl.json）：
 * {
 *   "v": "20260828-1",
 *   "pollSec": 300,                       // 心跳拉取间隔（管理员可远程调）
 *   "latestSwVersion": "s1.0.392",        // 最新 SW 小版本，Rust/前端比对本机自动升级
 *   "forceReload": { "to": "device_xxx"|"all", "ts": 1693270000000 },
 *   "cmds": {
 *     "device_xxx": [
 *       { "id":"c1","type":"notify","title":"升级通知","body":"你需要升级","level":"warn",
 *         "actions":["ok"], "expire":1694000000000,
 *         "thread":[ {"from":"admin","ts":..,"text":".."} ] },
 *       { "id":"c2","type":"block","reason":"请联系管理员","level":"error",
 *         "expire":1694000000000 }
 *     ]
 *   },
 *   "blacklist": { "device_xxx": { "reason":"请联系管理员","until":1694000000000|"forever" } }
 * }
 * ==========================================================================*/
(function () {
  'use strict';

  // ⚠️ 这个 Gist 由管理员手工创建并维护（专用于指令，纯键值对，几 KB）。
  //    创建后把 ID 填到这里即可生效。
  const ADMIN_CTL_GIST_ID = 'a45529be1fcb5f32a96dc49feaa422a0';
  const ADMIN_CTL_FILE = 'admin_ctl.json';

  // 本地已处理指令缓存（去重，避免重复弹/重复刷新）
  const ACK_KEY = 'tfjl_adminctl_ack';
  function _loadAck() {
    try { return JSON.parse(localStorage.getItem(ACK_KEY) || '{}'); } catch (e) { return {}; }
  }
  function _markAck(id) {
    try {
      const a = _loadAck();
      a[id] = Date.now();
      localStorage.setItem(ACK_KEY, JSON.stringify(a));
      try { sessionStorage.setItem('tfjl_adminctl_ackguard@' + id, '1'); } catch (e) {}
    } catch (e) {}
  }
  function _isAcked(id) {
    try { if (sessionStorage.getItem('tfjl_adminctl_ackguard@' + id)) return true; } catch (e) {}
    return !!_loadAck()[id];
  }
  // 会话级防重已统一由 _markAck（写 sessionStorage）+ _isAcked（读 sessionStorage）负责，_setRguard/_isRguard 废弃删除。

  // 设备身份
  function _devId() { try { return (typeof getDeviceId === 'function') ? getDeviceId() : ''; } catch (e) { return ''; } }
  function _nick() {
    try {
      return (typeof _myNick === 'function' ? _myNick() : '') || localStorage.getItem('TFJL_UserName') || window.__currentNickname || '';
    } catch (e) { return ''; }
  }

  // 拉取指令 Gist（与全站其他开关同源：getGistToken()+fetch，不依赖 AllianceDB 独立脚本）
  async function fetchAdminCtl() {
    const id = ADMIN_CTL_GIST_ID;
    if (!id || id.indexOf('REPLACE_') === 0) return null;
    try {
      const token = (typeof getGistToken === 'function') ? getGistToken() : '';
      if (!token) { console.warn('[adminCtl] 无 token，跳过拉取'); return null; }
      const r = await fetch(`https://api.github.com/gists/${id}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'token ' + token }
      });
      if (!r.ok) { console.warn('[adminCtl] 拉取指令失败:', r.status); return null; }
      const g = await r.json();
      const f = g && g.files && g.files[ADMIN_CTL_FILE];
      if (!f || !f.content) return null;
      return JSON.parse(f.content);
    } catch (e) {
      console.warn('[adminCtl] 拉取指令失败:', e && e.message);
      return null;
    }
  }

  // 处理针对本设备的指令
  async function applyAdminCtl(ctl) {
    if (!ctl) return;
    const dev = _devId();
    if (!dev) return;

    // 0) 远程重启（APP 版主路径由 Rust 心跳处理 app.restart；这里仅前端兜底 reload）
    if (ctl.restart && ctl.restart.to) {
      const tgt = ctl.restart.to;
      const rAck = 'restart@' + (ctl.restart.ts || '1');
      // 防循环：localStorage 去重 + sessionStorage 防本会话重复 reload（硬刷新偶发清 localStorage 时不至于死循环）
      if ((tgt === 'all' || tgt === dev) && !_isAcked(rAck)) {
        _markAck(rAck);
        console.log('[adminCtl] 收到重启指令，前端兜底 reload（APP 版由 Rust restart 生效）');
        setTimeout(() => location.reload(), 600);
      }
    }

    // 1) 全局强制刷新
    if (ctl.forceReload && ctl.forceReload.ts) {
      const tgt = ctl.forceReload.to;
      const fAck = 'forceReload@' + ctl.forceReload.ts;
      const expired = ctl.forceReload.expire && Date.now() > ctl.forceReload.expire;
      if (!expired && (tgt === 'all' || tgt === dev) && !_isAcked(fAck)) {
        _markAck(fAck);
        if (typeof window.__tfjlForceRefresh === 'function') {
          window.__tfjlForceRefresh('管理员强制刷新');
        } else {
          setTimeout(() => location.reload(), 800);
        }
      }
    }

    // 2) 比版本自动升级（latestSwVersion）
    if (ctl.latestSwVersion) {
      try {
        const cur = (document.getElementById('versionTag') || {}).textContent || '';
        const curNum = parseInt((cur.match(/s1\.0\.(\d+)/) || [])[1] || '0', 10);
        const newNum = parseInt((ctl.latestSwVersion.match(/s1\.0\.(\d+)/) || [])[1] || '0', 10);
        if (newNum > curNum && !_isAcked('verUp@' + ctl.latestSwVersion)) {
          _markAck('verUp@' + ctl.latestSwVersion);
          if (typeof window.__tfjlForceRefresh === 'function') window.__tfjlForceRefresh('检测到新版本 ' + ctl.latestSwVersion);
          else setTimeout(() => location.reload(), 800);
        }
      } catch (e) {}
    }

    // 3) 拉黑 / 锁机（最高优先，遮罩盖住一切）
    const bl = ctl.blacklist && ctl.blacklist[dev];
    if (bl) {
      const until = bl.until;
      const expired = until && until !== 'forever' && Date.now() > until;
      if (!expired) { _showBlockOverlay(bl.reason || '请联系管理员'); return; }
    } else {
      // 已解封 / 指令里没有该设备：立刻移除残留遮罩（否则解封后刷新仍显示限制中）
      _hideBlockOverlay();
    }

    // 4) 定向指令（notify / 会话）
    const list = (ctl.cmds && ctl.cmds[dev]) || [];
    for (const cmd of list) {
      if (!cmd || !cmd.id) continue;
      const expired = cmd.expire && Date.now() > cmd.expire;
      if (expired) { _markAck(cmd.id); continue; }
      if (_isAcked(cmd.id)) continue;
      if (cmd.type === 'notify') {
        _showNotify(cmd);
        _markAck(cmd.id);
      }
    }
  }

  // —— 飘窗通知 UI ——
  function _showNotify(cmd) {
    // 清掉上一次的自动消失计时器（避免重复弹时堆积）
    if (window.__adminCtlNotifyTimer) { clearTimeout(window.__adminCtlNotifyTimer); window.__adminCtlNotifyTimer = null; }
    const level = cmd.level || 'info';
    // 浅底深字配色：高对比、清晰可读（文字/输入框都随 level 取色）
    const colors = {
      info:   { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', icon: 'ℹ️', fg: '#1e3a8a', accent: '#2563eb', line: '#bfdbfe' },
      warn:   { bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', icon: '⚠️', fg: '#92400e', accent: '#d97706', line: '#fde68a' },
      error:  { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', icon: '⛔', fg: '#991b1b', accent: '#dc2626', line: '#fecaca' }
    }[level] || { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', icon: 'ℹ️', fg: '#1e3a8a', accent: '#2563eb', line: '#bfdbfe' };

    let box = document.getElementById('adminCtlNotify');
    if (!box) {
      box = document.createElement('div');
      box.id = 'adminCtlNotify';
      box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;max-width:340px;' +
        'background:' + colors.bg + ';color:' + colors.fg + ';border-radius:14px;padding:16px 18px;' +
        'box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:system-ui,"Microsoft YaHei",sans-serif;' +
        'border:1px solid ' + colors.line + ';' +
        'animation:adminCtlFloat 3s ease-in-out infinite;cursor:default;';
      box.innerHTML = '<style>@keyframes adminCtlFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}</style>';
      document.body.appendChild(box);
    }
    box.style.background = colors.bg;
    box.style.color = colors.fg;
    box.style.border = '1px solid ' + colors.line;

    // thread：历史的对话气泡（若指令带 thread 才显示）；回复框始终显示，方便用户随时回消息
    const threadHtml = (cmd.thread || []).map(t =>
      '<div style="font-size:0.72rem;opacity:0.9;margin:4px 0;border-left:2px solid ' + colors.accent + ';padding-left:6px;">' +
      '<b>' + (t.from === 'admin' ? '管理员' : '我') + ':</b> ' + _esc(t.text || '') + '</div>'
    ).join('');
    const hasThread = cmd.thread && cmd.thread.length > 0;

    box.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        '<div style="font-size:1.4rem;line-height:1;">' + colors.icon + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:0.95rem;margin-bottom:4px;">' + _esc(cmd.title || '通知') + '</div>' +
          '<div style="font-size:0.82rem;line-height:1.5;opacity:1;">' + _esc(cmd.body || '') + '</div>' +
          (hasThread ? '<div style="margin-top:8px;">' + threadHtml + '</div>' : '') +
          '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;">' +
            (cmd.actions && cmd.actions.indexOf('ok') >= 0 ?
              '<button onclick="window.__adminCtlAck(\'' + cmd.id + '\')" style="background:#fff;color:' + colors.fg + ';border:1px solid ' + colors.line + ';padding:5px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600;">知道了</button>' : '') +
            // 回复框：始终显示，让每条通知都能回文字（无论是否带 thread）
            '<input id="adminCtlReply" placeholder="回复管理员…" style="flex:1;min-width:0;background:#fff;color:' + colors.fg + ';border:1px solid ' + colors.accent + ';border-radius:8px;padding:5px 8px;font-size:0.78rem;">' +
            '<button onclick="window.__adminCtlReply(\'' + cmd.id + '\')" style="background:' + colors.accent + ';color:#fff;border:1px solid ' + colors.accent + ';padding:5px 10px;border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:600;">发送</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    box.style.display = 'block';
    // 自动消失：8 秒后淡出移除（除非用户正在输入回复，避免误关丢消息）
    const _autoHide = () => {
      const inp = document.getElementById('adminCtlReply');
      if (inp && inp.value && inp.value.trim()) return; // 正在输入则不关
      box.style.transition = 'opacity .4s ease';
      box.style.opacity = '0';
      setTimeout(() => { if (box && box.parentNode) box.remove(); }, 420);
    };
    window.__adminCtlNotifyTimer = setTimeout(_autoHide, 8000);
  }

  // 点击「知道了」
  window.__adminCtlAck = function (id) {
    _markAck(id);
    const box = document.getElementById('adminCtlNotify');
    if (box) box.style.display = 'none';
  };
  // 会话回复（回写设备本地 ack + 标记待上报，下次心跳带上）
  window.__adminCtlReply = function (id) {
    const inp = document.getElementById('adminCtlReply');
    const text = inp ? inp.value.trim() : '';
    if (!text) return;
    try {
      const pend = JSON.parse(localStorage.getItem('tfjl_adminctl_reply') || '{}');
      pend[id] = { ts: Date.now(), text: text, nick: _nick(), dev: _devId() };
      localStorage.setItem('tfjl_adminctl_reply', JSON.stringify(pend));
    } catch (e) {}
    _markAck(id);
    const box = document.getElementById('adminCtlNotify');
    if (box) box.style.display = 'none';
    // 触发一次诊断上报，把回复带回（诊断 Gist 会带上 pending replies）
    if (typeof window.__tfjlForceDiagPush === 'function') window.__tfjlForceDiagPush();
  };

  // —— 拉黑锁机遮罩（soft：不退出，只显示联系管理员）——
  function _showBlockOverlay(reason) {
    let ov = document.getElementById('adminCtlBlock');
    if (ov) return; // 已显示
    ov = document.createElement('div');
    ov.id = 'adminCtlBlock';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,10,15,0.96);' +
      'display:flex;align-items:center;justify-content:center;flex-direction:column;' +
      'font-family:system-ui,"Microsoft YaHei",sans-serif;color:#fff;text-align:center;padding:24px;';
    ov.innerHTML =
      '<div style="font-size:3rem;margin-bottom:16px;">🔒</div>' +
      '<div style="font-size:1.3rem;font-weight:700;margin-bottom:12px;color:#f87171;">访问已被限制</div>' +
      '<div style="font-size:0.95rem;line-height:1.7;max-width:420px;opacity:0.9;">' +
        _esc(reason || '请联系管理员解除限制。') + '</div>' +
      '<div style="margin-top:20px;font-size:0.8rem;opacity:0.6;">如需恢复访问，请联系管理员处理。</div>';
    document.body.appendChild(ov);
    // 拦截所有交互
    ov.addEventListener('click', (e) => e.stopPropagation());
    ov.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', _blockKey, true);
  }
  function _blockKey(e) { e.preventDefault(); e.stopPropagation(); }
  // 解封时移除遮罩 + 卸载键盘拦截，恢复页面交互
  function _hideBlockOverlay() {
    const ov = document.getElementById('adminCtlBlock');
    if (ov) ov.remove();
    document.removeEventListener('keydown', _blockKey, true);
  }

  function _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 启动：定时拉取（Web 版用 setTimeout 自调度，APP 版由 Rust 心跳唤醒）
  let _pollTimer = null;
  let _lastPollSec = 300; // 默认 5 分钟；管理员可在工具箱设 pollSec 远程调，读取后下次生效
  function startAdminCtlPoll() {
    if (_pollTimer) return;
    const loop = () => {
      fetchAdminCtl().then(ctl => {
        if (ctl && ctl.pollSec && ctl.pollSec >= 10 && ctl.pollSec !== _lastPollSec) {
          _lastPollSec = ctl.pollSec; // 应用远程新间隔（≥10s 防抖，避免误设 0 把 GitHub 打爆）
          console.log('[adminCtl] 心跳间隔已更新为 ' + _lastPollSec + 's');
        }
        applyAdminCtl(ctl);
      }).catch(() => {});
      _pollTimer = setTimeout(loop, _lastPollSec * 1000);
    };
    loop();
  }

  // 暴露给 Rust 心跳 emit 调用（APP 版：Rust 拉到指令后 show 窗口 + 调此函数）
  window.__adminCtlApply = function (ctl) { applyAdminCtl(ctl); };

  // 供内部调用的两个桩（避免硬编码依赖 app-core 私有函数）：
  //  - 强制刷新：触发 SW 升级 / 硬刷新。优先走 SW 的 skipWaiting 路径（若暴露），否则直接 reload。
  window.__tfjlForceRefresh = function (reason) {
    console.log('[adminCtl] 强制刷新:', reason);
    try {
      const ack = JSON.parse(localStorage.getItem(ACK_KEY) || '{}');
      Object.keys(ack).forEach(k => { try { sessionStorage.setItem('tfjl_adminctl_ackguard@' + k, '1'); } catch (e) {} });
    } catch (e) {}
    try { location.reload(true); } catch (e) { location.reload(); }
  };
  //  - 立即诊断上报：复用 app-core 的 _pushDiagReport（若已定义），否则标记待上报由下次心跳带出。
  window.__tfjlForceDiagPush = function () {
    try {
      if (typeof _pushDiagReport === 'function') { _pushDiagReport().catch(() => {}); return; }
    } catch (e) {}
    console.log('[adminCtl] 触发诊断上报（_pushDiagReport 不可用，依赖下次心跳）');
  };

  // 监听 Rust 心跳 emit 的 admin-ctl 事件（APP 版专属通道，Web 版无此事件）
  if (typeof window.__TAURI__ !== 'undefined' || typeof window.__TAURI_INTERNALS__ !== 'undefined') {
    try {
      // Tauri v2 事件监听：@tauri-apps/api/event 的 listen 异步；这里用全局注入的简化版
      if (typeof window.__tauriListen === 'function') {
        window.__tauriListen('admin-ctl', (e) => { try { applyAdminCtl(e.payload); } catch (err) {} });
      } else if (window.addEventListener) {
        // 兜底：Tauri 在 window 上派发自定义事件（部分版本通过 webview 直接 dispatch）
        window.addEventListener('admin-ctl', (e) => { try { applyAdminCtl(e.detail); } catch (err) {} });
      }
    } catch (e) {}
  }

  window.AdminCtl = { fetchAdminCtl, applyAdminCtl, startAdminCtlPoll };

  // Web 版自动启动轮询（APP 版由 Rust 接管，此处无害）
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(startAdminCtlPoll, 3000);
    } else {
      document.addEventListener('DOMContentLoaded', () => setTimeout(startAdminCtlPoll, 3000));
    }
  }
})();
