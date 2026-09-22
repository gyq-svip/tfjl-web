// ============================================================
// 📅 每日卡组轮换（2026-09-22）
//   活动每天出 A/B 两个卡组（A=我的、B=队友的），连续 7 天。
//   数据 = 卡名文本（源数据），海报 PNG 只是导出产物 —— 改名/换皮/离线都能重新生成。
//   存储：localStorage 'tfjl_daily_rotation_v1'（全局，不绑项目；其它功能以后可直接读）
//   入口：卡组工具栏「📅 轮换」按钮（index.html，📸 分享 旁边）
// ============================================================
(function () {
    const LS_KEY = 'tfjl_daily_rotation_v1';
    const DAYS = 7;

    function _load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
    function _save(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
    function _cfg() { const c = _load(); if (!c.slots) c.slots = {}; if (!c.title) c.title = '塔防精灵 · 每日卡组轮换'; return c; }
    function _parseNames(txt) { return String(txt || '').split(/[,，、\n\r]+/).map(s => s.trim()).filter(Boolean); }
    function _slotDate(cfg, day) {
        if (!cfg.startDate) return null;
        const d = new Date(cfg.startDate + 'T00:00:00'); if (isNaN(d)) return null;
        d.setDate(d.getDate() + (day - 1)); return d;
    }
    function _todayIndex(cfg) {
        if (!cfg.startDate) return -1;
        const t0 = new Date(cfg.startDate + 'T00:00:00'); if (isNaN(t0)) return -1;
        const now = new Date();
        const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - t0) / 86400000);
        return (diff >= 0 && diff < DAYS) ? (diff + 1) : -1;
    }
    // 从当前阵容读卡名（按槽位顺序）：which='my'→u1..u7，'team'→t1..t7
    function _readCurrentLineup(which) {
        const pref = which === 'team' ? 't' : 'u';
        const out = [];
        try {
            document.querySelectorAll('.battle-slot[data-slot^="' + pref + '"]').forEach(function (sl) {
                const n = sl.querySelector('.card-name');
                if (n && n.textContent.trim()) out.push(n.textContent.trim());
            });
        } catch (e) {}
        return out;
    }

    // ---------- 面板 ----------
    window.openDailyRotationPanel = function () {
        let ov = document.getElementById('dailyRotationOverlay');
        if (ov) { ov.style.display = 'flex'; _refreshPanel(); return; }
        ov = document.createElement('div');
        ov.id = 'dailyRotationOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.62);display:flex;align-items:center;justify-content:center;';
        ov.innerHTML = '<div id="dailyRotationPanel" style="width:min(1240px,96vw);max-height:92vh;overflow:auto;background:linear-gradient(160deg,#141a33,#0d1b2a);border:1px solid rgba(255,215,0,0.35);border-radius:14px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,0.6);"></div>';
        ov.addEventListener('click', function (e) { if (e.target === ov) ov.style.display = 'none'; });
        document.body.appendChild(ov);
        _refreshPanel();
    };
    window.closeDailyRotationPanel = function () {
        const ov = document.getElementById('dailyRotationOverlay');
        if (ov) ov.style.display = 'none';
    };
    // ---------- 面板渲染 ----------
    function _refreshPanel() {
        const p = document.getElementById('dailyRotationPanel');
        if (!p) return;
        const cfg = _cfg();
        const today = _todayIndex(cfg);
        let h = '';
        h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">';
        h += '<div style="font-size:1.15rem;font-weight:800;color:#ffd700;">📅 每日卡组轮换</div>';
        h += '<span style="color:rgba(255,255,255,0.55);font-size:0.78rem;">A=我的卡组 · B=队友卡组 · 每天活动出题，提前把 7 天排好</span>';
        h += '<span style="flex:1;"></span>';
        h += '<button onclick="closeDailyRotationPanel()" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;">✖ 关闭</button>';
        h += '</div>';
        h += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">';
        h += '<label style="color:rgba(255,255,255,0.7);font-size:0.8rem;">标题</label>';
        h += '<input id="drTitle" value="' + String(cfg.title || '').replace(/"/g, '&quot;') + '" oninput="_drSaveDebounced()" style="flex:1;min-width:220px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.88rem;">';
        h += '<label style="color:rgba(255,255,255,0.7);font-size:0.8rem;">第1天日期</label>';
        h += '<input id="drStart" type="date" value="' + (cfg.startDate || '') + '" onchange="_drSaveDebounced()" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:0.85rem;">';
        h += '<button onclick="_drExportPoster()" style="padding:8px 16px;border-radius:8px;border:none;background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;cursor:pointer;font-weight:700;">🖼 导出海报 PNG</button>';
        h += '<button onclick="_drClearAll()" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);cursor:pointer;">🗑 清空</button>';
        h += '</div>';
        h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">';
        for (let d = 1; d <= DAYS; d++) {
            const dt = _slotDate(cfg, d);
            const md = dt ? (dt.getMonth() + 1) + '/' + dt.getDate() : '—';
            const wk = dt ? '日一二三四五六'[dt.getDay()] : '';
            const isToday = (d === today);
            h += '<div' + (isToday ? ' id="drTodayCol"' : '') + ' style="border:1px solid ' + (isToday ? 'rgba(255,215,0,0.85)' : 'rgba(255,255,255,0.14)') + ';border-radius:10px;background:' + (isToday ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)') + ';padding:6px;">';
            h += '<div style="text-align:center;margin-bottom:4px;">';
            h += '<span style="font-weight:800;color:' + (isToday ? '#ffd700' : 'rgba(255,255,255,0.85)') + ';font-size:0.9rem;">第' + d + '天</span>';
            h += '<span style="color:rgba(255,255,255,0.5);font-size:0.72rem;margin-left:4px;">' + md + (wk ? ' 周' + wk : '') + '</span>';
            if (isToday) h += '<span style="display:inline-block;margin-left:4px;padding:0 6px;border-radius:8px;background:linear-gradient(135deg,#ffd700,#ff9800);color:#1a1a2e;font-size:0.68rem;font-weight:800;">今天</span>';
            h += '</div>';
            ['A', 'B'].forEach(function (ab) {
                const key = 'd' + d + ab;
                const who = ab === 'A' ? '👤 我的' : '👥 队友';
                const whoBtn = ab === 'A' ? '我方' : '队友';
                h += '<div style="border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px;margin-bottom:6px;background:rgba(0,0,0,0.25);">';
                h += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">';
                h += '<span style="font-weight:800;color:' + (ab === 'A' ? '#4ecdc4' : '#f0932b') + ';font-size:0.78rem;">' + ab + '</span>';
                h += '<span style="color:rgba(255,255,255,0.6);font-size:0.7rem;">' + who + '</span>';
                h += '<span style="flex:1;"></span>';
                h += '<button onclick="_drFillLineup(\'' + key + '\',\'' + (ab === 'A' ? 'my' : 'team') + '\')" title="把当前打开项目' + whoBtn + '卡组的卡名填进来" style="padding:1px 6px;border-radius:6px;border:1px solid rgba(78,205,196,0.35);background:rgba(78,205,196,0.12);color:#4ecdc4;font-size:0.68rem;cursor:pointer;">📋 当前' + whoBtn + '</button>';
                h += '<button onclick="_drClearSlot(\'' + key + '\')" title="清空" style="padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);background:transparent;color:rgba(255,255,255,0.5);font-size:0.68rem;cursor:pointer;">✖</button>';
                h += '</div>';
                h += '<textarea id="dr_' + key + '" oninput="_drSaveDebounced()" placeholder="一行一个卡名" style="width:100%;box-sizing:border-box;height:96px;resize:vertical;border:none;outline:none;background:transparent;color:rgba(255,255,255,0.88);font-size:0.78rem;line-height:1.5;">' + String(cfg.slots[key] || '').replace(/</g, '&lt;') + '</textarea>';
                h += '</div>';
            });
            h += '</div>';
        }
        h += '</div>';
        h += '<div style="color:rgba(255,255,255,0.4);font-size:0.72rem;margin-top:8px;line-height:1.6;">💡 卡名一行一个（导出海报时自动配皮肤头像，缺皮的画色块占位）。「📋 当前我方/队友」= 把你现在打开项目的 7 格阵容一键填入。数据存本地浏览器。</div>';
        p.innerHTML = h;
    }
    let _saveTimer = null;
    window._drSaveDebounced = function () {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function () {
            const cfg = _cfg();
            const t = document.getElementById('drTitle'); if (t) cfg.title = t.value;
            const s = document.getElementById('drStart'); if (s) cfg.startDate = s.value;
            for (let d = 1; d <= DAYS; d++) ['A', 'B'].forEach(function (ab) {
                const el = document.getElementById('dr_d' + d + ab);
                if (el) cfg.slots['d' + d + ab] = el.value;
            });
            _save(cfg);
            const ae = document.activeElement;
            if (!ae || !/dr_d\d[AB]/.test(ae.id || '')) _refreshPanel();   // 今天高亮可能随起始日期变化
        }, 350);
    };
    window._drFillLineup = function (key, which) {
        const el = document.getElementById('dr_' + key);
        if (!el) return;
        const names = _readCurrentLineup(which);
        if (!names.length) { try { if (typeof showToast === 'function') showToast('当前项目' + (which === 'my' ? '我方' : '队友') + '卡组是空的，先上卡再填', 'info'); } catch (e) {} return; }
        el.value = names.join('\n');
        window._drSaveDebounced();
        try { if (typeof showToast === 'function') showToast('已填入 ' + names.length + ' 张卡', 'info'); } catch (e) {}
    };
    window._drClearSlot = function (key) {
        const el = document.getElementById('dr_' + key);
        if (el) el.value = '';
        window._drSaveDebounced();
    };
    window._drClearAll = function () {
        if (!confirm('清空全部 14 个卡组的卡名？（标题与起始日期保留）')) return;
        const cfg = _cfg(); cfg.slots = {}; _save(cfg); _refreshPanel();
    };

    // ---------- 海报导出 ----------
    const _imgCache = {};
    async function _skinImg(name) {
        if (_imgCache[name] !== undefined) return _imgCache[name];
        let url = null;
        try {
            if (window.resolveHeroSkinUrl) url = await window.resolveHeroSkinUrl(name, '默认');
            if (!url && window.resolveHeroSkinInfo) { const i = await window.resolveHeroSkinInfo(name, '默认'); if (i && i.url) url = i.url; }
            if (!url && window.getHeroSkinUrl) url = window.getHeroSkinUrl(name);
        } catch (e) {}
        if (!url) { _imgCache[name] = null; return null; }
        const img = await new Promise(function (resolve) {
            const im = new Image();
            const t = setTimeout(function () { resolve(null); }, 4000);
            im.onload = function () { clearTimeout(t); resolve(im); };
            im.onerror = function () { clearTimeout(t); resolve(null); };
            im.src = url;
        });
        _imgCache[name] = img; return img;
    }
    function _hashHue(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360; return h; }
    function _rr(ctx, x, y, w, h2, r) { _rrPath(ctx, x, y, w, h2, r); ctx.fill(); }
    function _rrPath(ctx, x, y, w, h2, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h2, r);
        ctx.arcTo(x + w, y + h2, x, y + h2, r);
        ctx.arcTo(x, y + h2, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    window._drExportPoster = async function () {
        const cfg = _cfg();
        const today = _todayIndex(cfg);
        const W = 1680, H = 1080, S = 2;
        const cv = document.createElement('canvas');
        cv.width = W * S; cv.height = H * S;
        const ctx = cv.getContext('2d');
        ctx.scale(S, S);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0a0e27'); bg.addColorStop(0.5, '#1a1a3e'); bg.addColorStop(1, '#0d1b2a');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.font = '800 40px "Microsoft YaHei", system-ui, sans-serif';
        ctx.fillText(cfg.title || '塔防精灵 · 每日卡组轮换', W / 2, 62);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '400 17px "Microsoft YaHei", system-ui, sans-serif';
        ctx.fillText('7天 × A/B 两套（A=我的 · B=队友）' + (cfg.startDate ? ' · 第1天 ' + cfg.startDate : ''), W / 2, 92);
        const mx = 24, gap = 10;
        const colW = Math.floor((W - mx * 2 - gap * (DAYS - 1)) / DAYS);
        const topY = 116;
        const cellH = (H - topY - 26 - 44) / 2 - 8;
        for (let d = 1; d <= DAYS; d++) {
            const x0 = mx + (d - 1) * (colW + gap);
            const isToday = (d === today);
            const dt = _slotDate(cfg, d);
            if (isToday) { ctx.fillStyle = 'rgba(255,215,0,0.12)'; _rr(ctx, x0, topY, colW, H - topY - 26, 12); }
            ctx.textAlign = 'left';
            ctx.fillStyle = isToday ? '#ffd700' : 'rgba(255,255,255,0.9)';
            ctx.font = '800 20px "Microsoft YaHei", system-ui, sans-serif';
            ctx.fillText('第' + d + '天', x0 + 10, topY + 26);
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '400 13px "Microsoft YaHei", system-ui, sans-serif';
            const md = dt ? (dt.getMonth() + 1) + '/' + dt.getDate() + ' 周' + '日一二三四五六'[dt.getDay()] : '未设日期';
            ctx.fillText(md + (isToday ? ' · 今天' : ''), x0 + 66, topY + 25);
            ['A', 'B'].forEach(function (ab, bi) {
                const cy = topY + 44 + bi * (cellH + 8);
                ctx.fillStyle = 'rgba(255,255,255,0.045)';
                _rr(ctx, x0, cy, colW, cellH, 10);
                ctx.fillStyle = ab === 'A' ? '#4ecdc4' : '#f0932b';
                _rr(ctx, x0 + 8, cy + 8, 22, 20, 5);
                ctx.fillStyle = '#10131f';
                ctx.font = '800 14px "Microsoft YaHei", system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(ab, x0 + 19, cy + 23);
                ctx.textAlign = 'left';
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '400 12px "Microsoft YaHei", system-ui, sans-serif';
                ctx.fillText(ab === 'A' ? '我的卡组' : '队友卡组', x0 + 36, cy + 23);
                const names = _parseNames(cfg.slots['d' + d + ab]).slice(0, 15);
                const per = 5, cw = Math.floor((colW - 16) / per), chh = cw;
                names.forEach(function (n, ci) {
                    const gx = x0 + 8 + (ci % per) * (cw + 4);
                    const gy = cy + 34 + Math.floor(ci / per) * (chh + 6);
                    const img = _imgCache[n];
                    if (img) {
                        ctx.save();
                        _rrPath(ctx, gx, gy, cw, chh, 7); ctx.clip();
                        const ir = img.width / img.height, cr = cw / chh;
                        let dw, dh;
                        if (ir > cr) { dh = chh; dw = chh * ir; } else { dw = cw; dh = cw / ir; }
                        ctx.drawImage(img, gx + (cw - dw) / 2, gy + (chh - dh) / 2, dw, dh);
                        ctx.restore();
                    } else {
                        const hue = _hashHue(n);
                        const g2 = ctx.createLinearGradient(gx, gy, gx, gy + chh);
                        g2.addColorStop(0, 'hsl(' + hue + ',45%,42%)'); g2.addColorStop(1, 'hsl(' + hue + ',55%,28%)');
                        ctx.fillStyle = g2;
                        _rr(ctx, gx, gy, cw, chh, 7);
                    }
                    ctx.fillStyle = 'rgba(0,0,0,0.45)';
                    _rr(ctx, gx, gy + chh - 14, cw, 14, 3);
                    ctx.fillStyle = 'rgba(255,255,255,0.92)';
                    ctx.font = '600 10px "Microsoft YaHei", system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(n.length > 4 ? n.slice(0, 4) : n, gx + cw / 2, gy + chh - 4);
                    ctx.textAlign = 'left';
                });
                if (!names.length) {
                    ctx.fillStyle = 'rgba(255,255,255,0.25)';
                    ctx.font = '400 13px "Microsoft YaHei", system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('（未填写）', x0 + colW / 2, cy + cellH / 2 + 5);
                    ctx.textAlign = 'left';
                }
            });
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '400 12px "Microsoft YaHei", system-ui, sans-serif';
        ctx.textAlign = 'right';
        const now = new Date();
        ctx.fillText('生成于 ' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'), W - 20, H - 12);
        // 预载皮肤头像（缺皮 → 色块占位，离线可用）
        const all = [];
        for (let d = 1; d <= DAYS; d++) ['A', 'B'].forEach(function (ab) { _parseNames(cfg.slots['d' + d + ab]).forEach(function (n) { all.push(n); }); });
        try { if (typeof showToast === 'function') showToast('🖼 正在收集皮肤头像（' + all.length + ' 张）…', 'info'); } catch (e) {}
        for (const n of Array.from(new Set(all))) await _skinImg(n);
        const done = function (href) {
            const a = document.createElement('a');
            a.href = href;
            a.download = '每日卡组轮换_' + (cfg.startDate || '') + '.png';
            document.body.appendChild(a); a.click();
            setTimeout(function () { try { a.remove(); } catch (e) {} }, 800);
            try { if (typeof showToast === 'function') showToast('✅ 海报已导出（下载里）', 'info'); } catch (e) {}
        };
        cv.toBlob(function (b) { if (b) done(URL.createObjectURL(b)); else done(cv.toDataURL('image/png')); }, 'image/png');
    };
})();
