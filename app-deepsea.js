
            // ===========================================
            // 深海统计 浮窗（可拖拽/缩放/最小化 + Tauri新窗口打开详情）
            // ===========================================
            function dsEsc(s) {
                if (s == null) return '';
                return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
            }
            function dsGet(key) {
                try {
                    if (window.__tfjlStore && typeof window.__tfjlStore.get === 'function') {
                        return window.__tfjlStore.get(key);
                    }
                    return localStorage.getItem(key);
                } catch (e) { return null; }
            }
            function dsSet(key, val) {
                try {
                    if (window.__tfjlStore && typeof window.__tfjlStore.set === 'function') {
                        return window.__tfjlStore.set(key, val);
                    }
                    localStorage.setItem(key, val);
                } catch (e) {}
            }
            // 兼容 APP/网页 打开详情页
            // ⚠️ 关键坑：Tauri v2 的 new WebviewWindow() 返回的是实例（非 Promise），
            //   await 不会因"无权限"而 reject，导致静默失败、兜底不触发、表现为"点不动"。
            //   当前安装包未烤入 core:webview:allow-create-webview-window 权限，故 APP 一律用
            //   最稳的 location.href 当前页跳转（auction.html 同款，APP 一定 work）。
            function openDeepseaStats() {
                const isApp = (typeof window.__TAURI_INTERNALS__ !== 'undefined') || (typeof window.__TAURI__ !== 'undefined');
                // 网页版：优先新标签
                if (!isApp) {
                    const w = window.open('deepsea.html', '_blank');
                    if (w) return;
                    location.href = 'deepsea.html';
                    return;
                }
                // APP：当前页跳转（deepsea.html 顶部「← 返回」用 history.back 回主站）
                location.href = 'deepsea.html';
            }
            async function initDeepseaMiniPanel() {
                const body = document.getElementById('dsmpBody');
                const seasonTag = document.getElementById('dsmpSeasonTag');
                if (!body) return;
                let cur = null, daily = [], rankings = [];
                try {
                    const rawCur = dsGet('deepsea_current_season');
                    cur = rawCur ? JSON.parse(rawCur) : null;
                    const rawDaily = dsGet('deepsea_daily_entries');
                    daily = rawDaily ? JSON.parse(rawDaily) : [];
                    const rawR = dsGet('deepsea_rankings');
                    rankings = rawR ? JSON.parse(rawR) : [];
                    // APP 环境：若本地无排行，自动从 dataDir 读盘
                    if (!rankings.length && window.__TAURI__) {
                        try {
                            const T = window.__TAURI__;
                            const invoke = T && T.core && T.core.invoke;
                            if (invoke) {
                                const txt = await invoke('read_text_file_auto', { filePath: 'D:\\withfriends\\塔防精灵助手数据\\data\\deepsea-rankings.json' });
                                const json = JSON.parse(txt);
                                const list = Array.isArray(json) ? json : (json.totalRanking || []);
                                if (list.length) {
                                    dsSet('deepsea_rankings', JSON.stringify(list));
                                    rankings = list;
                                }
                            }
                        } catch (e) {}
                    }
                } catch (e) { console.warn('[深海] 数据读取失败:', e); }
                if (seasonTag) seasonTag.textContent = cur ? cur.name : '未开始';
                const seasonDaily = cur ? daily.filter(d => d.seasonId === cur.id).sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
                const latest = seasonDaily[seasonDaily.length - 1];
                const top5 = (rankings || []).slice(0, 5);
                let html = '';
                if (cur) {
                    html += '<div class="dfp-row"><span>当前赛季</span><span class="dfp-row-val">' + dsEsc(cur.name) + '</span></div>';
                    if (latest) {
                        html += '<div class="dfp-row"><span>' + dsEsc(String(latest.date).slice(5)) + ' 杯数</span><span class="dfp-row-val">' + dsEsc(latest.cups) + '</span></div>';
                        if (latest.delta != null && latest.delta !== '') {
                            const dc = latest.delta >= 0 ? '+' + latest.delta : latest.delta;
                            const cl = latest.delta >= 0 ? '#4caf50' : '#ef5350';
                            html += '<div class="dfp-row"><span>今日变化</span><span style="color:' + cl + ';font-weight:bold;">' + dc + '</span></div>';
                        }
                    } else {
                        html += '<div class="dfp-row"><span>最新杯数</span><span class="dfp-row-val">--</span></div>';
                    }
                }
                if (top5.length) {
                    html += '<div class="dfp-rankings"><div class="dfp-rank-title">🏆 联盟前5</div>';
                    top5.forEach(r => {
                        html += '<div class="dfp-rank-item"><span class="rk">#' + dsEsc(r['排名']) + '</span><span class="nm" title="' + dsEsc(r['联盟名称']) + '">' + dsEsc(r['联盟名称']) + '</span><span class="pw">' + dsEsc(r['联盟战力']) + '</span></div>';
                    });
                    html += '</div>';
                }
                if (!html) html = '<div class="dfp-empty">暂无数据<br><span style="font-size:0.7rem;">点下方「完整统计」录入</span></div>';
                body.innerHTML = html;
            }
            // 拖拽
            function dsInitDrag() {
                const panel = document.getElementById('deepseaFloatPanel');
                const header = document.getElementById('dfpHeader');
                if (!panel || !header) return;
                const start = (cx, cy, target) => {
                    if (target.closest('button')) return;
                    const r = panel.getBoundingClientRect();
                    const ox = cx - r.left, oy = cy - r.top;
                    panel.style.right = 'auto'; panel.style.bottom = 'auto';
                    const move = (x, y) => {
                        panel.style.left = Math.max(0, Math.min(window.innerWidth - 60, x - ox)) + 'px';
                        panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, y - oy)) + 'px';
                    };
                    const up = () => {
                        document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
                        document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', tu);
                    };
                    const mm = e => move(e.clientX, e.clientY);
                    const mu = up;
                    const tm = e => { if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); } };
                    const tu = up;
                    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
                    document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('touchend', tu);
                };
                header.addEventListener('mousedown', e => start(e.clientX, e.clientY, e.target));
                header.addEventListener('touchstart', e => { if (e.touches.length === 1) { start(e.touches[0].clientX, e.touches[0].clientY, e.target); } }, { passive: true });
            }
            // 缩放
            function dsInitResize() {
                const panel = document.getElementById('deepseaFloatPanel');
                const handle = document.getElementById('dfpResizer');
                if (!panel || !handle) return;
                const start = (cx, cy) => {
                    const r = panel.getBoundingClientRect();
                    const sw = r.width, sh = r.height;
                    const move = (x, y) => {
                        panel.style.width = Math.max(180, Math.min(window.innerWidth - 20, sw + (x - cx))) + 'px';
                        panel.style.height = Math.max(120, Math.min(window.innerHeight - 20, sh + (y - cy))) + 'px';
                    };
                    const up = () => {
                        document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
                        document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', tu);
                    };
                    const mm = e => move(e.clientX, e.clientY);
                    const mu = up;
                    const tm = e => { if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); } };
                    const tu = up;
                    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
                    document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('touchend', tu);
                };
                handle.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); start(e.clientX, e.clientY); });
                handle.addEventListener('touchstart', e => { if (e.touches.length === 1) { e.stopPropagation(); start(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: true });
            }
            function dsToggleMinimize() {
                const panel = document.getElementById('deepseaFloatPanel');
                if (!panel) return;
                panel.classList.toggle('minimized');
            }
            function dsClosePanel() {
                const panel = document.getElementById('deepseaFloatPanel');
                const toggle = document.getElementById('deepseaToggle');
                if (panel) panel.style.display = 'none';
                if (toggle) toggle.style.display = 'block';
            }
            function dsOpenPanel() {
                const panel = document.getElementById('deepseaFloatPanel');
                const toggle = document.getElementById('deepseaToggle');
                if (panel) panel.style.display = 'flex';
                if (toggle) toggle.style.display = 'none';
            }
            // 记忆浮窗显隐/位置
            var _lastDsPanelState = '';
            function dsSavePanelState() {
                try {
                    const panel = document.getElementById('deepseaFloatPanel');
                    if (!panel) return;
                    // 面板隐藏时无需保存（避免无意义的定时写盘刷屏）
                    const disp = panel.style.display || 'flex';
                    if (disp === 'none') return;
                    const st = { display: disp, left: panel.style.left, top: panel.style.top, width: panel.style.width, height: panel.style.height };
                    const json = JSON.stringify(st);
                    if (json === _lastDsPanelState) return; // 状态未变不写
                    _lastDsPanelState = json;
                    localStorage.setItem('deepsea_panel_state', json);
                } catch (e) {}
            }
            function dsRestorePanelState() {
                try {
                    const panel = document.getElementById('deepseaFloatPanel');
                    const toggle = document.getElementById('deepseaToggle');
                    const raw = localStorage.getItem('deepsea_panel_state');
                    if (!raw || !panel) return;
                    const st = JSON.parse(raw);
                    if (st.left) panel.style.left = st.left;
                    if (st.top) panel.style.top = st.top;
                    if (st.width) panel.style.width = st.width;
                    if (st.height) panel.style.height = st.height;
                    // v260728-20：主页面不再显示浮窗（仅管理员入口进入），强制隐藏面板与重开按钮
                    panel.style.display = 'none';
                    if (toggle) toggle.style.display = 'none';
                } catch (e) {}
            }
            window.initDeepseaMiniPanel = initDeepseaMiniPanel;
            window.openDeepseaStats = openDeepseaStats;
            // 子页内嵌弹窗：同域 iframe，子页可复用 window.parent.getGistToken()，避免整页跳转触发重新登录
            function openSubpage(url) {
                const frame = document.getElementById('subpageFrame');
                const modal = document.getElementById('subpageModal');
                frame.src = url;
                modal.style.display = 'flex';
            }
            function closeSubpage() {
                const modal = document.getElementById('subpageModal');
                const frame = document.getElementById('subpageFrame');
                modal.style.display = 'none';
                frame.src = 'about:blank';   // 释放子页
            }
            function openAlliancePage() {
                // 加缓存破坏参数，强制 Tauri webview 发无条件请求，避免拿到旧的 alliance.html（GitHub Pages+webview 304 缓存）
                openSubpage('alliance.html?_=' + Date.now());
            }
            function openDeepseaStats() {
                openSubpage('deepsea.html?_=' + Date.now());
            }
            window.openAlliancePage = openAlliancePage;
            window.dsToggleMinimize = dsToggleMinimize;
            window.dsClosePanel = dsClosePanel;
            window.dsOpenPanel = dsOpenPanel;
            document.addEventListener('DOMContentLoaded', () => {
                dsRestorePanelState();
                dsInitDrag();
                dsInitResize();
                setTimeout(initDeepseaMiniPanel, 300);
                // 离开页面前存状态
                window.addEventListener('beforeunload', dsSavePanelState);
                // 定期存（拖拽/缩放后）
                setInterval(dsSavePanelState, 4000);
            });
            