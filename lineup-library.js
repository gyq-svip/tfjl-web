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
            + '<input id="llSearch" value="' + _esc(state.q) + '" oninput="_llSearch(this.value)" placeholder="🔍 多个英雄用空格/逗号分隔（同时含才显示）：如 电法 炎魔 悟空" style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.85rem;">'
            + '</div>'
            + '<div style="color:rgba(255,255,255,0.45);font-size:0.7rem;margin-top:4px;">左卡组右笔记 · <b style="color:#ce93d8;">左键=轮流切融合卡（含副卡皮肤，末尾关闭）</b> · <b style="color:rgba(255,255,255,0.7);">右键=主卡皮肤（融合后也可切）</b> · 活动 📜=脚本 ·（个人设置只存本机）· 拖标题栏移动窗口，右下角拉伸大小</div>';
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
        } else {
            pageList.forEach(function (a) { h += _actCard(a); });
            if (!pageList.length) h += '<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;">没有匹配的阵容</div>';
        }
        p.innerHTML = h;
        _applySlots(p);
        _refreshDrSums(p);
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
            if (f) { const p = (window.getFusionParts ? window.getFusionParts(f) : null); if (p && p.length >= 2) return p.join('+'); return f; }
            return n;
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
                const lines = cards.map(function (c) {
                    const v = calc([c.name], side, table, true);
                    return c.name.replace(/\+/g, '·') + ' ' + v + '%';
                });
                if (all.chariot > 0) lines.push('战车 ' + all.chariot + '%');
                const tip = lines.join('｜') + ' ｜ 合计 ' + all.total + '%';
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
        const variants = (window.getFusionVariantsForBase ? window.getFusionVariantsForBase(hero) : []);
        _llTrack('阵容图库切融合');
        if (!variants.length) { try { if (typeof showToast === 'function') showToast(hero + ' 没有可融合的卡', 'info'); } catch (e2) {} return; }
        // 🔴 2026-09-22 主页同款循环（用户要求）：关闭 → 变体1(副卡默认皮) → 变体1(副卡皮2) → … → 变体N(…) → 关闭
        //    融合卡与副卡皮肤一次循环搞定；右键仍独立切主卡皮肤，互不影响。
        const _nm = function (s) { return (typeof s === 'string') ? s : (s && s.name) || ''; };
        const steps = [{ v: '', sub: '', skin: '' }];
        variants.forEach(function (v) {
            const parts = (window.getFusionParts ? window.getFusionParts(v) : null) || [];
            const sub = parts[1] || '';
            const skins = [''].concat(((sub && window.getHeroSkins) ? window.getHeroSkins(sub) : []).map(_nm).filter(Boolean));
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
        if (window.getHeroSkins) list = (window.getHeroSkins(hero) || []).map(_nm).filter(Boolean);
        else list = ((window.skinRegistry && window.skinRegistry[hero]) || []).map(_nm).filter(Boolean);
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
    window._llScriptDlg = function (id) {
        const old = document.getElementById('llScriptDlg'); if (old) old.remove();
        const L = _slot('activity', id);
        const day = String(id).replace(/^d/, '');
        const m = document.createElement('div');
        m.id = 'llScriptDlg';
        m.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
        const box = document.createElement('div');
        box.style.cssText = 'width:min(560px,92vw);background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(240,147,43,0.5);border-radius:12px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
        box.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><b style="color:#f0932b;font-size:0.95rem;">📜 活动·第' + _esc(day) + '天 · 阵容脚本</b><span style="flex:1;"></span><button id="llScriptClose" style="background:transparent;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">×</button></div>'
            + '<textarea id="llScriptText" placeholder="把该天要用的活动脚本贴到这里（可先用「💾保存到本机」），或从本地脚本导出后粘贴…" style="width:100%;box-sizing:border-box;height:180px;resize:vertical;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.35);color:rgba(255,255,255,0.92);font-size:0.78rem;font-family:Consolas,monospace;"></textarea>'
            + '<div id="llScriptUrlLine" style="display:none;margin-top:6px;color:rgba(255,255,255,0.55);font-size:0.7rem;word-break:break-all;">已上传：<span id="llScriptUrl" style="color:#4ecdc4;cursor:pointer;" title="点击复制链接"></span></div>'
            + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'
            + '<button id="llScriptSave" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(78,205,196,0.5);background:rgba(78,205,196,0.15);color:#4ecdc4;cursor:pointer;font-size:0.78rem;font-weight:700;">💾 保存到本机</button>'
            + '<button id="llScriptUp" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(240,147,43,0.55);background:rgba(240,147,43,0.15);color:#f0932b;cursor:pointer;font-size:0.78rem;font-weight:700;">📤 上传到脚本分享</button>'
            + '<button id="llScriptCopy" style="padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:rgba(255,255,255,0.75);cursor:pointer;font-size:0.78rem;">📋 复制脚本</button>'
            + '</div>'
            + '<div style="color:rgba(255,255,255,0.4);font-size:0.68rem;margin-top:8px;">上传后自动出现在「脚本分享」里供大家下载（需要已配置 Gist Token）；脚本只存本机 + Gist，不影响其他人。</div>';
        m.appendChild(box);
        document.body.appendChild(m);
        const ta = box.querySelector('#llScriptText');
        ta.value = L.script || '';
        const urlLine = box.querySelector('#llScriptUrlLine'), urlSpan = box.querySelector('#llScriptUrl');
        if (L.scriptUrl) { urlLine.style.display = 'block'; urlSpan.textContent = L.scriptUrl; }
        box.querySelector('#llScriptClose').addEventListener('click', function () { m.remove(); });
        m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
        function _copy(txt, tip) {
            try { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { try { if (typeof showToast === 'function') showToast(tip, 'info'); } catch (e) {} }).catch(function () {}); } catch (e) {}
        }
        urlSpan.addEventListener('click', function () { _copy(urlSpan.textContent, '脚本链接已复制'); });
        box.querySelector('#llScriptSave').addEventListener('click', function () {
            window._llSet('activity', id, 'script', null, ta.value);
            try { if (typeof showToast === 'function') showToast('脚本已保存到本机（第' + day + '天）', 'info'); } catch (e) {}
        });
        box.querySelector('#llScriptCopy').addEventListener('click', function () { _copy(ta.value, '脚本内容已复制'); });
        box.querySelector('#llScriptUp').addEventListener('click', async function () {
            const content = ta.value.trim();
            if (!content) { try { if (typeof showToast === 'function') showToast('先贴入脚本文本', 'warn'); } catch (e) {} return; }
            const btn = this; btn.disabled = true; btn.textContent = '⏳ 上传中…';
            try {
                const fname = '活动第' + day + '天_阵容脚本_' + String(Date.now()).slice(-6) + '.js';
                let url = '';
                if (typeof window.uploadScriptToGist === 'function') {
                    url = await window.uploadScriptToGist({ name: fname }, content);
                } else {
                    // 🔴 回退：app-core 旧缓存未暴露上传函数时，直接调 GitHub API（同格式，描述含「脚本分享」→ 进脚本墙）
                    const token = (typeof window.getGistToken === 'function') ? window.getGistToken() : '';
                    if (!token) throw new Error('无 Gist Token（请在主页设置里配置）');
                    const resp = await fetch('https://api.github.com/gists', { method: 'POST', headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + token }, body: JSON.stringify({ description: '脚本分享: ' + fname, public: true, files: { [fname]: { content: content } } }) });
                    if (!resp.ok) { const er = await resp.json().catch(function () { return {}; }); throw new Error(er.message || ('HTTP ' + resp.status)); }
                    const data = await resp.json();
                    const fd = data.files && data.files[fname];
                    url = (fd && fd.raw_url) || data.html_url || '';
                }
                window._llSet('activity', id, 'script', null, ta.value);
                window._llSet('activity', id, 'scriptUrl', null, url);
                window._llSet('activity', id, 'scriptName', null, fname);
                _llTrack('阵容图库脚本上传');
                urlLine.style.display = 'block'; urlSpan.textContent = url;
                try { if (typeof showToast === 'function') showToast('已上传到脚本分享：' + fname, 'success'); } catch (e) {}
            } catch (e) {
                try { if (typeof showToast === 'function') showToast('上传失败：' + (e && e.message || e) + '（需要已配置 Gist Token）', 'error'); } catch (e2) {}
            }
            btn.disabled = false; btn.textContent = '📤 上传到脚本分享';
        });
        setTimeout(function () { ta.focus(); }, 0);
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
            const st = (ab === 'A') ? { side: 'my', table: '我的' } : { side: 'teammate', table: '队友' };
            h += '<div>';
            h += '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.76rem;">' + ab + '组</span>';
            h += '<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">主</span>' + _cartSelect('activity', id, 'cart', L.cart);
            h += '<span style="color:rgba(255,255,255,0.45);font-size:0.62rem;">副</span>' + _cartSelect('activity', id, 'cart2', L.cart2);
            h += '<span class="ll-drsum" data-tab="activity" data-lid="d' + a.day + '" data-side="' + st.side + '" data-table="' + st.table + '" data-heroes="' + _esc(JSON.stringify(a[ab] || [])) + '" title="减伤明细" style="color:#ff8a80;font-size:0.64rem;font-weight:700;cursor:help;">🛡️…</span>';
            h += '</div>';
            h += '<div style="display:grid;grid-template-columns:repeat(5,60px);gap:5px;">';
            (a[ab] || []).forEach(function (n, i) { h += _slotHtml(ab.toLowerCase(), i, n, 'activity', 'd' + a.day, 60); });
            h += '</div></div>';
        });
        const _lday = _slot('activity', 'd' + a.day);   // 🔴 天级个人设置（脚本文本/链接存这里，与 A/B 槽位分开）
        h += '<div style="align-self:center;display:flex;flex-direction:column;gap:4px;align-items:center;"><button onclick="_llReset(\'activity\',\'d' + a.day + '\')" title="重置该天个人设置" style="padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.66rem;cursor:pointer;">↺</button>';
        h += '<button onclick="_llScriptDlg(\'d' + a.day + '\')" title="该天的活动脚本（可上传供大家使用，活动可用脚本打）" style="padding:2px 8px;border-radius:6px;border:1px solid rgba(240,147,43,0.45);background:rgba(240,147,43,0.12);color:#f0932b;font-size:0.66rem;cursor:pointer;">📜' + ((_lday.script || _lday.scriptUrl) ? '✓' : '') + '</button>';
        if (_lday.scriptName) h += '<div title="' + _esc(_lday.scriptName) + '" style="max-width:88px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:rgba(240,147,43,0.8);font-size:0.56rem;cursor:help;">' + _esc(_lday.scriptName) + '</div>';
        h += '</div>';
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
