
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
        // 预设：只留用户认可的 深海 / 极光 / 星河（浅色组已删除）。
        // 另支持：内置背景图（builtin:）、圆盘选色器多选渐变（grad:）、上传图片（img:/custom:）。
        const BG_PRESETS = {
            anime: [
                { name: '深海', css: 'linear-gradient(135deg,#2b5876 0%,#4e4376 100%)' }
            ],
            cool: [
                { name: '极光', css: 'linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)', anim: 'aurora' },
                { name: '星河', css: 'radial-gradient(ellipse at 50% 0%,#1b2735 0%,#090a0f 100%)', anim: 'stars' }
            ]
        };
        // 内置默认背景图（固化在仓库里，随网页分发；用户一键选用，不占本机存储）
        // 格式：{ name: '名字', url: '相对/绝对图片地址' }。用户给图后在此追加即可（目标 5 个：深海/极光/星河 + 2 张图）
        const BG_BUILTIN = [];
        // 随机渐变用的协调浅色板
        const SOFT_PALETTE = ['#e0eafc','#cfdef3','#e6e6fa','#d8d8f6','#ffeef8','#ffd6e8','#e8f5e9','#c8e6c9','#fdfbfb','#ebedee','#fbc2eb','#a6c1ee','#a1c4fd','#c2e9fb','#fff1eb','#ace0f9'];
        let bgSelectedColors = [];
        const BG_KEY = 'TFJL_User_BG';
        const BG_OVERLAY_ON = 'TFJL_BG_OVERLAY_ON';

        window.__bgToggleOverlay = function (on) {
            localStorage.setItem(BG_OVERLAY_ON, on ? '1' : '0');
            applyUserBackground();
            try { if (typeof showToast === 'function') showToast(on ? '✅ 已开启背景压暗' : '已关闭背景压暗'); } catch (e) {}
        };

        function getBgOverlayForValue(val) {
            if (!val || val === 'default') return 0;
            if (val.indexOf('grad:') === 0) return 0.35;
            if (val.indexOf('custom:') === 0) return 0.4;
            if (val.indexOf('img:') === 0) return 0.4;
            if (val.indexOf('builtin:') === 0) return 0.3;
            if (val.indexOf('preset:') === 0) {
                const key = val.slice(7);
                for (const cat of Object.keys(BG_PRESETS)) {
                    const p = BG_PRESETS[cat].find(function (x) { return x.name === key; });
                    if (p) return key === '深海' ? 0.12 : 0;
                }
            }
            return 0;
        }

        // 背景模糊程度（0~100 档位，作用在独立背景层 #bgLayer 上，界面内容不受影响）
        // 0 = 背景完全清晰；100 = 模糊最重（约 35px），背景基本只剩色块，卡槽/文字最清楚
        const BG_BLUR_KEY = 'TFJL_BG_BLUR';
        function blurLevelToPx(v) { return Math.round((Math.max(0, Math.min(100, v)) / 100) * 35 * 10) / 10; }
        function applyBgBlur() {
            const raw = localStorage.getItem(BG_BLUR_KEY);
            const lv = raw === null ? 0 : (parseFloat(raw) || 0);
            const px = blurLevelToPx(lv);
            document.documentElement.style.setProperty('--bg-blur', px + 'px');
            document.body.style.setProperty('--bg-blur', px + 'px');
            return lv;
        }
        window.__bgSetBlur = function (v) {
            const lv = Math.max(0, Math.min(100, Math.round(parseFloat(v) || 0)));
            localStorage.setItem(BG_BLUR_KEY, String(lv));
            applyBgBlur();
            const lab = document.getElementById('bgBlurVal');
            if (lab) lab.textContent = lv + '（' + blurLevelToPx(lv) + 'px）';
        };

        // ===== 上传背景图片库（IndexedDB 存 blob，避免 localStorage 爆配额） =====
        const BG_DB = 'tfjl-bg-images';
        const BG_STORE = 'images';
        let bgImgUrl = null, bgImgId = null, bgMigrateTried = false, bgThumbUrls = [];

        function bgOpenDb() {
            return new Promise(function (res, rej) {
                if (!window.indexedDB) { rej('no idb'); return; }
                const req = indexedDB.open(BG_DB, 1);
                req.onupgradeneeded = function () {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(BG_STORE)) db.createObjectStore(BG_STORE, { keyPath: 'id' });
                };
                req.onsuccess = function () { res(req.result); };
                req.onerror = function () { rej(req.error); };
            });
        }
        function bgIdb(mode, fn) {
            return bgOpenDb().then(function (db) {
                return new Promise(function (res, rej) {
                    const tx = db.transaction(BG_STORE, mode);
                    const store = tx.objectStore(BG_STORE);
                    let out;
                    try { out = fn(store); } catch (e) { rej(e); return; }
                    tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
                    tx.onerror = function () { rej(tx.error); };
                });
            });
        }
        function bgSaveImage(blob, name) {
            const rec = { id: 'bg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: name || '背景图', ts: Date.now(), blob: blob };
            return bgIdb('readwrite', function (s) { return s.put(rec); }).then(function () { return rec.id; });
        }
        function bgGetImage(id) { return bgIdb('readonly', function (s) { return s.get(id); }); }
        function bgAllImages() {
            return bgIdb('readonly', function (s) { return s.getAll(); })
                .then(function (r) { return (r || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); });
        }
        function bgDelImage(id) { return bgIdb('readwrite', function (s) { return s.delete(id); }); }
        function bgRevokeUrl() {
            if (bgImgUrl) { try { URL.revokeObjectURL(bgImgUrl); } catch (e) {} }
            bgImgUrl = null; bgImgId = null;
        }
        function bgApplyImage(id) {
            return bgGetImage(id).then(function (rec) {
                if (!rec || !rec.blob) throw new Error('image not found');
                bgRevokeUrl();
                bgImgUrl = URL.createObjectURL(rec.blob);
                bgImgId = id;
                const layer = document.getElementById('bgLayer') || document.body;
                layer.classList.add('bg-custom');
                layer.style.background = '';
                layer.style.backgroundImage = 'url(' + bgImgUrl + ')';
            });
        }
        // 老数据（custom:<dataURL>）迁移进图片库，之后统一走 img:<id>
        function migrateLegacyCustomBg() {
            const val = (localStorage.getItem(BG_KEY) || '').trim();
            if (val.indexOf('custom:') !== 0) return;
            if (localStorage.getItem('TFJL_BG_MIGRATED') === '1') return;
            const dataUrl = val.slice(7);
            if (!dataUrl) return;
            fetch(dataUrl).then(function (r) { return r.blob(); })
                .then(function (blob) { return bgSaveImage(blob, '旧背景'); })
                .then(function (id) {
                    localStorage.setItem(BG_KEY, 'img:' + id);
                    localStorage.setItem('TFJL_BG_MIGRATED', '1');
                    applyUserBackground();
                }).catch(function () { localStorage.setItem('TFJL_BG_MIGRATED', '1'); });
        }

        function applyUserBackground() {
            if (!bgMigrateTried) { bgMigrateTried = true; try { migrateLegacyCustomBg(); } catch (e) {} }
            // 背景统一画在独立层 #bgLayer 上（支持 filter 模糊）；body 只留兜底底色
            const layer = document.getElementById('bgLayer') || document.body;
            document.body.classList.remove('bg-custom', 'bg-anim-aurora', 'bg-anim-neon', 'bg-anim-stars');
            layer.classList.remove('bg-custom', 'bg-anim-aurora', 'bg-anim-neon', 'bg-anim-stars');
            layer.style.background = '';
            layer.style.backgroundImage = '';
            layer.style.backgroundAttachment = '';
            const val = (localStorage.getItem(BG_KEY) || '').trim();
            if (!val || val === 'default') { bgRevokeUrl(); applyBgBlur(); return; }
            if (val.indexOf('img:') !== 0) bgRevokeUrl();
            if (val.indexOf('img:') === 0) {
                const id = val.slice(4);
                layer.classList.add('bg-custom');
                if (bgImgId === id && bgImgUrl) {
                    layer.style.backgroundImage = 'url(' + bgImgUrl + ')';
                } else {
                    bgApplyImage(id).catch(function () {});
                }
            } else if (val.indexOf('preset:') === 0) {
                const key = val.slice(7);
                let css = null, anim = null;
                for (const cat of Object.keys(BG_PRESETS)) {
                    const p = BG_PRESETS[cat].find(function (x) { return x.name === key; });
                    if (p) { css = p.css; anim = p.anim; break; }
                }
                if (css) {
                    layer.style.background = css;
                    if (anim) layer.classList.add('bg-anim-' + anim);
                }
            } else if (val.indexOf('custom:') === 0) {
                layer.classList.add('bg-custom');
                layer.style.backgroundImage = 'url(' + val.slice(7) + ')';
            } else if (val.indexOf('builtin:') === 0) {
                layer.classList.add('bg-custom');
                layer.style.backgroundImage = 'url(' + val.slice(8) + ')';
            } else if (val.indexOf('grad:') === 0) {
                layer.style.background = val.slice(5);
            }
            let ov = 0;
            if (localStorage.getItem(BG_OVERLAY_ON) === '1') ov = getBgOverlayForValue(val);
            document.body.style.setProperty('--bg-overlay', String(ov));
            applyBgBlur();
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
                    let dataUrl = '';
                    try { dataUrl = canvas.toDataURL('image/jpeg', 0.8); } catch (e) { dataUrl = reader.result; }
                    const fallback = function () {
                        localStorage.setItem(BG_KEY, 'custom:' + dataUrl);
                        applyUserBackground();
                        try { if (typeof showToast === 'function') showToast('✅ 背景已更新（未进图片库）'); } catch (e) {}
                    };
                    if (!canvas.toBlob) { fallback(); return; }
                    canvas.toBlob(function (blob) {
                        if (!blob) { fallback(); return; }
                        bgSaveImage(blob, file.name).then(function (id) {
                            localStorage.setItem(BG_KEY, 'img:' + id);
                            applyUserBackground();
                            if (typeof renderBgImageList === 'function') renderBgImageList();
                            try { if (typeof showToast === 'function') showToast('✅ 已保存到我的背景图'); } catch (e) {}
                        }).catch(fallback);
                    }, 'image/jpeg', 0.8);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }

        window.__setBgBuiltin = function (url) {
            localStorage.setItem(BG_KEY, 'builtin:' + url);
            applyUserBackground();
            try { if (typeof showToast === 'function') showToast('✅ 背景已切换'); } catch (e) {}
        };

        window.__setBgPreset = function (name) {
            localStorage.setItem(BG_KEY, name === 'default' ? 'default' : 'preset:' + name);
            applyUserBackground();
            try { if (typeof showToast === 'function') showToast('✅ 背景已切换'); } catch (e) {}
        };
        window.__bgFile = function (file) { handleBgFile(file); };

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
            const layer = document.getElementById('bgLayer') || document.body;
            layer.style.background = buildGrad(bgSelectedColors);
            document.body.style.setProperty('--bg-overlay', localStorage.getItem(BG_OVERLAY_ON) === '1' ? '0.35' : '0');
        }
        window.__bgRemoveColor = function (i) {
            bgSelectedColors.splice(i, 1);
            renderBgColorList();
            if (bgSelectedColors.length) previewBgGrad(); else applyUserBackground();
        };
        // ---------- 我的背景图：切换 / 删除（IndexedDB 图片库） ----------
        function renderBgImageList() {
            const box = document.getElementById('bgImageList');
            if (!box) return;
            const cur = (localStorage.getItem(BG_KEY) || '').trim();
            try { bgThumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); } catch (e) {}
            bgThumbUrls = [];
            bgAllImages().then(function (list) {
                if (!list.length) {
                    box.innerHTML = '<span style="font-size:0.72rem;color:rgba(255,255,255,0.4);">还没有保存的背景图，点下方「📤 上传并保存」添加</span>';
                    return;
                }
                box.innerHTML = '';
                list.forEach(function (rec) {
                    const u = URL.createObjectURL(rec.blob);
                    bgThumbUrls.push(u);
                    const name = String(rec.name || '背景图').replace(/[<>&"']/g, '');
                    const active = cur === 'img:' + rec.id;
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'position:relative;width:78px;text-align:center;';
                    wrap.innerHTML =
                        '<div onclick="window.__bgUseImage(\'' + rec.id + '\')" title="点击切换到这张背景" style="width:78px;height:52px;border-radius:8px;background-image:url(' + u + ');background-size:cover;background-position:center;border:2px solid ' + (active ? '#ffd700' : 'rgba(255,255,255,0.28)') + ';box-shadow:' + (active ? '0 0 10px rgba(255,215,0,0.55)' : 'none') + ';cursor:pointer;"></div>' +
                        '<button onclick="window.__bgDeleteImage(\'' + rec.id + '\')" title="删除这张背景图" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e53935;border:none;color:#fff;font-size:0.66rem;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.5);">✕</button>' +
                        '<div style="font-size:0.6rem;color:' + (active ? '#ffd700' : 'rgba(255,255,255,0.55)') + ';margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (active ? '使用中 ' : '') + name + '</div>';
                    box.appendChild(wrap);
                });
            }).catch(function () {
                box.innerHTML = '<span style="font-size:0.72rem;color:rgba(255,255,255,0.4);">读取背景图失败</span>';
            });
        }
        window.__bgUseImage = function (id) {
            localStorage.setItem(BG_KEY, 'img:' + id);
            applyUserBackground();
            renderBgImageList();
            try { if (typeof showToast === 'function') showToast('✅ 已切换背景'); } catch (e) {}
        };
        window.__bgDeleteImage = function (id) {
            if (!window.confirm('删除这张背景图？（只会从本机图片库移除）')) return;
            const cur = (localStorage.getItem(BG_KEY) || '').trim();
            bgDelImage(id).then(function () {
                if (bgImgId === id) bgRevokeUrl();
                if (cur === 'img:' + id) { localStorage.setItem(BG_KEY, 'default'); applyUserBackground(); }
                renderBgImageList();
                try { if (typeof showToast === 'function') showToast('🗑️ 已删除'); } catch (e) {}
            }).catch(function () { try { if (typeof showToast === 'function') showToast('删除失败'); } catch (e) {} });
        };

        window.__bgClearColors = function () { bgSelectedColors = []; renderBgColorList(); applyUserBackground(); };
        window.__bgApplyGrad = function () {
            if (bgSelectedColors.length < 2) { try { if (typeof showToast === 'function') showToast('至少选 2 个颜色'); } catch (e) {} return; }
            const css = buildGrad(bgSelectedColors);
            localStorage.setItem(BG_KEY, 'grad:' + css);
            applyUserBackground();
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
            // 内置配色：不分组标题，深海/极光/星河 一排显示，省空间
            const rows = [];
            rows.push('<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin:10px 0 6px;">🌌 内置背景</div>');
            rows.push('<div style="display:flex;flex-wrap:wrap;gap:6px;">');
            ['anime', 'cool'].forEach(function (cat) {
                BG_PRESETS[cat].forEach(function (p) {
                    rows.push('<button onclick="window.__setBgPreset(\'' + p.name + '\')" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:' + p.css + ';color:' + (p.anim ? '#fff' : '#1a1a2e') + ';cursor:pointer;font-size:0.8rem;text-shadow:' + (p.anim ? '0 1px 2px rgba(0,0,0,0.5)' : 'none') + ';">' + p.name + '</button>');
                });
            });
            rows.push('</div>');
            if (BG_BUILTIN.length) {
                rows.push('<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin:12px 0 6px;">🖼️ 内置背景图</div>');
                BG_BUILTIN.forEach(function (b) {
                    rows.push('<button onclick="window.__setBgBuiltin(\'' + b.url + '\')" style="margin:4px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background-image:url(' + b.url + ');background-size:cover;background-position:center;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.85);cursor:pointer;font-size:0.8rem;min-width:96px;min-height:40px;">' + b.name + '</button>');
                });
            }
            const overlayOn = localStorage.getItem(BG_OVERLAY_ON) === '1';
            const blurVal = (function () { const r = localStorage.getItem(BG_BLUR_KEY); return r === null ? 0 : (parseFloat(r) || 0); })();
            const modal = document.createElement('div');
            modal.id = 'bgSettingsModal';
            modal.style.cssText = 'position:fixed;top:78px;right:18px;width:332px;max-width:92vw;z-index:100000;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,215,0,0.4);border-radius:16px;padding:14px 16px 16px;max-height:86vh;overflow:auto;box-shadow:0 12px 44px rgba(0,0,0,0.6);';
            modal.innerHTML = '' +
                '<div id="bgSettingsHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:move;user-select:none;">' +
                '  <span style="color:#ffd700;font-size:1.1rem;font-weight:bold;">🎨 背景设置</span>' +
                '  <button onclick="document.getElementById(\'bgSettingsModal\').remove()" title="关闭" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;">✕</button>' +
                '</div>' +
                '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.82rem;color:rgba(255,255,255,0.85);cursor:pointer;">' +
                '  <input type="checkbox" id="bgOverlaySwitch"' + (overlayOn ? ' checked' : '') + ' onchange="window.__bgToggleOverlay(this.checked)">' +
                '  背景协调压暗（开启后浅色背景自动压暗，深色不影响）</label>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.78rem;color:rgba(255,255,255,0.85);">' +
                '  <span style="flex-shrink:0;">背景模糊</span>' +
                '  <input type="range" id="bgBlurRange" min="0" max="100" step="1" value="' + blurVal + '" oninput="window.__bgSetBlur(this.value)" style="flex:1;min-width:0;">' +
                '  <span id="bgBlurVal" style="min-width:56px;text-align:right;color:#ffd700;">' + blurVal + '（' + blurLevelToPx(blurVal) + 'px）</span>' +
                '</div>' +
                '<div style="color:rgba(255,255,255,0.5);font-size:0.74rem;margin-bottom:6px;">上传图片会自动压缩到最长边 1920px（无需操心尺寸），存在本机、每台设备独立。</div>' +
                rows.join('') +
                '  <div style="border-top:1px solid rgba(255,255,255,0.12);margin-top:14px;padding-top:12px;">' +
                '    <div style="color:rgba(255,255,255,0.6);font-size:0.78rem;margin-bottom:8px;">📁 我的背景图（点缩略图切换，右上角 ✕ 删除）</div>' +
                '    <div id="bgImageList" style="display:flex;flex-wrap:wrap;gap:10px;"></div>' +
                '  </div>' +
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
                '      📤 上传并保存<input type="file" accept="image/*" style="display:none;" onchange="window.__bgFile(this.files[0])">' +
                '    </label>' +
                '    <button onclick="window.__setBgPreset(\'default\')" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.85rem;">↺ 恢复默认</button>' +
                '    <button onclick="toggleVisualEffects()" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.85rem;">✨ 炫酷特效</button>' +
                '  </div>' +
                '  <div style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.72rem;">提示：选「炫酷」预设并开特效，粒子叠在背景上更带感；浅色背景可能让部分浅色文字变淡，可勾选上方「背景协调压暗」。</div>';
            document.body.appendChild(modal);
            // 悬浮窗拖拽（仅标题栏拖动，点外部不关闭，需手动点 ✕）
            try {
                const hdr = document.getElementById('bgSettingsHeader');
                let dragging = false, offX = 0, offY = 0;
                function startDrag(cx, cy) {
                    dragging = true;
                    const r = modal.getBoundingClientRect();
                    offX = cx - r.left; offY = cy - r.top;
                    modal.style.right = 'auto'; modal.style.bottom = 'auto';
                }
                hdr.addEventListener('mousedown', function (e) { startDrag(e.clientX, e.clientY); e.preventDefault(); });
                window.addEventListener('mousemove', function (e) { if (dragging) { modal.style.left = (e.clientX - offX) + 'px'; modal.style.top = (e.clientY - offY) + 'px'; } });
                window.addEventListener('mouseup', function () { dragging = false; });
                hdr.addEventListener('touchstart', function (e) { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: true });
                window.addEventListener('touchmove', function (e) { if (dragging) { const t = e.touches[0]; modal.style.left = (t.clientX - offX) + 'px'; modal.style.top = (t.clientY - offY) + 'px'; } }, { passive: true });
                window.addEventListener('touchend', function () { dragging = false; });
            } catch (e) {}
            renderBgColorList();
            renderBgImageList();
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
        