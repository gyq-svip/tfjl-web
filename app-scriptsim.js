(function () {
    'use strict';

    // ============================================================
    // app-scriptsim.js — 脚本推演模拟器（阵容图库「模拟器」弹窗）
    // 2026-10-09
    // ============================================================

    // ===== 常量 =====
    const SIDE_MY = 'my';
    const SIDE_TEAMMATE = 'teammate';
    const SLOT_COUNT = 7; // 6 英雄槽 + 1 工程槽
    const EQUIPMENT_LIST = {
        '强袭': { color: '#ff6b6b', starSkinHero: '幻精灵' },
        '龙心': { color: '#4ecdc4', starSkinHero: '幻精灵' },
        '圣剑': { color: '#ffd700', starSkinHero: '幻精灵' },
        '烟斗': { color: '#a78bfa', starSkinHero: '幻精灵' }
    };

    // ===== 状态 =====
    const state = {
        mainScript: null,
        subScript: null,
        waveIndex: 0,
        playing: false,
        speed: 1.0,          // 秒/波
        timer: null,
        root: null
    };

    // ===== 卡池缓存 =====
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
        } catch (e) { console.warn('[模拟器] 卡池扫描失败', e); }
        // 兜底：常见卡，避免卡池未渲染时查不到职业
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
        fallbacks.forEach(function (c) {
            if (!poolMapCache[c.name]) poolMapCache[c.name] = c;
        });
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
        const map = {
            'gold': 24, 'purple': 24, 'blue': 25, 'green': 24, 'engineering-card': 24
        };
        return map[cardType] || 24;
    }

    // ===== 脚本解析 =====
    function parseScript(text) {
        const lines = text.replace(/\r/g, '').split('\n');
        const script = {
            header: { lineup: [], skins: {}, mohua: [], mainVehicle: '', subVehicle: '' },
            waves: [],
            rawLines: lines
        };
        let headerDone = false;
        lines.forEach(function (line) {
            const trim = line.trim();
            if (!trim) { headerDone = true; return; }
            if (!headerDone) {
                if (trim.indexOf('上阵：') === 0) {
                    script.header.lineup = splitCsv(trim.replace('上阵：', ''));
                } else if (trim.indexOf('皮肤：') === 0) {
                    splitCsv(trim.replace('皮肤：', '')).forEach(function (s) {
                        const m = s.match(/^(.+?)(\d+)$/);
                        if (m) script.header.skins[m[1]] = String(parseInt(m[2], 10));
                    });
                } else if (trim.indexOf('魔化：') === 0) {
                    script.header.mohua = splitCsv(trim.replace('魔化：', ''));
                } else if (trim.indexOf('主战车：') === 0) {
                    script.header.mainVehicle = trim.replace('主战车：', '').trim();
                } else if (trim.indexOf('副战车：') === 0) {
                    script.header.subVehicle = trim.replace('副战车：', '').trim();
                }
                return;
            }
            const waveMatch = trim.match(/^(\d+)[,，]/);
            if (waveMatch) {
                const wave = parseInt(waveMatch[1], 10);
                const rest = trim.substring(waveMatch[0].length);
                script.waves.push({ wave: wave, raw: trim, actions: parseWaveActions(rest, script.header.lineup) });
            }
        });
        return script;
    }

    function splitCsv(s) {
        return s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }

    function parseWaveActions(raw, lineup) {
        const parts = raw.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
        const actions = [];
        let forceSeq = false;
        parts.forEach(function (part) {
            if (part === '强制顺序上卡') { forceSeq = true; return; }
            if (part === '同排取消') { actions.push({ type: 'sameRowCancel' }); return; }
            // 同排：支持「火灵蛇女同排」「蛇女火灵同排」无分隔写法，也支持「火灵与蛇女同排」
            const sr = part.match(/^(.+?)[和与、](.+?)同排$/);
            if (sr) { actions.push({ type: 'sameRow', heroes: [sr[1].trim(), sr[2].trim()] }); return; }
            if (part.endsWith('同排')) {
                const core = part.replace(/同排$/, '');
                const pair = parseSameRowPair(core, lineup);
                if (pair) { actions.push({ type: 'sameRow', heroes: pair }); return; }
            }
            const eq = part.match(/^换(强袭|龙心|圣剑|烟斗)$/);
            if (eq) { actions.push({ type: 'equip', name: eq[1] }); return; }
            const down = part.match(/^下(.+)$/);
            if (down && !part.includes('上')) {
                actions.push({ type: 'remove', hero: cleanHeroName(down[1]) });
                return;
            }
            const up = part.match(/^上(.+?)(满|1级|2级|)$/);
            if (up) {
                actions.push({ type: 'place', hero: cleanHeroName(up[1]), level: up[2] || '满', forceSeq: forceSeq });
                return;
            }
            actions.push({ type: 'note', text: part });
        });
        return actions;
    }

    function cleanHeroName(s) {
        return s.replace(/^(?:上|下)/, '').replace(/(?:满|1级|2级)$/, '').trim();
    }

    // 解析无分隔符同排：如「火灵蛇女同排」→ 从上阵列表里找出连续拼接的2个英雄
    function parseSameRowPair(core, lineup) {
        if (!Array.isArray(lineup) || lineup.length < 2) return null;
        for (let i = 0; i < lineup.length; i++) {
            const a = lineup[i];
            if (core.indexOf(a) !== 0) continue;
            const rest = core.substring(a.length);
            for (let j = 0; j < lineup.length; j++) {
                if (i === j) continue;
                const b = lineup[j];
                if (rest === b) return [a, b];
            }
        }
        return null;
    }

    // ===== 模拟状态 =====
    function createSideState() {
        return {
            slots: {},
            equipment: null,
            sameRowPairs: [],
            vehicle: { main: '', sub: '' },
            hand: []
        };
    }

    function cloneSideState(src) {
        const out = createSideState();
        out.equipment = src.equipment;
        out.sameRowPairs = src.sameRowPairs.slice();
        out.vehicle = Object.assign({}, src.vehicle);
        for (let i = 1; i <= SLOT_COUNT; i++) out.slots[i] = src.slots[i] ? Object.assign({}, src.slots[i]) : null;
        out.hand = src.hand.slice();
        return out;
    }

    function applyWave(sideState, script, waveIdx) {
        // 从初始状态重放到当前波
        const s = createSideState();
        s.vehicle.main = script.header.mainVehicle;
        s.vehicle.sub = script.header.subVehicle;
        for (let i = 0; i <= waveIdx; i++) {
            const w = script.waves[i];
            if (!w) continue;
            const removals = [];
            const others = [];
            w.actions.forEach(function (a) { (a.type === 'remove' ? removals : others).push(a); });
            removals.forEach(function (a) { removeCard(s, a.hero); });
            others.forEach(function (a) {
                if (a.type === 'place') placeCard(s, a, script);
                else if (a.type === 'equip') s.equipment = a.name;
                else if (a.type === 'sameRow') s.sameRowPairs.push(a.heroes.slice());
                else if (a.type === 'sameRowCancel') s.sameRowPairs = [];
            });
        }
        const placed = new Set();
        for (let i = 1; i <= SLOT_COUNT; i++) if (s.slots[i]) placed.add(s.slots[i].base);
        s.hand = script.header.lineup.filter(function (n) { return !placed.has(n); });
        return s;
    }

    function removeCard(s, hero) {
        const base = window.getMainCardName ? window.getMainCardName(hero) : hero;
        for (let i = 1; i <= SLOT_COUNT; i++) {
            if (s.slots[i] && s.slots[i].base === base) { s.slots[i] = null; return; }
        }
    }

    function placeCard(s, action, script) {
        const hero = action.hero;
        const base = window.getMainCardName ? window.getMainCardName(hero) : hero;
        const info = getCardInfo(hero);
        const eng = isEngineering(hero);
        const level = action.level;
        const skin = script.header.skins[base] || '默认';
        const isMohua = script.header.mohua.indexOf(base) >= 0;
        const card = {
            hero: hero,
            base: base,
            level: level,
            skin: skin,
            isMohua: isMohua,
            isFusion: hero !== base,
            id: info.id || base,
            type: info.type || 'gold',
            profession: info.profession || ''
        };
        // 已存在则更新等级/形态
        for (let i = 1; i <= SLOT_COUNT; i++) {
            if (s.slots[i] && s.slots[i].base === base) {
                s.slots[i].level = level;
                s.slots[i].hero = hero;
                s.slots[i].isFusion = hero !== base;
                return;
            }
        }
        if (eng) {
            if (!s.slots[7]) { s.slots[7] = card; return; }
        } else {
            for (let i = 1; i <= 6; i++) {
                if (!s.slots[i]) { s.slots[i] = card; return; }
            }
        }
    }

    // ===== UI =====
    function openScriptSimulator() {
        if (state.root) { state.root.style.display = 'flex'; return; }
        state.root = createModal();
        document.body.appendChild(state.root);
        bindEvents();
        render();
    }

    function closeSimulator() {
        pause();
        if (state.root) { state.root.style.display = 'none'; }
    }

    function createModal() {
        const div = document.createElement('div');
        div.id = 'scriptSimRoot';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.82);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:inherit;';
        div.innerHTML =
            '<div id="scriptSimPanel" style="position:relative;width:96vw;height:92vh;background:linear-gradient(180deg,#1a1a2e,#16213e);border:1px solid rgba(78,205,196,0.4);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden;">'
            // 标题栏
            + '<div style="flex:0 0 auto;padding:10px 16px;background:rgba(0,0,0,0.35);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;">'
            + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
            + '<span style="color:#4ecdc4;font-weight:700;font-size:1rem;">🎮 脚本推演模拟器</span>'
            + '<label style="padding:4px 10px;border-radius:6px;border:1px solid rgba(78,205,196,0.4);background:rgba(78,205,196,0.12);color:#4ecdc4;cursor:pointer;font-size:0.75rem;">📂 导入主卡<input type="file" id="simImportMain" accept=".txt" style="display:none;"></label>'
            + '<label style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,107,107,0.4);background:rgba(255,107,107,0.12);color:#ff6b6b;cursor:pointer;font-size:0.75rem;">📂 导入副卡<input type="file" id="simImportSub" accept=".txt" style="display:none;"></label>'
            + '<button id="simRefresh" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.12);color:#ffd700;cursor:pointer;font-size:0.75rem;">🔄 刷新</button>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:10px;">'
            + '<span id="simWaveDisplay" style="color:#fff;font-weight:700;font-size:1.1rem;">波数 —</span>'
            + '<button id="simClose" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">✕ 关闭</button>'
            + '</div>'
            + '</div>'
            // 主体
            + '<div style="flex:1 1 auto;display:flex;overflow:hidden;padding:10px;gap:10px;">'
            // 左侧：主卡脚本内容
            + '<div style="flex:0 0 210px;display:flex;flex-direction:column;gap:6px;">'
            + '<div style="color:#4ecdc4;font-size:0.8rem;font-weight:700;">当前波束 · 主卡脚本</div>'
            + '<div id="simMainScriptPanel" style="flex:1;background:rgba(0,0,0,0.35);border-radius:8px;border:1px solid rgba(78,205,196,0.15);padding:8px;overflow:auto;font-size:0.72rem;line-height:1.5;color:rgba(255,255,255,0.85);white-space:pre-wrap;word-break:break-word;"></div>'
            + '</div>'
            // 中间：双卡组 + 波数/装备
            + '<div style="flex:1 1 auto;display:flex;flex-direction:column;gap:10px;align-items:center;">'
            + '<div id="simWaveBanner" style="color:#ffd700;font-size:1.3rem;font-weight:700;text-shadow:0 0 8px rgba(255,215,0,0.4);">—</div>'
            + '<div style="flex:1 1 auto;display:flex;gap:20px;align-items:center;justify-content:center;width:100%;">'
            + renderDeckHTML(SIDE_MY, '👤 主卡脚本（我的卡组）')
            + renderDeckHTML(SIDE_TEAMMATE, '👥 副卡脚本（队友卡组）')
            + '</div>'
            + '<div id="simEquipmentArea" style="padding:8px 16px;border-radius:10px;border:1px solid rgba(255,215,0,0.3);background:rgba(255,215,0,0.08);display:flex;align-items:center;gap:16px;color:#ffd700;font-size:0.85rem;font-weight:700;">装备区</div>'
            + '</div>'
            // 右侧：副卡脚本内容
            + '<div style="flex:0 0 210px;display:flex;flex-direction:column;gap:6px;">'
            + '<div style="color:#ff6b6b;font-size:0.8rem;font-weight:700;">当前波束 · 副卡脚本</div>'
            + '<div id="simSubScriptPanel" style="flex:1;background:rgba(0,0,0,0.35);border-radius:8px;border:1px solid rgba(255,107,107,0.15);padding:8px;overflow:auto;font-size:0.72rem;line-height:1.5;color:rgba(255,255,255,0.85);white-space:pre-wrap;word-break:break-word;"></div>'
            + '</div>'
            + '</div>'
            // 底部控制器
            + '<div style="flex:0 0 auto;padding:10px 16px;background:rgba(0,0,0,0.35);border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;">'
            + '<span id="simSpeedLabel" style="color:rgba(255,255,255,0.7);font-size:0.75rem;">1.0s/波</span>'
            + '<button id="simSlower" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">减速 -0.5s</button>'
            + '<button id="simFaster" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">加速 +0.5s</button>'
            + '<button id="simPrev" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">⏮ 上一波</button>'
            + '<button id="simPlay" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(78,205,196,0.5);background:rgba(78,205,196,0.18);color:#4ecdc4;cursor:pointer;font-size:0.75rem;font-weight:700;">▶ 自动</button>'
            + '<button id="simNext" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.75rem;">下一波 ⏭</button>'
            + '<input type="range" id="simWaveSlider" min="0" max="0" value="0" style="width:160px;">'
            + '</div>'
            + '</div>';
        return div;
    }

    function renderDeckHTML(side, title) {
        let slotsHtml = '';
        // 工程槽在顶部（slot 7）
        slotsHtml += '<div class="battle-slot engineering-slot empty" data-slot="sim-' + side + '-7" data-hand-type="' + side + '" data-type="engineering" style="width:72px;height:72px;position:relative;"><span class="slot-label">🔧</span><span class="slot-empty">空</span></div>';
        // 3 行，每行 2 槽：1-2 底行，3-4 中行，5-6 顶行
        const rows = [[1, 2], [3, 4], [5, 6]];
        rows.forEach(function (pair) {
            slotsHtml += '<div style="display:flex;gap:8px;">';
            pair.forEach(function (n) {
                slotsHtml += '<div class="battle-slot empty" data-slot="sim-' + side + '-' + n + '" data-hand-type="' + side + '" style="width:72px;height:72px;position:relative;"><span class="slot-empty">空</span></div>';
            });
            slotsHtml += '</div>';
        });
        const drId = side === SIDE_MY ? 'simMyDr' : 'simTeammateDr';
        return '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">'
            + '<div style="color:#fff;font-size:0.82rem;font-weight:700;">' + title + '</div>'
            + '<div style="color:#4ecdc4;font-size:0.72rem;">总减伤:<span id="' + drId + '">0</span></div>'
            + '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px;border-radius:10px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);">'
            + slotsHtml
            + '</div>'
            + '<div style="width:100%;color:rgba(255,255,255,0.6);font-size:0.7rem;text-align:center;">我的手牌</div>'
            + '<div id="sim-hand-' + side + '" style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;min-height:28px;"></div>'
            + '</div>';
    }

    function bindEvents() {
        const r = state.root;
        if (!r) return;
        r.addEventListener('click', function (e) {
            if (e.target === r || e.target.id === 'simClose') { closeSimulator(); return; }
            if (e.target.id === 'simPrev') { changeWave(-1); return; }
            if (e.target.id === 'simNext') { changeWave(1); return; }
            if (e.target.id === 'simPlay') { togglePlay(); return; }
            if (e.target.id === 'simSlower') { adjustSpeed(-0.5); return; }
            if (e.target.id === 'simFaster') { adjustSpeed(0.5); return; }
            if (e.target.id === 'simRefresh') { render(); return; }
        });
        r.addEventListener('wheel', function (e) {
            // 左右脚本面板内滚动不切换波束
            const panel = e.target.closest('#simMainScriptPanel, #simSubScriptPanel');
            if (panel) return;
            e.preventDefault();
            changeWave(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });
        const slider = r.querySelector('#simWaveSlider');
        if (slider) {
            slider.addEventListener('input', function () {
                state.waveIndex = parseInt(this.value, 10);
                render();
            });
        }
        // 导入
        const mainIn = r.querySelector('#simImportMain');
        const subIn = r.querySelector('#simImportSub');
        if (mainIn) mainIn.addEventListener('change', function (e) { importScript(e.target, 'main'); });
        if (subIn) subIn.addEventListener('change', function (e) { importScript(e.target, 'sub'); });
        // 槽位点击：打开主页同款设置弹窗
        r.querySelectorAll('.battle-slot').forEach(function (slot) {
            slot.addEventListener('click', function (ev) {
                if (!slot.classList.contains('filled')) return;
                const cardId = slot.dataset.cardId;
                const cardName = slot.dataset.name;
                const handType = slot.dataset.handType;
                if (!cardId || !cardName) return;
                const info = getCardInfo(cardName);
                if (typeof window.showLevelDropdown === 'function') {
                    try { window.showLevelDropdown(ev, cardId, info.type || 'gold', handType, cardName); } catch (e) {}
                }
            });
            slot.addEventListener('contextmenu', function (ev) {
                ev.preventDefault();
                if (!slot.classList.contains('filled')) return;
                const cardId = slot.dataset.cardId;
                const cardName = slot.dataset.name;
                const handType = slot.dataset.handType;
                if (!cardId || !cardName) return;
                const info = getCardInfo(cardName);
                if (typeof window.showLevelDropdown === 'function') {
                    try { window.showLevelDropdown(ev, cardId, info.type || 'gold', handType, cardName); } catch (e) {}
                }
            });
        });
    }

    function importScript(input, which) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const text = e.target.result;
            const script = parseScript(text);
            if (which === 'main') state.mainScript = script; else state.subScript = script;
            state.waveIndex = 0;
            pause();
            render();
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('模拟器-导入' + (which === 'main' ? '主卡' : '副卡') + '脚本');
        };
        reader.readAsText(file, 'utf-8');
        input.value = '';
    }

    function togglePlay() {
        if (state.playing) { pause(); return; }
        if (!maxWaveIndex()) return;
        state.playing = true;
        const btn = state.root.querySelector('#simPlay');
        if (btn) { btn.textContent = '⏸ 暂停'; btn.style.color = '#ff5252'; btn.style.borderColor = 'rgba(255,82,82,0.5)'; btn.style.background = 'rgba(255,82,82,0.15)'; }
        state.timer = setInterval(function () {
            if (state.waveIndex >= maxWaveIndex()) { pause(); return; }
            changeWave(1);
        }, Math.max(200, state.speed * 1000));
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

    function maxWaveIndex() {
        const m = state.mainScript ? state.mainScript.waves.length - 1 : -1;
        const s = state.subScript ? state.subScript.waves.length - 1 : -1;
        return Math.max(m, s);
    }

    function currentWaveNumber() {
        const arr = [];
        if (state.mainScript && state.mainScript.waves[state.waveIndex]) arr.push(state.mainScript.waves[state.waveIndex].wave);
        if (state.subScript && state.subScript.waves[state.waveIndex]) arr.push(state.subScript.waves[state.waveIndex].wave);
        return arr.length ? arr.join(' / ') : '—';
    }

    function changeWave(delta) {
        const max = maxWaveIndex();
        if (max < 0) return;
        let next = state.waveIndex + delta;
        next = Math.max(0, Math.min(max, next));
        if (next === state.waveIndex) return;
        state.waveIndex = next;
        const slider = state.root.querySelector('#simWaveSlider');
        if (slider) slider.value = next;
        render();
    }

    // ===== 渲染 =====
    function render() {
        if (!state.root) return;
        const max = maxWaveIndex();
        const slider = state.root.querySelector('#simWaveSlider');
        if (slider) { slider.max = Math.max(0, max); slider.value = state.waveIndex; }

        const banner = state.root.querySelector('#simWaveBanner');
        const waveDisplay = state.root.querySelector('#simWaveDisplay');
        const waveStr = currentWaveNumber();
        const maxIdx = maxWaveIndex();
        const progress = (maxIdx >= 0 ? (state.waveIndex + 1) + '/' + (maxIdx + 1) : '');
        if (banner) banner.textContent = '第 ' + waveStr + ' 波';
        if (waveDisplay) waveDisplay.textContent = '波数 ' + waveStr + ' · ' + progress;

        const myState = state.mainScript ? applyWave(createSideState(), state.mainScript, state.waveIndex) : createSideState();
        const tmState = state.subScript ? applyWave(createSideState(), state.subScript, state.waveIndex) : createSideState();

        renderSide(SIDE_MY, myState);
        renderSide(SIDE_TEAMMATE, tmState);
        renderEquipment(myState, tmState);
        renderScriptPanels();
        renderDamageReduction(myState, tmState);
    }

    function renderSide(side, sideState) {
        for (let i = 1; i <= SLOT_COUNT; i++) {
            const slot = state.root.querySelector('[data-slot="sim-' + side + '-' + i + '"]');
            const card = sideState.slots[i];
            clearSlot(slot);
            if (card) fillSlot(slot, card, side, sideState);
        }
        // 手牌
        const handContainer = state.root.querySelector('#sim-hand-' + side);
        if (handContainer) {
            handContainer.innerHTML = sideState.hand.map(function (h) {
                const info = getCardInfo(h);
                return '<div style="padding:2px 6px;border-radius:5px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:rgba(255,255,255,0.8);font-size:0.65rem;white-space:nowrap;">' + esc(h) + '</div>';
            }).join('');
        }
    }

    function clearSlot(slot) {
        if (!slot) return;
        slot.className = 'battle-slot empty' + (slot.dataset.type === 'engineering' ? ' engineering-slot' : '');
        slot.innerHTML = slot.dataset.type === 'engineering' ? '<span class="slot-label">🔧</span><span class="slot-empty">空</span>' : '<span class="slot-empty">空</span>';
        slot.removeAttribute('data-card-id');
        slot.removeAttribute('data-name');
        slot.style.border = '';
    }

    function fillSlot(slot, card, side, sideState) {
        if (!slot) return;
        slot.className = 'battle-slot filled' + (slot.dataset.type === 'engineering' ? ' engineering-slot' : '');
        slot.dataset.cardId = card.id;
        slot.dataset.name = card.hero;
        const display = window.getFusionDisplayName ? window.getFusionDisplayName(card.hero) : card.hero;
        slot.innerHTML = '<span class="card-name" data-full-name="' + esc(card.hero) + '" style="position:absolute;bottom:2px;left:0;right:0;text-align:center;color:#fff;font-size:0.62rem;text-shadow:0 1px 2px rgba(0,0,0,0.8);pointer-events:none;z-index:3;">' + esc(display) + '</span>';
        addBadges(slot, card);
        markSameRow(slot, card, sideState);
        if (typeof window.applySkinBgToSlot === 'function') {
            try { window.applySkinBgToSlot(slot, card.hero, card.id, side, card.skin, card.skin); } catch (e) {}
        }
    }

    function addBadges(slot, card) {
        const lv = card.level === '满' ? getMaxLevel(card.type) : (parseInt(card.level, 10) || 1);
        const lvBadge = document.createElement('div');
        lvBadge.style.cssText = 'position:absolute;bottom:2px;left:2px;background:linear-gradient(135deg,#ffd700,#ff8c00);color:#1a1a2e;border-radius:4px;padding:1px 3px;font-size:0.55rem;font-weight:700;line-height:1;z-index:4;pointer-events:none;';
        lvBadge.textContent = lv;
        slot.appendChild(lvBadge);
        if (card.isMohua) {
            const mh = document.createElement('div');
            mh.style.cssText = 'position:absolute;bottom:2px;right:2px;width:14px;height:14px;background:#ff1744;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:700;z-index:4;pointer-events:none;box-shadow:0 0 4px #ff1744;';
            mh.textContent = '魔';
            slot.appendChild(mh);
        }
    }

    function markSameRow(slot, card, sideState) {
        // 判断该卡是否在某对同排里
        let row = -1;
        sideState.sameRowPairs.forEach(function (pair, idx) {
            if (pair.indexOf(card.base) >= 0 || pair.indexOf(card.hero) >= 0) row = idx;
        });
        if (row >= 0) {
            const colors = ['#ff6b6b', '#4ecdc4', '#ffd700', '#a78bfa'];
            slot.style.border = '2px solid ' + colors[row % colors.length];
            slot.style.boxShadow = 'inset 0 0 10px ' + colors[row % colors.length];
        }
    }

    function renderEquipment(mainState, subState) {
        const area = state.root.querySelector('#simEquipmentArea');
        if (!area) return;
        const parts = [];
        if (mainState.equipment) parts.push('主卡:' + formatEquip(mainState.equipment, state.mainScript));
        if (subState.equipment) parts.push('副卡:' + formatEquip(subState.equipment, state.subScript));
        const myDr = calcSideDr(mainState);
        const tmDr = calcSideDr(subState);
        const total = (parseFloat(myDr) || 0) + (parseFloat(tmDr) || 0);
        const drHtml = '<span style="color:#4ecdc4;">14卡总减伤: ' + total.toFixed(1) + '</span>';
        if (!parts.length) { area.innerHTML = drHtml + ' · 装备区 · 暂无换装备'; return; }
        area.innerHTML = drHtml + '　当前装备：' + parts.join('　');
    }

    function formatEquip(name, script) {
        const def = EQUIPMENT_LIST[name] || { color: '#ccc', starSkinHero: '幻精灵' };
        const skinHero = def.starSkinHero;
        const hasSkin = script && script.header.skins[skinHero] && script.header.skins[skinHero] !== '默认';
        const star = hasSkin ? '★5' : '★4';
        return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:' + def.color + '22;border:1px solid ' + def.color + ';"><span style="color:' + def.color + ';">' + name + '</span><span style="color:#ffd700;font-size:0.7rem;">' + star + '</span></span>';
    }

    function renderScriptPanels() {
        const mainPanel = state.root.querySelector('#simMainScriptPanel');
        const subPanel = state.root.querySelector('#simSubScriptPanel');
        if (mainPanel) mainPanel.innerHTML = formatWaveContent(state.mainScript, state.waveIndex, '#4ecdc4');
        if (subPanel) subPanel.innerHTML = formatWaveContent(state.subScript, state.waveIndex, '#ff6b6b');
    }

    function formatWaveContent(script, idx, color) {
        if (!script) return '<span style="color:rgba(255,255,255,0.4);">未导入脚本</span>';
        const w = script.waves[idx];
        if (!w) return '<span style="color:rgba(255,255,255,0.4);">该脚本无第 ' + (idx + 1) + ' 条波束</span>';
        let html = '<div style="color:' + color + ';font-weight:700;margin-bottom:4px;">波 ' + w.wave + '</div>';
        w.actions.forEach(function (a) {
            if (a.type === 'place') html += '<div>⬆ <b>上</b> ' + esc(a.hero) + ' ' + esc(a.level) + (a.forceSeq ? ' <span style="color:#ffd700;">[顺序]</span>' : '') + '</div>';
            else if (a.type === 'remove') html += '<div>⬇ <b>下</b> ' + esc(a.hero) + '</div>';
            else if (a.type === 'equip') html += '<div>🛡 <b>换</b> ' + esc(a.name) + '</div>';
            else if (a.type === 'sameRow') html += '<div>🔗 <b>同排</b> ' + esc(a.heroes.join(' + ')) + '</div>';
            else if (a.type === 'sameRowCancel') html += '<div>❌ <b>取消同排</b></div>';
            else html += '<div style="color:rgba(255,255,255,0.55);">· ' + esc(a.text) + '</div>';
        });
        return html;
    }

    function renderDamageReduction(mainState, subState) {
        const myEl = state.root.querySelector('#simMyDr');
        const tmEl = state.root.querySelector('#simTeammateDr');
        if (myEl) myEl.textContent = calcSideDr(mainState);
        if (tmEl) tmEl.textContent = calcSideDr(subState);
        // 14 卡合计
        const total = parseFloat(myEl ? myEl.textContent : 0) + parseFloat(tmEl ? tmEl.textContent : 0);
        // 已在各自标题下方显示；这里不加额外 UI，避免拥挤
    }

    function calcSideDr(sideState) {
        const cards = [];
        for (let i = 1; i <= SLOT_COUNT; i++) {
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
        // 兜底：直接读 drTables['我的'].洗炼
        let sum = 0;
        const table = (window.drTables && window.drTables['我的'] && window.drTables['我的']['洗炼']) || {};
        cards.forEach(function (c) {
            const base = window.getMainCardName ? window.getMainCardName(c.name) : c.name;
            if (table[base]) sum += Number(table[base]) || 0;
        });
        return sum.toFixed(1);
    }

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 暴露
    window.openScriptSimulator = openScriptSimulator;
})();
