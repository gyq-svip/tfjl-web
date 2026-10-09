(function () {
    'use strict';

    // ============================================================
    // app-scriptsim.js — 脚本推演模拟器（阵容图库「模拟器」弹窗）
    // 2026-10-09 重写：单波轴（主副独立更新）、完全复刻主页布局/角标、手牌图、装备图、歌词脚本
    // ============================================================

    const SIDE_MY = 'my';
    const SIDE_TEAMMATE = 'teammate';
    const EQUIP_DEF = {
        '强袭': { img4: 'assets/equipment/qiangxi-4.png', img5: 'assets/equipment/qiangxi-5.png', starHero: '幻精灵' },
        '龙心': { img4: 'assets/equipment/longxin-4.png', img5: 'assets/equipment/longxin-5.png', starHero: '幻精灵' },
        '圣剑': { img4: 'assets/equipment/shengjian-4.png', img5: 'assets/equipment/shengjian-5.png', starHero: '幻精灵' },
        '烟斗': { img4: 'assets/equipment/yandou-4.png', img5: 'assets/equipment/yandou-5.png', starHero: '幻精灵' }
    };

    const state = {
        mainScript: null,
        subScript: null,
        timeline: [1],     // 连续整数波号 1..maxWave
        waveIndex: 0,      // timeline 下标
        playing: false,
        speed: 1.0,
        timer: null,
        root: null,
        overrides: { my: {}, teammate: {} } // identity -> { level, mohua, skin }
    };

    let poolMapCache = null;
    function getPoolMap() {
        if (poolMapCache) return poolMapCache;
        poolMapCache = {};
        try {
            if (typeof window.collectPoolCards === 'function') {
                (window.collectPoolCards() || []).forEach(function (c) {
                    if (c && c.value) poolMapCache[c.value] = c._ds || { id: c.value, name: c.value, type: 'gold', profession: '', engineering: 'false' };
                });
            }
        } catch (e) {}
        const fallbacks = [
            { id: '1', name: '雷神', type: 'gold', profession: 'mage', engineering: 'false' },
            { id: '2', name: '电法', type: 'gold', profession: 'mage', engineering: 'false' },
            { id: '3', name: '萌萌', type: 'gold', profession: 'panda', engineering: 'false' },
            { id: '4', name: '火灵', type: 'gold', profession: 'panda', engineering: 'false' },
            { id: '5', name: '水灵', type: 'gold', profession: 'panda', engineering: 'false' },
            { id: '6', name: '风灵', type: 'gold', profession: 'panda', engineering: 'false' },
            { id: '7', name: '土灵', type: 'gold', profession: 'panda', engineering: 'false' },
            { id: '8', name: '蛇女', type: 'gold', profession: 'archer', engineering: 'false' },
            { id: '9', name: '咕咕', type: 'gold', profession: 'priest', engineering: 'false' },
            { id: '10', name: '小野', type: 'gold', profession: 'priest', engineering: 'false' },
            { id: '11', name: '死神', type: 'gold', profession: 'warlock', engineering: 'false' },
            { id: '12', name: '骨弓', type: 'gold', profession: 'archer', engineering: 'false' },
            { id: '13', name: '地精', type: 'gold', profession: 'warrior', engineering: 'false' },
            { id: '14', name: '宝库', type: 'gold', profession: 'engineering', engineering: 'true' },
            { id: '15', name: '射线', type: 'gold', profession: 'engineering', engineering: 'true' },
            { id: '16', name: '咬人娃娃', type: 'gold', profession: 'engineering', engineering: 'true' },
            { id: '17', name: '火炮', type: 'gold', profession: 'engineering', engineering: 'true' },
            { id: '18', name: '魔精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '19', name: '幻精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '20', name: '魂精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '21', name: '冰精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '22', name: '木精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '23', name: '光精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '24', name: '彩精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '25', name: '土精灵', type: 'gold', profession: 'pokeball', engineering: 'false' },
            { id: '26', name: '悟空', type: 'gold', profession: 'warrior', engineering: 'false' },
            { id: '27', name: '炎魔', type: 'gold', profession: 'warrior', engineering: 'false' },
            { id: '28', name: '酋长', type: 'gold', profession: 'warrior', engineering: 'false' },
            { id: '29', name: '胖虎', type: 'gold', profession: 'warrior', engineering: 'false' },
            { id: '30', name: '冰法', type: 'gold', profession: 'mage', engineering: 'false' }
        ];
        fallbacks.forEach(function (c) { if (!poolMapCache[c.name]) poolMapCache[c.name] = c; });
        return poolMapCache;
    }

    function getCardInfo(name) {
        const map = getPoolMap();
        if (map[name]) return Object.assign({}, map[name]);
        const parts = window.getFusionParts ? window.getFusionParts(name) : null;
        if (parts && parts.length >= 2) {
            const main = map[parts[0]];
            if (main) return Object.assign({}, main, { name: name, isFusion: true });
        }
        const mainName = window.getMainCardName ? window.getMainCardName(name) : name;
        if (map[mainName]) return Object.assign({}, map[mainName]);
        return { id: name, name: name, type: 'gold', profession: '', engineering: 'false' };
    }

    function isEngineering(name) {
        const info = getCardInfo(name);
        return info.profession === 'engineering' || info.engineering === 'true';
    }

    function getMaxLevel(cardType) {
        const map = { 'gold': 24, 'purple': 24, 'blue': 25, 'green': 24, 'engineering-card': 24 };
        return map[cardType] || 24;
    }

    // ===== 解析 =====
    function parseScript(text) {
        const lines = text.replace(/\r/g, '').split('\n');
        const script = { header: { lineup: [], skins: {}, mohua: [], mainVehicle: '', subVehicle: '' }, waves: [], rawLines: lines };
        let headerDone = false;
        lines.forEach(function (line) {
            const trim = line.trim();
            if (!trim) { headerDone = true; return; }
            if (!headerDone) {
                if (trim.indexOf('上阵：') === 0) script.header.lineup = splitCsv(trim.replace('上阵：', ''));
                else if (trim.indexOf('皮肤：') === 0) splitCsv(trim.replace('皮肤：', '')).forEach(function (s) {
                    const m = s.match(/^(.+?)(\d+)$/); if (m) script.header.skins[m[1]] = String(parseInt(m[2], 10));
                });
                else if (trim.indexOf('魔化：') === 0) script.header.mohua = splitCsv(trim.replace('魔化：', ''));
                else if (trim.indexOf('主战车：') === 0) script.header.mainVehicle = trim.replace('主战车：', '').trim();
                else if (trim.indexOf('副战车：') === 0) script.header.subVehicle = trim.replace('副战车：', '').trim();
                return;
            }
            const wm = trim.match(/^(\d+)[,，]/);
            if (wm) {
                const wave = parseInt(wm[1], 10);
                const rest = trim.substring(wm[0].length);
                script.waves.push({ wave: wave, raw: trim, actions: parseWaveActions(rest, script.header.lineup) });
            }
        });
        return script;
    }

    function splitCsv(s) { return s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean); }

    function parseWaveActions(raw, lineup) {
        const parts = raw.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
        const actions = [];
        let forceSeq = false;
        parts.forEach(function (part) {
            if (part === '强制顺序上卡') { forceSeq = true; return; }
            if (part === '同排取消') { actions.push({ type: 'sameRowCancel' }); return; }
            const sr = part.match(/^(.+?)[和与、](.+?)同排$/);
            if (sr) { actions.push({ type: 'sameRow', heroes: [sr[1].trim(), sr[2].trim()] }); return; }
            if (part.endsWith('同排')) {
                const pair = parseSameRowPair(part.replace(/同排$/, ''), lineup);
                if (pair) { actions.push({ type: 'sameRow', heroes: pair }); return; }
            }
            const eq = part.match(/^换(强袭|龙心|圣剑|烟斗)$/);
            if (eq) { actions.push({ type: 'equip', name: eq[1] }); return; }
            const down = part.match(/^下(.+)$/);
            if (down && !part.includes('上')) { actions.push({ type: 'remove', hero: cleanHeroName(down[1]) }); return; }
            const up = part.match(/^上(.+?)(满|1级|2级|)$/);
            if (up) { actions.push({ type: 'place', hero: cleanHeroName(up[1]), level: up[2] || '满', forceSeq: forceSeq }); return; }
            actions.push({ type: 'note', text: part });
        });
        return actions;
    }

    function cleanHeroName(s) { return s.replace(/^(?:上|下)/, '').replace(/(?:满|1级|2级)$/, '').trim(); }

    function parseSameRowPair(core, lineup) {
        if (!Array.isArray(lineup) || lineup.length < 2) return null;
        for (let i = 0; i < lineup.length; i++) {
            const a = lineup[i];
            if (core.indexOf(a) !== 0) continue;
            const rest = core.substring(a.length);
            for (let j = 0; j < lineup.length; j++) {
                if (i === j) continue;
                if (rest === lineup[j]) return [a, lineup[j]];
            }
        }
        return null;
    }

    // ===== 时间轴 / 模拟 =====
    function computeMaxWave() {
        let m = 1;
        [state.mainScript, state.subScript].forEach(function (sc) {
            if (sc) sc.waves.forEach(function (w) { if (w.wave > m) m = w.wave; });
        });
        return m;
    }

    function rebuildTimeline() {
        const max = computeMaxWave();
        state.timeline = [];
        for (let w = 1; w <= max; w++) state.timeline.push(w);
        if (state.waveIndex >= state.timeline.length) state.waveIndex = state.timeline.length - 1;
        if (state.waveIndex < 0) state.waveIndex = 0;
    }

    function createSideState() { return { slots: {}, equipment: null, sameRowPairs: [], vehicle: { main: '', sub: '' }, hand: [] }; }

    function removeCard(s, hero) {
        const base = window.getMainCardName ? window.getMainCardName(hero) : hero;
        for (let i = 1; i <= 7; i++) if (s.slots[i] && s.slots[i].base === base) { s.slots[i] = null; return; }
    }

    function placeCard(s, action, script, side) {
        const hero = action.hero;
        const base = window.getMainCardName ? window.getMainCardName(hero) : hero;
        const info = getCardInfo(hero);
        const eng = isEngineering(hero);
        let level = action.level;
        let skin = script.header.skins[base] || '默认';
        let isMohua = script.header.mohua.indexOf(base) >= 0;
        const ov = (state.overrides[side] && state.overrides[side][hero]) || null;
        if (ov) { if (ov.level) level = ov.level; if (ov.skin) skin = ov.skin; if (ov.mohua !== undefined) isMohua = ov.mohua; }
        const card = { hero: hero, base: base, level: level, skin: skin, isMohua: isMohua, isFusion: hero !== base, id: info.id || base, type: info.type || 'gold', profession: info.profession || '' };
        for (let i = 1; i <= 7; i++) if (s.slots[i] && s.slots[i].base === base) {
            s.slots[i].level = level; s.slots[i].hero = hero; s.slots[i].isFusion = hero !== base; s.slots[i].skin = skin; s.slots[i].isMohua = isMohua; return;
        }
        if (eng) { if (!s.slots[7]) { s.slots[7] = card; return; } }
        else { for (let i = 1; i <= 6; i++) if (!s.slots[i]) { s.slots[i] = card; return; } }
    }

    function applyWaveUpToWave(script, W, side) {
        const s = createSideState();
        if (!script) return s;
        s.vehicle.main = script.header.mainVehicle;
        s.vehicle.sub = script.header.subVehicle;
        script.waves.forEach(function (w) {
            if (w.wave > W) return;
            const removals = [], others = [];
            w.actions.forEach(function (a) { (a.type === 'remove' ? removals : others).push(a); });
            removals.forEach(function (a) { removeCard(s, a.hero); });
            others.forEach(function (a) {
                if (a.type === 'place') placeCard(s, a, script, side);
                else if (a.type === 'equip') s.equipment = a.name;
                else if (a.type === 'sameRow') s.sameRowPairs.push(a.heroes.slice());
                else if (a.type === 'sameRowCancel') s.sameRowPairs = [];
            });
        });
        const placed = new Set();
        for (let i = 1; i <= 7; i++) if (s.slots[i]) placed.add(s.slots[i].base);
        s.hand = script.header.lineup.filter(function (n) { return !placed.has(n); });
        return s;
    }

    // ===== UI =====
    function openScriptSimulator() {
        if (state.root) { state.root.style.display = 'flex'; return; }
        state.root = createModal();
        document.body.appendChild(state.root);
        bindStaticEvents();
        bindDynamic();
        rebuildTimeline();
        render();
    }

    function closeSimulator() { pause(); if (state.root) state.root.style.display = 'none'; }

    function createModal() {
        const div = document.createElement('div');
        div.id = 'scriptSimRoot';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:inherit;';
        div.innerHTML =
            '<div id="scriptSimPanel" style="position:relative;width:97vw;height:94vh;background:linear-gradient(180deg,#1a1a2e,#16213e);border:1px solid rgba(78,205,196,0.4);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden;">'
            // 标题栏
            + '<div style="flex:0 0 auto;padding:8px 16px;background:rgba(0,0,0,0.35);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;">'
            + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
            + '<span style="color:#4ecdc4;font-weight:700;font-size:1rem;">🎮 脚本推演模拟器</span>'
            + '<label style="padding:4px 10px;border-radius:6px;border:1px solid rgba(78,205,196,0.4);background:rgba(78,205,196,0.12);color:#4ecdc4;cursor:pointer;font-size:0.75rem;">📂 导入主卡<input type="file" id="simImportMain" accept=".txt" style="display:none;"></label>'
            + '<label style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,107,107,0.4);background:rgba(255,107,107,0.12);color:#ff6b6b;cursor:pointer;font-size:0.75rem;">📂 导入副卡<input type="file" id="simImportSub" accept=".txt" style="display:none;"></label>'
            + '<button id="simRefresh" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.12);color:#ffd700;cursor:pointer;font-size:0.75rem;">🔄 刷新</button>'
            + '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem;">（点卡可设等级/魔化/皮肤，整局保留）</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:10px;">'
            + '<span id="simWaveDisplay" style="color:#ffd700;font-weight:700;font-size:1.1rem;">第 1 波</span>'
            + '<button id="simClose" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">✕ 关闭</button>'
            + '</div>'
            + '</div>'
            // 主体
            + '<div style="flex:1 1 auto;display:flex;overflow:hidden;padding:10px;gap:10px;">'
            // 左：主卡歌词
            + '<div style="flex:0 0 240px;display:flex;flex-direction:column;gap:6px;">'
            + '<div style="color:#4ecdc4;font-size:0.8rem;font-weight:700;">主卡脚本 · 歌词</div>'
            + '<div id="simMainLyric" style="flex:1;background:rgba(0,0,0,0.35);border-radius:8px;border:1px solid rgba(78,205,196,0.15);padding:8px;overflow:auto;font-size:0.72rem;line-height:1.7;color:rgba(255,255,255,0.7);"></div>'
            + '</div>'
            // 中：双卡组
            + '<div style="flex:1 1 auto;display:flex;flex-direction:column;gap:8px;align-items:center;overflow:auto;">'
            + '<div id="simWaveBanner" style="color:#ffd700;font-size:1.4rem;font-weight:700;text-shadow:0 0 8px rgba(255,215,0,0.4);">第 1 波</div>'
            + '<div style="display:flex;gap:24px;align-items:flex-start;justify-content:center;flex-wrap:wrap;">'
            + renderDeckColumn(SIDE_MY, '👤 主卡脚本（我的卡组）', 'simMyDr', 'simMyBattleSlots', 'simMyHandContainer')
            + renderDeckColumn(SIDE_TEAMMATE, '👥 副卡脚本（队友卡组）', 'simTeammateDr', 'simTeammateBattleSlots', 'simTeammateHandContainer')
            + '</div>'
            + '<div id="simEquipmentArea" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,215,0,0.08);display:flex;align-items:center;gap:16px;flex-wrap:wrap;color:#ffd700;font-size:0.85rem;font-weight:700;">装备区</div>'
            + '</div>'
            // 右：副卡歌词
            + '<div style="flex:0 0 240px;display:flex;flex-direction:column;gap:6px;">'
            + '<div style="color:#ff6b6b;font-size:0.8rem;font-weight:700;">副卡脚本 · 歌词</div>'
            + '<div id="simSubLyric" style="flex:1;background:rgba(0,0,0,0.35);border-radius:8px;border:1px solid rgba(255,107,107,0.15);padding:8px;overflow:auto;font-size:0.72rem;line-height:1.7;color:rgba(255,255,255,0.7);"></div>'
            + '</div>'
            + '</div>'
            // 底部控制器
            + '<div style="flex:0 0 auto;padding:10px 16px;background:rgba(0,0,0,0.35);border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;">'
            + '<span id="simSpeedLabel" style="color:rgba(255,255,255,0.7);font-size:0.75rem;">1.0s/波</span>'
            + '<button id="simSlower" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">减速</button>'
            + '<button id="simFaster" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">加速</button>'
            + '<button id="simPrev" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">⏮</button>'
            + '<button id="simPlay" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(78,205,196,0.5);background:rgba(78,205,196,0.18);color:#4ecdc4;cursor:pointer;font-size:0.75rem;font-weight:700;">▶ 自动</button>'
            + '<button id="simNext" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">⏭</button>'
            + '<button id="simSkipEvent" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.12);color:#ffd700;cursor:pointer;font-size:0.75rem;">⏩下一变化</button>'
            + '<input type="range" id="simWaveSlider" min="0" max="0" value="0" style="width:180px;">'
            + '</div>'
            + '</div>';
        return div;
    }

    function renderDeckColumn(side, title, drId, slotContainerId, handId) {
        return '<div class="battle-column" style="display:flex;flex-direction:column;align-items:center;gap:4px;">'
            + '<h4 style="margin:0;color:#fff;font-size:0.85rem;">' + title + ' <span id="' + drId + '" style="color:#4ecdc4;font-size:0.78rem;margin-left:6px;">洗炼:0</span></h4>'
            + '<div class="battle-slots-container" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border-radius:10px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.08);">'
            + '<div class="battle-slot engineering-slot empty" data-slot="sim-' + side + '-0" data-type="engineering" style="margin:0;"><span class="slot-label">🔧</span><span class="slot-empty">空</span></div>'
            + '<div class="battle-slots" id="' + slotContainerId + '" style="display:flex;flex-direction:column;gap:6px;">'
            + '<div class="battle-slots" style="display:flex;gap:6px;"><div class="battle-slot empty" data-slot="sim-' + side + '-1">空</div><div class="battle-slot empty" data-slot="sim-' + side + '-2">空</div></div>'
            + '<div class="battle-slots" style="display:flex;gap:6px;"><div class="battle-slot empty" data-slot="sim-' + side + '-3">空</div><div class="battle-slot empty" data-slot="sim-' + side + '-4">空</div></div>'
            + '<div class="battle-slots" style="display:flex;gap:6px;"><div class="battle-slot empty" data-slot="sim-' + side + '-5">空</div><div class="battle-slot empty" data-slot="sim-' + side + '-6">空</div></div>'
            + '</div></div>'
            + '<div style="width:100%;color:rgba(255,255,255,0.6);font-size:0.68rem;text-align:center;margin-top:2px;">我的手牌</div>'
            + '<div class="hand-container" id="' + handId + '" style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;min-height:30px;max-width:230px;"></div>'
            + '</div>';
    }

    function bindStaticEvents() {
        const r = state.root;
        if (!r) return;
        r.addEventListener('click', function (e) {
            const t = e.target;
            if (t === r || t.id === 'simClose') { closeSimulator(); return; }
            switch (t.id) {
                case 'simPrev': changeWave(-1); return;
                case 'simNext': changeWave(1); return;
                case 'simSkipEvent': skipToNextEvent(); return;
                case 'simPlay': togglePlay(); return;
                case 'simSlower': adjustSpeed(-0.5); return;
                case 'simFaster': adjustSpeed(0.5); return;
                case 'simRefresh': render(); return;
            }
        });
        r.addEventListener('wheel', function (e) {
            const panel = e.target.closest('#simMainLyric, #simSubLyric');
            if (panel) return;
            e.preventDefault();
            changeWave(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });
    }

    function bindDynamic() {
        const r = state.root;
        const slider = r.querySelector('#simWaveSlider');
        if (slider) slider.addEventListener('input', function () { state.waveIndex = parseInt(this.value, 10); render(); });
        const mainIn = r.querySelector('#simImportMain');
        const subIn = r.querySelector('#simImportSub');
        if (mainIn) mainIn.addEventListener('change', function (e) { importScript(e.target, 'main'); });
        if (subIn) subIn.addEventListener('change', function (e) { importScript(e.target, 'sub'); });
        // 槽位点击 = 主页同款设置弹窗
        r.querySelectorAll('.battle-slot').forEach(function (slot) {
            slot.addEventListener('click', function (ev) {
                if (!slot.classList.contains('filled')) return;
                openSlotSettings(slot, ev);
            });
        });
    }

    function importScript(input, which) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const sc = parseScript(e.target.result);
            if (which === 'main') state.mainScript = sc; else state.subScript = sc;
            rebuildTimeline();
            state.waveIndex = 0;
            pause();
            render();
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('模拟器-导入' + (which === 'main' ? '主卡' : '副卡') + '脚本');
        };
        reader.readAsText(file, 'utf-8');
        input.value = '';
    }

    function openSlotSettings(slot, ev) {
        const cardId = slot.dataset.cardId;
        const cardName = slot.dataset.name;
        const handType = slot.dataset.handType || SIDE_MY;
        if (!cardId || !cardName) return;
        const info = getCardInfo(cardName);
        const identity = cardName;
        if (typeof window.showLevelDropdown === 'function') {
            try { window.showLevelDropdown(ev, cardId, info.type || 'gold', handType, cardName); } catch (e) {}
        }
        watchPopupClose(handType, identity, cardId, info.type || 'gold', handType);
    }

    // 弹窗关闭后，把手动改的等级/魔化/皮肤写回 override，使其跨波保留
    function watchPopupClose(side, identity, cardId, type, handType) {
        const iv = setInterval(function () {
            if (!document.querySelector('.card-settings-popup-root')) {
                clearInterval(iv);
                try {
                    const ov = state.overrides[side][identity] || {};
                    if (window.getCardLevel) { const lv = window.getCardLevel(cardId, type, handType); if (lv) ov.level = levelToScript(lv, type); }
                    if (window.getCardMoHua) ov.mohua = !!window.getCardMoHua(cardId, handType);
                    if (window.getCardSkin) { const sk = window.getCardSkin(cardId, identity, handType); if (sk) ov.skin = sk; }
                    state.overrides[side][identity] = ov;
                } catch (e) {}
                render();
            }
        }, 250);
    }

    function levelToScript(lv, type) {
        const max = getMaxLevel(type);
        if (lv === max) return '满';
        return lv + '级';
    }

    function togglePlay() {
        if (state.playing) { pause(); return; }
        if (state.timeline.length <= 1) return;
        state.playing = true;
        const btn = state.root.querySelector('#simPlay');
        if (btn) { btn.textContent = '⏸ 暂停'; btn.style.color = '#ff5252'; btn.style.borderColor = 'rgba(255,82,82,0.5)'; btn.style.background = 'rgba(255,82,82,0.15)'; }
        state.timer = setInterval(function () {
            if (state.waveIndex >= state.timeline.length - 1) { pause(); return; }
            changeWave(1);
        }, Math.max(250, state.speed * 1000));
    }

    function pause() {
        state.playing = false;
        if (state.timer) { clearInterval(state.timer); state.timer = null; }
        const btn = state.root && state.root.querySelector('#simPlay');
        if (btn) { btn.textContent = '▶ 自动'; btn.style.color = '#4ecdc4'; btn.style.borderColor = 'rgba(78,205,196,0.5)'; btn.style.background = 'rgba(78,205,196,0.18)'; }
    }

    function adjustSpeed(delta) {
        state.speed = Math.max(0.5, Math.min(5.0, state.speed + delta));
        const label = state.root.querySelector('#simSpeedLabel');
        if (label) label.textContent = state.speed.toFixed(1) + 's/波';
        if (state.playing) { pause(); togglePlay(); }
    }

    function changeWave(delta) {
        if (state.timeline.length <= 1) return;
        let next = state.waveIndex + delta;
        next = Math.max(0, Math.min(state.timeline.length - 1, next));
        if (next === state.waveIndex) return;
        state.waveIndex = next;
        const slider = state.root.querySelector('#simWaveSlider');
        if (slider) slider.value = next;
        render();
    }

    function skipToNextEvent() {
        const max = state.timeline.length - 1;
        for (let i = state.waveIndex + 1; i <= max; i++) {
            const W = state.timeline[i];
            const hasMain = state.mainScript && state.mainScript.waves.some(function (w) { return w.wave === W; });
            const hasSub = state.subScript && state.subScript.waves.some(function (w) { return w.wave === W; });
            if (hasMain || hasSub) { state.waveIndex = i; break; }
        }
        const slider = state.root.querySelector('#simWaveSlider');
        if (slider) slider.value = state.waveIndex;
        render();
    }

    // ===== 渲染 =====
    function render() {
        if (!state.root) return;
        const W = state.timeline[state.waveIndex] || 1;
        const banner = state.root.querySelector('#simWaveBanner');
        const waveDisplay = state.root.querySelector('#simWaveDisplay');
        if (banner) banner.textContent = '第 ' + W + ' 波';
        if (waveDisplay) waveDisplay.textContent = '第 ' + W + ' 波 · ' + (state.waveIndex + 1) + '/' + state.timeline.length;

        const slider = state.root.querySelector('#simWaveSlider');
        if (slider) { slider.max = state.timeline.length - 1; slider.value = state.waveIndex; }

        const myState = applyWaveUpToWave(state.mainScript, W, SIDE_MY);
        const tmState = applyWaveUpToWave(state.subScript, W, SIDE_TEAMMATE);
        _sideStateRefs.my = myState;
        _sideStateRefs.teammate = tmState;
        renderSide(SIDE_MY, myState);
        renderSide(SIDE_TEAMMATE, tmState);
        renderEquipment(myState, tmState);
        renderLyric(state.root.querySelector('#simMainLyric'), state.mainScript, W, 'main');
        renderLyric(state.root.querySelector('#simSubLyric'), state.subScript, W, 'sub');
    }

    function renderSide(side, sideState) {
        for (let i = 0; i <= 7; i++) {
            const slot = state.root.querySelector('[data-slot="sim-' + side + '-' + i + '"]');
            if (!slot) continue;
            clearSlot(slot);
            const card = sideState.slots[i];
            if (card) fillSlot(slot, card, side);
        }
        const handContainer = state.root.querySelector('#sim-' + side + 'HandContainer');
        if (handContainer) renderHand(handContainer, sideState.hand, side);
    }

    function clearSlot(slot) {
        slot.className = 'battle-slot' + (slot.dataset.type === 'engineering' ? ' engineering-slot' : '') + ' empty';
        slot.innerHTML = slot.dataset.type === 'engineering' ? '<span class="slot-label">🔧</span><span class="slot-empty">空</span>' : '空';
        slot.removeAttribute('data-card-id');
        slot.removeAttribute('data-name');
        slot.removeAttribute('data-hand-type');
        slot.style.border = '';
        slot.style.boxShadow = '';
    }

    function simBadgeHTML(card, side) {
        const lv = card.level === '满' ? getMaxLevel(card.type) : (parseInt(card.level, 10) || 1);
        const levelBadge = '<span class="card-level-badge card-level-number card-level-q-' + (card.type || 'gold') + '" data-card-id="' + card.id + '" data-card-type="' + card.type + '" data-hand-type="' + side + '" data-card-name="' + esc(card.hero) + '" data-skin="' + esc(card.skin) + '">' + lv + '</span>';
        const mohuaIcon = card.isMohua ? '<img class="card-level-badge card-mohua-icon" data-card-id="' + card.id + '" data-card-type="' + card.type + '" data-hand-type="' + side + '" data-card-name="' + esc(card.hero) + '" src="skins/icons/mohua-icon.png" alt="" title="已魔化">' : '';
        return levelBadge + mohuaIcon;
    }

    function fillSlot(slot, card, side) {
        slot.className = 'battle-slot' + (slot.dataset.type === 'engineering' ? ' engineering-slot' : '') + ' filled';
        slot.dataset.cardId = card.id;
        slot.dataset.name = card.hero;
        slot.dataset.handType = side;
        if (card.isFusion) slot.setAttribute('data-fusion', 'true'); else slot.removeAttribute('data-fusion');
        const display = window.getFusionDisplayName ? window.getFusionDisplayName(card.hero) : card.hero;
        slot.innerHTML = '<span class="card-item" data-profession="' + (card.profession || '') + '">'
            + simBadgeHTML(card, side)
            + '<span class="card-name" data-full-name="' + esc(card.hero) + '">' + esc(display) + '</span></span>';
        markSameRow(slot, card, side);
        if (typeof window.applySkinBgToSlot === 'function') {
            try { window.applySkinBgToSlot(slot, card.hero, card.id, side, card.skin, card.skin); } catch (e) {}
        }
    }

    function markSameRow(slot, card, side) {
        let row = -1;
        const pairs = (currentSideStateRef(side) && currentSideStateRef(side).sameRowPairs) || [];
        pairs.forEach(function (pair, idx) {
            if (pair.indexOf(card.base) >= 0 || pair.indexOf(card.hero) >= 0) row = idx;
        });
        if (row >= 0) {
            const colors = ['#ff6b6b', '#4ecdc4', '#ffd700', '#a78bfa'];
            slot.style.border = '2px solid ' + colors[row % colors.length];
            slot.style.boxShadow = 'inset 0 0 10px ' + colors[row % colors.length];
        }
    }

    // 当前 side 的最新渲染状态（供 markSameRow 用，render 时暂存）
    let _sideStateRefs = { my: null, teammate: null };
    function currentSideStateRef(side) { return _sideStateRefs[side]; }

    function renderHand(container, handList, side) {
        container.innerHTML = '';
        handList.forEach(function (name) {
            const info = getCardInfo(name);
            const ov = (state.overrides[side] && state.overrides[side][name]) || null;
            const skin = (ov && ov.skin) || (state.mainScript && state.mainScript.header.skins[name]) || '默认';
            const isMohua = ov ? ov.mohua : (state.mainScript && state.mainScript.header.mohua.indexOf(name) >= 0);
            const card = { hero: name, id: info.id || name, type: info.type || 'gold', profession: info.profession || '', skin: skin, isMohua: isMohua };
            const display = window.getFusionDisplayName ? window.getFusionDisplayName(name) : name;
            const div = document.createElement('div');
            div.className = 'selected-card card-item';
            div.dataset.id = card.id; div.dataset.name = name; div.dataset.type = card.type; div.dataset.profession = card.profession; div.dataset.handType = side;
            div.innerHTML = simBadgeHTML(card, side) + '<span class="card-name">' + esc(display) + '</span>';
            container.appendChild(div);
            if (typeof window.resolveHeroSkinUrl === 'function') {
                window.resolveHeroSkinUrl(name, skin).then(function (url) {
                    if (url) { div.classList.add('skin-bg'); div.style.backgroundImage = 'url("' + url + '")'; div.style.backgroundSize = 'contain'; div.style.backgroundPosition = 'center'; div.style.backgroundRepeat = 'no-repeat'; }
                }).catch(function () {});
            }
        });
    }

    function renderEquipment(mainState, subState) {
        const area = state.root.querySelector('#simEquipmentArea');
        if (!area) return;
        const parts = [];
        if (mainState.equipment) parts.push('<span style="color:#4ecdc4;">主卡:' + equipImg(mainState.equipment, state.mainScript) + '</span>');
        if (subState.equipment) parts.push('<span style="color:#ff6b6b;">副卡:' + equipImg(subState.equipment, state.subScript) + '</span>');
        const myDr = calcSideDr(mainState);
        const tmDr = calcSideDr(subState);
        const total = (parseFloat(myDr) || 0) + (parseFloat(tmDr) || 0);
        const drHtml = '<span style="color:#4ecdc4;">14卡总减伤: ' + total.toFixed(1) + '</span>';
        if (!parts.length) { area.innerHTML = drHtml + ' · 装备区 · 暂无换装备'; return; }
        area.innerHTML = drHtml + '　当前装备：' + parts.join('　');
    }

    function equipImg(name, script) {
        const def = EQUIP_DEF[name];
        if (!def) return esc(name);
        const skinHero = def.starHero;
        const hasSkin = script && script.header.skins[skinHero] && script.header.skins[skinHero] !== '默认';
        const star = hasSkin ? 5 : 4;
        const img = hasSkin ? def.img5 : def.img4;
        return '<img src="' + img + '" alt="' + esc(name) + '" title="' + esc(name) + ' ' + star + '星" style="height:30px;vertical-align:middle;border-radius:4px;box-shadow:0 0 6px rgba(0,0,0,0.5);">';
    }

    function renderLyric(panel, script, W, side) {
        if (!panel) return;
        if (!script) { panel.innerHTML = '<span style="color:rgba(255,255,255,0.4);">未导入脚本</span>'; return; }
        let html = '';
        let currentElId = '';
        script.waves.forEach(function (w, idx) {
            const isCurrent = (w.wave <= W) && (idx === script.waves.length - 1 || script.waves[idx + 1].wave > W);
            const cls = isCurrent ? 'sim-lyric-line sim-lyric-current' : 'sim-lyric-line';
            const id = 'simLyric_' + side + '_' + idx;
            if (isCurrent) currentElId = id;
            html += '<div id="' + id + '" class="' + cls + '" style="padding:2px 6px;border-radius:5px;margin:2px 0;'
                + (isCurrent ? 'background:rgba(78,205,196,0.18);color:#4ecdc4;font-weight:700;' : 'color:rgba(255,255,255,0.65);')
                + '">波' + w.wave + '：' + esc(w.raw.length > 80 ? w.raw.substring(w.raw.indexOf(',') + 1) : w.raw) + '</div>';
        });
        if (!script.waves.length) html = '<span style="color:rgba(255,255,255,0.4);">暂无波束</span>';
        panel.innerHTML = html;
        if (currentElId) {
            const el = panel.querySelector('#' + currentElId);
            if (el) panel.scrollTop = el.offsetTop - panel.clientHeight / 2 + el.clientHeight / 2;
        }
    }

    function renderDamageReduction(myState, tmState) {
        _sideStateRefs.my = myState;
        _sideStateRefs.teammate = tmState;
        const myEl = state.root.querySelector('#simMyDr');
        const tmEl = state.root.querySelector('#simTeammateDr');
        if (myEl) myEl.textContent = '洗炼:' + calcSideDr(myState);
        if (tmEl) tmEl.textContent = '洗炼:' + calcSideDr(tmState);
    }

    function calcSideDr(sideState) {
        const cards = [];
        for (let i = 1; i <= 7; i++) {
            const c = sideState.slots[i];
            if (c) cards.push({ name: c.hero, id: c.id, type: c.type, profession: c.profession });
        }
        if (!cards.length) return '0';
        try {
            if (typeof window.getDamageReductionBreakdown === 'function') {
                const bd = window.getDamageReductionBreakdown(cards, 'my');
                return bd && typeof bd.total === 'number' ? bd.total.toFixed(1) : '0';
            }
        } catch (e) {}
        let sum = 0;
        const table = (window.drTables && window.drTables['我的'] && window.drTables['我的']['洗炼']) || {};
        cards.forEach(function (c) {
            const base = window.getMainCardName ? window.getMainCardName(c.name) : c.name;
            if (table[base]) sum += Number(table[base]) || 0;
        });
        return sum.toFixed(1);
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    window.openScriptSimulator = openScriptSimulator;
})();
