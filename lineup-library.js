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
        ov.style.cssText = 'position:fixed;top:80px;right:20px;width:min(1180px,96vw);height:min(86vh,900px);min-width:520px;min-height:360px;z-index:99996;display:flex;flex-direction:column;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(78,205,196,0.4);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);overflow:auto;resize:both;';
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
        // 卡槽点击 → 换肤/融合菜单（事件委托，重渲染后仍有效）
        ov.addEventListener('click', function (e) {
            const sl = e.target.closest('.ll-slot');
            if (sl) { window._llSkinMenu(sl); }
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
            + '<div style="color:rgba(255,255,255,0.45);font-size:0.7rem;margin-top:4px;">左卡组右笔记 · <b style="color:rgba(255,255,255,0.7);">点卡槽换皮肤 / 填等级 / 填融合</b>（个人设置只存本机）· 拖标题栏移动窗口，右下角拉伸大小</div>';
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
            pageList.forEach(function (s) { h += _sailCard(s); });
        } else {
            pageList.forEach(function (a) { h += _actCard(a); });
            if (!pageList.length) h += '<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;">没有匹配的阵容</div>';
        }
        p.innerHTML = h;
        _applySlots(p);
    }
    // ---------- 主页同款卡槽 ----------
    // 生成 battle-slot 结构 + 用主页渲染管线 applySkinBgToSlot(slot, hero, hero, 'my', forceSkin) 上皮肤
    // （forceSkin = 本阵容的个人皮肤选择；点卡槽 → 皮肤菜单；融合副卡也在菜单里）
    function _slotHtml(which, idx, hero, lv, tab, id) {
        const sid = 'll-' + tab + '-' + id + '-' + which + idx;
        return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">'
            + '<div class="battle-slot filled ll-slot" data-slot="' + sid + '" data-hero="' + _esc(hero) + '" data-tab="' + tab + '" data-lid="' + _esc(id) + '" data-w="' + which + '" title="点击换皮肤/融合" style="width:64px;height:64px;cursor:pointer;">'
            + '<span class="card-item"><span class="card-name">' + _esc(hero) + '</span></span>'
            + '</div>'
            + (tab === 'sail' ? '<input value="' + _esc(lv) + '" oninput="_llSet(\'sailing\',\'' + _escJs(id) + '\',\'lv\',\'' + _escJs(hero) + '\',this.value)" placeholder="Lv" style="width:40px;padding:1px 3px;border-radius:4px;border:1px solid rgba(255,215,0,0.3);background:rgba(0,0,0,0.35);color:#ffd700;font-size:0.68rem;text-align:center;">' : '')
            + '<div style="color:rgba(255,255,255,0.6);font-size:0.62rem;max-width:64px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="' + _esc(hero) + '">' + _esc(hero) + '</div>'
            + '</div>';
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
            Promise.resolve().then(function () { return window.applySkinBgToSlot(el, hero, hero, 'my', force); })
                .catch(function () {}).then(step);
        })();
    }
    // 皮肤/融合菜单（点卡槽弹出）
    window._llSkinMenu = function (el) {
        const hero = el.getAttribute('data-hero'), tab = el.getAttribute('data-tab'), lid = el.getAttribute('data-lid');
        const L = _slot(tab, lid);
        const cur = (L.skin && L.skin[hero]) || '';
        const fus = (L.fus && L.fus[hero]) || '';
        const reg = (window.skinRegistry && window.skinRegistry[hero]) || [];
        let m = document.getElementById('llSkinMenu');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'llSkinMenu';
        const r = el.getBoundingClientRect();
        m.style.cssText = 'position:fixed;z-index:100000;left:' + Math.min(r.left, window.innerWidth - 240) + 'px;top:' + Math.min(r.bottom + 4, window.innerHeight - 300) + 'px;width:220px;max-height:280px;overflow:auto;background:rgba(20,24,48,0.98);border:1px solid rgba(78,205,196,0.5);border-radius:10px;padding:8px;box-shadow:0 6px 24px rgba(0,0,0,0.6);';
        let h = '<div style="font-weight:800;color:#4ecdc4;font-size:0.8rem;margin-bottom:4px;">' + _esc(hero) + '</div>';
        h += '<div style="font-size:0.68rem;color:rgba(255,255,255,0.45);margin-bottom:4px;">皮肤</div>';
        h += '<div class="ll-opt" data-v="" style="padding:3px 6px;border-radius:6px;cursor:pointer;font-size:0.75rem;' + (!cur ? 'background:rgba(78,205,196,0.2);color:#4ecdc4;' : 'color:rgba(255,255,255,0.8);') + '">默认皮肤</div>';
        (reg || []).forEach(function (s) {
            const nm = (typeof s === 'string') ? s : (s && s.name) || '';
            if (!nm) return;
            h += '<div class="ll-opt" data-v="' + _esc(nm) + '" style="padding:3px 6px;border-radius:6px;cursor:pointer;font-size:0.75rem;' + (cur === nm ? 'background:rgba(78,205,196,0.2);color:#4ecdc4;' : 'color:rgba(255,255,255,0.8);') + '">' + _esc(nm) + '</div>';
        });
        h += '<div style="font-size:0.68rem;color:rgba(255,255,255,0.45);margin:6px 0 2px;">融合副卡（选填）</div>';
        h += '<input id="llFusInput" value="' + _esc(fus) + '" style="width:100%;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.35);color:#fff;font-size:0.75rem;">';
        h += '<div style="margin-top:6px;text-align:right;"><button onclick="this.closest(\'#llSkinMenu\').remove()" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.6);font-size:0.72rem;cursor:pointer;">关闭</button></div>';
        m.innerHTML = h;
        document.body.appendChild(m);
        m.addEventListener('click', function (e) {
            const opt = e.target.closest('.ll-opt');
            if (!opt) return;
            window._llSet(tab, lid, 'skin', hero, opt.getAttribute('data-v'));
            m.remove();
            _applySlots(document.getElementById('llList') || document);
        });
        m.querySelector('#llFusInput').addEventListener('input', function () {
            window._llSet(tab, lid, 'fus', hero, this.value);
        });
        setTimeout(function () {
            document.addEventListener('pointerdown', function close(e) {
                if (m && !m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', close); }
            });
        }, 0);
    };
    // ---------- 大航海卡片（左卡组 右笔记） ----------
    function _sailCard(s) {
        const key = s.id;
        const L = _slot('sailing', key);
        const open = !!state.open[key];
        const cartName = L.cart && window.CHARIOT_LIST ? (window.CHARIOT_LIST[Number(L.cart) - 1] || '') : '';
        let h = '<div class="ll-card" style="border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:8px 10px;margin-bottom:8px;background:rgba(0,0,0,0.22);">';
        h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">';
        h += '<b style="color:#4ecdc4;font-size:0.9rem;">#' + s.n + '</b>';
        if (cartName) h += '<span style="font-size:0.72rem;color:#ffd700;background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.35);border-radius:6px;padding:1px 6px;">🚂 ' + _esc(cartName) + '</span>';
        const notesHit = (L.notes && (L.notes.n219 || L.notes.n229 || L.notes.n230 || L.notes.other));
        if (notesHit) h += '<span style="font-size:0.7rem;color:#f0932b;">📝 已记波次</span>';
        h += '<span style="flex:1;"></span>';
        h += '<button onclick="_llToggle(\'' + key + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(78,205,196,0.4);background:rgba(78,205,196,0.1);color:#4ecdc4;font-size:0.72rem;cursor:pointer;">' + (open ? '▲ 收起' : '▼ 卡组与笔记') + '</button>';
        h += '</div>';
        if (!open) {
            h += '<div style="color:rgba(255,255,255,0.65);font-size:0.74rem;line-height:1.6;">' + s.heroes.map(_esc).join(' · ') + '</div>';
        } else {
            h += '<div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:10px;">';
            // 左：卡组槽位（主页同款）
            h += '<div><div style="color:rgba(255,255,255,0.45);font-size:0.68rem;margin-bottom:4px;">🃏 卡组（点卡槽换皮肤 / 填等级）</div>';
            h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">';
            s.heroes.forEach(function (n, i) {
                h += _slotHtml(i < 5 ? 'u' : 'd', i % 5, n, (L.lv && L.lv[n]) || '', 'sailing', s.id);
            });
            h += '</div></div>';
            // 右：笔记
            h += '<div style="border-left:1px dashed rgba(255,255,255,0.15);padding-left:10px;">';
            h += '<div style="color:rgba(255,255,255,0.45);font-size:0.68rem;margin-bottom:4px;">📝 笔记（只存本机）</div>';
            h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">';
            h += '<span style="color:rgba(255,255,255,0.6);font-size:0.72rem;">🚂 战车</span>';
            h += '<select onchange="_llSet(\'sailing\',\'' + s.id + '\',\'cart\',null,this.value)" style="flex:1;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,215,0,0.35);background:#2a2a4a;color:#ffd700;font-size:0.78rem;">';
            h += '<option value="">未设置</option>';
            (window.CHARIOT_LIST || []).forEach(function (cn, i) { h += '<option value="' + (i + 1) + '"' + (String(L.cart) === String(i + 1) ? ' selected' : '') + '>' + _esc(cn) + '</option>'; });
            h += '</select></div>';
            [['n219', '219波'], ['n229', '229波'], ['n230', '230波'], ['other', '其他']].forEach(function (p2) {
                const val = (L.notes && L.notes[p2[0]]) || '';
                h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
                h += '<span style="color:#f0932b;font-size:0.72rem;font-weight:700;min-width:38px;">' + p2[1] + '</span>';
                h += '<input value="' + _esc(val) + '" oninput="_llSet(\'sailing\',\'' + s.id + '\',\'notes\',\'' + p2[0] + '\',this.value)" placeholder="这波上什么卡…" style="flex:1;padding:4px 6px;border-radius:5px;border:1px solid rgba(240,147,43,0.3);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:0.72rem;">';
                h += '</div>';
            });
            h += '<div style="margin-top:6px;"><button onclick="_llReset(\'sailing\',\'' + s.id + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.7rem;cursor:pointer;">↺ 重置个人设置</button></div>';
            h += '</div></div>';
        }
        h += '</div>';
        return h;
    }
    // ---------- 活动阵容卡片（左 A/B 卡组 右战车） ----------
    function _actCard(a) {
        let h = '<div style="border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:8px 10px;margin-bottom:8px;background:rgba(0,0,0,0.22);">';
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
        h += '<b style="color:#ffd700;font-size:0.9rem;">轮转第 ' + a.day + ' 天</b>';
        h += '<span style="flex:1;"></span>';
        h += '<button onclick="_llToggle(\'a' + a.day + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.08);color:#ffd700;font-size:0.72rem;cursor:pointer;">' + (state.open['a' + a.day] ? '▲ 收起' : '▼ 卡组与战车') + '</button>';
        h += '</div>';
        if (!state.open['a' + a.day]) {
            ['A', 'B'].forEach(function (ab) {
                h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">';
                h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.78rem;min-width:14px;">' + ab + '</span>';
                h += '<div style="color:rgba(255,255,255,0.65);font-size:0.74rem;">' + (a[ab] || []).map(_esc).join(' · ') + '</div>';
                h += '</div>';
            });
        } else {
            h += '<div style="display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:10px;">';
            h += '<div>';
            ['A', 'B'].forEach(function (ab) {
                h += '<div style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.76rem;margin:4px 0 3px;">' + ab + ' 组（点卡槽换皮肤/融合）</div>';
                h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:6px;">';
                (a[ab] || []).forEach(function (n, i) {
                    h += _slotHtml(ab.toLowerCase(), i % 5, n, '', 'activity', 'd' + a.day);
                });
                h += '</div>';
            });
            h += '</div>';
            h += '<div style="border-left:1px dashed rgba(255,255,255,0.15);padding-left:10px;">';
            h += '<div style="color:rgba(255,255,255,0.45);font-size:0.68rem;margin-bottom:4px;">🚂 战车（各自本机）</div>';
            ['A', 'B'].forEach(function (ab) {
                const id = 'd' + a.day + ab;
                const L = _slot('activity', id);
                h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
                h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.78rem;min-width:14px;">' + ab + '</span>';
                h += '<select onchange="_llSet(\'activity\',\'' + id + '\',\'cart\',null,this.value)" style="flex:1;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,215,0,0.35);background:#2a2a4a;color:#ffd700;font-size:0.78rem;">';
                h += '<option value="">未设置</option>';
                (window.CHARIOT_LIST || []).forEach(function (cn, i) { h += '<option value="' + (i + 1) + '"' + (String(L.cart) === String(i + 1) ? ' selected' : '') + '>' + _esc(cn) + '</option>'; });
                h += '</select></div>';
            });
            h += '<div style="margin-top:6px;"><button onclick="_llReset(\'activity\',\'d' + a.day + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.7rem;cursor:pointer;">↺ 重置该天设置</button></div>';
            h += '</div></div>';
        }
        h += '</div>';
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
