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
      // 兜底：sessionStorage 跨 reload 保留，防止 localStorage 在 reload 边界丢失导致防重失效（刷新风暴根因）
      try { sessionStorage.setItem('tfjl_adminctl_ackguard@' + id, '1'); } catch (e) {}
    } catch (e) {}
  }
  function _isAcked(id) {
    // 双重判定：sessionStorage 优先（reload 后仍存活），localStorage 兜底
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

  // ==================== 版本门槛管控（低于最低要求版本 → 弹窗提示升级）====================
  // 设计：内置默认门槛（预埋在前端，永久生效）+ admin_ctl Gist 远程字段覆盖（不改代码即可开关/调门槛）。
  //   · minExeVersion             最低要求的桌面 exe 版本，如 "2.0.25"；低于此版本弹升级提示
  //   · minExeVersionMsg          自定义提示语（可留空）
  //   · minExeVersionSnoozeHours  点「稍后提醒」后间隔几小时再提示（默认 4）
  //   · minExeVersionDownloadUrl  手动下载兜底地址（留空则自动解析最新安装包）
  // 只对桌面端（Tauri）生效；网页版 / 取不到版本号一律不打扰，避免误弹。
  const BUILTIN_MIN_EXE_VERSION = '2.0.25';
  const MIN_VER_SNOOZE_KEY = 'tfjl_minver_snooze';
  const DEFAULT_SNOOZE_HOURS = 4;
  const GITEE_RELEASES_PAGE = 'https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases';

  // 语义化版本比较：a>b 返回 1，a==b 返回 0，a<b 返回 -1
  // （按位数字比较，避免 "2.0.9" > "2.0.25" 的字符串比较坑）
  function _cmpVer(a, b) {
    try {
      const pa = String(a || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
      const pb = String(b || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
      }
      return 0;
    } catch (e) { return 0; }
  }

  // 取本地 exe 版本（仅桌面端；网页版 / 取不到返回 ''）
  async function _localExeVersion() {
    try {
      const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
      if (!isTauri) return '';
      if (window.__TAURI__ && window.__TAURI__.app && typeof window.__TAURI__.app.getVersion === 'function') {
        const v = await window.__TAURI__.app.getVersion();
        if (v && /^v?\d+\.\d+/.test(v)) return v.replace(/^v/, '');
      }
      if (typeof window.__APP_VERSION === 'string' && /^v?\d+\.\d+/.test(window.__APP_VERSION)) {
        return window.__APP_VERSION.replace(/^v/, '');
      }
    } catch (e) {}
    return '';
  }

  async function _checkMinExeVersion(ctl) {
    try {
      const cur = await _localExeVersion();
      if (!cur) return;                                          // 网页版 / 取不到版本 → 不打扰
      const minV = (ctl && ctl.minExeVersion) ? String(ctl.minExeVersion).replace(/^v/, '') : BUILTIN_MIN_EXE_VERSION;
      if (!minV || !/^\d+\.\d+/.test(minV)) return;              // 门槛为空 / 非法 → 不启用
      if (_cmpVer(cur, minV) >= 0) return;                       // 版本达标 → 不提示
      let snoozeUntil = 0;
      try { snoozeUntil = parseInt(localStorage.getItem(MIN_VER_SNOOZE_KEY + '@' + minV) || '0', 10); } catch (e) {}
      if (snoozeUntil && Date.now() < snoozeUntil) return;        // 仍在「稍后提醒」冷却期
      const hours = (ctl && ctl.minExeVersionSnoozeHours > 0) ? ctl.minExeVersionSnoozeHours : DEFAULT_SNOOZE_HOURS;
      _showMinVersionDialog(cur, minV, (ctl && ctl.minExeVersionMsg) || '', hours, (ctl && ctl.minExeVersionDownloadUrl) || '');
    } catch (e) {}
  }

  function _showMinVersionDialog(curVer, minVer, msg, snoozeHours, dlUrl) {
    if (document.getElementById('adminCtlMinVer')) return;       // 已弹过，不叠加
    const box = document.createElement('div');
    box.id = 'adminCtlMinVer';
    box.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(10,10,15,0.72);' +
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,"Microsoft YaHei",sans-serif;padding:20px;';
    const bodyHtml = (msg ? _esc(msg) + '<br><br>' : '') +
      '当前版本：<b style="color:#f87171;">v' + _esc(curVer) + '</b><br>' +
      '要求版本：<b style="color:#4ade80;">v' + _esc(minVer) + ' 及以上</b><br><br>' +
      '<span style="opacity:0.75;">旧版本可能存在已知问题，建议尽快升级。</span>';
    box.innerHTML =
      '<div style="max-width:400px;width:100%;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;' +
      'border-radius:16px;padding:22px 20px;box-shadow:0 18px 50px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.12);">' +
        '<div style="font-size:1.12rem;font-weight:700;margin-bottom:12px;color:#fbbf24;">⚠️ 版本过低，请升级</div>' +
        '<div style="font-size:0.86rem;line-height:1.75;opacity:0.92;">' + bodyHtml + '</div>' +
        '<div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button id="minVerUpgradeBtn" style="flex:1;min-width:104px;background:#22c55e;color:#fff;border:none;padding:10px 12px;border-radius:9px;cursor:pointer;font-size:0.82rem;font-weight:700;">⬆️ 立即升级</button>' +
          '<button id="minVerDlBtn" style="flex:1;min-width:104px;background:#2563eb;color:#fff;border:none;padding:10px 12px;border-radius:9px;cursor:pointer;font-size:0.82rem;font-weight:700;">📥 手动下载</button>' +
          '<button id="minVerLaterBtn" style="flex:1;min-width:104px;background:rgba(255,255,255,0.14);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:10px 12px;border-radius:9px;cursor:pointer;font-size:0.82rem;">稍后提醒</button>' +
        '</div>' +
        '<div style="margin-top:10px;font-size:0.66rem;opacity:0.5;text-align:center;">点「稍后提醒」将 ' + snoozeHours + ' 小时后再提示一次</div>' +
      '</div>';
    document.body.appendChild(box);
    const close = function () { if (box && box.parentNode) box.remove(); };

    // 【立即升级】复用 exe 整包更新通道（后台静默下载 + 自动重启完成升级）
    document.getElementById('minVerUpgradeBtn').onclick = function () {
      const btn = this;
      btn.textContent = '⏳ 升级中…'; btn.disabled = true;
      const invoke = function (cmd) {
        if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) return window.__TAURI__.core.invoke(cmd);
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) return window.__TAURI_INTERNALS__.invoke(cmd);
        if (window.__TAURI__ && window.__TAURI__.invoke) return window.__TAURI__.invoke(cmd);
        return Promise.reject('no invoke');
      };
      invoke('install_app_update').catch(function (e) {
        const m = (typeof e === 'string') ? e : ((e && e.message) ? e.message : '');
        btn.textContent = '⬆️ 立即升级'; btn.disabled = false;
        try { alert('自动升级失败' + (m ? '：' + m : '') + '\n\n请点「手动下载」获取安装包。'); } catch (_) {}
      });
    };
    // 【手动下载】兜底：远程配置地址 → version.json 动态解析最新安装包 → Gitee 发布页
    document.getElementById('minVerDlBtn').onclick = function () {
      const open = function (u) {
        try { if (window.__TAURI__ && window.__TAURI__.shell && typeof window.__TAURI__.shell.open === 'function') { window.__TAURI__.shell.open(u); return; } } catch (e) {}
        try { if (window.__TAURI__ && window.__TAURI__.opener && typeof window.__TAURI__.opener.openUrl === 'function') { window.__TAURI__.opener.openUrl(u); return; } } catch (e) {}
        try { window.open(u, '_blank'); } catch (e) {}
      };
      if (dlUrl) { open(dlUrl); return; }
      fetch('https://gyq-svip.github.io/tfjl-web/version.json?t=' + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (d) { open((d && d.downloadUrl) || GITEE_RELEASES_PAGE); })
        .catch(function () { open(GITEE_RELEASES_PAGE); });
    };
    // 【稍后提醒】N 小时内不再弹
    document.getElementById('minVerLaterBtn').onclick = function () {
      try { localStorage.setItem(MIN_VER_SNOOZE_KEY + '@' + minVer, String(Date.now() + snoozeHours * 3600 * 1000)); } catch (e) {}
      close();
    };
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
      // 🔴 2026-08-30 补 expire 门控：新下发的 restart 自带 24h 有效期（工具箱 toolboxSend 自动加），
      //    过期即失效。旧指令无 expire 时维持原行为（无限期，防重仍由 ack 双检兜住，只重启一次）。
      //    若不过期检查，restart 会永远留在 Gist 里：任何清缓存/换新设备的用户上线都会中招一次。
      const rExpired = ctl.restart.expire && Date.now() > ctl.restart.expire;
      // 防重：_isAcked 已含 sessionStorage 双检（reload 后仍生效），同一 ts 只执行 1 次
      if (!rExpired && (tgt === 'all' || tgt === dev) && !_isAcked(rAck)) {
        _markAck(rAck);
        console.log('[adminCtl] 收到重启指令，前端兜底 reload（APP 版由 Rust restart 生效）');
        // 🔴 2026-09-04：正在编辑（阵容输入框有内容/正在输入/项目未保存）→ 延后到编辑结束再重启，绝不打断
        const _doRestart = function () { location.reload(); };
        if (typeof window.__tfjlRunWhenNotEditing === 'function') {
          window.__tfjlRunWhenNotEditing(_doRestart, '管理员重启指令');
        } else {
          setTimeout(_doRestart, 600);
        }
      }
    }

    // 1) 全局强制刷新
    if (ctl.forceReload && ctl.forceReload.ts) {
      const tgt = ctl.forceReload.to;
      const fAck = 'forceReload@' + ctl.forceReload.ts;
      // expire 为可选：管理员工具箱生成指令时自动加 24h 有效期（见 toolboxSendForceReload）。
      // 缺 expire 时退化为「无限有效」，但下方 _isAcked 双检（sessionStorage+localStorage）保证同一设备只刷一次，不会连环刷。
      const expired = ctl.forceReload.expire && Date.now() > ctl.forceReload.expire;
      if (!expired && (tgt === 'all' || tgt === dev) && !_isAcked(fAck)) {
        _markAck(fAck);
        // 复用现有强制刷新逻辑（如有），否则直接 reload
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

    // 2.5) 🔴 版本门槛：低于最低要求版本 → 弹窗提示升级（可关闭 + 定时提醒，不阻断使用）
    _checkMinExeVersion(ctl);

    // 4) 定向指令（notify / 会话）
    const list = (ctl.cmds && ctl.cmds[dev]) || [];
    for (const cmd of list) {
      if (!cmd || !cmd.id) continue;
      const expired = cmd.expire && Date.now() > cmd.expire;
      if (expired) { _markAck(cmd.id); continue; }
      // 防重：_isAcked 含 sessionStorage 双检，同一 cmd.id 只弹 1 次（reload 后仍生效）
      if (_isAcked(cmd.id)) continue;
      if (cmd.type === 'notify') {
        _showNotify(cmd);
        _markAck(cmd.id);
      }
    }
  }

  // —— 飘屏通知 UI（弹幕式：屏幕内随机方向匀速飘动，碰到边缘反弹）——
  // 交互：鼠标悬停 / 输入框聚焦 / 拖动时自动暂停飘动（否则点不到按钮、打不了字）；
  //       可拖动到任意位置，松手后换随机方向继续飘；右上角 ✕ 关闭。
  function _showNotify(cmd) {
    // 清理上一次：计时器 + 动画帧 + 残留 DOM + 全局监听（避免多次下发时堆叠/多重监听）
    if (window.__adminCtlNotifyTimer) { clearTimeout(window.__adminCtlNotifyTimer); window.__adminCtlNotifyTimer = null; }
    _unbindNotifyDrag();
    const old = document.getElementById('adminCtlNotify');
    if (old && old.parentNode) old.remove();

    const level = cmd.level || 'info';
    // 浅底深字配色：高对比、清晰可读（文字/输入框都随 level 取色）
    const colors = {
      info:   { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', icon: 'ℹ️', fg: '#1e3a8a', accent: '#2563eb', line: '#bfdbfe' },
      warn:   { bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', icon: '⚠️', fg: '#92400e', accent: '#d97706', line: '#fde68a' },
      error:  { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', icon: '⛔', fg: '#991b1b', accent: '#dc2626', line: '#fecaca' }
    }[level] || { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', icon: 'ℹ️', fg: '#1e3a8a', accent: '#2563eb', line: '#bfdbfe' };

    const box = document.createElement('div');
    box.id = 'adminCtlNotify';
    box.style.cssText = 'position:fixed;z-index:99999;max-width:330px;left:0;top:0;' +
      'background:' + colors.bg + ';color:' + colors.fg + ';border-radius:14px;padding:14px 16px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:system-ui,"Microsoft YaHei",sans-serif;' +
      'border:1px solid ' + colors.line + ';cursor:grab;user-select:none;' +
      'transition:box-shadow .2s ease,opacity .4s ease;';

    // thread：历史对话气泡（指令带 thread 才显示）
    const threadHtml = (cmd.thread || []).map(t =>
      '<div style="font-size:0.72rem;opacity:0.9;margin:4px 0;border-left:2px solid ' + colors.accent + ';padding-left:6px;">' +
      '<b>' + (t.from === 'admin' ? '管理员' : '我') + ':</b> ' + _esc(t.text || '') + '</div>'
    ).join('');
    const hasThread = cmd.thread && cmd.thread.length > 0;

    box.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        '<div style="font-size:1.3rem;line-height:1;">' + colors.icon + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
            '<div style="font-weight:700;font-size:0.95rem;flex:1;min-width:0;">' + _esc(cmd.title || '通知') + '</div>' +
            '<button onclick="window.__adminCtlClose()" title="关闭" style="background:transparent;border:none;color:' + colors.fg + ';opacity:.5;cursor:pointer;font-size:1rem;line-height:1;padding:0 2px;">✕</button>' +
          '</div>' +
          '<div style="font-size:0.82rem;line-height:1.5;">' + _esc(cmd.body || '') + '</div>' +
          (hasThread ? '<div style="margin-top:8px;">' + threadHtml + '</div>' : '') +
          '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;">' +
            (cmd.actions && cmd.actions.indexOf('ok') >= 0 ?
              '<button onclick="window.__adminCtlAck(\'' + cmd.id + '\')" style="background:#fff;color:' + colors.fg + ';border:1px solid ' + colors.line + ';padding:5px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600;">知道了</button>' : '') +
            // 回复框：始终显示，让每条通知都能回文字（无论是否带 thread）
            '<input id="adminCtlReply" placeholder="回复管理员…" style="flex:1;min-width:0;background:#fff;color:' + colors.fg + ';border:1px solid ' + colors.accent + ';border-radius:8px;padding:5px 8px;font-size:0.78rem;user-select:text;">' +
            '<button onclick="window.__adminCtlReply(\'' + cmd.id + '\')" style="background:' + colors.accent + ';color:#fff;border:1px solid ' + colors.accent + ';padding:5px 10px;border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:600;">发送</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px;font-size:0.64rem;opacity:.5;text-align:center;">悬停/输入时暂停飘动 · 可拖动</div>';
    document.body.appendChild(box);

    // ===== 弹幕运动：随机初始位置 + 随机方向匀速飘，撞到视口边缘反弹 =====
    const SPEED = 52; // px/s（柔和，不晃眼）
    let x = 0, y = 0, vx = 0, vy = 0, lastTs = 0;
    let paused = false, dragging = false, dragOffX = 0, dragOffY = 0;

    function _clampPos(nx, ny) {
      const w = box.offsetWidth, h = box.offsetHeight;
      return {
        x: Math.max(0, Math.min(Math.max(0, window.innerWidth  - w - 6), nx)),
        y: Math.max(0, Math.min(Math.max(0, window.innerHeight - h - 6), ny))
      };
    }
    function _randomDir() {
      // 随机角度；避免过于水平/垂直，视觉上更"飘"
      const ang = Math.random() * Math.PI * 2;
      vx = Math.cos(ang) * SPEED;
      vy = Math.sin(ang) * SPEED;
      if (Math.abs(vx) < SPEED * 0.28) vx = (vx < 0 ? -1 : 1) * SPEED * 0.28;
      if (Math.abs(vy) < SPEED * 0.28) vy = (vy < 0 ? -1 : 1) * SPEED * 0.28;
    }
    // 初始位置：随机落在视口内
    const p0 = _clampPos(Math.random() * Math.max(1, window.innerWidth  - box.offsetWidth  - 6),
                         Math.random() * Math.max(1, window.innerHeight - box.offsetHeight - 6));
    x = p0.x; y = p0.y;
    _randomDir();
    box.style.left = x + 'px';
    box.style.top  = y + 'px';

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(64, ts - lastTs) / 1000; // 限幅：切后台回来不跳飞
      lastTs = ts;
      if (!paused && !dragging && box.parentNode) {
        x += vx * dt;
        y += vy * dt;
        const w = box.offsetWidth, h = box.offsetHeight;
        const maxX = Math.max(0, window.innerWidth  - w - 6);
        const maxY = Math.max(0, window.innerHeight - h - 6);
        // 撞墙反弹
        if (x <= 0)    { x = 0;    vx =  Math.abs(vx); }
        if (x >= maxX) { x = maxX; vx = -Math.abs(vx); }
        if (y <= 0)    { y = 0;    vy =  Math.abs(vy); }
        if (y >= maxY) { y = maxY; vy = -Math.abs(vy); }
        box.style.left = x + 'px';
        box.style.top  = y + 'px';
      }
      window.__adminCtlNotifyRaf = requestAnimationFrame(tick);
    }
    window.__adminCtlNotifyRaf = requestAnimationFrame(tick);

    // ===== 交互：悬停 / 输入 / 拖动 时暂停，拖动可移位 =====
    box.addEventListener('mouseenter', () => { paused = true; box.style.boxShadow = '0 16px 46px rgba(0,0,0,0.34)'; });
    box.addEventListener('mouseleave', () => { if (!dragging) { paused = false; box.style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)'; } });
    // 输入框聚焦时暂停（鼠标移开去打字也不会飘走）
    box.addEventListener('focusin',  (e) => { if (e.target && e.target.id === 'adminCtlReply') paused = true; });
    box.addEventListener('focusout', (e) => { if (e.target && e.target.id === 'adminCtlReply' && !dragging) paused = false; });

    const onDown = (e) => {
      if (e.target && /^(BUTTON|INPUT|TEXTAREA)$/.test(e.target.tagName)) return; // 点控件不拖
      dragging = true;
      dragOffX = e.clientX - x;
      dragOffY = e.clientY - y;
      box.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = _clampPos(e.clientX - dragOffX, e.clientY - dragOffY);
      x = p.x; y = p.y;
      box.style.left = x + 'px';
      box.style.top  = y + 'px';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      box.style.cursor = 'grab';
      _randomDir(); // 松手换个随机方向继续飘
      paused = false;
    };
    const onResize = () => {
      const p = _clampPos(x, y);
      x = p.x; y = p.y;
      box.style.left = x + 'px'; box.style.top = y + 'px';
    };
    box.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('resize', onResize);
    window.__adminCtlNotifyDragUnbind = function () {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', onResize);
      if (window.__adminCtlNotifyRaf) { cancelAnimationFrame(window.__adminCtlNotifyRaf); window.__adminCtlNotifyRaf = null; }
    };

    // 自动消失：30s 后淡出；若用户正在看（悬停/输入/拖动）则延后重试，避免误关丢消息
    const _autoHide = () => {
      const inp = document.getElementById('adminCtlReply');
      const typing = inp && inp.value && inp.value.trim();
      if (paused || dragging || typing) { window.__adminCtlNotifyTimer = setTimeout(_autoHide, 8000); return; }
      box.style.opacity = '0';
      setTimeout(() => { if (box && box.parentNode) box.remove(); _unbindNotifyDrag(); }, 420);
    };
    window.__adminCtlNotifyTimer = setTimeout(_autoHide, 30000);
  }

  // 解绑飘屏的全局监听 + 停掉 rAF（关闭/失效时必须调用，否则动画空转）
  function _unbindNotifyDrag() {
    if (typeof window.__adminCtlNotifyDragUnbind === 'function') {
      try { window.__adminCtlNotifyDragUnbind(); } catch (e) {}
    }
    window.__adminCtlNotifyDragUnbind = null;
  }
  // 右上角 ✕ 关闭
  window.__adminCtlClose = function () {
    const box = document.getElementById('adminCtlNotify');
    if (box) { box.style.opacity = '0'; setTimeout(() => { if (box && box.parentNode) box.remove(); }, 420); }
    _unbindNotifyDrag();
  };

  // 预览飘屏效果：读取管理员工具箱里填的标题/正文/级别，本地弹一次看看效果。
  // 纯本地预览，不写 Gist、不记 ack，不会影响真实下发。
  window.__adminCtlPreviewNotify = function () {
    const t = document.getElementById('toolboxTitle');
    const b = document.getElementById('toolboxBody');
    const l = document.getElementById('toolboxLevel');
    _showNotify({
      id: '__preview__' + Date.now(),
      type: 'notify',
      title: (t && t.value.trim()) || '通知标题示例',
      body: (b && b.value.trim()) || '这里是通知正文，会像弹幕一样在屏幕上飘动，撞到边缘自动反弹。',
      level: (l && l.value) || 'info',
      actions: ['ok'],
      thread: []
    });
  };

  // 点击「知道了」（淡出后真正移除 DOM 并解绑监听，避免 rAF 空转）
  window.__adminCtlAck = function (id) {
    _markAck(id);
    const box = document.getElementById('adminCtlNotify');
    if (box) { box.style.opacity = '0'; setTimeout(() => { if (box && box.parentNode) box.remove(); }, 420); }
    _unbindNotifyDrag();
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
    if (box) { box.style.opacity = '0'; setTimeout(() => { if (box && box.parentNode) box.remove(); }, 420); }
    _unbindNotifyDrag();
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
    // 兜底：reload 前把 localStorage ack 同步镜像到 sessionStorage，杜绝 reload 边界丢失导致的刷新风暴
    try {
      const ack = JSON.parse(localStorage.getItem(ACK_KEY) || '{}');
      Object.keys(ack).forEach(k => { try { sessionStorage.setItem('tfjl_adminctl_ackguard@' + k, '1'); } catch (e) {} });
    } catch (e) {}
    // 🔴 2026-09-04：正在编辑 → 延后刷新，等编辑结束再刷，绝不打断编辑（覆盖 forceReload / latestSwVersion 等所有调用方）
    // 直接 reload，不走 SW postMessage（SW 无新版本时 waiting 为 null，多此一举且引入 600ms 异步竞态）
    const _doReload = function () {
      try { location.reload(true); } catch (e) { location.reload(); }
    };
    if (typeof window.__tfjlRunWhenNotEditing === 'function') {
      window.__tfjlRunWhenNotEditing(_doReload, '管理员强制刷新(' + (reason || '') + ')');
    } else {
      _doReload();
    }
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
