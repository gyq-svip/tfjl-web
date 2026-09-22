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

    function _load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
    function _save(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }
    function _slot(tab, id) {
        const o = _load();
        o[tab] = o[tab] || {};
        o[tab][id] = o[tab][id] || {};
        return o[tab][id];
    }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _escJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function _data() { return (window.LINEUP_LIBRARY && window.LINEUP_LIBRARY.sailing) ? window.LINEUP_LIBRARY : { sailing: [], activity: [] }; }
    function _parseNames(txt) { return String(txt || '').split(/[,，、\n\r]+/).map(s => s.trim()).filter(Boolean); }
    // ---------- 悬浮窗（拖动 + 缩放） ----------
    window.openLineupLibraryPanel = function () {
        let ov = document.getElementById('lineupLibWin');
        if (ov) { ov.style.display = 'block'; return; }
        ov = document.createElement('div');
        ov.id = 'lineupLibWin';
        ov.style.cssText = 'position:fixed;top:80px;right:20px;width:min(1180px,96vw);height:min(86vh,900px);min-width:780px;min-height:360px;z-index:99996;display:flex;flex-direction:column;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(78,205,196,0.4);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);overflow:auto;resize:both;';
        ov.innerHTML =
            '<div id="llDrag" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(135deg,#0f3d3a,#123c5c);border-radius:12px 12px 0 0;cursor:move;user-select:none;">'
            + '<span style="font-size:1.05rem;font-weight:800;color:#4ecdc4;">📚 阵容图库</span>'
            + '<span style="color:rgba(255,255,255,0.45);font-size:0.72rem;">卡组共享 · 等级/皮肤/融合/战车/笔记 只存本机</span>'
            + '<span style="flex:1;"></span>'
            + '<button onclick="closeLineupLibraryPanel()" style="background:transparent;border:none;color:#fff;font-size:1.4rem;cursor:pointer;line-height:1;">×</button>'
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
            + '<input id="llSearch" value="' + _esc(state.q) + '" oninput="_llSearch(this.value)" placeholder="🔍 输入英雄名，查所有含它的阵容…" style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.85rem;">'
            + '</div>'
            + '<div style="color:rgba(255,255,255,0.45);font-size:0.7rem;margin-top:4px;">左卡组右笔记 · <b style="color:#ce93d8;">左键点卡=切换融合卡</b> · <b style="color:rgba(255,255,255,0.7);">右键点卡=切换皮肤（自动循环）</b>（个人设置只存本机）· 拖标题栏移动窗口，右下角拉伸大小</div>';
    }
    function _filteredSailing() {
        const q = state.q;
        return _data().sailing.filter(s => !q || s.heroes.some(h => h.indexOf(q) >= 0));
    }
    function _filteredActivity() {
        const q = state.q;
        return _data().activity.filter(d => !q || d.A.some(h => h.indexOf(q) >= 0) || d.B.some(h => h.indexOf(q) >= 0));
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
        } else {
            pageList.forEach(function (a) { h += _actCard(a); });
            if (!pageList.length) h += '<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;">没有匹配的阵容</div>';
        }
        p.innerHTML = h;
        _applySlots(p);
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
    // 🔴 2026-09-22 减伤直接读现有减伤表（不手动设置）：航海/活动A组=「我的」表，活动B组=「队友」表；
    //    小野/酋长/宝库/我的战车/队友战车是表级特殊项，普通卡在 洗炼[卡名]
    function _tableFor(tab, w) { return (tab === 'act' && w === 'b') ? '队友' : '我的'; }
    function _cardDr(table, hero) {
        try {
            const tb = window.drTables && (window.drTables[table] || window.drTables['我的']);
            if (!tb) return 0;
            if (tb.洗炼 && tb.洗炼[hero] != null) return parseFloat(tb.洗炼[hero]) || 0;
            if (tb[hero] != null) return parseFloat(tb[hero]) || 0;
            return 0;
        } catch (e) { return 0; }
    }
    function _sumDr(table, heroes) { let t = 0; (heroes || []).forEach(function (n) { t += _cardDr(table, n); }); return Math.round(t * 10) / 10; }
    function _slotBadge(el, dr) {
        const old = el.querySelector('.ll-badge'); if (old) old.remove();
        if (!dr) return;
        const b = document.createElement('div');
        b.className = 'll-badge';
        // 🔴 2026-09-22 减伤角标移右下（原左上与融合卡渲染重叠；融合切角小图在左下、金边在右上，右下最空）
        b.style.cssText = 'position:absolute;right:1px;bottom:1px;display:flex;gap:2px;pointer-events:none;';
        b.innerHTML = '<span style="background:rgba(244,67,54,0.78);color:#fff;font-size:0.56rem;padding:0 3px;border-radius:3px;">-' + _esc(dr) + '%</span>';
        el.appendChild(b);
    }
    function _applySlots(root) {
        if (!window.applySkinBgToSlot) return;
        const slots = root.querySelectorAll('.ll-slot[data-hero]');
        let i = 0;
        (function step() {
            if (i >= slots.length) return;
            const el = slots[i++];
            const hero = el.getAttribute('data-hero');
            const tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid'), w = el.getAttribute('data-w');
            const L = _slot(tab, lid);
            const force = (L.skin && L.skin[hero]) || undefined;
            // 🔴 2026-09-22 融合卡渲染与主页一致：槽位卡名直接用融合卡名（applySkinBgToSlot 内部走对角切割渲染）
            const cur = (L.fus && L.fus[hero]) || hero;
            const table = _tableFor(tab, w);
            const dr = _cardDr(table, hero);
            Promise.resolve().then(function () { return window.applySkinBgToSlot(el, cur, cur, 'my', force); })
                .catch(function () {}).then(function () { _slotBadge(el, dr); _fusBadge(el, (L.fus && L.fus[hero]) || ''); step(); });
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
        const cur = (L.fus && L.fus[hero]) || '';
        const variants = (window.getFusionVariantsForBase ? window.getFusionVariantsForBase(hero) : []);
        if (!variants.length) { try { if (typeof showToast === 'function') showToast(hero + ' 没有可融合的卡', 'info'); } catch (e2) {} return; }
        const names = [''].concat(variants);
        let i = names.indexOf(cur); if (i < 0) i = 0;
        const next = names[(i + 1) % names.length];
        window._llSet(tab, lid, 'fus', hero, next);
        const skin = (L.skin && L.skin[hero]) || undefined;
        Promise.resolve().then(function () { return window.applySkinBgToSlot(el, next || hero, next || hero, 'my', skin); }).catch(function () {}).then(function () { _fusBadge(el, next); });
        try { if (typeof showToast === 'function') showToast(next ? (hero + ' 融合 → ' + next) : '已还原为 ' + hero, 'info'); } catch (e2) {}
    };
    //   右键 = 循环皮肤（🔴 2026-09-22 全部沿用主页：皮肤列表 = 主页卡池 getHeroSkins；
    //          融合态则循环【副卡皮肤】写 window.fusionSkins（主页同款存储，两处共享），对齐主页右键行为）
    window._llSkinCycle = function (el) {
        const hero = el.getAttribute('data-hero'), tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid');
        const L = _slot(tab, lid);
        const fuse = (L.fus && L.fus[hero]) || '';
        const _nm = function (s) { return (typeof s === 'string') ? s : (s && s.name) || ''; };
        if (fuse) {
            const parts = (window.getFusionParts ? window.getFusionParts(fuse) : null);
            const sub = (parts && parts.length >= 2) ? parts[1] : '';
            const skins = ((sub && window.getHeroSkins) ? window.getHeroSkins(sub) : []).map(_nm).filter(Boolean);
            if (!skins.length) { try { if (typeof showToast === 'function') showToast(sub + ' 没有可用皮肤', 'info'); } catch (e2) {} return; }
            const cur = (window.fusionSkins && window.fusionSkins[sub] !== undefined) ? (window.fusionSkins[sub] || '') : '';
            const names = [''].concat(skins);
            let i = names.indexOf(cur); if (i < 0) i = 0;
            const next = names[(i + 1) % names.length];
            try { window.fusionSkins = window.fusionSkins || {}; window.fusionSkins[sub] = next; } catch (e2) {}
            Promise.resolve().then(function () { return window.applySkinBgToSlot(el, fuse, fuse, 'my', (L.skin && L.skin[hero]) || undefined); }).catch(function () {});
            try { if (typeof showToast === 'function') showToast(fuse + ' 副卡 ' + sub + ' 皮肤 → ' + (next || '默认'), 'info'); } catch (e2) {}
            return;
        }
        const cur = (L.skin && L.skin[hero]) || '';
        let list = [];
        if (window.getHeroSkins) list = (window.getHeroSkins(hero) || []).map(_nm).filter(Boolean);
        else list = ((window.skinRegistry && window.skinRegistry[hero]) || []).map(_nm).filter(Boolean);
        const names = [''].concat(list);
        let i = names.indexOf(cur); if (i < 0) i = 0;
        const next = names[(i + 1) % names.length];
        window._llSet(tab, lid, 'skin', hero, next);
        Promise.resolve().then(function () { return window.applySkinBgToSlot(el, hero, hero, 'my', next || undefined); }).catch(function () {});
        try { if (typeof showToast === 'function') showToast(hero + ' 皮肤 → ' + (next || '默认'), 'info'); } catch (e2) {}
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
        const sum = _sumDr('我的', s.heroes);
        let h = '<div class="ll-card" style="border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 9px;margin-bottom:10px;background:rgba(0,0,0,0.22);">';
        // 组头：#N + 主车 + 副车 + 减伤（小字，在卡组上方）
        h += '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;">';
        h += '<b style="color:#4ecdc4;font-size:0.85rem;">#' + s.n + '</b>';
        h += '<span style="color:rgba(255,255,255,0.5);font-size:0.66rem;">主</span>' + _cartSelect('sailing', s.id, 'cart', L.cart);
        h += '<span style="color:rgba(255,255,255,0.5);font-size:0.66rem;">副</span>' + _cartSelect('sailing', s.id, 'cart2', L.cart2);
        h += '<span style="color:#ff8a80;font-size:0.66rem;">🛡️' + sum + '%</span>';
        h += '</div>';
        // 卡组（5×2）+ 右侧波次备注列（🔴 2026-09-22 用户要求：备注放卡组右边，正好填补空白）
        h += '<div style="display:flex;align-items:flex-start;gap:10px;">';
        h += '<div style="display:grid;grid-template-columns:repeat(5,60px);gap:5px;">';
        s.heroes.forEach(function (n, i) { h += _slotHtml(i < 5 ? 'u' : 'd', i % 5, n, 'sailing', s.id, 60); });
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
        h += '<div style="display:flex;align-items:flex-start;gap:18px;">';
        // 第N天
        h += '<div style="min-width:52px;padding-top:6px;"><b style="color:#ffd700;font-size:0.85rem;">第' + a.day + '天</b></div>';
        // A/B 两组并排：组头（A/B + 主车 + 副车 + 减伤）在上，5×2 网格在下
        ['A', 'B'].forEach(function (ab) {
            const id = 'd' + a.day + ab;
            const L = _slot('activity', id);
            const table = _tableFor('act', ab.toLowerCase());
            const sum = _sumDr(table, a[ab]);
            h += '<div>';
            h += '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.76rem;">' + ab + '组</span>';
            h += '<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">主</span>' + _cartSelect('activity', id, 'cart', L.cart);
            h += '<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">副</span>' + _cartSelect('activity', id, 'cart2', L.cart2);
            h += '<span style="color:#ff8a80;font-size:0.64rem;">🛡️' + sum + '%</span>';
            h += '</div>';
            h += '<div style="display:grid;grid-template-columns:repeat(5,60px);gap:5px;">';
            (a[ab] || []).forEach(function (n, i) { h += _slotHtml(ab.toLowerCase(), i, n, 'activity', 'd' + a.day, 60); });
            h += '</div></div>';
        });
        h += '<div style="align-self:center;"><button onclick="_llReset(\'activity\',\'d' + a.day + '\')" title="重置该天个人设置" style="padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.66rem;cursor:pointer;">↺</button></div>';
        h += '</div></div>';
        return h;
    }
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
})();
