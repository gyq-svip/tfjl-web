// ============================================================
// 伤害测算计算器（移植自「伤害测算(1).xlsm」）
// 入口：管理员菜单「🧮 伤害测算」→ openAdminPanel 验证后可见
// 计算逻辑 1:1 复刻 xlsm「伤害计算」sheet 的五套最终伤害公式
// 依赖：BOSS属性表（VLOOKUP）、基础属性表（等级→攻击）
// ============================================================
(function () {
    'use strict';

    // ---------- 内置数据：BOSS属性表 ----------
    // 字段对应 xlsm：血量/伤害加成/冰甲/魔抗/魔抗%/纯粹减免/元素减免/真实伤害减免/百分比减免/伤害减免/降低攻击
    const BOSS_TABLE = [
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

    // ---------- 内置数据：基础属性表（等级 → 基础攻击） ----------
    // 等差 288，1:2880 ... 24:10944
    const BASE_ATTACK = [0, 2880, 3168, 3456, 3744, 4032, 4320, 4608, 4896, 5184, 5472, 5760, 6048, 6336, 6624, 6912, 7200, 7488, 7776, 8064, 8640, 9216, 9792, 10368, 10944];
    function baseAttack(level) {
        level = parseInt(level, 10);
        if (isNaN(level)) return 0;
        if (level >= 1 && level <= 24) return BASE_ATTACK[level];
        if (level < 1) return BASE_ATTACK[1];
        return BASE_ATTACK[24];
    }
    // 火灵倍数 LOOKUP(等级,{0;6;15;24},{1;3;4;5})
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

    // ---------- 核心计算（复刻 xlsm「伤害计算」sheet） ----------
    function compute(p, boss) {
        // BOSS 相关取值（对应 xlsm 的 B5/B6/B7/E4/E5/E6/E7/H5/H6）
        const mr = boss.mr;          // B5 魔抗
        const mrp = boss.mrp;        // B6 魔抗%
        const pct = boss.pct;        // B7 百分比减免
        const blood = boss.blood;    // E4 血量
        const pure = boss.pure;      // E5 纯粹减免
        const elem = boss.elem;      // E6 元素减免
        const real = boss.real;      // E7 真实伤害减免
        const dmgR = boss.dmgR;      // H5 伤害减免
        const atkD = boss.atkD;     // H6 降低攻击

        // ===== 火灵 =====
        // B12 = VLOOKUP(等级,基础属性)+E12(额外固定)
        const firePanel = baseAttack(p.fireLevel) + num(p.fireExtra);
        // B13 = LOOKUP(等级,...)
        const fireMult = fireMultiplier(p.fireLevel);
        // H14 = TEXT(B12*(1-H6+H12+B14)*(1-E6)*(B13^E11)*H11*(1+E13-H5)*H13/10000,"0.00万")
        // 其中 H12=唐僧(p.tang), B14=攻击力加成(p.fireAtkBonus), E11=上阵熊猫个数(p.panda),
        //      H11=萌萌倍数(p.meng), E13=伤害加成(p.fireDmgBonus), H13=火灵魔化(p.fireMagic)
        const fire = firePanel * (1 - atkD + num(p.tang) + num(p.fireAtkBonus)) * (1 - elem) * Math.pow(fireMult, num(p.panda)) * num(p.meng) * (1 + num(p.fireDmgBonus) - dmgR) * num(p.fireMagic) / 10000;

        // ===== 召唤物 =====
        // E19 = B5*(1+B6-B19)-E18 ; B19=魔抗减少%(p.summonMrReducePct), E18=基础魔抗减少(p.summonMrReduceBase)
        const summonFinalMr = mr * (1 + mrp - num(p.summonMrReducePct)) - num(p.summonMrReduceBase);
        // H18 = MIN(0.052*E19/(0.9+0.048*ABS(E19)),0.99)
        const summonResist = min(0.052 * summonFinalMr / (0.9 + 0.048 * Math.abs(summonFinalMr)), 0.99);
        // H19 = TEXT((E4*B18*(1-B7)*(1-H18))/10000,"0万") ; B18=召唤物百分比(p.summonPct)
        const summon = blood * num(p.summonPct) * (1 - pct) * (1 - summonResist) / 10000;

        // ===== 鱼人 =====
        // H23 = TEXT(E4*B23*(1-B7)*MAX(1-(E5-E23),0.1)/10000,"0万") ; B23=鱼人百分比(p.fishPct), E23=纯粹减少%(p.fishPureReduce)
        const fish = blood * num(p.fishPct) * (1 - pct) * max(1 - (pure - num(p.fishPureReduce)), 0.1) / 10000;
        // H24 = TEXT((E4*B23*(1-B7)*MAX(1-(E7-E24),0.01))*B24/10000,"0万") ; E24=真实伤害加成(p.fishRealBonus), B24=沙皇倍数(p.fishSha)
        const fishSha = blood * num(p.fishPct) * (1 - pct) * max(1 - (real - num(p.fishRealBonus)), 0.01) * num(p.fishSha) / 10000;

        // ===== 天使 =====
        // H29 = TEXT((E4*B28*(1-B7)*MAX(1-(E7-E28),0.01))*H28/10000,"0万") ; B28=天使百分比(p.angelPct), E28=真实伤害加成(p.angelRealBonus), H28=沙皇倍数(p.angelSha)
        const angel = blood * num(p.angelPct) * (1 - pct) * max(1 - (real - num(p.angelRealBonus)), 0.01) * num(p.angelSha) / 10000;

        // ===== 法师(乌龟,飞机) =====
        // E35 = B5*(1+B6-E34)-E33 ; E34=魔抗减少%(p.mageMrReducePct), E33=基础魔抗减少(p.mageMrReduceBase)
        const mageFinalMr = mr * (1 + mrp - num(p.mageMrReducePct)) - num(p.mageMrReduceBase);
        // H33 = MIN(0.052*E35/(0.9+0.048*ABS(E35)),0.99)
        const mageResist = min(0.052 * mageFinalMr / (0.9 + 0.048 * Math.abs(mageFinalMr)), 0.99);
        // H36 = TEXT((B33*MAX(1+B35-H6,0.01))*B36*(1-H33)*MAX(1+H34-H5,0.1)*B34/10000,"#,##0万")
        // B33=基础攻击(p.mageBaseAtk), B35=攻击加成(p.mageAtkBonus), B36=攻击系数(p.mageCoef), H34=伤害加成(p.mageDmgBonus), B34=熊猫倍数(p.magePanda)
        const mage = (num(p.mageBaseAtk) * max(1 + num(p.mageAtkBonus) - atkD, 0.01)) * num(p.mageCoef) * (1 - mageResist) * max(1 + num(p.mageDmgBonus) - dmgR, 0.1) * num(p.magePanda) / 10000;

        return {
            boss: { blood: blood, mr: mr, mrp: mrp, pct: pct, pure: pure, elem: elem, real: real, dmgR: dmgR, atkD: atkD, ice: boss.ice, dmgBuff: boss.dmgBuff },
            fire: fire, summon: summon, fish: fish, fishSha: fishSha, angel: angel, mage: mage
        };
    }

    // ---------- 渲染 ----------
    function renderDamageCalc() {
        const root = document.getElementById('adminPageDamageCalc');
        if (!root) return;

        // 默认参数（对齐 xlsm 初始值）
        const P = {
            fireLevel: 21, fireExtra: 0, panda: 5, meng: 12, tang: 0,
            fireAtkBonus: 1.8, fireDmgBonus: 2.65, fireMagic: 1.5,
            summonPct: 0.02, summonMrReduceBase: 45, summonMrReducePct: 0,
            fishPct: 0.004, fishPureReduce: 0.3, fishRealBonus: 0.6, fishSha: 1.5,
            angelPct: 0.015, angelRealBonus: 0.37, angelSha: 1,
            mageBaseAtk: 20000, mageMrReduceBase: 45, mageMrReducePct: 1.6,
            mageAtkBonus: 216, mageCoef: 1, mageDmgBonus: 0, magePanda: 10
        };

        const opts = BOSS_TABLE.map(function (b, i) { return '<option value="' + i + '">' + b.type + ' · ' + b.name + '</option>'; }).join('');

        root.innerHTML =
            '<div style="color:#ddd;font-size:0.9rem;line-height:1.6;">' +
            '<div style="margin-bottom:10px;">' +
            '<label style="color:#ffd700;">BOSS：</label>' +
            '<select id="dcBoss" style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:5px 8px;min-width:240px;">' + opts + '</select>' +
            '<span id="dcBossInfo" style="margin-left:10px;color:#9f9;font-size:0.8rem;"></span>' +
            '</div>' +

            // 火灵
            '<div class="dc-block"><h4 style="color:#ffd700;margin:8px 0 4px;">🔥 火灵输出</h4>' +
            row('火灵等级', 'fireLevel', P.fireLevel) + row('额外固定攻击', 'fireExtra', P.fireExtra) +
            row('上阵熊猫个数', 'panda', P.panda) + row('萌萌倍数', 'meng', P.meng) +
            row('唐僧', 'tang', P.tang) + row('攻击力加成', 'fireAtkBonus', P.fireAtkBonus) +
            row('伤害加成', 'fireDmgBonus', P.fireDmgBonus) + row('火灵魔化', 'fireMagic', P.fireMagic) +
            '<div class="dc-result" id="dcFire"></div></div>' +

            // 召唤物
            '<div class="dc-block"><h4 style="color:#ffd700;margin:8px 0 4px;">👾 召唤物输出</h4>' +
            row('召唤物百分比', 'summonPct', P.summonPct) + row('基础魔抗减少', 'summonMrReduceBase', P.summonMrReduceBase) +
            row('魔抗减少%', 'summonMrReducePct', P.summonMrReducePct) +
            '<div class="dc-result" id="dcSummon"></div></div>' +

            // 鱼人
            '<div class="dc-block"><h4 style="color:#ffd700;margin:8px 0 4px;">🐟 鱼人输出</h4>' +
            row('鱼人百分比', 'fishPct', P.fishPct) + row('纯粹减少%', 'fishPureReduce', P.fishPureReduce) +
            row('真实伤害加成', 'fishRealBonus', P.fishRealBonus) + row('沙皇倍数', 'fishSha', P.fishSha) +
            '<div class="dc-result" id="dcFish"></div></div>' +

            // 天使
            '<div class="dc-block"><h4 style="color:#ffd700;margin:8px 0 4px;">😇 天使输出</h4>' +
            row('天使百分比', 'angelPct', P.angelPct) + row('真实伤害加成', 'angelRealBonus', P.angelRealBonus) +
            row('沙皇倍数', 'angelSha', P.angelSha) +
            '<div class="dc-result" id="dcAngel"></div></div>' +

            // 法师
            '<div class="dc-block"><h4 style="color:#ffd700;margin:8px 0 4px;">🐢 法师(乌龟/飞机)输出</h4>' +
            row('基础攻击', 'mageBaseAtk', P.mageBaseAtk) + row('基础魔抗减少', 'mageMrReduceBase', P.mageMrReduceBase) +
            row('魔抗减少%', 'mageMrReducePct', P.mageMrReducePct) + row('攻击加成', 'mageAtkBonus', P.mageAtkBonus) +
            row('攻击系数', 'mageCoef', P.mageCoef) + row('伤害加成', 'mageDmgBonus', P.mageDmgBonus) +
            row('熊猫倍数', 'magePanda', P.magePanda) +
            '<div class="dc-result" id="dcMage"></div></div>' +

            '</div>';

        function row(label, key, val) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,0.06);">' +
                '<span>' + label + '</span>' +
                '<input id="dc_' + key + '" data-key="' + key + '" value="' + val + '" ' +
                'style="width:120px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:5px;padding:3px 6px;text-align:right;" ' +
                'oninput="window.__dcCalc&&window.__dcCalc()"></div>';
        }

        function recalc() {
            const boss = BOSS_TABLE[parseInt(document.getElementById('dcBoss').value, 10) || 0];
            const p = {};
            Object.keys(P).forEach(function (k) {
                const el = document.getElementById('dc_' + k);
                p[k] = el ? el.value : P[k];
            });
            const r = compute(p, boss);
            const info = boss.type + ' · 血量 ' + fmtInt(r.boss.blood) + ' / 魔抗 ' + r.boss.mr + ' / 百分比减免 ' + r.boss.pct;
            document.getElementById('dcBossInfo').textContent = info;
            document.getElementById('dcFire').innerHTML = '最终伤害：<b style="color:#ff8;">' + fmtWan(r.fire) + ' 万</b>';
            document.getElementById('dcSummon').innerHTML = '最终伤害：<b style="color:#ff8;">' + fmtWan(r.summon) + ' 万</b>';
            document.getElementById('dcFish').innerHTML = '鱼人：<b style="color:#ff8;">' + fmtWan(r.fish) + ' 万</b> ｜ 沙皇：<b style="color:#ff8;">' + fmtWan(r.fishSha) + ' 万</b>';
            document.getElementById('dcAngel').innerHTML = '最终伤害：<b style="color:#ff8;">' + fmtWan(r.angel) + ' 万</b>';
            document.getElementById('dcMage').innerHTML = '最终伤害：<b style="color:#ff8;">' + fmtWan(r.mage) + ' 万</b>';
        }
        window.__dcCalc = recalc;
        document.getElementById('dcBoss').addEventListener('change', recalc);
        recalc();
    }

    window.renderDamageCalc = renderDamageCalc;
})();
