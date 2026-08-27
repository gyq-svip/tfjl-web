
        let referenceImages = [];
        let isDraggingRef = false;
        let refDragOffset = {x: 0, y: 0};

        // ==================== 活动氪金计算器 ====================
        const ACTIVITY_SKINS = [
            // 480材料档
            { name: '巨灵神·海妖', cost: 480, category: '480' },
            { name: '金银法王·恶匪', cost: 480, category: '480' },
            { name: '电容器', cost: 480, category: '480' },
            { name: '山河社稷号', cost: 480, category: '480' },
            { name: '寂静之月号', cost: 480, category: '480' },
            { name: '浴火凤凰号', cost: 480, category: '480' },
            { name: '神剑山庄号', cost: 480, category: '480' },
            // 640材料档
            { name: '衡山掌门·巫医', cost: 640, category: '640' },
            // 720材料档
            { name: '飞龙在天号', cost: 720, category: '720' },
            // 960材料档
            { name: '东方不败·虎弓', cost: 960, category: '960' },
            { name: '魔教教主·魇', cost: 960, category: '960' },
            { name: '风暴·圣骑', cost: 960, category: '960' },
            { name: '魔化·幽灵', cost: 960, category: '960' },
            // 1280材料档
            { name: '少林掌门·咕咕', cost: 1280, category: '1280' },
        ];
        // 封神杯襄商店皮肤/战车清单（第四话·封神台）
        const BEIXIANG_SKINS = [
            // 480战旗档
            { name: '卷帘大将·斧客', cost: 480, category: '480' },
            { name: '小白龙·剑客', cost: 480, category: '480' },
            { name: '电容器', cost: 480, category: '480' },
            { name: '富甲天下号', cost: 480, category: '480' },
            { name: '银河之光', cost: 480, category: '480' },
            { name: '走马江湖号', cost: 480, category: '480' },
            // 640战旗档
            { name: '泰山掌门·闪', cost: 640, category: '640' },
            { name: '衡山掌门点骨弓', cost: 640, category: '640' },
            { name: '一指名医·死神', cost: 640, category: '640' },
            // 720战旗档
            { name: '狮王争霸号', cost: 720, category: '720' },
            { name: '花果神山号', cost: 720, category: '720' },
            // 960战旗档
            { name: '魔化·火灵', cost: 960, category: '960' },
            // 1280战旗档
            { name: '风暴·小炮', cost: 1280, category: '1280' },
            { name: '风清扬·天使', cost: 1280, category: '1280' },
            // 1600战旗档
            { name: '随机龙珠', cost: 1600, category: '1600' },
        ];
        let calcBeixiangSelected = new Set();

        function toggleBeixiangSkin(name) {
            if (calcBeixiangSelected.has(name)) calcBeixiangSelected.delete(name);
            else calcBeixiangSelected.add(name);
            renderBeixiangSkins();
            updateBeixiangSummary();
        }

        function clearBeixiangSelection() {
            calcBeixiangSelected.clear();
            renderBeixiangSkins();
            updateBeixiangSummary();
        }

        function updateBeixiangSummary() {
            let total = 0;
            calcBeixiangSelected.forEach(name => {
                const s = BEIXIANG_SKINS.find(x => x.name === name);
                if (s) total += s.cost;
            });
            document.getElementById('calcBeixiangTargetTotal').textContent = total;
        }

        function renderBeixiangSkins() {
            const container = document.getElementById('calcBeixiangSkinsList');
            if (!container) return;
            const categories = ['480', '640', '720', '960', '1280', '1600'];
            const catColors = { '480': '#4caf50', '640': '#2196f3', '720': '#9c27b0', '960': '#ff9800', '1280': '#ef4444', '1600': '#ffd700' };
            let html = '';
            categories.forEach(cat => {
                const skins = BEIXIANG_SKINS.filter(s => s.category === cat);
                if (skins.length === 0) return;
                html += `<div style="margin-bottom:8px;">`;
                html += `<div style="color:${catColors[cat]};font-size:0.75rem;font-weight:600;margin-bottom:4px;">${cat}战旗档</div>`;
                html += `<div style="display:flex;flex-wrap:wrap;gap:4px;">`;
                skins.forEach(skin => {
                    const isSelected = calcBeixiangSelected.has(skin.name);
                    const bg = isSelected ? `background:linear-gradient(135deg,${catColors[cat]},#2e7d32);border-color:${catColors[cat]};` : 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);';
                    const check = isSelected ? '<span style="margin-right:3px;">✓</span>' : '';
                    html += `<div onclick="toggleBeixiangSkin('${skin.name}')" style="${bg}border:1px solid;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.75rem;color:${isSelected ? '#fff' : 'rgba(255,255,255,0.8)'};transition:all 0.2s;user-select:none;">${check}${skin.name}<span style="opacity:0.6;margin-left:3px;font-size:0.65rem;">${skin.cost}</span></div>`;
                });
                html += `</div></div>`;
            });
            container.innerHTML = html;
        }

        // 剩余天数精确化：含今天算 (总天数−当前天+1) 整天，再减"今天已过比例"
        function fmtRemain(rem) {
            const totalMin = Math.max(0, Math.round(rem * 1440));
            const d = Math.floor(totalMin / 1440);
            const h = Math.floor((totalMin % 1440) / 60);
            const m = totalMin % 60;
            return d + '天' + h + '小时' + (m > 0 ? m + '分' : '');
        }
        function getBeixiangRemainingDays() {
            const total = parseInt(document.getElementById('calcBeixiangTotalDays')?.value) || 23;
            const cur = parseInt(document.getElementById('calcBeixiangCurrentDay')?.value) || 1;
            const now = new Date();
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const elapsed = (now - dayStart) / 86400000; // 今天已过的天数(0~1)
            let rem = (total - cur + 1) - elapsed; // 含今天，扣掉今天已过
            return rem > 0 ? rem : 0;
        }
        // 对战按"整天"算：每天5局，今天没打完也仍算1整天；今天打完了则今天不计入
        function getBeixiangBattleDays() {
            const days = getBeixiangRemainingDays();
            const todayDone = document.getElementById('calcBeixiangTodayDone')?.checked;
            const floor = Math.floor(days);
            return todayDone ? floor : Math.ceil(days);
        }
        function updateBeixiangRemainDays() {
            const days = getBeixiangRemainingDays();
            const battleDays = getBeixiangBattleDays();
            const span = document.getElementById('calcBeixiangRemainDays');
            if (span) span.textContent = fmtRemain(days);
            const battleSpan = document.getElementById('calcBeixiangBattleDays');
            if (battleSpan) battleSpan.textContent = battleDays;
            // 推算结束日期 = 现在 + 精确剩余天数
            const end = new Date(Date.now() + days * 86400000);
            const show = document.getElementById('calcBeixiangEndDateShow');
            if (show) show.textContent = end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0');
            // 滑块=每天赢几局(0~5)，每日战旗 = 赢×6 + 输×2
            const wins = parseInt(document.getElementById('calcBeixiangWinRate')?.value) || 0;
            const dailyAvg = wins * 6 + (5 - wins) * 2;
            // 参考表按"赢N局·整天"维度刷新（对战按整天算，不用小数天）
            const th = document.getElementById('calcRefDaysTh');
            if (th) th.textContent = battleDays + '天·赢' + wins + '局';
            const dailies = [30, 26, 22, 18, 14]; // 赢5/4/3/2/1局
            for (let i = 0; i < 5; i++) {
                const t = document.getElementById('calcRefT' + i);
                const z = document.getElementById('calcRefZ' + i);
                if (t) t.textContent = dailies[i] * battleDays;
                if (z) z.textContent = dailies[i] * battleDays + 200;
            }
        }
        // 初始化剩余天数展示（默认活动23天·今天第2天 → 剩21天）
        (function initBeixiangRemain(){
            updateBeixiangRemainDays();
        })();

        function doBeixiangCalc() {
            let target = 0;
            calcBeixiangSelected.forEach(name => {
                const s = BEIXIANG_SKINS.find(x => x.name === name);
                if (s) target += s.cost;
            });
            const owned = parseInt(document.getElementById('calcBeixiangOwnedInput').value) || 0;
            const days = getBeixiangRemainingDays();
            const battleDays = getBeixiangBattleDays();
            const wins = parseInt(document.getElementById('calcBeixiangWinRate').value) || 0;
            const buyZhanLing = document.getElementById('calcBeixiangBuyZhanLing').checked;
            const zhanLingFlag = buyZhanLing ? 200 : 0;
            const zhanLingCost = buyZhanLing ? 98 : 0;

            if (target <= 0) {
                alert('请先选择目标皮肤！');
                return;
            }

            // 每日产出：赢×6 + 输×2 战旗（每天打5局，对战按整天算）
            const dailyAvg = wins * 6 + (5 - wins) * 2;
            const battleFree = dailyAvg * battleDays;
            const totalFree = battleFree + owned + zhanLingFlag;
            const need = Math.max(0, target - totalFree);

            let html = '';
            html += `<div style="margin-bottom:12px;">`;
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">目标战旗总数</span><span style="color:#ff6b6b;font-weight:bold;">${target}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">每日对战（5局·赢${wins}局）</span><span style="color:#4ecdc4;">${dailyAvg} 战旗/天</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">⏳ 还能打 ${battleDays} 天白嫖（赢${wins}局/天×${battleDays}天）</span><span style="color:#4ecdc4;">${battleFree}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">已有战旗（已减去）</span><span style="color:#4ecdc4;">${owned}</span></div>`;
            if (buyZhanLing) {
                html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">战令（98元/200战旗）</span><span style="color:#4ecdc4;">200</span></div>`;
            }
            html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">免费合计（白嫖+已有${buyZhanLing ? '+战令' : ''}）</span><span style="color:#4ecdc4;">${totalFree}</span></div>`;

            if (need <= 0) {
                html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">还需氪金战旗</span><span style="color:#4caf50;font-weight:bold;">0（已足够）</span></div>`;
                html += `</div>`;
                html += `<div style="background:linear-gradient(135deg,#4caf50,#2e7d32);border-radius:8px;padding:12px;text-align:center;color:white;margin-top:10px;">`;
                html += `<div style="font-size:1.1rem;font-weight:bold;">🎉 无需额外氪金！</div>`;
                html += `<div style="font-size:0.85rem;margin-top:4px;opacity:0.9;">${buyZhanLing ? '战令已含200战旗，' : ''}按剩余 ${battleDays} 天赢${wins}局白嫖 + 已有已满足目标，溢出 ${totalFree - target} 战旗</div>`;
                html += `</div>`;
            } else {
                html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">还需氪金战旗（目标−白嫖−已有${buyZhanLing ? '−战令' : ''}）</span><span style="color:#ff6b6b;font-weight:bold;">${need}</span></div>`;
                html += `</div>`;

                // 复用现成的动态规划最优购买
                const opt = calcOptimalPurchase(need);
                const overflow = opt.totalMat - need;

                html += `<div style="color:#ff9800;font-weight:600;margin-bottom:8px;font-size:0.9rem;">💰 推荐购买方案</div>`;
                html += `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:10px;">`;
                if (buyZhanLing) {
                    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">战令</span><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">200战旗 <span style="color:#ff6b6b;">98元</span></span></div>`;
                }
                const giftNames = ['30礼包', '128礼包', '328礼包', '648礼包'];
                const giftMats = { '30礼包': 20, '128礼包': 60, '328礼包': 120, '648礼包': 240 };
                giftNames.forEach(name => {
                    const count = opt.plan[name] || 0;
                    if (count > 0) {
                        const mat = count * giftMats[name];
                        const cost = count * (name === '30礼包' ? 30 : name === '128礼包' ? 128 : name === '328礼包' ? 328 : 648);
                        html += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">${name}</span><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">x${count} = ${mat}战旗 <span style="color:#ff6b6b;">${cost}元</span></span></div>`;
                    }
                });
                html += `</div>`;

                const totalCost = opt.cost + zhanLingCost;
                const totalMat = opt.totalMat + zhanLingFlag;
                html += `<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(255,215,0,0.3);border-radius:8px;padding:12px;">`;
                html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">总花费</span><span style="color:#ff6b6b;font-weight:bold;font-size:1.2rem;">${totalCost}元</span></div>`;
                html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">获得战旗</span><span style="color:#4ecdc4;font-weight:bold;">${totalMat}</span></div>`;
                html += `<div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">溢出战旗</span><span style="color:${overflow > 0 ? '#ff9800' : '#4caf50'};font-weight:bold;">${overflow > 0 ? overflow : 0}</span></div>`;
                html += `</div>`;
            }

            if (!buyZhanLing) {
                html += `<div style="margin-top:10px;padding:8px 10px;background:rgba(255,215,0,0.08);border-radius:6px;color:#ffd700;font-size:0.78rem;line-height:1.5;">💡 还没买战令？勾选上方「购买战令」即可计入：花 <b>98元</b> 得 <b>200战旗</b>（自动算进免费合计与总花费）。战令性价比最高，想买就勾上。</div>`;
            }

            document.getElementById('calcBeixiangResultContent').innerHTML = html;
            document.getElementById('calcBeixiangResultArea').style.display = 'block';
        }

        let calcSelectedSkins = new Set();

        function toggleActivityCalcPanel() {
            const panel = document.getElementById('activityCalcPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('计算器');
                switchCalcTopTab('new');
            }
        }

        // 顶层 Tab：新活动 / 旧活动 / Boss减伤 / 龙珠升星
        function switchCalcTopTab(tab) {
            const isNew = tab === 'new', isOld = tab === 'old', isBoss = tab === 'boss', isDragon = tab === 'dragon';
            const body = document.getElementById('calcPanelBody');
            // 始终显示 calcPanelBody（内含顶层 Tab 按钮栏），否则切到 Boss 后切换按钮也被隐藏，无法返回
            if (body) body.style.display = 'block';
            const boss = document.getElementById('calcBossContainer');
            if (boss) boss.style.display = isBoss ? 'block' : 'none';
            document.getElementById('calcNewContainer').style.display = isNew ? 'block' : 'none';
            document.getElementById('calcOldContainer').style.display = isOld ? 'block' : 'none';
            const dragon = document.getElementById('calcDragonContainer');
            if (dragon) dragon.style.display = isDragon ? 'block' : 'none';
            const defs = [['calcTopNew', isNew], ['calcTopOld', isOld], ['calcTopBoss', isBoss], ['calcTopDragon', isDragon]];
            defs.forEach(function (d) {
                const b = document.getElementById(d[0]); if (!b) return;
                if (d[1]) { b.style.background = 'linear-gradient(135deg,#4caf50,#2e7d32)'; b.style.color = 'white'; }
                else { b.style.background = 'rgba(255,255,255,0.1)'; b.style.color = 'rgba(255,255,255,0.7)'; }
            });
            if (isNew) { switchNewCalcTab('target'); }
            else if (isOld) { renderCalcSkins(); updateCalcSummary(); switchOldCalcTab('skins'); }
            else if (isBoss) { if (window.renderBossRed) renderBossRed(); }
            else if (isDragon) { renderDragonStarTable(); }
        }


        // 新活动内部子 Tab：选择目标 / 数据参考 / 氪金计算器
        function switchNewCalcTab(tab) {
            document.getElementById('calcNewTargetPanel').style.display = tab === 'target' ? 'block' : 'none';
            document.getElementById('calcNewRefPanel').style.display = tab === 'ref' ? 'block' : 'none';
            document.getElementById('calcNewCalcPanel').style.display = tab === 'calc' ? 'block' : 'none';
            const map = { target: 'calcNewTabTarget', ref: 'calcNewTabRef', calc: 'calcNewTabCalc' };
            Object.keys(map).forEach(t => {
                const btn = document.getElementById(map[t]);
                if (t === tab) {
                    btn.style.background = 'linear-gradient(135deg,#4caf50,#2e7d32)';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = 'rgba(255,255,255,0.1)';
                    btn.style.color = 'rgba(255,255,255,0.7)';
                }
            });
            if (tab === 'target') renderBeixiangSkins();
        }

        // 旧活动内部子 Tab：选择目标 / 数据参考 / 氪金计算器
        function switchOldCalcTab(tab) {
            document.getElementById('calcSkinsPanel').style.display = tab === 'skins' ? 'block' : 'none';
            document.getElementById('calcDataPanel').style.display = tab === 'data' ? 'block' : 'none';
            document.getElementById('calcCalcPanel').style.display = tab === 'calc' ? 'block' : 'none';
            const map = { skins: 'calcOldTabSkins', data: 'calcOldTabData', calc: 'calcOldTabCalc' };
            Object.keys(map).forEach(t => {
                const btn = document.getElementById(map[t]);
                if (t === tab) {
                    btn.style.background = 'linear-gradient(135deg,#4caf50,#2e7d32)';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = 'rgba(255,255,255,0.1)';
                    btn.style.color = 'rgba(255,255,255,0.7)';
                }
            });
        }

        // 龙珠升星增幅表
        const DRAGON_STAR_DATA = [
            { name: '绿色', color: '#4caf50', values: [0.2, 0.4, 0.6, 0.8, 1], initCost: '—', fullCost: '—', topCalc: 5, attrRange: '6.8~14' },
            { name: '蓝色', color: '#2196f3', values: [0.3, 0.6, 0.9, 1.2, 1.5], initCost: '10~30 元', fullCost: '100~300 元', topCalc: 10, attrRange: '13~23.5' },
            { name: '紫色', color: '#9c27b0', values: [0.6, 1.2, 1.8, 2.4, 3], initCost: '50~200 元', fullCost: '500~2000 元', topCalc: 20, attrRange: '25.4~47' },
            { name: '金色', color: '#ffd700', values: [1.5, 3, 4.5, 6, 7.5], initCost: '300~1000 元', fullCost: '3000~10000 元', topCalc: 30, attrRange: '43.5~97.5' },
            { name: '红色', color: '#ef4444', values: [3, 6, 9, 12, 15], initCost: '800~5000 元', fullCost: '8000~15000 元', topCalc: 50, attrRange: '87~185' }
        ];
        // 5 档品质辅助色（普通→至臻）
        const DRAGON_TIER_COLORS = ['#9e9e9e', '#8bc34a', '#2196f3', '#9c27b0', '#ffd700'];

        function renderDragonStarTable() {
            const c = document.getElementById('calcDragonContainer');
            if (!c) return;
            let html = '';

            // 标题区
            html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(255,107,107,0.15),rgba(255,215,0,0.15));border-radius:10px;border:1px solid rgba(255,215,0,0.25);box-shadow:0 2px 8px rgba(255,107,107,0.1);">
                <div style="font-size:2rem;line-height:1;">🐉</div>
                <div style="flex:1;">
                    <div style="color:#ffd700;font-weight:bold;font-size:1.05rem;line-height:1.3;">龙珠升星增幅表</div>
                    <div style="color:rgba(255,255,255,0.6);font-size:0.7rem;margin-top:4px;">不同品质龙珠的 5 档品质增幅 / 升星成本 / 属性区间</div>
                </div>
            </div>`;

            // 表格容器（横向滚动）
            html += `<div style="overflow-x:auto;background:rgba(0,0,0,0.3);border-radius:10px;padding:5px;border:1px solid rgba(255,255,255,0.08);">`;
            html += `<table style="width:100%;border-collapse:separate;border-spacing:0;font-size:0.78rem;min-width:620px;">`;

            // 表头第一行（colspan 分组）
            html += `<tr>`;
            html += `<th rowspan="2" style="background:linear-gradient(180deg,#ffd70040,#ffd70015);padding:10px 6px;color:#ffd700;font-weight:700;font-size:0.85rem;border-right:2px solid rgba(255,215,0,0.4);border-bottom:2px solid rgba(255,215,0,0.4);">品质</th>`;
            html += `<th colspan="5" style="background:linear-gradient(135deg,#ff6b6b30,#feca5730);padding:8px 4px;color:#fff;font-weight:700;font-size:0.82rem;border-bottom:2px solid rgba(255,107,107,0.4);border-right:1px solid rgba(255,255,255,0.1);">📈 增幅值</th>`;
            html += `<th colspan="2" style="background:linear-gradient(135deg,#4caf5030,#2196f330);padding:8px 4px;color:#fff;font-weight:700;font-size:0.82rem;border-bottom:2px solid rgba(76,175,80,0.4);border-right:1px solid rgba(255,255,255,0.1);">💰 初始成本</th>`;
            html += `<th colspan="2" style="background:linear-gradient(135deg,#9c27b030,#e91e6330);padding:8px 4px;color:#fff;font-weight:700;font-size:0.82rem;border-bottom:2px solid rgba(156,39,176,0.4);border-right:1px solid rgba(255,255,255,0.1);">💎 满星成本</th>`;
            html += `<th rowspan="2" style="background:linear-gradient(180deg,#2196f340,#9c27b040);padding:10px 6px;color:#fff;font-weight:700;font-size:0.72rem;border-bottom:2px solid rgba(33,150,243,0.4);border-right:1px solid rgba(255,255,255,0.1);line-height:1.3;">⚡ 按顶<br>1星级</th>`;
            html += `<th rowspan="2" style="background:linear-gradient(180deg,#ffd70040,#ef444440);padding:10px 6px;color:#fff;font-weight:700;font-size:0.72rem;border-bottom:2px solid rgba(255,215,0,0.4);line-height:1.3;">📊 区间<br>10星级</th>`;
            html += `</tr>`;

            // 表头第二行（子表头）
            html += `<tr>`;
            const tierNames = ['普通', '优良', '稀有', '完美', '至臻'];
            tierNames.forEach(function (name, i) {
                const bg = i === 4 ? 'background:rgba(255,215,0,0.18);' : 'background:rgba(255,255,255,0.05);';
                html += `<th style="${bg}padding:6px 4px;color:${DRAGON_TIER_COLORS[i]};font-weight:${i === 4 ? '700' : '600'};font-size:0.74rem;border-right:1px solid rgba(255,255,255,0.08);">${name}</th>`;
            });
            html += `<th style="background:rgba(76,175,80,0.12);padding:6px 4px;color:rgba(255,255,255,0.8);font-weight:600;font-size:0.72rem;">1星</th>`;
            html += `<th style="background:rgba(76,175,80,0.12);padding:6px 4px;color:rgba(255,255,255,0.8);font-weight:600;font-size:0.72rem;border-right:1px solid rgba(255,255,255,0.1);">5元</th>`;
            html += `<th style="background:rgba(156,39,176,0.12);padding:6px 4px;color:rgba(255,255,255,0.8);font-weight:600;font-size:0.72rem;">10星</th>`;
            html += `<th style="background:rgba(156,39,176,0.12);padding:6px 4px;color:rgba(255,255,255,0.8);font-weight:600;font-size:0.72rem;border-right:1px solid rgba(255,255,255,0.1);">50元</th>`;
            html += `</tr>`;

            // 数据行
            DRAGON_STAR_DATA.forEach(function (row, idx) {
                const rowBg = idx % 2 === 0 ? `${row.color}0d` : 'transparent';
                const hoverBg = `${row.color}26`;
                html += `<tr style="background:${rowBg};transition:background 0.2s;" onmouseover="this.style.background='${hoverBg}';" onmouseout="this.style.background='${rowBg}';">`;

                // 品质列
                html += `<td style="padding:8px 6px;text-align:center;border-right:2px solid ${row.color};border-bottom:1px solid rgba(255,255,255,0.05);background:${row.color}1a;">
                    <div style="display:inline-flex;align-items:center;gap:6px;font-weight:bold;color:${row.color};font-size:0.88rem;padding:3px 6px;border-radius:6px;">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${row.color};box-shadow:0 0 8px ${row.color};"></span>
                        ${row.name}
                    </div>
                </td>`;

                // 5 档品质数值
                row.values.forEach(function (v, i) {
                    const isMax = i === 4;
                    const cellBg = isMax ? `background:linear-gradient(135deg,${row.color}40,${row.color}80);` : '';
                    const border = isMax ? `border:1px solid ${row.color};border-radius:6px;` : '';
                    html += `<td style="padding:7px 4px;text-align:center;color:${isMax ? row.color : '#fff'};font-weight:${isMax ? 'bold' : '600'};font-size:${isMax ? '0.95' : '0.84'}rem;${cellBg}${border}border-right:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.05);">
                        ${v}
                    </td>`;
                });

                // 初始成本（合并 1星 + 5级）
                html += `<td colspan="2" style="padding:8px 4px;text-align:center;color:#ffd700;font-weight:600;font-size:0.8rem;border-right:1px solid rgba(255,255,255,0.1);border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(255,215,0,0.06);">
                    ${row.initCost}
                </td>`;

                // 满星成本（合并 10星 + 50级）
                html += `<td colspan="2" style="padding:8px 4px;text-align:center;color:#ffd700;font-weight:600;font-size:0.8rem;border-right:1px solid rgba(255,255,255,0.1);border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(255,215,0,0.09);">
                    ${row.fullCost}
                </td>`;

                // 1星级标识
                html += `<td style="padding:8px 4px;text-align:center;color:${row.color};font-weight:bold;font-size:1rem;border-right:1px solid rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.04);">
                    ${row.topCalc}
                </td>`;

                // 10星级区间
                html += `<td style="padding:8px 4px;text-align:center;color:#fff;font-weight:600;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.04);">
                    ${row.attrRange}
                </td>`;

                html += `</tr>`;
            });

            html += `</table></div>`;

            // 底部说明卡片
            html += `<div style="margin-top:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,107,107,0.08));border-left:3px solid #ffd700;border-radius:8px;color:rgba(255,255,255,0.7);font-size:0.72rem;line-height:1.85;">
                <div style="color:#ffd700;font-weight:bold;font-size:0.8rem;margin-bottom:6px;">📖 表格说明</div>
                · <b>增幅值</b>：5 档品质（普通→至臻）对应数值，<span style="color:#ffd700;">至臻为该品质顶档</span><br>
                · <b>初始成本</b>：升到 <span style="color:#4caf50;">1星 / 5元</span> 所需资源区间<br>
                · <b>满星成本</b>：升到 <span style="color:#9c27b0;">10星 / 50元</span> 所需资源区间<br>
                · <b>按顶计算</b>：1 星级状态下按顶档（至臻）计算的属性标识<br>
                · <b>属性区间</b>：10 星级标识下的属性浮动区间（升星随机性）<br>
                <span style="display:inline-block;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);width:100%;">🧑‍🏫 数据由 <b style="color:#ffd700;">大佬：bi锋</b> 提供，仅供计算参考</span>
            </div>`;

            c.innerHTML = html;
        }

        function renderCalcSkins() {
            const container = document.getElementById('calcSkinsList');
            const categories = ['480', '640', '720', '960', '1280'];
            const catColors = { '480': '#4caf50', '640': '#2196f3', '720': '#9c27b0', '960': '#ff9800', '1280': '#ef4444' };
            let html = '';
            categories.forEach(cat => {
                const skins = ACTIVITY_SKINS.filter(s => s.category === cat);
                if (skins.length === 0) return;
                html += `<div style="margin-bottom:12px;">`;
                html += `<div style="color:${catColors[cat]};font-size:0.8rem;font-weight:600;margin-bottom:6px;">${cat}材料档</div>`;
                html += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;
                skins.forEach(skin => {
                    const isSelected = calcSelectedSkins.has(skin.name);
                    const bg = isSelected ? `background:linear-gradient(135deg,${catColors[cat]},#2e7d32);border-color:${catColors[cat]};` : 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);';
                    const check = isSelected ? '<span style="margin-right:4px;">✓</span>' : '';
                    html += `<div onclick="toggleCalcSkin('${skin.name}')" style="${bg}border:1px solid;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.8rem;color:${isSelected ? '#fff' : 'rgba(255,255,255,0.8)'};transition:all 0.2s;user-select:none;">${check}${skin.name}<span style="opacity:0.7;margin-left:4px;font-size:0.7rem;">${skin.cost}</span></div>`;
                });
                html += `</div></div>`;
            });
            container.innerHTML = html;
        }

        function toggleCalcSkin(name) {
            if (calcSelectedSkins.has(name)) {
                calcSelectedSkins.delete(name);
            } else {
                calcSelectedSkins.add(name);
            }
            renderCalcSkins();
            updateCalcSummary();
        }

        function clearCalcSelection() {
            calcSelectedSkins.clear();
            renderCalcSkins();
            updateCalcSummary();
        }

        function updateCalcSummary() {
            let total = 0;
            calcSelectedSkins.forEach(name => {
                const skin = ACTIVITY_SKINS.find(s => s.name === name);
                if (skin) total += skin.cost;
            });
            document.getElementById('calcTargetTotal').textContent = total;
            document.getElementById('calcSelectedCount').textContent = calcSelectedSkins.size;
            // 同步到计算面板
            document.getElementById('calcTargetInput').value = total;
        }

        function updateCalcTargetFromInput() {
            const val = parseInt(document.getElementById('calcTargetInput').value) || 0;
            document.getElementById('calcTargetTotal').textContent = val;
        }

        function focusCalcInputs() {
            setTimeout(() => {
                document.getElementById('calcOwnedInput').focus();
            }, 100);
        }

        // 动态规划计算最优购买方案
        function calcOptimalPurchase(need) {
            // 礼包定义（考虑购买上限）
            const gifts = [
                { name: '30礼包', cost: 30, mat: 20, max: 63 },
                { name: '128礼包', cost: 128, mat: 60, max: 63 },
                { name: '328礼包', cost: 328, mat: 120, max: 63 },
                { name: '648礼包', cost: 648, mat: 240, max: 999 },
            ];

            let bestCost = Infinity;
            let bestPlan = null;
            let bestTotalMat = 0;

            // 枚举30/128/328的数量，648用来补余数（剪枝优化）
            const max30 = Math.min(63, Math.ceil(need / 20));
            for (let c30 = max30; c30 >= 0; c30--) {
                const mat30 = c30 * 20;
                const cost30 = c30 * 30;
                if (cost30 >= bestCost) continue;

                const max128 = Math.min(63, Math.ceil(Math.max(0, need - mat30) / 60));
                for (let c128 = max128; c128 >= 0; c128--) {
                    const mat128 = c128 * 60;
                    const cost128 = c128 * 128;
                    if (cost30 + cost128 >= bestCost) continue;

                    const max328 = Math.min(63, Math.ceil(Math.max(0, need - mat30 - mat128) / 120));
                    for (let c328 = max328; c328 >= 0; c328--) {
                        const mat328 = c328 * 120;
                        const cost328 = c328 * 328;
                        if (cost30 + cost128 + cost328 >= bestCost) continue;

                        const total = mat30 + mat128 + mat328;
                        let cost, c648, planTotal;
                        if (total >= need) {
                            cost = cost30 + cost128 + cost328;
                            c648 = 0;
                            planTotal = total;
                        } else {
                            const remain = need - total;
                            c648 = Math.ceil(remain / 240);
                            cost = cost30 + cost128 + cost328 + c648 * 648;
                            planTotal = total + c648 * 240;
                        }

                        if (cost < bestCost) {
                            bestCost = cost;
                            bestPlan = { '30礼包': c30, '128礼包': c128, '328礼包': c328, '648礼包': c648 };
                            bestTotalMat = planTotal;
                        }
                    }
                }
            }

            return { cost: bestCost, plan: bestPlan, totalMat: bestTotalMat };
        }

        function doActivityCalc() {
            const target = parseInt(document.getElementById('calcTargetInput').value) || 0;
            const owned = parseInt(document.getElementById('calcOwnedInput').value) || 0;
            const days = parseInt(document.getElementById('calcDaysInput').value) || 21;
            const daily = parseInt(document.getElementById('calcDifficultySelect').value) || 32;
            const buyZhanLing = document.getElementById('calcBuyZhanLing').checked;

            if (target <= 0) {
                alert('请先选择目标皮肤或输入目标材料数！');
                return;
            }

            // 计算免费产出
            const freeMat = daily * days + owned;
            const zhanLingMat = buyZhanLing ? 200 : 0;
            const zhanLingCost = buyZhanLing ? 98 : 0;
            const totalFree = freeMat + zhanLingMat;

            // 计算还需
            const need = Math.max(0, target - totalFree);

            let resultHtml = '';

            // 基本信息
            resultHtml += `<div style="margin-bottom:12px;">`;
            resultHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">目标材料总数</span><span style="color:#ffd700;font-weight:bold;">${target}</span></div>`;
            resultHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">免费获得（${daily}/天×${days}天${buyZhanLing ? '+战令200' : ''}${owned > 0 ? '+已有' + owned : ''}）</span><span style="color:#4ecdc4;">${totalFree}</span></div>`;
            if (need <= 0) {
                resultHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">还需材料</span><span style="color:#4caf50;font-weight:bold;">0（已足够）</span></div>`;
                resultHtml += `</div>`;
                resultHtml += `<div style="background:linear-gradient(135deg,#4caf50,#2e7d32);border-radius:8px;padding:12px;text-align:center;color:white;margin-top:10px;">`;
                resultHtml += `<div style="font-size:1.1rem;font-weight:bold;">🎉 无需额外氪金！</div>`;
                resultHtml += `<div style="font-size:0.85rem;margin-top:4px;opacity:0.9;">免费产出已满足目标，溢出 ${totalFree - target} 材料</div>`;
                if (buyZhanLing) resultHtml += `<div style="font-size:0.8rem;margin-top:4px;opacity:0.8;">战令花费：98元</div>`;
                resultHtml += `</div>`;
            } else {
                resultHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.6);font-size:0.8rem;">还需材料</span><span style="color:#ff6b6b;font-weight:bold;">${need}</span></div>`;
                resultHtml += `</div>`;

                // 计算最优方案
                const opt = calcOptimalPurchase(need);
                const totalCost = zhanLingCost + opt.cost;
                const overflow = opt.totalMat - need;

                // 推荐购买方案
                resultHtml += `<div style="color:#ff9800;font-weight:600;margin-bottom:8px;font-size:0.9rem;">💰 推荐购买方案</div>`;
                resultHtml += `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:10px;">`;
                if (buyZhanLing) {
                    resultHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:#ffd700;font-size:0.85rem;">战令</span><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">x1 = 200材料 <span style="color:#ff6b6b;">98元</span></span></div>`;
                }
                const giftNames = ['30礼包', '128礼包', '328礼包', '648礼包'];
                const giftMats = { '30礼包': 20, '128礼包': 60, '328礼包': 120, '648礼包': 240 };
                giftNames.forEach(name => {
                    const count = opt.plan[name] || 0;
                    if (count > 0) {
                        const mat = count * giftMats[name];
                        const cost = count * (name === '30礼包' ? 30 : name === '128礼包' ? 128 : name === '328礼包' ? 328 : 648);
                        resultHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">${name}</span><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;">x${count} = ${mat}材料 <span style="color:#ff6b6b;">${cost}元</span></span></div>`;
                    }
                });
                resultHtml += `</div>`;

                // 汇总
                resultHtml += `<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(255,215,0,0.3);border-radius:8px;padding:12px;">`;
                resultHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">总花费</span><span style="color:#ff6b6b;font-weight:bold;font-size:1.2rem;">${totalCost}元</span></div>`;
                resultHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">获得材料</span><span style="color:#4ecdc4;font-weight:bold;">${opt.totalMat + zhanLingMat}</span></div>`;
                resultHtml += `<div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.7);font-size:0.85rem;">溢出材料</span><span style="color:${overflow > 0 ? '#ff9800' : '#4caf50'};font-weight:bold;">${overflow > 0 ? overflow : 0}</span></div>`;
                resultHtml += `</div>`;
            }

            document.getElementById('calcResultContent').innerHTML = resultHtml;
            document.getElementById('calcResultArea').style.display = 'block';
        }

        function toggleReferencePanel() {
            const panel = document.getElementById('referencePanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('参考图片');
                loadReferenceImages();
            }
        }

        function loadReferenceImages() {
            // 不再从localStorage加载，referenceImages由loadReferenceImagesFromProject设置
            // 只渲染当前内存中的图片
            renderReferenceImages();
        }

        function renderReferenceImages() {
            const grid = document.getElementById('referenceImagesGrid');
            if (referenceImages.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.5);padding:20px;">暂无参考图片<br><span style="font-size:0.8rem;">点击上方按钮上传</span></div>';
                return;
            }
            grid.innerHTML = referenceImages.map((img, i) => `
                <div style="position:relative;background:rgba(0,0,0,0.3);border-radius:8px;overflow:hidden;cursor:pointer;"
                     onclick="openRefViewer(${i})">
                    <img src="${img.data}" style="width:100%;height:180px;object-fit:cover;display:block;"
                         title="点击查看大图">
                    <button onclick="deleteRefImage(${i});event.stopPropagation();" style="position:absolute;top:5px;right:5px;background:rgba(244,67,54,0.9);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:0.8rem;">×</button>
                </div>
            `).join('');
        }

        function openRefViewer(index) {
            if (!referenceImages[index]) return;
            var viewer = document.getElementById('refImageViewer');
            var img = document.getElementById('refViewerImg');
            var title = document.getElementById('refViewerTitle');
            img.src = referenceImages[index].data;
            title.textContent = referenceImages[index].name || '';
            viewer.style.display = 'block';
            // 滚动到查看器位置
            viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function closeRefViewer() {
            document.getElementById('refImageViewer').style.display = 'none';
        }

        function handleRefImageUpload(input) {
            if (!input.files || input.files.length === 0) return;
            Array.from(input.files).forEach(file => {
                if (!file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    referenceImages.push({name: file.name, data: e.target.result, projectName: currentProjectName});
                    renderReferenceImages();
                    autoSaveProject();
                };
                reader.readAsDataURL(file);
            });
            input.value = '';
        }

        // 参考图片拖拽支持
        function handleRefImageDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            event.currentTarget.style.borderColor = '#9c27b0';
            event.currentTarget.style.background = 'rgba(156,39,176,0.15)';
        }

        function handleRefImageDragLeave(event) {
            event.currentTarget.style.borderColor = 'rgba(156,39,176,0.5)';
            event.currentTarget.style.background = 'rgba(30,30,60,0.95)';
        }

        function handleRefImageDrop(event) {
            event.preventDefault();
            handleRefImageDragLeave(event);

            const files = event.dataTransfer.files;
            if (!files || files.length === 0) return;

            let added = 0;
            Array.from(files).forEach(file => {
                if (!file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    referenceImages.push({name: file.name, data: e.target.result, projectName: currentProjectName});
                    renderReferenceImages();
                    autoSaveProject();
                    added++;
                };
                reader.readAsDataURL(file);
            });
        }

        // 粘贴上传图片功能
        function handleRefImagePaste(event) {
            // 只在参考图片面板打开时生效
            const panel = document.getElementById('referencePanel');
            if (!panel || panel.style.display === 'none') return;
            // 如果焦点在输入框/文本域中且不是参考面板内的，不拦截
            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                // 允许参考面板内的输入框粘贴（这里没有输入框，所以直接return）
                return;
            }

            const items = event.clipboardData?.items;
            if (!items) return;

            let pasted = false;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (!file) continue;

                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const now = new Date();
                        const ts = now.getFullYear() +
                            String(now.getMonth() + 1).padStart(2, '0') +
                            String(now.getDate()).padStart(2, '0') + '_' +
                            String(now.getHours()).padStart(2, '0') +
                            String(now.getMinutes()).padStart(2, '0') +
                            String(now.getSeconds()).padStart(2, '0');
                        referenceImages.push({name: `粘贴图片_${ts}.png`, data: e.target.result, projectName: currentProjectName});
                        renderReferenceImages();
                        autoSaveProject();
                    };
                    reader.readAsDataURL(file);
                    pasted = true;
                }
            }

            if (pasted) {
                event.preventDefault();
            }
        }

        // 注册全局粘贴监听（仅参考图片面板打开时生效）
        document.addEventListener('paste', handleRefImagePaste);

        function deleteRefImage(index) {
            if (confirm('确定删除这张参考图片？')) {
                // 只删除当前项目的图片
                referenceImages.splice(index, 1);
                renderReferenceImages();
                // 自动保存到IndexedDB
                autoSaveProject();
            }
        }

        // ==================== 聊天室+拍卖系统 ====================
        const CHAT_GIST_FILE = 'chatrooms.json';
        const IMAGES_GIST_FILE = 'images.json';
        let currentChatRoom = null;
        let currentChatNick = '';
        let chatRefreshInterval = null;
        let chatRoomData = null;
        let auctionCounterInterval = null;
        let imagesData = null;

        // 拍卖播报队列（持久化到Gist，所有设备共享）
        let auctionBroadcastQueue = []; // { id, text, roomId, addedAt }

        // 添加拍卖播报消息（同时保存到Gist持久化）
        async function addAuctionBroadcast(text, roomId) {
            const broadcast = {
                id: 'ab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                text: text,
                roomId: roomId || '',
                addedAt: Date.now()
            };
            auctionBroadcastQueue.push(broadcast);
            updateMarqueeWithBroadcast();
            // 异步保存到Gist（不阻塞UI）
            saveAuctionBroadcastsToGist().catch(err => {
                console.warn('拍卖快讯保存到Gist失败:', err);
            });
        }

        // 从Gist加载拍卖快讯
        async function fetchAuctionBroadcastsFromGist() {
            try {
                const token = getGistToken();
                const response = await fetch(getMessagesGistUrl(), {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
                    }
                });
                if (!response.ok) return [];
                const data = await response.json();
                const content = data.files && data.files['auction_broadcasts.json'] && data.files['auction_broadcasts.json'].content;
                if (!content || content.trim() === '') return [];
                const broadcasts = JSON.parse(content);
                if (!Array.isArray(broadcasts)) return [];
                return broadcasts;
            } catch (e) {
                console.warn('从Gist加载拍卖快讯失败:', e);
                return [];
            }
        }

        // 保存拍卖快讯到Gist
        async function saveAuctionBroadcastsToGist() {
            const token = getGistToken();
            if (!token) {
                console.warn('未设置Gist Token，拍卖快讯仅保存在本地');
                return;
            }
            const content = JSON.stringify(auctionBroadcastQueue, null, 2);
            const response = await fetch(getMessagesGistUrl(), {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                },
                body: JSON.stringify({
                    files: {
                        'auction_broadcasts.json': {
                            content: content
                        }
                    }
                })
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `保存拍卖快讯失败 HTTP ${response.status}`);
            }
        }

        // 管理员删除拍卖快讯
        async function adminDeleteAuctionBroadcast(broadcastId) {
            if (!confirm('确定要删除这条拍卖快讯吗？（不会影响拍卖行房间数据）')) return;
            try {
                // 从Gist重新读取最新数据
                const latestBroadcasts = await fetchAuctionBroadcastsFromGist();
                const index = latestBroadcasts.findIndex(b => b.id === broadcastId);
                if (index === -1) {
                    // 也尝试从内存队列删除
                    auctionBroadcastQueue = auctionBroadcastQueue.filter(b => b.id !== broadcastId);
                    updateMarqueeWithBroadcast();
                    renderAdminAuctionBroadcastList(auctionBroadcastQueue);
                    showAdminStatus('快讯已从本地删除', 'success');
                    return;
                }
                latestBroadcasts.splice(index, 1);
                // 更新内存队列
                auctionBroadcastQueue = latestBroadcasts;
                updateMarqueeWithBroadcast();
                // 保存到Gist
                const token = getGistToken();
                if (!token) throw new Error('未设置GitHub Token');
                const content = JSON.stringify(latestBroadcasts, null, 2);
                const response = await fetch(getMessagesGistUrl(), {
                    method: 'PATCH',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        files: {
                            'auction_broadcasts.json': {
                                content: content
                            }
                        }
                    })
                });
                if (!response.ok) throw new Error('保存失败');
                showAdminStatus('拍卖快讯已删除', 'success');
                // 刷新管理列表和公告弹窗
                adminRefreshNews();
                renderAdminAuctionBroadcastList(latestBroadcasts);
            } catch (error) {
                console.error('删除拍卖快讯失败:', error);
                showAdminStatus('删除失败: ' + error.message, 'error');
            }
        }

        // 拍卖快讯公告开关（全局，存索引文件）
        let _globalBroadcastEnabled = false; // 默认关闭：只有管理员手动开启后才全网显示

        async function toggleAuctionBroadcastInMarquee() {
            const newVal = !_globalBroadcastEnabled;
            try {
                const token = getGistToken();
                if (!token) { alert('❌ 需要管理员Token才能修改全局设置'); return; }

                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const response = await fetch(indexUrl, {
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` }
                });
                if (!response.ok) throw new Error('获取索引失败');

                const data = await response.json();
                const index = JSON.parse(data.files['room_index.json'].content);
                index.broadcastEnabled = newVal;

                const patchResp = await fetch(indexUrl, {
                    method: 'PATCH',
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': `token ${token}` },
                    body: JSON.stringify({ files: { 'room_index.json': { content: JSON.stringify(index, null, 2) } } })
                });
                if (!patchResp.ok) throw new Error('更新失败');

                _globalBroadcastEnabled = newVal;
                updateBroadcastToggleStatus();
                updateMarqueeWithBroadcast();
                alert(newVal ? '✅ 拍卖快讯公告已全局开启\n所有用户公告栏将显示拍卖快讯' : '❌ 拍卖快讯公告已全局关闭\n所有用户公告栏只显示普通公告');
            } catch (e) {
                alert('❌ 操作失败: ' + e.message);
            }
        }

        // 供功能开关面板调用：设置拍卖快讯全开关的具体值（而非 toggle）
        async function setAuctionBroadcastEnabled(v) {
            try {
                const token = getGistToken();
                if (!token) { alert('❌ 需要管理员Token才能修改全局设置'); return; }
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const response = await fetch(indexUrl, { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` } });
                if (!response.ok) throw new Error('获取索引失败');
                const data = await response.json();
                const index = JSON.parse(data.files['room_index.json'].content);
                index.broadcastEnabled = !!v;
                const patchResp = await fetch(indexUrl, {
                    method: 'PATCH',
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': `token ${token}` },
                    body: JSON.stringify({ files: { 'room_index.json': { content: JSON.stringify(index, null, 2) } } })
                });
                if (!patchResp.ok) throw new Error('更新失败');
                _globalBroadcastEnabled = !!v;
                updateBroadcastToggleStatus();
                updateMarqueeWithBroadcast();
            } catch (e) {
                alert('❌ 操作失败: ' + e.message);
            }
        }
        window.setAuctionBroadcastEnabled = setAuctionBroadcastEnabled;

        function updateBroadcastToggleStatus() {
            const btn = document.getElementById('broadcastToggleBtn');
            if (btn) {
                btn.textContent = _globalBroadcastEnabled ? '已开启' : '已关闭';
                btn.style.background = _globalBroadcastEnabled ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)';
                btn.style.color = _globalBroadcastEnabled ? '#4ade80' : '#ef4444';
            }
        }

        // 从索引文件读取全局开关状态
        async function loadGlobalBroadcastStatus() {
            try {
                const token = getGistToken();
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const response = await fetch(indexUrl, {
                    headers: { 'Accept': 'application/vnd.github.v3+json', ...(token && { 'Authorization': `token ${token}` }) }
                });
                if (!response.ok) return;

                const data = await response.json();
                if (data.files && data.files['room_index.json'] && data.files['room_index.json'].content) {
                    const index = JSON.parse(data.files['room_index.json'].content);
                    _globalBroadcastEnabled = index.broadcastEnabled === true;
                }
            } catch (e) {
                console.warn('读取全局开关状态失败:', e);
            }
        }

        // 更新公告栏显示（拍卖播报优先）
        function updateMarqueeWithBroadcast() {
            const marqueeEl = document.getElementById('newsMarquee');
            if (!marqueeEl) return;

            // 检查全局拍卖快讯公告开关 + 全网拍卖快讯开关
            if (_globalBroadcastEnabled && currentConfig.auctionNews !== false && auctionBroadcastQueue.length > 0) {
                // 有拍卖播报，显示播报内容
                const broadcastTexts = auctionBroadcastQueue.map(item => item.text).join('　　◆　　');
                marqueeEl.textContent = '📢 拍卖快讯：' + broadcastTexts;
                marqueeEl.style.color = '#ff6b6b';
                marqueeEl.style.textShadow = '0 0 10px #ff6b6b, 0 0 20px #ff6b6b';
                marqueeEl.style.paddingLeft = '100%';
                restartMarquee(true); // 拍卖播报长度变化，重置动画并恒定速度
            } else {
                // 没有拍卖播报，恢复普通公告
                const normalText = getNewsMarqueeText();
                marqueeEl.textContent = normalText;
                marqueeEl.style.color = '#ffd700';
                marqueeEl.style.textShadow = '0 0 10px #ffd700, 0 0 20px #ffd700';
                marqueeEl.style.paddingLeft = '100%';
                restartMarquee(true); // 普通公告长度变化，重置动画并恒定速度
            }
        }

        function openChatRoomEntry() {
            const modal = document.getElementById('chatRoomEntryModal');
            modal.style.display = 'flex';
            const savedNick = localStorage.getItem('TFJL_UserName') || '';
            const hasSetNick = localStorage.getItem('TFJL_HasSetNick') === 'true';
            const nickInput = document.getElementById('chatRoomNickInput');
            const nickEditBtn = document.getElementById('nickEditBtn');
            nickInput.value = savedNick;
            
            if (hasSetNick && savedNick) {
                // 已设置昵称
                nickInput.readOnly = true;
                nickEditBtn.textContent = '已设置';
                nickEditBtn.disabled = true;
                nickEditBtn.style.opacity = '0.5';
            } else if (savedNick) {
                // 有昵称但未标记为已设置
                nickInput.readOnly = true;
                nickEditBtn.textContent = '设置';
            } else {
                // 没有昵称
                nickInput.readOnly = false;
                nickEditBtn.textContent = '保存';
            }
            
            const savedRoom = localStorage.getItem('TFJL_ChatRoom') || 'TF001';
            document.getElementById('chatRoomIdInput').value = savedRoom;
            document.getElementById('chatRoomIdInput').focus();
        }

        function toggleNickEdit() {
            const nickInput = document.getElementById('chatRoomNickInput');
            const nickEditBtn = document.getElementById('nickEditBtn');
            const hasSetNick = localStorage.getItem('TFJL_HasSetNick') === 'true';
            const currentNick = localStorage.getItem('TFJL_UserName');
            
            if (hasSetNick && currentNick) {
                // 已经设置过昵称，不能再修改
                alert('抱歉，昵称只能设置一次！\n如需修改请联系管理员。');
                return;
            }
            
            if (nickInput.readOnly) {
                // 进入编辑模式
                if (currentNick) {
                    const confirm = window.confirm('确定要设置昵称吗？设置后无法自行修改！');
                    if (!confirm) return;
                }
                nickInput.readOnly = false;
                nickEditBtn.textContent = '保存';
                nickInput.focus();
            } else {
                // 保存昵称
                const newNick = nickInput.value.trim();
                if (!newNick) {
                    alert('昵称不能为空！');
                    return;
                }
                localStorage.setItem('TFJL_UserName', newNick);
                localStorage.setItem('TFJL_HasSetNick', 'true'); // 标记已设置
                persistNicknameToDisk(); // 同步写入本地磁盘（重装不丢）
                nickInput.readOnly = true;
                nickEditBtn.textContent = '已设置';
                nickEditBtn.disabled = true;
                nickEditBtn.style.opacity = '0.5';
                alert('昵称已设置成功！以后无法自行修改。');
            }
        }

        function closeChatRoomEntry() {
            document.getElementById('chatRoomEntryModal').style.display = 'none';
        }

        // ========== 登录状态本地磁盘持久化（独立于 webview 存储，重启/更新/清缓存都不丢） ==========
        // 用户初衷：安装后登录一次，之后（重启 App / 自动更新 / webview 缓存被清）都不再弹密码门。
        // webview localStorage 在某些更新/重开场景下会被清空，所以把"已登录"标记落地到 D 盘文件。
        const AUTH_DISK_PATH = 'D:\\withfriends\\塔防精灵助手数据\\data\\auth_state.json';

        // 写登录状态到磁盘（仅桌面端；网页版无 Tauri 时忽略）
        function saveAuthToDisk(loggedIn) {
            const T = window.__TAURI__ || window.__TAURI_INTERNALS__;
            if (!T) return;
            try {
                _tauriInvoke('write_text_file', {
                    filePath: AUTH_DISK_PATH,
                    content: JSON.stringify({ loggedIn: !!loggedIn, at: new Date().toISOString() })
                });
            } catch (e) {}
        }
        // 从磁盘读登录状态（异步；丢失/异常时回退 false 不阻塞）
        async function isLoggedInFromDisk() {
            const T = window.__TAURI__ || window.__TAURI_INTERNALS__;
            if (!T) return false;
            try {
                const txt = await _tauriInvoke('read_text_file_auto', { filePath: AUTH_DISK_PATH });
                if (txt) { const o = JSON.parse(txt); return !!(o && o.loggedIn); }
            } catch (e) {}
            return false;
        }
        // 清磁盘登录标记（退出登录时调用）
        function clearAuthOnDisk() {
            const T = window.__TAURI__ || window.__TAURI_INTERNALS__;
            if (!T) return;
            try { _tauriInvoke('delete_file', { filePath: AUTH_DISK_PATH }); } catch (e) {}
        }

        // ========== 昵称本地磁盘持久化（独立于安装目录，重启/更新/卸载重装都不丢） ==========
        const NICK_DISK_PATH = 'D:\\withfriends\\塔防精灵助手数据\\data\\nickname.json';

        async function _tauriInvoke(name, args) {
            const fn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
            if (!fn) return null;
            try { return await fn(name, args); } catch (e) { return null; }
        }

        // 把当前昵称状态写入本地磁盘（网页版无 Tauri 时仅用 localStorage，不写盘）
        async function persistNicknameToDisk() {
            if (!(window.__TAURI__ || window.__TAURI_INTERNALS__)) return;
            const nick = localStorage.getItem('TFJL_UserName') || '';
            const hasSet = localStorage.getItem('TFJL_HasSetNick') === 'true';
            try {
                if (!nick) {
                    await _tauriInvoke('delete_file', { filePath: NICK_DISK_PATH }); // 昵称被清空则一并删除磁盘记录
                    return;
                }
                await _tauriInvoke('write_text_file', {
                    filePath: NICK_DISK_PATH,
                    content: JSON.stringify({ nick: nick, hasSet: hasSet, savedAt: new Date().toISOString() })
                });
            } catch (e) {}
        }

        // 加载时从本地磁盘读回昵称，同步进 localStorage（使所有读取逻辑默认加载到已保存昵称）
        async function restoreNicknameFromDisk() {
            if (!(window.__TAURI__ || window.__TAURI_INTERNALS__)) return;
            try {
                const txt = await _tauriInvoke('read_text_file_auto', { filePath: NICK_DISK_PATH });
                if (txt) {
                    const obj = JSON.parse(txt);
                    if (obj && obj.nick) {
                        localStorage.setItem('TFJL_UserName', obj.nick);
                        localStorage.setItem('TFJL_HasSetNick', obj.hasSet ? 'true' : 'false');
                    }
                } else {
                    // 磁盘无记录：若 localStorage 已有昵称，迁移写入磁盘（兼容旧版仅存 localStorage 的用户）
                    if (localStorage.getItem('TFJL_UserName')) await persistNicknameToDisk();
                }
            } catch (e) {}
        }

        // ========== 昵称设置（全局唯一，仅用于发言/分享脚本展示） ==========
        async function getUsedNicks() {
            try {
                const token = getGistToken();
                const r = await fetch('https://api.github.com/gists/' + GIST_ID, {
                    headers: { 'Accept': 'application/vnd.github.v3+json', ...(token && { 'Authorization': 'token ' + token }) }
                });
                if (!r.ok) return [];
                const d = await r.json();
                const c = d.files && d.files['room_index.json'] && d.files['room_index.json'].content;
                if (!c) return [];
                const index = JSON.parse(c);
                return index.usedNicks || [];
            } catch (e) { return []; }
        }

        async function saveUsedNicks(usedNicks) {
            const token = getGistToken();
            if (!token) return false;
            try {
                const r = await fetch('https://api.github.com/gists/' + GIST_ID, {
                    headers: { 'Accept': 'application/vnd.github.v3+json', ...(token && { 'Authorization': 'token ' + token }) }
                });
                if (!r.ok) return false;
                const d = await r.json();
                const c = d.files && d.files['room_index.json'] && d.files['room_index.json'].content;
                const index = c ? JSON.parse(c) : {};
                index.usedNicks = usedNicks;
                const pr = await fetch('https://api.github.com/gists/' + GIST_ID, {
                    method: 'PATCH',
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + token },
                    body: JSON.stringify({ files: { 'room_index.json': { content: JSON.stringify(index, null, 2) } } })
                });
                return pr.ok;
            } catch (e) { return false; }
        }

        // 确保已设置昵称：已设置直接返回；未设置弹窗强制设置（全局唯一）。取消返回 null。
        // force=true：真·必须（隐藏取消按钮，不设进不去），用于启动强制设置门槛。
        function ensureNickname(force) {
            return new Promise((resolve) => {
                const existing = localStorage.getItem('TFJL_UserName');
                const hasSet = localStorage.getItem('TFJL_HasSetNick') === 'true';
                // 视为"已设"的条件：hasSet 标记为真 且 昵称非空 且 不是兜底字面量「匿名用户」
                const reallySet = hasSet && existing && existing.trim() && existing.trim() !== '匿名用户';
                if (reallySet) { resolve(existing); return; }

                const modal = document.getElementById('nickSetupModal');
                const input = document.getElementById('nickSetupInput');
                const errEl = document.getElementById('nickSetupErr');
                const saveBtn = document.getElementById('nickSetupSave');
                const cancelBtn = document.getElementById('nickSetupCancel');
                input.value = '';
                errEl.textContent = '';
                modal.style.display = 'flex';
                setTimeout(() => input.focus(), 50);
                // force 模式：真·必须（隐藏取消、禁用遮罩关闭/ESC，不设进不去）
                if (force) {
                    cancelBtn.style.display = 'none';
                    modal.onclick = (e) => { if (e.target === modal) { /* 强制模式禁止点遮罩关闭 */ } };
                    document.addEventListener('keydown', forceEscBlocker, true);
                }
                function forceEscBlocker(e) { if (e.key === 'Escape') e.stopPropagation(); }

                const cleanup = () => {
                    modal.style.display = 'none';
                    modal.onclick = null;
                    document.removeEventListener('keydown', forceEscBlocker, true);
                    saveBtn.onclick = null;
                    cancelBtn.onclick = null;
                    input.onkeydown = null;
                };

                cancelBtn.onclick = force ? () => {} : () => { cleanup(); resolve(null); };
                input.onkeydown = (e) => { if (e.key === 'Enter') saveBtn.click(); };
                saveBtn.onclick = async () => {
                    const v = input.value.trim();
                    if (v.length < 2) { errEl.textContent = '昵称至少 2 个字'; return; }
                    const used = await getUsedNicks();
                    if (used.includes(v)) { errEl.textContent = '昵称 "' + v + '" 已被使用，请换一个'; return; }
                    localStorage.setItem('TFJL_UserName', v);
                    localStorage.setItem('TFJL_HasSetNick', 'true');
                    persistNicknameToDisk(); // 同步写入本地磁盘（重装不丢）
                    if (window.refreshProfileLabel) window.refreshProfileLabel(); // 同步右上角个人中心昵称
                    if (typeof recordLoginEvent === 'function') recordLoginEvent(); // 首设昵称即记一次登录打卡
                    if (window.refreshWallNickname) window.refreshWallNickname(); // 同步刷新需求墙昵称框
                    used.push(v);
                    await saveUsedNicks(used);
                    cleanup();
                    resolve(v);
                };
            });
        }

        function hideRefPreview() {
            document.getElementById('refImagePreview').classList.remove('show');
        }
        function showRefPreview(src, title) {
            const el = document.getElementById('refImagePreview');
            document.getElementById('refImagePreviewImg').src = src;
            document.getElementById('refImagePreviewTitle').textContent = title || '';
            el.classList.add('show');
        }

        async function joinChatRoom() {
            const roomId = document.getElementById('chatRoomIdInput').value.trim();
            const nick = document.getElementById('chatRoomNickInput').value.trim();
            if (!roomId) { alert('请输入拍卖会ID'); return; }
            if (!nick) { alert('请输入昵称'); return; }

            // 检查房间白名单和昵称唯一性
            try {
                const token = getGistToken();
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const indexResponse = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
                    }
                });
                
                if (indexResponse.ok) {
                    const indexData = await indexResponse.json();
                    if (indexData.files && indexData.files['room_index.json'] && indexData.files['room_index.json'].content) {
                        const index = JSON.parse(indexData.files['room_index.json'].content);
                        const allowedRooms = index.allowedRooms || [];
                        const blockedRooms = index.blockedRooms || [];
                        const usedNicks = index.usedNicks || [];

                        // 黑名单检查（优先级最高，无论白名单模式）
                        const isBlocked = blockedRooms.some(r => {
                            const existingId = typeof r === 'string' ? r : r.id;
                            return existingId === roomId;
                        });
                        if (isBlocked) {
                            const blockInfo = blockedRooms.find(r => (typeof r === 'string' ? r : r.id) === roomId);
                            const reason = typeof blockInfo === 'object' ? blockInfo.reason : '';
                            alert(`房间 "${roomId}" 已被封禁${reason ? '，原因：' + reason : ''}，无法进入`);
                            return;
                        }

                        // 如果白名单不为空，检查房间是否在白名单中
                        if (allowedRooms.length > 0) {
                            const isAllowed = allowedRooms.some(r => {
                                const existingId = typeof r === 'string' ? r : r.id;
                                return existingId === roomId;
                            });
                            if (!isAllowed) {
                                alert(`房间 "${roomId}" 未开放，请联系管理员开通`);
                                return;
                            }
                        }
                        
                        // 昵称统一用全局昵称（TFJL_UserName）判断是否已注册
                        const savedNick = localStorage.getItem('TFJL_UserName') || localStorage.getItem('TFJL_ChatNick');
                        if (nick !== savedNick && usedNicks.includes(nick)) {
                            alert(`昵称 "${nick}" 已被使用，请换一个昵称`);
                            return;
                        }
                        
                        // 如果是新昵称，注册到全局列表
                        if (nick !== savedNick && !usedNicks.includes(nick)) {
                            usedNicks.push(nick);
                            index.usedNicks = usedNicks;
                            
                            // 保存更新后的索引
                            await fetch(indexUrl, {
                                method: 'PATCH',
                                headers: {
                                    'Accept': 'application/vnd.github.v3+json',
                                    'Content-Type': 'application/json',
                                    'Authorization': `token ${token}`
                                },
                                body: JSON.stringify({
                                    files: {
                                        'room_index.json': {
                                            content: JSON.stringify(index, null, 2)
                                        }
                                    }
                                })
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('检查失败:', e);
            }

            currentChatRoom = roomId;
            currentChatNick = nick;
            localStorage.setItem('TFJL_ChatRoom', roomId);
            localStorage.setItem('TFJL_ChatNick', nick); // 冗余兼容旧逻辑
            // 昵称统一到全局昵称：首次进入聊天室且未设全局昵称时，把聊天昵称同步为全局昵称
            if (!localStorage.getItem('TFJL_UserName')) {
                localStorage.setItem('TFJL_UserName', nick);
                localStorage.setItem('TFJL_HasSetNick', 'true');
                persistNicknameToDisk(); // 同步写入本地磁盘（重装不丢）
            }

            closeChatRoomEntry();
            loadChatRoomSize(); // 加载保存的窗口尺寸
            document.getElementById('chatRoomPanel').style.display = 'flex';
            document.getElementById('chatRoomIdDisplay').textContent = '#' + roomId;

            // 首次进入拍卖行显示规则说明
            if (!localStorage.getItem('TFJL_AuctionRulesRead')) {
                showAuctionRules();
            }

            await fetchChatRoomData();
            renderChatMessages();
            renderAuctionsList();
            startChatRefresh();
            startAuctionCountdown();
        }

        // 拍卖行规则弹窗
        function showAuctionRules() {
            const rulesHtml = `
                <div id="auctionRulesModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;">
                    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(78,205,196,0.6);border-radius:16px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                        <div style="text-align:center;margin-bottom:12px;">
                            <span style="font-size:1.5rem;">🏪</span>
                            <span style="color:#4ecdc4;font-size:1.1rem;font-weight:bold;margin-left:8px;">拍卖行规则</span>
                        </div>
                        <div style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.4);border-radius:8px;padding:8px 12px;margin-bottom:14px;text-align:center;">
                            <span style="color:#fbbf24;font-size:0.85rem;font-weight:bold;">⚠️ 首次进入，请仔细阅读！关闭后可在拍卖行内重新查看</span>
                        </div>
                        <div style="color:rgba(255,255,255,0.85);font-size:0.85rem;line-height:1.8;">
                            <div style="margin-bottom:10px;">
                                <span style="color:#4ade80;">🔨 浏览商品</span><br>
                                点击小锤子图标进入商品浏览页面
                            </div>
                            <div style="margin-bottom:10px;">
                                <span style="color:#fbbf24;">📢 上架商品</span><br>
                                点击「发布拍卖」即可上架商品
                            </div>
                            <div style="margin-bottom:10px;">
                                <span style="color:#60a5fa;">🔄 交换</span><br>
                                交换商品的价格统一填 <b style="color:#fbbf24;">8888</b>，想要物品填自己要的，时间填长一点，可自行找大佬担保，本平台不收费
                            </div>
                            <div style="margin-bottom:10px;">
                                <span style="color:#f472b6;">🛒 求购</span><br>
                                选中自己想要的，尽可能填入最高价钱，停止收购需联系管理员下架
                            </div>
                            <div style="margin-bottom:10px;">
                                <span style="color:#a78bfa;">👑 入驻</span><br>
                                欢迎大佬入驻，非欺诈量且不大者可私聊给房主，量太大网站承受不了，哈哈（查看该房间统计功能
                            </div>
                        </div>
                        <div style="text-align:center;margin-top:16px;">
                            <button onclick="closeAuctionRules()" style="padding:10px 40px;border-radius:8px;border:none;background:linear-gradient(135deg,#4ecdc4,#44a08d);color:white;cursor:pointer;font-size:0.9rem;font-weight:600;">我已阅读并了解规则</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', rulesHtml);
        }

        function closeAuctionRules() {
            localStorage.setItem('TFJL_AuctionRulesRead', 'true');
            const modal = document.getElementById('auctionRulesModal');
            if (modal) modal.remove();
        }

        // 网站功能说明弹窗（首次进入简短版）
        function showWelcomeGuide() {
            const guideHtml = `
                <div id="welcomeGuideModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;">
                    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,215,0,0.5);border-radius:16px;padding:24px;max-width:460px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                        <div style="text-align:center;margin-bottom:12px;">
                            <span style="font-size:1.5rem;">🎮</span>
                            <span style="color:#ffd700;font-size:1.1rem;font-weight:bold;margin-left:8px;">欢迎来到塔防精灵助手</span>
                        </div>
                        <div style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.4);border-radius:8px;padding:8px 12px;margin-bottom:14px;text-align:center;">
                            <span style="color:#fbbf24;font-size:0.85rem;font-weight:bold;">⚠️ 首次使用，请了解核心功能</span>
                        </div>
                        <div style="color:rgba(255,255,255,0.85);font-size:0.85rem;line-height:1.8;">
                            <div style="margin-bottom:8px;">📂 <b>项目管理</b> — 脚本分类存储，支持脚本、图片、阵容、记事本</div>
                            <div style="margin-bottom:8px;">📜 <b>脚本文件</b> — 解析到手牌，支持拖拽、分享到需求墙</div>
                            <div style="margin-bottom:8px;">🔍 <b>脚本解析与生成</b> — 自动生成活动/副本脚本，可手动微调</div>
                            <div style="margin-bottom:8px;">🏪 <b>拍卖行</b> — 闲置物品自由上架、交换、求购，完全免费</div>
                            <div style="margin-bottom:8px;">📢 <b>需求墙</b> — 发布需求、分享脚本、互动交流</div>
                        </div>
                        <div style="background:rgba(78,205,196,0.1);border:1px solid rgba(78,205,196,0.3);border-radius:8px;padding:8px 12px;margin-top:10px;text-align:center;">
                            <span style="color:#4ecdc4;font-size:0.82rem;">💡 有好的需求、想法，欢迎在需求墙（右上角小喇叭）留言！</span>
                        </div>
                        <div style="display:flex;gap:10px;margin-top:16px;justify-content:center;flex-wrap:wrap;">
                            <button onclick="closeWelcomeGuide();openHelpPage();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#4fc3f7,#0288d1);color:white;cursor:pointer;font-size:0.85rem;font-weight:600;">📖 查看完整帮助</button>
                            <button onclick="closeWelcomeGuide()" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#ffd700,#f59e0b);color:#1a1a2e;cursor:pointer;font-size:0.85rem;font-weight:600;">开始使用</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', guideHtml);
        }

        function closeWelcomeGuide() {
            localStorage.setItem('TFJL_WelcomeRead', 'true');
            const modal = document.getElementById('welcomeGuideModal');
            if (modal) modal.remove();
        }

        function closeChatRoom() {
            document.getElementById('chatRoomPanel').style.display = 'none';
            if (chatRefreshInterval) clearInterval(chatRefreshInterval);
            if (auctionCounterInterval) clearInterval(auctionCounterInterval);
            currentChatRoom = null;
        }

        function resizeChatRoom(deltaWidth, deltaHeight) {
            const panel = document.getElementById('chatRoomPanel');
            const currentHeight = panel.offsetHeight;
            
            // 只调整高度，宽度保持420px不变
            const newHeight = Math.max(400, Math.min(900, currentHeight + deltaHeight));
            
            panel.style.height = newHeight + 'px';
            
            // 保存到localStorage
            localStorage.setItem('TFJL_ChatRoomHeight', newHeight);
        }

        function resetChatRoomSize() {
            const panel = document.getElementById('chatRoomPanel');
            panel.style.height = '700px';
            
            // 清除本地存储的尺寸
            localStorage.removeItem('TFJL_ChatRoomHeight');
        }

        // ==================== 图片管理（每个图片一个文件） ====================
        
        // 保存图片到单独文件
        async function saveImage(auctionId, imageData) {
            const token = getGistToken();
            if (!token) throw new Error('未设置Token');
            
            // 去掉 base64 前缀，只保存纯 base64 数据
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            
            // 文件名加入房间号、时间戳和随机数，确保唯一
            const roomId = currentChatRoom || 'default';
            const timestamp = Date.now();
            const random = Math.random().toString(36).substr(2, 6);
            const filename = `auction_${auctionId}_${roomId}_${timestamp}_${random}.txt`;
            
            // 检查是否已经存在该图片的 GIST_ID
            const storageKey = `auction_img_gist_${roomId}_${auctionId}`;
            const existingGistId = localStorage.getItem(storageKey);
            
            if (existingGistId) {
                // 如果存在，使用 PATCH 更新现有 Gist
                const patchResponse = await fetch(`https://api.github.com/gists/${existingGistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        files: {
                            [filename]: {
                                content: base64Data
                            }
                        }
                    })
                });
                
                if (patchResponse.ok) {
                    const data = await patchResponse.json();
                    
                    // 更新 localStorage 缓存
                    const now = Date.now();
                    const cacheData = {
                        data: imageData,
                        timestamp: now,
                        gistId: existingGistId,
                        roomId: roomId
                    };
                    localStorage.setItem(`auction_img_${roomId}_${auctionId}`, JSON.stringify(cacheData));
                    
                    // 返回 Gist ID（用于保存到房间配置文件）
                    return existingGistId;
                }
                // 如果 PATCH 失败，继续创建新的
            }
            
            // 如果不存在或 PATCH 失败，创建新的 Gist
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                },
                body: JSON.stringify({
                    description: `拍卖图片: ${auctionId} (房间: ${roomId})`,
                    public: false,
                    files: {
                        [filename]: {
                            content: base64Data
                        }
                    }
                })
            });
            
            if (!response.ok) throw new Error('保存图片失败');
            
            const data = await response.json();
            const fileData = data.files[filename];
            const gistUrl = fileData?.raw_url || data.html_url;
            
            // 保存 GIST_ID 到 localStorage（key 包含房间号）
            localStorage.setItem(storageKey, data.id);
            
            // 同时保存到 localStorage（缓存7天）
            const now = Date.now();
            const cacheData = {
                data: imageData,
                timestamp: now,
                gistId: data.id,
                roomId: roomId
            };
            localStorage.setItem(`auction_img_${roomId}_${auctionId}`, JSON.stringify(cacheData));
            
            // 清理7天前的缓存
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (key.startsWith('auction_img_')) {
                    try {
                        const item = JSON.parse(localStorage.getItem(key));
                        if (item.timestamp && now - item.timestamp > 7 * 24 * 60 * 60 * 1000) {
                            localStorage.removeItem(key);
                        }
                    } catch (e) {
                        localStorage.removeItem(key);
                    }
                }
            });
            
            // 返回 Gist ID（用于保存到房间配置文件）
            return data.id;
        }

        // 从Gist加载图片（返回base64格式）
        // 参数可以是 auctionId 或 imageGistId
        async function loadImage(auctionIdOrGistId) {
            // 获取当前房间号
            const roomId = currentChatRoom || 'default';
            
            // 判断传入的是 auctionId 还是 imageGistId
            // imageGistId 是完整的 Gist ID（32位），auctionId 是 4 位数字
            const isGistId = auctionIdOrGistId && auctionIdOrGistId.length > 10;
            
            let imgGistId = null;
            let auctionId = null;
            
            if (isGistId) {
                // 直接传入的是 Gist ID
                imgGistId = auctionIdOrGistId;
            } else {
                // 传入的是 auctionId，需要查找对应的 Gist ID
                auctionId = auctionIdOrGistId;
                
                // 优先从 localStorage 读取缓存
                const cached = localStorage.getItem(`auction_img_${roomId}_${auctionId}`);
                if (cached) {
                    try {
                        const cacheData = JSON.parse(cached);
                        return cacheData.data || cacheData;
                    } catch (e) {
                        return cached;
                    }
                }
                
                // 从 localStorage 获取图片的 GIST_ID
                imgGistId = localStorage.getItem(`auction_img_gist_${roomId}_${auctionId}`);
            }
            
            if (!imgGistId) return null;
            
            const token = getGistToken();
            
            try {
                const response = await fetch(`https://api.github.com/gists/${imgGistId}`, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
                    }
                });
                if (!response.ok) return null;
                
                const data = await response.json();
                
                // 查找文件内容
                let content = null;
                for (const filename in data.files) {
                    if (filename.startsWith('auction_')) {
                        content = data.files[filename].content;
                        // 从文件名提取 auctionId
                        const match = filename.match(/auction_(\d+)_/);
                        if (match) auctionId = match[1];
                        break;
                    }
                }
                
                if (!content) return null;
                const base64Url = `data:image/jpeg;base64,${content}`;
                
                // 保存到 localStorage（缓存7天）
                if (auctionId) {
                    const now = Date.now();
                    const cacheData = {
                        data: base64Url,
                        timestamp: now,
                        gistId: imgGistId,
                        roomId: roomId
                    };
                    localStorage.setItem(`auction_img_${roomId}_${auctionId}`, JSON.stringify(cacheData));
                    
                    // 清理7天前的缓存
                    const allKeys = Object.keys(localStorage);
                    allKeys.forEach(key => {
                        if (key.startsWith('auction_img_')) {
                            try {
                                const item = JSON.parse(localStorage.getItem(key));
                                if (item.timestamp && now - item.timestamp > 7 * 24 * 60 * 60 * 1000) {
                                    localStorage.removeItem(key);
                                }
                            } catch (e) {
                                localStorage.removeItem(key);
                            }
                        }
                    });
                }
                
                return base64Url;
            } catch (error) {
                console.warn('加载图片失败:', error);
                return null;
            }
        }

        // 获取图片（从单独文件）
        async function getImage(auctionId) {
            return await loadImage(auctionId);
        }

        // 标记图片为已结束（不需要操作，因为每个图片是独立文件）
        async function markImageAsEnded(auctionId) {
            // 每个图片文件独立管理，不需要额外操作
            // 可以在拍卖结束的回调中调用
        }

        // 删除过期图片Gist（7天前）
        async function deleteExpiredImages() {
            const token = getGistToken();
            if (!token) {
                console.warn('未设置Token，跳过图片清理');
                return;
            }

            try {
                const now = Date.now();
                const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
                let deletedCount = 0;
                
                // 遍历 localStorage 中所有图片 GIST_ID
                const allKeys = Object.keys(localStorage);
                for (const key of allKeys) {
                    if (key.startsWith('auction_img_gist_')) {
                        // 从 key 提取 roomId 和 auctionId
                        // key 格式: auction_img_gist_${roomId}_${auctionId}
                        const suffix = key.replace('auction_img_gist_', '');
                        const imgGistId = localStorage.getItem(key);
                        
                        // 对应的缓存 key: auction_img_${roomId}_${auctionId}
                        const cacheKey = `auction_img_${suffix}`;
                        const cacheData = localStorage.getItem(cacheKey);
                        let timestamp = 0;
                        try {
                            const cache = JSON.parse(cacheData);
                            timestamp = cache.timestamp || 0;
                        } catch (e) {
                            continue;
                        }
                        
                        // 如果超过7天，删除Gist
                        if (timestamp && timestamp < sevenDaysAgo) {
                            try {
                                const deleteResponse = await fetch(`https://api.github.com/gists/${imgGistId}`, {
                                    method: 'DELETE',
                                    headers: {
                                        'Accept': 'application/vnd.github.v3+json',
                                        'Authorization': `token ${token}`
                                    }
                                });
                                
                                if (deleteResponse.ok) {
                                    deletedCount++;
                                    localStorage.removeItem(key);
                                    localStorage.removeItem(cacheKey);
                                }
                            } catch (e) {
                                console.warn(`删除图片Gist失败: ${suffix}`, e);
                            }
                        }
                    }
                }
                
            } catch (error) {
                console.error('清理过期图片失败:', error);
            }
        }

        // 启动图片清理定时任务（每天执行一次）
        function startImageCleanup() {
            // 立即执行一次
            deleteExpiredImages();
            
            // 每天凌晨2点执行
            setInterval(() => {
                deleteExpiredImages();
            }, 24 * 60 * 60 * 1000);
        }

        function loadChatRoomSize() {
            const savedHeight = localStorage.getItem('TFJL_ChatRoomHeight');
            
            if (savedHeight) {
                const panel = document.getElementById('chatRoomPanel');
                panel.style.height = savedHeight + 'px';
            }
        }

        function switchChatRoom() {
            // 显示入口弹窗，预填充当前房间ID和昵称
            const roomIdInput = document.getElementById('chatRoomIdInput');
            const nickInput = document.getElementById('chatRoomNickInput');
            if (roomIdInput) roomIdInput.value = currentChatRoom || '';
            if (nickInput) nickInput.value = currentChatNick || '';
            document.getElementById('chatRoomEntryModal').style.display = 'flex';
        }

        function toggleChatRoomTab(tab) {
            const chatTab = document.getElementById('chatRoomTabChat');
            const auctionTab = document.getElementById('chatRoomTabAuctions');
            if (tab === 'auctions') {
                chatTab.style.display = 'none';
                auctionTab.style.display = 'flex';
            } else {
                chatTab.style.display = 'flex';
                auctionTab.style.display = 'none';
            }
        }

        // 更新房间索引文件（返回冲突信息供调用方处理）
        async function updateRoomIndex(roomId, gistId) {
            const token = getGistToken();
            if (!token) {
                console.warn('未设置Token，无法更新索引');
                return { warning: '未设置Token' };
            }
            
            try {
                // 使用固定的索引文件 URL
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                
                // 先获取现有的索引文件
                let indexData = {};
                const response = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.files && data.files['room_index.json'] && data.files['room_index.json'].content) {
                        try {
                            indexData = JSON.parse(data.files['room_index.json'].content);
                        } catch (e) {
                            console.error('❌ 解析索引文件失败，中止更新以防数据丢失');
                            return { error: '解析索引文件失败' };
                        }
                    } else {
                        console.error('❌ 索引文件内容为空，中止更新以防数据丢失');
                        return { error: '索引文件内容为空' };
                    }
                } else {
                    console.error(`❌ 获取索引文件失败: ${response.status}`);
                    return { error: `获取索引失败: ${response.status}` };
                }
                
                // 检查是否已存在相同的 Gist ID
                if (indexData[roomId] === gistId) {
                    return null;
                }
                
                // 【冲突检测】如果索引中已有不同的Gist ID，说明其他设备已抢先创建
                if (indexData[roomId] && indexData[roomId] !== gistId) {
                    return { conflict: true, existingGistId: indexData[roomId] };
                }
                
                // 更新索引
                indexData[roomId] = gistId;
                
                // 保存索引文件（带重试机制）
                let patchSuccess = false;
                let retryCount = 0;
                const maxRetries = 3;
                
                while (!patchSuccess && retryCount < maxRetries) {
                    const patchResponse = await fetch(indexUrl, {
                        method: 'PATCH',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'Authorization': `token ${token}`
                        },
                        body: JSON.stringify({
                            files: {
                                'room_index.json': {
                                    content: JSON.stringify(indexData, null, 2)
                                }
                            }
                        })
                    });
                    
                    if (patchResponse.ok) {
                        patchSuccess = true;
                        // 更新 localStorage 缓存
                        localStorage.setItem(INDEX_GIST_ID_KEY, GIST_ID);
                    } else {
                        retryCount++;
                        if (retryCount < maxRetries) {
                            await new Promise(r => setTimeout(r, 500 * retryCount)); // 递增等待
                        }
                    }
                }
                
                if (!patchSuccess) {
                    console.error(`❌ 更新索引失败，已重试${maxRetries}次`);
                    return { error: '更新索引失败' };
                }
            } catch (error) {
                console.error('更新房间索引失败:', error);
                return { error: error.message };
            }
        }

        async function fetchChatRoomData() {
            try {
                const token = getGistToken();
                const roomId = currentChatRoom || 'default';
                const filename = `chatrooms_${roomId}.json`;
                
                // 优先从 localStorage 获取该房间的 GIST_ID
                let roomGistId = localStorage.getItem(`chatroom_gist_${roomId}`);
                
                // 如果 localStorage 没有，尝试从索引文件获取
                if (!roomGistId) {
                    try {
                        // 使用固定的索引文件 URL
                        const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                        const indexResponse = await fetch(indexUrl, {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                ...(token && { 'Authorization': `token ${token}` })
                            }
                        });
                        
                        if (indexResponse.ok) {
                            const data = await indexResponse.json();
                            if (data.files && data.files['room_index.json'] && data.files['room_index.json'].content) {
                                try {
                                    const indexData = JSON.parse(data.files['room_index.json'].content);
                                    if (indexData[roomId]) {
                                        roomGistId = indexData[roomId];
                                        // 缓存到 localStorage
                                        localStorage.setItem(`chatroom_gist_${roomId}`, roomGistId);
                                    }
                                } catch (e) {
                                    console.warn('解析索引文件失败');
                                }
                            }
                        } else {
                            console.error(`❌ 获取索引文件失败: ${indexResponse.status}`);
                        }
                    } catch (e) {
                        console.warn('获取索引文件失败:', e);
                    }
                } else {
                }
                
                if (roomGistId) {
                    // 从独立 Gist 加载房间数据
                    const response = await fetch(`https://api.github.com/gists/${roomGistId}`, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            ...(token && { 'Authorization': `token ${token}` })
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.files && data.files[filename]) {
                            const content = data.files[filename].content;
                            if (content) {
                                try {
                                    const parsed = JSON.parse(content);
                                    
                                    // 检查数据结构，兼容两种格式
                                    if (parsed.rooms && parsed.rooms[roomId]) {
                                        // 新格式: { rooms: { "789": { messages, auctions } } }
                                        chatRoomData = parsed;
                                    } else if (parsed.messages || parsed.auctions) {
                                        // 旧格式: { messages: [], auctions: [] }
                                        // 转换为新格式
                                        chatRoomData = { rooms: {} };
                                        chatRoomData.rooms[roomId] = parsed;
                                    } else {
                                        // 无效格式，使用默认
                                        chatRoomData = { rooms: {} };
                                        chatRoomData.rooms[roomId] = { messages: [], auctions: [], nextAuctionId: 1 };
                                    }
                                    
                                    // 自动清理过期消息（7天）
                                    const MESSAGE_EXPIRE = 7 * 24 * 60 * 60 * 1000; // 7天
                                    const now = Date.now();
                                    const currentRoom = chatRoomData.rooms[roomId];
                                    if (currentRoom && currentRoom.messages && currentRoom.messages.length > 0) {
                                        const originalLength = currentRoom.messages.length;
                                        currentRoom.messages = currentRoom.messages.filter(msg => {
                                            return msg.author === '系统' || (now - msg.time) < MESSAGE_EXPIRE;
                                        });
                                        if (currentRoom.messages.length < originalLength) {
                                            // 异步保存，不阻塞加载
                                            saveChatRoomData().catch(e => console.warn('清理后保存失败:', e));
                                        }
                                    }
                                    
                                    return;
                                } catch (e) {
                                    console.warn('解析房间数据失败，使用默认值');
                                }
                            }
                        }
                    } else if (response.status === 404 || response.status === 403) {
                        // Gist 不存在或无权限，清除缓存
                        localStorage.removeItem(`chatroom_gist_${roomId}`);
                        roomGistId = null;
                    }
                }
                
                // 如果没有找到房间数据，创建新的
                chatRoomData = { rooms: {} };
                if (token) {
                    try {
                        // saveChatRoomData 内部已包含双重检查、冲突检测和索引更新
                        const newGistId = await saveChatRoomData();
                    } catch (saveError) {
                        console.warn('自动创建房间配置文件失败:', saveError);
                    }
                }
            } catch (error) {
                console.warn('获取聊天室数据失败:', error);
                chatRoomData = { rooms: {} };
            }
        }

        async function saveChatRoomData() {
            const token = getGistToken();
            if (!token) throw new Error('未设置Token');

            // 获取当前房间号
            const roomId = currentChatRoom || 'default';
            const filename = `chatrooms_${roomId}.json`;

            // 确保数据格式正确
            if (!chatRoomData) {
                chatRoomData = { rooms: {} };
            }
            if (!chatRoomData.rooms) {
                chatRoomData.rooms = {};
            }
            if (!chatRoomData.rooms[roomId]) {
                chatRoomData.rooms[roomId] = { messages: [], auctions: [], nextAuctionId: 1 };
            }

            // 从 localStorage 获取该房间的 GIST_ID
            let chatroomGistId = localStorage.getItem(`chatroom_gist_${roomId}`);
            
            // 如果本地没有，先从索引文件获取（可能是其他设备创建的）
            if (!chatroomGistId) {
                try {
                    const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                    const indexResponse = await fetch(indexUrl, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Authorization': `token ${token}`
                        }
                    });
                    
                    if (indexResponse.ok) {
                        const data = await indexResponse.json();
                        if (data.files && data.files['room_index.json'] && data.files['room_index.json'].content) {
                            const indexData = JSON.parse(data.files['room_index.json'].content);
                            if (indexData[roomId]) {
                                chatroomGistId = indexData[roomId];
                                localStorage.setItem(`chatroom_gist_${roomId}`, chatroomGistId);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('获取索引文件失败:', e);
                }
            }
            
            if (chatroomGistId) {
                try {
                    // 如果存在，使用 PATCH 更新现有 Gist
                    const patchResponse = await fetch(`https://api.github.com/gists/${chatroomGistId}`, {
                        method: 'PATCH',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'Authorization': `token ${token}`
                        },
                        body: JSON.stringify({
                            files: {
                                [filename]: {
                                    content: JSON.stringify(chatRoomData, null, 2)
                                }
                            }
                        })
                    });
                    
                    if (patchResponse.ok) {
                        return chatroomGistId;
                    }
                    // 如果 PATCH 失败（404 或 403），清除 localStorage，重新创建
                    if (patchResponse.status === 404 || patchResponse.status === 403) {
                        localStorage.removeItem(`chatroom_gist_${roomId}`);
                        chatroomGistId = null;
                    }
                } catch (e) {
                    console.warn('PATCH 失败，清除缓存重新创建');
                    localStorage.removeItem(`chatroom_gist_${roomId}`);
                    chatroomGistId = null;
                }
            }
            
            // 只有确实没有已存在的 Gist 时，才创建新的
            if (!chatroomGistId) {
                // 【双重检查】创建前再次从索引文件确认，防止并发导致重复创建
                try {
                    const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                    const checkResponse = await fetch(indexUrl, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Authorization': `token ${token}`
                        }
                    });
                    if (checkResponse.ok) {
                        const checkData = await checkResponse.json();
                        if (checkData.files && checkData.files['room_index.json'] && checkData.files['room_index.json'].content) {
                            const checkIndex = JSON.parse(checkData.files['room_index.json'].content);
                            if (checkIndex[roomId]) {
                                // 索引中已有其他设备创建的房间，使用已有的
                                chatroomGistId = checkIndex[roomId];
                                localStorage.setItem(`chatroom_gist_${roomId}`, chatroomGistId);
                                // 用已有的Gist ID去PATCH更新数据
                                const patchResp = await fetch(`https://api.github.com/gists/${chatroomGistId}`, {
                                    method: 'PATCH',
                                    headers: {
                                        'Accept': 'application/vnd.github.v3+json',
                                        'Content-Type': 'application/json',
                                        'Authorization': `token ${token}`
                                    },
                                    body: JSON.stringify({
                                        files: {
                                            [filename]: {
                                                content: JSON.stringify(chatRoomData, null, 2)
                                            }
                                        }
                                    })
                                });
                                if (patchResp.ok) {
                                    return chatroomGistId;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('双重检查失败，继续创建:', e);
                }

                const response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        description: `聊天室配置: ${roomId}`,
                        public: false,
                        files: {
                            [filename]: {
                                content: JSON.stringify(chatRoomData, null, 2)
                            }
                        }
                    })
                });
                
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || '保存失败');
                }
                
                const data = await response.json();
                // 保存 GIST_ID 到 localStorage
                localStorage.setItem(`chatroom_gist_${roomId}`, data.id);
                
                // 【冲突检测】更新索引时检查是否有其他设备已抢先创建
                const conflictResult = await updateRoomIndex(roomId, data.id);
                if (conflictResult && conflictResult.conflict && conflictResult.existingGistId) {
                    // 删除刚创建的重复Gist
                    try {
                        await fetch(`https://api.github.com/gists/${data.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `token ${token}` }
                        });
                    } catch (delErr) {
                        console.warn('删除重复Gist失败:', delErr);
                    }
                    // 使用已有的Gist ID
                    chatroomGistId = conflictResult.existingGistId;
                    localStorage.setItem(`chatroom_gist_${roomId}`, chatroomGistId);
                    // 将数据PATCH到已有的Gist
                    const patchResp = await fetch(`https://api.github.com/gists/${chatroomGistId}`, {
                        method: 'PATCH',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'Authorization': `token ${token}`
                        },
                        body: JSON.stringify({
                            files: {
                                [filename]: {
                                    content: JSON.stringify(chatRoomData, null, 2)
                                }
                            }
                        })
                    });
                    return chatroomGistId;
                }
                
                // 检查索引更新是否失败
                if (conflictResult && conflictResult.error) {
                    console.warn(`⚠️ 索引更新失败: ${conflictResult.error}，但房间数据已保存`);
                    // 仍然返回成功，因为房间数据已保存，只是索引没更新
                    // 其他用户需要通过分享的房间ID来访问
                }
                
                return data.id;
            }
            
            throw new Error('保存失败');
        }

        function getRoomData() {
            if (!currentChatRoom) return null;
            if (!chatRoomData || !chatRoomData.rooms) return null;
            const room = chatRoomData.rooms[currentChatRoom];
            return room || null;
        }

        function ensureRoomData() {
            if (!currentChatRoom) return null;
            if (!chatRoomData) chatRoomData = { rooms: {} };
            if (!chatRoomData.rooms[currentChatRoom]) {
                chatRoomData.rooms[currentChatRoom] = { messages: [], auctions: [], buyRequests: [], nextAuctionId: 1 };
            }
            if (!chatRoomData.rooms[currentChatRoom].buyRequests) {
                chatRoomData.rooms[currentChatRoom].buyRequests = [];
            }
            return chatRoomData.rooms[currentChatRoom];
        }

        async function sendChatMessage() {
            const input = document.getElementById('chatMessageInput');
            const content = input.value.trim();
            if (!content || !currentChatRoom) return;

            try {
                await fetchChatRoomData();
                const room = ensureRoomData();
                room.messages.push({
                    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    author: currentChatNick,
                    content: content,
                    time: Date.now()
                });
                if (room.messages.length > 200) room.messages = room.messages.slice(-200);
                await saveChatRoomData();
                input.value = '';
                renderChatMessages();
            } catch (error) {
                alert('发送失败: ' + error.message);
            }
        }

        let messageManageMode = false; // 消息管理模式

        // 检查是否是管理员
        function checkIsAdmin() {
            const adminNicknames = ['gyq', 'GYQ', '龙行'];
            return adminNicknames.some(nick => currentChatNick.toLowerCase() === nick.toLowerCase());
        }

        // 检查是否是当前房间的房主
        async function checkIsRoomOwner() {
            try {
                const token = getGistToken();
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const response = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
                    }
                });
                
                if (!response.ok) return false;
                
                const data = await response.json();
                if (!data.files || !data.files['room_index.json'] || !data.files['room_index.json'].content) return false;
                
                const index = JSON.parse(data.files['room_index.json'].content);
                const allowedRooms = index.allowedRooms || [];
                
                const roomInfo = allowedRooms.find(r => {
                    const existingId = typeof r === 'string' ? r : r.id;
                    return existingId === currentChatRoom;
                });
                
                const owner = typeof roomInfo === 'object' ? (roomInfo.owner || '') : '';
                return owner && currentChatNick === owner;
            } catch (e) {
                return false;
            }
        }

        async function toggleMessageManageMode() {
            // 验证权限
            const isAdmin = checkIsAdmin();
            const isOwner = await checkIsRoomOwner();
            
            if (!isAdmin && !isOwner) {
                alert('❌ 权限不足\n\n只有管理员或房主才能管理消息');
                return;
            }
            
            messageManageMode = !messageManageMode;
            const btn = document.getElementById('msgManageBtn');
            if (btn) {
                btn.style.background = messageManageMode ? 'rgba(239,68,68,0.3)' : 'transparent';
                btn.textContent = messageManageMode ? '✓ 管理中' : '🛡️ 管理';
            }
            renderChatMessages();
        }

        function renderChatMessages() {
            const container = document.getElementById('chatMessagesContainer');
            const room = getRoomData();
            if (!room || !room.messages || room.messages.length === 0) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;">暂无消息</div>';
                return;
            }

            const now = Date.now();
            const RECALL_LIMIT = 2 * 60 * 1000; // 2分钟内可撤回

            container.innerHTML = room.messages.map(msg => {
                if (!msg.id) return '';
                const time = new Date(msg.time);
                const timeStr = String(time.getHours()).padStart(2, '0') + ':' + String(time.getMinutes()).padStart(2, '0');
                const isMe = msg.author === currentChatNick;
                const isSystem = msg.author === '系统';
                const isRecallable = isMe && !isSystem && (now - msg.time) < RECALL_LIMIT;
                const isDeletable = isMe && !isSystem;

                let actionBtn = '';
                if (messageManageMode && !isSystem) {
                    // 管理模式：所有消息都可以删除
                    actionBtn = `<span onclick="adminDeleteMessage('${msg.id}')" title="管理员删除" style="color:#ef4444;font-size:0.7rem;cursor:pointer;margin-left:6px;padding:2px 4px;border-radius:3px;background:rgba(239,68,68,0.25);">🗑️</span>`;
                } else if (isRecallable) {
                    actionBtn = `<span onclick="recallMessage('${msg.id}')" title="撤回" style="color:#fbbf24;font-size:0.7rem;cursor:pointer;margin-left:6px;padding:2px 4px;border-radius:3px;background:rgba(251,191,36,0.15);">撤回</span>`;
                } else if (isDeletable) {
                    actionBtn = `<span onclick="deleteMessage('${msg.id}')" title="删除" style="color:#ef4444;font-size:0.7rem;cursor:pointer;margin-left:6px;padding:2px 4px;border-radius:3px;background:rgba(239,68,68,0.15);">删除</span>`;
                }

                return `
                    <div style="margin-bottom:8px;${isMe ? 'text-align:right;' : ''}">
                        <span style="color:${isMe ? '#4ecdc4' : '#ffd700'};font-size:0.8rem;font-weight:500;">${msg.author}</span>
                        <span style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin-left:5px;">${timeStr}</span>
                        ${actionBtn}
                        <div style="display:inline-block;background:${isMe ? 'rgba(78,205,196,0.15)' : 'rgba(255,255,255,0.08)'};padding:6px 12px;border-radius:10px;font-size:0.85rem;color:rgba(255,255,255,0.9);max-width:80%;word-break:break-all;margin-top:2px;">${escapeHtml(msg.content)}</div>
                    </div>
                `;
            }).join('');

            container.scrollTop = container.scrollHeight;
        }

        // 撤回消息（2分钟内）
        async function recallMessage(msgId) {
            if (!confirm('确定要撤回这条消息吗？')) return;
            
            try {
                const roomId = currentChatRoom || 'default';
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                await fetchChatRoomData();
                const room = getRoomData();
                if (!room || !room.messages) return;
                
                const msgIndex = room.messages.findIndex(m => m.id === msgId);
                if (msgIndex === -1) {
                    alert('消息不存在');
                    return;
                }
                
                const msg = room.messages[msgIndex];
                if (msg.author !== currentChatNick) {
                    alert('只能撤回自己的消息');
                    return;
                }
                
                const RECALL_LIMIT = 2 * 60 * 1000;
                if (Date.now() - msg.time > RECALL_LIMIT) {
                    alert('超过2分钟，无法撤回，请使用删除功能');
                    return;
                }
                
                // 撤回：替换为"已撤回"提示
                room.messages[msgIndex] = {
                    id: msg.id,
                    author: '系统',
                    content: `${currentChatNick} 撤回了一条消息`,
                    time: msg.time,
                    recalled: true
                };
                
                await saveChatRoomData();
                renderChatMessages();
                showBidToast('✅ 已撤回', true);
            } catch (e) {
                alert('撤回失败: ' + e.message);
            }
        }

        // 删除消息（自己）
        async function deleteMessage(msgId) {
            if (!confirm('确定要删除这条消息吗？')) return;
            
            try {
                const roomId = currentChatRoom || 'default';
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                await fetchChatRoomData();
                const room = getRoomData();
                if (!room || !room.messages) return;
                
                const msgIndex = room.messages.findIndex(m => m.id === msgId);
                if (msgIndex === -1) {
                    alert('消息不存在');
                    return;
                }
                
                const msg = room.messages[msgIndex];
                if (msg.author !== currentChatNick) {
                    alert('只能删除自己的消息');
                    return;
                }
                
                room.messages.splice(msgIndex, 1);
                await saveChatRoomData();
                renderChatMessages();
                showBidToast('✅ 已删除', true);
            } catch (e) {
                alert('删除失败: ' + e.message);
            }
        }

        // 删除消息（管理员/房主）
        async function adminDeleteMessage(msgId) {
            // 验证权限
            const isAdmin = checkIsAdmin();
            const isOwner = await checkIsRoomOwner();
            
            if (!isAdmin && !isOwner) {
                alert('❌ 权限不足\n\n只有管理员或房主才能删除消息');
                return;
            }
            
            if (!confirm('确定要删除这条消息吗？')) return;
            
            try {
                const token = getGistToken();
                if (!token) throw new Error('未配置Token');
                
                // 从索引文件获取房间的 Gist ID
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const indexResponse = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${token}`
                    }
                });
                
                if (!indexResponse.ok) throw new Error('获取索引文件失败');
                
                const indexData = await indexResponse.json();
                const indexContent = indexData.files['room_index.json']?.content;
                if (!indexContent) throw new Error('索引文件内容为空');
                
                const index = JSON.parse(indexContent);
                const roomGistId = index[currentChatRoom];
                if (!roomGistId) throw new Error('房间不存在');
                
                // 获取房间数据
                const roomResponse = await fetch(`https://api.github.com/gists/${roomGistId}`, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${token}`
                    }
                });
                
                if (!roomResponse.ok) throw new Error('获取房间数据失败');
                
                const roomData = await roomResponse.json();
                const filename = `chatrooms_${currentChatRoom}.json`;
                const content = roomData.files[filename]?.content;
                if (!content) throw new Error('房间数据为空');
                
                const allData = JSON.parse(content);
                let roomInfo = null;
                
                if (allData.rooms && allData.rooms[currentChatRoom]) {
                    roomInfo = allData.rooms[currentChatRoom];
                } else if (allData.messages) {
                    roomInfo = allData;
                }
                
                if (!roomInfo || !roomInfo.messages) throw new Error('房间数据格式错误');
                
                const msgIndex = roomInfo.messages.findIndex(m => m.id === msgId);
                if (msgIndex === -1) throw new Error('消息不存在');
                
                roomInfo.messages.splice(msgIndex, 1);
                
                // 保存
                const saveResponse = await fetch(`https://api.github.com/gists/${roomGistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        files: {
                            [filename]: {
                                content: JSON.stringify(allData, null, 2)
                            }
                        }
                    })
                });
                
                if (!saveResponse.ok) throw new Error('保存失败');
                
                alert('✅ 消息已删除');
                renderChatMessages();
                
            } catch (e) {
                alert('删除失败: ' + e.message);
            }
        }

        let auctionImageBase64 = '';

        function previewAuctionImage(input) {
            const preview = document.getElementById('auctionImagePreview');
            if (input.files && input.files[0]) {
                const file = input.files[0];
                if (file.size > 2 * 1024 * 1024) {
                    alert('图片不能超过2MB');
                    input.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    auctionImageBase64 = e.target.result;
                    preview.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">';
                };
                reader.readAsDataURL(file);
            }
        }

        function openAuctionPostModal() {
            if (!currentChatRoom) {
                alert('请先进入拍卖行房间！');
                return;
            }
            document.getElementById('auctionPostModal').style.display = 'flex';
            auctionImageBase64 = '';
            document.getElementById('auctionImageFile').value = '';
            document.getElementById('auctionImagePreview').innerHTML = '<span style="color:rgba(255,255,255,0.3);font-size:0.7rem;">点击上传</span>';
            document.getElementById('auctionQuality').value = '红色';
            document.getElementById('auctionProfession').value = '工程';
            document.getElementById('auctionBonusDmg').value = '';
            document.getElementById('auctionIgnoreIce').value = '';
            document.getElementById('auctionStartPrice').value = '';
            document.getElementById('auctionBidIncrement').value = '';
            document.getElementById('auctionDuration').value = '';
            document.getElementById('auctionIsExchange').checked = false;
            document.getElementById('exchangeModeHint').style.display = 'none';
            document.getElementById('exchangeWantInput').style.display = 'none';
            document.getElementById('auctionExchangeWant').value = '';
            document.getElementById('postAuctionBtn').textContent = '发布拍卖';
        }

        function toggleExchangeMode() {
            const isChecked = document.getElementById('auctionIsExchange').checked;
            if (isChecked) {
                document.getElementById('exchangeModeHint').style.display = 'block';
                document.getElementById('exchangeWantInput').style.display = 'block';
                document.getElementById('postAuctionBtn').textContent = '发布交换';
            } else {
                document.getElementById('exchangeModeHint').style.display = 'none';
                document.getElementById('exchangeWantInput').style.display = 'none';
                document.getElementById('postAuctionBtn').textContent = '发布拍卖';
            }
        }

        function closeAuctionPostModal() {
            document.getElementById('auctionPostModal').style.display = 'none';
            // 重置为拍卖模式
            switchPostMode('auction');
        }

        // 当前发布模式
        let currentPostMode = 'auction';

        // 切换发布模式（拍卖/求购）
        function switchPostMode(mode) {
            currentPostMode = mode;
            const auctionForm = document.getElementById('auctionModeForm');
            const buyRequestForm = document.getElementById('buyRequestModeForm');
            const auctionBtn = document.getElementById('modeAuctionBtn');
            const buyRequestBtn = document.getElementById('modeBuyRequestBtn');
            const postAuctionBtnEl = document.getElementById('postAuctionBtn');
            const postBuyRequestBtnEl = document.getElementById('postBuyRequestBtn');

            if (mode === 'buyRequest') {
                auctionForm.style.display = 'none';
                buyRequestForm.style.display = 'block';
                auctionBtn.style.background = 'rgba(255,255,255,0.05)';
                auctionBtn.style.color = 'rgba(255,255,255,0.6)';
                auctionBtn.style.borderColor = 'rgba(255,255,255,0.2)';
                buyRequestBtn.style.background = 'linear-gradient(135deg,#3b82f6,#1d4ed8)';
                buyRequestBtn.style.color = 'white';
                buyRequestBtn.style.borderColor = '#3b82f6';
                postAuctionBtnEl.style.display = 'none';
                postBuyRequestBtnEl.style.display = 'inline-block';
            } else {
                auctionForm.style.display = 'block';
                buyRequestForm.style.display = 'none';
                auctionBtn.style.background = 'linear-gradient(135deg,#ffd700,#ff6b6b)';
                auctionBtn.style.color = '#1a1a2e';
                auctionBtn.style.borderColor = '#ffd700';
                buyRequestBtn.style.background = 'rgba(255,255,255,0.05)';
                buyRequestBtn.style.color = 'rgba(255,255,255,0.6)';
                buyRequestBtn.style.borderColor = 'rgba(255,255,255,0.2)';
                postAuctionBtnEl.style.display = 'inline-block';
                postBuyRequestBtnEl.style.display = 'none';
            }
        }

        // 发布求购
        async function postBuyRequest() {
            if (!currentChatRoom) {
                alert('请先进入拍卖行房间！');
                return;
            }

            const btn = document.getElementById('postBuyRequestBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ 发布中...';

            try {
                // 获取多选品质
                const qualityCheckboxes = document.querySelectorAll('#buyRequestQualityGroup input[type="checkbox"]:checked');
                const quality = Array.from(qualityCheckboxes).map(cb => cb.value);
                // 获取多选职业
                const professionCheckboxes = document.querySelectorAll('#buyRequestProfessionGroup input[type="checkbox"]:checked');
                const profession = Array.from(professionCheckboxes).map(cb => cb.value);
                const minBonusDmg = parseFloat(document.getElementById('buyRequestMinBonusDmg').value) || 0;
                const minIgnoreIce = parseFloat(document.getElementById('buyRequestMinIgnoreIce').value) || 0;
                const budget = document.getElementById('buyRequestBudget').value.trim();
                const note = document.getElementById('buyRequestNote').value.trim();

                if (quality.length === 0 && profession.length === 0 && minBonusDmg === 0 && minIgnoreIce === 0 && !budget && !note) {
                    alert('请至少填写一项求购需求');
                    btn.disabled = false;
                    btn.textContent = originalText;
                    return;
                }

                const roomId = currentChatRoom || 'default';
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                await fetchChatRoomData();
                const room = ensureRoomData();

                // 确保 buyRequests 数组存在
                if (!room.buyRequests) room.buyRequests = [];

                const requestId = 'br_' + (Date.now() % 1000000).toString().padStart(6, '0') + '_' + Math.random().toString(36).substr(2, 3);

                const buyRequestData = {
                    id: requestId,
                    type: 'buyRequest',
                    creator: currentChatNick,
                    quality: quality,
                    profession: profession,
                    minBonusDmg: minBonusDmg,
                    minIgnoreIce: minIgnoreIce,
                    budget: budget,
                    note: note,
                    createTime: Date.now(),
                    expireTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天过期
                    status: 'active'
                };

                room.buyRequests.push(buyRequestData);

                // 系统消息
                let desc = [];
                if (quality.length > 0) desc.push(quality.join('/'));
                if (profession.length > 0) desc.push(profession.join('/'));
                if (minBonusDmg > 0) desc.push('附加>=' + minBonusDmg);
                if (minIgnoreIce > 0) desc.push('无视>=' + minIgnoreIce);
                const descStr = desc.length > 0 ? desc.join('·') : '不限';
                room.messages.push({
                    id: 'msg_' + Date.now(),
                    author: '系统',
                    content: `🛒 ${currentChatNick} 发布了求购：${descStr}${budget ? ' 预算:' + budget : ''}${note ? ' 备注:' + note : ''}`,
                    time: Date.now()
                });

                await saveChatRoomData();
                closeAuctionPostModal();
                renderAuctionsList();
                renderChatMessages();

                // 公告播报求购信息
                addAuctionBroadcast(`【拍卖行◆${roomId}】${currentChatNick} 求购：${descStr}${budget ? ' 预算' + budget : ''}`, roomId);

                showAuctionToast('✅ 求购发布成功！', 'success');
            } catch (error) {
                console.error('求购发布失败:', error);
                alert('发布失败: ' + error.message);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        }

        async function postAuction() {
            if (!currentChatRoom) {
                alert('请先进入拍卖行房间！');
                return;
            }
            
            // 显示加载状态
            const btn = document.getElementById('postAuctionBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ 发布中...';
            
            const quality = document.getElementById('auctionQuality').value;
            const profession = document.getElementById('auctionProfession').value;
            const bonusDmg = parseFloat(document.getElementById('auctionBonusDmg').value) || 0;
            const ignoreIce = parseFloat(document.getElementById('auctionIgnoreIce').value) || 0;
            const startPrice = parseFloat(document.getElementById('auctionStartPrice').value);
            const bidIncrement = parseFloat(document.getElementById('auctionBidIncrement').value) || 10;
            const durationMin = parseInt(document.getElementById('auctionDuration').value) || 60;
            const isExchange = document.getElementById('auctionIsExchange').checked;
            const exchangeWant = document.getElementById('auctionExchangeWant').value || '';

            if (isNaN(startPrice) || startPrice < 0) { 
                alert('请输入有效的起拍价');
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
                return; 
            }

            // 使用短ID：时间戳后6位 + 随机3位字符，如 "123456_a1b"
            const shortTimestamp = (Date.now() % 1000000).toString().padStart(6, '0');
            const random = Math.random().toString(36).substr(2, 3);
            const auctionId = `${shortTimestamp}_${random}`;
            
            let imageGistId = null;

            try {
                // 先上传图片（如果有）
                if (auctionImageBase64) {
                    imageGistId = await saveImage(auctionId, auctionImageBase64);
                }
                
                // 获取最新数据
                const roomId = currentChatRoom || 'default';
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                await fetchChatRoomData();
                const room = ensureRoomData();
                
                // 检查ID是否已存在（极小概率，但以防万一）
                if (room.auctions.some(a => a.id === auctionId)) {
                    throw new Error('ID冲突，请重试');
                }

                const auctionData = {
                    id: auctionId,
                    creator: currentChatNick,
                    quality: quality,
                    profession: profession,
                    bonusDmg: bonusDmg,
                    ignoreIce: ignoreIce,
                    image: '',
                    imageGistId: imageGistId || '',
                    startPrice: startPrice,
                    bidIncrement: bidIncrement,
                    startTime: Date.now(),
                    endTime: Date.now() + durationMin * 60 * 1000,
                    bids: [],
                    status: 'active',
                    isExchange: isExchange,
                    exchangeWant: exchangeWant
                };

                room.auctions.push(auctionData);

                let msgContent = '';
                if (isExchange) {
                    msgContent = `🔄 ${currentChatNick} 发布了交换 #${auctionId}：${quality}·${profession}${bonusDmg > 0 ? ' 附加伤害+' + bonusDmg : ''}${ignoreIce > 0 ? ' 无视冰甲+' + ignoreIce : ''}${exchangeWant ? ' 想要：' + exchangeWant : ''}`;
                } else {
                    msgContent = `🔨 ${currentChatNick} 发布了拍卖 #${auctionId}：${quality}·${profession}${bonusDmg > 0 ? ' 附加伤害+' + bonusDmg : ''}${ignoreIce > 0 ? ' 无视冰甲+' + ignoreIce : ''}，起拍价 ${startPrice}`;
                }

                room.messages.push({
                    id: 'msg_' + Date.now(),
                    author: '系统',
                    content: msgContent,
                    time: Date.now()
                });

                const savedGistId = await saveChatRoomData();
                
                closeAuctionPostModal();
                renderAuctionsList();
                renderChatMessages();
                
                // 公告播报拍卖信息
                if (isExchange) {
                    addAuctionBroadcast(`【拍卖行◆${roomId}】${currentChatNick} 上架交换：${quality}·${profession}${bonusDmg > 0 ? ' 附加+' + bonusDmg : ''}${ignoreIce > 0 ? ' 无视+' + ignoreIce : ''}${exchangeWant ? ' 想要:' + exchangeWant : ''}`, roomId);
                } else {
                    addAuctionBroadcast(`【拍卖行◆${roomId}】${currentChatNick} 上架拍卖：${quality}·${profession}${bonusDmg > 0 ? ' 附加+' + bonusDmg : ''}${ignoreIce > 0 ? ' 无视+' + ignoreIce : ''} 起拍${startPrice}`, roomId);
                }
                
                // 显示成功提示
                showAuctionToast('✅ 发布成功！', 'success');
            } catch (error) {
                console.error('发布失败:', error);
                
                // 发布失败时删除已上传的图片
                if (imageGistId) {
                    try {
                        const token = getGistToken();
                        await fetch(`https://api.github.com/gists/${imageGistId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `token ${token}`
                            }
                        });
                    } catch (e) {
                        console.warn('删除图片失败:', e);
                    }
                }
                
                alert('发布失败: ' + error.message);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        }
        
        // 通用提示
        function showToast(message) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:15px 30px;border-radius:10px;font-size:1rem;font-weight:500;z-index:99999;background:rgba(74,222,128,0.9);color:#1a1a2e;animation:fadeInOut 2s ease-in-out;';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }

        // ==================== 下载桌面版 & 版本检查 ====================
        // 注意：当前版本号不再硬编码（容易漏改导致反复弹更新），
        // 改为运行时从 Tauri 取真实版本（Cargo.toml/tauri.conf.json 每次打包都升，不会漏）。
        // 在线版（非 Tauri）没有本地版本，显示为「网页版」。
        let CURRENT_VERSION = '网页版';
        const GITHUB_RELEASES_PAGE = 'https://gyq-svip.github.io/tfjl-web/';
        const VERSION_JSON_URL = 'https://gyq-svip.github.io/tfjl-web/version.json';
        // 更新文件（含安装包下载地址，每次发布都会更新 → 下载地址动态解析，无需手工维护渠道）
        const UPDATER_JSON_URL = 'https://gyq-svip.github.io/tfjl-web/updater.json';

        // ========== 更新预下载状态管理 ==========
        // 启动时后台自动下载新版本，用户点「检查更新」时秒装
        let _currentUpdate = null;      // Tauri Update 对象
        let _currentDownload = null;    // Promise（resolve = 下载完成，reject = 下载失败）
        let _downloadProgress = 0;      // 0-100
        let _downloadSucceeded = false; // 下载是否真的成功完成
        let _updateVersion = null;      // 检测到的新版本号
        const LAST_NOTIFIED_VERSION_KEY = 'tfjl_last_notified_version'; // 防止重复弹出同一版本通知
        const DOWNLOADED_VERSION_KEY = 'tfjl_downloaded_version'; // 已真正下载完成的版本（持久化，避免重复下载）

        function _resetUpdateState() {
            _currentUpdate = null;
            _currentDownload = null;
            _downloadProgress = 0;
            _downloadSucceeded = false;
        }

        function _markDownloadSuccess() {
            _currentDownload = null;
            _downloadSucceeded = true;
        }

        // 用系统默认浏览器打开 URL（APP 内 WebView 拦截 target=_blank）
        // 返回 true=已成功唤起系统浏览器，false=失败（调用方应兜底复制链接）
        async function openUrl(url) {
            if (!url) return false;
            const isTauri = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
            if (isTauri) {
                // Tauri 环境：只能走 Rust 的 open_url 命令（它调系统默认浏览器）。
                // 注意：绝不能回退 window.open —— Tauri 内 window.open 会开【应用内窗口】而非系统浏览器。
                try {
                    const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
                    await invokeFn('open_url', { url: url });
                    return true;
                } catch (e) {
                    console.warn('[openUrl] open_url 命令失败（大概率未授权 allow-open-url），不回退 window.open:', e);
                    return false;
                }
            }
            // 纯网页版（非 Tauri）：直接用 window.open
            try {
                const w = window.open(url, '_blank');
                if (w === null) throw new Error('window.open 被拦截');
                return true;
            } catch (e) {
                console.warn('[openUrl] window.open 失败:', e);
                return false;
            }
        }

        // 运行时填充当前版本号（桌面版从 Tauri 取，在线版保持「网页版」）
        async function fillCurrentVersion() {
            try {
                if (window.__TAURI__ && window.__TAURI__.app && window.__TAURI__.app.getVersion) {
                    const v = await window.__TAURI__.app.getVersion();
                    if (v) CURRENT_VERSION = v;
                }
            } catch (e) {}
            const el = document.getElementById('currentVersionText');
            if (el) el.textContent = CURRENT_VERSION;
            const el2 = document.getElementById('dlCurrentVersion');
            if (el2) el2.textContent = CURRENT_VERSION;
            // 桌面版（Tauri）底部隐藏「下载桌面版」链接（更新统一走菜单），
            // 仅网页版在版本号旁保留该链接用于引导下载 APP
            const dl = document.getElementById('webDownloadLink');
            if (dl) dl.style.display = (window.__TAURI__ ? 'none' : 'inline-flex');
            // 桌面版（Tauri）菜单：隐藏「下载桌面版」、显示「检查更新」；网页版相反
            const dm = document.getElementById('menuDownloadDesktop');
            if (dm) dm.style.display = (window.__TAURI__ ? 'none' : 'flex');
            const cu = document.getElementById('menuCheckUpdateItem');
            if (cu) cu.style.display = (window.__TAURI__ ? 'flex' : 'none');
        }

        // 初始化版本号显示（异步填充，不阻塞）
        function initVersionDisplay() {
            fillCurrentVersion();
        }

        // 打开下载弹窗（网页版用）；桌面版已在 APP 内，直接走 Tauri 自动更新器
        function openDownloadModal() {
            const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
            if (isTauri) {
                // 桌面版不需要「下载桌面版」弹窗，统一走自动更新
                menuCheckUpdate();
                return;
            }
            const modal = document.getElementById('downloadModal');
            if (modal) {
                modal.style.display = 'flex';
                // 自动检查最新版本
                checkLatestReleaseInfo();
            }
        }

        // 关闭下载弹窗
        function closeDownloadModal() {
            const modal = document.getElementById('downloadModal');
            if (modal) modal.style.display = 'none';
        }

        // 获取最新版本信息（从 GitHub Pages 读取，国内可访问）
        async function fetchLatestRelease() {
            try {
                const resp = await fetch(VERSION_JSON_URL, { cache: 'no-cache' });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.version) {
                        return {
                            tag: 'v' + data.version,
                            version: data.version,
                            name: 'v' + data.version,
                            body: '',
                            htmlUrl: data.page || GITHUB_RELEASES_PAGE,
                            downloadUrl: data.downloadUrl || '',
                            size: typeof data.size === 'number' ? data.size : 0,
                            assets: []
                        };
                    }
                }
            } catch (e) {
                console.warn('获取版本信息失败:', e.message);
            }
            return null;
        }

        // 比较版本号（简单语义化比较）
        function isNewerVersion(latest, current) {
            const v1 = latest.split('.').map(Number);
            const v2 = current.split('.').map(Number);
            for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
                const a = v1[i] || 0;
                const b = v2[i] || 0;
                if (a > b) return true;
                if (a < b) return false;
            }
            return false;
        }

        // 检查最新 Release 并在弹窗中显示
        async function checkLatestReleaseInfo() {
            await fillCurrentVersion();
            const statusEl = document.getElementById('dlUpdateStatus');
            const latestInfo = document.getElementById('dlLatestInfo');
            const githubLink = document.getElementById('dlGithubLink');
            if (statusEl) statusEl.textContent = '正在检查...';
            if (latestInfo) latestInfo.textContent = '';

            const release = await fetchLatestRelease();
            if (!release) {
                if (statusEl) statusEl.textContent = '⚠️ 无法获取最新版本信息，请访问 GitHub 页面下载';
                if (githubLink) githubLink.textContent = '前往 GitHub Releases';
                return;
            }

            if (githubLink) {
                // 优先使用直连下载地址（GitHub Pages 国内更快）
                githubLink.href = release.downloadUrl || release.htmlUrl;
                githubLink.textContent = release.downloadUrl ? '📥 直接下载 v' + release.version : 'GitHub Releases 下载';
            }
            if (latestInfo) {
                latestInfo.innerHTML = '<span style="color:#888;">最新版本: </span><span style="color:#4fc3f7;font-weight:bold;">v' + release.version + '</span>';
            }

            // 动态填充软件大小（来自 version.json 的 size 字段，无则回退静态文案）
            const sizeEl = document.getElementById('dlSizeInfo');
            if (sizeEl) {
                if (release.size && release.size > 0) {
                    const mb = (release.size / (1024 * 1024));
                    const sizeTxt = mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(release.size / 1024) + ' KB';
                    sizeEl.innerHTML = '💾 软件大小：约 <b>' + sizeTxt + '</b>（轻量安装包，下载秒完成）';
                }
                // 无 size 字段时保持 HTML 默认静态文案（约 4.5 MB）
            }

            if (isNewerVersion(release.version, CURRENT_VERSION)) {
                if (statusEl) statusEl.innerHTML = '<span style="color:#81c784;">🔄 发现新版本 v' + release.version + '！点击下方按钮直接下载</span>';
                // 在下载弹窗中高亮
                const versionBox = document.getElementById('downloadVersionInfo');
                if (versionBox) versionBox.style.borderColor = 'rgba(76,175,80,0.6)';
                // 显示页脚更新提示
                const badge = document.getElementById('updateBadgeFooter');
                if (badge) badge.style.display = 'inline-block';
            } else if (release.version === CURRENT_VERSION) {
                if (statusEl) statusEl.innerHTML = '<span style="color:#888;">✅ 已是最新版本</span>';
            } else {
                if (statusEl) statusEl.innerHTML = '<span style="color:#ffc107;">ℹ️ 当前版本比 Release 更新（开发版）</span>';
            }
        }

        // 手动检查更新（按钮点击，带加载反馈）
        async function manualCheckUpdate() {
            const btn = document.getElementById('dlCheckUpdateBtn');
            if (!btn) return;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '⏳ 检查中...';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';

            try {
                await checkLatestReleaseInfo();
            } catch (e) {
                const statusEl = document.getElementById('dlUpdateStatus');
                if (statusEl) statusEl.textContent = '⚠️ 检查失败，请稍后重试';
            } finally {
                btn.innerHTML = originalHTML || '🔄 检查更新';
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            }
        }

        // 可持续显示的加载提示（带旋转动画，返回控制对象）
        function showLoadingToast(message) {
            if (!document.getElementById('tfjlSpinStyle')) {
                const s = document.createElement('style');
                s.id = 'tfjlSpinStyle';
                s.textContent = '@keyframes tfjlSpin{to{transform:rotate(360deg)}}';
                document.head.appendChild(s);
            }
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:16px 28px;border-radius:12px;font-size:1rem;font-weight:500;z-index:100000;background:rgba(42,42,74,0.96);color:#fff;box-shadow:0 8px 30px rgba(0,0,0,0.45);display:flex;align-items:center;gap:12px;border:1px solid rgba(255,215,0,0.3);';
            const spinner = document.createElement('div');
            spinner.style.cssText = 'width:18px;height:18px;border:3px solid rgba(255,255,255,0.25);border-top-color:#ffd54f;border-radius:50%;animation:tfjlSpin 0.7s linear infinite;flex-shrink:0;';
            const text = document.createElement('span');
            text.textContent = message;
            toast.appendChild(spinner);
            toast.appendChild(text);
            toast.style.cursor = 'pointer';
            toast.title = '点击可关闭';
            toast.onclick = () => { if (toast.parentNode) toast.remove(); };
            document.body.appendChild(toast);
            return {
                update(msg) { text.textContent = msg; },
                success(msg) { spinner.style.display = 'none'; text.textContent = msg; toast.style.borderColor = 'rgba(76,175,80,0.6)'; },
                error(msg) { spinner.style.display = 'none'; text.textContent = msg; toast.style.borderColor = 'rgba(244,67,54,0.6)'; },
                remove(delay) { setTimeout(() => { if (toast.parentNode) toast.remove(); }, delay || 0); }
            };
        }

        // 菜单「检查更新」：桌面版优先走 Tauri 自动更新器（分离下载/安装 + 进度显示）
        // 启动时后台已预下载完成 → 秒装；下载中 → 显示进度；否则重新走一遍流程
        async function menuCheckUpdate() {
            await fillCurrentVersion();

    // —— 1. 启动时已后台预下载完成？秒装（但先重查最新，避免跨多版本只装到旧缓存）——
    if (_currentUpdate && _downloadSucceeded && !_currentDownload) {
        // 🔴 跨版本修复：点升级前再 check 一次，若线上已有更新版本（如缓存的是 2.0.11、线上已 2.0.12），
        // 必须用最新 Update 对象下载安装，而非直接 install 旧缓存（Tauri update 对象绑定了 check 时的版本）。
        let installTarget = _currentUpdate;
        try {
            if (window.__TAURI__ && window.__TAURI__.updater) {
                const re = await window.__TAURI__.updater.check();
                const fresh = re && (re.update || re);
                if (fresh && isNewerVersion(fresh.version, _updateVersion || '')) {
                    installTarget = fresh;
                    _updateVersion = fresh.version;
                    _currentUpdate = fresh;
                }
            }
        } catch (reErr) { /* 重查失败则用已缓存对象，不阻断升级 */ }

        const t = showLoadingToast('⚡ 正在安装 v' + _updateVersion + '...');
        try {
            await new Promise(r => setTimeout(r, 300)); // 给 Tauri Rust 侧一点时间完成最终化
            if (typeof installTarget.install === 'function') {
                await installTarget.install();
            }
            t.success('✅ 安装完成，即将重启...');
            t.remove(1500);
            setTimeout(() => {
                try { window.__TAURI__.updater.relaunch(); } catch(e) {}
            }, 800);
            return;
        } catch (e) {
            console.warn('[updater] 安装已下载包失败，回退 downloadAndInstall:', e);
            t.error('⚠️ 安装失败，重试中...');
            t.remove(2000);
            _resetUpdateState();
            // 不 return，继续走下方完整流程
        }
    }

            // —— 2. 启动时还在后台下载中？等待完成 ——
            if (_currentDownload) {
                const t = showLoadingToast('📥 后台下载中 ' + _downloadProgress + '%');
                const start = Date.now();
                let lastPct = _downloadProgress;
                while (_currentDownload && Date.now() - start < 300000) {
                    await new Promise(r => setTimeout(r, 500));
                    if (_downloadProgress !== lastPct) {
                        lastPct = _downloadProgress;
                        t.update('📥 下载中 ' + lastPct + '%');
                    }
                }
                if (!_currentDownload && _downloadSucceeded) {
                    try {
                        t.update('📦 正在安装 v' + _updateVersion + '...');
                        if (_currentUpdate && typeof _currentUpdate.install === 'function') {
                            await _currentUpdate.install();
                        }
                        t.success('✅ 安装完成，即将重启...');
                        t.remove(1500);
                        setTimeout(() => {
                            try { window.__TAURI__.updater.relaunch(); } catch(e) {}
                        }, 800);
                        return;
                    } catch (e) {
                        t.error('⚠️ 安装失败，请重试');
                        t.remove(2500);
                        _resetUpdateState();
                        return;
                    }
                }
                // 等到的结果是失败，清空状态继续走下方完整流程重试
                _resetUpdateState();
            }

            // —— 3. 正常流程：检查 → 下载（带进度） → 安装 ——
            const t = showLoadingToast('🔍 正在检查更新...（点击可取消）');
            try {
                if (window.__TAURI__ && window.__TAURI__.updater) {
                    try {
                        const updater = window.__TAURI__.updater;
                        // 给 updater.check() 加超时，避免网络/代理卡住导致永久 pending
                        const _checkTimeout = (p, ms) => Promise.race([
                            p,
                            new Promise((_, rej) => setTimeout(() => rej(new Error('检查更新超时')), ms))
                        ]);
                        const result = await _checkTimeout(updater.check(), 15000);
                        const update = result && (result.update || result);
                        if (update) {
                            _updateVersion = update.version || CURRENT_VERSION;
                            _currentUpdate = update;

                            if (typeof update.download === 'function') {
                                let downloadDone = false;
                                let totalBytes = 0;
                                let downloadedBytes = 0;
                                _currentDownload = new Promise((resolve, reject) => {
                                    update.download((event) => {
                                        if (downloadDone) return;
                                        if (event.event === 'Started') {
                                            totalBytes = event.data && event.data.contentLength ? event.data.contentLength : 0;
                                        } else if (event.event === 'Progress') {
                                            downloadedBytes += event.data && event.data.chunkLength ? event.data.chunkLength : 0;
                                            if (totalBytes > 0) {
                                                _downloadProgress = Math.round((downloadedBytes / totalBytes) * 100);
                                            }
                                            t.update('📥 下载中 ' + _downloadProgress + '%');
                                        } else if (event.event === 'Finished') {
                                            _downloadProgress = 100;
                                            downloadDone = true;
                                            resolve();
                                        }
                                    }).then(() => {
                                        if (!downloadDone) { _downloadProgress = 100; downloadDone = true; resolve(); }
                                    }).catch(reject);
                                });

                                try {
                                    await _currentDownload;
                                    _markDownloadSuccess();
                                    // 给 Tauri Rust 侧一点时间完成最终化（避免 install 抢跑）
                                    await new Promise(r => setTimeout(r, 300));

                                    t.update('📦 正在安装...');
                                    await update.install();
                                    t.success('✅ 安装完成，即将重启...');
                                    t.remove(1500);
                                    setTimeout(() => updater.relaunch(), 800);
                                    return;
                                } catch (installErr) {
                                    // install 失败（最常见原因：代理阻塞下载没真正完成）
                                    // 兜底：一次性 downloadAndInstall 让 Tauri 内部重试
                                    console.warn('[updater] 分离式 install 失败，回退 downloadAndInstall:', installErr);
                                    _resetUpdateState();
                                    const t2 = showLoadingToast('📥 重新下载并安装 v' + _updateVersion + '...');
                                    try {
                                        await update.downloadAndInstall();
                                        t2.success('✅ 更新完成，即将重启...');
                                        t2.remove(1500);
                                        setTimeout(() => updater.relaunch(), 800);
                                        return;
                                    } catch (fallbackErr) {
                                        const errMsg = String(fallbackErr && (fallbackErr.message || fallbackErr) || '未知错误');
                                        try { window.__tfjlUpdaterError = errMsg; } catch(e) {}
                                        _resetUpdateState();
                                        // 兜底仍失败 → 弹窗引导手动下载最新版（地址动态解析自 updater.json）
                                        showUpdateFailedModal(errMsg, _updateVersion);
                                    }
                                }
                            }

                            // 旧版 updater 不支持 download()，用 downloadAndInstall 兜底
                            t.update('📥 发现新版本 v' + _updateVersion + '，正在下载安装...');
                            await update.downloadAndInstall();
                            t.success('✅ 更新完成，即将重启...');
                            t.remove(1500);
                            setTimeout(() => updater.relaunch(), 800);
                            return;
                        }
                        t.success('✅ 当前已是最新版本 v' + CURRENT_VERSION);
                        t.remove(2500);
                        return;
                    } catch (e) {
                        const errMsg = String(e && (e.message || e) || '未知错误');
                        console.warn('[updater] 自动更新失败，回退手动检查:', e);
                        _resetUpdateState();
                        // 把真实错误暂存，fallback 时展示给用户，而不是一刀切说"代理"
                        try { window.__tfjlUpdaterError = errMsg; } catch(e2) {}
                    }
                }
                // 网页版 / updater 不可用时：检查 version.json
                const release = await fetchLatestRelease();
                if (!release) {
                    t.error('⚠️ 无法获取版本信息，请检查网络后重试');
                    t.remove(2800);
                    return;
                }
                if (isNewerVersion(release.version, CURRENT_VERSION)) {
                    const badge = document.getElementById('updateBadgeFooter');
                    if (badge) badge.style.display = 'inline-block';
                    const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
                    if (isTauri) {
                        // Tauri 自动更新器走到这里说明 updater 失败 → 弹窗引导手动下载（地址动态解析自 updater.json）
                        const realErr = window.__tfjlUpdaterError || '';
                        t.remove(0);
                        showUpdateFailedModal(realErr, release.version);
                    } else {
                        t.success('🎉 发现新版本 v' + release.version + '，即将打开下载...');
                        t.remove(1800);
                        setTimeout(() => openDownloadModal(), 1300);
                    }
                } else {
                    t.success('✅ 当前已是最新版本 v' + CURRENT_VERSION);
                    t.remove(2500);
                }
            } catch (e) {
                console.warn('[updater] menuCheckUpdate 异常:', e);
                _resetUpdateState();
                t.error('⚠️ 检查失败，请稍后重试');
                t.remove(2800);
            }
        }

        // 菜单「刷新最新资源」：清理所有缓存并强制重新加载，确保拿到最新前端
        // 核心优化：用时间戳 URL 强刷，彻底绕过浏览器/SW/WebView 各级缓存
        async function forceRefreshLatest() {
            // 🔴 关键修复：升级/强刷前，先把当前编辑中的项目、记事本等数据落盘，
            // 避免「编辑一半突然自动升级」导致未保存内容丢失（用户明确要求：自动升级绝不能丢数据）。
            try {
                if (typeof window.__tfjlSaveAllProjects === 'function') {
                    const list = (typeof window.__tfjlLoadProjectList === 'function')
                        ? await window.__tfjlLoadProjectList() : null;
                    if (list) await window.__tfjlSaveAllProjects(list);
                }
            } catch (e) { console.warn('[升级前落盘] 失败（不阻塞升级）:', e); }
            // 不弹"清理缓存/跳过SW"提示框（用户要求静默强刷）
            const t = { success() {} };
            try {
                // 1. 通知 Service Worker 清缓存
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    await new Promise((resolve) => {
                        let done = false;
                        const onMsg = (e) => {
                            if (e.data === 'CACHE_CLEARED' && !done) {
                                done = true;
                                navigator.serviceWorker.removeEventListener('message', onMsg);
                                resolve();
                            }
                        };
                        navigator.serviceWorker.addEventListener('message', onMsg);
                        navigator.serviceWorker.controller.postMessage('CLEAR_CACHE');
                        setTimeout(() => { if (!done) { done = true; resolve(); } }, 2500);
                    });
                }
                // 2. 双保险：直接清空 CacheStorage
                if (window.caches) {
                    const names = await caches.keys();
                    await Promise.all(names.map((n) => caches.delete(n)));
                }
                // 2.5 🔴 关键修复：sw.js 改为"安装后 waiting 不自动激活"，
                // 仅删缓存+reload 不足以让新 SW 接管（旧 SW 仍按旧 CACHE_VERSION 重新缓存旧文件 → 永远拿不到新版）。
                // 必须显式让处于 waiting 的新 SW 立即激活(skipWaiting)，否则强制刷新后仍是旧版。
                if ('serviceWorker' in navigator) {
                    try {
                        const reg = await navigator.serviceWorker.getRegistration();
                        if (reg && reg.waiting) {
                            reg.waiting.postMessage('SKIP_WAITING');
                        }
                        // 也尝试直接给当前 controller 发（兼容某些状态）
                        if (navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
                        }
                    } catch (e) {}
                }
                // 3. 清除 localStorage 标记 + 启动动画标记
                try {
                    localStorage.removeItem('TFJL_NotFirst');
                    localStorage.removeItem('TFJL_CachedHTML');
                    // 🔴 修复：静默强刷(小版本自动升级)后声望面板状态被重置的 bug。
                    // 声望面板：把当前真实显示状态再固化一次（关=0 保持关，开=1 保持开），强刷后初始化读取不回退默认开启。
                    // 注：消息墙红点已改为「已读指纹集合」(TFJL_WallReadKeys) 持久化，强刷自动保留，无需在此处理；
                    //     此前基于时间戳(TFJL_WallLastSeen)的方案会因跨设备时钟不一致误判未读，已废弃。
                    try {
                        const rp = document.getElementById('reputationPanel');
                        if (rp) localStorage.setItem('TFJL_RepPanelOpen', (rp.style.display === 'flex') ? '1' : '0');
                    } catch (e) {}
                } catch(e) {}
                // 4. 🔴 强制注销当前所有 SW 注册（无条件）。
                // 之前只在"无 waiting SW"时才 unregister，但线上已部署新 SW(228)、旧 SW(225) 仍
                // controlling + 新 SW 处于 waiting 时，skipWaiting 异步未生效 → reload 后仍被旧 SW 接管，
                // 页面一直显示 HTML 写死的 fallback "s1.0.225" 拿不到 228。
                // 直接 unregister 全部 + 清空 cache，reload 后浏览器重新 install 最新 228 SW，干净彻底。
                if ('serviceWorker' in navigator) {
                    try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map(r => r.unregister()));
                    } catch (e) {}
                }
            } catch (e) { /* 清理阶段出错不阻塞，继续强刷 */ }
            // 强刷：带时间戳 URL + hard reload，彻底绕过各级缓存
            t.success('✅ 已获取最新，正在重新加载...');
            setTimeout(() => {
                const url = new URL(location.href);
                url.searchParams.set('_t', Date.now());
                // 用 location.replace 替换当前历史，避免回退到旧缓存版本
                location.replace(url.toString());
            }, 800);
        }

        // 菜单「更新皮肤资源」：优先从 Gitee 发行版下载皮肤包解压到本地（本地化，无网可用）；
        // 本地化命令不可用时回退在线同步（jsDelivr 主源，GitHub Pages 兜底），force=true 允许重复触发
        async function updateSkinsResource() {
            const t = showLoadingToast('🎨 正在更新皮肤资源...');
            try {
                // 先清旧皮肤缓存（删除旧皮肤再下载新包，避免残留旧皮肤导致不刷新/异常）
                if (typeof window.clearSkinIdbCache === 'function') { try { await window.clearSkinIdbCache(); } catch (e) {} }
                const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
                if (typeof invokeFn === 'function') {
                    try {
                        await invokeFn('download_skins');
                        if (typeof window.scanSkins === 'function') window.scanSkins();
                    } catch (e) {
                        console.warn('[SKIN] 本地下载失败，回退在线同步:', e);
                    }
                }
                if (typeof window.syncRemoteSkins === 'function') {
                    await window.syncRemoteSkins(true);
                }
                t.success('✅ 皮肤资源已更新');
            } catch (e) {
                t.error('❌ 皮肤更新失败: ' + (e && e.message ? e.message : e));
            } finally {
                // 修复：showLoadingToast 返回的对象只有 remove()，没有 close()，之前 t.close() 永远不执行导致 loading 不消失
                if (t && t.remove) t.remove(2000);
            }
        }

        // 检查更新（静默模式，在 App 启动时使用）
        async function checkForUpdates() {
            await fillCurrentVersion();
            const release = await fetchLatestRelease();
            if (!release) {
                showToast('⚠️ 无法获取最新版本信息');
                return false;
            }

            if (isNewerVersion(release.version, CURRENT_VERSION)) {
                return { hasUpdate: true, version: release.version, url: release.downloadUrl || release.htmlUrl };
            }
            return { hasUpdate: false, version: CURRENT_VERSION };
        }

        // ========== 更新失败补救：弹窗 + 动态下载地址 + 选择保存位置 ==========

        // 解析 updater.json，拿到当前最新安装包下载地址（Gitee 安装包，每次发布都会更新）
        async function fetchInstallerInfo() {
            try {
                const resp = await fetch(UPDATER_JSON_URL, { cache: 'no-cache' });
                if (!resp.ok) throw new Error('获取更新文件失败');
                const data = await resp.json();
                const url = data && data.platforms && data.platforms.windows && data.platforms.windows.url;
                if (!url) throw new Error('更新文件缺少下载地址');
                const fileName = decodeURIComponent(url.split('?')[0].split('/').pop()) || 'tfjl-assistant-setup.exe';
                return { url: url, version: data.version || '', fileName: fileName };
            } catch (e) {
                console.warn('[updater] 解析 updater.json 失败:', e);
                return null;
            }
        }

        // ArrayBuffer -> base64（用于二进制安装包写盘）
        function arrayBufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
        }

        // 弹出「更新失败」引导弹窗（含「下载最新版」按钮，地址动态解析自 updater.json）
        async function showUpdateFailedModal(errMsg, version) {
            const info = await fetchInstallerInfo();
            const dlUrl = info ? info.url : '';
            const dlFallback = info ? info.fallbackUrl : '';
            const dlVer = (info && info.version) ? info.version : (version || '');
            const dlName = info ? info.fileName : 'tfjl-assistant-setup.exe';

            const modal = document.createElement('div');
            modal.id = 'updateFailedModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:100001;';
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#2a1a1a,#3a1620);border:2px solid rgba(255,82,82,0.6);border-radius:16px;padding:24px;max-width:460px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                        <span style="color:#ff5252;font-size:1.1rem;font-weight:bold;">⚠️ 自动更新失败</span>
                        <span onclick="document.getElementById('updateFailedModal').remove()" style="cursor:pointer;color:rgba(255,255,255,0.4);font-size:1.5rem;line-height:1;">×</span>
                    </div>
                    <div style="color:rgba(255,255,255,0.7);font-size:0.82rem;line-height:1.6;margin-bottom:8px;">
                        自动更新没能完成（可能是网络/代理或签名校验问题）。请下载最新版手动安装，安装包会覆盖升级、数据不丢。
                    </div>
                    <div style="color:rgba(255,255,255,0.45);font-size:0.72rem;word-break:break-all;background:rgba(0,0,0,0.3);padding:8px 10px;border-radius:8px;margin-bottom:14px;">
                        ${errMsg ? ('错误: ' + (errMsg.length > 80 ? errMsg.slice(0, 78) + '…' : errMsg)) : ''}
                    </div>
                    <button id="_updDlBtn" style="width:100%;background:linear-gradient(135deg,#ff9800,#f57c00);color:#fff;border:none;padding:12px;border-radius:10px;cursor:pointer;font-size:0.95rem;font-weight:bold;">
                        📥 下载最新版${dlVer ? ' v' + dlVer : ''}
                    </button>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <button id="_updCopyBtn" style="flex:1;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);padding:9px;border-radius:8px;cursor:pointer;font-size:0.8rem;">📋 复制地址</button>
                        <button id="_updBrowserBtn" style="flex:1;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);padding:9px;border-radius:8px;cursor:pointer;font-size:0.8rem;">🌐 浏览器打开</button>
                    </div>
                    <div style="color:rgba(255,255,255,0.3);font-size:0.68rem;text-align:center;margin-top:12px;">下载地址随每次发布自动更新，无需手动维护</div>
                </div>`;
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);

            const dlBtn = document.getElementById('_updDlBtn');
            const copyBtn = document.getElementById('_updCopyBtn');
            const browserBtn = document.getElementById('_updBrowserBtn');

            // 给弹窗按钮加「按下」视觉反馈（缩放+高亮），让用户明确感知点中了
            function _updBtnFeedback(btn) {
                if (!btn) return;
                btn.style.transition = 'transform 0.08s ease, filter 0.08s ease, opacity 0.12s ease';
                const press = () => { btn.style.transform = 'scale(0.95)'; btn.style.filter = 'brightness(1.18)'; };
                const release = () => { btn.style.transform = 'scale(1)'; btn.style.filter = ''; };
                btn.addEventListener('mousedown', press);
                btn.addEventListener('mouseup', release);
                btn.addEventListener('mouseleave', release);
                btn.addEventListener('touchstart', press, { passive: true });
                btn.addEventListener('touchend', release);
            }
            _updBtnFeedback(dlBtn); _updBtnFeedback(copyBtn); _updBtnFeedback(browserBtn);

            if (dlBtn) dlBtn.onclick = () => {
                dlBtn.disabled = true;
                dlBtn.style.opacity = '0.65';
                dlBtn.style.pointerEvents = 'none';
                dlBtn.innerHTML = '⏳ 正在打开下载...';
                showToast('📥 正在打开下载窗口');
                setTimeout(() => { modal.remove(); showInstallerSaveDialog(dlUrl, dlVer, dlName, dlFallback); }, 180);
            };
            if (copyBtn) copyBtn.onclick = () => {
                if (!dlUrl) { showToast('⚠️ 没有可用的下载地址'); return; }
                try {
                    navigator.clipboard.writeText(dlUrl);
                    copyBtn.innerHTML = '✓ 已复制';
                    copyBtn.style.background = 'rgba(76,175,80,0.35)';
                    copyBtn.style.borderColor = 'rgba(76,175,80,0.6)';
                    copyBtn.style.color = '#a5d6a7';
                    showToast('✅ 已复制下载地址');
                    setTimeout(() => {
                        copyBtn.innerHTML = '📋 复制地址';
                        copyBtn.style.background = ''; copyBtn.style.borderColor = ''; copyBtn.style.color = '';
                    }, 1600);
                } catch (e) { showToast('复制失败: ' + dlUrl); }
            };
            if (browserBtn) browserBtn.onclick = async () => {
                if (!dlUrl) { showToast('⚠️ 没有可用的下载地址'); return; }
                browserBtn.innerHTML = '⏳ 打开中...';
                browserBtn.disabled = true;
                try {
                    const ok = await openUrl(dlUrl);
                    if (ok) {
                        browserBtn.innerHTML = '✓ 已打开';
                        browserBtn.style.background = 'rgba(76,175,80,0.35)';
                        browserBtn.style.borderColor = 'rgba(76,175,80,0.6)';
                        browserBtn.style.color = '#a5d6a7';
                        // 直接 .exe 链接浏览器会静默下到「下载」文件夹，明确提示用户去哪找
                        showToast('🌐 已用浏览器开始下载（文件存到「下载」文件夹）');
                    } else {
                        // 打开失败 → 兜底：复制链接到剪贴板，保证用户一定有地址可用
                        try {
                            navigator.clipboard.writeText(dlUrl);
                            browserBtn.innerHTML = '📋 已复制链接';
                            browserBtn.style.background = 'rgba(76,175,80,0.35)';
                            browserBtn.style.borderColor = 'rgba(76,175,80,0.6)';
                            browserBtn.style.color = '#a5d6a7';
                            showToast('⚠️ 浏览器打开失败，已复制地址，请粘贴到浏览器下载');
                        } catch (e2) {
                            browserBtn.innerHTML = '⚠️ 打开失败';
                            showToast('打开失败，地址：' + dlUrl);
                        }
                    }
                } catch (e) {
                    browserBtn.innerHTML = '⚠️ 打开失败';
                    showToast('打开失败：' + (e && e.message ? e.message : e));
                }
                setTimeout(() => {
                    browserBtn.innerHTML = '🌐 浏览器打开';
                    browserBtn.style.background = ''; browserBtn.style.borderColor = ''; browserBtn.style.color = '';
                    browserBtn.disabled = false;
                }, 1800);
            };
        }

        // 选择保存位置并把安装包下载到该文件夹（复用「需求墙下载」那种文件夹选择器）
        async function showInstallerSaveDialog(url, version, fileName) {
            if (!url) { alert('未获取到下载地址'); return; }
            const safeName = fileName || 'tfjl-assistant-setup.exe';

            const modal = document.createElement('div');
            modal.id = 'installerSaveModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100000;';
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,152,0,0.5);border-radius:16px;padding:24px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
                        <div>
                            <span style="color:#ff9800;font-size:1.1rem;font-weight:bold;">📥 保存安装包</span>
                            <div style="color:rgba(255,255,255,0.4);font-size:0.72rem;margin-top:4px;">${safeName}${version ? ('  ·  v' + version) : ''}</div>
                        </div>
                        <span onclick="document.getElementById('installerSaveModal').remove()" style="cursor:pointer;color:rgba(255,255,255,0.4);font-size:1.5rem;line-height:1;">×</span>
                    </div>
                    <div style="color:rgba(255,255,255,0.5);font-size:0.76rem;margin-bottom:12px;">选择文件夹，安装包将下载并保存到该位置（覆盖升级，数据不丢）。</div>
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="font-size:1.2rem;">📂</span>
                            <button id="_instPickBtn" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:#fff;border:none;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;">浏览文件夹...</button>
                            <span id="_instFolderText" style="color:rgba(255,255,255,0.35);font-size:0.75rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">未选择</span>
                        </div>
                        <div id="_instPreview" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
                            <div style="color:#4caf50;font-size:0.75rem;margin-bottom:8px;word-break:break-all;" id="_instFullPath"></div>
                            <button id="_instSaveBtn" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border:none;padding:9px 20px;border-radius:8px;cursor:pointer;font-size:0.85rem;width:100%;">✅ 下载并保存到此处</button>
                        </div>
                    </div>
                    <button id="_instCancel" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;cursor:pointer;font-size:0.85rem;width:100%;margin-top:12px;">取消</button>
                </div>`;
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);

            let selectedFolder = '';
            const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;

            const pickBtn = document.getElementById('_instPickBtn');
            const cancelBtn = document.getElementById('_instCancel');
            const saveBtn = document.getElementById('_instSaveBtn');
            // 按下缩放+高亮反馈
            function _instBtnFeedback(btn) {
                if (!btn) return;
                btn.style.transition = 'transform 0.08s ease, filter 0.08s ease';
                const press = () => { btn.style.transform = 'scale(0.95)'; btn.style.filter = 'brightness(1.15)'; };
                const release = () => { btn.style.transform = 'scale(1)'; btn.style.filter = ''; };
                btn.addEventListener('mousedown', press);
                btn.addEventListener('mouseup', release);
                btn.addEventListener('mouseleave', release);
                btn.addEventListener('touchstart', press, { passive: true });
                btn.addEventListener('touchend', release);
            }
            _instBtnFeedback(pickBtn); _instBtnFeedback(cancelBtn); _instBtnFeedback(saveBtn);

            if (pickBtn) pickBtn.onclick = async () => {
                try {
                    const folder = invokeFn ? await invokeFn('open_directory_dialog') : null;
                    if (!folder) return;
                    selectedFolder = folder;
                    const ft = document.getElementById('_instFolderText');
                    if (ft) { ft.textContent = folder; ft.style.color = 'rgba(255,255,255,0.8)'; }
                    const fp = document.getElementById('_instFullPath');
                    if (fp) fp.textContent = folder.replace(/[\\/]+$/, '') + '\\' + safeName;
                    const pv = document.getElementById('_instPreview');
                    if (pv) pv.style.display = 'block';
                } catch (e) { console.warn('目录选择失败:', e); }
            };
            if (cancelBtn) cancelBtn.onclick = () => modal.remove();
            if (saveBtn) saveBtn.onclick = async () => {
                if (!selectedFolder) return;
                const savePath = selectedFolder.replace(/[\\/]+$/, '') + '\\' + safeName;
                const t = showLoadingToast('⏳ 正在下载安装包...');
                try {
                    const resp = await fetch(url, { cache: 'no-cache' });
                    if (!resp.ok) throw new Error('下载失败 (' + resp.status + ')');
                    const buf = await resp.arrayBuffer();
                    if (t && t.update) t.update('💾 正在保存到 ' + safeName + ' ...');
                    const b64 = arrayBufferToBase64(buf);
                    if (!invokeFn) throw new Error('当前环境不支持本地保存');
                    await invokeFn('write_binary_file', { filePath: savePath, contentBase64: b64 });
                    if (t && t.success) { t.success('✅ 已保存: ' + safeName); t.remove(2600); }
                    modal.remove();
                    showToast('✅ 安装包已保存到：' + savePath);
                } catch (e) {
                    console.warn('[updater] 安装包保存失败，回退浏览器下载:', e);
                    if (t && t.error) { t.error('⚠️ 本地下载失败，改用浏览器下载'); t.remove(2500); }
                    // openUrl 在 Tauri 内若未能唤起系统浏览器，则复制链接兜底，保证用户一定有地址可用
                    const opened = await openUrl(url);
                    if (!opened) {
                        try {
                            navigator.clipboard.writeText(url);
                            showToast('⚠️ 浏览器打开失败，已复制地址，请粘贴到浏览器下载');
                        } catch (e2) {
                            showToast('下载失败：' + url);
                        }
                    }
                }
            };
        }

        // App 启动时后台自动检查更新 + 预下载（用户点「检查更新」时秒装）
        // 注意：自动检测有去重逻辑（同一版本只通知一次），手动「检查更新」无去重（用户主动触发应如实反馈）
        async function autoCheckUpdate() {
            const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
            if (!isTauri) return;

            // 先填充当前版本号（避免竞态：Tauri updater 失败时 fallback 依赖正确的 CURRENT_VERSION）
            await fillCurrentVersion();

            try {
                // —— 优先走 Tauri updater：后台静默下载 ——
                if (window.__TAURI__ && window.__TAURI__.updater) {
                    try {
                        const updater = window.__TAURI__.updater;
                        const result = await updater.check();
                        const update = result && (result.update || result);
                        if (!update) {
                            // 确实已是最新 → 清除旧版本通知/下载记录（比如用户降级后又升级的场景）
                            try {
                                localStorage.removeItem(LAST_NOTIFIED_VERSION_KEY);
                                localStorage.removeItem(DOWNLOADED_VERSION_KEY);
                            } catch(e) {}
                            return;
                        }

                        const newVer = update.version || 'latest';
                        _updateVersion = newVer;
                        _currentUpdate = update;
                        _markVersionNew(newVer); // 版本号旁闪动提示升级

                        // —— 去重：只控制「是否弹 toast」，【绝不能阻止下载】——
                        // 旧逻辑曾把「已通知」误当「已下载」直接 return，导致下载被跳过、自动更新形同虚设。
                        // 现在下载始终执行；用 DOWNLOADED_VERSION_KEY 记录真正下载过的版本，避免每次启动重复下载。
                        const getLS = (k) => { try { return localStorage.getItem(k) || ''; } catch(e) { return ''; } };
                        const lastNotified = getLS(LAST_NOTIFIED_VERSION_KEY);
                        const downloadedVer = getLS(DOWNLOADED_VERSION_KEY);
                        const isFirstDownload = (downloadedVer !== newVer); // 本版本尚未真正下载过

                        if (typeof update.download === 'function') {
                            // 已下载完成且已通知过 → 仅确保角标常驻，不重复下载/弹窗
                            if (_downloadSucceeded && !isFirstDownload && lastNotified === newVer) {
                                const badge = document.getElementById('updateBadgeFooter');
                                if (badge) badge.style.display = 'inline-block';
                                return;
                            }

                            // 后台静默下载（不弹 toast，不打扰用户）
                            let downloadDone = false;
                            let totalBytes = 0;
                            let downloadedBytes = 0;
                            _currentDownload = new Promise((resolve, reject) => {
                                update.download((event) => {
                                    if (downloadDone) return;
                                    if (event.event === 'Started') {
                                        totalBytes = event.data && event.data.contentLength ? event.data.contentLength : 0;
                                    } else if (event.event === 'Progress') {
                                        downloadedBytes += event.data && event.data.chunkLength ? event.data.chunkLength : 0;
                                        if (totalBytes > 0) {
                                            _downloadProgress = Math.round((downloadedBytes / totalBytes) * 100);
                                        }
                                    } else if (event.event === 'Finished') {
                                        _downloadProgress = 100;
                                        downloadDone = true;
                                        resolve();
                                    }
                                }).then(() => {
                                    if (!downloadDone) { _downloadProgress = 100; downloadDone = true; resolve(); }
                                }).catch(reject);
                            });

                            await _currentDownload;
                            _markDownloadSuccess();
                            // 记录已下载版本（持久化，避免每次启动重复下载）
                            try { localStorage.setItem(DOWNLOADED_VERSION_KEY, newVer); } catch(e) {}
                            // 首下载（含脏数据场景：LAST_NOTIFIED 被旧 fallback 污染但从未真下载过）
                            // 或尚未通知过 → 弹「已下载完成」提示；否则仅常驻角标
                            if (isFirstDownload || lastNotified !== newVer) {
                                try { localStorage.setItem(LAST_NOTIFIED_VERSION_KEY, newVer); } catch(e) {}
                                _notifyPreDownloadReady();
                            }
                            return;
                        }
                        // 旧版 updater 无 download()，退回到仅提示
                        if (lastNotified !== newVer) {
                            try { localStorage.setItem(LAST_NOTIFIED_VERSION_KEY, newVer); } catch(e) {}
                            _notifyNewVersion(newVer);
                        }
                        return;
                    } catch (e) {
                        const errMsg = String(e && (e.message || e) || '未知错误');
                        console.warn('[auto-update] Tauri updater 后台预下载失败:', e);
                        try { window.__tfjlUpdaterError = errMsg; } catch(e2) {}
                        _resetUpdateState();
                    }
                }

                // —— 退回到 version.json 仅提示（网页版/旧版） ——
                const result = await checkForUpdates();
                if (result && result.hasUpdate) {
                    const lastNotified = (function(){ try { return localStorage.getItem(LAST_NOTIFIED_VERSION_KEY) || ''; } catch(e) { return ''; } })();
                    if (lastNotified !== result.version) {
                        try { localStorage.setItem(LAST_NOTIFIED_VERSION_KEY, result.version); } catch(e) {}
                        _notifyNewVersion(result.version);
                    }
                }
            } catch (e) {
                console.warn('自动检查更新失败:', e);
            }
        }

        // 下载完成提示（预下载成功，点击秒装）
        function _notifyPreDownloadReady() {
            const badge = document.getElementById('updateBadgeFooter');
            if (badge) badge.style.display = 'inline-block';
            _markVersionNew(_updateVersion);
            setTimeout(() => {
                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:12px 25px;border-radius:10px;font-size:0.95rem;font-weight:500;z-index:99999;background:rgba(76,175,80,0.9);color:#fff;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:transform 0.2s;';
                toast.textContent = '✅ v' + _updateVersion + ' 已下载完成，点击立即更新';
                toast.addEventListener('mouseenter', () => { toast.style.transform = 'translateX(-50%) scale(1.05)'; });
                toast.addEventListener('mouseleave', () => { toast.style.transform = 'translateX(-50%) scale(1)'; });
                toast.onclick = function() { menuCheckUpdate(); toast.remove(); };
                document.body.appendChild(toast);
                setTimeout(() => { if (toast.parentNode) toast.remove(); }, 15000);
            }, 2000);
        }

        // 仅检测到新版本但未下载（显示提示）
        // APP 内点击走 Tauri 自动更新；网页版才打开下载弹窗
        function _notifyNewVersion(version) {
            const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
            const badge = document.getElementById('updateBadgeFooter');
            if (badge) badge.style.display = 'inline-block';
            _markVersionNew(version);
            setTimeout(() => {
                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:12px 25px;border-radius:10px;font-size:0.95rem;font-weight:500;z-index:99999;background:rgba(76,175,80,0.9);color:#fff;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
            toast.textContent = isTauri
                    ? '🔄 有新版本 v' + version + '！点击立即更新'
                    : '🔄 有新版本 v' + version + ' 可下载！点击查看';
                toast.onclick = function() {
                    if (isTauri) { menuCheckUpdate(); }
                    else { openDownloadModal(); }
                    toast.remove();
                };
                document.body.appendChild(toast);
                setTimeout(() => { if (toast.parentNode) toast.remove(); }, isTauri ? 15000 : 8000);
            }, 2000);
        }

        // 在「版本：X」文字旁闪动提示有新版本（用户要求：版本号处直观提示升级）
        function _markVersionNew(version) {
            // 注入闪动动画样式（仅一次）
            if (!document.getElementById('__verFlashStyle')) {
                const s = document.createElement('style');
                s.id = '__verFlashStyle';
                s.textContent = '@keyframes verNewFlash{0%,100%{color:#ffd700;opacity:1;}50%{color:#4caf50;opacity:0.45;}}'
                    + '.ver-new-flash{animation:verNewFlash 1.1s ease-in-out infinite;}';
                document.head.appendChild(s);
            }
            const el = document.getElementById('currentVersionText');
            if (el) {
                el.classList.add('ver-new-flash');
                el.style.cursor = 'pointer';
                el.title = '发现新版本 v' + version + '，点击立即更新';
                el.onclick = function() { if (typeof menuCheckUpdate === 'function') menuCheckUpdate(); };
            }
            const hint = document.getElementById('versionUpdateHint');
            if (hint) {
                hint.textContent = '🔔 新版本 v' + version;
                hint.style.display = 'inline-flex';
            }
        }

        // 显示拍卖操作提示
        function showAuctionToast(message, type) {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 15px 30px;
                border-radius: 10px;
                font-size: 1rem;
                font-weight: 500;
                z-index: 99999;
                animation: fadeInOut 2s ease-in-out;
                ${type === 'success' ? 'background: rgba(74,222,128,0.9); color: #1a1a2e;' : 'background: rgba(239,68,68,0.9); color: white;'}
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }

        function getQualityColor(q) {
            const map = { '红色': '#ef4444', '金色': '#ffd700', '紫色': '#a78bfa', '蓝色': '#60a5fa', '绿色': '#4ade80' };
            return map[q] || 'rgba(255,255,255,0.6)';
        }

        function renderAuctionsList() {
            const container = document.getElementById('auctionsListContainer');
            const room = getRoomData();
            
            if (!room || ((!room.auctions || room.auctions.length === 0) && (!room.buyRequests || room.buyRequests.length === 0))) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;">暂无拍卖和求购</div>';
                return;
            }

            // 保存当前输入的自定义出价值
            const savedInputs = {};
            container.querySelectorAll('input[id^="quickBidInput_"]').forEach(input => {
                savedInputs[input.id] = input.value;
            });

            const now = Date.now();
            let html = '';

            // 渲染求购列表
            if (room.buyRequests && room.buyRequests.length > 0) {
                // 清理过期的求购
                room.buyRequests = room.buyRequests.filter(br => now < br.expireTime && br.status === 'active');
                
                html += room.buyRequests.slice().reverse().map(br => {
                    // quality和profession可能是数组（新格式）或字符串（旧格式）
                    const qArr = Array.isArray(br.quality) ? br.quality : (br.quality && br.quality !== '不限' ? [br.quality] : []);
                    const pArr = Array.isArray(br.profession) ? br.profession : (br.profession && br.profession !== '不限' ? [br.profession] : []);
                    const qualityColor = qArr.length > 0 ? getQualityColor(qArr[0]) : 'rgba(255,255,255,0.6)';
                    
                    let desc = [];
                    if (qArr.length > 0) desc.push(qArr.join('/'));
                    if (pArr.length > 0) desc.push(pArr.join('/'));
                    if (br.minBonusDmg > 0) desc.push('附加>=' + br.minBonusDmg);
                    if (br.minIgnoreIce > 0) desc.push('无视>=' + br.minIgnoreIce);
                    const descStr = desc.length > 0 ? desc.join(' · ') : '不限';

                    const timeAgo = Math.floor((now - br.createTime) / 60000);
                    const timeStr = timeAgo < 60 ? `${timeAgo}分钟前` : `${Math.floor(timeAgo / 60)}小时前`;

                    return `
                        <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-left:4px solid #3b82f6;border-radius:8px;padding:10px;margin-bottom:8px;transition:all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.1)'" onmouseout="this.style.background='rgba(59,130,246,0.06)'">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
                                <span style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;">🛒 求购</span>
                                <span style="color:${qualityColor};font-size:0.75rem;font-weight:600;">${descStr}</span>
                                <span style="color:rgba(255,255,255,0.3);font-size:0.65rem;margin-left:auto;">${timeStr}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span style="color:rgba(255,255,255,0.7);font-size:0.8rem;">👤 ${br.creator}</span>
                                ${br.budget ? `<span style="color:#fbbf24;font-size:0.75rem;padding:2px 6px;background:rgba(251,191,36,0.1);border-radius:3px;">💰 ${br.budget}</span>` : ''}
                                ${br.note ? `<span style="color:rgba(255,255,255,0.5);font-size:0.7rem;">📝 ${br.note}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // 渲染拍卖列表
            if (room.auctions && room.auctions.length > 0) {
                html += room.auctions.slice().reverse().map(auction => {
                const isEnded = auction.status === 'ended' || now >= auction.endTime;
                const currentBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startPrice;
                const currentBidder = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].bidder : '';
                const bidCount = auction.bids.length;
                const qualityColor = getQualityColor(auction.quality);
                const quality = auction.quality || '';
                const profession = auction.profession || '';
                const bonusDmg = auction.bonusDmg || 0;
                const ignoreIce = auction.ignoreIce || 0;
                const isExchange = auction.isExchange || false;
                const exchangeWant = auction.exchangeWant || '';

                let timeHtml = '';
                if (isEnded) {
                    timeHtml = '<div style="color:#ef4444;font-size:0.75rem;text-align:right;">已结束</div>';
                } else {
                    const remaining = Math.max(0, auction.endTime - now);
                    const mins = Math.floor(remaining / 60000);
                    const secs = Math.floor((remaining % 60000) / 1000);
                    timeHtml = `<div style="color:#f59e0b;font-size:0.75rem;text-align:right;" data-auction-id="${auction.id}">⏳${mins}分${secs}秒</div>`;
                }

                let attrsHtml = '';
                if (bonusDmg > 0) attrsHtml += `<span style="background:rgba(239,68,68,0.15);color:#f87171;padding:2px 6px;border-radius:3px;font-size:0.7rem;">附加伤害+${bonusDmg}%</span> `;
                if (ignoreIce > 0) attrsHtml += `<span style="background:rgba(96,165,250,0.15);color:#93c5fd;padding:2px 6px;border-radius:3px;font-size:0.7rem;">无视冰甲+${ignoreIce}%</span>`;

                let exchangeBadgeHtml = '';
                if (isExchange) {
                    exchangeBadgeHtml = `<span style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:6px;box-shadow:0 1px 3px rgba(249,115,22,0.3);">支持交换</span>`;
                }

                const imageSize = 110;
                const auctionId = auction.id;
                // 优先使用 imageGistId，兼容旧的 image 字段
                const hasImage = auction.imageGistId || auction.image;
                // 透明占位图，避免初始 src="" 触发 onerror
                const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                const imageHtml = hasImage
                    ? `<div style="position:relative;width:${imageSize}px;height:${imageSize}px;flex-shrink:0;background:rgba(255,255,255,0.05);border-radius:8px;" onmouseover="showAuctionImagePreview(this,'${auctionId}')" onmouseout="hideAuctionImagePreview()"><img data-auction-id="${auctionId}" data-image-gist-id="${auction.imageGistId || ''}" src="${placeholder}" style="width:${imageSize}px;height:${imageSize}px;object-fit:cover;border-radius:8px;border:2px solid ${qualityColor};box-shadow:0 2px 8px rgba(0,0,0,0.3);display:none;" onload="if(this.src.startsWith('data:image/jpeg')){this.style.display='block';this.parentElement.style.background='transparent';}" onerror="if(this.src.startsWith('data:image/jpeg')){console.warn('图片加载失败:', this.dataset.auctionId);this.style.display='none';}"></div>`
                    : `<div style="width:${imageSize}px;height:${imageSize}px;background:rgba(255,255,255,0.05);border-radius:8px;border:2px solid ${qualityColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.3);"><span style="color:${qualityColor};font-size:1.6rem;">⚔️</span></div>`;

                let bidderHtml = '';
                if (currentBidder) {
                    bidderHtml = `<div style="color:rgba(255,255,255,0.7);font-size:0.8rem;text-align:right;">👤 ${currentBidder}</div>`;
                }

                let exchangeWantHtml = '';
                if (isExchange && exchangeWant) {
                    exchangeWantHtml = `<div style="color:#fbbf24;font-size:0.7rem;margin-top:3px;padding:3px 6px;background:rgba(251,191,36,0.1);border-radius:3px;">想要: ${exchangeWant}</div>`;
                }

                const savedValue = savedInputs[`quickBidInput_${auction.id}`] || '';

                return `
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-left:4px solid ${isExchange ? '#f97316' : qualityColor};border-radius:8px;padding:10px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                        ${imageHtml}
                        <div style="flex:1;min-width:0;padding-left:5px;">
                            <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;flex-wrap:nowrap;">
                                <span style="color:${qualityColor};font-size:0.65rem;font-weight:700;">#${auction.id}</span>
                                <span style="color:${qualityColor};font-size:0.65rem;font-weight:600;">${quality}·${profession}</span>
                                ${exchangeBadgeHtml}
                            </div>
                            <div style="margin-bottom:4px;white-space:nowrap;">${attrsHtml}</div>
                            ${exchangeWantHtml}
                            <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
                                ${!isEnded
                                    ? `<div style="display:flex;gap:3px;margin-bottom:2px;">
                                        <button onclick="event.stopPropagation();quickBid('${auction.id}',10)" style="padding:3px 8px;border-radius:4px;border:none;background:linear-gradient(135deg,#ffd700,#ff6b6b);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.75rem;">+10</button>
                                        <button onclick="event.stopPropagation();quickBid('${auction.id}',20)" style="padding:3px 8px;border-radius:4px;border:none;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.75rem;">+20</button>
                                        <button onclick="event.stopPropagation();quickBid('${auction.id}',50)" style="padding:3px 8px;border-radius:4px;border:none;background:linear-gradient(135deg,#fb923c,#ea580c);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.75rem;">+50</button>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:4px;">
                                        <input type="number" id="quickBidInput_${auction.id}" placeholder="数值>50" min="51" value="${savedValue}" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid rgba(255,215,0,0.3);background:rgba(0,0,0,0.4);color:white;font-size:0.7rem;outline:none;min-width:0;">
                                        <button onclick="event.stopPropagation();customQuickBid('${auction.id}')" style="padding:4px 10px;border-radius:4px;border:none;background:linear-gradient(135deg,#ffd700,#ff6b6b);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.75rem;white-space:nowrap;">出价</button>
                                    </div>`
                                    : `<span style="padding:3px 8px;border-radius:4px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.3);font-size:0.7rem;">已结束</span>`
                                }
                                <span style="color:rgba(255,255,255,0.3);font-size:0.65rem;">${bidCount}次出价</span>
                            </div>
                        </div>
                        <div style="flex-shrink:0;text-align:right;min-width:70px;">
                            ${timeHtml}
                            <div style="color:#ffd700;font-size:1.2rem;font-weight:700;margin:8px 0 3px 0;">${isExchange ? '' : '💰'}${currentBid}</div>
                            ${bidderHtml}
                        </div>
                    </div>
                `;
            }).join('');
            } // end of auctions rendering

            container.innerHTML = html;
            
            // 异步加载所有图片
            container.querySelectorAll('img[data-auction-id]').forEach(img => {
                const auctionId = img.dataset.auctionId;
                const imageGistId = img.dataset.imageGistId;
                
                // 优先使用 imageGistId 加载图片
                if (imageGistId) {
                    loadImage(imageGistId).then(base64Url => {
                        if (base64Url) {
                            img.src = base64Url;
                        } else {
                            img.style.display = 'none';
                        }
                    });
                } else {
                    // 兼容旧数据，使用 auctionId 加载
                    loadImage(auctionId).then(base64Url => {
                        if (base64Url) {
                            img.src = base64Url;
                        } else {
                            img.style.display = 'none';
                        }
                    });
                }
            });
        }

        function showAuctionImagePreview(el, auctionId) {
            hideAuctionImagePreview();
            const room = getRoomData();
            if (!room) return;
            const auction = room.auctions.find(a => a.id === auctionId);
            if (!auction || (!auction.imageGistId && !auction.image)) return;
            const preview = document.createElement('div');
            preview.id = 'auctionImgPreviewOverlay';
            preview.style.cssText = 'position:fixed;z-index:10001;pointer-events:none;';
            const rect = el.getBoundingClientRect();
            preview.style.left = (rect.right + 8) + 'px';
            preview.style.top = rect.top + 'px';
            // 异步加载图片
            const img = document.createElement('img');
            img.style.cssText = 'max-width:250px;max-height:250px;border-radius:10px;border:2px solid rgba(255,215,0,0.5);box-shadow:0 8px 30px rgba(0,0,0,0.7);';
            img.onerror = function() { img.style.display = 'none'; };
            preview.appendChild(img);
            document.body.appendChild(preview);
            
            // 异步加载图片（优先使用 imageGistId）
            const imageSource = auction.imageGistId || auctionId;
            loadImage(imageSource).then(base64Url => {
                if (base64Url) {
                    img.src = base64Url;
                } else {
                    img.style.display = 'none';
                }
            });
            
            const previewRect = preview.getBoundingClientRect();
            if (previewRect.right > window.innerWidth) {
                preview.style.left = (rect.left - previewRect.width - 8) + 'px';
            }
            if (previewRect.bottom > window.innerHeight) {
                preview.style.top = (window.innerHeight - previewRect.height - 10) + 'px';
            }
        }

        function hideAuctionImagePreview() {
            const el = document.getElementById('auctionImgPreviewOverlay');
            if (el) el.remove();
        }

        function showAuctionDetail(auctionId) {
            const room = getRoomData();
            if (!room) return;
            const auction = room.auctions.find(a => a.id === auctionId);
            if (!auction) return;

            const now = Date.now();
            const isEnded = auction.status === 'ended' || now >= auction.endTime;
            const currentBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startPrice;
            const isCreator = auction.creator === currentChatNick;
            const qualityColor = getQualityColor(auction.quality);
            const quality = auction.quality || '';
            const profession = auction.profession || '';
            const bonusDmg = auction.bonusDmg || 0;
            const ignoreIce = auction.ignoreIce || 0;
            const isExchange = auction.isExchange || false;
            const exchangeWant = auction.exchangeWant || '';

            let winnerHtml = '';
            if (isEnded && isCreator && auction.bids.length > 0) {
                const winner = auction.bids[auction.bids.length - 1];
                winnerHtml = `
                    <div style="background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);border-radius:8px;padding:12px;margin-top:10px;">
                        <div style="color:#4ade80;font-weight:500;margin-bottom:5px;">🏆 中标者信息（仅发布者可见）</div>
                        <div style="color:rgba(255,255,255,0.8);">昵称: ${winner.bidder}</div>
                        <div style="color:rgba(255,255,255,0.8);">出价: ${winner.amount}</div>
                        <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">时间: ${new Date(winner.time).toLocaleString()}</div>
                    </div>
                `;
            }

            let bidHistoryHtml = '';
            if (isCreator && auction.bids.length > 0) {
                bidHistoryHtml = `
                    <div style="margin-top:10px;">
                        <div style="color:rgba(255,255,255,0.6);font-size:0.85rem;margin-bottom:5px;">出价记录（仅发布者可见）</div>
                        ${auction.bids.slice().reverse().map(b => `
                            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.05);">
                                <span style="color:rgba(255,255,255,0.7);">${b.bidder}</span>
                                <span style="color:#ffd700;">${b.amount}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            const imgAuctionId = auction.id;
            const imageHtml = auction.image
                ? `<img data-auction-id="${imgAuctionId}" src="" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:10px;border:2px solid ${qualityColor};" onerror="this.style.display='none'">`
                : '';

            const content = document.getElementById('auctionDetailContent');
            content.innerHTML = `
                <button onclick="closeAuctionDetail()" style="position:absolute;top:12px;right:16px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.5rem;cursor:pointer;">&times;</button>
                <div style="color:${qualityColor};font-size:1.1rem;font-weight:600;margin-bottom:10px;">#${auction.id} ${quality}·${profession}</div>
                ${imageHtml}
                ${isExchange ? `
                    <div style="background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);border-radius:6px;padding:8px;margin-bottom:10px;">
                        <div style="color:#fbbf24;font-size:0.85rem;font-weight:500;margin-bottom:3px;">支持交换</div>
                        ${exchangeWant ? `<div style="color:rgba(255,255,255,0.7);font-size:0.8rem;">想要: ${exchangeWant}</div>` : ''}
                    </div>
                ` : ''}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                    <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;text-align:center;">
                        <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;">起拍价</div>
                        <div style="color:#ffd700;font-size:1rem;">${auction.startPrice}</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;text-align:center;">
                        <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;">当前最高</div>
                        <div style="color:#ffd700;font-size:1rem;">${currentBid}</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;text-align:center;">
                        <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;">快捷出价</div>
                        <div style="color:rgba(255,255,255,0.7);">10/20/50</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;text-align:center;">
                        <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;">出价次数</div>
                        <div style="color:rgba(255,255,255,0.7);">${auction.bids.length}</div>
                    </div>
                </div>
                ${bonusDmg > 0 ? `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:6px 10px;margin-bottom:6px;font-size:0.85rem;color:#f87171;">附加伤害 +${bonusDmg}</div>` : ''}
                ${ignoreIce > 0 ? `<div style="background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.2);border-radius:6px;padding:6px 10px;margin-bottom:6px;font-size:0.85rem;color:#93c5fd;">无视冰甲 +${ignoreIce}</div>` : ''}
                <div style="text-align:center;margin-bottom:10px;">
                    ${isEnded
                        ? '<span style="color:#ef4444;font-size:0.95rem;">拍卖已结束</span>'
                        : `<span style="color:#f59e0b;font-size:0.9rem;" id="auctionDetailCountdown">⏳ 进行中</span>`
                    }
                </div>
                ${!isEnded ? `
                    <div style="text-align:center;margin-bottom:10px;">
                        <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;margin-bottom:8px;">出价金额</div>
                        <div style="display:flex;justify-content:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
                            <button onclick="placeBid('${auction.id}',10)" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#ffd700,#ff6b6b);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.9rem;">+10</button>
                            <button onclick="placeBid('${auction.id}',20)" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.9rem;">+20</button>
                            <button onclick="placeBid('${auction.id}',50)" style="padding:8px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#fb923c,#ea580c);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.9rem;">+50</button>
                        </div>
                        <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
                            <input type="number" id="detailBidInput" placeholder="自定义加价>50" min="51" style="width:180px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:rgba(0,0,0,0.4);color:white;font-size:0.95rem;outline:none;">
                            <button onclick="customPlaceBid('${auction.id}')" style="padding:8px 22px;border-radius:8px;border:none;background:linear-gradient(135deg,#ffd700,#ff6b6b);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.9rem;">确认出价</button>
                        </div>
                        <div style="color:rgba(255,215,0,0.6);font-size:0.75rem;margin-top:6px;">当前最高: ${currentBid} | 自定义需>50</div>
                    </div>
                ` : ''}
                ${winnerHtml}
                ${bidHistoryHtml}
                <div style="color:rgba(255,255,255,0.3);font-size:0.75rem;text-align:center;margin-top:10px;">发布者: ${auction.creator} · ${new Date(auction.startTime).toLocaleString()}</div>
            `;

            document.getElementById('auctionDetailModal').style.display = 'flex';
            
            // 异步加载图片
            const detailImg = content.querySelector('img[data-auction-id]');
            if (detailImg) {
                const imgAuctionId = detailImg.dataset.auctionId;
                loadImage(imgAuctionId).then(base64Url => {
                    if (base64Url) {
                        detailImg.src = base64Url;
                    } else {
                        detailImg.style.display = 'none';
                    }
                });
            }
        }

        function closeAuctionDetail() {
            document.getElementById('auctionDetailModal').style.display = 'none';
        }

        function showBidToast(msg, success) {
            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:10px;color:white;font-size:0.95rem;font-weight:600;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:90vw;text-align:center;`;
            toast.style.background = success ? 'linear-gradient(135deg,#4ade80,#22c55e)' : 'linear-gradient(135deg,#ef4444,#dc2626)';
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.transition = 'opacity 0.8s';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 800);
            }, 5000);
        }

        let bidLock = false;
        let bidCountdownTimer = null;

        function showBidCountdown(bidAmount, totalSeconds) {
            removeBidCountdown();
            const toast = document.createElement('div');
            toast.id = 'bidCountdownToast';
            toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:10px;color:white;font-size:1rem;font-weight:600;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:90vw;text-align:center;background:linear-gradient(135deg,#3b82f6,#2563eb);`;
            toast.innerHTML = `⏳ 正在出价 <b>${bidAmount}</b>... <span id="bidCountdownNum" style="font-size:1.3em;">${totalSeconds}</span>秒`;
            document.body.appendChild(toast);
            let remaining = totalSeconds;
            bidCountdownTimer = setInterval(() => {
                remaining--;
                const numEl = document.getElementById('bidCountdownNum');
                if (numEl) numEl.textContent = remaining;
                if (remaining <= 0) clearInterval(bidCountdownTimer);
            }, 1000);
        }

        function updateBidCountdown(bidAmount) {
            const toast = document.getElementById('bidCountdownToast');
            if (toast) toast.innerHTML = `⏳ 正在出价 <b>${bidAmount}</b>... 查询中`;
        }

        function removeBidCountdown() {
            if (bidCountdownTimer) { clearInterval(bidCountdownTimer); bidCountdownTimer = null; }
            const existing = document.getElementById('bidCountdownToast');
            if (existing) existing.remove();
        }

        async function doBid(auctionId, fromDetail, customIncrement) {
            if (!currentChatRoom) return;
            if (bidLock) { showBidToast('正在处理中，请稍候', false); return; }
            bidLock = true;

            try {
                // 先清除本地缓存，确保获取最新数据
                const roomId = currentChatRoom || 'default';
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                
                await fetchChatRoomData();
                let room = getRoomData();
                if (!room) { bidLock = false; renderAuctionsList(); return; }
                let auction = room.auctions.find(a => a.id === auctionId);
                if (!auction) { showBidToast('拍卖不存在', false); renderAuctionsList(); bidLock = false; return; }
                if (auction.status === 'ended' || Date.now() >= auction.endTime) { showBidToast('拍卖已结束', false); renderAuctionsList(); renderChatMessages(); bidLock = false; return; }
                if (auction.creator === currentChatNick) { showBidToast('不能竞拍自己发布的拍卖', false); renderAuctionsList(); bidLock = false; return; }

                // 检查是否有人在出价（冷却期检查）
                const BID_COOLDOWN = 10000; // 10秒冷却期
                const lastBidLockTime = auction.bidLockTime || 0;
                const lastBidLockUser = auction.bidLockUser || '';
                
                if (lastBidLockTime > 0 && lastBidLockUser !== currentChatNick) {
                    const timeSinceLock = Date.now() - lastBidLockTime;
                    if (timeSinceLock < BID_COOLDOWN) {
                        const waitSec = Math.ceil((BID_COOLDOWN - timeSinceLock) / 1000);
                        showBidToast(`⏳ ${lastBidLockUser} 正在出价，请等待 ${waitSec} 秒`, false);
                        bidLock = false;
                        renderAuctionsList();
                        return;
                    }
                }

                // 设置出价锁
                auction.bidLockTime = Date.now();
                auction.bidLockUser = currentChatNick;
                await saveChatRoomData();

                const currentBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startPrice;
                const currentBidder = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].bidder : '';

                const increment = customIncrement || auction.bidIncrement || 10;
                const myBid = currentBid + increment;

                // 等待时间（防止并发）
                const baseWait = 3000;
                const jitter = Math.floor(Math.random() * 1000);
                const totalWait = baseWait + jitter;
                const totalWaitSec = Math.ceil(totalWait / 1000);

                showBidCountdown(myBid, totalWaitSec);

                await new Promise(r => setTimeout(r, totalWait));

                removeBidCountdown();

                // 再次获取最新数据
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                await fetchChatRoomData();
                room = getRoomData();
                if (!room) { bidLock = false; renderAuctionsList(); return; }
                auction = room.auctions.find(a => a.id === auctionId);
                if (!auction) { showBidToast('拍卖不存在', false); renderAuctionsList(); bidLock = false; return; }
                if (auction.status === 'ended' || Date.now() >= auction.endTime) { showBidToast('拍卖已结束', false); renderAuctionsList(); renderChatMessages(); bidLock = false; return; }

                const latestBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startPrice;
                const latestBidder = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].bidder : '';

                if (latestBidder === currentChatNick) {
                    showBidToast('你已经是最高出价者', false);
                    // 释放锁
                    auction.bidLockTime = 0;
                    auction.bidLockUser = '';
                    await saveChatRoomData();
                    bidLock = false;
                    renderAuctionsList();
                    return;
                }

                const actualBid = latestBid + increment;

                if (actualBid !== myBid) {
                    showBidToast(`价格已变化！当前 ${latestBid}(${latestBidder})，需出价 ${latestBid + increment}，请重新出价`, false);
                    // 释放锁
                    auction.bidLockTime = 0;
                    auction.bidLockUser = '';
                    await saveChatRoomData();
                    renderAuctionsList();
                    renderChatMessages();
                    bidLock = false;
                    return;
                }

                showBidToast(`正在出价 ${actualBid}...`, true);

                auction.bids.push({
                    bidder: currentChatNick,
                    amount: actualBid,
                    time: Date.now()
                });
                
                // 延时拍卖：每次出价延长30秒
                const EXTEND_TIME = 30 * 1000; // 30秒
                const now = Date.now();
                if (auction.endTime > now) {
                    auction.endTime += EXTEND_TIME;
                }
                
                // 释放出价锁
                auction.bidLockTime = 0;
                auction.bidLockUser = '';

                const quality = auction.quality || '';
                const profession = auction.profession || '';
                const bonusDmg = auction.bonusDmg || 0;
                const ignoreIce = auction.ignoreIce || 0;
                room.messages.push({
                    id: 'msg_' + Date.now(),
                    author: '系统',
                    content: `💰 ${currentChatNick} 对 #${auction.id} ${quality}·${profession}${bonusDmg > 0 ? ' 附加伤害+' + bonusDmg : ''}${ignoreIce > 0 ? ' 无视冰甲+' + ignoreIce : ''} 出价 ${actualBid}`,
                    time: Date.now()
                });

                await saveChatRoomData();

                showBidToast(`🎉 出价 ${actualBid} 成功！`, true);

                // 公告播报出价信息
                const bidRoomId = currentChatRoom || 'default';
                addAuctionBroadcast(`【拍卖行◆${bidRoomId}】${currentChatNick} 出价${actualBid} → ${quality}·${profession}${bonusDmg > 0 ? ' 附加+' + bonusDmg : ''}${ignoreIce > 0 ? ' 无视+' + ignoreIce : ''}`, bidRoomId);

                await fetchChatRoomData();
                if (fromDetail) closeAuctionDetail();
                renderAuctionsList();
                renderChatMessages();
            } catch (error) {
                showBidToast('出价失败: ' + error.message, false);
                renderAuctionsList();
                renderChatMessages();
            } finally {
                removeBidCountdown();
                bidLock = false;
            }
        }

        async function quickBid(auctionId, increment) {
            if (!currentChatRoom) return;
            const bidBtn = event.target.closest('button');
            if (bidBtn) {
                bidBtn.disabled = true;
                bidBtn.dataset.origText = bidBtn.textContent;
                bidBtn.textContent = '⏳';
            }
            await doBid(auctionId, false, increment);
            if (bidBtn) {
                bidBtn.disabled = false;
                bidBtn.textContent = bidBtn.dataset.origText || '+10';
            }
        }

        async function customQuickBid(auctionId) {
            if (!currentChatRoom) return;
            const inputEl = document.getElementById('quickBidInput_' + auctionId);
            const bidBtn = event.target.closest('button');
            if (!inputEl) return;
            
            const increment = parseInt(inputEl.value);
            if (!increment || increment < 51) {
                showBidToast('自定义出价需大于50', false);
                return;
            }
            
            if (bidBtn) {
                bidBtn.disabled = true;
                bidBtn.dataset.origText = bidBtn.textContent;
                bidBtn.textContent = '⏳';
            }
            await doBid(auctionId, false, increment);
            if (bidBtn) {
                bidBtn.disabled = false;
                bidBtn.textContent = bidBtn.dataset.origText || '出价';
            }
            inputEl.value = '';
        }

        async function placeBid(auctionId, increment) {
            if (!currentChatRoom) return;
            const bidBtn = event.target.closest('button');
            if (bidBtn) {
                bidBtn.disabled = true;
                bidBtn.dataset.origText = bidBtn.textContent;
                bidBtn.textContent = '⏳等待中...';
            }
            await doBid(auctionId, true, increment);
            if (bidBtn) {
                bidBtn.disabled = false;
                bidBtn.textContent = bidBtn.dataset.origText || '出价';
            }
        }

        async function customPlaceBid(auctionId) {
            if (!currentChatRoom) return;
            const inputEl = document.getElementById('detailBidInput');
            const bidBtn = event.target.closest('button');
            if (!inputEl) return;
            
            const increment = parseInt(inputEl.value);
            if (!increment || increment < 51) {
                showBidToast('自定义出价需大于50', false);
                return;
            }
            
            if (bidBtn) {
                bidBtn.disabled = true;
                bidBtn.dataset.origText = bidBtn.textContent;
                bidBtn.textContent = '⏳等待中...';
            }
            await doBid(auctionId, true, increment);
            if (bidBtn) {
                bidBtn.disabled = false;
                bidBtn.textContent = bidBtn.dataset.origText || '确认出价';
            }
            inputEl.value = '';
        }

        // 记录上次刷新时的拍卖数据快照，用于检测新出价/新上架
        let lastAuctionSnapshot = {};

        function startChatRefresh() {
            if (chatRefreshInterval) clearInterval(chatRefreshInterval);
            function getRefreshInterval() {
                const room = getRoomData();
                if (!room || !room.auctions) return 15000;
                const hasActive = room.auctions.some(a => a.status === 'active' && Date.now() < a.endTime);
                return hasActive ? 5000 : 15000;
            }
            function doRefresh() {
                if (!currentChatRoom) return;
                fetchChatRoomData().then(() => {
                    // 检测拍卖数据变化，播报新的出价和上架
                    try {
                        const room = getRoomData();
                        if (room && room.auctions) {
                            const roomId = currentChatRoom || 'default';
                            room.auctions.forEach(auction => {
                                const key = `${roomId}_${auction.id}`;
                                const lastSnap = lastAuctionSnapshot[key];
                                if (!lastSnap) {
                                    // 新上架的拍品（首次刷新时不播报，避免进入房间时大量播报）
                                    lastAuctionSnapshot[key] = {
                                        bidCount: auction.bids ? auction.bids.length : 0,
                                        lastBidTime: auction.bids && auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].time : 0
                                    };
                                } else {
                                    // 检测新出价
                                    const currentBidCount = auction.bids ? auction.bids.length : 0;
                                    if (currentBidCount > lastSnap.bidCount && auction.bids && auction.bids.length > 0) {
                                        const latestBid = auction.bids[auction.bids.length - 1];
                                        // 只播报不是自己的出价（自己的已在doBid中播报）
                                        if (latestBid.bidder !== currentChatNick && latestBid.time > lastSnap.lastBidTime) {
                                            const q = auction.quality || '';
                                            const p = auction.profession || '';
                                            const bd = auction.bonusDmg || 0;
                                            const ii = auction.ignoreIce || 0;
                                            addAuctionBroadcast(`【拍卖行◆${roomId}】${latestBid.bidder} 出价${latestBid.amount} → ${q}·${p}${bd > 0 ? ' 附加+' + bd : ''}${ii > 0 ? ' 无视+' + ii : ''}`, roomId);
                                        }
                                    }
                                    lastAuctionSnapshot[key] = {
                                        bidCount: currentBidCount,
                                        lastBidTime: auction.bids && auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].time : 0
                                    };
                                }
                            });
                        }
                    } catch (e) {
                        // 播报检测失败不影响主流程
                    }

                    renderChatMessages();
                    renderAuctionsList();
                    const newInterval = getRefreshInterval();
                    if (newInterval !== chatRefreshCurrentInterval) {
                        chatRefreshCurrentInterval = newInterval;
                        clearInterval(chatRefreshInterval);
                        chatRefreshInterval = setInterval(doRefresh, newInterval);
                    }
                }).catch(() => {});
            }
            chatRefreshCurrentInterval = getRefreshInterval();
            chatRefreshInterval = setInterval(doRefresh, chatRefreshCurrentInterval);
        }

        let chatRefreshCurrentInterval = 5000;

        async function manualRefreshAuctions() {
            if (!currentChatRoom) return;
            const btn = document.getElementById('manualRefreshBtn');
            if (!btn) return;
            
            // 视觉反馈：漏斗动画 + 禁用
            btn.innerHTML = '<span style="display:inline-block;animation:spin 0.8s linear infinite;">⏳</span>';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            
            try {
                // 清除本地缓存，强制从服务器获取最新数据
                const roomId = currentChatRoom || 'default';
                localStorage.removeItem(`chatroom_gist_${roomId}`);
                
                await fetchChatRoomData();
                renderChatMessages();
                renderAuctionsList();
                showBidToast('✅ 刷新成功', true);
            } catch (e) {
                console.error('刷新失败:', e);
                showBidToast('❌ 刷新失败，请重试', false);
            } finally {
                // 恢复原状
                btn.innerHTML = '↻';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }

        function startAuctionCountdown() {
            if (auctionCounterInterval) clearInterval(auctionCounterInterval);
            auctionCounterInterval = setInterval(() => {
                if (!currentChatRoom) return;
                const room = getRoomData();
                if (!room || !room.auctions) return;
                const now = Date.now();
                let needRender = false;
                room.auctions.forEach(auction => {
                    if (auction.status === 'active' && now >= auction.endTime) {
                        auction.status = 'ended';
                        needRender = true;
                        
                        // 标记图片为已结束
                        if (auction.image) {
                            markImageAsEnded(auction.id).catch(() => {});
                        }
                        
                        // 记录成交信息到历史记录
                        if (!room.auctionHistory) room.auctionHistory = [];
                        const currentBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startPrice;
                        const winner = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].bidder : '无';
                        const finalRecord = {
                            auctionId: auction.id,
                            creator: auction.creator,
                            winner: winner,
                            quality: auction.quality,
                            profession: auction.profession,
                            startPrice: auction.startPrice,
                            finalPrice: currentBid,
                            bonusDmg: auction.bonusDmg || 0,
                            ignoreIce: auction.ignoreIce || 0,
                            image: auction.image || '',
                            endTime: auction.endTime,
                            roomId: currentChatRoom,
                            recordTime: now
                        };
                        room.auctionHistory.push(finalRecord);
                    }
                });
                if (needRender) {
                    saveChatRoomData().catch(() => {});
                    renderAuctionsList();
                }
                document.querySelectorAll('[data-auction-id]').forEach(el => {
                    const auction = room.auctions.find(a => a.id === el.dataset.auctionId);
                    if (auction && auction.status === 'active') {
                        const remaining = Math.max(0, auction.endTime - now);
                        const mins = Math.floor(remaining / 60000);
                        const secs = Math.floor((remaining % 60000) / 1000);
                        el.textContent = `⏳ ${mins}分${secs}秒`;
                    }
                });
            }, 1000);
        }

        function escapeHtml(text) {
            if (!text) return '';
            const s = String(text);
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }

        const chatRoomEntryModal = document.getElementById('chatRoomEntryModal');
        if (chatRoomEntryModal) {
            chatRoomEntryModal.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) closeChatRoomEntry();
            });
        }

        const auctionPostModal = document.getElementById('auctionPostModal');
        if (auctionPostModal) {
            auctionPostModal.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) closeAuctionPostModal();
            });
        }

        const auctionDetailModal = document.getElementById('auctionDetailModal');
        if (auctionDetailModal) {
            auctionDetailModal.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) closeAuctionDetail();
            });
        }

        function showRefImageList() {
            const content = document.getElementById('referencePanelContent');
            content.innerHTML = `
                <div id="referenceImagesGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;"></div>
                <div style="margin-top:10px;">
                    <input type="file" id="refImageInput" accept="image/*" style="display:none;" onchange="handleRefImageUpload(this)">
                    <button onclick="document.getElementById('refImageInput').click()" style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;width:100%;">📤 上传参考图片</button>
                </div>
            `;
            renderReferenceImages();
        }

        // 打开「帮助」页面（兼容 Tauri APP 与浏览器）
        function openHelpPage() {
            const helpUrl = 'https://gyq-svip.github.io/tfjl-web/help.html';
            // Tauri APP 环境：webview 禁止 window.open 弹新窗口，改为当前窗口直接跳转
            // help.html 自带「← 返回助手」按钮可回到主界面
            if (window.__TAURI__) {
                window.location.href = helpUrl;
                return;
            }
            // 浏览器环境：新标签页打开，保留主页面
            window.open(helpUrl, '_blank');
        }

        // 帮助模态框
        function showHelpModal() {
            const modal = document.createElement('div');
            modal.id = 'helpModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
            
            // 使用动态配置
            const wechat = currentConfig.wechat || 'GYQSVIP';
            const game = currentConfig.game || '九区-龙行';
            const notice = currentConfig.notice || '';
            
            let noticeHtml = '';
            if (notice) {
                noticeHtml = `<p style="margin:10px 0 0 0;font-size:1rem;color:#4fc3f7;">${notice}</p>`;
            }
            
            modal.innerHTML = `
                <div style="background:#1a1a2e;border:2px solid rgba(255,215,0,0.5);border-radius:16px;padding:30px;max-width:700px;width:100%;max-height:85vh;overflow-y:auto;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h2 style="margin:0;color:#ffd700;">❓ 塔防精灵阵容归档使用帮助</h2>
                        <span onclick="closeHelpModal()" style="cursor:pointer;color:#f44336;font-size:2rem;line-height:1;">×</span>
                    </div>

                    <!-- 功能介绍 -->
                    <div style="margin-bottom:25px;">
                        <h3 style="color:#4fc3f7;margin-bottom:10px;border-left:3px solid #4fc3f7;padding-left:10px;">📖 功能介绍</h3>
                        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:15px;font-size:0.9rem;line-height:1.8;">
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">📁 项目管理</strong> - 脚本分类存储，便于日后查找。数据存储在本地浏览器缓存中，支持项目中存放脚本文件、图片、阵容站位、皮肤融合，还有记事本可备注战车及注意事项，保存后均跟随单个项目</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">📝 记事本</strong> - 记录阵容思路、心得笔记，保存后跟随项目</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">📄 脚本文件</strong> - 支持脚本解析到手牌，方便调整站位一目了然；支持拖拽排序；支持分享到需求墙，所有人均可查看、下载和直接导入使用</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">🔍 脚本解析与生成</strong> - 支持解析文本到手牌，自动生成活动和隐藏脚本（带时间轴），建议生成后手动微调效果更佳</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ff9800;">🏰 副本脚本</strong> - 已支持蛇女、雷精灵、天使、火炮、虎弓、后羿等阵容的自动生成，后续遇到新阵容会持续完善</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">🖼️ 参考图片</strong> - 上传、预览阵容参考图，可拖动调整大小</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">🏪 拍卖行</strong> - 闲置物品自由上架、交换、求购，入口在右上角需求墙小喇叭旁边，完全免费！纯玩！</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">📢 需求墙</strong> - 发布需求、分享脚本、互动交流</p>
                            <p style="margin:0 0 10px 0;"><strong style="color:#ffd700;">💾 备份恢复</strong> - 全部数据或单个项目备份/恢复/分享</p>
                            
                            <p style="margin:0;"><strong style="color:#ffd700;">⭐ 收藏功能</strong> - 右键卡牌添加到常用收藏</p>
                        </div>
                    </div>

                    <!-- 使用教程 -->
                    <div style="margin-bottom:25px;">
                        <h3 style="color:#ba68c8;margin-bottom:10px;border-left:3px solid #ba68c8;padding-left:10px;">📚 使用教程</h3>
                        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:15px;font-size:0.9rem;line-height:1.8;">
                            <p style="margin:0 0 8px 0;"><strong style="color:#4fc3f7;">第一步：</strong>选择10张卡牌构成手牌</p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 点击卡牌添加到"我的手牌"或"队友手牌"</p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 右键点击卡牌可收藏到常用卡</p>
                            <p style="margin:0 0 15px 0;"><strong style="color:#4fc3f7;">第二步：</strong>拖动卡牌到战斗槽</p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 点击手牌中的卡牌自动上到空槽</p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 工程卡只能上到最上方工程槽</p>
                            <p style="margin:0 0 15px 0;padding-left:20px;">• 右键点击战斗槽卡牌可下阵</p>
                            <p style="margin:0 0 8px 0;"><strong style="color:#4fc3f7;">第三步：</strong>保存阵容</p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 点击右上角💾保存按钮</p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 选择分类并输入项目名称</p>
                            <p style="margin:0 0 8px 0;"><strong style="color:#4fc3f7;">卡牌等级：</strong></p>
                            <p style="margin:0 0 8px 0;padding-left:20px;">• 点击卡牌上的等级数字可修改等级</p>
                            <p style="margin:0 0 15px 0;padding-left:20px;">• 队友卡等级独立保存，不影响我的卡等级</p>
                            <p style="margin:0 0 8px 0;"><strong style="color:#4fc3f7;">备份恢复：</strong></p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">• 点击右上角≡菜单按钮</p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">• 📋全部数据：备份/恢复所有项目</p>
                            <p style="margin:0 0 15px 0;padding-left:20px;">• 📁单个项目：备份/恢复当前项目</p>
                        </div>
                    </div>

                    <!-- 需求墙 -->
                    <div style="margin-bottom:25px;">
                        <h3 style="color:#ff9800;margin-bottom:10px;border-left:3px solid #ff9800;padding-left:10px;">📢 需求墙</h3>
                        <div style="background:rgba(255,152,0,0.1);border-radius:8px;padding:15px;font-size:0.9rem;line-height:1.8;">
                            <p style="margin:0 0 10px 0;"><strong style="color:#4fc3f7;">功能说明：</strong></p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">✓ 发布需求或分享脚本</p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">✓ 上传脚本文件（最大10MB）</p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">✓ 消息默认永久保存，可选限时删除</p>
                            <p style="margin:0 0 15px 0;padding-left:20px;">✓ 支持拖动窗口位置</p>
                            <p style="margin:0;"><strong style="color:#ffd700;">提示：</strong>点击左上角📢按钮打开需求墙</p>
                        </div>
                    </div>

                    <!-- 隐私说明 -->
                    <div style="margin-bottom:25px;">
                        <h3 style="color:#4caf50;margin-bottom:10px;border-left:3px solid #4caf50;padding-left:10px;">🔒 隐私保护</h3>
                        <div style="background:rgba(76,175,80,0.1);border-radius:8px;padding:15px;font-size:0.9rem;line-height:1.8;">
                            <p style="margin:0 0 5px 0;padding-left:20px;">✓ 所有数据仅存储在您的浏览器本地</p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">✓ 昵称仅为方便交流，无需真实信息</p>
                            <p style="margin:0 0 5px 0;padding-left:20px;">✓ 访问统计仅记录访问次数</p>
                            <p style="margin:0;padding-left:20px;">✓ 您可随时清除本地数据</p>
                        </div>
                    </div>

                    <!-- 联系方式 -->
                    <div style="margin-bottom:25px;">
                        <h3 style="color:#4ecdc4;margin-bottom:10px;border-left:3px solid #4ecdc4;padding-left:10px;">💡 意见反馈</h3>
                        <div style="background:rgba(78,205,196,0.1);border:1px solid rgba(78,205,196,0.3);border-radius:8px;padding:15px;text-align:center;font-size:0.9rem;line-height:1.8;">
                            <p style="margin:0 0 10px 0;color:rgba(255,255,255,0.85);">有好的需求、想法，欢迎在需求墙（右上角小喇叭）留言！</p>
                        </div>
                    </div>

                    <!-- 联系方式 -->
                    <div>
                        <h3 style="color:#ffd700;margin-bottom:10px;border-left:3px solid #ffd700;padding-left:10px;">📞 问题反馈</h3>
                        <div style="background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);border-radius:8px;padding:20px;text-align:center;">
                            <p style="margin:10px 0 0 0;font-size:1.5rem;color:#ffd700;font-weight:bold;">微信:${wechat}</p>
                            <p style="margin:10px 0 0 0;font-size:1.5rem;color:#ffd700;font-weight:bold;">游戏:${game}</p>
                            ${noticeHtml}
                        </div>
                    </div>

                    <div style="margin-top:25px;text-align:center;">
                        <button onclick="closeHelpModal()" style="background:linear-gradient(135deg,#666,#444);color:white;border:none;padding:12px 30px;border-radius:8px;cursor:pointer;font-size:1rem;">关闭</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.addEventListener('click', function(e) {
                if (e.target === modal) closeHelpModal();
            });
        }

        function closeHelpModal() {
            const modal = document.getElementById('helpModal');
            if (modal) modal.remove();
        }

        // ===== 悬浮提示 tooltip（读取 data-tip） =====
        (function initTooltips() {
            let tipEl = null;
            let _curEl = null;
            function getTip() {
                if (!tipEl) {
                    tipEl = document.createElement('div');
                    tipEl.className = 'tfjl-tooltip';
                    tipEl.setAttribute('role', 'tooltip');
                    document.body.appendChild(tipEl);
                }
                return tipEl;
            }
            function showTip(el) {
                const text = el.getAttribute('data-tip');
                if (!text) return;
                // 保底：把 data-tip 同步到原生 title。WebView2 下若自定义提示仍不弹，
                // 至少原生 tooltip 能弹，杜绝"静默失效"（多次反馈的根因）。
                if (!el.getAttribute('title')) { try { el.setAttribute('title', text); } catch (e2) {} }
                const tip = getTip();
                tip.textContent = text;
                const r = el.getBoundingClientRect();
                const tw = tip.offsetWidth || 240;
                const th = tip.offsetHeight || 50;
                let pos = 'bottom';
                let left = r.left;
                let top = r.bottom + 8;
                if (top + th > window.innerHeight - 8) { pos = 'top'; top = r.top - th - 8; }
                left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
                tip.style.left = left + 'px';
                tip.style.top = top + 'px';
                tip.setAttribute('data-pos', pos);
                tip.classList.add('show');
            }
            function hideTip() { if (tipEl) tipEl.classList.remove('show'); _curEl = null; }
            function findTipEl(e) {
                // WebView2 下 e.target 命中偶发不准，优先用元素命中测试取真实顶层元素
                let el = null;
                try {
                    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
                        const hit = document.elementFromPoint(e.clientX, e.clientY);
                        if (hit && hit.closest) el = hit.closest('[data-tip]');
                    }
                } catch (e2) {}
                if (!el && e.target && e.target.closest) el = e.target.closest('[data-tip]');
                return el;
            }
            function onMove(e) {
                const el = findTipEl(e);
                if (el) {
                    if (el !== _curEl) { _curEl = el; showTip(el); }
                } else if (_curEl) {
                    hideTip();
                }
            }
            // 多事件源兜底：WebView2 对不同指针事件的派发不稳定，pointermove/mousemove
            // 持续检测 + mouseover/pointerover 补一组，任一触发即可弹。
            document.addEventListener('pointermove', onMove, { passive: true });
            document.addEventListener('mousemove', onMove, { passive: true });
            document.addEventListener('mouseover', onMove, { passive: true });
            document.addEventListener('pointerover', onMove, { passive: true });
            window.addEventListener('scroll', hideTip, true);
            document.addEventListener('pointerleave', hideTip);
            window.addEventListener('blur', hideTip);
        })();





        // 记事本面板切换
        function toggleNotepadPanel() {
            const panel = document.getElementById('notepadPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') { if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('记事本'); }
        }

        // 脚本文件面板切换
        function toggleTxtFilesPanel() {
            const panel = document.getElementById('txtFilesPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('脚本管理');
                // 默认显示「脚本文件」tab（直接看到当前项目的脚本列表）
                switchTxtPanelTab('files');
                applyTxtPanelTipBar();
            }
        }

        // 脚本面板顶部「悬停看说明」提示条：点 × 后永久隐藏（localStorage 记住）
        const TXT_TIP_BAR_KEY = 'tdjl_txtPanelTipHidden';
        function applyTxtPanelTipBar() {
            const bar = document.getElementById('txtPanelTipBar');
            if (!bar) return;
            const hidden = localStorage.getItem(TXT_TIP_BAR_KEY) === '1';
            bar.style.display = hidden ? 'none' : 'flex';
            // 提示条占约 26px，隐藏后把内容区高度还回去
            const h = hidden ? 'calc(100% - 90px)' : 'calc(100% - 116px)';
            const p = document.getElementById('txtTabParser');
            const f = document.getElementById('txtTabFiles');
            if (p) p.style.height = h;
            if (f) f.style.height = h;
        }
        function dismissTxtPanelTip() {
            localStorage.setItem(TXT_TIP_BAR_KEY, '1');
            applyTxtPanelTipBar();
            showToast('已隐藏提示条，悬停按钮仍会显示说明');
        }

        // 文本解析面板切换（已集成到脚本文件面板的tab中）
        function toggleTextParserPanel() {
            const panel = document.getElementById('txtFilesPanel');
            panel.style.display = 'block';
            switchTxtPanelTab('parser');
            applyTxtPanelTipBar();
        }

        // 脚本文件面板Tab切换
        function switchTxtPanelTab(tab) {
            const filesTab = document.getElementById('txtTabFiles');
            const parserTab = document.getElementById('txtTabParser');
            const filesBtn = document.getElementById('txtTabBtn');
            const parserBtn = document.getElementById('parserTabBtn');

            if (tab === 'files') {
                filesTab.style.display = 'flex';
                parserTab.style.display = 'none';
                filesBtn.style.background = 'rgba(76,175,80,0.3)';
                filesBtn.style.color = '#fff';
                filesBtn.style.fontWeight = 'bold';
                filesBtn.style.borderBottom = '2px solid #4caf50';
                parserBtn.style.background = 'transparent';
                parserBtn.style.color = 'rgba(255,255,255,0.5)';
                parserBtn.style.fontWeight = 'normal';
                parserBtn.style.borderBottom = 'none';
                // 恢复布局偏好
                if (typeof initScriptLayout === 'function') initScriptLayout();
                // 自动静默扫描并刷新列表（setTimeout 确保浏览器先绘制标签切换 UI，再渲染列表）
                if (window.silentScanFiles) { window.silentScanFiles().then(() => { setTimeout(() => { renderScriptFileCategoryFilter(); if (typeof filterTxtFilesList === 'function') filterTxtFilesList(); }, 0); }); }
                else { renderScriptFileCategoryFilter(); }
            } else {
                filesTab.style.display = 'none';
                parserTab.style.display = 'flex';
                parserBtn.style.background = 'rgba(0,188,212,0.3)';
                parserBtn.style.color = '#fff';
                parserBtn.style.fontWeight = 'bold';
                parserBtn.style.borderBottom = '2px solid #00bcd4';
                // 切到解析tab时触发减伤计算
                setTimeout(() => updateRealTimeDamageReduction(), 100);
                filesBtn.style.background = 'transparent';
                filesBtn.style.color = 'rgba(255,255,255,0.5)';
                filesBtn.style.fontWeight = 'normal';
                filesBtn.style.borderBottom = 'none';
            }
        }

        // 搜索脚本按钮 - 打开脚本面板并聚焦搜索框
        function focusScriptSearch() {
            const panel = document.getElementById('txtFilesPanel');
            panel.style.display = 'block';
            switchTxtPanelTab('files');
            setTimeout(() => {
                const searchInput = document.getElementById('txtFileSearchInput');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }, 100);
        }

        // 全局项目搜索面板
        function showProjectSearchPanel() {
            let panel = document.getElementById('projectSearchPanel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
                if (panel.style.display === 'flex') {
                    if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('项目搜索');
                    setTimeout(() => document.getElementById('projectSearchInput')?.focus(), 100);
                }
                return;
            }

            panel = document.createElement('div');
            panel.id = 'projectSearchPanel';
            panel.style.cssText = 'position:fixed;top:80px;right:20px;width:420px;height:500px;background:rgba(26,26,46,0.95);border:2px solid rgba(0,188,212,0.5);border-radius:12px;z-index:9997;box-shadow:0 4px 20px rgba(0,0,0,0.5);flex-direction:column;resize:both;min-width:320px;min-height:350px;overflow:hidden;';
            panel.innerHTML = `
                <div id="projectSearchPanelHeader" style="background:linear-gradient(135deg,#00bcd4,#00838f);padding:10px 15px;cursor:move;display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:white;font-weight:bold;">🔍 搜索项目</span>
                    <button onclick="document.getElementById('projectSearchPanel').style.display='none'" style="background:transparent;border:none;color:white;font-size:1.2rem;cursor:pointer;padding:0 5px;">×</button>
                </div>
                <div style="padding:12px;flex:1;overflow:auto;display:flex;flex-direction:column;">
                    <input id="projectSearchInput" type="text" placeholder="输入关键字搜索所有项目..." oninput="searchAllProjects()" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,188,212,0.3);background:rgba(0,0,0,0.3);color:#fff;font-size:0.9rem;box-sizing:border-box;margin-bottom:10px;">
                    <div id="projectSearchResults" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">输入关键字开始搜索</div>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
            makePanelDraggable('projectSearchPanel', 'projectSearchPanelHeader');
            setTimeout(() => document.getElementById('projectSearchInput')?.focus(), 100);
        }

        // 搜索所有项目
        let _searchAllProjectsTimer = null;
        function searchAllProjects() {
            clearTimeout(_searchAllProjectsTimer);
            _searchAllProjectsTimer = setTimeout(() => {
                const keyword = (document.getElementById('projectSearchInput')?.value || '').trim().toLowerCase();
                const resultsEl = document.getElementById('projectSearchResults');
                if (!resultsEl) return;

                if (!keyword) {
                    resultsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">输入关键字开始搜索</div>';
                    return;
                }

                loadProjectListFromDB().then(projects => {
                    if (!projects || projects.length === 0) {
                        resultsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">暂无项目</div>';
                        return;
                    }

                    let html = '';
                    projects.forEach(p => {
                        // 搜索项目名、分类
                        const nameMatch = p.name.toLowerCase().includes(keyword);
                        const catMatch = (p.category || '').toLowerCase().includes(keyword);

                        // 搜索所有卡牌（手牌+已放置）
                        const myCards = Array.isArray(p.myHandCards) ? p.myHandCards : [];
                        const teammateCards = Array.isArray(p.teammateHandCards) ? p.teammateHandCards : [];
                        const myPlaced = Array.isArray(p.myPlacedCards) ? p.myPlacedCards : [];
                        const teammatePlaced = Array.isArray(p.teammatePlacedCards) ? p.teammatePlacedCards : [];
                        const allCards = [...myCards, ...teammateCards, ...myPlaced, ...teammatePlaced];
                        const cardMatch = allCards.some(c => String(c || '').toLowerCase().includes(keyword));

                        // 搜索卡皮
                        const skins = p.cardSkins ? Object.values(p.cardSkins) : [];
                        const skinMatch = skins.some(s => (s || '').toLowerCase().includes(keyword));

                        // 搜索牌组信息
                        const deckInfo = [p.myDeckInfo || '', p.teammateDeckInfo || ''];
                        const deckMatch = deckInfo.some(d => d.toLowerCase().includes(keyword));

                        // 搜索脚本文件
                        const txtFiles = Array.isArray(p.txtFiles) ? p.txtFiles : [];
                        const matchedFiles = txtFiles.filter(f =>
                            (f.name || '').toLowerCase().includes(keyword) ||
                            (f.content || '').toLowerCase().includes(keyword)
                        );
                        const fileMatch = matchedFiles.length > 0;

                        // 搜索记事本
                        const notepadMatch = (p.notepad || '').toLowerCase().includes(keyword);

                        if (!nameMatch && !catMatch && !cardMatch && !skinMatch && !deckMatch && !fileMatch && !notepadMatch) return;

                        // 高亮关键字
                        const highlight = (text) => {
                            if (!text) return '';
                            const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                            const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                            return escaped.replace(regex, '<span style="background:#ff9800;color:#000;padding:0 2px;border-radius:2px;">$1</span>');
                        };

                        let matchInfo = [];
                        if (nameMatch) matchInfo.push('项目名');
                        if (catMatch) matchInfo.push('分类');
                        if (cardMatch) matchInfo.push('卡牌');
                        if (skinMatch) matchInfo.push('卡皮');
                        if (deckMatch) matchInfo.push('牌组');
                        if (fileMatch) matchInfo.push(`脚本(${matchedFiles.length}个)`);
                        if (notepadMatch) matchInfo.push('记事本');

                        html += `
                            <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(0,188,212,0.2);border-radius:8px;padding:10px;cursor:pointer;" onclick="loadProjectByName('${p.name.replace(/'/g, "\\'")}')">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <div style="flex:1;overflow:hidden;">
                                        <div style="color:#4fc3f7;font-weight:bold;margin-bottom:4px;">📁 ${highlight(p.name)}</div>
                                        <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">分类：${highlight(p.category || '默认分类')}</div>
                                        <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-top:2px;">匹配：${matchInfo.join('、')}</div>
                                    </div>
                                    <button onclick="event.stopPropagation();loadProjectByName('${p.name.replace(/'/g, "\\'")}')" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;flex-shrink:0;">加载</button>
                                </div>
                            </div>
                        `;
                    });

                    if (!html) {
                        html = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">未找到匹配的项目</div>';
                    }
                    resultsEl.innerHTML = html;
                });
            }, 300);
        }

        // 清空解析输入
        function clearParserInput() {
            document.getElementById('parserInput').value = '';
            document.getElementById('parserResult').innerHTML = '';
        }

        // ==================== 快速输入卡牌（拼音联想，支持全拼+简拼） ====================
        // 内置字符级拼音映射表，覆盖所有卡牌用到的汉字，无需外部CDN

        const CHAR_PINYIN_MAP = {
            // 战士类
            '战':'zhan','将':'jiang','刀':'dao','客':'ke','霸':'ba','王':'wang',
            '狂':'kuang','龙':'long','亡':'wang','领':'ling','孤':'gu','星':'xing',
            '拳':'quan','鱼':'yu','铁':'tie','剑':'jian','斧':'fu','恶':'e',
            '匪':'fei','钢':'gang','鬃':'zong','刺':'ci','神':'shen','石':'shi','头':'tou',
            // 法师类
            '小':'xiao','丑':'chou','女':'nv','雷':'lei','谜':'mi','云':'yun',
            '沙':'sha','龟':'gui','相':'xiang','阿':'a','翼':'yi','火':'huo',
            '凤':'feng','凰':'huang','冰':'bing','鸟':'niao','电':'dian','法':'fa',
            '飞':'fei','炎':'yan','暗':'an','炮':'pao','弹':'dan',
            // 弓箭手类
            '虎':'hu','毒':'du','后':'hou','船':'chuan','爱':'ai','海':'hai',
            '骨':'gu','弓':'gong','枪':'qiang','松':'song','绿':'lv','蛛':'zhu',
            // 召唤师类
            '幽':'you','灵':'ling','钟':'zhong','馗':'kui','悟':'wu','空':'kong',
            '骑':'qi','祭':'ji','司':'si','魔':'mo','鬼':'gui','妖':'yao',
            // 牧师类
            '咕':'gu','野':'ye','圣':'sheng','鲛':'jiao','天':'tian','使':'shi',
            '巫':'wu','医':'yi','死':'si','工':'gong','地':'di','精':'jing',
            '萨':'sa','满':'man','酋':'qiu','长':'zhang','猫':'mao','咪':'mi',
            '大':'da','树':'shu','鹿':'lu',
            // 术士类
            '影':'ying','魇':'yan','葵':'kui','傀':'kui','邪':'xie','闪':'shan',
            // 熊猫类
            '萌':'meng','水':'shui','风':'feng','土':'tu',
            // 工程类
            '宝':'bao','库':'ku','射':'she','咬':'yao','人':'ren','娃':'wa',
            '潜':'qian','艇':'ting',
            // 精灵类
            '光':'guang','木':'mu','魂':'hun','幻':'huan','彩':'cai',
            // 其他常见卡牌用字
            '白':'bai','黑':'hei','红':'hong','金':'jin','银':'yin','木':'mu',
            '土':'tu','日':'ri','月':'yue','星':'xing','辰':'chen',
            '甲':'jia','盾':'dun','剑':'jian','刃':'ren','锋':'feng',
            '兽':'shou','狼':'lang','虎':'hu','豹':'bao','熊':'xiong',
            '蛇':'she','蝎':'xie','蛛':'zhu','虫':'chong','鱼':'yu',
            '鸟':'niao','鹰':'ying','雀':'que','凤':'feng','龙':'long',
            '仙':'xian','神':'shen','鬼':'gui','魔':'mo','妖':'yao','怪':'guai',
            '皇':'huang','帝':'di','君':'jun','王':'wang','侯':'hou','伯':'bo',
            '将':'jiang','帅':'shuai','兵':'bing','卒':'zu','士':'shi',
            '战':'zhan','斗':'dou','攻':'gong','守':'shou','防':'fang',
            '杀':'sha','生':'sheng','死':'si','灭':'mie','破':'po',
            '冰':'bing','雪':'xue','霜':'shuang','寒':'han','冻':'dong',
            '炎':'yan','焰':'yan','烈':'lie','炽':'chi','燃':'ran','烧':'shao',
            '雷':'lei','电':'dian','闪':'shan','光':'guang','明':'ming','暗':'an',
            '风':'feng','云':'yun','雨':'yu','雾':'wu','岚':'lan',
            '山':'shan','岩':'yan','石':'shi','铁':'tie','钢':'gang','金':'jin',
            '木':'mu','林':'lin','森':'sen','树':'shu','叶':'ye','花':'hua',
            '水':'shui','海':'hai','江':'jiang','河':'he','湖':'hu','泽':'ze',
            '火':'huo','焰':'yan','烟':'yan','灰':'hui','炭':'tan',
            '土':'tu','地':'di','沙':'sha','尘':'chen','泥':'ni'
        };

        // 获取所有卡牌名列表（仅含真正的卡牌，排除手牌组合名）
        function getAllCardNames() {
            // SKIN_ATTRIBUTES 已涵盖全部100张卡牌
            const names = Object.keys(SKIN_ATTRIBUTES || {});
            if (window.cloudCards) Object.keys(window.cloudCards).forEach(n => names.push(n));
            // 从收藏卡牌中补充（自定义卡牌也会收录到这里）
            if (typeof favoriteCards !== 'undefined' && Array.isArray(favoriteCards)) {
                favoriteCards.forEach(c => { if (c && c.name) names.push(c.name); });
            }
            return [...new Set(names)].sort();
        }

        // 获取卡名的全拼（无空格小写）和首字母简拼
        function getCardPinyin(name) {
            let full = '', initial = '';
            for (const char of name) {
                if (/[a-zA-Z0-9]/.test(char)) {
                    full += char.toLowerCase();
                    initial += char.toLowerCase();
                } else if (CHAR_PINYIN_MAP[char]) {
                    const py = CHAR_PINYIN_MAP[char];
                    full += py;
                    initial += py[0];
                }
                // 未收录的汉字跳过（不影响其他字符的匹配）
            }
            return { full, initial };
        }

        // 快速输入 - 输入时联想（支持全拼、简拼、中文模糊匹配，收藏优先）
        let quickSuggestList = [];
        let quickSuggestIndex = -1;

        function onQuickCardInput(event) {
            const input = event.target.value.trim().toLowerCase();
            const suggestBox = document.getElementById('quickCardSuggest');
            if (!input) {
                suggestBox.style.display = 'none';
                quickSuggestList = [];
                return;
            }

            const allNames = getAllCardNames();
            // 收藏卡牌名集合（用于优先排序）
            const favNames = new Set();
            if (typeof favoriteCards !== 'undefined' && Array.isArray(favoriteCards)) {
                favoriteCards.forEach(c => { if (c && c.name) favNames.add(c.name); });
            }
            const matched = [];

            for (const name of allNames) {
                const py = getCardPinyin(name);
                let score = 0;
                // 完全匹配首字母简拼
                if (py.initial === input) score = 100;
                // 首字母简拼开头匹配
                else if (py.initial.startsWith(input)) score = 90;
                // 首字母简拼包含
                else if (py.initial.includes(input)) score = 70;
                // 完全匹配全拼
                if (py.full === input) score = Math.max(score, 95);
                // 全拼开头匹配
                else if (py.full.startsWith(input)) score = Math.max(score, 85);
                // 全拼包含
                else if (py.full.includes(input)) score = Math.max(score, 65);
                // 卡名包含输入（中文模糊）
                if (name.includes(input) || name.toLowerCase().includes(input)) score = Math.max(score, 80);
                // 卡名开头匹配
                if (name.toLowerCase().startsWith(input)) score = Math.max(score, 88);

                if (score > 0) {
                    // 收藏卡牌加分（优先显示）
                    if (favNames.has(name)) score += 5;
                    matched.push({ name, score, initial: py.initial, full: py.full, isFav: favNames.has(name) });
                }
            }

            matched.sort((a, b) => b.score - a.score);
            quickSuggestList = matched.slice(0, 10);
            quickSuggestIndex = -1;

            if (quickSuggestList.length === 0) {
                suggestBox.style.display = 'none';
                return;
            }

            // 渲染建议列表
            let html = '<div style="position:absolute;top:0;left:0;right:0;background:#1a1a2e;border:1px solid rgba(0,188,212,0.5);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.6);max-height:220px;overflow-y:auto;z-index:30;">';
            quickSuggestList.forEach((item, idx) => {
                const favStar = item.isFav ? '<span style="color:#ffd700;margin-right:4px;">★</span>' : '';
                const nameColor = item.isFav ? '#ffd700' : '#00bcd4';
                html += `<div class="quick-suggest-item" data-name="${item.name}" onclick="selectQuickCard('${item.name}')" style="padding:6px 12px;cursor:pointer;font-size:0.85rem;color:#fff;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;${item.isFav ? 'background:rgba(255,215,0,0.08);' : ''}" onmouseover="this.style.background='rgba(0,188,212,0.2)';quickSuggestIndex=${idx};" onmouseout="this.style.background='${item.isFav ? 'rgba(255,215,0,0.08)' : ''}';">`;
                html += `<span style="color:${nameColor};">${favStar}${item.name}</span>`;
                html += `<span style="color:rgba(255,255,255,0.3);font-size:0.72rem;">${item.initial} / ${item.full}</span>`;
                html += `</div>`;
            });
            html += '</div>';
            suggestBox.innerHTML = html;
            suggestBox.style.display = 'block';
        }

        function onQuickCardKeydown(event) {
            const suggestBox = document.getElementById('quickCardSuggest');
            if (suggestBox.style.display === 'none' || quickSuggestList.length === 0) return;

            const items = suggestBox.querySelectorAll('.quick-suggest-item');
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                quickSuggestIndex = Math.min(quickSuggestIndex + 1, items.length - 1);
                updateSuggestHighlight(items);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                quickSuggestIndex = Math.max(quickSuggestIndex - 1, 0);
                updateSuggestHighlight(items);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const name = quickSuggestIndex >= 0 ? quickSuggestList[quickSuggestIndex].name : quickSuggestList[0].name;
                selectQuickCard(name);
            } else if (event.key === 'Escape') {
                suggestBox.style.display = 'none';
            }
        }

        function updateSuggestHighlight(items) {
            items.forEach((item, idx) => {
                item.style.background = idx === quickSuggestIndex ? 'rgba(0,188,212,0.3)' : '';
            });
            // 滚动到可见
            if (items[quickSuggestIndex]) {
                items[quickSuggestIndex].scrollIntoView({ block: 'nearest' });
            }
        }

        function selectQuickCard(name) {
            const textarea = document.getElementById('parserInput');
            let current = textarea.value.trim();

            // 智能拼接
            if (!current) {
                // 空文本，自动加上"上阵："前缀
                textarea.value = `上阵：${name}`;
            } else if (current.endsWith('：') || current.endsWith(':')) {
                // 刚好输入了冒号
                textarea.value = current + name;
            } else if (current.startsWith('上阵') || current.startsWith('上阵：') || current.startsWith('上阵:')) {
                // 已有"上阵："前缀，追加卡名
                if (current.endsWith(',') || current.endsWith('，')) {
                    textarea.value = current + name;
                } else {
                    textarea.value = current + ',' + name;
                }
            } else {
                // 没有前缀，直接追加
                textarea.value = current + ',' + name;
            }

            // 清空输入框，继续输入下一张
            document.getElementById('quickCardInput').value = '';
            document.getElementById('quickCardSuggest').style.display = 'none';
            quickSuggestList = [];
            // 实时更新减伤显示
            updateRealTimeDamageReduction();
            // 焦点回到输入框，方便连续输入
            document.getElementById('quickCardInput').focus();
        }

        function clearQuickCardInput() {
            document.getElementById('quickCardInput').value = '';
            document.getElementById('quickCardSuggest').style.display = 'none';
            quickSuggestList = [];
            document.getElementById('quickCardInput').focus();
        }

        // 减伤解析页：用通用筛选器从全部英雄卡里挑一张，选完追加到下方文本
        function openParserCardPicker() {
            const seen = new Set();
            const items = [];
            document.querySelectorAll('.collapsible-section .card-item, #favoriteCardsGrid .card-item').forEach(el => {
                const name = el.dataset.name;
                if (!name || seen.has(name)) return;
                seen.add(name);
                items.push({
                    value: name,
                    label: name,
                    profession: el.dataset.profession,
                    py: window.hanziInitials ? window.hanziInitials(name) : ''
                });
            });
            items.sort((a, b) => (a.py || a.label).localeCompare(b.py || b.label, 'zh-Hans-CN'));
            openGenericPicker({
                title: '📋 选择英雄卡（加入减伤计算）',
                searchPlaceholder: '输入首字母或卡名关键字…',
                items: items,
                onPick: function (val) {
                    selectQuickCard(val);
                }
            });
        }

        // 点击其他地方关闭联想框
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#quickCardInput') && !e.target.closest('#quickCardSuggest')) {
                const box = document.getElementById('quickCardSuggest');
                if (box) box.style.display = 'none';
            }
        });

        // 脚本解析输入框 - 拖拽支持
        function handleParserDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            const hint = document.getElementById('parserDropHint');
            if (hint) hint.style.display = 'flex';
        }

        function handleParserDragLeave(event) {
            // 只有离开整个面板才隐藏（避免子元素间跳动）
            const panel = document.getElementById('txtTabParser');
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            const x = event.clientX, y = event.clientY;
            if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
                const hint = document.getElementById('parserDropHint');
                if (hint) hint.style.display = 'none';
            }
        }

        function handleParserDrop(event) {
            event.preventDefault();
            const hint = document.getElementById('parserDropHint');
            if (hint) hint.style.display = 'none';

            // 拖拽的文件（仅支持单个文件解析）
            const files = event.dataTransfer.files;
            if (files && files.length > 0) {
                if (files.length > 1) {
                    document.getElementById('parserResult').innerHTML = '<span style="color:#ff9800;">⚠️ 解析框仅支持单个文件，多文件请拖到"脚本文件"列表</span>';
                    return;
                }
                const file = files[0];
                const validExts = ['.txt', '.js', '.json', '.lua', '.py', '.sh'];
                if (!(file.type === 'text/plain' || validExts.some(ext => file.name.toLowerCase().endsWith(ext)))) {
                    document.getElementById('parserResult').innerHTML = '<span style="color:#ef4444;">⚠️ 仅支持 .txt / .js / .json / .lua / .py / .sh 文本文件</span>';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('parserInput').value = e.target.result;
                    document.getElementById('parserResult').innerHTML = `<span style="color:#4caf50;">✅ 已从文件 "${file.name}" 导入文本</span>`;
                };
                reader.readAsText(file, 'UTF-8');
                return;
            }

            // 没有文件则处理拖拽的文本
            const text = event.dataTransfer.getData('text');
            if (text) {
                document.getElementById('parserInput').value = text;
                document.getElementById('parserResult').innerHTML = '<span style="color:#4caf50;">✅ 已导入拖拽文本</span>';
            }
        }

        // 脚本文件Tab - 拖拽支持（拖拽文件直接上传到脚本列表）
        function handleFilesTabDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            const hint = document.getElementById('filesDropHint');
            if (hint) hint.style.display = 'flex';
        }

        function handleFilesTabDragLeave(event) {
            const panel = document.getElementById('txtTabFiles');
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            const x = event.clientX, y = event.clientY;
            if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
                const hint = document.getElementById('filesDropHint');
                if (hint) hint.style.display = 'none';
            }
        }

        function handleFilesTabDrop(event) {
            event.preventDefault();
            const hint = document.getElementById('filesDropHint');
            if (hint) hint.style.display = 'none';

            const files = event.dataTransfer.files;
            if (!files || files.length === 0) return;

            const validExts = ['.txt', '.js', '.json', '.lua', '.py', '.sh'];
            let added = 0, skipped = 0;

            Array.from(files).forEach(file => {
                const ext = '.' + file.name.split('.').pop().toLowerCase();
                if (validExts.includes(ext) || file.type === 'text/plain') {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        if (!currentProjectName) {
                            alert('请先选择或创建一个项目！');
                            return;
                        }
                        if (!txtFiles) txtFiles = [];
                        // 避免重名
                        let fileName = file.name;
                        let counter = 1;
                        while (txtFiles.some(f => f.name === fileName)) {
                            const dotIdx = file.name.lastIndexOf('.');
                            fileName = dotIdx > 0 ? file.name.substring(0, dotIdx) + `(${counter})` + file.name.substring(dotIdx) : file.name + `(${counter})`;
                            counter++;
                        }
                        txtFiles.push({ name: fileName, content: e.target.result });
                        added++;
                        updateTxtFilesList();
                        autoSaveProject();
                    };
                    reader.readAsText(file, 'UTF-8');
                } else {
                    skipped++;
                }
            });

            if (added > 0 && skipped > 0) {
                // 用延时确保 added 已更新
            } else if (skipped > 0 && added === 0) {
                // 所有文件都不支持
            }
        }

        // 全局粘贴支持（面板可见时：解析tab粘贴到输入框，文件tab粘贴文件到列表）
        document.addEventListener('paste', function(event) {
            const panel = document.getElementById('txtFilesPanel');
            if (!panel || panel.style.display === 'none') return;

            // 脚本文件tab激活时：粘贴文件到列表
            const filesTab = document.getElementById('txtTabFiles');
            if (filesTab && filesTab.style.display !== 'none') {
                // 如果焦点在搜索框内，不拦截
                if (document.activeElement && document.activeElement.id === 'txtFileSearchInput') return;
                const items = event.clipboardData?.items;
                if (!items) return;
                let pasted = false;
                const validExts = ['.txt', '.js', '.json', '.lua', '.py', '.sh'];
                for (const item of items) {
                    if (item.kind === 'file') {
                        const file = item.getAsFile();
                        if (!file) continue;
                        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
                        if (validExts.includes(ext) || file.type === 'text/plain') {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                if (!currentProjectName) {
                                    alert('请先选择或创建一个项目！');
                                    return;
                                }
                                if (!txtFiles) txtFiles = [];
                                let fileName = file.name;
                                let counter = 1;
                                while (txtFiles.some(f => f.name === fileName)) {
                                    const dotIdx = file.name.lastIndexOf('.');
                                    fileName = dotIdx > 0 ? file.name.substring(0, dotIdx) + `(${counter})` + file.name.substring(dotIdx) : file.name + `(${counter})`;
                                    counter++;
                                }
                                txtFiles.push({ name: fileName, content: e.target.result });
                                updateTxtFilesList();
                                autoSaveProject();
                            };
                            reader.readAsText(file, 'UTF-8');
                            pasted = true;
                        }
                    }
                }
                if (pasted) event.preventDefault();
                return;
            }

            // 脚本解析tab激活时：粘贴文本到输入框
            const parserTab = document.getElementById('txtTabParser');
            if (!parserTab || parserTab.style.display === 'none') return;

            // 如果焦点已经在输入框内，让浏览器默认行为处理
            if (document.activeElement && document.activeElement.id === 'parserInput') return;

            const text = event.clipboardData?.getData('text');
            if (text && text.trim().length > 0) {
                event.preventDefault();
                const input = document.getElementById('parserInput');
                input.value = text;
                input.focus();
                document.getElementById('parserResult').innerHTML = '<span style="color:#4caf50;">✅ 已粘贴文本，点击解析或生成</span>';
                updateRealTimeDamageReduction();
            }
        });

        // 解析文本并添加卡牌到手牌
        function parseTextAndAddCards() {
            const input = document.getElementById('parserInput').value.trim();
            const target = document.getElementById('parserHandTarget').value;
            const resultEl = document.getElementById('parserResult');
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('解析并添加手牌');

            if (!input) {
                resultEl.innerHTML = '<span style="color:#f44336;">请输入文本！</span>';
                return;
            }

            // 解析"上阵："后面的内容
            let heroNames = [];
            
            // 支持"上阵：英雄1,英雄2,..."格式
            const match = input.match(/上阵[：:]\s*(.+)/);
            if (match && match[1]) {
                // 按逗号分割，支持中英文逗号
                heroNames = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
            } else {
                // 如果没有"上阵："，直接按逗号分割
                heroNames = input.split(/[,，]/).map(name => name.trim()).filter(name => name);
            }

            if (heroNames.length === 0) {
                resultEl.innerHTML = '<span style="color:#f44336;">未找到英雄名称！</span>';
                return;
            }

            // 过滤融合卡（融合卡不能用于脚本，需拆分为单卡）
            const fusionNames = [
                '火炮射线', '射线潜艇', '火炮潜艇', '宝库射线', '宝库潜艇', '宝库火炮',
                '潜艇射线', '潜艇火炮', '射线火炮',
                '水灵刀客', '刀客水灵', '蛇女爱神', '爱神蛇女',
                '咕咕天使', '天使咕咕', '圣骑天使', '天使圣骑',
                '战将鱼人', '鱼人战将', '电法冰法', '冰法电法',
                '萌萌水灵', '水灵萌萌', '火灵风灵', '风灵火灵'
            ];
            const filteredFusion = [];
            heroNames = heroNames.filter(name => {
                const isFusion = fusionNames.includes(name) ||
                    (name.length >= 4 && name.length % 2 === 0 &&
                     !Object.keys(SKIN_ATTRIBUTES).includes(name) &&
                     Object.keys(SKIN_ATTRIBUTES).includes(name.substring(0, 2)) &&
                     Object.keys(SKIN_ATTRIBUTES).includes(name.substring(2)));
                if (isFusion) {
                    filteredFusion.push(name);
                    return false;
                }
                return true;
            });

            // 限制最多10张
            let overLimitCards = [];
            if (heroNames.length > 10) {
                overLimitCards = heroNames.slice(10);
                heroNames = heroNames.slice(0, 10);
            }

            // 获取目标手牌数组
            const targetHand = target === 'my' ? myHandCards : teammateHandCards;

            // 查找并添加卡牌
            let addedCount = 0;
            let notFoundCards = [];
            let duplicateCards = [];

            heroNames.forEach(heroName => {
                // 在卡池中查找卡牌
                const cardEl = document.querySelector(`.card-item[data-name="${heroName}"]`);
                
                if (!cardEl) {
                    notFoundCards.push(heroName);
                    return;
                }

                const cardId = cardEl.dataset.id;
                const cardType = cardEl.dataset.type;
                const isEngineering = cardEl.dataset.engineering === 'true';
                const profession = cardEl.dataset.profession;

                // 检查是否已在手牌中
                if (targetHand.some(c => c.id === cardId) || handHasIdentity(targetHand, heroName)) {
                    duplicateCards.push(heroName);
                    return;
                }

                // 检查手牌是否已满
                if (targetHand.length >= MAX_HAND_CARDS) {
                    return;
                }

                // 添加到手牌
                targetHand.push({
                    id: cardId,
                    name: heroName,
                    placed: null,
                    isEngineering,
                    profession,
                    type: cardType
                });
                addedCount++;
            });

            // 更新手牌显示
            updateHandDisplay(target);
            
            // 更新卡牌等级徽章显示
            updateAllCardLevelBadges();
            
            // 保存项目
            autoSaveProject();
            
            // 调试：检查手牌数据

            // 显示结果
            let resultHtml = '';
            if (addedCount > 0) {
                resultHtml += `<span style="color:#4caf50;">✅ 成功添加 ${addedCount} 张卡牌到${target === 'my' ? '我的手牌' : '队友手牌'}</span>`;
            }
            if (filteredFusion.length > 0) {
                resultHtml += `<br><span style="color:#9c27b0;">🚫 已过滤融合卡：${filteredFusion.join('、')}（融合卡需拆分为单卡）</span>`;
            }
            if (overLimitCards.length > 0) {
                resultHtml += `<br><span style="color:#ff5722;">⚠️ 超出10张上限，已忽略：${overLimitCards.join('、')}</span>`;
            }
            if (duplicateCards.length > 0) {
                resultHtml += `<br><span style="color:#ff9800;">⚠️ 重复卡牌：${duplicateCards.join('、')}</span>`;
            }
            if (notFoundCards.length > 0) {
                resultHtml += `<br><span style="color:#f44336;">❌ 未找到：${notFoundCards.join('、')}</span>`;
            }

            resultEl.innerHTML = resultHtml;
        }

        // 活动脚本生成功能
        // 读取手牌到脚本输入框：取「分配到手牌」所选那份，融合卡自动取主卡，只填不生成（生成由用户自行选择）
        function importHandToParser() {
            const targetSel = document.getElementById('parserHandTarget');
            const target = targetSel ? (targetSel.value || 'my') : 'my';
            const isTeammate = (target === 'teammate');
            const src = isTeammate
                ? (typeof teammateHandCards !== 'undefined' ? teammateHandCards : [])
                : (typeof myHandCards !== 'undefined' ? myHandCards : []);
            if (!src || !src.length) {
                const r = document.getElementById('parserResult');
                if (r) r.innerHTML = '<span style="color:#ffb74d;">⚠️ 「' + (isTeammate ? '队友手牌' : '我的手牌') + '」为空，无法读取。请先在卡池点选加入手牌。</span>';
                return;
            }
            const names = src.map(c => (c && c.name) ? c.name : '').filter(Boolean)
                .map(n => (typeof getMainCardName === 'function') ? getMainCardName(n) : n);
            const seen = new Set(); const uniq = [];
            names.forEach(n => { if (!seen.has(n)) { seen.add(n); uniq.push(n); } });
            const input = document.getElementById('parserInput');
            if (input) {
                input.value = '上阵：' + uniq.join(',');
                if (typeof updateRealTimeDamageReduction === 'function') updateRealTimeDamageReduction();
            }
            if (typeof switchTxtPanelTab === 'function') switchTxtPanelTab('parser');
            const r = document.getElementById('parserResult');
            if (r) r.innerHTML = '<span style="color:#4caf50;">✅ 已从「' + (isTeammate ? '队友手牌' : '我的手牌') + '」读取 ' + uniq.length + ' 张（融合卡已自动取主卡），已填入输入框。请选择下方按钮生成对应脚本。</span>';
        }

        function parseActivityScript(includeChengShang) {
            if (typeof includeChengShang === 'undefined') includeChengShang = true;
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse(includeChengShang ? '活动脚本生成' : '隐藏榜脚本生成');
            const input = document.getElementById('parserInput').value.trim();
            const resultEl = document.getElementById('parserResult');

            if (!input) {
                resultEl.innerHTML = '<span style="color:#f44336;">请输入文本！</span>';
                return;
            }

            // 按行分割输入
            const lines = input.split('\n').map(line => line.trim()).filter(line => line);
            
            // 解析"上阵："后面的内容
            let heroNames = [];
            let zhenZhanLine = '';
            let otherLines = []; // 魔化、皮肤、主战车、副战车等行
            let moHuaCards = []; // 魔化的卡牌列表
            
            lines.forEach((line, index) => {
                if (line.match(/^上阵[：:]/)) {
                    zhenZhanLine = line;
                    const match = line.match(/上阵[：:]\s*(.+)/);
                    if (match && match[1]) {
                        heroNames = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
                    }
                } else if (line.match(/^魔化[：:]/)) {
                    otherLines.push(line);
                    // 提取魔化的卡牌名称
                    const match = line.match(/魔化[：:]\s*(.+)/);
                    if (match && match[1]) {
                        moHuaCards = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
                    }
                } else if (line.match(/^(皮肤|主战车|副战车)[：:]/)) {
                    otherLines.push(line);
                } else if (index === 0 && !line.match(/^(魔化|皮肤|主战车|副战车)[：:]/)) {
                    // 没有"上阵："前缀时，直接解析第一行作为卡牌列表
                    heroNames = line.split(/[,，]/).map(name => name.trim()).filter(name => name);
                }
            });

            // 没有"上阵："时，自动补上
            if (heroNames.length > 0 && !zhenZhanLine) {
                zhenZhanLine = '上阵：' + heroNames.join(',');
            }

            if (heroNames.length === 0) {
                resultEl.innerHTML = '<span style="color:#f44336;">未找到英雄名称！</span>';
                return;
            }

            // 过滤融合卡（融合卡不能用于脚本，需拆分为单卡）
            const fusionNames = [
                '火炮射线', '射线潜艇', '火炮潜艇', '宝库射线', '宝库潜艇', '宝库火炮',
                '潜艇射线', '潜艇火炮', '射线火炮',
                '水灵刀客', '刀客水灵', '蛇女爱神', '爱神蛇女',
                '咕咕天使', '天使咕咕', '圣骑天使', '天使圣骑',
                '战将鱼人', '鱼人战将', '电法冰法', '冰法电法',
                '萌萌水灵', '水灵萌萌', '火灵风灵', '风灵火灵'
            ];
            const allSkinKeys = Object.keys(SKIN_ATTRIBUTES);
            const filteredFusion = [];
            heroNames = heroNames.filter(name => {
                const isFusion = fusionNames.includes(name) ||
                    (name.length >= 4 && name.length % 2 === 0 &&
                     !allSkinKeys.includes(name) &&
                     allSkinKeys.includes(name.substring(0, 2)) &&
                     allSkinKeys.includes(name.substring(2)));
                if (isFusion) {
                    filteredFusion.push(name);
                    return false;
                }
                return true;
            });

            if (heroNames.length === 0 && filteredFusion.length > 0) {
                resultEl.innerHTML = '<span style="color:#9c27b0;">🚫 输入的均为融合卡，已过滤。融合卡需拆分为单卡后重新输入。</span>';
                return;
            }

            // 超出10张上限提示
            let overLimitCards = [];
            if (heroNames.length > 10) {
                overLimitCards = heroNames.slice(10);
                heroNames = heroNames.slice(0, 10);
            }

            // 精灵类卡名列表（精灵不占位置，跳过）
            const jingLingNames = ['冰精灵', '光精灵', '魔精灵', '木精灵', '土精灵', '雷精灵', '暗精灵', '幻精灵', '魂精灵', '彩精灵'];
            // 工程类卡名列表（工程卡不占6位置，单独满）
            const gongChengNames = ['火炮', '咬人娃娃', '潜艇', '宝库', '射线'];
            
            // 检查是否有工程卡
            const hasGongCheng = heroNames.some(name => gongChengNames.some(gc => name.includes(gc)));
            
            // 分离工程卡和非工程卡
            const gongChengCards = heroNames.filter(name => gongChengNames.some(gc => name.includes(gc)));
            // 过滤掉精灵类和工程卡，取前6张
            const filteredCards = heroNames.filter(name => {
                if (jingLingNames.some(jl => name.includes(jl))) return false;
                if (gongChengNames.some(gc => name.includes(gc))) return false;
                return true;
            });
            const first6 = filteredCards.slice(0, 6);
            
            // 检查是否有冰精灵
            const hasBingJingLing = heroNames.some(name => name.includes('冰精灵'));
            // 检查是否有魔精灵、光精灵、木精灵、魂精灵
            const hasMoJingLing = heroNames.some(name => name.includes('魔精灵'));
            const hasLongWang = heroNames.some(name => name.includes('龙王'));
            const hasGuangJingLing = heroNames.some(name => name.includes('光精灵'));
            const hasMuJingLing = heroNames.some(name => name.includes('木精灵'));
            const hasHunJingLing = heroNames.some(name => name.includes('魂精灵'));
            const hasLeiJingLing = heroNames.some(name => name.includes('雷精灵'));
            const hasHuanJingLing = heroNames.some(name => name.includes('幻精灵'));
            // 检查是否有蛇女
            const hasSheNv = heroNames.some(name => name.includes('蛇女'));
            // 检查是否有飞机和大圣（同排机制）
            const hasFeiJi = heroNames.some(name => name.includes('飞机'));
            const hasDaSheng = heroNames.some(name => name.includes('大圣'));
            const hasTongPai = hasFeiJi && hasDaSheng;

            // 构建输出
            // 第一部分：原样输出输入的行
            let output = '';
            if (zhenZhanLine) {
                output += zhenZhanLine + '\n';
            }
            // 始终输出魔化、皮肤、主战车、副战车这几行
            const defaultLines = ['魔化：', '皮肤：', '主战车：', '副战车：'];
            defaultLines.forEach(defaultLine => {
                // 检查输入中是否有这一行
                const foundLine = otherLines.find(line => line.startsWith(defaultLine.replace('：', '')));
                if (foundLine) {
                    output += foundLine + '\n';
                } else {
                    output += defaultLine + '\n';
                }
            });
            
            // 空一行
            output += '\n';
            
            // 构建上卡字符串
            // 如果有光精灵就上3级（魔化的卡上4级），否则上满
            let shangKaStr = '';
            
            // 辅助函数：判断卡牌是否在魔化列表中
            const isMoHua = (name) => moHuaCards.some(mh => name.includes(mh) || mh.includes(name));
            
            // 蛇女加速优先级：火灵 > 虎弓 > 风灵 > 后羿 > 小野 > 天使 > 水灵
            // 有蛇女时优先级最高的2张卡放第4、5位，蛇女固定第6位
            const sheNvPriority = ['火灵', '虎弓', '风灵', '后羿', '小野', '天使', '水灵'];
            const priorityCards = sheNvPriority.filter(p =>
                filteredCards.some(name => name.includes(p))
            ).map(p => filteredCards.find(name => name.includes(p)));
            const sheNvCards = filteredCards.filter(name => name.includes('蛇女'));

            // 构建上卡列表
            let arrangedCards = [];
            if (hasSheNv) {
                // 有蛇女：第4-5位放优先级最高的2张，第6位蛇女，前3位放剩余卡
                const top2 = priorityCards.slice(0, 2);
                const restPriority = priorityCards.slice(2);
                const nonPriorityNonGongCheng = filteredCards.filter(name =>
                    !priorityCards.some(p => p === name) && !name.includes('蛇女') &&
                    !gongChengNames.some(gc => name.includes(gc))
                );
                const first3 = [...restPriority, ...nonPriorityNonGongCheng].slice(0, 3);
                arrangedCards.push(...first3);      // 前3位
                arrangedCards.push(...top2);        // 第4-5位：优先级最高2张
                arrangedCards.push(...sheNvCards);  // 第6位：蛇女
            } else {
                // 没有蛇女，正常上卡（取前6张）
                arrangedCards = [...first6];
            }

            // 生成上卡字符串（有光精灵：魔化4级/其他3级；无光精灵：全满）
            arrangedCards.forEach(name => {
                if (hasGuangJingLing) {
                    const level = isMoHua(name) ? '4级' : '3级';
                    shangKaStr += `上${name}${level},`;
                } else {
                    shangKaStr += `上${name}满,`;
                }
            });

            // 工程卡加在最后（第7位）
            if (hasGongCheng) {
                gongChengCards.forEach(name => {
                    if (hasGuangJingLing) {
                        const level = isMoHua(name) ? '4级' : '3级';
                        shangKaStr += `上${name}${level},`;
                    } else {
                        shangKaStr += `上${name}满,`;
                    }
                });
            }

            // 第一行脚本
            // 如果有蛇女，加"强制顺序上卡,"
            const qiangZhiStr = hasSheNv ? '强制顺序上卡,' : '';
            // 如果有飞机和大圣同排，加"飞机大圣同排,"
            const tongPaiStr = hasTongPai ? '飞机大圣同排,' : '';
            output += `00:01,${qiangZhiStr}${tongPaiStr}${shangKaStr}\n`;
            
            // 如果有光精灵，添加光精灵输出
            // 光精灵次数 = 20 - 魔化卡数量（最少1次）
            if (hasGuangJingLing) {
                const guangJingLingCount = Math.max(1, 20 - moHuaCards.length);
                output += `00:25,每0.1秒共${guangJingLingCount}次光精灵,关闭验光\n`;
            }

            // 龙王：没有魔精灵时，01:20下龙王上龙王不满
            if (hasLongWang && !hasMoJingLing) {
                output += '01:20,下龙王,上龙王不满,\n';
            }

            // 同排机制：飞机+大圣
            if (hasTongPai) {
                if (hasGuangJingLing) {
                    output += '01:20,下大圣,上大圣4级,光葫芦大圣,关闭验光,\n';
                } else {
                    output += '01:20,下大圣,上大圣满,\n';
                }
            }

            // 如果有魔精灵、木精灵、魂精灵，添加到同一行
            const jingLing01_25 = [];
            if (hasLeiJingLing) jingLing01_25.push('每0.1秒共5000次雷精灵');
            if (hasMoJingLing) jingLing01_25.push('每5秒共5000次魔精灵');
            if (hasMuJingLing) jingLing01_25.push('每3秒共5000次木精灵');
            if (hasHunJingLing) jingLing01_25.push('每3秒共5000次魂精灵');
            if (jingLing01_25.length > 0) {
                output += '01:25,' + jingLing01_25.join(',') + ',\n';
            }

            // 龙王+幻精灵同时存在时，01:40重复01:25的精灵操作并加换强袭
            if (hasLongWang && hasHuanJingLing) {
                if (jingLing01_25.length > 0) {
                    output += '01:40,换强袭,' + jingLing01_25.join(',') + ',\n';
                } else {
                    output += '01:40,换强袭,\n';
                }
            }

            // 无敌链逻辑（小野8秒无敌 → 凤凰6秒无敌）—— 仅隐藏榜生效，活动脚本不切卡
            if (!includeChengShang) {
            // 第一张卡名（arrangedCards的第一张）
            const firstCardName = arrangedCards[0] || '第一张卡';
            // 凤凰/小野检测：区分"携带"（在牌库中）和"上阵"（在arrangedCards中）
            // 只有携带但没有上阵的卡才需要切卡提示
            const fengHuangCarried = heroNames.some(name => name.includes('凤凰'));
            const xiaoYeCarried = heroNames.some(name => name.includes('小野'));
            const fengHuangDeployed = arrangedCards.some(name => name.includes('凤凰'));
            const xiaoYeDeployed = arrangedCards.some(name => name.includes('小野'));

            // 非工程非精灵卡数量
            const nonGongChengNonJingLingCount = heroNames.filter(name =>
                !gongChengNames.some(gc => name.includes(gc)) &&
                !jingLingNames.some(jl => name.includes(jl))
            ).length;

            // 情况1：小野携带但没上阵 + 凤凰携带但没上阵 + 卡>6张 → 02:26上下小野 + 02:38上下凤凰（小野扛02:30 boss）
            // 情况2：只有凤凰没有小野（凤凰携带但没上阵，小野未携带）→ 02:26上凤凰扛02:30 boss，02:31下凤凰恢复
            // 情况3：小野携带但没上阵 + 凤凰已上阵 → 02:36下凤凰上小野（不切回）
            // 情况4：小野已上阵 + 凤凰携带但没上阵 → 02:38下小野上下凤凰（切回小野）
            // 情况5：其他情况不切卡（没携带的不切）

            const xiaoYeNotInBattle = xiaoYeCarried && !xiaoYeDeployed;
            const fengHuangNotInBattle = fengHuangCarried && !fengHuangDeployed;

            // 精灵字符串：切卡回"上满"后紧接打精灵
            const jlArr = [];
            if (hasLeiJingLing) jlArr.push('每0.1秒共5000次雷精灵');
            if (hasMoJingLing) jlArr.push('每5秒共5000次魔精灵');
            if (hasMuJingLing) jlArr.push('每3秒共5000次木精灵');
            if (hasHunJingLing) jlArr.push('每3秒共5000次魂精灵');
            const jlStr = jlArr.length > 0 ? ',' + jlArr.join(',') : '';

            // 02:26-02:31 上下小野（小野没上阵 + 凤凰没上阵或未携带 + 卡>6张）
            const needXiaoYeSwitch = xiaoYeNotInBattle && !fengHuangDeployed && nonGongChengNonJingLingCount > 6;
            if (needXiaoYeSwitch) {
                output += `02:26,下${firstCardName},上小野满${jlStr},\n`;
                output += `02:31,下小野,上${firstCardName}满${jlStr},\n`;
            }

            // 02:36 下凤凰上小野（情况3：小野没上阵 + 凤凰携带且已上阵）
            const needFengHuangToXiaoYe = xiaoYeNotInBattle && fengHuangCarried && fengHuangDeployed;
            if (needFengHuangToXiaoYe) {
                output += `02:36,下凤凰,上小野满${jlStr},\n`;
            }

            // 02:38 上下凤凰（情况1/情况2/情况4）
            // 情况1：小野没上阵+凤凰没上阵+卡>6 → 02:38用{第一张卡}上下凤凰
            // 情况2：只有凤凰没有小野（凤凰没上阵，小野未携带）→ 02:26上凤凰，02:31下凤凰接精灵
            // 情况4：小野已上阵+凤凰没上阵 → 02:38用小野上下凤凰（切回小野接精灵）
            const needFengHuangOnlySwitch = fengHuangNotInBattle && !xiaoYeCarried;  // 情况2：只有凤凰没有小野
            const needFengHuangSwitch = fengHuangNotInBattle && (needXiaoYeSwitch || xiaoYeDeployed || needFengHuangOnlySwitch);
            if (needFengHuangSwitch) {
                if (needXiaoYeSwitch) {
                    // 情况1：小野是切换进来的，02:31已下小野并接了精灵，02:38再切凤凰也接精灵
                    output += `02:38,下${firstCardName},上凤凰4级,时钟秒0.5,下凤凰,上${firstCardName}满${jlStr},\n`;
                } else if (xiaoYeDeployed) {
                    // 情况4：小野本来在阵容，02:38用小野上下凤凰，最后切回小野接精灵
                    output += `02:38,下小野,上凤凰4级,时钟秒0.5,下凤凰,上小野满${jlStr},\n`;
                } else if (needFengHuangOnlySwitch) {
                    // 情况2：只有凤凰没有小野，02:26上凤凰扛02:30 boss，02:31下凤凰接精灵
                    output += `02:26,下${firstCardName},上凤凰4级,\n`;
                    output += `02:31,下凤凰,上${firstCardName}满${jlStr},\n`;
                }
            }

            const hasAnySwitch = needXiaoYeSwitch || needFengHuangSwitch || needFengHuangToXiaoYe || needFengHuangOnlySwitch;
            // 切卡提示：有凤凰/小野需要切卡时统一提示（仅隐藏榜）
            const needXiaoYeAlert = needXiaoYeSwitch;
            const needFengHuangAlert = needFengHuangSwitch;
            const needFengHuangToXiaoYeAlert = needFengHuangToXiaoYe;
            const needFengHuangOnlyAlert = needFengHuangOnlySwitch;
            if (needFengHuangAlert || needXiaoYeAlert || needFengHuangToXiaoYeAlert || needFengHuangOnlyAlert) {
                setTimeout(() => {
                    alert('⚠️ 检查到有凤凰或小野，可能要切卡\n\n请注意：\n1. 请根据实际情况修改需要上下的卡\n2. 请根据自身情况修改上下卡时间\n3. 不需要上下卡的请自行删除即可');
                }, 100);
            }
            } // 结束 if (!includeChengShang) 隐藏榜切卡逻辑块

            // 如果有冰精灵，添加额外输出（空一行）
            if (hasBingJingLing) {
                output += '\n田伯光最大吃酒数，1\n田伯光扔壶前，每1秒共1次冰精灵\n田伯光酒壶，每2秒共3次冰精灵\n田伯光药壶，停球';
            }

            // 最大承伤次数（活动脚本包含，隐藏榜脚本不包含）
            if (includeChengShang) {
                output += '\n最大承伤次数，4\n';
            }

            // 计算总减伤（只算实际上阵的卡：6张非工程+工程卡）
            loadDamageReductionData();
            const actualBattleCards = [...arrangedCards, ...gongChengCards];
            window._autoGenBattleCards = actualBattleCards;
            const totalDamageReduction = calculateDamageReductionForCards(actualBattleCards, 'my', window._autoGenDrTable || '我的');

            // 显示结果
            const overLimitHtml = overLimitCards.length > 0 ? `<div style="color:#ff5722;font-size:0.85rem;margin-bottom:8px;">⚠️ 超出10张上限，已忽略：${overLimitCards.join('、')}</div>` : '';
            resultEl.innerHTML = `
                <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;margin-top:5px;">
                    <div style="color:#4caf50;font-weight:bold;margin-bottom:8px;">✅ ${includeChengShang ? '活动' : '隐藏榜'}脚本输出：</div>
                    ${overLimitHtml}
                    <div style="background:rgba(78,205,196,0.1);border:1px solid rgba(78,205,196,0.3);border-radius:6px;padding:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:#4ecdc4;font-size:0.85rem;">🛡️ 总减伤：<strong id="autoGenDrValue" style="color:#fff;font-size:1rem;">${totalDamageReduction}</strong></span>
                        <select id="autoGenDrTable" onchange="recomputeAutoGenDr()" style="background:rgba(30,30,60,0.95);border:1px solid rgba(78,205,196,0.4);color:#fff;padding:4px 8px;border-radius:6px;font-size:0.8rem;">${drTableSelectOptions(window._autoGenDrTable || '我的')}</select>
                        <span style="color:rgba(255,255,255,0.5);font-size:0.75rem;">主界面「🛡️ 减伤」按钮设置每张卡的减伤洗炼值 · 支持多张减伤表，我的/队友可分开</span>
                    </div>
                    <textarea id="activityScriptTextarea" oninput="window._activityScriptOutput=this.value" style="width:100%;min-height:350px;color:#fff;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;font-family:monospace;font-size:0.85rem;white-space:pre-wrap;word-break:break-all;resize:vertical;">${output.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        <button onclick="copyActivityScriptOutput()" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">📋 复制脚本</button>
                        <button onclick="showSaveScriptDialog('activity')" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">💾 保存到项目</button>
                        <button onclick="saveActivityScriptToMa()" style="background:linear-gradient(135deg,#e65100,#bf360c);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;" title="保存到老马的活动脚本目录">💾 保存到老马</button>
                        <button onclick="shareScriptToWall('activity')" style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">📢 分享到需求墙</button>
                        <button onclick="openLocalFilePublisher()" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;" title="从老马目录选择脚本文件发布到需求墙">📂 选择本地文件</button>
                    </div>
                </div>
            `;

            // 保存输出到全局变量供复制使用
            window._activityScriptOutput = output;
        }

        // 复制活动脚本输出
        function copyActivityScriptOutput() {
            if (!window._activityScriptOutput) return;
            navigator.clipboard.writeText(window._activityScriptOutput).then(() => {
                const resultEl = document.getElementById('parserResult');
                resultEl.innerHTML += '<br><span style="color:#4caf50;">✅ 已复制到剪贴板！</span>';
            }).catch(err => {
                console.error('复制失败:', err);
            });
        }

        // 保存活动脚本到老马目录
        async function saveActivityScriptToMa() {
            const content = window._activityScriptOutput || document.getElementById('activityScriptTextarea')?.value;
            if (!content) { alert('没有可保存的脚本内容'); return; }
            if (!window.saveScriptToMaDir) { alert('此功能仅在桌面应用中可用\n\n需要先配置老马目录（左上角"APP本地设置"）'); return; }
            const defaultName = '活动脚本_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.txt';
            const fileName = await askTextInputAsync({ title: '保存到老马', label: '脚本文件名（含扩展名）：', defaultValue: defaultName });
            if (!fileName) return;
            await window.saveScriptToMaDir('activity', fileName, content);
        }

        // 保存副本脚本到老马目录
        async function saveDungeonScriptToMa() {
            const content = window._dungeonScriptOutput || document.getElementById('dungeonScriptTextarea')?.value;
            if (!content) { alert('没有可保存的脚本内容'); return; }
            if (!window.saveScriptToMaDir) { alert('此功能仅在桌面应用中可用\n\n需要先配置老马目录（左上角"APP本地设置"）'); return; }
            const defaultName = '深海脚本_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.txt';
            const fileName = await askTextInputAsync({ title: '保存到老马', label: '脚本文件名（含扩展名）：', defaultValue: defaultName });
            if (!fileName) return;
            await window.saveScriptToMaDir('coop', fileName, content);
        }

        // 深海脚本生成功能
        function parseDungeonScript() {
            const input = document.getElementById('parserInput').value.trim();
            const resultEl = document.getElementById('parserResult');
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('深海脚本生成');

            if (!input) {
                resultEl.innerHTML = '<span style="color:#f44336;">请输入文本！</span>';
                return;
            }

            const lines = input.split('\n').map(line => line.trim()).filter(line => line);
            let heroNames = [];
            let zhenZhanLine = '';
            let otherLines = []; // 魔化、皮肤、主战车、副战车等行
            let moHuaCards = []; // 魔化的卡牌列表

            lines.forEach((line, index) => {
                if (line.match(/^上阵[：:]/)) {
                    zhenZhanLine = line;
                    const match = line.match(/上阵[：:]\s*(.+)/);
                    if (match && match[1]) {
                        heroNames = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
                    }
                } else if (line.match(/^魔化[：:]/)) {
                    otherLines.push(line);
                    // 提取魔化的卡牌名称
                    const match = line.match(/魔化[：:]\s*(.+)/);
                    if (match && match[1]) {
                        moHuaCards = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
                    }
                } else if (line.match(/^(皮肤|主战车|副战车)[：:]/)) {
                    otherLines.push(line);
                } else if (index === 0 && !line.match(/^(魔化|皮肤|主战车|副战车)[：:]/)) {
                    // 没有"上阵："前缀时，直接解析第一行作为卡牌列表
                    heroNames = line.split(/[,，]/).map(name => name.trim()).filter(name => name);
                }
            });

            // 没有"上阵："时，自动补上
            if (heroNames.length > 0 && !zhenZhanLine) {
                zhenZhanLine = '上阵：' + heroNames.join(',');
            }

            if (heroNames.length === 0) {
                resultEl.innerHTML = '<span style="color:#f44336;">未找到英雄名称！</span>';
                return;
            }

            // 过滤融合卡（融合卡不能用于脚本，需拆分为单卡）
            const fusionNames = [
                '火炮射线', '射线潜艇', '火炮潜艇', '宝库射线', '宝库潜艇', '宝库火炮',
                '潜艇射线', '潜艇火炮', '射线火炮',
                '水灵刀客', '刀客水灵', '蛇女爱神', '爱神蛇女',
                '咕咕天使', '天使咕咕', '圣骑天使', '天使圣骑',
                '战将鱼人', '鱼人战将', '电法冰法', '冰法电法',
                '萌萌水灵', '水灵萌萌', '火灵风灵', '风灵火灵'
            ];
            const allSkinKeys = Object.keys(SKIN_ATTRIBUTES);
            const filteredFusion = [];
            heroNames = heroNames.filter(name => {
                const isFusion = fusionNames.includes(name) ||
                    (name.length >= 4 && name.length % 2 === 0 &&
                     !allSkinKeys.includes(name) &&
                     allSkinKeys.includes(name.substring(0, 2)) &&
                     allSkinKeys.includes(name.substring(2)));
                if (isFusion) {
                    filteredFusion.push(name);
                    return false;
                }
                return true;
            });

            if (heroNames.length === 0 && filteredFusion.length > 0) {
                resultEl.innerHTML = '<span style="color:#9c27b0;">🚫 输入的均为融合卡，已过滤。融合卡需拆分为单卡后重新输入。</span>';
                return;
            }

            // 超出10张上限提示
            let overLimitCards = [];
            if (heroNames.length > 10) {
                overLimitCards = heroNames.slice(10);
                heroNames = heroNames.slice(0, 10);
            }

            // 卡牌分类
            const jingLingNames = ['冰精灵', '光精灵', '魔精灵', '木精灵', '土精灵', '雷精灵', '暗精灵', '幻精灵', '魂精灵', '彩精灵'];
            const gongChengNames = ['火炮', '咬人娃娃', '潜艇', '射线', '宝库'];

            const hasSheNv = heroNames.some(name => name.includes('蛇女'));
            const hasHuoLing = heroNames.some(name => name.includes('火灵'));
            const hasTianShi = heroNames.some(name => name.includes('天使'));
            const hasFengLing = heroNames.some(name => name.includes('风灵'));
            const hasHuGong = heroNames.some(name => name.includes('虎弓'));
            const hasGuangJingLing = heroNames.some(name => name.includes('光精灵'));
            const hasMoJingLing = heroNames.some(name => name.includes('魔精灵'));
            const hasLeiJingLing = heroNames.some(name => name.includes('雷精灵'));
            const hasMuJingLing = heroNames.some(name => name.includes('木精灵'));
            const hasHunJingLing = heroNames.some(name => name.includes('魂精灵'));
            const hasHuanJingLing = heroNames.some(name => name.includes('幻精灵'));

            const hasSheXian = heroNames.some(name => name.includes('射线'));
            const hasBaoKu = heroNames.some(name => name.includes('宝库'));
            const hasGongCheng = heroNames.some(name => gongChengNames.some(gc => name.includes(gc))) || hasSheXian || hasBaoKu;

            // 过滤精灵和射线/宝库
            const filteredCards = heroNames.filter(name => {
                if (jingLingNames.some(jl => name.includes(jl))) return false;
                return true;
            });

            // 分离卡牌类型
            const gongChengCards = filteredCards.filter(name =>
                gongChengNames.some(gc => name.includes(gc)) || name.includes('射线') || name.includes('宝库')
            );
            const sheNvCards = filteredCards.filter(name => name.includes('蛇女'));

            // 循环卡：火灵、虎弓、天使（19下49上，逢9上逢0下）
            const cycleCardNames = [];
            if (hasHuoLing) cycleCardNames.push('火灵');
            if (hasHuGong) cycleCardNames.push('虎弓');
            if (hasTianShi) cycleCardNames.push('天使');
            const hasCycle = cycleCardNames.length > 0;

            // 蛇女加速优先级（第4、第5位）
            const sheNvPriority = ['火灵', '虎弓', '风灵', '后羿', '小野', '天使', '水灵'];
            const priorityCards = sheNvPriority.filter(p =>
                filteredCards.some(name => name.includes(p))
            ).map(p => filteredCards.find(name => name.includes(p)));

            // 构建上卡顺序
            // 工程卡不占6个位置，放在最上面，不参与强制顺序
            // 剩余6卡：有蛇女时，第4-5位放优先级最高的2张，第6位蛇女，前3位放其余卡
            let arrangedCards = [];
            let gongChengOrder = []; // 工程卡单独排
            
            if (hasSheNv) {
                // 有蛇女：第4-5位放优先级最高的2张，第6位蛇女，前3位放剩余卡
                const top2 = priorityCards.slice(0, 2); // 优先级最高的2张放第4-5位
                const restPriority = priorityCards.slice(2); // 剩余优先级卡
                // 前三位：剩余优先级卡 + 非优先级非工程非蛇女的卡
                const nonPriorityNonGongCheng = filteredCards.filter(name =>
                    !priorityCards.some(p => p === name) && !name.includes('蛇女') &&
                    !gongChengNames.some(gc => name.includes(gc)) && !name.includes('射线') && !name.includes('宝库')
                );
                const first3 = [...restPriority, ...nonPriorityNonGongCheng].slice(0, 3);
                
                arrangedCards.push(...first3);    // 前3位
                arrangedCards.push(...top2);       // 第4-5位：优先级最高2张
                arrangedCards.push(...sheNvCards); // 第6位：蛇女
            } else {
                // 无蛇女：工程卡单独放 gongChengOrder（最上面），非工程卡正常排
                const otherCards = filteredCards.filter(name =>
                    !gongChengNames.some(gc => name.includes(gc)) &&
                    !name.includes('射线') && !name.includes('宝库') &&
                    !name.includes('蛇女')
                );
                arrangedCards.push(...otherCards);
                // 注意：风灵/火灵/虎弓/天使/蛇女 已包含在 otherCards 中，切勿重复 push，否则重复占位置导致少上一张卡
            }

            // 有蛇女时，工程卡单独放最前面，不参与强制顺序
            if (hasSheNv) {
                gongChengOrder = [...gongChengCards];
                // arrangedCards 只保留非工程卡（6张）
                arrangedCards = arrangedCards.filter(name =>
                    !gongChengNames.some(gc => name.includes(gc)) && !name.includes('射线') && !name.includes('宝库')
                );
                arrangedCards = arrangedCards.slice(0, 6);
            } else {
                // 无蛇女：工程卡单独算（gongChengOrder），非工程卡固定取前6张；
                // 有工程卡时总上卡数 = 6张非工程 + 1张工程 = 7张，无工程卡时 = 6张
                gongChengOrder = [...gongChengCards];
                arrangedCards = arrangedCards.filter(name =>
                    !gongChengNames.some(gc => name.includes(gc)) && !name.includes('射线') && !name.includes('宝库') && !name.includes('蛇女')
                ).slice(0, 6);
            }

            // 构建输出
            let output = '';

            // 头部信息
            if (zhenZhanLine) output += zhenZhanLine + '\n';
            // 保留用户输入的皮肤、魔化、主战车、副战车行，没有则输出默认空行
            const defaultLines = ['皮肤：', '魔化：', '主战车：', '副战车：'];
            defaultLines.forEach(defaultLine => {
                const foundLine = otherLines.find(line => line.startsWith(defaultLine.replace('：', '')));
                if (foundLine) {
                    output += foundLine + '\n';
                } else {
                    output += defaultLine + '\n';
                }
            });
            output += '\n';

            // 第1行 (时间1)
            let line1Parts = [];
            if (hasSheNv) line1Parts.push('强制顺序上卡');

            // 光葫芦（第1行）
            if (hasGuangJingLing) {
                // 火炮光葫芦
                if (gongChengCards.some(name => name.includes('火炮'))) {
                    line1Parts.push('光葫芦火炮');
                }
                // 风灵光葫芦（第一波特殊）
                if (hasFengLing) {
                    line1Parts.push('光葫芦风灵');
                }
                // 循环卡光葫芦（火灵、虎弓、天使）
                cycleCardNames.forEach(card => {
                    line1Parts.push('光葫芦' + card);
                });
            }

            // 上卡列表：工程卡先上（满），然后非工程卡按顺序
            if (hasSheNv) {
                // 工程卡先上，满，不参与强制顺序
                gongChengOrder.forEach(name => {
                    line1Parts.push('上' + name + '满');
                });
                // 非工程卡按强制顺序上，不满
                arrangedCards.forEach(name => {
                    line1Parts.push('上' + name);
                });
            } else {
                // 没有蛇女：工程卡先上（满），然后非工程卡全部满
                gongChengOrder.forEach(name => {
                    line1Parts.push('上' + name + '满');
                });
                arrangedCards.forEach(name => {
                    line1Parts.push('上' + name + '满');
                });
            }
            output += '1,' + line1Parts.join(',') + ',\n';

            // 第2行 (时间11) - 有蛇女时全满
            if (hasSheNv) {
                let line2Parts = [];
                gongChengOrder.forEach(name => {
                    line2Parts.push('上' + name + '满');
                });
                arrangedCards.forEach(name => {
                    line2Parts.push('上' + name + '满');
                });
                output += '11,' + line2Parts.join(',') + ',\n';
            }

            // 有幻精灵时，16波换龙心
            if (hasHuanJingLing) {
                output += '16,换龙心,\n';
            }

            // 第3行 (时间19) - 下循环卡（火灵、虎弓、天使）
            let line19Parts = [];
            cycleCardNames.forEach(card => {
                line19Parts.push('下' + card);
            });
            if (line19Parts.length > 0) {
                output += '19,' + line19Parts.join(',') + ',\n';
            }

            // 49波之后的循环
            const guangHuLuTargets = [];
            if (hasGuangJingLing) {
                cycleCardNames.forEach(card => {
                    guangHuLuTargets.push(card);
                });
            }

            const hasJingLingOps = hasLeiJingLing || hasMoJingLing || hasMuJingLing || hasHunJingLing;

            if (hasCycle || hasJingLingOps) {
                for (let wave = 49; wave <= 129; wave += 10) {
                    let upParts = [];

                    // 光葫芦 + 上循环卡
                    if (hasCycle) {
                        guangHuLuTargets.forEach(target => {
                            upParts.push('光葫芦' + target);
                        });
                    }
                    cycleCardNames.forEach(card => {
                        upParts.push('上' + card + '满');
                    });

                    // 精灵操作：逢9就打（>=49波）
                    if (hasLeiJingLing) upParts.push('每4秒共100次雷精灵');
                    if (hasMoJingLing) upParts.push('每4秒共100次魔精灵');
                    if (hasMuJingLing) upParts.push('每4秒共100次木精灵');
                    if (hasHunJingLing) upParts.push('每2秒共100次魂精灵');

                    if (upParts.length > 0) {
                        output += wave + ',' + upParts.join(',') + ',\n';
                    }

                    // 逢0停球 + 下循环卡
                    if (wave < 129) {
                        let stopParts = ['停球'];
                        if (hasCycle) {
                            cycleCardNames.forEach(card => {
                                stopParts.push('下' + card);
                            });
                        }
                        if (hasJingLingOps || hasCycle) {
                            output += (wave + 1) + ',' + stopParts.join(',') + ',\n';
                        }
                    }
                }
                // 130波停球
                if (hasJingLingOps) {
                    output += '130,停球,\n';
                }
            }

            // 计算总减伤（只算实际上阵的卡）
            loadDamageReductionData();
            let dungeonBattleCards = [];
            if (hasSheNv) {
                dungeonBattleCards = [...gongChengOrder, ...arrangedCards];
            } else {
                dungeonBattleCards = [...arrangedCards];
            }
            const totalDamageReduction = calculateDamageReductionForCards(dungeonBattleCards);

            // 显示结果
            const overLimitHtml2 = overLimitCards.length > 0 ? '<div style="color:#ff5722;font-size:0.85rem;margin-bottom:8px;">⚠️ 超出10张上限，已忽略：' + overLimitCards.join('、') + '</div>' : '';
            resultEl.innerHTML = '<div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;margin-top:5px;">' +
                '<div style="color:#ff9800;font-weight:bold;margin-bottom:8px;">✅ 深海脚本输出：</div>' +
                overLimitHtml2 +
                '<div style="background:rgba(78,205,196,0.1);border:1px solid rgba(78,205,196,0.3);border-radius:6px;padding:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="color:#4ecdc4;font-size:0.85rem;">🛡️ 总减伤：<strong id="dungeonDrValue" style="color:#fff;font-size:1rem;">' + totalDamageReduction + '</strong></span>' +
                '<select id="dungeonDrTable" onchange="recomputeDungeonDr()" style="background:rgba(30,30,60,0.95);border:1px solid rgba(78,205,196,0.4);color:#fff;padding:4px 8px;border-radius:6px;font-size:0.8rem;">' + drTableSelectOptions(window._dungeonDrTable || '我的') + '</select>' +
                '<span style="color:rgba(255,255,255,0.5);font-size:0.75rem;">主界面「🛡️ 减伤」按钮设置每张卡的减伤洗炼值 · 支持多张减伤表，我的/队友可分开</span>' +
                '</div>' +
                '<textarea id="dungeonScriptTextarea" oninput="window._dungeonScriptOutput=this.value" style="width:100%;min-height:350px;color:#fff;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;font-family:monospace;font-size:0.85rem;white-space:pre-wrap;word-break:break-all;resize:vertical;">' + output.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea>' +
                '<div style="display:flex;gap:8px;margin-top:10px;">' +
                '<button onclick="copyDungeonScriptOutput()" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">📋 复制脚本</button>' +
                '<button onclick="showSaveScriptDialog(\'dungeon\')" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">💾 保存到项目</button>' +
                '<button onclick="saveDungeonScriptToMa()" style="background:linear-gradient(135deg,#e65100,#bf360c);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;" title="保存到老马的合作脚本目录">💾 保存到老马</button>' +
                '<button onclick="shareScriptToWall(\'dungeon\')" style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">📢 分享到需求墙</button>' +
                '<button onclick="openLocalFilePublisher()" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;" title="从老马目录选择脚本文件发布到需求墙">📂 选择本地文件</button>' +
                '</div></div>';

            window._dungeonScriptOutput = output;
        }

        // 复制副本脚本输出
        function copyDungeonScriptOutput() {
            if (!window._dungeonScriptOutput) return;
            navigator.clipboard.writeText(window._dungeonScriptOutput).then(() => {
                const resultEl = document.getElementById('parserResult');
                resultEl.innerHTML += '<br><span style="color:#ff9800;">✅ 已复制到剪贴板！</span>';
            }).catch(err => {
                console.error('复制失败:', err);
            });
        }

        // ===== 分享选项（时长 + 密码） =====

        // ===== 分享加密（方案A：PBKDF2 + AES-GCM） =====
        // 防暴力/字典破解靠：①KDF 故意算很慢（迭代次数高，每试一个密码都要跑很多轮哈希）
        // ②随机 salt（存在密文里，salt 不需保密，仅用于防止预存彩虹表）
        // 说明：不靠"加时间/日期"——时间若保密则合法方也解不开，若公开则攻击者也能用，毫无净收益。
        const _ENC_FIXED_SALT = 'tfjl-share-v2-salt'; // 应用级固定 salt（公开无妨），仅用于密码哈希校验
        const _PBKDF2_ITER = 200000;                  // 迭代次数：让单次猜测成本≈数十毫秒，拖慢字典攻击
        const _ENC_PREFIX = 'tfjlA1$';                // 新格式标记，用于与旧 XOR 密文区分（兼容历史分享）

        function _abToB64(buf) {
            const bytes = new Uint8Array(buf);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        }
        function _b64ToAb(b64) {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes.buffer;
        }

        // 旧 XOR 实现（仅作兼容回退，不再用于新分享）
        function _legacyEncrypt(content, password) {
            const key = password;
            let encrypted = '';
            for (let i = 0; i < content.length; i++) {
                encrypted += String.fromCharCode(content.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return btoa(unescape(encodeURIComponent(encrypted)));
        }
        function _legacyDecrypt(encryptedBase64, password) {
            try {
                const key = password;
                const encrypted = decodeURIComponent(escape(atob(encryptedBase64)));
                let decrypted = '';
                for (let i = 0; i < encrypted.length; i++) {
                    decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                }
                return decrypted;
            } catch (e) {
                return null;
            }
        }

        // 密码哈希（v2：PBKDF2-SHA256 慢哈希，抵抗对公开哈希的离线暴破）
        // 返回 'v2$<base64>'
        async function hashPassword(password) {
            try {
                if (window.crypto && window.crypto.subtle) {
                    const enc = new TextEncoder();
                    const salt = enc.encode(_ENC_FIXED_SALT);
                    const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
                    const bits = await crypto.subtle.deriveBits(
                        { name: 'PBKDF2', salt: salt, iterations: _PBKDF2_ITER, hash: 'SHA-256' }, km, 256);
                    return 'v2$' + _abToB64(bits);
                }
            } catch (e) { /* 降级 */ }
            let h1 = 0x811c9dc5, h2 = 0x1000193;
            for (let i = 0; i < password.length; i++) {
                const c = password.charCodeAt(i);
                h1 = (h1 ^ c) * 0x01000193;
                h2 = (h2 + c * 16777619) >>> 0;
            }
            return 'fnv' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
        }

        // 验证密码：兼容旧 SHA-256/fnv 哈希 与 新 v2 PBKDF2 哈希（旧分享仍可解密）
        async function verifyPassword(input, storedHash) {
            if (!storedHash) return false;
            if (storedHash.indexOf('v2$') === 0) {
                return (await hashPassword(input)) === storedHash;
            }
            // 旧版哈希
            try {
                if (window.crypto && window.crypto.subtle) {
                    const data = new TextEncoder().encode(input);
                    const hash = await crypto.subtle.digest('SHA-256', data);
                    if (btoa(String.fromCharCode(...new Uint8Array(hash))) === storedHash) return true;
                }
            } catch (e) {}
            let h1 = 0x811c9dc5, h2 = 0x1000193;
            for (let i = 0; i < input.length; i++) {
                const c = input.charCodeAt(i);
                h1 = (h1 ^ c) * 0x01000193;
                h2 = (h2 + c * 16777619) >>> 0;
            }
            return ('fnv' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)) === storedHash;
        }

        // 加密（方案A：PBKDF2 派生密钥 + AES-GCM，密文 = tfjlA1$ + base64(salt|iv|ct)）
        async function encryptContent(content, password) {
            try {
                if (window.crypto && window.crypto.subtle) {
                    const enc = new TextEncoder();
                    const salt = crypto.getRandomValues(new Uint8Array(16));
                    const iv = crypto.getRandomValues(new Uint8Array(12));
                    const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
                    const key = await crypto.subtle.deriveKey(
                        { name: 'PBKDF2', salt: salt, iterations: _PBKDF2_ITER, hash: 'SHA-256' },
                        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
                    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(content));
                    const blob = new Uint8Array(16 + 12 + ct.byteLength);
                    blob.set(salt, 0); blob.set(iv, 16); blob.set(new Uint8Array(ct), 28);
                    return _ENC_PREFIX + _abToB64(blob.buffer);
                }
            } catch (e) { /* 降级到旧 XOR */ }
            return _legacyEncrypt(content, password);
        }

        // ====================== 方案B：密码 + 恢复密钥（双密钥包裹） ======================
        // 生成一串用户可保存的恢复密钥（高熵随机串，base64url 编码，约 43 字符）
        function generateRecoveryKey() {
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            return _abToB64(bytes.buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        // 把恢复密钥字符串转成可加解密的 AES-GCM CryptoKey（raw 32 字节）
        async function recoveryKeyToCryptoKey(rk) {
            let b64 = (rk || '').trim().replace(/-/g, '+').replace(/_/g, '/');
            if (b64.length % 4) b64 += '='.repeat(4 - (b64.length % 4));
            const bytes = new Uint8Array(_b64ToAb(b64));
            return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        }
        // 用「密码 + 恢复密钥」双重加密：随机 dataKey 加密内容；dataKey 分别用密码密钥与恢复密钥包裹
        async function encryptContentB(content, password, recoveryKey) {
            const enc = new TextEncoder();
            const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32));
            const dataKey = await crypto.subtle.importKey('raw', dataKeyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
            const ivCt = crypto.getRandomValues(new Uint8Array(12));
            const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivCt }, dataKey, enc.encode(content)));
            // 用密码包裹 dataKey
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const km = await crypto.subtle.importKey('raw', enc.encode(password || ''), 'PBKDF2', false, ['deriveKey']);
            const pwKey = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: _PBKDF2_ITER, hash: 'SHA-256' },
                km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
            const ivPw = crypto.getRandomValues(new Uint8Array(12));
            const wPw = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivPw }, pwKey, dataKeyBytes));
            // 用恢复密钥包裹 dataKey
            const rkKey = await recoveryKeyToCryptoKey(recoveryKey);
            const ivRk = crypto.getRandomValues(new Uint8Array(12));
            const wRk = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivRk }, rkKey, dataKeyBytes));
            // 组装：salt(16) | ivCt(12) | ct | ivPw(12) | wPw(60) | ivRk(12) | wRk(60)
            const blob = new Uint8Array(16 + 12 + ct.length + 12 + wPw.length + 12 + wRk.length);
            let o = 0;
            blob.set(salt, o); o += 16; blob.set(ivCt, o); o += 12; blob.set(ct, o); o += ct.length;
            blob.set(ivPw, o); o += 12; blob.set(wPw, o); o += wPw.length; blob.set(ivRk, o); o += 12; blob.set(wRk, o);
            return 'tfjlB1$' + _abToB64(blob.buffer);
        }

        // 解密：优先新格式；方案B 支持密码或恢复密钥任一解锁；方案A 仅密码；否则回退旧 XOR
        async function decryptContent(encryptedBase64, secret) {
            // 方案B：密码或恢复密钥二选一
            if (encryptedBase64 && encryptedBase64.indexOf('tfjlB1$') === 0) {
                try {
                    const bin = new Uint8Array(_b64ToAb(encryptedBase64.slice('tfjlB1$'.length)));
                    const total = bin.byteLength;
                    const salt = bin.slice(0, 16);
                    const ivCt = bin.slice(16, 28);
                    const wRk = bin.slice(total - 48, total);
                    const ivRk = bin.slice(total - 60, total - 48);
                    const wPw = bin.slice(total - 108, total - 60);
                    const ivPw = bin.slice(total - 120, total - 108);
                    const ct = bin.slice(28, total - 120);
                    const importDK = async (kb) => crypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['decrypt']);
                    // 先试密码
                    try {
                        const enc = new TextEncoder();
                        const km = await crypto.subtle.importKey('raw', enc.encode(secret || ''), 'PBKDF2', false, ['deriveKey']);
                        const pwKey = await crypto.subtle.deriveKey(
                            { name: 'PBKDF2', salt: salt, iterations: _PBKDF2_ITER, hash: 'SHA-256' },
                            km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
                        const dk1 = await importDK(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivPw }, pwKey, wPw)));
                        return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivCt }, dk1, ct));
                    } catch (e) { /* 密码不对，试恢复密钥 */ }
                    // 再试恢复密钥
                    try {
                        const rkKey = await recoveryKeyToCryptoKey(secret || '');
                        const dk2 = await importDK(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivRk }, rkKey, wRk)));
                        return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivCt }, dk2, ct));
                    } catch (e) { return null; }
                } catch (e) { return null; }
            }
            // 方案A：仅密码（现代格式，密钥错误返回 null，不再回退旧版避免误判）
            if (encryptedBase64 && encryptedBase64.indexOf(_ENC_PREFIX) === 0 && window.crypto && window.crypto.subtle) {
                try {
                    const blob = new Uint8Array(_b64ToAb(encryptedBase64.slice(_ENC_PREFIX.length)));
                    const salt = blob.slice(0, 16), iv = blob.slice(16, 28), ct = blob.slice(28);
                    const enc = new TextEncoder();
                    const km = await crypto.subtle.importKey('raw', enc.encode(secret || ''), 'PBKDF2', false, ['deriveKey']);
                    const key = await crypto.subtle.deriveKey(
                        { name: 'PBKDF2', salt: salt, iterations: _PBKDF2_ITER, hash: 'SHA-256' },
                        km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
                    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct));
                } catch (e) { return null; }
            }
            // 旧版（无前缀）兼容
            return _legacyDecrypt(encryptedBase64, secret);
        }

        // 分享成功后的密码提醒弹窗（让用户记住/复制密码，转发给接收者）
        function showPasswordReminder(fileName, password, header, recoveryKey) {
            const existing = document.getElementById('passwordReminderModal');
            if (existing) existing.remove();

            const rkHtml = recoveryKey
                ? `<div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin:6px 0 8px;line-height:1.5;">
                       同时已生成 <b style="color:#4fc3f7;">恢复密钥</b>（备用钥匙）：忘记密码时，凭它也能解锁。请<b style="color:#fff;">单独保存</b>：
                   </div>
                   <div style="background:rgba(79,195,247,0.08);border:1px solid rgba(79,195,247,0.35);border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                       <input type="text" id="recoveryReminderValue" value="${recoveryKey.replace(/"/g, '&quot;')}" readonly style="flex:1;background:transparent;border:none;color:#aee;font-size:0.85rem;font-family:monospace;outline:none;">
                       <button id="recoveryReminderCopyBtn" style="background:linear-gradient(135deg,#4fc3f7,#29b6f6);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:bold;">📋 复制</button>
                   </div>`
                : '';

            const modal = document.createElement('div');
            modal.id = 'passwordReminderModal';
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100001;`;
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(206,147,216,0.5);border-radius:16px;padding:24px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    <div style="color:#ce93d8;font-size:1.1rem;font-weight:bold;margin-bottom:14px;">🔐 ${header || '已加密分享'}</div>
                    <div style="color:rgba(255,255,255,0.7);font-size:0.85rem;margin-bottom:14px;line-height:1.5;">
                        文件 <b style="color:#fff;">${fileName}</b> 已加密分享。<br>查看者需要输入以下密码（或恢复密钥）才能查看：
                    </div>
                    <div style="background:rgba(0,0,0,0.4);border:1px solid rgba(206,147,216,0.3);border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <input type="text" id="passwordReminderValue" value="${password.replace(/"/g, '&quot;')}" readonly style="flex:1;background:transparent;border:none;color:#ffd700;font-size:1rem;font-family:monospace;outline:none;letter-spacing:1px;">
                        <button id="passwordReminderCopyBtn" style="background:linear-gradient(135deg,#4fc3f7,#29b6f6);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:bold;">📋 复制</button>
                    </div>
                    ${rkHtml}
                    <div style="color:rgba(255,255,255,0.5);font-size:0.72rem;line-height:1.4;margin-bottom:16px;">
                        💡 提示：把密码/密钥通过其他渠道（微信、QQ 等）单独发给接收者。<br>
                        ⚠️ URL 本身是公开的（任何拿到链接的人都能下载加密文件），但没密码/密钥无法解密查看。
                    </div>
                    <button id="passwordReminderCloseBtn" style="width:100%;background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:10px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:bold;">我已记住</button>
                </div>`;
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            const valueInput = modal.querySelector('#passwordReminderValue');
            const copyBtn = modal.querySelector('#passwordReminderCopyBtn');
            const closeBtn = modal.querySelector('#passwordReminderCloseBtn');
            copyBtn.onclick = function() {
                valueInput.select();
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(password).then(function() {
                            copyBtn.textContent = '✅ 已复制';
                            setTimeout(function() { copyBtn.textContent = '📋 复制'; }, 1500);
                        });
                    } else {
                        document.execCommand('copy');
                        copyBtn.textContent = '✅ 已复制';
                        setTimeout(function() { copyBtn.textContent = '📋 复制'; }, 1500);
                    }
                } catch (e) {
                    alert('请手动复制密码');
                }
            };
            if (recoveryKey) {
                const rkInput = modal.querySelector('#recoveryReminderValue');
                const rkBtn = modal.querySelector('#recoveryReminderCopyBtn');
                rkBtn.onclick = function() {
                    rkInput.select();
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(recoveryKey).then(function() {
                                rkBtn.textContent = '✅ 已复制';
                                setTimeout(function() { rkBtn.textContent = '📋 复制'; }, 1500);
                            });
                        } else {
                            document.execCommand('copy');
                            rkBtn.textContent = '✅ 已复制';
                            setTimeout(function() { rkBtn.textContent = '📋 复制'; }, 1500);
                        }
                    } catch (e) { alert('请手动复制恢复密钥'); }
                };
                rkInput.onclick = function() { rkInput.select(); };
            }
            closeBtn.onclick = function() { modal.remove(); };
            valueInput.onclick = function() { valueInput.select(); };
            document.body.appendChild(modal);
            setTimeout(function() { valueInput.select(); }, 100);
        }

        // 格式化时长显示（分钟 → 可读文本）
        function formatDuration(minutes) {
            if (!minutes || minutes <= 0) return '永久';
            if (minutes < 60) return minutes + '分钟';
            if (minutes < 1440) return Math.floor(minutes / 60) + '小时';
            return Math.floor(minutes / 1440) + '天';
        }

        // 分享选项弹窗（时长 + 密码，所有分享入口统一调用）
        // callback(expireMinutes, password): expireMinutes 0=永久, null=用户取消; password ''=无密码
        function showShareOptionsDialog(callback) {
            const existing = document.getElementById('shareOptionsModal');
            if (existing) existing.remove();

            let selectedScheme = 'A'; // 'A' = 仅密码, 'B' = 密码+恢复密钥
            let recoveryKey = '';

            const modal = document.createElement('div');
            modal.id = 'shareOptionsModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100001;';
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,152,0,0.5);border-radius:16px;padding:24px;max-width:460px;width:92%;max-height:92vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    <div style="color:#ff9800;font-size:1.1rem;font-weight:bold;margin-bottom:14px;">🔒 分享选项</div>

                    <div style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-bottom:6px;">加密方式</div>
                    <div style="display:flex;gap:10px;margin-bottom:12px;">
                        <div id="schemeABtn" onclick="window.__setShareScheme('A')" style="flex:1;cursor:pointer;background:rgba(255,152,0,0.18);border:2px solid #ff9800;border-radius:10px;padding:10px;text-align:center;">
                            <div style="color:#ffb74d;font-size:0.92rem;font-weight:bold;">🔒 仅密码</div>
                            <div style="color:rgba(255,255,255,0.5);font-size:0.66rem;margin-top:3px;">适合自己私密备份</div>
                        </div>
                        <div id="schemeBBtn" onclick="window.__setShareScheme('B')" style="flex:1;cursor:pointer;background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px;text-align:center;">
                            <div style="color:#fff;font-size:0.92rem;font-weight:bold;">🔑 密码+恢复密钥</div>
                            <div style="color:rgba(255,255,255,0.5);font-size:0.66rem;margin-top:3px;">团队协作用，防忘密码</div>
                        </div>
                    </div>

                    <div id="recoveryBox" style="display:none;background:rgba(79,195,247,0.08);border:1px solid rgba(79,195,247,0.35);border-radius:10px;padding:12px;margin-bottom:14px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#4fc3f7;font-size:0.8rem;font-weight:bold;">🔑 恢复密钥（请妥善保存）</span>
                            <span onclick="window.__copyRecoveryKey()" style="cursor:pointer;color:#4fc3f7;font-size:0.72rem;text-decoration:underline;">复制</span>
                        </div>
                        <input id="recoveryKeyInput" readonly style="width:100%;margin-top:8px;padding:8px;border-radius:6px;border:1px solid rgba(79,195,247,0.4);background:#0d1b2a;color:#aee;font-size:0.72rem;font-family:monospace;box-sizing:border-box;">
                        <div style="color:rgba(255,255,255,0.55);font-size:0.68rem;margin-top:8px;line-height:1.5;">
                            <b style="color:#4fc3f7;">恢复密钥是什么？</b><br>
                            它是这串分享的「<b>备用钥匙</b>」。平时用密码打开内容；万一你或队友<b>忘了密码</b>，凭这串密钥照样能解锁，不至于因忘密码而打不开。<br>
                            它和密码<b>二选一</b>即可解锁。请把它单独存到安全的地方（<b>别和密码一起发出去</b>），谁拿到密钥谁就能打开。
                        </div>
                    </div>

                    <div style="margin-bottom:14px;">
                        <label style="color:rgba(255,255,255,0.8);font-size:0.85rem;display:block;margin-bottom:6px;">🔑 查看密码（可选，留空则不加密；选了"密码+恢复密钥"时也可留空，只用密钥解锁）</label>
                        <input type="text" id="sharePassword" placeholder="设置查看密码" maxlength="50" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.4);color:white;font-size:0.85rem;outline:none;box-sizing:border-box;">
                        <div style="color:rgba(255,255,255,0.35);font-size:0.7rem;margin-top:4px;">设置密码后，查看者需输入密码（或恢复密钥）才能查看</div>
                    </div>

                    <div style="margin-bottom:16px;">
                        <label style="color:rgba(255,255,255,0.8);font-size:0.85rem;display:block;margin-bottom:6px;">⏱️ 有效期</label>
                        <select id="shareExpireMinutes" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.4);color:white;font-size:0.85rem;outline:none;cursor:pointer;">
                            <option value="0" style="background:#1a1a2e;">永久</option>
                            <option value="3" style="background:#1a1a2e;">3分钟</option>
                            <option value="10" style="background:#1a1a2e;">10分钟</option>
                            <option value="30" style="background:#1a1a2e;">30分钟</option>
                            <option value="60" style="background:#1a1a2e;">1小时</option>
                            <option value="360" style="background:#1a1a2e;">6小时</option>
                            <option value="720" style="background:#1a1a2e;">12小时</option>
                            <option value="1440" style="background:#1a1a2e;">1天</option>
                            <option value="4320" style="background:#1a1a2e;">3天</option>
                            <option value="10080" selected style="background:#1a1a2e;">7天</option>
                            <option value="21600" style="background:#1a1a2e;">15天</option>
                            <option value="43200" style="background:#1a1a2e;">30天</option>
                        </select>
                    </div>

                    <div style="display:flex;gap:10px;">
                        <button id="shareOptionsConfirmBtn" style="flex:2;background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:10px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:bold;">确认分享</button>
                        <button id="shareOptionsCancelBtn" style="flex:1;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);padding:10px;border-radius:8px;cursor:pointer;font-size:0.85rem;">取消</button>
                    </div>
                </div>`;
            modal.onclick = function(e) {
                if (e.target === modal) { modal.remove(); callback(null, '', ''); }
            };
            const confirmBtn = modal.querySelector('#shareOptionsConfirmBtn');
            const cancelBtn = modal.querySelector('#shareOptionsCancelBtn');
            const expireSelect = modal.querySelector('#shareExpireMinutes');
            const passwordInput = modal.querySelector('#sharePassword');
            window.__setShareScheme = function(scheme) {
                selectedScheme = scheme;
                const a = document.getElementById('schemeABtn');
                const b = document.getElementById('schemeBBtn');
                const box = document.getElementById('recoveryBox');
                if (scheme === 'A') {
                    a.style.background = 'rgba(255,152,0,0.18)'; a.style.borderColor = '#ff9800';
                    b.style.background = 'rgba(255,255,255,0.06)'; b.style.borderColor = 'rgba(255,255,255,0.15)';
                    box.style.display = 'none';
                } else {
                    b.style.background = 'rgba(79,195,247,0.18)'; b.style.borderColor = '#4fc3f7';
                    a.style.background = 'rgba(255,255,255,0.06)'; a.style.borderColor = 'rgba(255,255,255,0.15)';
                    box.style.display = 'block';
                    if (!recoveryKey) {
                        recoveryKey = generateRecoveryKey();
                        document.getElementById('recoveryKeyInput').value = recoveryKey;
                    }
                }
            };
            window.__copyRecoveryKey = function() {
                const v = document.getElementById('recoveryKeyInput').value;
                try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(v).then(function(){ showToast('✅ 恢复密钥已复制'); }); return; } } catch(e){}
                alert('请手动复制恢复密钥：\n' + v);
            };
            confirmBtn.onclick = function() {
                const expireMinutes = parseInt(expireSelect.value) || 0;
                const password = passwordInput.value.trim();
                const rk = (selectedScheme === 'B') ? (document.getElementById('recoveryKeyInput').value || recoveryKey) : '';
                modal.remove();
                callback(expireMinutes, password, rk);
            };
            cancelBtn.onclick = function() {
                modal.remove();
                callback(null, '', '');
            };
            passwordInput.onkeydown = function(e) {
                if (e.key === 'Enter') confirmBtn.click();
            };
            document.body.appendChild(modal);
            setTimeout(function() { passwordInput.focus(); }, 100);
        }

        // 分享生成的脚本到需求墙
        async function shareScriptToWall(type) {
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('分享脚本到墙');
            const scriptContent = type === 'activity' ? window._activityScriptOutput : window._dungeonScriptOutput;
            const scriptType = type === 'activity' ? '活动脚本' : '副本脚本';
            if (!scriptContent) {
                alert('没有可分享的脚本内容！');
                return;
            }

            // 强需求：分享前必须设置昵称（仅用于展示，全局唯一，取消则不打开发布）
            const nick = await ensureNickname();
            if (!nick) { alert('分享脚本需要先设置昵称（昵称仅用于发言/分享脚本展示，设置后不可自行修改）'); return; }

            if (!getGistToken()) {
                alert('离线版暂不支持发送，请检查网络连接');
                return;
            }

            // 【关键安全】分享前先从Gist加载历史消息，确保本地wallMessages完整
            // 否则可能只有新消息，保存后覆盖历史消息
            if (wallMessages.length === 0) {
                try { await fetchMessages(); } catch (e) { console.warn('预加载消息失败:', e); }
            }

            const now = new Date();
            const defaultName = `${scriptType}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
            const inputName = await askTextInputAsync({ title: '分享脚本', label: '分享文件名（不含扩展名）：', defaultValue: defaultName });
            if (!inputName) return;
            const fileName = inputName.endsWith('.txt') ? inputName : inputName + '.txt';

            // 分享选项弹窗（时长 + 密码）
            const shareOpts = await new Promise(function(resolve) { showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); }); });
            if (shareOpts === null || shareOpts[0] === null) return;
            const expireMinutes = shareOpts[0];
            const sharePassword = shareOpts[1];
            const recoveryKey = shareOpts[2] || '';

            try {
                // 上传到Gist
                const token = getGistToken();
                // 有密码则加密内容（选了恢复密钥则走方案B：密码+恢复密钥双加密）
                let uploadContent = scriptContent;
                let passwordHash = null;
                const willEncrypt = !!(sharePassword || recoveryKey);
                if (willEncrypt) {
                    uploadContent = recoveryKey ? await encryptContentB(scriptContent, sharePassword, recoveryKey) : await encryptContent(scriptContent, sharePassword);
                    passwordHash = await hashPassword(sharePassword || '');
                }
                const response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        description: `脚本分享: ${fileName}` + (sharePassword ? ' [加密]' : ''),
                        public: true,
                        files: {
                            [fileName]: { content: uploadContent }
                        }
                    })
                });

                if (!response.ok) throw new Error('上传失败');
                const data = await response.json();
                const scriptUrl = data.files[fileName]?.raw_url || `https://gist.githubusercontent.com/${data.id}/raw/${encodeURIComponent(fileName)}`;

                // 发布到需求墙
                const nickname = localStorage.getItem('TFJL_UserName') || '匿名用户';
                const content = `分享${scriptType}: ${fileName}\n${scriptUrl}`;
                const newMsg = {
                    content: content,
                    author: nickname,
                    time: Date.now(),
                    scriptUrl: scriptUrl,
                    expireMinutes: expireMinutes > 0 ? expireMinutes : null,
                    isEncrypted: !!willEncrypt
                };
                if (passwordHash) newMsg.passwordHash = passwordHash;
                if (recoveryKey) newMsg.encScheme = 'B';

                wallMessages.unshift(newMsg);
                if (wallMessages.length > MAX_MESSAGES) {
                    wallMessages = wallMessages.slice(0, MAX_MESSAGES);
                }

                await saveMessagesToGist();
                renderMessages();
                if (sharePassword || recoveryKey) {
                    showPasswordReminder(fileName, sharePassword, '脚本已分享', recoveryKey);
                } else {
                    showToast('✅ 脚本已分享到需求墙！');
                }
            } catch (err) {
                console.error('分享失败:', err);
                alert('分享失败: ' + err.message);
            }
        }

        // 分享脚本文件到需求墙
        // shareOpts: { expireMinutes, password } 预选选项（批量调用时传入，跳过弹窗）
        async function shareTxtFileToWall(index, providedName = null, shareOpts = null) {
            const file = txtFiles[index];
            if (!file) return;

            // 强需求：分享前必须设置昵称（仅用于展示，全局唯一，取消则不打开发布）
            const nick = await ensureNickname();
            if (!nick) { alert('分享脚本需要先设置昵称（昵称仅用于发言/分享脚本展示，设置后不可自行修改）'); return; }

            if (!getGistToken()) {
                alert('离线版暂不支持发送，请检查网络连接');
                return;
            }

            // 【关键安全】分享前先从Gist加载历史消息，确保本地wallMessages完整
            if (wallMessages.length === 0) {
                try { await fetchMessages(); } catch (e) { console.warn('预加载消息失败:', e); }
            }

            let shareFileName = providedName;
            if (!shareFileName) {
                const now = new Date();
                const defaultName = `${file.name.replace(/\.txt$/,'')}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
                const inputName = await askTextInputAsync({ title: '分享脚本', label: '分享文件名（不含扩展名）：', defaultValue: defaultName });
                if (!inputName) return;
                shareFileName = inputName.endsWith('.txt') ? inputName : inputName + '.txt';
            }

            // 分享选项弹窗（时长 + 密码），批量时使用预选值
            let expireMinutes = 0;
            let sharePassword = '';
            let recoveryKey = '';
            if (shareOpts) {
                expireMinutes = shareOpts.expireMinutes;
                sharePassword = shareOpts.password;
                recoveryKey = shareOpts.recoveryKey || '';
            } else {
                const opts = await new Promise(function(resolve) { showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); }); });
                if (opts === null || opts[0] === null) return;
                expireMinutes = opts[0];
                sharePassword = opts[1];
                recoveryKey = opts[2] || '';
            }

            try {
                const token = getGistToken();
                // 有密码则加密内容
                let uploadContent = file.content;
                let passwordHash = null;
                const willEncrypt = !!(sharePassword || recoveryKey);
                if (willEncrypt) {
                    uploadContent = recoveryKey ? await encryptContentB(file.content, sharePassword, recoveryKey) : await encryptContent(file.content, sharePassword);
                    passwordHash = await hashPassword(sharePassword || '');
                }
                const response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        description: `脚本分享: ${shareFileName}` + (sharePassword ? ' [加密]' : ''),
                        public: true,
                        files: {
                            [shareFileName]: { content: uploadContent }
                        }
                    })
                });

                if (!response.ok) throw new Error('上传失败');
                const data = await response.json();
                const scriptUrl = data.files[shareFileName]?.raw_url || `https://gist.githubusercontent.com/${data.id}/raw/${encodeURIComponent(shareFileName)}`;

                const nickname = localStorage.getItem('TFJL_UserName') || '匿名用户';
                const content = `分享脚本: ${shareFileName}\n${scriptUrl}`;
                const newMsg = {
                    content: content,
                    author: nickname,
                    time: Date.now(),
                    scriptUrl: scriptUrl,
                    expireMinutes: expireMinutes > 0 ? expireMinutes : null,
                    isEncrypted: !!willEncrypt
                };
                if (passwordHash) newMsg.passwordHash = passwordHash;
                if (recoveryKey) newMsg.encScheme = 'B';

                wallMessages.unshift(newMsg);
                if (wallMessages.length > MAX_MESSAGES) {
                    wallMessages = wallMessages.slice(0, MAX_MESSAGES);
                }

                await saveMessagesToGist();
                renderMessages();
                if (sharePassword) {
                    showPasswordReminder(shareFileName, sharePassword, '脚本已分享', recoveryKey);
                } else {
                    showToast('✅ 脚本已分享到需求墙！');
                }
                return true;
            } catch (err) {
                console.error('分享失败:', err);
                alert('分享失败: ' + err.message);
                return false;
            }
        }

        // 批量分享项目文件到需求墙
        async function batchShareTxtFilesToWall(indices) {
            if (!indices || indices.length === 0) return;
            if (!getGistToken()) { alert('离线版暂不支持发送，请检查网络连接'); return; }
            const now = new Date();
            const suffix = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
            const baseName = await askTextInputAsync({ title: '批量分享', label: '文件名前缀（留空则每个用原文件名）：', defaultValue: '' });
            if (baseName === null) return;
            // 批量统一选择分享选项
            const opts = await new Promise(function(resolve) { showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); }); });
            if (opts === null || opts[0] === null) return;
            const shareOpts = { expireMinutes: opts[0], password: opts[1], recoveryKey: opts[2] || '' };
            let success = 0, fail = 0;
            for (const idx of indices) {
                const file = txtFiles[idx];
                if (!file) continue;
                const name = baseName ? `${baseName}_${file.name.replace(/\.txt$/,'')}_${suffix}.txt` : `${file.name.replace(/\.txt$/,'')}_${suffix}.txt`;
                const ok = await shareTxtFileToWall(idx, name, shareOpts);
                if (ok) success++; else fail++;
            }
            showToast(`✅ 批量分享完成：成功 ${success} 个${fail ? '，失败 ' + fail + ' 个' : ''}`);
        }

        // type: 'activity' | 'dungeon' | 任意自定义标签（externalContent/windowId 提供时为通用"另存为副本"）
        function showSaveScriptDialog(type, externalContent, windowId) {
            let scriptContent = externalContent || '';
            if (!scriptContent && windowId && window.__notebookSaveContent && window.__notebookSaveContent[windowId]) {
                scriptContent = window.__notebookSaveContent[windowId];
            }
            if (!scriptContent) {
                scriptContent = (type === 'activity' ? window._activityScriptOutput : window._dungeonScriptOutput);
            }
            const isCopy = !!(externalContent || (windowId && window.__notebookSaveContent && window.__notebookSaveContent[windowId]));
            const copyName = (windowId && window.__notebookSaveName && window.__notebookSaveName[windowId])
                || (typeof type === 'string' && type !== 'activity' && type !== 'dungeon' ? type : '');
            const scriptType = isCopy ? (copyName || '脚本') : (type === 'activity' ? '活动脚本' : '副本脚本');
            if (!scriptContent) {
                alert('没有可保存的脚本内容！');
                return;
            }

            // 获取所有项目列表（失败兜底：仍可新建项目保存副本）
            const renderSaveModal = (projects) => {
                // 按分类分组
                const grouped = {};
                if (projects && projects.length > 0) {
                    projects.forEach(p => {
                        const cat = p.category || '默认分类';
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(p);
                    });
                }

                // 构建分类选项HTML
                const categoryOptionsHtml = categories.map((cat, i) =>
                    `<option value="${cat}" ${i === 0 ? 'selected' : ''}>${cat}</option>`
                ).join('');

                // 构建选项HTML（添加"新建项目"选项）
                let optionsHtml = '<option value="__NEW__" style="color:#4ade80;font-weight:bold;">➕ 新建项目</option>';
                Object.keys(grouped).sort().forEach(cat => {
                    optionsHtml += `<optgroup label="${cat}">`;
                    grouped[cat].forEach(p => {
                        const selected = p.name === currentProjectName ? ' selected' : '';
                        optionsHtml += `<option value="${p.name}"${selected}>${p.name}</option>`;
                    });
                    optionsHtml += '</optgroup>';
                });

                // 创建对话框
                const modal = document.createElement('div');
                modal.id = 'saveScriptModal';
                modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;';
                modal.innerHTML = `
                    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(33,150,243,0.5);border-radius:12px;padding:20px;width:360px;max-width:90vw;">
                        <div style="color:#fff;font-weight:bold;font-size:1.1rem;margin-bottom:8px;">💾 保存${scriptType}到项目</div>
                        ${isCopy ? `<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin-bottom:12px;line-height:1.4;">📌 另存为<b>副本</b>：仅写入所选项目的脚本列表，<b>需求墙源文件不会被修改</b></div>` : ''}
                        <div style="margin-bottom:10px;">
                            <label style="color:rgba(255,255,255,0.7);font-size:0.85rem;display:block;margin-bottom:5px;">选择项目：</label>
                            <select id="saveScriptProjectSelect" onchange="toggleNewProjectInput()" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(33,150,243,0.3);background:#2a2a4a;color:#fff;font-size:0.9rem;">${optionsHtml}</select>
                        </div>
                        <div id="newProjectInputRow" style="display:none;margin-bottom:10px;">
                            <label style="color:rgba(255,255,255,0.7);font-size:0.85rem;display:block;margin-bottom:5px;">新项目名称：</label>
                            <input id="newProjectNameInput" type="text" placeholder="输入新项目名称" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(33,150,243,0.3);background:#2a2a4a;color:#fff;font-size:0.9rem;box-sizing:border-box;">
                        </div>
                        <div id="newProjectCategoryRow" style="display:none;margin-bottom:10px;">
                            <label style="color:rgba(255,255,255,0.7);font-size:0.85rem;display:block;margin-bottom:5px;">选择分类：</label>
                            <select id="newProjectCategorySelect" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(33,150,243,0.3);background:#2a2a4a;color:#fff;font-size:0.9rem;">${categoryOptionsHtml}</select>
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="color:rgba(255,255,255,0.7);font-size:0.85rem;display:block;margin-bottom:5px;">脚本文件名：</label>
                            <input id="saveScriptFileName" type="text" value="${scriptType}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.txt" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(33,150,243,0.3);background:#2a2a4a;color:#fff;font-size:0.9rem;box-sizing:border-box;">
                        </div>
                        <div style="display:flex;gap:10px;justify-content:flex-end;">
                            <button onclick="document.getElementById('saveScriptModal').remove()" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">取消</button>
                            <button onclick="doSaveScriptToProject('${type}', ${externalContent ? JSON.stringify(externalContent) : 'null'}, ${windowId ? `'${windowId}'` : 'null'})" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:500;">保存</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            };
            loadProjectListFromDB().then(projects => {
                renderSaveModal(projects);
            }).catch(err => {
                console.error('加载项目列表失败:', err);
                showToast('⚠️ 项目列表读取失败，仅可新建项目保存副本');
                renderSaveModal([]);
            });
        }

        // 切换新项目输入框显示
        function toggleNewProjectInput() {
            const select = document.getElementById('saveScriptProjectSelect');
            const nameRow = document.getElementById('newProjectInputRow');
            const categoryRow = document.getElementById('newProjectCategoryRow');
            if (!select || !nameRow || !categoryRow) return;

            if (select.value === '__NEW__') {
                nameRow.style.display = 'block';
                categoryRow.style.display = 'block';
                document.getElementById('newProjectNameInput')?.focus();
            } else {
                nameRow.style.display = 'none';
                categoryRow.style.display = 'none';
            }
        }

        // 执行保存脚本到项目（externalContent/windowId 提供副本内容，用于需求墙副本另存为；源文件不变）
        function doSaveScriptToProject(type, externalContent, windowId) {
            let scriptContent = externalContent || '';
            if (!scriptContent && windowId && window.__notebookSaveContent && window.__notebookSaveContent[windowId]) {
                scriptContent = window.__notebookSaveContent[windowId];
            }
            if (!scriptContent) {
                scriptContent = (type === 'activity' ? window._activityScriptOutput : window._dungeonScriptOutput);
            }
            const isCopy = !!(externalContent || (windowId && window.__notebookSaveContent && window.__notebookSaveContent[windowId]));
            const selectValue = document.getElementById('saveScriptProjectSelect')?.value;
            const fileName = document.getElementById('saveScriptFileName')?.value?.trim();

            if (!fileName || !scriptContent) {
                alert('请填写完整信息！');
                return;
            }

            // 判断是新建项目还是保存到现有项目
            if (selectValue === '__NEW__') {
                // 新建项目
                const newProjectName = document.getElementById('newProjectNameInput')?.value?.trim();
                const newCategory = document.getElementById('newProjectCategorySelect')?.value || '默认分类';
                if (!newProjectName) {
                    alert('请输入新项目名称！');
                    return;
                }

                // 创建新项目数据
                const newProjectData = {
                    name: newProjectName,
                    category: newCategory,
                    timestamp: new Date().toISOString(),
                    myHandCards: [],
                    teammateHandCards: [],
                    myPlacedCards: [],
                    teammatePlacedCards: [],
                    cardLevels: {},
                    cardSkins: {},
                    fusionSkins: {},
                    myDeckInfo: '',
                    teammateDeckInfo: '',
                    notepad: '',
                    txtFiles: [{ name: fileName, content: scriptContent, marks: (window.__notebookSaveMarks && window.__notebookSaveMarks[windowId]) ? window.__notebookSaveMarks[windowId] : [] }],
                    referenceImages: []
                };

                // 直接保存新项目
                saveProjectToDBDirect(newProjectData).then(() => {
                    document.getElementById('saveScriptModal')?.remove();
                    showToast(`✅ 新项目"${newProjectName}"已创建（分类：${newCategory}）${isCopy ? '，副本已保存（源文件不变）' : '，脚本已保存'}！`);
                    refreshProjectSelectors();
                    // 【修复】新建项目后切换到它：loadProjectFromDB 内部 clearCurrentData() 会清空记事本等残留，
                    // 避免屏幕上仍显示上一个项目的旧记事本（此前只存库不切项目，文本框未清）
                    return loadProjectFromDB(newProjectName);
                }).then(() => {
                    const sel = document.getElementById('projectSelector1');
                    if (sel && newProjectName) sel.value = newProjectName;
                }).catch(err => {
                    console.error('创建项目失败:', err);
                    alert('创建项目失败: ' + err);
                });
            } else {
                // 保存到现有项目
                const projectName = selectValue;
                if (!projectName) {
                    alert('请选择项目！');
                    return;
                }

                // 从数据库获取目标项目数据（不影响当前项目状态）
                getProjectFromDB(projectName).then(project => {
                    if (!project) {
                        throw new Error('项目不存在');
                    }

                    // 获取项目的txtFiles
                    const projectTxtFiles = Array.isArray(project.txtFiles) ? project.txtFiles : [];

                    // 检查是否已存在同名文件
                    const existIdx = projectTxtFiles.findIndex(f => f.name === fileName);
                    if (existIdx !== -1) {
                        if (!confirm(`项目"${projectName}"中已存在"${fileName}"，是否覆盖？`)) return;
                        projectTxtFiles[existIdx].content = scriptContent;
                        if (window.__notebookSaveMarks && window.__notebookSaveMarks[windowId]) projectTxtFiles[existIdx].marks = window.__notebookSaveMarks[windowId];
                    } else {
                        projectTxtFiles.push({ name: fileName, content: scriptContent, marks: (window.__notebookSaveMarks && window.__notebookSaveMarks[windowId]) ? window.__notebookSaveMarks[windowId] : [] });
                    }

                    // 更新项目数据中的txtFiles
                    project.txtFiles = projectTxtFiles;
                    project.timestamp = new Date().toISOString();

                    // 使用 saveProjectToDBDirect 直接保存修改后的项目数据
                    return saveProjectToDBDirect(project);
                }).then(() => {
                    document.getElementById('saveScriptModal')?.remove();
                    showToast(isCopy ? `✅ 已另存副本到项目"${projectName}"（需求墙源文件不变）` : `✅ 脚本已保存到项目"${projectName}"`);

                    // 如果保存到当前项目，刷新脚本文件列表
                    if (projectName === currentProjectName) {
                        const existIdx = txtFiles.findIndex(f => f.name === fileName);
                        if (existIdx !== -1) {
                            txtFiles[existIdx].content = scriptContent;
                            if (window.__notebookSaveMarks && window.__notebookSaveMarks[windowId]) txtFiles[existIdx].marks = window.__notebookSaveMarks[windowId];
                        } else {
                            txtFiles.push({ name: fileName, content: scriptContent, marks: (window.__notebookSaveMarks && window.__notebookSaveMarks[windowId]) ? window.__notebookSaveMarks[windowId] : [] });
                        }
                        updateTxtFilesList();
                    }
                }).catch(err => {
                    console.error('保存脚本失败:', err);
                    alert('保存失败: ' + err);
                });
            }
        }

        // 通用面板拖拽功能
        // 需求墙移动/缩放时同步贡献榜（保持贴附墙右侧关系，跟随墙一起移动+高度一致）
        function syncReputationToWall() {
            const wall = document.getElementById('messageWall');
            const rp = document.getElementById('reputationPanel');
            if (!wall || !rp) return;
            if (rp.style.display === 'none' || rp.style.display === '') return;
            const r = wall.getBoundingClientRect();
            rp.style.left = (r.left + r.width + 10) + 'px';
            rp.style.top = r.top + 'px';
            rp.style.height = r.height + 'px';
            rp.style.right = 'auto';
        }
        function startPanelDrag(e, panelId) {
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('.wall-resize-handle')) return;
            e.preventDefault();
            const panel = document.getElementById(panelId);
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            const ox = e.clientX - rect.left;
            const oy = e.clientY - rect.top;
            function onMove(ev) {
                panel.style.left = Math.max(0, ev.clientX - ox) + 'px';
                panel.style.top = Math.max(0, ev.clientY - oy) + 'px';
                panel.style.right = 'auto';
                if (panelId === 'messageWall') syncReputationToWall();
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }

        function startPanelTouch(e, panelId) {
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('.wall-resize-handle')) return;
            if (e.touches.length !== 1) return;
            const panel = document.getElementById(panelId);
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            const ox = e.touches[0].clientX - rect.left;
            const oy = e.touches[0].clientY - rect.top;
            function onMove(ev) {
                if (ev.touches.length !== 1) return;
                panel.style.left = Math.max(0, ev.touches[0].clientX - ox) + 'px';
                panel.style.top = Math.max(0, ev.touches[0].clientY - oy) + 'px';
                panel.style.right = 'auto';
                if (panelId === 'messageWall') syncReputationToWall();
            }
            function onUp() {
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
                document.removeEventListener('touchcancel', onUp);
            }
            document.addEventListener('touchmove', onMove, {passive: true});
            document.addEventListener('touchend', onUp);
            document.addEventListener('touchcancel', onUp);
        }

        // 需求墙缩放（右下角手柄拖动改变宽高），并同步贡献榜位置
        function startPanelResize(e) {
            e.preventDefault();
            e.stopPropagation();
            const panel = document.getElementById('messageWall');
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            const startX = e.clientX, startY = e.clientY;
            const startW = rect.width, startH = rect.height;
            function onMove(ev) {
                const nw = Math.max(300, Math.min(window.innerWidth - 40, startW + (ev.clientX - startX)));
                const nh = Math.max(350, Math.min(window.innerHeight - 40, startH + (ev.clientY - startY)));
                panel.style.width = nw + 'px';
                panel.style.height = nh + 'px';
                syncReputationToWall();
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.userSelect = '';
            }
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }
        window.startPanelResize = startPanelResize;
        window.syncReputationToWall = syncReputationToWall;

        document.addEventListener('DOMContentLoaded', () => {
            makePanelDraggable('referencePanel', 'referencePanelHeader');
            makePanelDraggable('notepadPanel', 'notepadPanelHeader');
            makePanelDraggable('txtFilesPanel', 'txtFilesPanelHeader');
            makePanelDraggable('activityCalcPanel', 'activityCalcPanelHeader');
        });

        function makePanelDraggable(panelId, headerId) {
            const panel = document.getElementById(panelId);
            const header = document.getElementById(headerId);
            if (!panel || !header) return;
            header.addEventListener('mousedown', function(e) { startPanelDrag(e, panelId); });
            header.addEventListener('touchstart', function(e) { startPanelTouch(e, panelId); }, {passive: true});
        }

        // ==================== 🔧 异常诊断 弹窗渲染 ====================
        // 依赖 app-local.js 暴露的 window.runDiagnostics() 返回各检查项结果数组。
        window.openDiagnosticsModal = async function (forceRerun) {
            const modal = document.getElementById('diagModal');
            const list = document.getElementById('diagList');
            const summary = document.getElementById('diagSummary');
            if (!modal || !list) { alert('诊断模块未加载（app-local.js 缺失？）'); return; }
            modal.style.display = 'flex';
            summary.textContent = '正在全面检查…';
            list.innerHTML = '<div style="color:rgba(255,255,255,0.5);padding:10px 0;">⏳ 运行中，请稍候（含网络测速）…</div>';
            if (typeof window.runDiagnostics !== 'function') {
                list.innerHTML = '<div style="color:#ff6b6b;padding:10px 0;">❌ 诊断函数未加载（app-local.js 未就绪），请联系 wx：gyqsvip</div>';
                summary.textContent = '诊断不可用';
                return;
            }
            let items = [];
            try {
                items = await window.runDiagnostics();
            } catch (e) {
                list.innerHTML = '<div style="color:#ff6b6b;padding:10px 0;">❌ 诊断过程异常：' + String(e && e.message || e) + '，联系 wx：gyqsvip</div>';
                summary.textContent = '诊断失败';
                return;
            }
            const colorMap = { ok: '#4caf50', warn: '#ff9800', error: '#ff5252', info: '#4fc3f7', running: '#aaa' };
            const iconMap = { ok: '✅', warn: '⚠️', error: '❌', info: 'ℹ️', running: '⏳' };
            let errCount = 0, warnCount = 0;
            const html = items.map(it => {
                if (it.status === 'error') errCount++;
                else if (it.status === 'warn') warnCount++;
                const c = colorMap[it.status] || '#fff';
                const ic = iconMap[it.status] || 'ℹ️';
                const adv = it.advice ? ('<div style="margin-top:4px;color:#ffcc80;font-size:0.78rem;">↳ 分析：' + it.advice + '</div>') : '';
                return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<div style="display:flex;gap:8px;align-items:baseline;"><span style="color:' + c + ';">' + ic + '</span>' +
                    '<span style="font-weight:600;color:#fff;">' + it.name + '</span></div>' +
                    (it.detail ? ('<div style="margin-top:3px;color:rgba(255,255,255,0.7);font-size:0.8rem;padding-left:22px;word-break:break-all;">' + it.detail + '</div>') : '') +
                    adv + '</div>';
            }).join('');
            list.innerHTML = html;
            let verdict;
            if (errCount > 0) verdict = '❌ 发现 ' + errCount + ' 项异常（标红项请按分析处理，仍无法解决联系 wx：gyqsvip）';
            else if (warnCount > 0) verdict = '⚠️ 检查完成，' + warnCount + ' 项提醒（多为非致命，可忽略或按提示优化）';
            else verdict = '✅ 全部检查通过，非数据丢失问题；若仍异常多为网络/远端服务波动，可稍后重试';
            summary.textContent = verdict;
        };

        // ==================== ① 清理缓存 / 重建索引 ====================
        // 温和清理：仅清 SW/CacheStorage + 皮肤缓存，不动 localStorage/tfjl.dat，然后重预热皮肤。
        window.clearCacheAndReindex = async function () {
            if (!confirm('🔄 清理缓存并重建索引？\n\n将清除：\n• Service Worker 缓存\n• CacheStorage 全部缓存\n• 皮肤缓存（浏览器/App本地图缓存）\n\n不会动你的设置/项目/昵称（这些走 tfjl.dat 落盘）。\n清完后重新加载皮肤，首次略慢。')) return;
            try {
                // 1. 通知 SW + 清 CacheStorage
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    try { navigator.serviceWorker.controller.postMessage('CLEAR_CACHE'); } catch (e) {}
                }
                if (window.caches) {
                    const names = await caches.keys();
                    await Promise.all(names.map(n => caches.delete(n)));
                }
                // 2. 皮肤缓存/重拉（复用现有修复逻辑）
                if (typeof window.repairSkins === 'function') await window.repairSkins();
                // 3. 重新预热皮肤（若存在）
                if (typeof window._preheatSkins === 'function') {
                    try { await window._preheatSkins(); } catch (e) {}
                }
                alert('✅ 缓存清理完成，皮肤已重新加载。如需彻底绕过缓存可刷新页面。');
            } catch (e) {
                alert('⚠️ 清理异常：' + String(e && e.message || e));
            }
        };

        // ==================== ② 数据备份 / 导出 + 恢复 ====================
        window.backupDataExport = async function () {
            try {
                const api = window.__tfjlDiagApi;
                // 收集 localStorage（排除易变/敏感）
                const skip = new Set(['TFJL_Password', 'TFJL_LoggedIn', '__tfjl_diag_probe__']);
                const ls = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (skip.has(k)) continue;
                    ls[k] = localStorage.getItem(k);
                }
                // 收集 App 统一存储 tfjl.dat
                let appStore = null;
                if (api && api.getStoreMap) {
                    try { appStore = JSON.stringify([...api.getStoreMap().entries()]); } catch (e) {}
                }
                // 收集 IndexedDB 项目
                let projects = [];
                try {
                    if (typeof window.__tfjlLoadProjectList === 'function') projects = await window.__tfjlLoadProjectList();
                } catch (e) {}

                const payload = {
                    __tfjl_backup__: true,
                    version: 's1.0.199',
                    exportedAt: new Date().toISOString(),
                    appStore,
                    projects,
                    localStorage: ls,
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'tfjl-backup-' + ts + '.json';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                alert('✅ 备份已导出：tfjl-backup-' + ts + '.json\n\n包含：设置/昵称(tfjl.dat) + 项目(IndexedDB) + 浏览器缓存项。\n换机或清缓存后，用本菜单「💾 恢复备份」选此文件即可还原。');
            } catch (e) {
                alert('⚠️ 备份失败：' + String(e && e.message || e));
            }
        };

        window.backupDataRestore = async function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                if (!confirm('💾 恢复备份？\n\n将用备份文件覆盖当前：\n• 设置/昵称（写回 tfjl.dat）\n• 项目（写回 IndexedDB + App磁盘）\n• 浏览器缓存项\n\n当前未备份的数据会被覆盖，确认继续？')) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (!data.__tfjl_backup__) throw new Error('不是有效的 tfjl 备份文件');
                    const api = window.__tfjlDiagApi;
                    // 1. localStorage 回灌
                    if (data.localStorage) {
                        for (const k in data.localStorage) localStorage.setItem(k, data.localStorage[k]);
                    }
                    // 2. 项目写回 IndexedDB + App 磁盘
                    if (Array.isArray(data.projects) && data.projects.length) {
                        if (typeof window.__tfjlSaveAllProjects === 'function') await window.__tfjlSaveAllProjects(data.projects);
                    }
                    // 3. App 统一存储写回并落盘
                    if (data.appStore && api && api.getStoreMap) {
                        try {
                            const entries = JSON.parse(data.appStore);
                            const map = api.getStoreMap();
                            entries.forEach(([k, v]) => map.set(k, v));
                            if (api.syncAllNow) await api.syncAllNow();
                        } catch (e) { console.warn('appStore 恢复失败:', e); }
                    }
                    alert('✅ 恢复完成！部分变更（如皮肤/英雄缓存）需刷新页面后完全生效。建议刷新。');
                } catch (e) {
                    alert('⚠️ 恢复失败：' + String(e && e.message || e));
                }
            };
            input.click();
        };

        // ==================== ③ 存储占用统计 ====================
        window.showStorageStats = function () {
            const api = window.__tfjlDiagApi;
            const isApp = !!(api && api.isTauriApp);
            const fmt = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : b >= 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B');

            // 🔴 先建好 modal 并绑好关闭事件（同步、在任何 await 之前），
            // 否则一旦后面 await 抛错，事件没绑上→遮罩残留→全屏点不动必须刷新。
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = '<div style="background:#1a1f2e;border:1px solid rgba(255,255,255,0.15);border-radius:14px;max-width:480px;width:90%;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">' +
                '<div style="font-size:1.05rem;font-weight:600;color:#ffd54f;margin-bottom:12px;">📊 存储占用统计</div>' +
                '<div id="__ssBody" style="min-height:60px;color:rgba(255,255,255,0.6);font-size:0.82rem;">⏳ 统计中…</div>' +
                '<div style="margin-top:16px;text-align:right;"><button id="__ssCloseBtn" style="background:#ffd54f;color:#1a1f2e;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;">关闭</button></div>' +
                '</div>';
            document.body.appendChild(modal);
            const closeFn = () => { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); };
            const closeBtn = modal.querySelector('#__ssCloseBtn');
            if (closeBtn) closeBtn.addEventListener('click', closeFn);
            modal.addEventListener('click', (e) => { if (e.target === modal) closeFn(); });

            // 异步填充数据（失败也不影响关闭）
            (async () => {
                const lines = [];
                try {
                    // localStorage
                    let lsBytes = 0;
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        lsBytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
                    }
                    lines.push(['浏览器缓存 localStorage', localStorage.length + ' 项', fmt(lsBytes)]);

                    // tfjl.dat（App）
                    if (isApp && api.getSyncDir) {
                        try {
                            const raw = await api.readTextFile(api.getDatPath(api.getSyncDir()));
                            lines.push(['统一存储 tfjl.dat (App)', raw ? '存在' : '空', fmt(raw ? raw.length * 2 : 0)]);
                        } catch (e) { lines.push(['统一存储 tfjl.dat (App)', '读取失败', '—']); }
                    } else {
                        lines.push(['统一存储 tfjl.dat', '仅限App版', '—']);
                    }

                    // 项目
                    let projCount = 0, projBytes = 0;
                    try {
                        if (typeof window.__tfjlLoadProjectList === 'function') {
                            const pj = await window.__tfjlLoadProjectList();
                            projCount = Array.isArray(pj) ? pj.length : 0;
                            projBytes = JSON.stringify(pj).length * 2;
                        }
                    } catch (e) {}
                    lines.push(['项目数据 (IndexedDB)', projCount + ' 个', fmt(projBytes)]);

                    // CacheStorage
                    let cacheBytes = 0, cacheN = 0;
                    if (window.caches) {
                        try {
                            const names = await caches.keys();
                            cacheN = names.length;
                            for (const n of names) {
                                const c = await caches.open(n);
                                const reqs = await c.keys();
                                for (const r of reqs) { try { const res = await c.match(r); if (res) cacheBytes += (res.headers.get('content-length') | 0); } catch (e) {} }
                            }
                        } catch (e) {}
                    }
                    lines.push(['资源缓存 CacheStorage', cacheN + ' 个缓存', fmt(cacheBytes)]);

                    const html = lines.map(([n, c, s]) =>
                        '<div style="display:flex;justify-content:space-between;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.82rem;">' +
                        '<span style="color:rgba(255,255,255,0.8);">' + n + '</span>' +
                        '<span style="color:#ffd54f;">' + c + '</span>' +
                        '<span style="color:rgba(255,255,255,0.6);">' + s + '</span></div>'
                    ).join('');
                    const body = modal.querySelector('#__ssBody');
                    if (body) body.innerHTML = html;
                } catch (e) {
                    const body = modal.querySelector('#__ssBody');
                    if (body) body.innerHTML = '❌ 统计出错：' + String(e && e.message || e);
                }
            })();
        };
        