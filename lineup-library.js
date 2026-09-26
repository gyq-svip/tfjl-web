// ============================================================
// 📚 阵容图库 v2（2026-09-22）
//   悬浮窗：可拖动 + 可缩放（resize:both）。左卡组（主页同款卡槽渲染管线，右键换肤/等级/融合）右笔记。
//   🚢 大航海：单人 10 卡 ×223 套，战车 + 219/229/230/其他 波备注
//   🏆 活动阵容：双人 A/B 轮转（天数自适应）
//   数据共享：lineup-data.js；个人设置（等级/皮肤/融合/战车/笔记）localStorage tfjl_lineup_local_v1
// ============================================================
(function () {
    const LS_KEY = 'tfjl_lineup_local_v1';
    const state = { tab: 'sail', q: '', page: 1, open: {}, menuFor: null };

    function _load() { let o; try { o = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { o = {}; } _migrateScripts(o); return o; }
    function _save(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }
    // 🔴 2026-09-23 单脚本 → 多脚本迁移：旧字段 script/scriptUrl/scriptName 合并成 scripts 数组（兼容老数据）
    function _migrateScripts(o) {
        let changed = false;
        const act = o.activity || {};
        Object.keys(act).forEach(function (d) {
            const s = act[d];
            if (s && !Array.isArray(s.scripts) && (s.script !== undefined || s.scriptUrl !== undefined)) {
                const arr = [];
                if (s.script !== undefined || s.scriptUrl !== undefined) {
                    arr.push({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 5), name: s.scriptName || '阵容脚本', content: s.script || '', url: s.scriptUrl || '', shared: !!s.scriptUrl });
                }
                s.scripts = arr; delete s.script; delete s.scriptUrl; delete s.scriptName; changed = true;
            }
        });
        if (changed) _save(o);
    }
    function _newSid() { return 's' + Date.now() + Math.random().toString(36).slice(2, 6); }
    function _dayScripts(id) { const L = _slot('activity', id); return Array.isArray(L.scripts) ? L.scripts : []; }
    function _upsertScript(id, scr) {
        const o = _load(); o.activity = o.activity || {}; o.activity[id] = o.activity[id] || {};
        const arr = Array.isArray(o.activity[id].scripts) ? o.activity[id].scripts : [];
        const i = arr.findIndex(function (x) { return x.id === scr.id; });
        if (i >= 0) arr[i] = scr; else arr.push(scr);
        o.activity[id].scripts = arr; _save(o); if (window._llRenderScripts) window._llRenderScripts(id);
    }
    function _delScript(id, sid) {
        const o = _load(); const arr = (o.activity[id] && o.activity[id].scripts) || [];
        const left = arr.filter(function (x) { return x.id !== sid; });
        if (left.length) o.activity[id].scripts = left; else delete o.activity[id].scripts;
        _save(o); if (window._llRenderScripts) window._llRenderScripts(id);
    }
    // ---------- 🔴 2026-09-23 云端共享索引（与需求墙同用一个主 Gist；只存元数据，正文在各自脚本 Gist） ----------
    // 目的：上传分享后所有人（含网页端）在该天下都能看到，而不是只存本机
    const _LL_IDX_GIST = (typeof window.TFJL_MASTER_GIST_ID === 'string' && window.TFJL_MASTER_GIST_ID) || 'a32a0628bd9275f3a4922cd12cf298c9';
    const _LL_IDX_FILE = 'lineup_scripts.json';
    let _llCloudCache = null;      // { data, ts } 内存缓存 5 分钟
    function _llTok() { try { return (typeof window.getGistToken === 'function') ? (window.getGistToken() || '') : ''; } catch (e) { return ''; } }
    function _llAuthor() { try { return localStorage.getItem('TFJL_UserName') || '匿名'; } catch (e) { return '匿名'; } }
    async function _llIdxLoad() {
        const tok = _llTok(); if (!tok) return null;
        try {
            const r = await fetch('https://api.github.com/gists/' + _LL_IDX_GIST, { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'token ' + tok } });
            if (!r.ok) return null;
            const d = await r.json();
            const f = d.files && d.files[_LL_IDX_FILE];
            if (!f) return {};
            let txt = f.content;
            if (f.truncated) txt = await fetch(f.raw_url).then(function (x) { return x.text(); });
            try { return JSON.parse(txt) || {}; } catch (e) { return {}; }
        } catch (e) { return null; }
    }
    async function _llIdxSave(data) {
        const tok = _llTok(); if (!tok) return false;
        try {
            const r = await fetch('https://api.github.com/gists/' + _LL_IDX_GIST, {
                method: 'PATCH',
                headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + tok },
                body: JSON.stringify({ files: { [_LL_IDX_FILE]: { content: JSON.stringify(data) } } })
            });
            return r.ok;
        } catch (e) { return false; }
    }
    // 读-改-写 + 重试（Gist 无锁，并发 PATCH 会互相覆盖 → 每次先读最新再写回）
    async function _llIdxMutate(fn) {
        for (let i = 0; i < 3; i++) {
            const d = await _llIdxLoad();
            if (!d) return false;
            try { fn(d); } catch (e) { return false; }
            if (await _llIdxSave(d)) { _llCloudCache = { data: d, ts: Date.now() }; return true; }
            await new Promise(function (r) { setTimeout(r, 400 * (i + 1)); });
        }
        return false;
    }
    // 某天的云端脚本（带缓存）
    async function _llCloudOf(id) {
        if (_llCloudCache && Date.now() - _llCloudCache.ts < 300000) return (_llCloudCache.data && _llCloudCache.data[id]) || [];
        const d = await _llIdxLoad();
        if (d) _llCloudCache = { data: d, ts: Date.now() };
        return (d && d[id]) || [];
    }
    // 本机 + 云端合并（按 url 去重：本机已有的不再重复显示）
    async function _llDayScriptsAll(id) {
        const local = _dayScripts(id);
        let cloud = [];
        try { cloud = await _llCloudOf(id); } catch (e) { cloud = []; }
        const seen = {};
        local.forEach(function (s) { if (s && s.url) seen[s.url] = 1; });
        const extra = (cloud || []).filter(function (c) { return c && c.url && !seen[c.url]; }).map(function (c) {
            return { id: c.id || ('c' + String(c.url).slice(-10)), name: c.name || '云端脚本', url: c.url, content: '', shared: true, cloud: true, author: c.author || '' };
        });
        return local.concat(extra);
    }
    // 按 sid 查找（本机 + 云端都能找到）
    async function _llFindScript(id, sid) {
        const arr = await _llDayScriptsAll(id);
        return arr.find(function (x) { return x.id === sid; }) || null;
    }
    // 后台预热云端索引 + 刷新所有可见列表
    async function _llRefreshCloud() {
        try { await _llCloudOf('__warm__'); } catch (e) {}
        const els = document.querySelectorAll('[id^="llScripts-"]');
        for (let i = 0; i < els.length; i++) { const id = els[i].id.replace('llScripts-', ''); if (typeof _llRenderScripts === 'function') await _llRenderScripts(id); }
        const dlg = document.getElementById('llScriptDlg');
        if (dlg && dlg.dataset.day && typeof _llScriptDlg === 'function') _llScriptDlg(dlg.dataset.day);
    }
    function _slot(tab, id) {
        const o = _load();
        o[tab] = o[tab] || {};
        o[tab][id] = o[tab][id] || {};
        return o[tab][id];
    }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    // 🔴 2026-09-23 英雄名别名（游戏显示名 → 库名）：recognize.js 同款。微型潜艇就是潜艇，
    //    阵容数据若用「微型潜艇」也能正确查减伤/融合/皮肤（主页按「潜艇」存）。
    const _ALIASES = { '微型潜艇': '潜艇' };
    function _norm(h) { return _ALIASES[h] || h; }
    // 🔴 2026-09-23 功能埋点（与主页 __recordFeatureUse 同一 buffer，管理员可在「按 Gist×功能 TOP」看到使用情况）
    function _llTrack(fn) { try { if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse(fn); } catch (e) {} }
    function _escJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function _data() { return (window.LINEUP_LIBRARY && window.LINEUP_LIBRARY.sailing) ? window.LINEUP_LIBRARY : { sailing: [], activity: [] }; }
    function _parseNames(txt) { return String(txt || '').split(/[,，、\n\r]+/).map(s => s.trim()).filter(Boolean); }
    // ---------- 悬浮窗（拖动 + 缩放） ----------
    window.openLineupLibraryPanel = function () {
        let ov = document.getElementById('lineupLibWin');
        if (ov) { ov.style.display = 'block'; return; }
        _llTrack('阵容图库');
        ov = document.createElement('div');
        ov.id = 'lineupLibWin';
        // 🔴 2026-09-23 用户要求：默认窗口改小（原 min(1180px,96vw)×min(86vh,900px) 太大，右下角缩放手柄/关闭按钮都难点到）
        //    默认 940×620，并随视口自适应（底部永远留出余量，不贴边）；用户自己拉大后记住尺寸，下次沿用（仍限制在视口内）
        let _llWinW = Math.min(940, Math.round(window.innerWidth * 0.92));
        let _llWinH = Math.min(620, Math.round(window.innerHeight * 0.70));
        try {
            const _llSv = JSON.parse(localStorage.getItem('tdjl_llWinSize') || 'null');
            if (_llSv && _llSv.w > 0 && _llSv.h > 0) {
                _llWinW = Math.min(_llSv.w, window.innerWidth - 32);
                _llWinH = Math.min(_llSv.h, window.innerHeight - 110);
            }
        } catch (e) {}
        ov.style.cssText = 'position:fixed;top:64px;right:16px;width:' + _llWinW + 'px;height:' + _llWinH + 'px;min-width:min(620px,90vw);min-height:280px;z-index:99996;display:flex;flex-direction:column;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(78,205,196,0.4);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);overflow:auto;resize:both;';
        ov.innerHTML =
            '<div id="llDrag" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(135deg,#0f3d3a,#123c5c);border-radius:12px 12px 0 0;cursor:move;user-select:none;">'
            + '<span style="font-size:1.05rem;font-weight:800;color:#4ecdc4;">📚 阵容图库</span>'
            + '<span style="color:rgba(255,255,255,0.45);font-size:0.72rem;">卡组共享 · 等级/皮肤/融合/战车/笔记 只存本机</span>'
            + '<span style="flex:1;"></span>'
            + '<span style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-right:6px;white-space:nowrap;font-family:Consolas,monospace;">gyq-svip.github.io/tfjl-web</span>' + '<button onclick="closeLineupLibraryPanel()" title="关闭" style="background:transparent;border:none;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1;padding:2px 12px;border-radius:8px;">×</button>'
            + '</div>'
            + '<div id="llHead" style="padding:10px 14px 6px;"></div>'
            + '<div id="llList" style="padding:0 14px 14px;"></div>';
        document.body.appendChild(ov);
        // 卡槽点击：🔴 2026-09-22 与主页一致：左键 = 循环切换融合卡；右键 = 循环切换主卡皮肤（均不弹菜单）
        ov.addEventListener('click', function (e) {
            const sl = e.target.closest('.ll-slot');
            if (sl) { window._llFuseCycle(sl); }
        });
        ov.addEventListener('contextmenu', function (e) {
            const sl = e.target.closest('.ll-slot');
            if (sl) { e.preventDefault(); window._llSkinCycle(sl); }
        });
        // 拖动（标题栏按住移动窗口；窗口用 left/top 定位后 resize 仍可用）
        const win = ov, bar = ov.querySelector('#llDrag');
        bar.addEventListener('pointerdown', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            const r = win.getBoundingClientRect();
            const dx = e.clientX - r.left, dy = e.clientY - r.top;
            win.style.left = r.left + 'px'; win.style.top = r.top + 'px'; win.style.right = 'auto';
            const mv = function (e2) { win.style.left = Math.max(0, e2.clientX - dx) + 'px'; win.style.top = Math.max(0, e2.clientY - dy) + 'px'; };
            const up = function () { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
            document.addEventListener('pointermove', mv);
            document.addEventListener('pointerup', up);
        });
        _renderHead();
        _renderList();
        // 🔴 2026-09-23 记住用户拉伸后的窗口尺寸（防抖 500ms 存 localStorage，刷新后沿用；窗口被限制在视口内）
        if (window.ResizeObserver) {
            let _llSizeT = null;
            new ResizeObserver(function () {
                clearTimeout(_llSizeT);
                _llSizeT = setTimeout(function () {
                    try { localStorage.setItem('tdjl_llWinSize', JSON.stringify({ w: ov.offsetWidth, h: ov.offsetHeight })); } catch (e) {}
                }, 500);
            }).observe(ov);
        }
        // 🔴 后台拉取云端共享脚本并刷新各天列表（不阻塞首屏：先渲染本机，云端到了再补）
        setTimeout(function () { try { _llRefreshCloud(); } catch (e) {} }, 400);
    };
    window.closeLineupLibraryPanel = function () {
        const ov = document.getElementById('lineupLibWin');
        if (ov) ov.style.display = 'none';
    };
    window._llTab = function (t) { state.tab = t; state.page = 1; _renderHead(); _renderList(); };
    // 🔴 搜索框放在 llHead（静态），输入只刷新 llList —— 否则每次按键重建输入框，字打不进去（v1 事故）
    window._llSearch = function (v) { state.q = String(v || '').trim(); state.page = 1; _renderList(); };
    window._llPage = function (d) { state.page = Math.max(1, state.page + d); _renderList(); };
    window._llToggle = function (key) { state.open[key] = !state.open[key]; _renderList(); };
    // ---------- 头部（静态：tab + 搜索框）与列表 ----------
    function _renderHead() {
        const h = document.getElementById('llHead');
        if (!h) return;
        const D = _data();
        const isSail = state.tab === 'sail';
        h.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
            + '<button onclick="_llTab(\'sail\')" style="padding:6px 14px;border-radius:8px;border:1px solid ' + (isSail ? 'rgba(78,205,196,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' + (isSail ? 'rgba(78,205,196,0.18)' : 'transparent') + ';color:' + (isSail ? '#4ecdc4' : 'rgba(255,255,255,0.7)') + ';cursor:pointer;font-size:0.85rem;font-weight:700;">🚢 大航海(' + D.sailing.length + ')</button>'
            + '<button onclick="_llTab(\'act\')" style="padding:6px 14px;border-radius:8px;border:1px solid ' + (!isSail ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' + (!isSail ? 'rgba(255,215,0,0.15)' : 'transparent') + ';color:' + (!isSail ? '#ffd700' : 'rgba(255,255,255,0.7)') + ';cursor:pointer;font-size:0.85rem;font-weight:700;">🏆 活动阵容(' + D.activity.length + '天)</button>'
            + '<button onclick="_llTab(&quot;featured&quot;)" style="padding:6px 14px;border-radius:8px;border:1px solid ' + (state.tab === 'featured' ? 'rgba(156,39,176,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' + (state.tab === 'featured' ? 'rgba(156,39,176,0.18)' : 'transparent') + ';color:' + (state.tab === 'featured' ? '#ce93d8' : 'rgba(255,255,255,0.7)') + ';cursor:pointer;font-size:0.85rem;font-weight:700;">精选</button>' + (state.tab === 'featured' ? '<button onclick="_featLocalAddDlg()" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(78,205,196,0.6);background:rgba(78,205,196,0.18);color:#4ecdc4;cursor:pointer;font-size:0.8rem;font-weight:700;">添加本地阵容</button>' + (_isAdmin() ? '<button onclick="_featuredAddDlg()" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(240,147,43,0.6);background:rgba(240,147,43,0.18);color:#f0932b;cursor:pointer;font-size:0.8rem;font-weight:700;">添加精选</button>' : '') : '') + '<input id="llSearch" value="' + _esc(state.q) + '" oninput="_llSearch(this.value)" placeholder="🔍 多个英雄用空格/逗号分隔（同时含才显示）：如 电法 炎魔 悟空" style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.85rem;">'
            + '</div>'
            + '<div style="color:rgba(255,255,255,0.45);font-size:0.7rem;margin-top:4px;">左卡组右笔记 · <b style="color:#ce93d8;">左键=轮流切融合卡（含副卡皮肤，末尾关闭）</b> · <b style="color:rgba(255,255,255,0.7);">右键=主卡皮肤（融合后也可切）</b> · <b style="color:#ff8a80;">🛡️减伤=鼠标悬浮查看每张卡的减伤明细（0% 减伤的卡自动隐藏）</b> · 活动 📜=脚本 ·（个人设置只存本机）· 拖标题栏移动窗口，右下角拉伸大小</div>';
        _ensureAdmin();
    }
    // 🔴 2026-09-23 多关键词搜索：空格/逗号/顿号分隔，必须【同时包含】（AND）——搜"电法 炎魔 悟空"才精准
    function _qTerms() {
        return String(state.q || '').split(/[,，、\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function _filteredSailing() {
        const ts = _qTerms();
        if (!ts.length) return _data().sailing;
        return _data().sailing.filter(function (s) {
            return ts.every(function (t) { return s.heroes.some(function (h) { return h.indexOf(t) >= 0; }); });
        });
    }
    function _filteredActivity() {
        const ts = _qTerms();
        if (!ts.length) return _data().activity;
        return _data().activity.filter(function (d) {
            const all = (d.A || []).concat(d.B || []);
            return ts.every(function (t) { return all.some(function (h) { return h.indexOf(t) >= 0; }); });
        });
    }
    const PAGE = 10;
    function _renderList() {
        const p = document.getElementById('llList');
        if (!p) return;
        const D = _data();
        const isSail = state.tab === 'sail';
        const list = isSail ? _filteredSailing() : _filteredActivity();
        const pages = Math.max(1, Math.ceil(list.length / PAGE));
        if (state.page > pages) state.page = pages;
        const pageList = isSail ? list.slice((state.page - 1) * PAGE, state.page * PAGE) : list;
        let h = '';
        if (isSail) {
            if (pages > 1) {
                h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
                h += '<button onclick="_llPage(-1)" ' + (state.page <= 1 ? 'disabled' : '') + ' style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">◀</button>';
                h += '<span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">第 ' + state.page + ' / ' + pages + ' 页（共 ' + list.length + ' 套）</span>';
                h += '<button onclick="_llPage(1)" ' + (state.page >= pages ? 'disabled' : '') + ' style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">▶</button>';
                h += '</div>';
            }
            // 🔴 一排两套（每套 5×2）。minmax(0,1fr)：1fr 默认最小宽度是内容宽，
            //    备注行 150px 输入框会把列撑爆退化成一列（用户实测右边空一大块）→ 钉死两等分。
            h += '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">';
            pageList.forEach(function (s) { h += _sailCard(s); });
            h += '</div>';
        } else if (state.tab === 'featured') {
            _renderFeatured();
        } else {
            pageList.forEach(function (a) { h += _actCard(a); });
            if (!pageList.length) h += '<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;">没有匹配的阵容</div>';
        }
        p.innerHTML = h;
        _applySlots(p);
        _refreshDrSums(p);
        // 每次重绘活动卡片后，异步合并云端共享脚本刷新（切 tab/搜索/分页后，上传的云端脚本不会从卡片消失）
        if (!isSail) setTimeout(function () { try { _llRefreshCloud(); } catch (e) {} }, 300);
    }
    // ---------- 主页同款卡槽 ----------
    // battle-slot 结构 + 主页渲染管线 applySkinBgToSlot(slot, hero, hero, 'my', forceSkin)
    // forceSkin = 本阵容个人皮肤；徽标（Lv/魔/减伤）在渲染后叠加
    function _slotHtml(which, idx, hero, tab, id, sz) {
        const s = sz || 50;
        // 🔴 2026-09-22 全局 .battle-slot 写死 min/max-width:72px、min-height:72px（styles.css:545），
        //    min-width 会压过内联 width → 图库小格子里实际渲染 72px → 相邻卡槽互相重叠（用户实测）。
        //    内联把 min/max 全部钉死 + overflow:hidden，保证槽位永远等于格子尺寸。
        const box = 'width:' + s + 'px;height:' + s + 'px;min-width:' + s + 'px;max-width:' + s + 'px;min-height:' + s + 'px;max-height:' + s + 'px;padding:0;border-radius:6px;cursor:pointer;position:relative;overflow:hidden;';
        // 🔴 2026-09-22 卡下方名字标签移除（皮肤图上已有名字）；卡放大 44→54px（用户反馈太小、融合卡看不清）
        return '<div class="battle-slot filled ll-slot" data-slot="ll-' + tab + '-' + id + '-' + which + idx + '" data-hero="' + _esc(hero) + '" data-tab="' + tab + '" data-lid="' + _esc(id) + '" data-w="' + which + '" title="' + _esc(hero) + '（右键：切换皮肤 / 左键：融合）" style="' + box + '">'
            + '<span class="card-item"><span class="card-name">' + _esc(hero) + '</span></span>'
            + '</div>';
    }
    // 🔴 2026-09-22 减伤计算全部改用主页现成的 getDamageReductionBreakdown（洗炼+小野/酋长/宝库特殊技能+战车，
    //    与主页完全一致）——旧的 _cardDr/_sumDr 只读洗炼、漏了特殊卡表级值和战车（用户实测 260% 只算出部分）。
    //    卡上不再画减伤角标（被名字挡住）；组头 🛡️ 悬浮显示主页同款拆分明细。
    function _drCards(tab, lid, heroes) {
        const L = _slot(tab, lid);
        return (heroes || []).map(function (n) {
            const f = L.fus && L.fus[n];
            if (f) { const p = (window.getFusionParts ? window.getFusionParts(f) : null); if (p && p.length >= 2) return p.map(_norm).join('+'); return _norm(f); }
            return _norm(n);
        }).map(function (n) { return { name: n }; });   // breakdown 的 cardList 元素格式 = {name}
    }
    function _refreshDrSums(root) {
        (root || document.getElementById('llList') || document).querySelectorAll('.ll-drsum').forEach(function (el) {
            try {
                const heroes = JSON.parse(el.getAttribute('data-heroes') || '[]');
                const tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid');
                const cards = _drCards(tab, lid, heroes);
                const side = el.getAttribute('data-side') || 'my', table = el.getAttribute('data-table') || '我的';
                const calc = window.calculateDamageReductionForCards, bd = window.getDamageReductionBreakdown;
                if (!calc || !bd) { el.textContent = '🛡️—'; return; }
                const all = bd(cards, side, table);
                el.textContent = '🛡️' + all.total + '%';
                // 🔴 2026-09-23 逐卡明细（用户要求）：10 张只能上 7 张，悬浮看到每张卡的减伤才能核算去掉哪 3 张。
                //    单卡计算 skipChariot=true（战车不摊到卡上，主页「单卡明细」同款），战车单列一行。
                // 🔴 2026-09-23 用户要求：明细里 0% 减伤的卡直接过滤不显示（只列真正有减伤的卡）
                const lines = [];
                cards.forEach(function (c) {
                    const v = calc([c.name], side, table, true);
                    if (v > 0) lines.push(c.name.replace(/\+/g, '·') + ' ' + v + '%');
                });
                if (all.chariot > 0) lines.push('战车 ' + all.chariot + '%');
                const tip = (lines.length ? lines.join('｜') + ' ｜ ' : '') + '合计 ' + all.total + '%';
                el.title = tip;
                el.setAttribute('data-tip', tip);
            } catch (e) {}
        });
    }
    function _applySlots(root) {
        if (!window.applySkinBgToSlot) return;
        const slots = root.querySelectorAll('.ll-slot[data-hero]');
        let i = 0;
        (function step() {
            if (i >= slots.length) return;
            const el = slots[i++];
            const hero = el.getAttribute('data-hero');
            const tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid');
            const L = _slot(tab, lid);
            const force = (L.skin && L.skin[hero]) || undefined;
            // 🔴 2026-09-22 融合卡渲染与主页一致：槽位卡名直接用融合卡名（applySkinBgToSlot 内部走对角切割渲染）。
            //    第6参 forceMainSkin：融合卡的主卡皮肤（融合分支只读项目级存储，外部必须显式传）。
            //    🔴 减伤不再画在卡上（用户要求：右下角被名字挡住）——组头 🛡️ 悬浮明细统一在 _refreshDrSums 计算。
            const fus = (L.fus && L.fus[hero]) || '';
            const cur = fus || hero;
            Promise.resolve().then(function () { return window.applySkinBgToSlot(el, cur, cur, 'my', force, fus ? force : undefined); })
                .catch(function () {}).then(function () { _fusBadge(el, fus); step(); });
        })();
    }
    // 🔴 2026-09-22 快捷操作（与主页融合一致，用户要求）：
    //   左键 = 循环切换融合卡：原卡 → 融合变体1 → … → 原卡（列表 = getFusionVariantsForBase 主页现成数据）
    function _fusBadge(el, v) {
        const old = el.querySelector('.ll-fus'); if (old) old.remove();
        if (!v) return;
        let label = '融';
        try { const p = window.getFusionParts ? window.getFusionParts(v) : null; if (p && p.length >= 2) label = '融·' + p[1]; else label = '融·' + v; } catch (e) { label = '融·' + v; }
        const b = document.createElement('div');
        b.className = 'll-fus';
        b.style.cssText = 'position:absolute;left:1px;top:1px;pointer-events:none;';
        b.innerHTML = '<span style="background:rgba(156,39,176,0.85);color:#fff;font-size:0.56rem;padding:0 3px;border-radius:3px;">' + _esc(label) + '</span>';
        el.appendChild(b);
    }
    window._llFuseCycle = function (el) {
        const hero = el.getAttribute('data-hero'), tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid');
        const L = _slot(tab, lid);
        const variants = (window.getFusionVariantsForBase ? window.getFusionVariantsForBase(_norm(hero)) : []);
        _llTrack('阵容图库切融合');
        if (!variants.length) { try { if (typeof showToast === 'function') showToast(hero + ' 没有可融合的卡', 'info'); } catch (e2) {} return; }
        // 🔴 2026-09-22 主页同款循环（用户要求）：关闭 → 变体1(副卡默认皮) → 变体1(副卡皮2) → … → 变体N(…) → 关闭
        //    融合卡与副卡皮肤一次循环搞定；右键仍独立切主卡皮肤，互不影响。
        const _nm = function (s) { return (typeof s === 'string') ? s : (s && s.name) || ''; };
        const steps = [{ v: '', sub: '', skin: '' }];
        variants.forEach(function (v) {
            const parts = (window.getFusionParts ? window.getFusionParts(v) : null) || [];
            const sub = _norm(parts[1] || '');
            const subSkins = ((sub && window.getHeroSkins) ? window.getHeroSkins(sub) : []).map(_nm).filter(Boolean);
            // 🔴 2026-09-24 用户要求：卡池里给副卡设的那张皮排第一 —— 切一下就是它，不用点十几下（默认皮仍在末尾可循环到）
            const poolSkin = (sub && window.getPoolOnlySkin) ? (window.getPoolOnlySkin(null, sub) || '') : '';
            const ordered = [];
            const hasPool = !!(poolSkin && poolSkin !== '默认' && subSkins.indexOf(poolSkin) >= 0);
            if (hasPool) ordered.push(poolSkin);
            subSkins.forEach(function (sk) { if (ordered.indexOf(sk) < 0) ordered.push(sk); });
            const skins = hasPool ? ordered.concat(['']) : [''].concat(ordered);
            skins.forEach(function (sk) { steps.push({ v: v, sub: sub, skin: sk }); });
        });
        const curFuse = (L.fus && L.fus[hero]) || '';
        const curParts = curFuse ? ((window.getFusionParts ? window.getFusionParts(curFuse) : null) || []) : [];
        const curSub = curParts[1] || '';
        const curSkin = curSub && window.fusionSkins && window.fusionSkins[curSub] !== undefined ? (window.fusionSkins[curSub] || '') : '';
        let idx = steps.findIndex(function (s) { return s.v === curFuse && s.sub === curSub && s.skin === curSkin; });
        if (idx < 0) idx = steps.findIndex(function (s) { return s.v === curFuse; });   // 变体在但副卡皮对不上 → 从该变体段继续
        if (idx < 0) idx = 0;
        const next = steps[(idx + 1) % steps.length];
        window._llSet(tab, lid, 'fus', hero, next.v);
        if (next.sub) { try { window.fusionSkins = window.fusionSkins || {}; window.fusionSkins[next.sub] = next.skin; } catch (e2) {} }
        const skin = (L.skin && L.skin[hero]) || undefined;
        const shown = next.v || hero;
        Promise.resolve().then(function () { return window.applySkinBgToSlot(el, shown, shown, 'my', skin, next.v ? skin : undefined); }).catch(function () {}).then(function () { _fusBadge(el, next.v); _refreshDrSums(document.getElementById('llList')); });
        try { if (typeof showToast === 'function') showToast(next.v ? (next.v + (next.skin ? ' · 副卡皮:' + next.skin : ' · 副卡默认皮')) : '已关闭融合（' + hero + '）', 'info'); } catch (e2) {}
    };
    //   右键 = 循环【主卡】皮肤（🔴 2026-09-22 修复：融合后也一直可切，与左键融合循环互不影响；列表=主页卡池 getHeroSkins）
    window._llSkinCycle = function (el) {
        const hero = el.getAttribute('data-hero'), tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid');
        const L = _slot(tab, lid);
        const _nm = function (s) { return (typeof s === 'string') ? s : (s && s.name) || ''; };
        _llTrack('阵容图库切皮肤');
        const cur = (L.skin && L.skin[hero]) || '';
        let list = [];
        if (window.getHeroSkins) list = (window.getHeroSkins(_norm(hero)) || []).map(_nm).filter(Boolean);
        else list = ((window.skinRegistry && window.skinRegistry[_norm(hero)]) || []).map(_nm).filter(Boolean);
        const names = [''].concat(list);
        let i = names.indexOf(cur); if (i < 0) i = 0;
        const next = names[(i + 1) % names.length];
        window._llSet(tab, lid, 'skin', hero, next);
        const fus = (L.fus && L.fus[hero]) || '';
        const shown = fus || hero;
        // 🔴 融合态必须传第6参 forceMainSkin（融合分支只认它，第5参被忽略）——修复"显示切了但皮肤没换"
        Promise.resolve().then(function () { return window.applySkinBgToSlot(el, shown, shown, 'my', next || undefined, fus ? (next || undefined) : undefined); })
            .catch(function () {}).then(function () { _refreshDrSums(document.getElementById('llList')); });
        try { if (typeof showToast === 'function') showToast(hero + ' 主卡皮肤 → ' + (next || '默认'), 'info'); } catch (e2) {}
    };
    // ---------- 活动脚本（🔴 2026-09-22 用户要求：活动可以用脚本去打，每天一个脚本，可上传到脚本分享供大家使用） ----------
    // 🔴 2026-09-23 抽出的上传函数（多脚本复用）：把脚本内容传到 Gist 脚本分享，返回 raw_url
    window._doScriptUpload = async function (content, fname) {
        if (typeof window.uploadScriptToGist === 'function') return await window.uploadScriptToGist({ name: fname }, content);
        const token = (typeof window.getGistToken === 'function') ? window.getGistToken() : '';
        if (!token) throw new Error('无 Gist Token（请在主页设置里配置）');
        const resp = await fetch('https://api.github.com/gists', { method: 'POST', headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + token }, body: JSON.stringify({ description: '脚本分享: ' + fname, public: true, files: { [fname]: { content: content } } }) });
        if (!resp.ok) { const er = await resp.json().catch(function () { return {}; }); throw new Error(er.message || ('HTTP ' + resp.status)); }
        const data = await resp.json();
        const fd = data.files && data.files[fname];
        return (fd && fd.raw_url) || data.html_url || '';
    };
    // 多脚本管理弹窗（🔴 2026-09-23 重做：粘贴 TXT / 选 .txt 文件 → 直接上传云端分享；预览统一走 openScriptNotebook）
    window._llScriptDlg = function (id) {
        const old = document.getElementById('llScriptDlg'); if (old) old.remove();
        const day = String(id).replace(/^d/, '');
        const m = document.createElement('div'); m.id = 'llScriptDlg';
        m.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
        const box = document.createElement('div');
        box.dataset.day = id;   // 🔴 供云端刷新时定位是哪一天
        box.style.cssText = 'width:min(600px,94vw);max-height:88vh;overflow:auto;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(240,147,43,0.5);border-radius:12px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
        box.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><b style="color:#f0932b;font-size:0.95rem;">📜 活动·第' + _esc(day) + '天 · 阵容脚本（可多个）</b><span style="flex:1;"></span><button id="llScriptClose" style="background:transparent;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">×</button></div>'
            + '<div style="color:rgba(255,255,255,0.45);font-size:0.68rem;margin-bottom:6px;">粘贴 TXT 文本或选 .txt 文件 → 点「☁ 上传分享」即上传到云端公开分享（与需求墙同一套）。点脚本名用<b style="color:rgba(255,255,255,0.7);">脚本记事本</b>打开：可改颜色、看减伤、📊对比、查找替换、📥下载、📁导入老马。</div>'
            + '<textarea id="llScriptText" placeholder="把 TXT 脚本内容粘贴到这里…" style="width:100%;box-sizing:border-box;height:150px;resize:vertical;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.35);color:rgba(255,255,255,0.92);font-size:0.78rem;font-family:Consolas,monospace;"></textarea>'
            + '<input type="file" id="llScriptFile" accept=".txt,text/plain" style="display:none">'
            + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'
            + '<button id="llScriptUp" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(240,147,43,0.55);background:rgba(240,147,43,0.15);color:#f0932b;cursor:pointer;font-size:0.78rem;font-weight:700;">☁ 上传分享（TXT）</button>'
            + '<button id="llScriptPick" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:rgba(255,255,255,0.75);cursor:pointer;font-size:0.78rem;">📁 选择 .txt 文件</button>'
            + '<button id="llScriptSave" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(78,205,196,0.5);background:rgba(78,205,196,0.15);color:#4ecdc4;cursor:pointer;font-size:0.78rem;">💾 只存本机</button>'
            + '<button id="llScriptCopy" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:rgba(255,255,255,0.75);cursor:pointer;font-size:0.78rem;">📋 复制</button>'
            + '</div>'
            + '<div id="llScriptList" style="margin-top:12px;"></div>';
        m.appendChild(box); document.body.appendChild(m);
        const ta = box.querySelector('#llScriptText');
        const listEl = box.querySelector('#llScriptList');
        function _copy(txt, tip) { try { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { try { if (typeof showToast === 'function') showToast(tip, 'info'); } catch (e) {} }).catch(function () {}); } catch (e) {} }
        async function _renderList() {
            const arr = await _llDayScriptsAll(id);
            if (!arr.length) { listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:0.72rem;padding:8px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;">（暂无脚本：粘贴 TXT 文本或选 .txt 文件 → 点「☁ 上传分享」）</div>'; return; }
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.6);font-size:0.7rem;margin-bottom:6px;">该天共 ' + arr.length + ' 个脚本：</div>' + arr.map(function (s) {
                const cloud = !!s.url;
                return '<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:6px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid ' + (cloud ? 'rgba(78,205,196,0.3)' : 'rgba(240,147,43,0.3)') + ';">'
                    + '<span onclick="_llOpenScript(\'' + id + '\',\'' + s.id + '\')" style="cursor:pointer;flex:1;color:' + (cloud ? '#4ecdc4' : '#f0932b') + ';font-size:0.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _esc(s.name) + (s.author ? ' · 分享者：' + _esc(s.author) : '') + '">' + _esc(s.name) + (cloud ? ' ☁' : ' 💾') + (s.author ? ' <span style="opacity:0.6;font-size:0.66rem;">by ' + _esc(s.author) + '</span>' : '') + '</span>'
                    + '<button onclick="_llOpenScript(\'' + id + '\',\'' + s.id + '\')" title="用脚本记事本打开（改颜色/减伤/对比）" style="padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.8);cursor:pointer;font-size:0.72rem;">👁</button>'
                    + '<button onclick="_llImportToLaoMa(\'' + id + '\',\'' + s.id + '\')" title="一键导入到老马" style="padding:3px 8px;border-radius:6px;border:1px solid rgba(255,152,0,0.4);background:rgba(255,152,0,0.12);color:#ff9800;cursor:pointer;font-size:0.72rem;">📁老马</button>'
                    + (s.cloud ? '' : '<button onclick="_llRenameScript(\'' + id + '\',\'' + s.id + '\')" title="改名" style="padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.7);cursor:pointer;font-size:0.72rem;">✏</button>')
                    + (cloud ? '<button onclick="_llImportLocal(\'' + id + '\',\'' + s.id + '\')" title="存一份本机副本" style="padding:3px 8px;border-radius:6px;border:1px solid rgba(78,205,196,0.4);background:rgba(78,205,196,0.12);color:#4ecdc4;cursor:pointer;font-size:0.72rem;">📥副本</button>' : '')
                    + '<button onclick="_llScriptDel(\'' + id + '\',\'' + s.id + '\')" title="删除脚本" style="padding:3px 8px;border-radius:6px;border:1px solid rgba(255,107,107,0.4);background:rgba(255,107,107,0.12);color:#ff6b6b;cursor:pointer;font-size:0.72rem;">🗑</button>'
                    + '</div>';
            }).join('');
        }
        box.querySelector('#llScriptClose').addEventListener('click', function () { m.remove(); });
        m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
        const fileInput = box.querySelector('#llScriptFile');
        let pendingAuto = false;
        fileInput.addEventListener('change', function () { const f = this.files && this.files[0]; if (!f) return; const reader = new FileReader(); reader.onload = function () { ta.value = String(reader.result || ''); if (pendingAuto) { pendingAuto = false; _upload(ta.value.trim(), f.name); } }; reader.onerror = function () { try { if (typeof showToast === 'function') showToast('读文件失败', 'error'); } catch (e) {} }; reader.readAsText(f); });
        // 🔴 选 .txt 文件后自动上传（一键完成）；点「选择文件」即 pendingAuto
        box.querySelector('#llScriptPick').addEventListener('click', function () { pendingAuto = true; fileInput.click(); });
        // 统一产出 .txt 文件名（选文件时沿用原文件名，粘贴时自动生成）
        function _fname(hint) {
            let n = String(hint || '').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim();
            if (!n) n = '活动第' + day + '天_阵容_' + String(Date.now()).slice(-6);
            if (!/\.txt$/i.test(n)) n += '.txt';
            return n;
        }
        // 上传分享：走需求墙同一套 uploadScriptToGist（默认公开分享，返回 raw_url）
        async function _upload(content, hint) {
            if (!content) { try { if (typeof showToast === 'function') showToast('先粘贴 TXT 文本，或点「📁 选择 .txt 文件」', 'warn'); } catch (e) {} return; }
            const fname = _fname(hint);
            const up = box.querySelector('#llScriptUp'); up.disabled = true; up.textContent = '⏳ 上传中…';
            try {
                const url = await window._doScriptUpload(content, fname);
                const sid = _newSid();
                _upsertScript(id, { id: sid, name: fname, content: content, url: url, shared: true });
                _llTrack('阵容图库脚本上传');
                try { if (typeof showToast === 'function') showToast('已上传分享：' + fname, 'success'); } catch (e) {}
                ta.value = ''; _renderList(); if (typeof _llRenderScripts === 'function') _llRenderScripts(id);
                // 🔴 写云端共享索引：写成功=所有人（含网页端）在该天都能看到；失败不回滚（脚本 Gist 已建、raw_url 已拿到）
                let okIdx = false;
                try { okIdx = await _llIdxMutate(function (d) { (d[id] = d[id] || []).unshift({ id: sid, name: fname, url: url, author: _llAuthor(), ts: Date.now() }); }); } catch (e) {}
                try { if (typeof showToast === 'function') showToast(okIdx ? '已加入云端分享列表（所有人可见）' : '注意：云端分享列表写入失败，当前仅本机可见（可稍后重传）', okIdx ? 'success' : 'warn'); } catch (e) {}
            } catch (e) { try { if (typeof showToast === 'function') showToast('上传失败：' + (e && e.message || e) + '（需要已配置 Gist Token）', 'error'); } catch (e2) {} }
            up.disabled = false; up.textContent = '☁ 上传分享（TXT）';
        }
        box.querySelector('#llScriptUp').addEventListener('click', function () { const c = ta.value.trim(); if (!c) { pendingAuto = true; fileInput.click(); return; } _upload(c); });
        box.querySelector('#llScriptSave').addEventListener('click', function () {
            const content = ta.value.trim();
            if (!content) { try { if (typeof showToast === 'function') showToast('先粘贴 TXT 文本或选择 .txt 文件', 'warn'); } catch (e) {} return; }
            _upsertScript(id, { id: _newSid(), name: _fname(), content: content, url: '', shared: false });
            _llTrack('阵容图库保存脚本');
            try { if (typeof showToast === 'function') showToast('已存本机（第' + day + '天）', 'info'); } catch (e) {}
            ta.value = ''; _renderList(); if (typeof _llRenderScripts === 'function') _llRenderScripts(id);
        });
        box.querySelector('#llScriptCopy').addEventListener('click', function () { _copy(ta.value, '脚本内容已复制'); });
        _renderList();
        setTimeout(function () { ta.focus(); }, 0);
    };
    // 🔴 2026-09-23 重做：预览/编辑统一调用项目现成的「脚本记事本」openScriptNotebook
    // （自带改颜色、减伤栏、📊对比、查找替换、📥下载、📁另存/导入项目；与需求墙看 TXT 完全是同一套）
    // 🔴 zAboveSettings:true → 记事本走 100000+ 层级，盖过阵容图库面板(99996)/脚本弹窗(100001)，不会再被挡在后面
    window._llOpenScript = async function (id, sid) {
        const s = await _llFindScript(id, sid); if (!s) return;
        if (typeof window.openScriptNotebook !== 'function') { try { if (typeof showToast === 'function') showToast('脚本记事本未加载，请刷新页面后重试', 'error'); } catch (e) {} return; }
        if (s.content) { window.openScriptNotebook({ name: s.name, content: s.content, fileIndex: -1, zAboveSettings: true }); return; }
        // 云端脚本（本机只有链接没有正文）→ 内联 fetch raw 再交给记事本
        // 注：previewScriptFile 是 app-core 的私有函数（从未挂到 window），不能依赖
        if (s.url) {
            try { if (typeof showToast === 'function') showToast('正在拉取云端脚本…', 'info'); } catch (e) {}
            try {
                const txt = await fetch(s.url).then(function (r) { return r.text(); });
                window.openScriptNotebook({ name: s.name, content: txt || '', fileIndex: -1, zAboveSettings: true });
            } catch (e) { try { if (typeof showToast === 'function') showToast('云端脚本拉取失败', 'error'); } catch (e2) {} }
            return;
        }
        window.openScriptNotebook({ name: s.name, content: '', fileIndex: -1, zAboveSettings: true });
    };
    // 删除脚本：本机直接删；云端先删 Gist 再移除引用
    window._llScriptDel = async function (id, sid) {
        const s = await _llFindScript(id, sid); if (!s) return;
        const isCloud = !!s.url;
        if (!confirm('确定删除该' + (isCloud ? '云端' : '本机') + '脚本？' + (isCloud ? '（云端 Gist 也会一并删除，不可恢复）' : ''))) return;
        if (isCloud) {
            try { await window._deleteGist(s.url); }
            catch (e) { try { if (typeof showToast === 'function') showToast('删除云端失败：' + (e && e.message || e) + '，仅移除引用', 'error'); } catch (e2) {} }
            // 从云端共享索引剔除（失败只提示，不回滚本机）
            try { await _llIdxMutate(function (d) { if (d[id]) d[id] = d[id].filter(function (x) { return x.url !== s.url; }); }); } catch (e) {}
            _llCloudCache = null;
        }
        _delScript(id, sid);   // 纯云端条目本机无记录，此步为空操作
        try { if (typeof showToast === 'function') showToast('已删除脚本', 'info'); } catch (e) {}
        _llRefresh(id);
    };
    // 🔴 列表刷新：右侧常驻列表 + 弹窗列表（弹窗开着就重建，保证两处一致）
    function _llRefresh(id) {
        if (typeof _llRenderScripts === 'function') _llRenderScripts(id);
        if (document.getElementById('llScriptDlg') && typeof _llScriptDlg === 'function') _llScriptDlg(id);
    }
    // 一键导入到老马：复用项目现成的 importToLaoMaFromWall（桌面端 Tauri 写老马目录）
    window._llImportToLaoMa = async function (id, sid) {
        const s = await _llFindScript(id, sid); if (!s) return;
        let url = s.url;
        if (!url) {
            try { if (typeof showToast === 'function') showToast('未分享，先上传到脚本分享再导入老马…', 'info'); } catch (e) {}
            url = await window._doScriptUpload(s.content, s.name);
            _upsertScript(id, { id: sid, name: s.name, content: s.content, url: url, shared: true });
            _llTrack('阵容图库脚本上传');
            _llRefresh(id);
        }
        if (typeof window.importToLaoMaFromWall === 'function') {
            window.importToLaoMaFromWall(url, s.name);
        } else {
            alert('导入到老马功能仅限桌面版 App 使用（网页版请点「📥 下载」后手动导入老马）');
        }
    };
    // 改名（自定义弹窗，避免 Tauri 桌面端 prompt 返回 null 失效）
    window._llRenameScript = async function (id, sid) {
        const s = await _llFindScript(id, sid); if (!s) return;
        const m = document.createElement('div'); m.id = 'llRenameModal';
        m.style.cssText = 'position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
        m.innerHTML = '<div style="background:#1a1a2e;border:2px solid rgba(240,147,43,0.5);border-radius:14px;padding:22px;width:min(420px,92vw);"><h3 style="margin:0 0 12px;color:#f0932b;text-align:center;font-size:0.95rem;">✏ 脚本改名</h3>'
            + '<input id="llRenameInput" value="' + _esc(s.name) + '" style="width:100%;padding:9px;border-radius:8px;border:1px solid rgba(240,147,43,0.3);background:#2a2a4a;color:#fff;box-sizing:border-box;font-size:0.9rem;">'
            + '<div style="display:flex;gap:10px;margin-top:16px;"><button id="llRenameOk" style="flex:1;padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;cursor:pointer;font-size:0.9rem;">确认</button><button id="llRenameCancel" style="flex:1;padding:10px;border:none;border-radius:8px;background:#666;color:#fff;cursor:pointer;font-size:0.9rem;">取消</button></div></div>';
        document.body.appendChild(m);
        const inp = m.querySelector('#llRenameInput'); inp.focus(); inp.select();
        function _do() { const v = (inp.value || '').trim(); if (!v) { alert('名称不能为空'); return; } m.remove(); _upsertScript(id, { id: sid, name: v, content: s.content, url: s.url, shared: s.shared }); _llTrack('阵容图库脚本改名'); try { if (typeof showToast === 'function') showToast('已改名：' + v, 'info'); } catch (e) {} _llRefresh(id); }
        m.querySelector('#llRenameOk').addEventListener('click', _do);
        m.querySelector('#llRenameCancel').addEventListener('click', function () { m.remove(); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') _do(); });
    };
    // 删除 Gist（从 raw_url 解析 gist id）
    window._deleteGist = async function (url) {
        const m1 = (url || '').match(/gist(?:usercontent)?\.com\/(?:[^/]+\/)?([a-f0-9]{20,})\//);
        const gid = (m1 && m1[1]) || (url || '').match(/gists\/([a-f0-9]{20,})/);
        const id = gid && gid[1] ? gid[1] : gid;
        if (!id) throw new Error('无法从链接解析 Gist ID');
        const token = (typeof window.getGistToken === 'function') ? window.getGistToken() : '';
        if (!token) throw new Error('无 Gist Token（请在主页设置里配置）');
        const r = await fetch('https://api.github.com/gists/' + id, { method: 'DELETE', headers: { 'Authorization': 'token ' + token } });
        if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
        return true;
    };
    // 存一份本机副本（云端脚本本机没有正文 → 先 fetch，否则副本是空的）
    window._llImportLocal = async function (id, sid) {
        const s = await _llFindScript(id, sid); if (!s) return;
        let content = s.content || '';
        if (!content && s.url) { try { content = await fetch(s.url).then(function (r) { return r.text(); }); } catch (e) { content = ''; } }
        _upsertScript(id, { id: _newSid(), name: s.name + '（本地副本）', content: content, url: '', shared: false });
        _llTrack('阵容图库导入脚本本地');
        try { if (typeof showToast === 'function') showToast(content ? '已存一份本机副本' : '副本为空（云端内容拉取失败）', content ? 'success' : 'warn'); } catch (e) {}
        _llRefresh(id);
    };
    // ---------- 大航海（一排一套：#N + 10卡槽 + 主副车；第二行小字波次备注） ----------
    function _cartSelect(tab, id, field, cur) {
        let h = '<select onchange="_llSet(\'' + tab + '\',\'' + id + '\',\'' + field + '\',null,this.value)" style="padding:3px 6px;border-radius:6px;border:1px solid rgba(255,215,0,0.35);background:#2a2a4a;color:#ffd700;font-size:0.75rem;">';
        h += '<option value="">未设置</option>';
        (window.CHARIOT_LIST || []).forEach(function (cn, i) { h += '<option value="' + (i + 1) + '"' + (String(cur) === String(i + 1) ? ' selected' : '') + '>' + _esc(cn) + '</option>'; });
        h += '</select>';
        return h;
    }
    function _sailCard(s) {
        const L = _slot('sailing', s.id);
        let h = '<div class="ll-card" style="border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 9px;margin-bottom:10px;background:rgba(0,0,0,0.22);">';
        // 组头：#N + 主车 + 副车 + 减伤（小字，在卡组上方）
        h += '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;">';
        h += '<b style="color:#4ecdc4;font-size:0.85rem;">#' + s.n + '</b>';
        h += '<span style="color:rgba(255,255,255,0.5);font-size:0.66rem;">主</span>' + _cartSelect('sailing', s.id, 'cart', L.cart);
        h += '<span style="color:rgba(255,255,255,0.5);font-size:0.66rem;">副</span>' + _cartSelect('sailing', s.id, 'cart2', L.cart2);
        h += '<span class="ll-drsum" data-tab="sailing" data-lid="' + _esc(s.id) + '" data-side="my" data-table="我的" data-heroes="' + _esc(JSON.stringify(s.heroes)) + '" title="减伤明细" style="color:#ff8a80;font-size:0.66rem;font-weight:700;cursor:help;">🛡️…</span>';
        h += '</div>';
        // 卡组（5×2）+ 右侧波次备注列（🔴 2026-09-22 用户要求：备注放卡组右边，正好填补空白）
        h += '<div style="display:flex;align-items:flex-start;gap:10px;">';
        h += '<div style="display:grid;grid-template-columns:repeat(5,72px);gap:6px;">';
        s.heroes.forEach(function (n, i) { h += _slotHtml(i < 5 ? 'u' : 'd', i % 5, n, 'sailing', s.id, 72); });
        h += '</div>';
        h += '<div style="flex:1;min-width:150px;display:flex;flex-direction:column;gap:3px;padding-top:2px;">';
        [['n219', '219波'], ['n229', '229波'], ['n230', '230波'], ['other', '其他']].forEach(function (p2) {
            const val = (L.notes && L.notes[p2[0]]) || '';
            h += '<div style="display:flex;align-items:center;gap:4px;">';
            h += '<span style="color:#f0932b;font-size:0.66rem;font-weight:700;flex:0 0 auto;">' + p2[1] + '</span>';
            h += '<input value="' + _esc(val) + '" oninput="_llSet(\'sailing\',\'' + s.id + '\',\'notes\',\'' + p2[0] + '\',this.value)" placeholder="上什么卡…" style="flex:1;min-width:0;padding:2px 5px;border-radius:5px;border:1px solid rgba(240,147,43,0.3);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:0.68rem;">';
            h += '</div>';
        });
        h += '<button onclick="_llReset(\'sailing\',\'' + s.id + '\')" style="align-self:flex-end;padding:1px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.66rem;cursor:pointer;">↺ 重置</button>';
        h += '</div>';
        h += '</div>';
        h += '</div>';   // 🔴 收卡片本体（v6 误删导致所有卡嵌进第一张 → 网格只剩 1 个子项 → 两列失效）
        return h;
    }
    // ---------- 活动阵容卡片（左 A/B 卡组 右战车） ----------
    function _actCard(a) {
        let h = '<div class="ll-card" style="border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:6px 9px;margin-bottom:10px;background:rgba(0,0,0,0.22);">';
        h += '<div style="display:flex;align-items:flex-start;gap:14px;">';
        // 🔴 2026-09-24 用户反馈：A/B 两组间距太小不好区分 → 两组间距 10→14px，并给每组加淡色描边+底色（A 青 / B 橙）
        // 🔴 2026-09-23 用户要求：删掉左侧「第N天 + ↺重置」竖列，两者都塞进第一行（A 组组头行）
        //    行内顺序：第N天 → A组 → 主车 → 副车 → 🛡️减伤 → ↺重置（重置放在减伤后面）
        //    竖列腾出的宽度留给战车下拉，车名能多显示几个字
        // A/B 两组并排：组头（A/B + 主车 + 副车 + 减伤）在上，5×2 网格在下
        ['A', 'B'].forEach(function (ab) {
            const id = 'd' + a.day + ab;
            const L = _slot('activity', id);
            const st = (ab === 'A') ? { side: 'my', table: '我的' } : { side: 'teammate', table: '队友' };
            // 🔴 2026-09-24 A 组淡青框 / B 组淡橙框：两块一眼分得开（颜色与「A组/B组」文字色一致）
            h += '<div style="border-radius:9px;padding:4px 7px 7px;background:' + (ab === 'A' ? 'rgba(78,205,196,0.07)' : 'rgba(240,147,43,0.07)') + ';border:1px solid ' + (ab === 'A' ? 'rgba(78,205,196,0.32)' : 'rgba(240,147,43,0.32)') + ';">';
            h += '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            if (ab === 'A') h += '<b style="color:#ffd700;font-size:0.8rem;margin-right:2px;white-space:nowrap;">第' + a.day + '天</b>';
            h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.76rem;">' + ab + '组</span>';
            h += '<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">主</span>' + _cartSelect('activity', id, 'cart', L.cart);
            h += '<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">副</span>' + _cartSelect('activity', id, 'cart2', L.cart2);
            h += '<span class="ll-drsum" data-tab="activity" data-lid="d' + a.day + '" data-side="' + st.side + '" data-table="' + st.table + '" data-heroes="' + _esc(JSON.stringify(a[ab] || [])) + '" title="减伤明细" style="color:#ff8a80;font-size:0.64rem;font-weight:700;cursor:help;">🛡️…</span>';
            if (ab === 'A') h += '<button onclick="_llReset(\'activity\',\'d' + a.day + '\')" title="重置该天个人设置（英雄/融合/皮肤/脚本）" style="padding:2px 6px;border-radius:6px;border:1px solid rgba(255,107,107,0.45);background:rgba(255,107,107,0.14);color:#ff6b6b;cursor:pointer;font-size:0.62rem;font-weight:700;white-space:nowrap;">↺ 重置</button>';
            h += '</div>';
            h += '<div style="display:grid;grid-template-columns:repeat(5,94px);gap:6px;">';
            (a[ab] || []).forEach(function (n, i) { h += _slotHtml(ab.toLowerCase(), i, n, 'activity', 'd' + a.day, 94); });
            h += '</div></div>';
        });
        const _arrScripts = _dayScripts('d' + a.day);   // 🔴 天级多脚本（与 A/B 槽位分开）
        h += '<div style="align-self:flex-start;display:flex;flex-direction:column;gap:5px;min-width:108px;">';
        h += '<button id="llScriptBtn-d' + a.day + '" onclick="_llScriptDlg(\'d' + a.day + '\')" title="管理该天活动脚本（TXT 上传分享 / 记事本打开 / 导入老马）" style="padding:5px 10px;border-radius:7px;border:1px solid rgba(240,147,43,0.45);background:rgba(240,147,43,0.12);color:#f0932b;font-size:0.74rem;font-weight:700;cursor:pointer;text-align:left;">📜 阵容脚本（' + _arrScripts.length + '）</button>';
        h += '<div id="llScripts-d' + a.day + '">' + _scriptsHtml(_arrScripts, 'd' + a.day) + '</div>';
        h += '</div>';
        h += '</div></div>';
        return h;
    }

    /* ===== 精选阵容：管理员从本机项目 / projects 勾选添加，按 category 分区展示（复用活动阵容渲染） ===== */
let _adminVerified=false, _adminLastTok='', _featItems=[], _featData=null, _featCollapsed={}, _featCats=[], _featLocal=null;
    function _isAdmin(){ return _adminVerified; }
    async function _ensureAdmin(){
        const tok=_llTok();
        if(tok===_adminLastTok) return _adminVerified;
        _adminLastTok=tok; _adminVerified=false;
        if(!tok) return false;
        try{
            const r=await fetch('https://api.github.com/user',{headers:{'Accept':'application/vnd.github.v3+json','Authorization':'token '+tok}});
            if(r.ok){ const u=await r.json(); if(u.login==='gyq-svip') _adminVerified=true; }
        }catch(e){}
        if(_adminVerified){ _renderHead(); if(state.tab==='featured') _renderList(); }
        return _adminVerified;
    }
    async function _featuredLoad(){ const gid=_LL_IDX_GIST; const tok=_llTok(); const tries=tok?[tok,'']:['']; for(let k=0;k<tries.length;k++){ const t=tries[k]; try{ const r=await fetch('https://api.github.com/gists/'+gid,{headers:t?{'Accept':'application/vnd.github.v3+json','Authorization':'token '+t}:{'Accept':'application/vnd.github.v3+json'}}); if(!r.ok) continue; const d=await r.json(); const f=d.files && d.files['featured_lineups.json']; if(!f) return {items:[]}; let txt=f.content; if(f.truncated) txt=await fetch(f.raw_url).then(x=>x.text()); try{ const j=JSON.parse(txt); return (j && Array.isArray(j.items))?j:{items:[]}; }catch(e){ return {items:[]}; } }catch(e){} } return {items:[]}; }
    async function _featuredSave(items){ if(!await _ensureAdmin()) return false; const tok=_llTok(); if(!tok) return false; try{ const r=await fetch('https://api.github.com/gists/'+_LL_IDX_GIST,{method:'PATCH',headers:{'Accept':'application/vnd.github.v3+json','Content-Type':'application/json','Authorization':'token '+tok},body:JSON.stringify({files:{'featured_lineups.json':{content:JSON.stringify({items:items},null,2)}}})}); return r.ok; }catch(e){ return false; } }
    function _normPj(pj){ return (pj && pj.project) ? pj.project : (pj || {}); }
    function _featSlug(item){ return 'feat_' + String(item.id || item.name || 'x').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g,'_'); }
    function _featuredSync(item,pj){ const slug=_featSlug(item); const o=_load(); ['A','B'].forEach(function(ab){ const id=slug+'_'+ab; o['featured']=o['featured']||{}; o['featured'][id]=o['featured'][id]||{}; const slot=o['featured'][id]; const prefix=(ab==='A')?'my_':'teammate_'; const cards=(ab==='A'?pj.myHandCards:pj.teammateHandCards)||[]; const rawSkins=pj.cardSkins||{}; if(!slot.skin || !Object.keys(slot.skin).length){ slot.skin=slot.skin||{}; cards.forEach(function(c){ if(!c||c.id==null) return; const sv=rawSkins[prefix+c.id]; if(c.name&&sv!=null) slot.skin[c.name]=sv; }); } if(!slot.fus || !Object.keys(slot.fus).length){ slot.fus=slot.fus||{}; cards.forEach(function(c){ const nm=(c&&c.name)||''; if(!nm) return; const parts=(window.getFusionParts?window.getFusionParts(nm):null); if(parts&&parts.length>=2) slot.fus[nm]=nm; }); } const ch=(ab==='A'?pj.myChariot:pj.teammateChariot); if(!slot.cart && ch && ch.main) slot.cart=String(ch.main); if(!slot.cart2 && ch && ch.sub) slot.cart2=String(ch.sub); }); const fs=pj.fusionSkins||{}; window.fusionSkins=window.fusionSkins||{}; Object.keys(fs).forEach(function(h){ if(fs[h]!==undefined) window.fusionSkins[h]=fs[h]; }); _save(o); }
    function _featuredCard(item,pj,idx,src){ const slug=_featSlug(item); const title=item.name || pj.name || '未命名'; const aH=(pj.myHandCards||[]).map(function(c){return c.name||c;}); const bH=(pj.teammateHandCards||[]).map(function(c){return c.name||c;}); let h='<div class="ll-card" style="border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:6px 9px;margin-bottom:10px;background:rgba(0,0,0,0.22);">'; h+='<div style="display:flex;align-items:flex-start;gap:14px;">'; ['A','B'].forEach(function(ab){ const id=slug+'_'+ab; const L=_slot('featured',id); const st=(ab==='A')?{side:'my',table:'我的'}:{side:'teammate',table:'队友'}; h+='<div style="border-radius:9px;padding:4px 7px 7px;background:'+(ab==='A'?'rgba(78,205,196,0.07)':'rgba(240,147,43,0.07)')+';border:1px solid '+(ab==='A'?'rgba(78,205,196,0.32)':'rgba(240,147,43,0.32)')+';">'; h+='<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:4px;">'; if(ab==='A') h+='<b style="color:#ffd700;font-size:0.82rem;margin-right:4px;white-space:nowrap;">'+_esc(title)+'</b>'; h+='<span style="font-weight:800;color:'+(ab==='A'?'#4ecdc4':'#f0932b')+';font-size:0.76rem;">'+ab+'组</span>'; h+='<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">主</span>'+_cartSelect('featured',id,'cart',L.cart); h+='<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">副</span>'+_cartSelect('featured',id,'cart2',L.cart2); h+='<span class="ll-drsum" data-tab="featured" data-lid="'+id+'" data-side="'+st.side+'" data-table="'+st.table+'" data-heroes="'+_esc(JSON.stringify(ab==='A'?aH:bH))+'" title="减伤明细" style="color:#ff8a80;font-size:0.64rem;font-weight:700;cursor:help;">减伤</span>'; if(ab==='A'){ h+='<button onclick="_llReset(&quot;featured&quot;,&quot;'+slug+'_A&quot;)" title="重置该阵容个人设置" style="padding:2px 6px;border-radius:6px;border:1px solid rgba(255,107,107,0.45);background:rgba(255,107,107,0.14);color:#ff6b6b;cursor:pointer;font-size:0.62rem;font-weight:700;white-space:nowrap;">重置</button>'; if(src==='local'){ h+='<button onclick="_featuredRemove('+idx+',\'local\')" title="删除该本地阵容（仅本机移除）" style="padding:2px 6px;border-radius:6px;border:1px solid rgba(255,107,107,0.45);background:rgba(255,107,107,0.14);color:#ff6b6b;cursor:pointer;font-size:0.62rem;font-weight:700;white-space:nowrap;">删除(本机)</button>'; } else if(_isAdmin()){ h+='<button onclick="_featuredRemove('+idx+',\'pub\')" title="删除该精选阵容（所有人都会看不到）" style="padding:2px 6px;border-radius:6px;border:1px solid rgba(255,107,107,0.45);background:rgba(255,107,107,0.14);color:#ff6b6b;cursor:pointer;font-size:0.62rem;font-weight:700;white-space:nowrap;">删除</button>'; } } h+='</div>'; h+='<div style="display:grid;grid-template-columns:repeat(5,94px);gap:6px;">'; (ab==='A'?aH:bH).forEach(function(n,i){ h+=_slotHtml(ab.toLowerCase(),i,n,'featured',id,94); }); h+='</div></div>'; }); const sc=_dayScripts(slug); h+='<div style="align-self:flex-start;display:flex;flex-direction:column;gap:5px;min-width:108px;">'; h+='<button id="llScriptBtn-'+slug+'" onclick="_llScriptDlg(&quot;'+slug+'&quot;)" title="管理该阵容脚本" style="padding:5px 10px;border-radius:7px;border:1px solid rgba(240,147,43,0.45);background:rgba(240,147,43,0.12);color:#f0932b;font-size:0.74rem;font-weight:700;cursor:pointer;text-align:left;">阵容脚本（'+sc.length+'）</button>'; h+='<div id="llScripts-'+slug+'">'+(typeof _scriptsHtml==='function'?_scriptsHtml(sc,slug):'')+'</div>'; h+='</div>'; h+='</div></div>'; return h; }
    function _featHash(s){ let h=5381; for(let i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; } return h.toString(36); }
    function _featCacheKey(){ return 'tfjl_feat_cache_v1'; }
    function _idbOpen(){ return new Promise(function(res,rej){ try{ const r=indexedDB.open('tfjl_feat',1); r.onupgradeneeded=function(){ const db=r.result; if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); }; r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }catch(e){ rej(e); } }); }
    async function _idbGet(k){ try{ const db=await _idbOpen(); return await new Promise(function(res){ const tx=db.transaction('kv','readonly'); const rq=tx.objectStore('kv').get(k); rq.onsuccess=function(){ res(rq.result); }; rq.onerror=function(){ res(null); }; }); }catch(e){ return null; } }
    async function _idbSet(k,v){ try{ const db=await _idbOpen(); return await new Promise(function(res){ const tx=db.transaction('kv','readwrite'); tx.objectStore('kv').put(v,k); tx.oncomplete=function(){ res(true); }; tx.onerror=function(){ res(false); }; }); }catch(e){ return false; } }
    async function _featLocalLoad(){ const v=await _idbGet('local'); return (v&&Array.isArray(v.items))?v:null; }
    async function _featLocalSave(items){ await _idbSet('local',{ts:Date.now(),items:items}); }
    async function _featResolve(items){
        items.forEach(function(it,i){ if(!it.id) it.id=_featSlug({name:(it.name||'x')+'_'+i}); });
        const projs=await Promise.all(items.map(async function(it,i){
            let pj=null; try{ if(it.data) pj=_normPj(it.data); else if(it.file){ const pr=await fetch('projects/'+it.file); if(pr.ok) pj=_normPj(await pr.json()); } }catch(e){}
            return {item:it,pj:pj,idx:i};
        }));
        projs.forEach(function(o){ try{ if(o.pj) _featuredSync(o.item,o.pj); }catch(e){} });
        return projs;
    }
    function _featApplyPub(items,projs){ _featData={items:items,projs:projs}; _featCacheHash=_featHash(JSON.stringify(items)); }
    async function _featuredLoadRaw(){
        try{ const r=await fetch('https://gist.githubusercontent.com/gyq-svip/'+_LL_IDX_GIST+'/raw/featured_lineups.json',{cache:'no-store'}); if(!r.ok) return null; const txt=await r.text(); try{ const j=JSON.parse(txt); return (j&&Array.isArray(j.items))?j:{items:[]}; }catch(e){ return null; } }catch(e){ return null; }
    }
    async function _renderFeatured(force){
        const p=document.getElementById('llList'); if(!p) return;
        try{ const lc=await _featLocalLoad(); _featLocal=(lc&&lc.items&&lc.items.length)?{items:lc.items,projs:await _featResolve(lc.items)}:{items:[],projs:[]}; }catch(e){ _featLocal={items:[],projs:[]}; }
        const cache=await _idbGet('pub');
        if(!force && cache && cache.items && cache.items.length){
            _featApplyPub(cache.items, cache.projs);
        } else {
            p.innerHTML='<div style="color:rgba(255,255,255,0.5);padding:16px;">加载精选阵容中</div>';
            await _ensureAdmin();
            let list={items:[]}; try{ list=await _featuredLoad()||{items:[]}; }catch(e){}
            const items=list.items||[]; const projs=await _featResolve(items);
            _featApplyPub(items, projs);
            await _idbSet('pub',{hash:_featCacheHash,items:items,projs:projs});
        }
        _renderFeaturedBody(p);
        if(!_adminVerified){ await _ensureAdmin(); if(state.tab==='featured') _renderFeaturedBody(p); }
        _featStartHeartbeat();
    }
    let _featHbTimer=null, _featCacheHash='';
    function _featHbIntervalMs(){
        // 与诊断心跳一致：基础间隔 + 抖动均来自「索引配置」(heartbeatMin / heartbeatJitterMin)，管理员可在功能开关面板实时调；默认 15±5 分钟
        let baseMin=15, jitterMin=5;
        try{ const d=_llCloudCache && _llCloudCache.data; if(d){ if(d.heartbeatMin){ const v=parseFloat(d.heartbeatMin); if(v>0) baseMin=v; } if(d.heartbeatJitterMin!=null){ const v=parseFloat(d.heartbeatJitterMin); if(v>=0) jitterMin=v; } } }catch(e){}
        return baseMin*60000 + Math.random()*jitterMin*60000;
    }
    function _featStartHeartbeat(){
        const _restart=function(){ if(_featHbTimer) clearInterval(_featHbTimer); _featHbTimer=setInterval(async function(){ try{ if(document.hidden || state.tab!=='featured') return; const list=await _featuredLoadRaw(); if(!list||!Array.isArray(list.items)) return; const h=_featHash(JSON.stringify(list.items)); if(h===_featCacheHash) return; const projs=await _featResolve(list.items); _featApplyPub(list.items, projs); await _idbSet('pub',{hash:h,items:list.items,projs:projs}); _renderFeaturedBody(document.getElementById('llList')); }catch(e){} }, _featHbIntervalMs()); };
        _restart();
        // 索引配置可能随后到位 / 被管理员调频：拿到后按最新间隔重启，使远程调频对精选检测也立即生效
        _llIdxLoad().then(function(){ try{ _restart(); }catch(e){} }).catch(function(){});
    }
    function _renderFeaturedBody(p){
        if(!p) return;
        const pubItems=(_featData&&_featData.items)||[]; const pubProjs=(_featData&&_featData.projs)||[];
        const locItems=(_featLocal&&_featLocal.items)||[]; const locProjs=(_featLocal&&_featLocal.projs)||[];
        let h='';
        if(locItems.length){
            h+='<div style="margin:10px 0 4px;color:#f0932b;font-weight:800;font-size:0.92rem;">我的本地阵容（仅本机显示）</div>';
            const _badLocalCard=function(li){ return '<div style="border:1px solid rgba(255,107,107,0.4);border-radius:10px;padding:8px;margin-bottom:10px;background:rgba(255,107,107,0.1);color:#ff6b6b;font-size:0.78rem;">该本地阵容数据异常。<button onclick="_featuredRemove('+li+',\'local\')" style="margin-left:8px;padding:2px 8px;border-radius:6px;border:1px solid rgba(255,107,107,0.5);background:rgba(255,107,107,0.15);color:#ff6b6b;cursor:pointer;">删除</button></div>'; };
            locProjs.forEach(function(o,li){ if(!o.pj){ h+=_badLocalCard(li); return; } try{ h+=_featuredCard(o.item,o.pj,li,'local'); }catch(e){ h+=_badLocalCard(li); } });
        }
        if(pubItems.length){
            const groups={}; pubProjs.forEach(function(o){ const cat=o.item.category || (o.pj&&o.pj.category) || '其他'; (groups[cat]=groups[cat]||[]).push(o); });
            _featCats=Object.keys(groups);
            const _badCard=function(idx){ return '<div style="border:1px solid rgba(255,107,107,0.4);border-radius:10px;padding:8px;margin-bottom:10px;background:rgba(255,107,107,0.1);color:#ff6b6b;font-size:0.78rem;">该精选数据异常，无法渲染。<button onclick="_featuredRemove('+idx+',\'pub\')" style="margin-left:8px;padding:2px 8px;border-radius:6px;border:1px solid rgba(255,107,107,0.5);background:rgba(255,107,107,0.15);color:#ff6b6b;cursor:pointer;">删除</button></div>'; };
            _featCats.forEach(function(cat,ci){
                if(_featCollapsed[cat]===undefined) _featCollapsed[cat]=(cat!=='深海');
                const collapsed=_featCollapsed[cat];
                const cid=cat.replace(/[^A-Za-z0-9_\u4e00-\u9fa5]/g,'_');
                h+='<div style="margin:10px 0 4px;">';
                h+='<div onclick="_featToggleCat('+ci+')" style="cursor:pointer;display:flex;align-items:center;gap:6px;color:#4ecdc4;font-weight:800;font-size:0.92rem;user-select:none;"><span style="display:inline-block;transform:rotate('+(collapsed?-90:0)+'deg);transition:transform .15s;">\u25be</span><span>'+_esc(cat)+'</span><span style="color:rgba(255,255,255,0.4);font-size:0.7rem;font-weight:400;">('+groups[cat].length+')</span></div>';
                h+='<div id="featCat-'+cid+'" style="'+(collapsed?'display:none;':'')+'">';
                groups[cat].forEach(function(o){ if(!o.pj){ if(_isAdmin()) h+=_badCard(o.idx); return; } try{ h+=_featuredCard(o.item,o.pj,o.idx,'pub'); }catch(e){ if(_isAdmin()) h+=_badCard(o.idx); } });
                h+='</div></div>';
            });
        }
        if(!h){ p.innerHTML='<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;">还没有阵容。'+(_isAdmin()?'点上方「添加精选」贡献，或「添加本地阵容」展示自己的。':'点上方「添加本地阵容」展示自己的阵容。')+'</div>'; return; }
        p.innerHTML=h; _applySlots(p); _refreshDrSums(p);
    }
    window._featToggleCat=function(ci){ const cat=_featCats[ci]; if(!cat) return; if(_featCollapsed[cat]===undefined) _featCollapsed[cat]=(cat!=='深海'); _featCollapsed[cat]=!_featCollapsed[cat]; _renderFeaturedBody(document.getElementById('llList')); };
    window._featuredAddDlg = async function(){
        const old=document.getElementById('featAddDlg'); if(old) old.remove();
        if(!await _ensureAdmin()){ try{ if(typeof showToast==='function') showToast('仅管理员可添加精选阵容','error'); }catch(e){} return; }
        let web=[]; try{ const r=await fetch('projects/index.json'); if(r.ok){ const j=await r.json(); if(Array.isArray(j)) web=j.map(function(x){return {source:'web',file:x.file,name:x.name||x.file,category:x.category||'其他'};}); } }catch(e){}
        let local=[]; try{ if(typeof window.__tfjlLoadProjectList==='function'){ const arr=await window.__tfjlLoadProjectList(); if(Array.isArray(arr)) local=arr.map(function(x){return {source:'local',proj:x,name:x.name||'未命名',category:x.category||'其他'};}); } }catch(e){}
        const cur=await _featuredLoad(); const curSet={}; (cur.items||[]).forEach(function(x){ curSet[x.name]=1; if(x.file) curSet[x.file]=1; });
        const opts=[];
        local.forEach(function(x){ if(!curSet[x.name]){ opts.push(x); curSet[x.name]=1; } });
        web.forEach(function(x){ if(!curSet[x.file]){ opts.push(x); curSet[x.file]=1; } });
        const cats={}; opts.forEach(function(x){ const c=x.category||'其他'; (cats[c]=cats[c]||[]).push(x); });
        let body=''; Object.keys(cats).forEach(function(c){ body+='<div style="color:#4ecdc4;font-weight:700;margin:6px 0 2px;">'+_esc(c)+'</div>'; cats[c].forEach(function(x){ body+='<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.82rem;color:rgba(255,255,255,0.85);cursor:pointer;"><input type="checkbox" data-source="'+_esc(x.source)+'" data-name="'+_esc(x.name)+'" data-category="'+_esc(x.category||'其他')+'" '+(x.file?'data-file="'+_esc(x.file)+'" ':'')+'style="accent-color:#9c27b0;cursor:pointer;"><span style="flex:1;">'+_esc(x.name)+'</span><span style="color:rgba(255,255,255,0.4);font-size:0.65rem;">'+_esc(x.source==='local'?'本机':'线上')+'</span></label>'; }); });
        if(!body) body='<div style="color:rgba(255,255,255,0.4);padding:10px;text-align:center;">没有可添加的项目</div>';
        const m=document.createElement('div'); m.id='featAddDlg'; m.style.cssText='position:fixed;inset:0;z-index:100004;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
        const box=document.createElement('div'); box.style.cssText='width:min(460px,92vw);max-height:86vh;overflow:auto;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(156,39,176,0.5);border-radius:12px;padding:14px;';
        box.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><b style="color:#ce93d8;font-size:0.95rem;">添加精选阵容</b><span style="flex:1;"></span><button id="featAddClose" style="background:transparent;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">x</button></div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;margin-bottom:8px;">勾选要展示的项目（支持本机项目 + projects 目录，按 category 分区显示，添加后全员可见）</div>'+body+'<div style="display:flex;gap:8px;margin-top:12px;"><button id="featAddSave" style="flex:1;padding:9px;border:none;border-radius:8px;background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:#fff;cursor:pointer;font-size:0.85rem;font-weight:700;">保存</button><button id="featAddCancel" style="padding:9px 14px;border:none;border-radius:8px;background:#666;color:#fff;cursor:pointer;font-size:0.85rem;">取消</button></div>';
        m.appendChild(box); document.body.appendChild(m);
        m.querySelector('#featAddClose').addEventListener('click',function(){m.remove();});
        m.querySelector('#featAddCancel').addEventListener('click',function(){m.remove();});
        m.addEventListener('click',function(e){ if(e.target===m) m.remove(); });
        m.querySelector('#featAddSave').addEventListener('click',async function(){
            const checked=Array.from(box.querySelectorAll('input[data-source]')).filter(function(c){return c.checked;});
            const items=(cur.items||[]).slice();
            const seen={}; items.forEach(function(x){ if(x.name) seen[x.name]=1; if(x.file) seen[x.file]=1; });
            for(let i=0;i<checked.length;i++){
                const c=checked[i]; const source=c.getAttribute('data-source'); const name=c.getAttribute('data-name'); const category=c.getAttribute('data-category')||'其他';
                let data=null;
                try{
                    if(source==='local'){
                        const x=local.find(function(z){return z.name===name;});
                        if(x && x.proj) data=JSON.parse(JSON.stringify(x.proj));
                    }else{
                        const file=c.getAttribute('data-file');
                        if(file){ const r=await fetch('projects/'+file); if(r.ok) data=_normPj(await r.json()); }
                    }
                }catch(e){}
                if(data){ const kf=c.getAttribute('data-file'); if(!seen[name] && (!kf || !seen[kf])){ if(name) seen[name]=1; if(kf) seen[kf]=1; items.push({id:_featSlug({name:name+'_'+i}),name:name,category:category,data:data}); } }
            }
            const ok=await _featuredSave(items);
            if(ok){ try{ if(typeof showToast==='function') showToast('已保存精选阵容（全员可见）','success'); }catch(e){} m.remove(); try{ await _idbSet('pub',{items:[],projs:[]}); }catch(e){} _featData=null; _llTab('featured'); }
            else { try{ if(typeof showToast==='function') showToast('保存失败：需配置管理员 Gist Token','error'); }catch(e){} }
        });
    };
    window._featLocalAddDlg = async function(){
        const old=document.getElementById('featLocalAddDlg'); if(old) old.remove();
        let local=[]; try{ if(typeof window.__tfjlLoadProjectList==='function'){ const arr=await window.__tfjlLoadProjectList(); if(Array.isArray(arr)) local=arr.map(function(x){return {source:'local',proj:x,name:x.name||'未命名',category:x.category||'其他'};}); } }catch(e){}
        const loc=await _featLocalLoad(); const locSet={}; (loc&&loc.items||[]).forEach(function(x){ locSet[x.name]=1; });
        const opts=local.filter(function(x){ return !locSet[x.name]; });
        const cats={}; opts.forEach(function(x){ const c=x.category||'其他'; (cats[c]=cats[c]||[]).push(x); });
        let body=''; Object.keys(cats).forEach(function(c){ body+='<div style="color:#4ecdc4;font-weight:700;margin:6px 0 2px;">'+_esc(c)+'</div>'; cats[c].forEach(function(x){ body+='<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.82rem;color:rgba(255,255,255,0.85);cursor:pointer;"><input type="checkbox" data-name="'+_esc(x.name)+'" data-category="'+_esc(x.category||'其他')+'" style="accent-color:#4ecdc4;cursor:pointer;"><span style="flex:1;">'+_esc(x.name)+'</span><span style="color:rgba(255,255,255,0.4);font-size:0.65rem;">本机</span></label>'; }); });
        if(!body) body='<div style="color:rgba(255,255,255,0.4);padding:10px;text-align:center;">没有可添加的本机项目</div>';
        const m=document.createElement('div'); m.id='featLocalAddDlg'; m.style.cssText='position:fixed;inset:0;z-index:100004;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
        const box=document.createElement('div'); box.style.cssText='width:min(460px,92vw);max-height:86vh;overflow:auto;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(78,205,196,0.5);border-radius:12px;padding:14px;';
        box.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><b style="color:#4ecdc4;font-size:0.95rem;">添加本地阵容</b><span style="flex:1;"></span><button id="featLocalClose" style="background:transparent;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">x</button></div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;margin-bottom:8px;">勾选本机项目，添加到「我的本地阵容」（仅保存在你这台设备，别人看不到）</div>'+body+'<div style="display:flex;gap:8px;margin-top:12px;"><button id="featLocalSave" style="flex:1;padding:9px;border:none;border-radius:8px;background:linear-gradient(135deg,#4ecdc4,#16a085);color:#04221f;cursor:pointer;font-size:0.85rem;font-weight:700;">保存</button><button id="featLocalCancel" style="padding:9px 14px;border:none;border-radius:8px;background:#666;color:#fff;cursor:pointer;font-size:0.85rem;">取消</button></div>';
        m.appendChild(box); document.body.appendChild(m);
        m.querySelector('#featLocalClose').addEventListener('click',function(){m.remove();});
        m.querySelector('#featLocalCancel').addEventListener('click',function(){m.remove();});
        m.addEventListener('click',function(e){ if(e.target===m) m.remove(); });
        m.querySelector('#featLocalSave').addEventListener('click',async function(){
            const checked=Array.from(box.querySelectorAll('input[data-name]')).filter(function(c){return c.checked;});
            const loc0=await _featLocalLoad(); const items=((loc0&&loc0.items)||[]).slice();
            const seen={}; items.forEach(function(x){ if(x.name) seen[x.name]=1; });
            for(let i=0;i<checked.length;i++){
                const c=checked[i]; const name=c.getAttribute('data-name'); const category=c.getAttribute('data-category')||'其他';
                const x=local.find(function(z){return z.name===name;});
                if(x && x.proj && !seen[name]){ seen[name]=1; items.push({id:_featSlug({name:name+'_'+items.length}),name:name,category:category,data:JSON.parse(JSON.stringify(x.proj))}); }
            }
            await _featLocalSave(items);
            const projs=await _featResolve(items); _featLocal={items:items,projs:projs};
            _renderFeaturedBody(document.getElementById('llList'));
            try{ if(typeof showToast==='function') showToast('已添加本地阵容（仅本机）','success'); }catch(e){}
            m.remove();
        });
    };
    window._featuredRemove = async function(idx, src){
        if(src==='local'){
            if(!confirm('确定删除该本地阵容？（仅本机移除，不影响他人）')) return;
            if(!_featLocal) return;
            _featLocal.items.splice(idx,1);
            _featLocal.projs.splice(idx,1);
            await _featLocalSave(_featLocal.items);
            _renderFeaturedBody(document.getElementById('llList'));
            try{ if(typeof showToast==='function') showToast('已删除本地阵容','success'); }catch(e){}
            return;
        }
        if(!await _ensureAdmin()){ try{ if(typeof showToast==='function') showToast('仅管理员可删除','error'); }catch(e){} return; }
        if(!_featData || !_featData.items[idx]) return;
        if(!confirm('确定删除该精选阵容？（所有人都会看不到）')) return;
        const newItems=_featData.items.filter(function(x,i){ return i!==idx; });
        const ok=await _featuredSave(newItems);
        if(ok){ _featData.items=newItems; _featData.projs=_featData.projs.filter(function(o){ return o.idx!==idx; }).map(function(o,i){ o.idx=i; return o; }); const h=_featHash(JSON.stringify(newItems)); _featCacheHash=h; await _idbSet('pub',{hash:h,items:newItems,projs:_featData.projs}); _renderFeaturedBody(document.getElementById('llList')); try{ if(typeof showToast==='function') showToast('已删除精选阵容','success'); }catch(e){} }
        else { try{ if(typeof showToast==='function') showToast('删除失败','error'); }catch(e){} }
    };

    window._llSet = function (tab, id, field, sub, val) {
        const o = _load();
        o[tab] = o[tab] || {};
        o[tab][id] = o[tab][id] || {};
        const slot = o[tab][id];
        if (sub === null) { slot[field] = val; }
        else { slot[field] = slot[field] || {}; if (val) slot[field][sub] = val; else delete slot[field][sub]; }
        const dirty = Object.keys(slot).some(function (k) { const v = slot[k]; return (v && typeof v === 'object') ? Object.keys(v).length > 0 : !!v; });
        if (!dirty) delete o[tab][id];
        _save(o);
    };
    window._llReset = function (tab, id) {
        const o = _load();
        if (o[tab]) delete o[tab][id];
        _save(o);
        _renderList();
        try { if (typeof showToast === 'function') showToast('已重置该阵容的个人设置', 'info'); } catch (e) {}
    };
    // 🔴 2026-09-23 当天脚本列表 HTML（右侧常驻 + 弹窗列表共用）
    function _scriptsHtml(arr, id) {
        if (!arr.length) return '<div style="color:rgba(255,255,255,0.35);font-size:0.66rem;padding:2px 4px;">（暂无脚本，点上方「📜 阵容脚本」添加）</div>';
        return arr.map(function (s) {
            const cloud = !!s.url;
            return '<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(0,0,0,0.25);border-radius:6px;border:1px solid ' + (cloud ? 'rgba(78,205,196,0.3)' : 'rgba(240,147,43,0.3)') + ';">'
                + '<span onclick="_llOpenScript(\'' + id + '\',\'' + s.id + '\')" style="cursor:pointer;flex:1;color:' + (cloud ? '#4ecdc4' : '#f0932b') + ';font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _esc(s.name) + (s.author ? ' · 分享者：' + _esc(s.author) : '') + '">' + _esc(s.name) + (cloud ? ' ☁' : ' 💾') + (s.author ? ' <span style="opacity:0.6;font-size:0.6rem;">by ' + _esc(s.author) + '</span>' : '') + '</span>'
                + '<button onclick="_llOpenScript(\'' + id + '\',\'' + s.id + '\')" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.8);cursor:pointer;font-size:0.66rem;">👁</button>'
                + '<button onclick="_llImportToLaoMa(\'' + id + '\',\'' + s.id + '\')" title="一键导入到老马" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(255,152,0,0.4);background:rgba(255,152,0,0.12);color:#ff9800;cursor:pointer;font-size:0.66rem;">📁</button>'
                + (s.cloud ? '' : '<button onclick="_llRenameScript(\'' + id + '\',\'' + s.id + '\')" title="改名" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.7);cursor:pointer;font-size:0.66rem;">✏</button>')
                + (cloud ? '<button onclick="_llImportLocal(\'' + id + '\',\'' + s.id + '\')" title="下载到本机再编辑" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(78,205,196,0.4);background:rgba(78,205,196,0.12);color:#4ecdc4;cursor:pointer;font-size:0.66rem;">📥</button>' : '')
                + '<button onclick="_llScriptDel(\'' + id + '\',\'' + s.id + '\')" title="删除脚本" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(255,107,107,0.4);background:rgba(255,107,107,0.12);color:#ff6b6b;cursor:pointer;font-size:0.66rem;">🗑</button>'
                + '</div>';
        }).join('');
    }
    // 🔴 异步：本机 + 云端共享脚本合并渲染（这样别人分享的脚本在网页端也能看到）
    window._llRenderScripts = async function (id) {
        const el = document.getElementById('llScripts-' + id);
        if (!el) return;
        const arr = await _llDayScriptsAll(id);
        el.innerHTML = _scriptsHtml(arr, id);
        // 同步更新按钮上的计数（初始只显示本机数量，云端合并后修正）
        const btn = document.getElementById('llScriptBtn-' + id);
        if (btn) btn.innerHTML = btn.innerHTML.replace(/（\d+）/, '（' + arr.length + '）');
    };
})();