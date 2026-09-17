
        // 备份恢复菜单切换
        
        function toggleBackupMenu(btn) {
            const menu = document.getElementById('backupMenu');
            const allMenus = document.querySelectorAll('[id$="Menu"]');
            allMenus.forEach(m => {
                if (m.id !== 'backupMenu') m.style.display = 'none';
            });
            menu.style.display = menu.style.display === 'none' || menu.style.display === '' ? 'block' : 'none';
            if (menu.style.display === 'block') {
                updateEffectsVisibility();
                updatePerfModeVisibility();
            }
        }

        // 性能模式菜单文案刷新（合并键：打开菜单时同步当前模式文案 + 高亮）
        function updatePerfModeVisibility() {
            let label = '⚡ 性能模式：高性能';
            try { label = (window.getPerfModeLabel && window.getPerfModeLabel()) || label; } catch (e) {}
            const el = document.getElementById('menuTogglePerfMode');
            if (!el) return;
            el.textContent = label;
            el.style.background = 'rgba(255,215,0,0.18)';
            el.style.color = '#ffd54f';
            el.style.fontWeight = 'bold';
        }
        window.updatePerfModeVisibility = updatePerfModeVisibility;

        // 点击其他地方关闭菜单
        document.addEventListener('click', function(e) {
            const menu = document.getElementById('backupMenu');
            if (menu && !e.target.closest('#backupMenu') && !e.target.closest('[onclick*="toggleBackupMenu"]')) {
                menu.style.display = 'none';
            }
        });

        // 自定义悬浮提示：替代原生 title，定位在鼠标附近并限制在视口内（避免长文字溢出窗口）
        (function () {
            const tip = document.getElementById('customTooltip');
            if (!tip) return;
            let hideTimer = null;
            function showTip(target, x, y) {
                const text = target.getAttribute('title');
                if (!text || !text.trim()) return;
                target.setAttribute('data-title-cache', text);
                target.removeAttribute('title'); // 隐藏原生 tooltip
                tip.textContent = text;
                tip.style.display = 'block';
                const rect = tip.getBoundingClientRect();
                let left = x + 14, top = y + 16;
                if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 14;
                if (left < 8) left = 8;
                if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 16;
                if (top < 8) top = 8;
                tip.style.left = left + 'px';
                tip.style.top = top + 'px';
            }
            function hideTip(target) {
                tip.style.display = 'none';
                // 恢复原生 title（如已被缓存）
                if (target && target.getAttribute('data-title-cache')) {
                    target.setAttribute('title', target.getAttribute('data-title-cache'));
                    target.removeAttribute('data-title-cache');
                }
            }
            document.addEventListener('mouseover', function (e) {
                const t = e.target.closest('[title]');
                if (!t) return;
                clearTimeout(hideTimer);
                showTip(t, e.clientX, e.clientY);
            });
            document.addEventListener('mousemove', function (e) {
                if (tip.style.display !== 'block') return;
                const t = e.target.closest('[title], [data-title-cache]');
                if (!t) return;
                const rect = tip.getBoundingClientRect();
                let left = e.clientX + 14, top = e.clientY + 16;
                if (left + rect.width > window.innerWidth - 8) left = e.clientX - rect.width - 14;
                if (left < 8) left = 8;
                if (top + rect.height > window.innerHeight - 8) top = e.clientY - rect.height - 16;
                if (top < 8) top = 8;
                tip.style.left = left + 'px';
                tip.style.top = top + 'px';
            });
            document.addEventListener('mouseout', function (e) {
                const t = e.target.closest('[title], [data-title-cache]');
                if (!t) return;
                if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[title], [data-title-cache]') === t) return;
                hideTip(t);
            });
        })();

        // 全局拖拽防护：拖拽文件时阻止浏览器默认打开文件行为（不影响卡牌拖拽）
        window.addEventListener('dragover', function(e) {
            const hasFiles = e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files');
            if (!hasFiles) return;
            // 面板内的文件拖拽由面板处理（脚本面板和参考图片面板都能接收）
            const txtPanel = document.getElementById('txtFilesPanel');
            if (txtPanel && txtPanel.style.display !== 'none' && txtPanel.contains(e.target)) return;
            const refPanel = document.getElementById('referencePanel');
            if (refPanel && refPanel.style.display !== 'none' && refPanel.contains(e.target)) return;
            e.preventDefault();
        });
        window.addEventListener('drop', function(e) {
            const hasFiles = e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files');
            if (!hasFiles) return;
            const txtPanel = document.getElementById('txtFilesPanel');
            if (txtPanel && txtPanel.style.display !== 'none' && txtPanel.contains(e.target)) return;
            const refPanel = document.getElementById('referencePanel');
            if (refPanel && refPanel.style.display !== 'none' && refPanel.contains(e.target)) return;
            e.preventDefault();
        });

        // ==================== 鼠标特效系统 ====================
        let effectContainer = null;

        // 创建特效容器
        function createEffectContainer() {
            if (!effectContainer) {
                effectContainer = document.createElement('div');
                effectContainer.className = 'cursor-effect';
                effectContainer.id = 'cursorEffectContainer';
                document.body.appendChild(effectContainer);
            }
        }

        // 1️⃣ 跟随拖尾特效（已节流：避免每次 mousemove 都创建 DOM，降低 GPU 合成层堆积）
        const trailColors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#8b00ff'];
        let _trailLastTime = 0;
        function handleTrailEffect(e) {
            const now = Date.now();
            if (now - _trailLastTime < 80) return; // 最多每 80ms 创建一个拖尾粒子
            _trailLastTime = now;
            const particle = document.createElement('div');
            particle.className = 'trail-particle';
            particle.textContent = '♡';
            particle.style.left = e.clientX + 'px';
            particle.style.top = e.clientY + 'px';
            particle.style.color = trailColors[Math.floor(Math.random() * trailColors.length)];
            particle.style.textShadow = `0 0 10px ${particle.style.color}`;
            effectContainer.appendChild(particle);
            setTimeout(() => particle.remove(), 1500);
        }

        // 初始化跟随拖尾特效
        function initTrailEffect() {
            createEffectContainer();
            document.addEventListener('mousemove', handleTrailEffect);
        }

        // ==================== 粒子背景系统 ====================
        const bgParticleColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8'];

        // 初始化粒子背景
        function initParticleBackground() {
            const backgroundContainer = document.createElement('div');
            backgroundContainer.className = 'particle-container';
            document.body.appendChild(backgroundContainer);
            document.body.classList.add('background-particle');

            // 🔴 2026-08-30 内存/性能修复：背景粒子从 30 个降到 10 个，减少持续 GPU 合成层数量
            for (let i = 0; i < 10; i++) {
                const particle = document.createElement('div');
                particle.className = 'bg-particle';
                particle.textContent = '❤️';
                const fontSize = Math.random() * 20 + 15;
                particle.style.fontSize = fontSize + 'px';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.color = bgParticleColors[Math.floor(Math.random() * bgParticleColors.length)];
                particle.style.animationDelay = Math.random() * 20 + 's';
                particle.style.animationDuration = (15 + Math.random() * 10) + 's';
                particle.style.opacity = 0.3 + Math.random() * 0.4;
                backgroundContainer.appendChild(particle);
            }
        }

        // ==================== 特效开关 ====================
        function isEffectsEnabled() {
            return localStorage.getItem('tfjl_effects_enabled') !== '0';
        }

        function updateEffectsVisibility() {
            const enabled = isEffectsEnabled();
            const menuItem = document.getElementById('menuToggleEffects');
            if (menuItem) {
                menuItem.innerHTML = enabled ? '✨ 背景特效：开' : '✨ 背景特效：关';
            }
            // 鼠标拖尾容器
            const cursorContainer = document.getElementById('cursorEffectContainer');
            if (cursorContainer) cursorContainer.style.display = enabled ? '' : 'none';
            // 粒子背景容器
            const bgContainer = document.querySelector('.particle-container');
            if (bgContainer) bgContainer.style.display = enabled ? '' : 'none';
        }

        function toggleVisualEffects() {
            const current = isEffectsEnabled();
            localStorage.setItem('tfjl_effects_enabled', current ? '0' : '1');
            updateEffectsVisibility();
        }

        // ==================== 用户自定义背景 ====================
        // 预设：明亮(浅色协调)/动漫(精致)/炫酷(保留极光·星河，用户认可)。实拍走「上传图片」。
        // 另支持圆盘选色器多选浅色生成渐变（grad:）、上传图片（custom:）。
        const BG_PRESETS = {
            bright: [
                { name: '晨雾', css: 'linear-gradient(135deg,#e0eafc 0%,#cfdef3 100%)' },
                { name: '薄暮', css: 'linear-gradient(135deg,#fdfbfb 0%,#ebedee 100%)' },
                { name: '薰衣草', css: 'linear-gradient(135deg,#e6e6fa 0%,#d8d8f6 100%)' },
                { name: '樱雾', css: 'linear-gradient(135deg,#ffeef8 0%,#ffd6e8 100%)' },
                { name: '薄荷雾', css: 'linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%)' }
            ],
            anime: [
                { name: '深海', css: 'linear-gradient(135deg,#2b5876 0%,#4e4376 100%)' },
                { name: '樱霞', css: 'linear-gradient(135deg,#ff9a9e 0%,#fecfef 100%)' },
                { name: '晴空蓝', css: 'linear-gradient(135deg,#89f7fe 0%,#66a6ff 100%)' }
            ],
            cool: [
                { name: '极光', css: 'linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)', anim: 'aurora' },
                { name: '星河', css: 'radial-gradient(ellipse at 50% 0%,#1b2735 0%,#090a0f 100%)', anim: 'stars' }
            ]
        };
        // 随机渐变用的协调浅色板
        const SOFT_PALETTE = ['#e0eafc','#cfdef3','#e6e6fa','#d8d8f6','#ffeef8','#ffd6e8','#e8f5e9','#c8e6c9','#fdfbfb','#ebedee','#fbc2eb','#a6c1ee','#a1c4fd','#c2e9fb','#fff1eb','#ace0f9'];
        let bgSelectedColors = [];
        const BG_KEY = 'TFJL_User_BG';

        function getBgOverlayForValue(val) {
            if (!val || val === 'default') return 0;
            if (val.indexOf('grad:') === 0) return 0.35;
            if (val.indexOf('custom:') === 0) return 0.4;
            if (val.indexOf('preset:') === 0) {
                const key = val.slice(7);
                for (const cat of Object.keys(BG_PRESETS)) {
                    const p = BG_PRESETS[cat].find(function (x) { return x.name === key; });
                    if (p) {
                        if (cat === 'bright') return 0.38;
                        if (cat === 'anime') return key === '深海' ? 0.12 : 0.28;
                        return 0;
                    }
                }
            }
            return 0;
        }

        function applyUserBackground() {
            document.body.classList.remove('bg-custom', 'bg-anim-aurora', 'bg-anim-neon', 'bg-anim-stars');
            document.body.style.background = '';
            document.body.style.backgroundImage = '';
            document.body.style.backgroundAttachment = '';
            const val = (localStorage.getItem(BG_KEY) || '').trim();
            if (!val || val === 'default') return;
            if (val.indexOf('preset:') === 0) {
                const key = val.slice(7);
                let css = null, anim = null;
                for (const cat of Object.keys(BG_PRESETS)) {
                    const p = BG_PRESETS[cat].find(function (x) { return x.name === key; });
                    if (p) { css = p.css; anim = p.anim; break; }
                }
                if (css) {
                    document.body.style.background = css;
                    document.body.style.backgroundAttachment = 'fixed';
                    if (anim) document.body.classList.add('bg-anim-' + anim);
                }
            } else if (val.indexOf('custom:') === 0) {
                document.body.classList.add('bg-custom');
                document.body.style.backgroundImage = 'url(' + val.slice(7) + ')';
            } else if (val.indexOf('grad:') === 0) {
                document.body.style.background = val.slice(5);
                document.body.style.backgroundAttachment = 'fixed';
            }
            document.body.style.setProperty('--bg-overlay', String(getBgOverlayForValue(val)));
        }

        // 上传图片：canvas 压缩到最长边 1920px、JPEG 0.8，避免超 localStorage 配额 / 拖慢加载
        function handleBgFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function () {
                const img = new Image();
                img.onload = function () {
                    const max = 1920;
                    const scale = Math.min(1, max / Math.max(img.width, img.height));
                    const cw = Math.max(1, Math.round(img.width * scale));
                    const ch = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = cw; canvas.height = ch;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, cw, ch);
                    let dataUrl;
                    try { dataUrl = canvas.toDataURL('image/jpeg', 0.8); } catch (e) { dataUrl = reader.result; }
                    localStorage.setItem(BG_KEY, 'custom:' + dataUrl);
                    applyUserBackground();
                    try { if (typeof showToast === 'function') showToast('✅ 背景已更新'); } catch (e) {}
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }

        window.__setBgPreset = function (name) {
            localStorage.setItem(BG_KEY, name === 'default' ? 'default' : 'preset:' + name);
            applyUserBackground();
            const m = document.getElementById('bgSettingsModal'); if (m) m.remove();
            try { if (typeof showToast === 'function') showToast('✅ 背景已切换'); } catch (e) {}
        };
        window.__bgFile = function (file) { handleBgFile(file); const m = document.getElementById('bgSettingsModal'); if (m) m.remove(); };

        // ---------- 圆盘选色器：多选浅色生成渐变 ----------
        function addBgColor(hex) {
            hex = (hex || '').toLowerCase();
            if (hex.indexOf('#') !== 0) return;
            if (bgSelectedColors.indexOf(hex) >= 0) return;
            if (bgSelectedColors.length >= 5) bgSelectedColors.shift();
            bgSelectedColors.push(hex);
            renderBgColorList();
            previewBgGrad();
        }
        function renderBgColorList() {
            const box = document.getElementById('bgColorList');
            if (!box) return;
            if (!bgSelectedColors.length) { box.innerHTML = '<span style="font-size:0.7rem;color:rgba(255,255,255,0.4);">还没选色，拖圆盘选几个浅色 →</span>'; return; }
            box.innerHTML = bgSelectedColors.map(function (c, i) {
                return '<button onclick="window.__bgRemoveColor(' + i + ')" title="点击删除" style="width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,0.7);background:' + c + ';cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,0.3);"></button>';
            }).join('');
        }
        function buildGrad(colors) {
            if (!colors.length) return '#222';
            if (colors.length === 1) return 'linear-gradient(135deg,' + colors[0] + ',' + colors[0] + ')';
            return 'linear-gradient(135deg,' + colors.join(',') + ')';
        }
        function previewBgGrad() {
            if (!bgSelectedColors.length) return;
            document.body.style.background = buildGrad(bgSelectedColors);
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.setProperty('--bg-overlay', '0.35');
        }
        window.__bgRemoveColor = function (i) {
            bgSelectedColors.splice(i, 1);
            renderBgColorList();
            if (bgSelectedColors.length) previewBgGrad(); else applyUserBackground();
        };
        window.__bgClearColors = function () { bgSelectedColors = []; renderBgColorList(); applyUserBackground(); };
        window.__bgApplyGrad = function () {
            if (bgSelectedColors.length < 2) { try { if (typeof showToast === 'function') showToast('至少选 2 个颜色'); } catch (e) {} return; }
            const css = buildGrad(bgSelectedColors);
            localStorage.setItem(BG_KEY, 'grad:' + css);
            applyUserBackground();
            const m = document.getElementById('bgSettingsModal'); if (m) m.remove();
            try { if (typeof showToast === 'function') showToast('✅ 渐变背景已应用'); } catch (e) {}
        };
        window.__bgRandomGrad = function () {
            const n = 2 + Math.floor(Math.random() * 2);
            const pool = SOFT_PALETTE.slice();
            bgSelectedColors = [];
            for (let i = 0; i < n; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                bgSelectedColors.push(pool.splice(idx, 1)[0]);
            }
            renderBgColorList();
            window.__bgApplyGrad();
        };

        function openBackgroundSettings() {
            const old = document.getElementById('bgSettingsModal');
            if (old) old.remove();
            bgSelectedColors = [];
            const labels = { bright: '☀️ 明亮（浅色）', anime: '🌸 动漫', cool: '✨ 炫酷' };
            const rows = [];
            for (const cat of ['bright', 'anime', 'cool']) {
                rows.push('<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin:12px 0 6px;">' + labels[cat] + '</div>');
                BG_PRESETS[cat].forEach(function (p) {
                    rows.push('<button onclick="window.__setBgPreset(\'' + p.name + '\')" style="margin:4px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:' + p.css + ';color:' + (p.anim ? '#fff' : '#1a1a2e') + ';cursor:pointer;font-size:0.8rem;text-shadow:' + (p.anim ? '0 1px 2px rgba(0,0,0,0.5)' : 'none') + ';">' + p.name + '</button>');
                });
            }
            const modal = document.createElement('div');
            modal.id = 'bgSettingsModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = '' +
                '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,215,0,0.4);border-radius:16px;padding:22px;max-width:500px;width:92%;max-height:88vh;overflow:auto;">' +
                '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
                '    <span style="color:#ffd700;font-size:1.1rem;font-weight:bold;">🎨 背景设置</span>' +
                '    <button onclick="document.getElementById(\'bgSettingsModal\').remove()" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;">✕</button>' +
                '  </div>' +
                '  <div style="color:rgba(255,255,255,0.5);font-size:0.74rem;margin-bottom:6px;">上传图片会自动压缩到最长边 1920px（无需操心尺寸），存在本机、每台设备独立。</div>' +
                rows.join('') +
                '  <div style="border-top:1px solid rgba(255,255,255,0.12);margin-top:14px;padding-top:12px;">' +
                '    <div style="color:rgba(255,255,255,0.6);font-size:0.78rem;margin-bottom:8px;">🎨 圆盘自选渐变：用现有圆盘选色器，拖到亮处选浅色，松手即加入（最多 5 个）</div>' +
                '    <div style="position:relative;width:132px;height:132px;margin:0 auto 9px;">' +
                '      <canvas id="bgWheel_wheel" style="width:132px;height:132px;border-radius:50%;display:block;cursor:crosshair;box-shadow:0 0 0 1px rgba(255,255,255,0.28),0 4px 14px rgba(0,0,0,0.55);"></canvas>' +
                '      <div id="bgWheel_wheelDot" style="position:absolute;left:66px;top:66px;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.9);transform:translate(-50%,-50%);pointer-events:none;"></div>' +
                '    </div>' +
                '    <div style="display:flex;align-items:center;gap:6px;margin-bottom:9px;">' +
                '      <span style="font-size:0.58rem;color:#9a9ab0;flex-shrink:0;">亮度</span>' +
                '      <div id="bgWheel_vBar" style="position:relative;flex:1;height:12px;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.25);background:linear-gradient(to right,#000,#fff);">' +
                '        <div id="bgWheel_vDot" style="position:absolute;left:100%;top:50%;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,0.5);box-shadow:0 1px 4px rgba(0,0,0,0.7);transform:translate(-50%,-50%);pointer-events:none;"></div>' +
                '      </div>' +
                '    </div>' +
                '    <div id="bgColorList" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;align-items:center;"></div>' +
                '    <div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '      <button onclick="window.__bgApplyGrad()" style="padding:8px 12px;border-radius:8px;border:none;background:linear-gradient(135deg,#ffd700,#ff9800);color:#1a1a2e;cursor:pointer;font-size:0.82rem;font-weight:bold;">✅ 应用渐变</button>' +
                '      <button onclick="window.__bgRandomGrad()" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.82rem;">🎲 随机渐变</button>' +
                '      <button onclick="window.__bgClearColors()" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.82rem;">🧹 清空</button>' +
                '    </div>' +
                '  </div>' +
                '  <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
                '    <label style="padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#4facfe,#00f2fe);color:#1a1a2e;cursor:pointer;font-weight:600;font-size:0.85rem;">' +
                '      📤 上传图片<input type="file" accept="image/*" style="display:none;" onchange="window.__bgFile(this.files[0])">' +
                '    </label>' +
                '    <button onclick="window.__setBgPreset(\'default\')" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.85rem;">↺ 恢复默认</button>' +
                '    <button onclick="toggleVisualEffects()" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.85rem;">✨ 炫酷特效开关</button>' +
                '  </div>' +
                '  <div style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.72rem;">提示：选「炫酷」预设并开特效，粒子叠在背景上更带感；浅色背景可能让部分浅色文字变淡，可随时恢复默认。</div>' +
                '</div>';
            document.body.appendChild(modal);
            modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
            renderBgColorList();
            try {
                if (window.NBPC && NBPC.Wheel) {
                    if (NBPC.Wheel.injectStyles) NBPC.Wheel.injectStyles();
                    NBPC.Wheel.init('bgWheel', {
                        onApply: function (hex) { addBgColor(hex); },
                        onPreview: function () {}
                    });
                    NBPC.Wheel.sync('bgWheel', '#cfdef3');
                }
            } catch (e) { console.warn('[背景圆盘] 初始化失败:', e); }
        }

        // 在「背景特效」菜单项旁注入「🎨 背景」入口
        function injectBackgroundMenu() {
            const ref = document.getElementById('menuToggleEffects');
            if (!ref) { setTimeout(injectBackgroundMenu, 600); return; }
            if (document.getElementById('menuBgItem')) return;
            const item = document.createElement('div');
            item.id = 'menuBgItem';
            item.className = ref.className || '';
            item.style.cssText = ref.style.cssText;
            item.textContent = '🎨 背景';
            item.onclick = openBackgroundSettings;
            ref.parentNode.insertBefore(item, ref.nextSibling);
        }

        window.openBackgroundSettings = openBackgroundSettings;
        window.applyUserBackground = applyUserBackground;
        window.injectBackgroundMenu = injectBackgroundMenu;

        // ==================== 密码验证 ====================
        // 密码存储在localStorage中，支持管理员动态管理
        const PASSWORDS_STORAGE_KEY = 'TFJL_AdminPasswords';
        // 访问密码以 PBKDF2 哈希(v2$)存储，源码不含明文。原始明文仅开发者本地改密用：tfjl / TFJL / ymkfqtbl / gyq
        const DEFAULT_PASSWORD_HASHES = ['v2$V8Crw2nuBjPl7sZVBfjnmKV13TjXkwXEsFJoLwZxaeg=', 'v2$YLaCsuaTJM9dxJZULdL+Di3jD7SDx+8QnGY3uyZrKJo=', 'v2$KDYq+zl4oiPcvk8gW6BKbypOW7mmUatgKg5pQIRCIxM=', 'v2$RVaqgAE/QYaCaHytPLaM/ADr411QeDBbo8VOBH1OSoQ='];

        function getAdminPasswords() {
            // 返回哈希数组：初始哈希 + 本地存储中已哈希(v2$)的项；忽略旧明文项(避免比对失败，用户重加即可)
            const saved = localStorage.getItem(PASSWORDS_STORAGE_KEY);
            let extra = [];
            if (saved) {
                try {
                    const arr = JSON.parse(saved);
                    if (Array.isArray(arr)) extra = arr.filter(x => typeof x === 'string' && x.indexOf('v2$') === 0);
                } catch (e) {}
            }
            return DEFAULT_PASSWORD_HASHES.concat(extra);
        }

        // 检查是否已登录，未登录则不允许执行操作
        function isLoggedIn() {
            return localStorage.getItem('TFJL_LoggedIn') === 'true';
        }

        // 确保关键函数需要登录
        function requireLogin() {
            if (!isLoggedIn()) {
                alert('🔒 请先输入密码登录后再操作！');
                return false;
            }
            return true;
        }

        async function checkPasswordAndEnter(targetSystem) {
            const input = document.getElementById('passwordInput');
            const errorDiv = document.getElementById('passwordError');
            const password = input.value.trim();
            
            const MAX_ERRORS = 5;
            const LOCK_DURATION = 30;
            let errorCount = parseInt(localStorage.getItem('TFJL_PasswordErrorCount') || '0');
            let lockStartTime = parseInt(localStorage.getItem('TFJL_PasswordLockStart') || '0');
            let currentTime = Date.now();
            
            if (lockStartTime > 0) {
                const elapsedSeconds = Math.floor((currentTime - lockStartTime) / 1000);
                const remainingSeconds = LOCK_DURATION - elapsedSeconds;
                
                if (remainingSeconds > 0) {
                    errorDiv.textContent = `⏰ 密码错误次数过多，请 ${remainingSeconds} 秒后再试`;
                    errorDiv.style.display = 'block';
                    input.value = '';
                    return;
                } else {
                    localStorage.setItem('TFJL_PasswordErrorCount', '0');
                    localStorage.setItem('TFJL_PasswordLockStart', '0');
                    errorCount = 0;
                    lockStartTime = 0;
                }
            }

            const _hashes = getAdminPasswords();
            let _ok = false;
            for (const _h of _hashes) { if (await verifyPassword(password, _h)) { _ok = true; break; } }
            if (_ok) {
                // 密码正确，清除错误计数
                localStorage.setItem('TFJL_PasswordErrorCount', '0');
                localStorage.setItem('TFJL_PasswordLockStart', '0');
                
                // 记录登录
                recordLogin();
                localStorage.setItem('TFJL_LoggedIn', 'true');
                saveAuthToDisk(true);   // 落地到磁盘：重启/更新/清缓存后都不弹密码门
                
                // 记住密码：如果勾选了"记住密码"，保存密码（简单编码混淆）
                const rememberCb = document.getElementById('rememberPassword');
                if (rememberCb && rememberCb.checked) {
                    try {
                        localStorage.setItem('TFJL_SavedPwd', btoa(password));
                    } catch (e) {}
                } else {
                    localStorage.removeItem('TFJL_SavedPwd');
                }
                
                errorDiv.style.display = 'none';
                
                // 进入归档系统（当前唯一入口）
                enterArchiveFromLogin();
            } else {
                // 密码错误
                errorCount++;
                localStorage.setItem('TFJL_PasswordErrorCount', errorCount.toString());
                
                if (errorCount >= MAX_ERRORS) {
                    localStorage.setItem('TFJL_PasswordLockStart', currentTime.toString());
                    errorDiv.textContent = `❌ 密码错误已达 ${errorCount} 次，请 ${LOCK_DURATION} 秒后再试`;
                } else {
                    errorDiv.textContent = `❌ 密码错误，还可以尝试 ${MAX_ERRORS - errorCount} 次`;
                }
                errorDiv.style.display = 'block';
                input.value = '';
                input.focus();
            }
        }

        function enterArchiveFromLogin() {
            // 进入归档系统（完整功能）
            document.getElementById('passwordOverlay').style.display = 'none';
            document.getElementById('mainContent').classList.add('visible');
            // 进入主界面后强制要求设置昵称（与 enter() 一致：未设过才弹，老用户已设过不弹）
            if (typeof ensureNickname === 'function') ensureNickname(true);
            // 已设过昵称的用户在此补记登录打卡（首设用户由 ensureNickname 保存后记录）
            if (localStorage.getItem('TFJL_UserName')) {
                if (typeof recordLoginEvent === 'function') recordLoginEvent();
            }
        }

        function updateProjectList1() {
            const cat = document.getElementById('categorySelector1').value;
            const sel = document.getElementById('projectSelector1');
            sel.innerHTML = '<option value="">-- 选择项目 --</option>';
            // 添加"新增项目"选项
            const newOpt = document.createElement('option');
            newOpt.value = '__NEW__';
            newOpt.textContent = '➕ 新建项目';
            newOpt.style.color = '#4ade80';
            newOpt.style.fontWeight = 'bold';
            sel.appendChild(newOpt);
            if (!cat) return;

            loadProjectListFromDB().then(allProjects => {
                window.projects = allProjects;
                allProjects.filter(p => p.category === cat).forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    sel.appendChild(opt);
                });
            }).catch(e => console.error('加载项目列表失败:', e));
        }

        function loadProjectSelectorData() {
            const catSel = document.getElementById('categorySelector1');
            if (!catSel) return;
            // 使用默认分类（categories 变量可能在后面定义）
            const defaultCategories = ['默认分类', '暗月', '寒冰', '漩涡', '深海', '临时'];
            defaultCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catSel.appendChild(opt);
            });
            // 添加创建分类选项
            const newCatOpt = document.createElement('option');
            newCatOpt.value = '__NEW_CAT__';
            newCatOpt.textContent = '➕ 创建分类';
            newCatOpt.style.color = '#9c27b0';
            newCatOpt.style.fontWeight = 'bold';
            catSel.appendChild(newCatOpt);
        }

        async function handleCategoryChange() {
            // 🔴 2026-09-10 共享模式：切换分类时只刷新共享项目下拉（不创建/不写本地）
            if ((window.__projectScope || 'local') === 'shared') {
                const catSel = document.getElementById('categorySelector1');
                const cat = catSel ? catSel.value : '';
                currentProjectCategory = cat || '默认分类';
                if (typeof _hubFillProjectSelector === 'function') {
                    _hubFillProjectSelector(window.__sharedProjects || [], currentProjectCategory, document.getElementById('projectSelector1'));
                }
                if (cat && typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('切换合作分类:' + cat);
                return;
            }
            const catSel = document.getElementById('categorySelector1');
            const selectedValue = catSel.value;
            
            if (selectedValue === '__NEW_CAT__') {
                const newCategoryName = await askTextInputAsync({ title: '新建分类', label: '请输入新分类名称：' });
                if (!newCategoryName || !newCategoryName.trim()) {
                    // 用户取消，恢复之前的选中状态
                    if (currentProjectCategory) {
                        catSel.value = currentProjectCategory;
                    } else {
                        catSel.value = '';
                    }
                    return;
                }
                const catName = newCategoryName.trim();
                if (categories.includes(catName)) {
                    alert('❌ 该分类已存在！');
                    if (currentProjectCategory) {
                        catSel.value = currentProjectCategory;
                    } else {
                        catSel.value = '';
                    }
                    return;
                }
                categories.push(catName);
                localStorage.setItem('tfjl_categories', JSON.stringify(categories));
                refreshProjectSelectors();
                const sel = document.getElementById('categorySelector1');
                if (sel) sel.value = catName;
                alert(`✅ 新分类"${catName}"创建成功！`);
            } else {
                updateProjectList1();
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadProjectSelectorData();
        });

        // 记录登录（现在不记录单独的登录统计，用户数在访问时已处理）
        function recordLogin() {
            // 标记设备已登录过，用于下次识别
            markDeviceAsLoggedIn();
        }

        // 标记设备已登录过
        function markDeviceAsLoggedIn() {
            localStorage.setItem('TFJL_Has_Logged_In_Before', 'true');
        }
        