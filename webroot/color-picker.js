/* =====================================================================
 * color-picker.js — 通用取色器组件（HTML文件，任意面板一行挂载复用）
 * =====================================================================
 * 设计目标：把「取色 + 给一段文本区间着色」变成真正可复用的模板。
 *   核心分两层：
 *   - NBPC.Wheel   通用 HSV 圆盘取色器控件（绘制/拖动/亮度条/自选色块/样式注入）
 *   - NBPC.Marks   通用「文本区间标记」工具（锚定/插入/清除/匹配/持久化）
 *   另附 NBPC.color 全局色配置（整篇色），及纯色彩工具 hsvToHex 等。
 *
 * 任何宿主（记事本、脚本窗口、查找高亮、未来的面板）只要：
 *   ① 在 HTML 里放好带 {prefix}_wheel / {prefix}_vBar / {prefix}_preview /
 *      {prefix}_hexTxt / {prefix}_colorSlots 的弹窗结构；
 *   ② 调 NBPC.Wheel.init({prefix, onApply, onPreview, onPick})；
 * 即可获得完整可用的取色器。区间着色则用 NBPC.Marks 的纯函数喂进宿主的渲染层。
 * ---------------------------------------------------------------------
 * 依赖：无（纯自包含，不引用项目其它全局）。可被网页与桌面(Bridge)复用。
 * 兼容：桌面端 window.writeTextFile/blob 之类的磁盘能力由宿主决定，本组件只管
 *   localStorage，磁盘持久化交给宿主调用方。
 * ==================================================================== */

