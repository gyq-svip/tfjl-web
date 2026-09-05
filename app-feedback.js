/* ============================================================================
 * app-feedback.js — 用户反馈通道（悬浮客服按钮 + 私有反馈 Gist）
 * ----------------------------------------------------------------------------
 * 设计：
 *  - 主页右下角悬浮 💬 按钮，点开可提交「问题反馈 / 功能建议」，人人可发。
 *  - 提交自动附带诊断信息（SW版本 / 桌面版本 / 平台 / 最近报错），便于排查。
 *  - 提交后本地立即显示「✅ 已记录，等待后续处理」（即"立即回复一句"）。
 *  - 数据写入诊断私有 Gist（FEEDBACK_GIST_ID，public:false，仅带 dev token 可读写），
 *    普通用户浏览器里虽持有该 token 但不会在 UI 展示，仅在密码门禁的「用户反馈」面板可见。
 *  - 每个用户一个文件 fb_<devId>.json（数组），避免多人并发写同一文件丢更新。
 * ==========================================================================*/
(function () {
  'use strict';

  // 🔴 复用诊断私有 Gist（仅管理员可读写），反馈文件以 fb_ 前缀区分，与 diag- 文件互不干扰
  const FEEDBACK_GIST_ID = 'deb09eba308f044c3b78935507972717';
  const FB_LOCAL_KEY = 'tfjl_feedback_local';
  const FB_TYPE = { bug: '🐞 问题反馈', suggestion: '💡 功能建议' };

  function _fbToken() {
    try { return (typeof getGistToken === 'function') ? getGistToken() : (localStorage.getItem('TFJL_Gist_Token') || ''); } catch (e) { return ''; }
  }
  function _fbDevId() {
    try { return (typeof getDeviceId === 'function') ? getDeviceId() : ''; } catch (e) { return ''; }
  }
  function _fbNick() {
    try { return (typeof _myNick === 'function') ? _myNick() : ''; } catch (e) { return ''; }
  }
  function _fbToast(msg, type) {
    try { if (typeof showToast === 'function') { showToast(msg, type); return; } } catch (e) {}
    alert(msg);
  }
  function _fbEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function _fbSwVersion() {
    try {
      var vt = document.getElementById('versionTag');
      if (vt && vt.dataset && vt.dataset.swVersion) return vt.dataset.swVersion;
      if (vt) return vt.textContent.trim();
    } catch (e) {}
    return '未知';
  }
  function _fbExeVersion() {
    // 🔴 2026-09-05 修复：取不到版本绝不断言"网页版"（用户 APP 被误标根因）。
    // 取值链与项目同款：__APP_VERSION（Rust eval 注入）→ getAppVersion()（Tauri API，仅 APP 有此全局）
    // → 都没有 = 旧包未注入（平台判断在 _fbPlatform，不在这里猜）
    try { if (window.__APP_VERSION) return String(window.__APP_VERSION).replace(/^v/, ''); } catch (e) {}
    return '';
  }
  function _fbPlatform() {
    try {
      // 🔴 与项目判断链对齐（app-local.js _isTauriRuntime 同款三重 + Rust 注入的 __TAURI_APP__ 标记），
      // 2026-09-05 修复：APP 被误判成"网页版"（旧写法只查 __TAURI_INTERNALS__/__TAURI__，漏 UA 兜底）
      if (typeof isTauriApp !== 'undefined') return isTauriApp ? 'app' : 'web';
      if (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_APP__) return 'app';
      if (navigator.userAgent.indexOf('Tauri') !== -1) return 'app';
      return 'web';
    } catch (e) { return 'unknown'; }
  }
  function _fbRecentErrors() {
    try {
      var logs = window.__consoleLogs || [];
      return logs.filter(function (l) { return l && (l.level === 'error' || l.level === 'warn'); }).slice(-5)
        .map(function (l) { return (l.time || '') + ' [' + (l.level || '') + '] ' + (l.msg || ''); });
    } catch (e) { return []; }
  }
  async function _fbDiag() {
    // 桌面版本：__APP_VERSION → Tauri getAppVersion()（异步，提交时取）→ 空表示旧包未注入（不猜"网页版"）
    var exe = _fbExeVersion();
    var plat = _fbPlatform();
    if (!exe && typeof getAppVersion === 'function') {
      try { var gv = await getAppVersion(); if (gv) exe = String(gv).replace(/^v/, ''); } catch (e) {}
    }
    if (!exe && plat === 'app') exe = '未注入(旧包)';
    return {
      swVersion: _fbSwVersion(),
      exeVersion: exe,
      platform: plat,
      devId: _fbDevId(),
      nick: _fbNick(),
      time: new Date().toLocaleString('zh-CN'),
      errors: _fbRecentErrors()
    };
  }

  // ==================== 本地历史（用户自己看自己的提交） ====================
  function _fbLoadLocal() {
    try { return JSON.parse(localStorage.getItem(FB_LOCAL_KEY) || '[]'); } catch (e) { return []; }
  }
  function _fbSaveLocal(arr) {
    try { localStorage.setItem(FB_LOCAL_KEY, JSON.stringify(arr.slice(-50))); } catch (e) {}
  }

  // ==================== Gist 读写 ====================
  async function _fbReadGist() {
    var token = _fbToken();
    if (!token) return null;
    try {
      var r = await fetch('https://api.github.com/gists/' + FEEDBACK_GIST_ID, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'token ' + token }
      });
      if (!r.ok) return null;
      var g = await r.json();
      return (g && g.files) ? g.files : null;
    } catch (e) { return null; }
  }
  async function _fbWriteUserFile(fileName, content) {
    var token = _fbToken();
    if (!token) return false;
    try {
      var body = { files: {} };
      body.files[fileName] = { content: content };
      var r = await fetch('https://api.github.com/gists/' + FEEDBACK_GIST_ID, {
        method: 'PATCH',
        headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + token },
        body: JSON.stringify(body)
      });
      return r.ok;
    } catch (e) { return false; }
  }

  // ==================== 悬浮面板交互 ====================
  let _fbType = 'bug';
  window.toggleFeedbackPanel = function () {
    var p = document.getElementById('feedbackPanel');
    if (!p) return;
    p.style.display = (p.style.display === 'block') ? 'none' : 'block';
    if (p.style.display === 'block' && typeof window.renderFeedbackHistory === 'function') window.renderFeedbackHistory();
  };
  window.setFeedbackType = function (t) {
    _fbType = t;
    var b = document.getElementById('fbTypeBug'), s = document.getElementById('fbTypeSug');
    if (b) b.style.background = (t === 'bug') ? 'linear-gradient(135deg,#ff6b6b,#ee5253)' : 'rgba(255,255,255,0.1)';
    if (s) s.style.background = (t === 'suggestion') ? 'linear-gradient(135deg,#4ecdc4,#26a69a)' : 'rgba(255,255,255,0.1)';
  };
  window.submitFeedback = async function () {
    var ta = document.getElementById('feedbackText');
    var text = (ta ? ta.value : '').trim();
    if (!text) { _fbToast('请先描述你遇到的问题或建议', 'warn'); return; }
    var btn = document.getElementById('feedbackSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
    var entry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type: _fbType, text: text, nick: _fbNick(), devId: _fbDevId(),
      ts: Date.now(), diag: await _fbDiag(), status: 'pending', reply: ''
    };
    // 本地历史（用户自己可见 + 立即回复）
    var local = _fbLoadLocal();
    local.unshift(entry);
    _fbSaveLocal(local);
    // 写 Gist（每人独立文件，避免并发丢更新）
    var devId = (_fbDevId() || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    var fileName = 'fb_' + devId + '.json';
    var files = await _fbReadGist();
    var arr = [];
    if (files && files[fileName] && files[fileName].content) {
      try { arr = JSON.parse(files[fileName].content) || []; } catch (e) { arr = []; }
    }
    arr.push(entry);
    var ok = await _fbWriteUserFile(fileName, JSON.stringify(arr, null, 1));
    if (btn) { btn.disabled = false; btn.textContent = '✅ 提交反馈'; }
    if (!ok) { _fbToast('提交失败（网络/Gist 异常），已暂存本地，可稍后重试', 'error'); return; }
    if (ta) ta.value = '';
    _fbToast('✅ 已记录，等待后续处理', 'success');
    if (typeof window.renderFeedbackHistory === 'function') window.renderFeedbackHistory();
  };
  // 我的反馈记录：先渲染本地，再后台拉云端自己文件合并"管理员回复/处理状态"（按 id 匹配，以云端为准）
  window.renderFeedbackHistory = async function () {
    var box = document.getElementById('feedbackHistory');
    if (!box) return;
    var local = _fbLoadLocal();
    var render = function () {
      if (!local.length) {
        box.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:12px;font-size:0.78rem;">你还没有提交过反馈</div>';
        return;
      }
      box.innerHTML = local.map(function (e) {
        var done = (e.status === 'done');
        var replied = done && e.reply;
        var st = replied
          ? '<span style="font-size:0.7rem;color:#4ecdc4;">📩 管理员已回复</span>'
          : (done ? '<span style="font-size:0.7rem;color:#4ade80;">✅ 已处理</span>' : '<span style="font-size:0.7rem;color:#4ade80;">✅ 已记录，等待后续处理</span>');
        return '<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;margin-bottom:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
          '<span style="font-size:0.75rem;color:#ffd700;">' + _fbEsc(FB_TYPE[e.type] || '反馈') + '</span>' + st +
          '</div>' +
          '<div style="font-size:0.8rem;color:rgba(255,255,255,0.9);white-space:pre-wrap;word-break:break-word;">' + _fbEsc(e.text) + '</div>' +
          (replied ? '<div style="font-size:0.75rem;color:#4ecdc4;background:rgba(78,205,196,0.12);border-left:2px solid #4ecdc4;border-radius:4px;padding:5px 8px;margin-top:5px;white-space:pre-wrap;word-break:break-word;">💬 ' + _fbEsc(e.reply) + '</div>' : '') +
          '<div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:3px;">' + _fbEsc(new Date(e.ts).toLocaleString('zh-CN')) + '</div>' +
          '</div>';
      }).join('');
    };
    render();
    try {
      var devId = (_fbDevId() || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!devId) return;
      var fileName = 'fb_' + devId + '.json';
      var files = await _fbReadGist();
      if (!files || !files[fileName] || !files[fileName].content) return;
      var arr = JSON.parse(files[fileName].content) || [];
      var byId = {};
      arr.forEach(function (x) { if (x && x.id) byId[x.id] = x; });
      var changed = false;
      local.forEach(function (e) {
        var c = byId[e.id];
        if (c && (((c.status || 'pending') !== (e.status || 'pending')) || ((c.reply || '') !== (e.reply || '')))) {
          e.status = c.status || 'pending';
          e.reply = c.reply || '';
          changed = true;
        }
      });
      if (changed) { _fbSaveLocal(local); render(); }
    } catch (e) {}
  };

  // ==================== 管理员面板：查看 / 标记 ====================
  window.renderFeedbackAdmin = async function () {
    var box = document.getElementById('adminFeedbackBody');
    if (!box) return;
    box.innerHTML = '加载中…';
    var files = await _fbReadGist();
    if (!files) { box.innerHTML = '<div style="color:#ff8a80;">读取失败（无 token 或网络异常）</div>'; return; }
    var entries = [];
    Object.keys(files).forEach(function (fn) {
      if (!/^fb_.*\.json$/.test(fn)) return;
      try {
        var arr = JSON.parse(files[fn].content || '[]');
        if (Array.isArray(arr)) arr.forEach(function (x) { x._file = fn; entries.push(x); });
      } catch (e) {}
    });
    entries.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    window.__fbAdminEntries = entries;
    var pending = entries.filter(function (e) { return (e.status || 'pending') !== 'done'; }).length;
    var sumEl = document.getElementById('adminFeedbackSummary');
    if (sumEl) sumEl.textContent = '共 ' + entries.length + ' 条 · 未处理 ' + pending + ' · 已处理 ' + (entries.length - pending);
    if (!entries.length) {
      box.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">暂无用户反馈</div>';
      return;
    }
    box.innerHTML = entries.map(function (e, idx) {
      var done = (e.status || 'pending') === 'done';
      var diagStr = e.diag ? ('📱 ' + JSON.stringify(e.diag)) : '-';
      return '<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:8px;border-left:3px solid ' + (e.type === 'bug' ? '#ff6b6b' : '#4ecdc4') + ';">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<span style="font-size:0.78rem;color:#ffd700;">' + _fbEsc(FB_TYPE[e.type] || '反馈') + '</span>' +
        '<span style="font-size:0.7rem;color:' + (done ? '#4ade80' : '#ffb74d') + ';">' + (done ? '✅ 已处理' : '🟠 未处理') + '</span>' +
        '</div>' +
        '<div style="font-size:0.85rem;color:rgba(255,255,255,0.92);white-space:pre-wrap;word-break:break-word;">' + _fbEsc(e.text) + '</div>' +
        '<div style="font-size:0.68rem;color:rgba(255,255,255,0.5);margin-top:4px;">' +
        '👤 ' + (e.nick || '匿名') + ' · 🆔 ' + (e.devId || '-') + ' · 🕒 ' + _fbEsc(new Date(e.ts || Date.now()).toLocaleString('zh-CN')) + '<br>' + _fbEsc(diagStr) +
        '</div>' +
        (done && e.reply ? '<div style="font-size:0.72rem;color:#4ade80;margin-top:3px;">💬 已回复：' + _fbEsc(e.reply) + '</div>' : '') +
        (done ? '' :
          '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;">' +
          '<input id="fbReply_' + idx + '" placeholder="回复该用户（用户端可见）" style="flex:1;min-width:0;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:5px;color:#fff;font-size:0.72rem;padding:4px 8px;outline:none;">' +
          '<button onclick="fbAdminReply(' + idx + ')" style="background:rgba(78,205,196,0.25);border:1px solid rgba(78,205,196,0.5);color:#4ecdc4;font-size:0.72rem;padding:3px 10px;border-radius:5px;cursor:pointer;white-space:nowrap;">📩 回复</button>' +
          '<button onclick="fbAdminMarkDone(' + idx + ')" style="background:rgba(76,175,80,0.2);border:1px solid rgba(76,175,80,0.4);color:#4ade80;font-size:0.72rem;padding:3px 10px;border-radius:5px;cursor:pointer;white-space:nowrap;">✅ 已处理</button>' +
          '</div>') +
        '</div>';
    }).join('');
  };
  // 管理员回复：写入该用户文件的 entry.reply（status=done），用户端打开反馈面板即可看到
  window.fbAdminReply = async function (idx) {
    var entries = window.__fbAdminEntries || [];
    var e = entries[idx];
    var inp = document.getElementById('fbReply_' + idx);
    var text = inp ? inp.value.trim() : '';
    if (!e || !e._file) return;
    if (!text) { _fbToast('请先输入回复内容', 'warn'); return; }
    var files = await _fbReadGist();
    if (!files || !files[e._file]) { _fbToast('读取失败', 'error'); return; }
    var arr = [];
    try { arr = JSON.parse(files[e._file].content || '[]'); } catch (err) {}
    var changed = false;
    arr.forEach(function (x) { if (x.id === e.id) { x.reply = text; x.replyTs = Date.now(); x.status = 'done'; changed = true; } });
    if (!changed) return;
    var ok = await _fbWriteUserFile(e._file, JSON.stringify(arr, null, 1));
    if (ok) { _fbToast('📩 已回复，用户下次打开反馈面板可见', 'success'); if (typeof window.renderFeedbackAdmin === 'function') window.renderFeedbackAdmin(); }
    else _fbToast('回复写入失败', 'error');
  };
  window.fbAdminMarkDone = async function (idx) {
    var entries = window.__fbAdminEntries || [];
    var e = entries[idx];
    if (!e || !e._file) return;
    var files = await _fbReadGist();
    if (!files || !files[e._file]) return;
    var arr = [];
    try { arr = JSON.parse(files[e._file].content || '[]'); } catch (err) {}
    var changed = false;
    arr.forEach(function (x) { if (x.id === e.id) { x.status = 'done'; changed = true; } });
    if (!changed) return;
    await _fbWriteUserFile(e._file, JSON.stringify(arr, null, 1));
    if (typeof window.renderFeedbackAdmin === 'function') window.renderFeedbackAdmin();
  };
})();
