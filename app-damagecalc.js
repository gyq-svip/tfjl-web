// ============================================================
// 伤害测算计算器（移植自「伤害测算(1).xlsm」）
// 入口：管理员菜单「🧮 伤害测算」→ openAdminPanel 验证后可见
// 计算逻辑 1:1 复刻 xlsm「伤害计算」sheet 的五套最终伤害公式
// 支持：① BOSS 录入（localStorage）② 卡/职业模板录入 ③ 卡组阵容联动一键算总伤害
// 数据持久化：localStorage（刷新不丢），支持导入/导出 JSON
// ============================================================
(function () {
    'use strict';

    const LS_BOSS = 'tfjl_boss_custom';
    const LS_CARD = 'tfjl_card_templates';
    const LS_DECK = 'tfjl_deck';

    // ---------- 内置数据：基础属性表（等级 → 基础攻击） ----------
    const BASE_ATTACK = [0, 2880, 3168, 3456, 3744, 4032, 4320, 4608, 4896, 5184, 5472, 5760, 6048, 6336, 6624, 6912, 7200, 7488, 7776, 8064, 8640, 9216, 9792, 10368, 10944];
    function baseAttack(level) {
        level = parseInt(level, 10);
        if (isNaN(level)) return 0;
        if (level >= 1 && level <= 24) return BASE_ATTACK[level];
        if (level < 1) return BASE_ATTACK[1];
        return BASE_ATTACK[24];
    }
    function fireMultiplier(level) {
        level = parseInt(level, 10) || 0;
        if (level >= 24) return 5;
        if (level >= 15) return 4;
        if (level >= 6) return 3;
        return 1;
    }

    // ---------- 工具函数 ----------
    function num(v, d) { var n = parseFloat(v); return isNaN(n) ? (d || 0) : n; }
    function fmtWan(wan) { return (Math.round(wan * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
    function min(a, b) { return a < b ? a : b; }
    function max(a, b) { return a > b ? a : b; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---------- localStorage 读写 ----------
    function loadJSON(key, def) {
        try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; }
    }
    function saveJSON(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    }

    // ---------- 内置 BOSS 表（与 xlsm 一致） ----------
    const BUILTIN_BOSS = [
        { type: '大漩涡', name: '深海-典狱长(69波)', blood: 100000000000, dmgBuff: 0, ice: 0.00004, mr: 800, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.3, pct: 0.95, dmgR: 1.5, atkD: 1.5 },
        { type: '大漩涡', name: '深海-刺豚(79波)', blood: 125000000000, dmgBuff: 0, ice: 0.000032, mr: 850, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.3, pct: 0.96, dmgR: 1.5, atkD: 1.5 },
        { type: '大漩涡', name: '深海-公主(89波)', blood: 200000000000, dmgBuff: 0, ice: 0.00002, mr: 850, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.3, pct: 0.98, dmgR: 1.5, atkD: 1.5 },
        { type: '大漩涡', name: '深海-水母(99波)', blood: 400000000000, dmgBuff: 1.7, ice: 0.00001, mr: 850, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.36, pct: 0.99, dmgR: 1.5, atkD: 1.5 },
        { type: '大漩涡', name: '龙族-红龙(109)', blood: 400000000000, dmgBuff: 1.7, ice: 0.0000125, mr: 850, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.36, pct: 0.99, dmgR: 1.5, atkD: 1.5 },
        { type: '大漩涡', name: '沉睡的深海泰坦', blood: 20000000000000, dmgBuff: 0, ice: 0.0000005, mr: 850, mrp: 0.8, pure: 2, elem: 0.9, real: 1.35, pct: 0.99, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '火灵(109)', blood: 8000000000, dmgBuff: 1, ice: 0.000125, mr: 600, mrp: 0.65, pure: 1.5, elem: 0.9, real: 1.1, pct: 0.8, dmgR: 2, atkD: 1.5 },
        { type: '暗月', name: '水灵(119)', blood: 10000000000, dmgBuff: 0.3, ice: 0.00015, mr: 600, mrp: 0.65, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.85, dmgR: 2, atkD: 1.5 },
        { type: '暗月', name: '风灵(129)', blood: 25000000000, dmgBuff: 1.1, ice: 0.00008, mr: 600, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.85, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '土灵(139)', blood: 30000000000, dmgBuff: 1.1, ice: 0.0001, mr: 700, mrp: 0.65, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.9, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '噬魂之玉(149)', blood: 50000000000, dmgBuff: 1.1, ice: 0.00006, mr: 700, mrp: 0.65, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.9, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '魔化大圣(159)', blood: 60000000000, dmgBuff: 1.1, ice: 0.00005, mr: 700, mrp: 0.7, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.9, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '魔化哪吒(169)', blood: 100000000000, dmgBuff: 1.1, ice: 0.00002, mr: 700, mrp: 0.7, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.9, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '魔化猫咪(179)', blood: 30000000000, dmgBuff: 1.1, ice: 0.0001, mr: 700, mrp: 0.7, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.8, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '魔化财阀(189)', blood: 100, dmgBuff: 1.2, ice: 0.0006, mr: 700, mrp: 0.7, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.7, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '梦魇泰坦(199)', blood: 250000000000, dmgBuff: 1.5, ice: 0.000012, mr: 1000, mrp: 0.75, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.9, dmgR: 2, atkD: 2 },
        { type: '暗月', name: '梦魇泰坦之心(209)', blood: 150000000000, dmgBuff: 0, ice: 0.00002, mr: 1000, mrp: 0.75, pure: 1.5, elem: 0.9, real: 1.2, pct: 0.99, dmgR: 2, atkD: 1.5 },
        { type: '活动', name: '田伯光', blood: 800000000000, dmgBuff: 0.9, ice: 0.00000625, mr: 600, mrp: 0.6, pure: 1.5, elem: 0.9, real: 1.25, pct: 0.99, dmgR: 2, atkD: 1.5 }
    ];

    // ---------- 卡类型 schema（决定录入时需要哪些参数） ----------
    // 每个卡类型对应 xlsm 里的一套公式，param 字段即 compute() 需要的参数键
    const CARD_TYPES = {
        fire: { label: '🔥 火灵', params: [
            { k: 'fireLevel', t: '火灵等级', d: 21 }, { k: 'fireExtra', t: '额外固定攻击', d: 0 },
            { k: 'panda', t: '上阵熊猫个数', d: 5 }, { k: 'meng', t: '萌萌倍数', d: 12 },
            { k: 'tang', t: '唐僧', d: 0 }, { k: 'fireAtkBonus', t: '攻击力加成', d: 1.8 },
            { k: 'fireDmgBonus', t: '伤害加成', d: 2.65 }, { k: 'fireMagic', t: '火灵魔化', d: 1.5 }
        ] },
        summon: { label: '👾 召唤物', params: [
            { k: 'summonPct', t: '召唤物百分比', d: 0.02 }, { k: 'summonMrReduceBase', t: '基础魔抗减少', d: 45 },
            { k: 'summonMrReducePct', t: '魔抗减少%', d: 0 }
        ] },
        fish: { label: '🐟 鱼人', params: [
            { k: 'fishPct', t: '鱼人百分比', d: 0.004 }, { k: 'fishPureReduce', t: '纯粹减少%', d: 0.3 },
            { k: 'fishRealBonus', t: '真实伤害加成', d: 0.6 }, { k: 'fishSha', t: '沙皇倍数', d: 1.5 }
        ] },
        angel: { label: '😇 天使', params: [
            { k: 'angelPct', t: '天使百分比', d: 0.015 }, { k: 'angelRealBonus', t: '真实伤害加成', d: 0.37 },
            { k: 'angelSha', t: '沙皇倍数', d: 1 }
        ] },
        mage: { label: '🐢 法师(乌龟/飞机)', params: [
            { k: 'mageBaseAtk', t: '基础攻击', d: 20000 }, { k: 'mageMrReduceBase', t: '基础魔抗减少', d: 45 },
            { k: 'mageMrReducePct', t: '魔抗减少%', d: 1.6 }, { k: 'mageAtkBonus', t: '攻击加成', d: 216 },
            { k: 'mageCoef', t: '攻击系数', d: 1 }, { k: 'mageDmgBonus', t: '伤害加成', d: 0 },
            { k: 'magePanda', t: '熊猫倍数', d: 10 }
        ] }
    };

    // ---------- 核心计算（复刻 xlsm「伤害计算」sheet，返回各类型万伤害） ----------
    function compute(p, boss) {
        const mr = boss.mr, mrp = boss.mrp, pct = boss.pct, blood = boss.blood;
        const pure = boss.pure, elem = boss.elem, real = boss.real, dmgR = boss.dmgR, atkD = boss.atkD;

        const firePanel = baseAttack(p.fireLevel) + num(p.fireExtra);
        const fireMult = fireMultiplier(p.fireLevel);
        const fire = firePanel * (1 - atkD + num(p.tang) + num(p.fireAtkBonus)) * (1 - elem) * Math.pow(fireMult, num(p.panda)) * num(p.meng) * (1 + num(p.fireDmgBonus) - dmgR) * num(p.fireMagic) / 10000;

        const summonFinalMr = mr * (1 + mrp - num(p.summonMrReducePct)) - num(p.summonMrReduceBase);
        const summonResist = min(0.052 * summonFinalMr / (0.9 + 0.048 * Math.abs(summonFinalMr)), 0.99);
        const summon = blood * num(p.summonPct) * (1 - pct) * (1 - summonResist) / 10000;

        const fish = blood * num(p.fishPct) * (1 - pct) * max(1 - (pure - num(p.fishPureReduce)), 0.1) / 10000;
        const fishSha = blood * num(p.fishPct) * (1 - pct) * max(1 - (real - num(p.fishRealBonus)), 0.01) * num(p.fishSha) / 10000;

        const angel = blood * num(p.angelPct) * (1 - pct) * max(1 - (real - num(p.angelRealBonus)), 0.01) * num(p.angelSha) / 10000;

        const mageFinalMr = mr * (1 + mrp - num(p.mageMrReducePct)) - num(p.mageMrReduceBase);
        const mageResist = min(0.052 * mageFinalMr / (0.9 + 0.048 * Math.abs(mageFinalMr)), 0.99);
        const mage = (num(p.mageBaseAtk) * max(1 + num(p.mageAtkBonus) - atkD, 0.01)) * num(p.mageCoef) * (1 - mageResist) * max(1 + num(p.mageDmgBonus) - dmgR, 0.1) * num(p.magePanda) / 10000;

        return { fire: fire, summon: summon, fish: fish, fishSha: fishSha, angel: angel, mage: mage };
    }

    // 单卡计算：根据卡类型取对应字段
    function computeCard(card, boss) {
        const r = compute(card.params, boss);
        switch (card.type) {
            case 'fire': return r.fire;
            case 'summon': return r.summon;
            case 'fish': return r.fish; // 鱼人(含沙皇在卡模板里可单选，这里返回基础+沙皇合计展示在卡组)
            case 'angel': return r.angel;
            case 'mage': return r.mage;
            default: return 0;
        }
    }

    // ---------- 全局状态 ----------
    let STATE = { bossIdx: 0, tab: 'calc' };
    function getBosses() { return BUILTIN_BOSS.concat(loadJSON(LS_BOSS, [])); }
    function getCards() { return loadJSON(LS_CARD, []); }
    function getDeck() { return loadJSON(LS_DECK, []); }

    // ---------- 渲染主入口 ----------
    function renderDamageCalc() {
        const root = document.getElementById('adminPageDamageCalc');
        if (!root) return;
        const bosses = getBosses();

        root.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:15px;">' +
            '<button class="admin-btn admin-btn-secondary" onclick="adminShowMenu()" style="padding:6px 12px;font-size:0.85rem;">← 返回</button>' +
            '<h3 style="color:#ffd700;margin:0;font-size:1rem;">🧮 伤害测算计算器</h3></div>' +

            '<div id="dcTabs" style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">' +
            tabBtn('calc', '📊 伤害计算') + tabBtn('boss', '➕ 录入BOSS') + tabBtn('card', '🃏 录入卡/职业') + tabBtn('deck', '⚔️ 卡组阵容') +
            '</div>' +
            '<div class="admin-section" id="damageCalcContent" style="max-height:64vh;overflow:auto;"></div>';

        function tabBtn(id, label) {
            return '<button onclick="window.__dcTab && window.__dcTab(\'' + id + '\')" style="padding:6px 12px;border-radius:8px;border:1px solid #555;background:' + (STATE.tab === id ? '#ffd700' : '#222') + ';color:' + (STATE.tab === id ? '#000' : '#ddd') + ';cursor:pointer;font-size:0.85rem;">' + label + '</button>';
        }
        window.__dcTab = function (id) { STATE.tab = id; renderDamageCalc(); };

        const content = document.getElementById('damageCalcContent');
        if (STATE.tab === 'calc') renderCalc(content, bosses);
        else if (STATE.tab === 'boss') renderBossForm(content, bosses);
        else if (STATE.tab === 'card') renderCardForm(content);
        else if (STATE.tab === 'deck') renderDeck(content, bosses);
    }

    // ===== Tab1: 伤害计算（选BOSS + 5类参数实时算） =====
    function renderCalc(root, bosses) {
        const P = {
            fireLevel: 21, fireExtra: 0, panda: 5, meng: 12, tang: 0, fireAtkBonus: 1.8, fireDmgBonus: 2.65, fireMagic: 1.5,
            summonPct: 0.02, summonMrReduceBase: 45, summonMrReducePct: 0,
            fishPct: 0.004, fishPureReduce: 0.3, fishRealBonus: 0.6, fishSha: 1.5,
            angelPct: 0.015, angelRealBonus: 0.37, angelSha: 1,
            mageBaseAtk: 20000, mageMrReduceBase: 45, mageMrReducePct: 1.6, mageAtkBonus: 216, mageCoef: 1, mageDmgBonus: 0, magePanda: 10
        };
        const opts = bosses.map(function (b, i) { return '<option value="' + i + '">' + esc(b.type) + ' · ' + esc(b.name) + '</option>'; }).join('');
        root.innerHTML =
            '<div style="color:#ddd;font-size:0.9rem;">' +
            '<div style="margin-bottom:10px;"><label style="color:#ffd700;">BOSS：</label>' +
            '<select id="dcBoss" style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:5px 8px;min-width:240px;">' + opts + '</select>' +
            '<span id="dcBossInfo" style="margin-left:10px;color:#9f9;font-size:0.8rem;"></span></div>' +
            block('🔥 火灵输出', [['fireLevel', '火灵等级'], ['fireExtra', '额外固定攻击'], ['panda', '上阵熊猫个数'], ['meng', '萌萌倍数'], ['tang', '唐僧'], ['fireAtkBonus', '攻击力加成'], ['fireDmgBonus', '伤害加成'], ['fireMagic', '火灵魔化']], P) +
            block('👾 召唤物输出', [['summonPct', '召唤物百分比'], ['summonMrReduceBase', '基础魔抗减少'], ['summonMrReducePct', '魔抗减少%']], P) +
            block('🐟 鱼人输出', [['fishPct', '鱼人百分比'], ['fishPureReduce', '纯粹减少%'], ['fishRealBonus', '真实伤害加成'], ['fishSha', '沙皇倍数']], P) +
            block('😇 天使输出', [['angelPct', '天使百分比'], ['angelRealBonus', '真实伤害加成'], ['angelSha', '沙皇倍数']], P) +
            block('🐢 法师输出', [['mageBaseAtk', '基础攻击'], ['mageMrReduceBase', '基础魔抗减少'], ['mageMrReducePct', '魔抗减少%'], ['mageAtkBonus', '攻击加成'], ['mageCoef', '攻击系数'], ['mageDmgBonus', '伤害加成'], ['magePanda', '熊猫倍数']], P) +
            '</div>';

        function block(title, fields, P) {
            let rows = fields.map(function (f) {
                return inp(f[0], f[1], P[f[0]]);
            }).join('');
            return '<div class="dc-block" style="margin-bottom:8px;"><h4 style="color:#ffd700;margin:8px 0 4px;">' + title + '</h4>' + rows + '<div class="dc-result" id="dc_' + fields[0][0] + '_out"></div></div>';
        }
        function inp(key, label, val) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,0.06);">' +
                '<span>' + label + '</span><input id="dc_' + key + '" data-key="' + key + '" value="' + val + '" ' +
                'style="width:120px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:5px;padding:3px 6px;text-align:right;" oninput="window.__dcCalc()"></div>';
        }
        function recalc() {
            const boss = bosses[parseInt(document.getElementById('dcBoss').value, 10) || 0];
            const p = {};
            Object.keys(P).forEach(function (k) { const el = document.getElementById('dc_' + k); p[k] = el ? el.value : P[k]; });
            const r = compute(p, boss);
            document.getElementById('dcBossInfo').textContent = boss.type + ' · 血量 ' + fmtInt(boss.blood) + ' / 魔抗 ' + boss.mr + ' / 百分比减免 ' + boss.pct;
            out('fireLevel', '最终伤害：<b style="color:#ff8;">' + fmtWan(r.fire) + ' 万</b>');
            out('summonPct', '最终伤害：<b style="color:#ff8;">' + fmtWan(r.summon) + ' 万</b>');
            out('fishPct', '鱼人：<b style="color:#ff8;">' + fmtWan(r.fish) + ' 万</b> ｜ 沙皇：<b style="color:#ff8;">' + fmtWan(r.fishSha) + ' 万</b>');
            out('angelPct', '最终伤害：<b style="color:#ff8;">' + fmtWan(r.angel) + ' 万</b>');
            out('mageBaseAtk', '最终伤害：<b style="color:#ff8;">' + fmtWan(r.mage) + ' 万</b>');
        }
        function out(key, html) { const el = document.getElementById('dc_' + key + '_out'); if (el) el.innerHTML = html; }
        window.__dcCalc = recalc;
        document.getElementById('dcBoss').addEventListener('change', recalc);
        recalc();
    }

    // ===== Tab2: 录入 BOSS =====
    function renderBossForm(root, bosses) {
        const fields = [
            ['type', '类型(如 大漩涡/暗月/活动)'], ['name', '名称'], ['blood', '血量'], ['dmgBuff', '伤害加成'],
            ['ice', '冰甲'], ['mr', '魔抗'], ['mrp', '魔抗%'], ['pure', '纯粹减免'], ['elem', '元素减免'],
            ['real', '真实伤害减免'], ['pct', '百分比减免'], ['dmgR', '伤害减免'], ['atkD', '降低攻击']
        ];
        const custom = loadJSON(LS_BOSS, []);
        let list = custom.length ? '<h4 style="color:#ffd700;">已录入 BOSS（' + custom.length + '）：</h4><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">' +
            custom.map(function (b, i) { return '<span style="background:#333;padding:3px 8px;border-radius:6px;font-size:0.8rem;">' + esc(b.type) + '·' + esc(b.name) + ' <a href="javascript:void(0)" onclick="window.__dcDelBoss(' + i + ')" style="color:#f88;">✕</a></span>'; }).join('') + '</div>' : '<p style="color:#888;">暂无自定义 BOSS</p>';
        let form = '<div style="background:#1a1a1a;padding:12px;border-radius:8px;">' + fields.map(function (f) {
            return '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>' + f[1] + '</span><input id="bf_' + f[0] + '" style="width:160px;background:#222;color:#fff;border:1px solid #555;border-radius:5px;padding:3px 6px;text-align:right;"></div>';
        }).join('') + '<button onclick="window.__dcAddBoss()" style="margin-top:10px;padding:6px 14px;background:#ffd700;color:#000;border:none;border-radius:6px;cursor:pointer;">💾 保存BOSS</button></div>';
        root.innerHTML = list + form;
        window.__dcAddBoss = function () {
            const b = {};
            let ok = true;
            fields.forEach(function (f) {
                const v = document.getElementById('bf_' + f[0]).value;
                b[f[0]] = (f[0] === 'type' || f[0] === 'name') ? v : num(v, 0);
                if ((f[0] === 'type' || f[0] === 'name') && !v) ok = false;
            });
            if (!ok) { alert('类型和名称必填'); return; }
            const arr = loadJSON(LS_BOSS, []);
            arr.push(b);
            saveJSON(LS_BOSS, arr);
            renderDamageCalc(); // 重新渲染加载新BOSS
        };
        window.__dcDelBoss = function (i) {
            const arr = loadJSON(LS_BOSS, []);
            arr.splice(i, 1);
            saveJSON(LS_BOSS, arr);
            renderDamageCalc();
        };
    }

    // ===== Tab3: 录入卡/职业模板 =====
    function renderCardForm(root) {
        const cards = getCards();
        const typeOpts = Object.keys(CARD_TYPES).map(function (k) { return '<option value="' + k + '">' + CARD_TYPES[k].label + '</option>'; }).join('');
        let list = cards.length ? '<h4 style="color:#ffd700;">已录入卡模板（' + cards.length + '）：</h4><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">' +
            cards.map(function (c, i) { return '<span style="background:#333;padding:3px 8px;border-radius:6px;font-size:0.8rem;">' + esc(c.name) + '(' + CARD_TYPES[c.type].label + ') <a href="javascript:void(0)" onclick="window.__dcDelCard(' + i + ')" style="color:#f88;">✕</a></span>'; }).join('') + '</div>' : '<p style="color:#888;">暂无卡模板</p>';
        root.innerHTML = list +
            '<div style="background:#1a1a1a;padding:12px;border-radius:8px;">' +
            '<div style="display:flex;gap:8px;margin-bottom:10px;"><span>卡名：</span><input id="cf_name" placeholder="如 我的火灵" style="flex:1;background:#222;color:#fff;border:1px solid #555;border-radius:5px;padding:4px 8px;"><span>类型：</span><select id="cf_type" style="background:#222;color:#fff;border:1px solid #555;border-radius:5px;padding:4px 8px;">' + typeOpts + '</select></div>' +
            '<div id="cf_params"></div>' +
            '<button onclick="window.__dcAddCard()" style="margin-top:10px;padding:6px 14px;background:#ffd700;color:#000;border:none;border-radius:6px;cursor:pointer;">💾 保存卡模板</button>' +
            '<button onclick="window.__dcExportAll()" style="margin-top:10px;margin-left:8px;padding:6px 14px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;">⬇ 导出JSON</button>' +
            '<button onclick="document.getElementById(\'cf_import\').click()" style="margin-top:10px;margin-left:8px;padding:6px 14px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;">⬆ 导入JSON</button>' +
            '<input id="cf_import" type="file" accept="application/json" style="display:none;" onchange="window.__dcImportAll(event)">' +
            '</div>';

        function renderParams() {
            const t = document.getElementById('cf_type').value;
            const schema = CARD_TYPES[t].params;
            document.getElementById('cf_params').innerHTML = schema.map(function (f) {
                return '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>' + f.t + '</span><input id="cfp_' + f.k + '" value="' + f.d + '" style="width:160px;background:#222;color:#fff;border:1px solid #555;border-radius:5px;padding:3px 6px;text-align:right;"></div>';
            }).join('');
        }
        document.getElementById('cf_type').addEventListener('change', renderParams);
        renderParams();

        window.__dcAddCard = function () {
            const name = document.getElementById('cf_name').value.trim();
            const type = document.getElementById('cf_type').value;
            if (!name) { alert('卡名必填'); return; }
            const params = {};
            CARD_TYPES[type].params.forEach(function (f) { params[f.k] = num(document.getElementById('cfp_' + f.k).value, 0); });
            const arr = getCards();
            arr.push({ name: name, type: type, params: params });
            saveJSON(LS_CARD, arr);
            alert('已保存卡模板：' + name);
            renderDamageCalc();
        };
        window.__dcDelCard = function (i) { const arr = getCards(); arr.splice(i, 1); saveJSON(LS_CARD, arr); renderDamageCalc(); };
        window.__dcExportAll = function () {
            const data = { bosses: loadJSON(LS_BOSS, []), cards: getCards(), deck: getDeck() };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '伤害测算数据.json'; a.click();
        };
        window.__dcImportAll = function (e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    const d = JSON.parse(reader.result);
                    if (d.bosses) saveJSON(LS_BOSS, d.bosses);
                    if (d.cards) saveJSON(LS_CARD, d.cards);
                    if (d.deck) saveJSON(LS_DECK, require_deck(d.deck));
                    alert('导入成功'); renderDamageCalc();
                } catch (err) { alert('导入失败：' + err.message); }
            };
            reader.readAsText(file);
        };
        function require_deck(arr) { return Array.isArray(arr) ? arr : []; }
    }

    // ===== Tab4: 卡组阵容联动 =====
    function renderDeck(root, bosses) {
        const cards = getCards();
        const deck = getDeck();
        if (!cards.length) { root.innerHTML = '<p style="color:#f88;">请先在「🃏 录入卡/职业」里录入你的卡，再来组阵容。</p>'; return; }
        const cardOpts = cards.map(function (c, i) { return '<option value="' + i + '">' + esc(c.name) + '(' + CARD_TYPES[c.type].label + ')</option>'; }).join('');
        const bossOpts = bosses.map(function (b, i) { return '<option value="' + i + '">' + esc(b.type) + ' · ' + esc(b.name) + '</option>'; }).join('');

        let deckList = deck.length ? '<div style="margin:10px 0;">' + deck.map(function (d, i) {
            const card = cards[d.cardIdx] || {};
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#222;border-radius:6px;margin-bottom:4px;"><span>' + esc(card.name || '?') + ' ×' + (d.count || 1) + '</span><span><button onclick="window.__dcDeckCount(' + i + ',1)" style="background:#444;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;">＋</button> <button onclick="window.__dcDeckCount(' + i + ',-1)" style="background:#444;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;">－</button> <a href="javascript:void(0)" onclick="window.__dcDeckDel(' + i + ')" style="color:#f88;margin-left:6px;">✕</a></span></div>';
        }).join('') + '</div>' : '<p style="color:#888;">阵容空，先从下方添加卡。</p>';

        // 计算总伤害
        let total = 0; let rows = '';
        const boss = bosses[parseInt(document.getElementById('dk_boss') ? document.getElementById('dk_boss').value : 0, 10) || 0];
        // boss 选择框在下方，这里先渲染占位，recalc 时取
        root.innerHTML =
            '<div style="color:#ddd;">' +
            '<div style="margin-bottom:10px;"><label style="color:#ffd700;">对阵BOSS：</label><select id="dk_boss" style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:5px 8px;min-width:240px;">' + bossOpts + '</select></div>' +
            deckList +
            '<div style="display:flex;gap:8px;margin:10px 0;"><select id="dk_card" style="flex:1;background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:5px 8px;">' + cardOpts + '</select><button onclick="window.__dcDeckAdd()" style="padding:6px 14px;background:#ffd700;color:#000;border:none;border-radius:6px;cursor:pointer;">＋ 加入阵容</button></div>' +
            '<div id="dk_result" style="background:#111;padding:12px;border-radius:8px;"></div>' +
            '</div>';
        document.getElementById('dk_boss').addEventListener('change', recalcDeck);

        function recalcDeck() {
            const b = bosses[parseInt(document.getElementById('dk_boss').value, 10) || 0];
            const dk = getDeck();
            let sum = 0; let html = '';
            dk.forEach(function (d) {
                const card = cards[d.cardIdx]; if (!card) return;
                const per = computeCard(card, b);
                const cnt = d.count || 1;
                sum += per * cnt;
                html += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed rgba(255,255,255,0.06);"><span>' + esc(card.name) + ' ×' + cnt + '</span><b style="color:#ff8;">' + fmtWan(per * cnt) + ' 万</b></div>';
            });
            html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #555;display:flex;justify-content:space-between;"><span style="color:#ffd700;">阵容总伤害</span><b style="color:#ffd700;font-size:1.1rem;">' + fmtWan(sum) + ' 万</b></div>';
            const el = document.getElementById('dk_result'); if (el) el.innerHTML = html;
        }
        window.__dcDeckAdd = function () {
            const ci = parseInt(document.getElementById('dk_card').value, 10) || 0;
            const dk = getDeck();
            const found = dk.find(function (d) { return d.cardIdx === ci; });
            if (found) found.count = (found.count || 1) + 1; else dk.push({ cardIdx: ci, count: 1 });
            saveJSON(LS_DECK, dk); renderDeck(root, bosses);
        };
        window.__dcDeckCount = function (i, delta) {
            const dk = getDeck(); if (!dk[i]) return;
            dk[i].count = Math.max(1, (dk[i].count || 1) + delta);
            saveJSON(LS_DECK, dk); renderDeck(root, bosses);
        };
        window.__dcDeckDel = function (i) { const dk = getDeck(); dk.splice(i, 1); saveJSON(LS_DECK, dk); renderDeck(root, bosses); };
        recalcDeck();
    }

    window.renderDamageCalc = renderDamageCalc;
    window.__dcReload = renderDamageCalc;
})();