(function () {
    'use strict';

    if (window.NBPC) return; // 防止重复引入

    /* ---------------- 常量 ---------------- */
    const LS_COLORS = 'tfjl_notebook_colors';      // 全局色配置键
    const DEFAULT_COLOR = '#e0e0e0';               // 未设置时的默认整篇色

    /* ---------------- 色彩工具 ---------------- */

    // 任意颜色字符串 → #rrggbb（input[type=color] 只认 hex），非法返回 ''
    function toHex(c) {
        if (!c) return '';
        c = String(c).trim();
        if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
        return '';
    }

    function hsvToRgb(h, s, v) {
        h = ((h % 360) + 360) % 360;
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    function hsvToHex(h, s, v) {
        return '#' + hsvToRgb(h, s, v).map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // #rrggbb / 任意合法 → [h(0-360), s(0-1), v(0-1)]
    function hexToHsv(hex) {
        const c = toHex(hex) || DEFAULT_COLOR;
        const r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d !== 0) {
            if (mx === r) h = 60 * (((g - b) / d) % 6);
            else if (mx === g) h = 60 * ((b - r) / d + 2);
            else h = 60 * ((r - g) / d + 4);
        }
        if (h < 0) h += 360;
        return [h, mx === 0 ? 0 : d / mx, mx];
    }

    /* ---------------- 全局色配置（整篇色） ---------------- */

    function normalizeCfg(o) {
        const color = (o && toHex(o.color)) || DEFAULT_COLOR;
        let slots = (o && Array.isArray(o.slots)) ? o.slots.map(toHex).filter(Boolean) : [];
        slots = slots.filter((c, i) => c !== DEFAULT_COLOR && slots.indexOf(c) === i).slice(0, 2);
        return { color: color, slots: slots };
    }

    const cfg = { color: DEFAULT_COLOR, slots: [] };
    (function load() {
        try {
            const s = localStorage.getItem(LS_COLORS);
            if (s) Object.assign(cfg, normalizeCfg(JSON.parse(s)));
        } catch (e) {}
    })();

    function saveCfg() {
        try { localStorage.setItem(LS_COLORS, JSON.stringify(cfg)); } catch (e) {}
    }

    // 从磁盘/外部值校正一次（本地缓存秒显后异步校正）
    function applyExternalCfg(o) {
        Object.assign(cfg, normalizeCfg(o));
        try { localStorage.setItem(LS_COLORS, JSON.stringify(cfg)); } catch (e) {}
    }

    // 整篇换色：remember=true 时把非默认色存入 2 个自选槽
    function setGlobalColor(hex, remember) {
        const c = toHex(hex) || DEFAULT_COLOR;
        cfg.color = c;
        if (remember && c !== DEFAULT_COLOR) {
            const slots = cfg.slots.filter(x => x !== c);
            slots.unshift(c);
            cfg.slots = slots.slice(0, 2);
        }
        saveCfg();
        return c;
    }

    /* ---------------- 区间标记工具（Marks） ---------------- */

    // 把标记按当前文本重新锚定（文本编辑后仍尽量贴合；原文消失则丢弃）。
    // marks: [{text,color,glow,start}]；返回新数组（含排序），不修改入参。
    function anchor(text, marks) {
        const out = [];
        let cursor = 0;
        const sorted = (marks || []).slice().sort((a, b) => (a.start || 0) - (b.start || 0));
        for (const m of sorted) {
            if (!m || !m.text) continue;
            let idx = text.indexOf(m.text, cursor);
            if (idx < 0) idx = text.indexOf(m.text);
            if (idx < 0) continue;
            out.push({ start: idx, text: m.text, color: m.color, glow: !!m.glow });
            cursor = idx + m.text.length;
        }
        return out;
    }

    // 在标记集合中「裁剪并插入」一个区间 [s,e)。
    // 与宿主的选中上色语义一致：与新区间重叠的旧标记要去掉，再把新区间插入并排序。
    // seg: {s, e, color, glow}（text 自动从 text 里取值）
    function clipInsert(text, marks, seg) {
        if (!seg || seg.s >= seg.e) return (marks || []).slice();
        const value = String(text || '');
        const clipped = (marks || []).filter(m => (m.start + (m.text || '').length) <= seg.s || m.start >= seg.e);
        clipped.push({ text: value.substring(seg.s, seg.e), color: seg.color, glow: !!seg.glow, start: seg.s });
        console.log('[NBPC.Marks.clipInsert] insert', seg, 'out', clipped);
        return clipped.sort((a, b) => a.start - b.start);
    }

    // 删除覆盖 [s,e) 区间的标记（清除选中颜色）
    function clearRange(text, marks, s, e) {
        void text;
        return (marks || []).filter(m => (m.start + (m.text || '').length) <= s || m.start >= e);
    }

    // 找出所有匹配 → [{start,end}]。caseSensitive：区分大小写。
    function matches(text, query, caseSensitive) {
        const str = String(text || ''), q = String(query || '');
        if (!q) return [];
        const flags = caseSensitive ? 'g' : 'gi';
        const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(esc, flags);
        const out = [];
        let m;
        while ((m = re.exec(str)) !== null) {
            out.push({ start: m.index, end: m.index + m[0].length });
            if (m[0].length === 0) re.lastIndex++;
        }
        return out;
    }

    /* ---------------- 通用 HSV 色轮控件（Wheel） ---------------- */

    const _state = {};       // prefix -> {h,s,v}
    const _handlers = {};    // prefix -> {onApply,onPreview,onPick,onModeHint}

    function drawWheel(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, hgt = canvas.height, R = w / 2;
        const img = ctx.createImageData(w, hgt);
        const d = img.data;
        for (let y = 0; y < hgt; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - R + 0.5, dy = y - R + 0.5;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const i = (y * w + x) * 4;
                if (dist > R) { d[i + 3] = 0; continue; }
                let deg = Math.atan2(dy, dx) * 180 / Math.PI;
                if (deg < 0) deg += 360;
                const rgb = hsvToRgb(deg, Math.min(1, dist / R), 1);
                d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
                d[i + 3] = dist > R - 1.5 ? Math.max(0, Math.round(255 * (R - dist) / 1.5)) : 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    // 把 hex 同步到色轮 UI（指针/亮度条/预览/hex 文本）
    function sync(prefix, hex) {
        const canvas = document.getElementById(prefix + '_wheel');
        if (!canvas || canvas.dataset.inited !== '1') return;
        const hsv = hexToHsv(hex);
        const prev = _state[prefix];
        if (prev) {
            if (hsv[2] === 0) { hsv[0] = prev.h; hsv[1] = prev.s; }
            else if (hsv[1] === 0) { hsv[0] = prev.h; }
        }
        _state[prefix] = { h: hsv[0], s: hsv[1], v: hsv[2] };
        const R = (canvas.clientWidth || 132) / 2;
        const dot = document.getElementById(prefix + '_wheelDot');
        if (dot) {
            const rad = hsv[0] * Math.PI / 180;
            dot.style.left = (R + Math.cos(rad) * hsv[1] * R) + 'px';
            dot.style.top = (R + Math.sin(rad) * hsv[1] * R) + 'px';
            dot.style.background = hex;
        }
        const bar = document.getElementById(prefix + '_vBar');
        if (bar) bar.style.background = 'linear-gradient(to right,#000,' + hsvToHex(hsv[0], hsv[1], 1) + ')';
        const vDot = document.getElementById(prefix + '_vDot');
        if (vDot) { vDot.style.left = (hsv[2] * 100) + '%'; vDot.style.background = hex; }
        const pv = document.getElementById(prefix + '_preview');
        if (pv) pv.style.background = hex;
        const tx = document.getElementById(prefix + '_hexTxt');
        if (tx) tx.textContent = hex;
    }

    // 初始化色轮（只做一次）：绘制 + 绑定拖动。onPreview 拖动实时回调；onApply 松手回调。
    function init(prefix, opts) {
        const canvas = document.getElementById(prefix + '_wheel');
        const bar = document.getElementById(prefix + '_vBar');
        if (!canvas || canvas.dataset.inited === '1') return;
        canvas.dataset.inited = '1';
        opts = opts || {};
        _handlers[prefix] = { onApply: opts.onApply, onPreview: opts.onPreview, onPick: opts.onPick };
        const SIZE = 132, dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(SIZE * dpr);
        canvas.height = Math.round(SIZE * dpr);
        drawWheel(canvas);

        const st = () => (_state[prefix] = _state[prefix] || { h: 0, s: 0, v: 0.88 });
        const H = () => _handlers[prefix] || {};

        const pickFromWheel = (e) => {
            const rect = canvas.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width * 2 - 1;
            const ny = (e.clientY - rect.top) / rect.height * 2 - 1;
            let deg = Math.atan2(ny, nx) * 180 / Math.PI;
            if (deg < 0) deg += 360;
            const s = st();
            s.h = deg;
            s.s = Math.min(1, Math.sqrt(nx * nx + ny * ny));
            if (s.v < 0.15) s.v = 1;
            const hex = hsvToHex(s.h, s.s, s.v);
            if (H().onPreview) H().onPreview(hex);
            sync(prefix, hex);
            return hex;
        };
        const pickFromBar = (e) => {
            const rect = bar.getBoundingClientRect();
            const s = st();
            s.v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const hex = hsvToHex(s.h, s.s, s.v);
            if (H().onPreview) H().onPreview(hex);
            sync(prefix, hex);
            return hex;
        };

        const bindDrag = (el, picker) => {
            if (!el) return;
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation(); // 防止被窗口拖拽标题栏抢占
                let hex = picker(e);
                const h = () => _handlers[prefix] || {};
                const onMove = (ev) => { ev.preventDefault(); hex = picker(ev); };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove, true);
                    document.removeEventListener('mouseup', onUp, true);
                    if (h().onApply) h().onApply(hex);
                };
                document.addEventListener('mousemove', onMove, true);
                document.addEventListener('mouseup', onUp, true);
            });
        };
        bindDrag(canvas, pickFromWheel);
        bindDrag(bar, pickFromBar);
    }

    // 渲染色块（默认色 + 2 自选色）。onPick 由 init 传入；空槽显示虚线圆。
    function swatches(prefix, currentColor, slots, onPick) {
        const box = document.getElementById(prefix + '_colorSlots');
        if (!box) return;
        if (onPick) _handlers[prefix] = Object.assign({}, _handlers[prefix] || {}, { onPick: onPick });
        const list = [DEFAULT_COLOR].concat(slots || []);
        let html = list.map((c, i) => {
            const on = (c === currentColor);
            return `<button type="button" onclick="NBPC.applySwatch('${prefix}','${c}')" title="${i === 0 ? '默认色' : '自选色'} ${c}" style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid ${on ? '#ffd700' : 'rgba(255,255,255,0.55)'};cursor:pointer;padding:0;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></button>`;
        }).join('');
        for (let i = list.length; i < 3; i++) {
            html += `<span title="用右侧调色盘选个颜色，会自动存到这里" style="width:26px;height:26px;border-radius:50%;border:1px dashed rgba(255,255,255,0.3);display:inline-block;"></span>`;
        }
        box.innerHTML = html;
    }

    // 色块被点击：转发给该 prefix 的 onPick
    function applySwatch(prefix, hex) {
        const h = _handlers[prefix];
        if (h && h.onPick) h.onPick(hex);
    }

    // 注入色板/高亮所需样式（幂等，注入一次）
    let _stylesInjected = false;
    function injectStyles() {
        if (_stylesInjected && document.getElementById('nbColorStyles')) return;
        _stylesInjected = true;
        let st = document.getElementById('nbColorStyles');
        if (!st) {
            st = document.createElement('style');
            st.id = 'nbColorStyles';
            document.head.appendChild(st);
        }
        st.textContent = ''
            + '@keyframes nbBreathe{0%,100%{text-shadow:0 0 2px currentColor,0 0 6px currentColor;filter:brightness(1);}'
            + '50%{text-shadow:0 0 4px currentColor,0 0 14px currentColor;filter:brightness(1.4);}}'
            + '.nb-overlay{pointer-events:none;overflow:hidden;color:transparent;background:transparent;}'
            + '.nb-overlay-inner{white-space:pre-wrap;word-break:break-word;margin:0;will-change:transform;}'
            + '.nb-glow{animation:nbBreathe 2.4s ease-in-out infinite;}'
            + '#notepadEditable::selection,[id$="_content"]::selection{background:rgba(255,255,255,0.22);}';
    }

    /* ---------------- 导出 ---------------- */
    window.NBPC = {
        DEFAULT_COLOR: DEFAULT_COLOR,
        // 色彩工具
        toHex: toHex,
        hsvToRgb: hsvToRgb,
        hsvToHex: hsvToHex,
        hexToHsv: hexToHsv,
        // 全局色配置
        cfg: cfg,
        normalizeCfg: normalizeCfg,
        saveCfg: saveCfg,
        applyExternalCfg: applyExternalCfg,
        setGlobalColor: setGlobalColor,
        // 区间标记工具
        Marks: { anchor: anchor, clipInsert: clipInsert, clearRange: clearRange, matches: matches },
        // 色轮控件
        Wheel: { init: init, sync: sync, swatches: swatches, applySwatch: applySwatch, injectStyles: injectStyles }
    };
})();