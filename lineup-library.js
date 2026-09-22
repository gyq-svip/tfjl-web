// ============================================================
// 📚 阵容图库（2026-09-22）
//   两个 tab：🚢 大航海（单人 10 卡 ×223 套，含战车/219·229·230 波备注）+ 🏆 活动阵容（双人 A/B，21 天轮转）
//   数据共享：lineup-data.js（部署即全员一致）；个人设置本地：等级/皮肤/融合/战车/备注（每人不同 → localStorage）
//   入口：计算器 🧮 旁的 📚 按钮
// ============================================================
(function () {
    const LS_KEY = 'tfjl_lineup_local_v1';
    const state = { tab: 'sail', q: '', page: 1, open: {} };   // open: 已展开编辑的阵容 key 集合
    const PAGE = 10;

    function _load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
    function _save(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} }
    function _slot(tab, id) {   // 取（并确保存在）某阵容的本地设置对象
        const o = _load();
        o[tab] = o[tab] || {};
        o[tab][id] = o[tab][id] || {};
        return o[tab][id];
    }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _escJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function _data() { return (window.LINEUP_LIBRARY && window.LINEUP_LIBRARY.sailing) ? window.LINEUP_LIBRARY : { sailing: [], activity: [] }; }

    // 皮肤头像：短名=注册表键（已验证基本一一对应），resolveHeroSkinUrl 失败 → 色块占位
    const _imgCache = {};
    function _skinImg(name) {
        if (_imgCache[name] !== undefined) return Promise.resolve(_imgCache[name]);
        return (async function () {
            let url = null;
            try {
                if (window.resolveHeroSkinUrl) url = await window.resolveHeroSkinUrl(name, '默认');
                if (!url && window.resolveHeroSkinInfo) { const i = await window.resolveHeroSkinInfo(name, '默认'); if (i && i.url) url = i.url; }
                if (!url && window.getHeroSkinUrl) url = window.getHeroSkinUrl(name);
            } catch (e) {}
            const img = url ? await new Promise(function (res) {
                const im = new Image();
                const t = setTimeout(function () { res(null); }, 4000);
                im.onload = function () { clearTimeout(t); res(im); };
                im.onerror = function () { clearTimeout(t); res(null); };
                im.src = url;
            }) : null;
            _imgCache[name] = img; return img;
        })();
    }
    function _hashHue(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360; return h; }
    // ---------- 面板 ----------
    window.openLineupLibraryPanel = function () {
        let ov = document.getElementById('lineupLibOverlay');
        if (ov) { ov.style.display = 'flex'; _render(); return; }
        ov = document.createElement('div');
        ov.id = 'lineupLibOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99996;background:rgba(0,0,0,0.62);display:flex;align-items:center;justify-content:center;';
        ov.innerHTML = '<div id="lineupLibPanel" style="width:min(1180px,97vw);max-height:94vh;overflow:auto;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(78,205,196,0.35);border-radius:14px;padding:12px 14px;box-shadow:0 10px 40px rgba(0,0,0,0.6);"></div>';
        ov.addEventListener('click', function (e) { if (e.target === ov) ov.style.display = 'none'; });
        document.body.appendChild(ov);
        _render();
    };
    window.closeLineupLibraryPanel = function () {
        const ov = document.getElementById('lineupLibOverlay');
        if (ov) ov.style.display = 'none';
    };
    window._llTab = function (t) { state.tab = t; state.page = 1; _render(); };
    window._llSearch = function (v) { state.q = String(v || '').trim(); state.page = 1; _render(); };
    window._llPage = function (d) { state.page = Math.max(1, state.page + d); _render(); };
    window._llToggle = function (key) { state.open[key] = !state.open[key]; _render(); };

    function _filteredSailing() {
        const q = state.q;
        return _data().sailing.filter(s => !q || s.heroes.some(h => h.indexOf(q) >= 0));
    }
    function _filteredActivity() {
        const q = state.q;
        return _data().activity.filter(d => !q || d.A.some(h => h.indexOf(q) >= 0) || d.B.some(h => h.indexOf(q) >= 0));
    }
    // ---------- 渲染 ----------
    function _render() {
        const p = document.getElementById('lineupLibPanel');
        if (!p) return;
        const D = _data();
        const isSail = state.tab === 'sail';
        const list = isSail ? _filteredSailing() : _filteredActivity();
        const pages = Math.max(1, Math.ceil(list.length / PAGE));
        if (state.page > pages) state.page = pages;
        const pageList = isSail ? list.slice((state.page - 1) * PAGE, state.page * PAGE) : list;

        let h = '';
        h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">';
        h += '<div style="font-size:1.1rem;font-weight:800;color:#4ecdc4;">📚 阵容图库</div>';
        h += '<button onclick="_llTab(\'sail\')" style="padding:6px 14px;border-radius:8px;border:1px solid ' + (isSail ? 'rgba(78,205,196,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' + (isSail ? 'rgba(78,205,196,0.18)' : 'transparent') + ';color:' + (isSail ? '#4ecdc4' : 'rgba(255,255,255,0.7)') + ';cursor:pointer;font-size:0.85rem;font-weight:700;">🚢 大航海(' + D.sailing.length + ')</button>';
        h += '<button onclick="_llTab(\'act\')" style="padding:6px 14px;border-radius:8px;border:1px solid ' + (!isSail ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.2)') + ';background:' + (!isSail ? 'rgba(255,215,0,0.15)' : 'transparent') + ';color:' + (!isSail ? '#ffd700' : 'rgba(255,255,255,0.7)') + ';cursor:pointer;font-size:0.85rem;font-weight:700;">🏆 活动阵容(' + D.activity.length + '天)</button>';
        h += '<input id="llSearch" value="' + _esc(state.q) + '" oninput="_llSearch(this.value)" placeholder="🔍 输入英雄名查所有含它的阵容…" style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.85rem;">';
        h += '<button onclick="closeLineupLibraryPanel()" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;">✖</button>';
        h += '</div>';
        h += '<div style="color:rgba(255,255,255,0.45);font-size:0.72rem;margin-bottom:8px;">卡组构成全员共享；<b style="color:rgba(255,255,255,0.7);">等级 / 皮肤 / 融合 / 战车 / 波次备注</b> 是你的个人设置，只存本机。展开某套阵容即可设置。</div>';

        if (isSail) {
            if (pages > 1) {
                h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
                h += '<button onclick="_llPage(-1)" ' + (state.page <= 1 ? 'disabled' : '') + ' style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">◀ 上一页</button>';
                h += '<span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">第 ' + state.page + ' / ' + pages + ' 页（共 ' + list.length + ' 套）</span>';
                h += '<button onclick="_llPage(1)" ' + (state.page >= pages ? 'disabled' : '') + ' style="padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">下一页 ▶</button>';
                h += '</div>';
            }
            pageList.forEach(function (s) { h += _sailCard(s); });
        } else {
            pageList.forEach(function (a) { h += _actCard(a); });
            if (!pageList.length) h += '<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;">没有匹配的阵容</div>';
        }
        p.innerHTML = h;
        _fillImgs(p);
    }

    function _heroStrip(names, tab, id) {
        return '<div style="display:flex;flex-wrap:wrap;gap:5px;">' + names.map(function (n) {
            return '<div style="width:52px;text-align:center;">'
                + '<div class="ll-av" data-hero="' + _esc(n) + '" style="width:52px;height:52px;border-radius:8px;overflow:hidden;background:hsl(' + _hashHue(n) + ',45%,35%);display:flex;align-items:flex-end;justify-content:center;">'
                + '<span style="color:#fff;font-size:0.66rem;text-shadow:0 1px 2px #000;">' + _esc(n.slice(0, 3)) + '</span></div>'
                + '<div style="color:rgba(255,255,255,0.65);font-size:0.62rem;margin-top:1px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="' + _esc(n) + '">' + _esc(n) + '</div>'
                + '</div>';
        }).join('') + '</div>';
    }
    function _fillImgs(root) {
        root.querySelectorAll('.ll-av[data-hero]').forEach(function (el) {
            if (el.__filled) return;
            el.__filled = 1;
            const name = el.getAttribute('data-hero');
            _skinImg(name).then(function (img) {
                if (img) { el.innerHTML = ''; el.style.background = '#111'; el.appendChild(img); }
            });
        });
    }
    // ---------- 大航海卡片 ----------
    function _sailCard(s) {
        const key = s.id;
        const L = _slot('sailing', key);
        const open = !!state.open[key];
        const cartName = L.cart && window.CHARIOT_LIST ? (window.CHARIOT_LIST[Number(L.cart) - 1] || '') : '';
        let h = '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:8px 10px;margin-bottom:8px;background:rgba(0,0,0,0.22);">';
        h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;">';
        h += '<b style="color:#4ecdc4;font-size:0.9rem;">#' + s.n + '</b>';
        if (cartName) h += '<span style="font-size:0.72rem;color:#ffd700;background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.35);border-radius:6px;padding:1px 6px;">🚂 ' + _esc(cartName) + '</span>';
        h += '<span style="color:rgba(255,255,255,0.35);font-size:0.7rem;">权重' + s.w + '</span>';
        const notesHit = (L.notes && (L.notes.n219 || L.notes.n229 || L.notes.n230 || L.notes.other));
        if (notesHit) h += '<span style="font-size:0.7rem;color:#f0932b;">📝 已记波次</span>';
        h += '<span style="flex:1;"></span>';
        h += '<button onclick="_llToggle(\'' + key + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(78,205,196,0.4);background:rgba(78,205,196,0.1);color:#4ecdc4;font-size:0.72rem;cursor:pointer;">' + (open ? '▲ 收起设置' : '▼ 等级/皮肤/战车') + '</button>';
        h += '</div>';
        h += _heroStrip(s.heroes, 'sailing', key);
        if (open) h += _sailEditor(s, L);
        h += '</div>';
        return h;
    }
    function _sailEditor(s, L) {
        const carts = (window.CHARIOT_LIST || []);
        let h = '<div style="margin-top:8px;border-top:1px dashed rgba(255,255,255,0.15);padding-top:8px;">';
        // 每英雄：等级/皮肤/融合
        h += '<div style="display:grid;grid-template-columns:auto 56px 1fr 1fr;gap:4px 8px;align-items:center;margin-bottom:6px;">';
        h += '<span style="color:rgba(255,255,255,0.4);font-size:0.66rem;">英雄</span><span style="color:rgba(255,255,255,0.4);font-size:0.66rem;">等级</span><span style="color:rgba(255,255,255,0.4);font-size:0.66rem;">皮肤</span><span style="color:rgba(255,255,255,0.4);font-size:0.66rem;">融合</span>';
        s.heroes.forEach(function (n) {
            const lv = (L.lv && L.lv[n]) || '';
            const sk = (L.skin && L.skin[n]) || '';
            const fu = (L.fus && L.fus[n]) || '';
            h += '<div style="display:flex;align-items:center;gap:4px;"><span style="color:rgba(255,255,255,0.8);font-size:0.72rem;">' + _esc(n) + '</span>'
                + (window.skinRegistry && window.skinRegistry[n] ? '<span style="color:rgba(255,255,255,0.35);font-size:0.6rem;">(' + (window.skinRegistry[n].length) + '皮)</span>' : '') + '</div>';
            h += '<input value="' + _esc(lv) + '" oninput="_llSet(\'sailing\',\'' + s.id + '\',\'lv\',\'' + _escJs(n) + '\',this.value)" placeholder="-" style="width:100%;padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.3);color:#ffd700;font-size:0.72rem;text-align:center;">';
            h += _skinSelect(n, sk, 'sailing', s.id);
            h += '<input value="' + _esc(fu) + '" oninput="_llSet(\'sailing\',\'' + s.id + '\',\'fus\',\'' + _escJs(n) + '\',this.value)" placeholder="融合副卡…" style="width:100%;padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:0.72rem;">';
        });
        h += '</div>';
        // 战车
        h += '<div style="display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap;">';
        h += '<span style="color:rgba(255,255,255,0.6);font-size:0.75rem;">🚂 战车</span>';
        h += '<select onchange="_llSet(\'sailing\',\'' + s.id + '\',\'cart\',null,this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(255,215,0,0.35);background:#2a2a4a;color:#ffd700;font-size:0.78rem;">';
        h += '<option value="">未设置</option>';
        carts.forEach(function (cn, i) { h += '<option value="' + (i + 1) + '"' + (String(L.cart) === String(i + 1) ? ' selected' : '') + '>' + _esc(cn) + '</option>'; });
        h += '</select></div>';
        // 波次备注
        h += '<div style="display:grid;grid-template-columns:64px 1fr;gap:4px 8px;align-items:center;">';
        [['n219', '219波'], ['n229', '229波'], ['n230', '230波'], ['other', '其他']].forEach(function (p) {
            const val = (L.notes && L.notes[p[0]]) || '';
            h += '<span style="color:#f0932b;font-size:0.72rem;font-weight:700;">' + p[1] + '</span>';
            h += '<input value="' + _esc(val) + '" oninput="_llSet(\'sailing\',\'' + s.id + '\',\'notes\',\'' + p[0] + '\',this.value)" placeholder="这波上什么卡…" style="width:100%;padding:3px 6px;border-radius:5px;border:1px solid rgba(240,147,43,0.3);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:0.72rem;">';
        });
        h += '</div>';
        h += '<div style="margin-top:6px;text-align:right;"><button onclick="_llReset(\'sailing\',\'' + s.id + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.7rem;cursor:pointer;">↺ 重置个人设置</button></div>';
        h += '</div>';
        return h;
    }
    // ---------- 活动阵容卡片 ----------
    function _actCard(a) {
        let h = '<div style="border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:8px 10px;margin-bottom:8px;background:rgba(0,0,0,0.22);">';
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">';
        h += '<b style="color:#ffd700;font-size:0.9rem;">轮转第 ' + a.day + ' 天</b>';
        h += '<span style="flex:1;"></span>';
        h += '<button onclick="_llToggle(\'a' + a.day + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.08);color:#ffd700;font-size:0.72rem;cursor:pointer;">' + (state.open['a' + a.day] ? '▲ 收起设置' : '▼ 皮肤/融合/战车') + '</button>';
        h += '</div>';
        ['A', 'B'].forEach(function (ab) {
            const names = a[ab] || [];
            const L = _slot('activity', 'd' + a.day + ab);
            const cartName = L.cart && window.CHARIOT_LIST ? (window.CHARIOT_LIST[Number(L.cart) - 1] || '') : '';
            h += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">';
            h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.8rem;min-width:16px;">' + ab + '</span>';
            h += '<div style="flex:1;">' + _heroStrip(names) + '</div>';
            h += '<div style="text-align:right;">' + (cartName ? '<span style="font-size:0.7rem;color:#ffd700;">🚂 ' + _esc(cartName) + '</span>' : '') + '</div>';
            h += '</div>';
        });
        if (state.open['a' + a.day]) h += _actEditor(a);
        h += '</div>';
        return h;
    }
    function _actEditor(a) {
        const carts = (window.CHARIOT_LIST || []);
        let h = '<div style="margin-top:6px;border-top:1px dashed rgba(255,255,255,0.15);padding-top:8px;">';
        ['A', 'B'].forEach(function (ab) {
            const id = 'd' + a.day + ab;
            const L = _slot('activity', id);
            h += '<div style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.78rem;margin:4px 0 3px;">' + ab + ' 组个人设置</div>';
            h += '<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:4px 8px;align-items:center;margin-bottom:4px;">';
            (a[ab] || []).forEach(function (n) {
                const sk = (L.skin && L.skin[n]) || '';
                const fu = (L.fus && L.fus[n]) || '';
                h += '<span style="color:rgba(255,255,255,0.8);font-size:0.72rem;">' + _esc(n) + '</span>';
                h += _skinSelect(n, sk, 'activity', id);
                h += '<input value="' + _esc(fu) + '" oninput="_llSet(\'activity\',\'' + id + '\',\'fus\',\'' + _escJs(n) + '\',this.value)" placeholder="融合副卡…" style="width:100%;padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:0.72rem;">';
            });
            h += '</div>';
            h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0 8px;">';
            h += '<span style="color:rgba(255,255,255,0.6);font-size:0.75rem;">🚂 战车</span>';
            h += '<select onchange="_llSet(\'activity\',\'' + id + '\',\'cart\',null,this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(255,215,0,0.35);background:#2a2a4a;color:#ffd700;font-size:0.78rem;">';
            h += '<option value="">未设置</option>';
            carts.forEach(function (cn, i) { h += '<option value="' + (i + 1) + '"' + (String(L.cart) === String(i + 1) ? ' selected' : '') + '>' + _esc(cn) + '</option>'; });
            h += '</select></div>';
        });
        h += '<div style="text-align:right;"><button onclick="_llReset(\'activity\',\'d' + a.day + '\')" style="padding:2px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:0.7rem;cursor:pointer;">↺ 重置该天设置</button></div>';
        h += '</div>';
        return h;
    }
    // ---------- 控件 ----------
    function _skinSelect(hero, cur, tab, id) {
        const reg = window.skinRegistry && window.skinRegistry[hero];
        if (!reg || !reg.length) {
            // 注册表没有该英雄的皮肤列表 → 文本输入（仍可记录）
            return '<input value="' + _esc(cur) + '" oninput="_llSet(\'' + tab + '\',\'' + _escJs(id) + '\',\'skin\',\'' + _escJs(hero) + '\',this.value)" placeholder="皮肤名…" style="width:100%;padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,0.16);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.85);font-size:0.72rem;">';
        }
        let h = '<select onchange="_llSet(\'' + tab + '\',\'' + _escJs(id) + '\',\'skin\',\'' + _escJs(hero) + '\',this.value)" style="width:100%;padding:3px 4px;border-radius:5px;border:1px solid rgba(255,255,255,0.16);background:#22224a;color:#fff;font-size:0.72rem;">';
        h += '<option value="">默认皮肤</option>';
        reg.forEach(function (s) {
            const nm = (typeof s === 'string') ? s : (s && s.name) || '';
            if (!nm) return;
            h += '<option value="' + _esc(nm) + '"' + (cur === nm ? ' selected' : '') + '>' + _esc(nm) + '</option>';
        });
        h += '</select>';
        return h;
    }
    window._llSet = function (tab, id, field, sub, val) {
        const o = _load();
        o[tab] = o[tab] || {};
        o[tab][id] = o[tab][id] || {};
        const slot = o[tab][id];
        if (sub === null) { slot[field] = val; }          // 战车等标量
        else { slot[field] = slot[field] || {}; if (val) slot[field][sub] = val; else delete slot[field][sub]; }
        // 清理空对象：全空则删除该阵容的个人设置
        const dirty = Object.keys(slot).some(function (k) {
            const v = slot[k];
            return (v && typeof v === 'object') ? Object.keys(v).length > 0 : !!v;
        });
        if (!dirty) delete o[tab][id];
        _save(o);
    };
    window._llReset = function (tab, id) {
        const o = _load();
        if (o[tab]) delete o[tab][id];
        _save(o);
        _render();
        try { if (typeof showToast === 'function') showToast('已重置该阵容的个人设置', 'info'); } catch (e) {}
    };
})();
