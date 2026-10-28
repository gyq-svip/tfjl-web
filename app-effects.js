
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
        // 内置默认背景图（固化在仓库里，随网页分发；用户一键选用，不占本机存储；可删除）
        // 用户指定的 6 张图（已复制到仓库 bg/ 目录）：城市 / 卡通美女 / 美女1~3 / 星空
        const BG_BUILTIN = [
            { name: '城市', url: 'bg/bg-city.jpg' },
            { name: '卡通美女', url: 'bg/bg-cartoon.jpg' },
            { name: '美女1', url: 'bg/bg-girl1.jpg' },
            { name: '美女2', url: 'bg/bg-girl2.jpg' },
            { name: '美女3', url: 'bg/bg-girl3.jpg' },
            { name: '星空', url: 'bg/bg-starry.jpg' }
        ];
        // 被用户删除的内置图（存 url 列表），渲染时过滤
        function bgHiddenBuiltins() {
            try { return JSON.parse(localStorage.getItem('TFJL_BG_HIDE_BUILTIN') || '[]'); } catch (e) { return []; }
        }
        window.__bgHideBuiltin = function (url) {
            if (!window.confirm('删除这张内置背景图？（本机不再显示，重装/清缓存可恢复）')) return;
            const list = bgHiddenBuiltins();
            if (list.indexOf(url) < 0) list.push(url);
            localStorage.setItem('TFJL_BG_HIDE_BUILTIN', JSON.stringify(list));
            if ((localStorage.getItem(BG_KEY) || '').trim() === 'builtin:' + url) {
                localStorage.setItem(BG_KEY, 'default');
                applyUserBackground();
            }
            if (typeof openBackgroundSettings === 'function') openBackgroundSettings();
        };
        window.__bgCloseSettings = function () {
            try { bgRevokeBuiltinThumbs(); } catch (e) {} // 释放缩略图 blob
            try { bgRevokeVideoThemeThumbs(); } catch (e) {} // 释放内置视频封面 blob
            const m = document.getElementById('bgSettingsModal');
            if (m) m.remove();
        };
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
            if (!val || val === 'default') return 0.3; // 默认背景=内置「美女2」，按内置图系数压暗
            if (val.indexOf('grad:') === 0) return 0.35;
            if (val.indexOf('custom:') === 0) return 0.4;
            if (val.indexOf('img:') === 0) return 0.4;
            if (val.indexOf('video:') === 0) return 0.35;
            if (val.indexOf('bvid:') === 0) return 0.35;
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

        // 主面板毛玻璃层（.container 区域，出战选择/卡槽/手牌那块）：模糊 + 底色浓度两个维度都可调
        // 模糊 0 = 背景清晰；100 = 糊掉（约 30px）。底色 0 = 完全不遮挡（背景原样可见）；100 = 最浓（约 0.45 白）
        const BG_BLUR_KEY = 'TFJL_BG_BLUR';
        const BG_FROST_KEY = 'TFJL_FROST_ALPHA';
        function blurLevelToPx(v) { return Math.round((Math.max(0, Math.min(100, v)) / 100) * 30 * 10) / 10; }
        function frostLevelToAlpha(v) { return Math.round((Math.max(0, Math.min(100, v)) / 100) * 45) / 100; }
        function readLevel(key, def) {
            const raw = localStorage.getItem(key);
            // 🔴 2026-09-18 支持默认值：面板底色默认 30%、模糊默认 0%；用户拖过滑条后存了值，永远用用户的
            return raw === null ? (def || 0) : (parseFloat(raw) || 0);
        }
        function applyBgBlur() {
            const lv = readLevel(BG_BLUR_KEY);
            const fl = readLevel(BG_FROST_KEY, 30);
            const px = blurLevelToPx(lv);
            const alpha = frostLevelToAlpha(fl);
            // 毛玻璃做在独立固定层上（与主面板同宽、垫在背景上/内容下）。
            // 🔴 不能直接给 .container 加 backdrop-filter：那会让它成为内部 fixed 元素（停靠栏/卡框）的定位基准，布局全乱。
            let frost = document.getElementById('panelFrost');
            if (!frost) {
                frost = document.createElement('div');
                frost.id = 'panelFrost';
                frost.style.cssText = 'position:fixed;top:0;bottom:0;left:50%;transform:translateX(-50%);width:min(1400px,100%);z-index:-1;pointer-events:none;border-radius:18px;';
                document.body.appendChild(frost);
            }
            frost.style.backdropFilter = px > 0 ? 'blur(' + px + 'px)' : '';
            frost.style.webkitBackdropFilter = px > 0 ? 'blur(' + px + 'px)' : '';
            frost.style.background = alpha > 0 ? 'rgba(255,255,255,' + alpha + ')' : 'transparent';
            // 「面板底色」同时控制出战选择面板（.selection-area）的透明度：0=全透明看得见背景，100=原来的白底+毛玻璃
            const f = Math.max(0, Math.min(100, fl)) / 100;
            document.querySelectorAll('.selection-area').forEach(function (sa) {
                sa.style.background = 'rgba(255,255,255,' + (0.1 * f).toFixed(3) + ')';
                const blur = f > 0 ? 'blur(' + Math.round(10 * f) + 'px)' : 'none';
                sa.style.backdropFilter = blur;
                sa.style.webkitBackdropFilter = blur;
            });
            // 🔴 2026-09-18 头部黑色跟随「面板底色」滑条（应乘客要求重做）：只改颜色透明度+背景模糊，
            //    布局/sticky 完全不动。0% ≈ 几乎全透看背景；100% = 原始不透明深色渐变原样。
            const hdr = document.getElementById('fixedHeader');
            if (hdr) {
                const a = (0.08 + 0.92 * f).toFixed(3);
                hdr.style.background = 'linear-gradient(135deg,rgba(15,15,35,' + a + '),rgba(26,26,46,' + a + '),rgba(22,33,62,' + a + '))';
                const hBlur = f > 0 ? 'blur(' + Math.round(10 * f) + 'px)' : 'none';
                hdr.style.backdropFilter = hBlur;
                hdr.style.webkitBackdropFilter = hBlur;
            }
            // 项目工具栏行（本地/深海/王城低配版那排）同样跟随底色：原来 0.05 白偏黑不协调，
            // 现在 0%=原样，100%=更亮的毛玻璃条，与主面板一致
            const pSel = document.getElementById('projectScopeSelector');
            const prow = pSel ? pSel.parentElement : null;
            if (prow) {
                prow.style.background = 'rgba(255,255,255,' + (0.05 + 0.2 * f).toFixed(3) + ')';
                const pBlur = f > 0 ? 'blur(' + Math.round(10 * f) + 'px)' : 'none';
                prow.style.backdropFilter = pBlur;
                prow.style.webkitBackdropFilter = pBlur;
            }
            _syncScrollableSpacer();
            return lv;
        }
        function _syncScrollableSpacer() {
            const hdr = document.getElementById('fixedHeader');
            const sc = document.getElementById('scrollableContent');
            if (!hdr) return;
            if (!sc) return;
            const rect = hdr.getBoundingClientRect();
            // 用 header 的渲染位置计算；若主内容区尚未显示（rect=0）则回退到样式值
            const fallbackTop = (parseFloat(hdr.style.top) ? parseFloat(hdr.style.top) : 20) + hdr.offsetHeight;
            const top = rect.bottom ? rect.bottom : fallbackTop;
            // 让公告栏以下区域独立滚动，滚动条从公告栏下方开始，头部完全固定
            sc.style.position = 'absolute';
            sc.style.top = top + 'px';
            // 不用 transform，否则 scrollableContent 内的 position:fixed 子元素会相对于它定位
            sc.style.left = '10px';
            sc.style.right = '10px';
            sc.style.width = 'auto';
            sc.style.maxWidth = '1400px';
            sc.style.margin = '0 auto';
            sc.style.transform = 'none';
            sc.style.bottom = '0px';
            sc.style.overflowY = 'auto';
            sc.style.overflowX = 'hidden';
            sc.style.boxSizing = 'border-box';
            sc.style.zIndex = 'auto';
            sc.style.paddingTop = '0px';
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        }
        window.addEventListener('resize', _syncScrollableSpacer);
        window.addEventListener('load', _syncScrollableSpacer);
        // 主内容区显示/隐藏时重新计算（登录前 hidden，显示后 header 才有实际高度）
        (function () {
            const mc = document.getElementById('mainContent');
            if (!mc) return;
            if (!window.MutationObserver) return;
            const obs = new MutationObserver(_syncScrollableSpacer);
            obs.observe(mc, { attributes: true, attributeFilter: ['class'] });
        })();
        window.__bgSetBlur = function (v) {
            const lv = Math.max(0, Math.min(100, Math.round(parseFloat(v) || 0)));
            localStorage.setItem(BG_BLUR_KEY, String(lv));
            applyBgBlur();
            const lab = document.getElementById('bgBlurVal');
            if (lab) lab.textContent = lv + '%';
        };
        window.__bgSetFrost = function (v) {
            const fl = Math.max(0, Math.min(100, Math.round(parseFloat(v) || 0)));
            localStorage.setItem(BG_FROST_KEY, String(fl));
            applyBgBlur();
            const lab = document.getElementById('bgFrostVal');
            if (lab) lab.textContent = fl + '%';
        };

        // ===== 上传背景图片库（IndexedDB 存 blob，避免 localStorage 爆配额） =====
        const BG_DB = 'tfjl-bg-images';
        const BG_STORE = 'images';
        // 🔴 2026-09-20 内置背景图本地缓存（独立 store，不混进"我的背景图"列表）：
        //    首次联网拉到后把图片写进 IndexedDB（浏览器 / WebView2 都会落盘），此后永远本地读取、断网可用，
        //    **不再每次启动/每次打开设置窗都从远端拉**。桌面版没有 SW，这一步就是它对"缓存到本地磁盘"的正解。
        const BG_ASSET_STORE = 'assets';
        let bgBuiltinBlobUrl = null;      // 当前内置图使用的本地 blob URL（切换时 revoke，防泄漏）
        let bgBuiltinThumbUrls = [];      // 设置窗里内置图缩略图的 blob URL（关闭/重开时 revoke）
        let bgImgUrl = null, bgImgId = null, bgMigrateTried = false, bgThumbUrls = [];
        let bgVideoUrl = null, bgVideoId = null;

        // 动态视频背景（MP4/WebM，存 IndexedDB 媒体库，循环播放；声音独立开关，默认开声）
        const BG_VIDEO_MUTE_KEY = 'TFJL_BG_VIDEO_MUTE'; // '1'=静音 '0'=有声（默认开声，音量随系统可调）
        const BG_VIDEO_VOL_KEY = 'TFJL_BG_VIDEO_VOL';   // 0~10，默认 5（即 volume=0.5）
        function bgVideoMuted() {
            const raw = localStorage.getItem(BG_VIDEO_MUTE_KEY);
            return raw === null ? false : raw !== '0'; // 默认（无记录）= 开声
        }
        function bgVideoVol() {
            const raw = localStorage.getItem(BG_VIDEO_VOL_KEY);
            const v = raw === null ? 5 : (parseInt(raw, 10) || 0);
            return Math.max(0, Math.min(10, v)) / 10;
        }
        function ensureBgVideo() {
            let v = document.getElementById('bgVideo');
            if (!v) {
                v = document.createElement('video');
                v.id = 'bgVideo';
                v.setAttribute('autoplay', '');
                v.setAttribute('loop', '');
                v.setAttribute('playsinline', '');
                v.style.cssText = 'position:fixed;top:-40px;left:-40px;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;z-index:-2;pointer-events:none;';
                document.body.appendChild(v);
            }
            return v;
        }
        // 应用声音开关状态；音量大小可调（0~10 档，默认 5）
        function bgApplyVideoSound(v) {
            const muted = bgVideoMuted();
            v.muted = muted;
            v.volume = bgVideoVol();
            return muted;
        }
        // 自动播放策略兜底：用户上次开着声音、本次页面加载无交互 → play() 会被浏览器拦截。
        // 降级：先静音播上，监听一次性首次交互（点击/按键）再恢复声音。
        function bgOnceInteract(fn) {
            const h = function () {
                window.removeEventListener('pointerdown', h, true);
                window.removeEventListener('keydown', h, true);
                try { fn(); } catch (e) {}
            };
            window.addEventListener('pointerdown', h, true);
            window.addEventListener('keydown', h, true);
        }
        function stopBgVideo() {
            const v = document.getElementById('bgVideo');
            if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
            if (bgVideoUrl) { try { URL.revokeObjectURL(bgVideoUrl); } catch (e) {} }
            if (bgBuiltinVideoUrl) { try { URL.revokeObjectURL(bgBuiltinVideoUrl); } catch (e) {} }
            bgVideoUrl = null; bgVideoId = null;
            bgBuiltinVideoUrl = null; bgBuiltinVideoThemeId = null;
        }
        function bgApplyVideo(id) {
            return bgGetImage(id).then(function (rec) {
                if (!rec || !rec.blob) throw new Error('video not found');
                stopBgVideo();
                bgVideoUrl = URL.createObjectURL(rec.blob);
                bgVideoId = id;
                const v = ensureBgVideo();
                bgApplyVideoSound(v);
                v.src = bgVideoUrl;
                const p = v.play();
                if (p && p.catch) p.catch(function () {
                    if (!bgVideoMuted()) {
                        v.muted = true; // 先静音保证画面播上
                        const p2 = v.play(); if (p2 && p2.catch) p2.catch(function () {});
                        bgOnceInteract(function () { // 首次交互后恢复声音
                            const vv = document.getElementById('bgVideo');
                            if (vv && bgVideoId) { vv.muted = false; const p3 = vv.play(); if (p3 && p3.catch) p3.catch(function () {}); }
                        });
                    }
                });
            });
        }
        // ===== 内置视频主题库（视频/封面存 Gitee Releases，清单存公开 Gist）=====
        // 清单 Gist：管理员在后台「主题上传」页首次上传时自动创建，ID 存本机 localStorage；
        // 同时把 ID 回填到下方 BG_THEMES_GIST_ID 常量（新用户直接可用）。
        const BG_THEMES_GIST_KEY = 'TFJL_BG_THEMES_GIST_ID';
        const BG_THEMES_HIDE_KEY = 'TFJL_BG_THEMES_HIDE';
        const BG_THEMES_GIST_ID = ''; // 例：'a45529be...'（创建后由管理员回填）
        const BG_THEMES_FILE = 'bg-themes.json';
        const BG_THEMES_CACHE_KEY = 'TFJL_BG_THEMES_CACHE';
        function bgThemesGistId() {
            try { return localStorage.getItem(BG_THEMES_GIST_KEY) || BG_THEMES_GIST_ID; } catch (e) { return BG_THEMES_GIST_ID; }
        }
        // 拉取内置视频清单：优先 1 小时内的本地缓存；失败回退旧缓存；彻底失败返回空数组
        function bgThemesLoad(force) {
            const cached = (function () {
                try {
                    const c = JSON.parse(localStorage.getItem(BG_THEMES_CACHE_KEY) || 'null');
                    if (c && Array.isArray(c.themes) && Date.now() - (c.ts || 0) < 3600 * 1000) return c;
                } catch (e) {}
                return null;
            })();
            if (cached && !force) return Promise.resolve(cached.themes);
            const gid = bgThemesGistId();
            if (!gid) return Promise.resolve((cached && cached.themes) || []);
            return fetch('https://api.github.com/gists/' + gid, { headers: { 'Accept': 'application/vnd.github.v3+json' } })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (g) {
                    const f = g && g.files && g.files[BG_THEMES_FILE];
                    if (!f || !f.content) throw new Error('no file');
                    const parsed = JSON.parse(f.content);
                    const themes = Array.isArray(parsed.themes) ? parsed.themes : [];
                    try { localStorage.setItem(BG_THEMES_CACHE_KEY, JSON.stringify({ ts: Date.now(), themes: themes })); } catch (e) {}
                    return themes;
                })
                .catch(function () { return (cached && cached.themes) || []; });
        }
        // 应用内置视频主题：优先 IndexedDB 本地缓存（首拉落盘后零网络），同时清理上一个内置视频缓存防爆盘
        let bgBuiltinVideoUrl = null;
        let bgBuiltinVideoThemeId = null;
        function bgApplyBuiltinVideo(theme) {
            const vurl = theme && theme.video;
            if (!vurl) return Promise.reject(new Error('no url'));
            const applyBlob = function (blob) {
                stopBgVideo();
                if (bgBuiltinVideoUrl) { try { URL.revokeObjectURL(bgBuiltinVideoUrl); } catch (e) {} }
                bgBuiltinVideoUrl = URL.createObjectURL(blob);
                const v = ensureBgVideo();
                bgApplyVideoSound(v);
                v.src = bgBuiltinVideoUrl;
                const p = v.play();
                if (p && p.catch) p.catch(function () {
                    if (!bgVideoMuted()) { // 自动播放策略兜底：先静音播，首次交互后恢复声音
                        v.muted = true;
                        const p2 = v.play(); if (p2 && p2.catch) p2.catch(function () {});
                        bgOnceInteract(function () {
                            const vv = document.getElementById('bgVideo');
                            if (vv) { vv.muted = false; vv.volume = bgVideoVol(); const p3 = vv.play(); if (p3 && p3.catch) p3.catch(function () {}); }
                        });
                    }
                });
            };
            return bgAssetGet(vurl).then(function (blob) {
                if (blob) { applyBlob(blob); return null; }
                // 首拉：下载并落盘；只保留当前一个内置视频缓存（视频体积大，防 IndexedDB 爆盘）
                return fetch(vurl).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
                    .then(function (b) {
                        return bgAssetDelOldVideos().catch(function () {}).then(function () {
                            return bgAssetPut(vurl, b).catch(function () {});
                        }).then(function () { applyBlob(b); });
                    });
            }).catch(function (e) {
                try { if (typeof showToast === 'function') showToast('⚠️ 视频下载失败：' + (e && e.message ? e.message : '网络错误')); } catch (e2) {}
                throw e;
            });
        }
        // 窗口最小化 / 收进托盘 / 切到后台时暂停背景视频与声音（含音频）；重新可见时自动续播。
        // 用 visibilitychange 统一覆盖「最小化」「叉掉收托盘」「浏览器切走标签页」等隐藏场景。
        function bgHasActiveVideo() { return !!(bgVideoUrl || bgBuiltinVideoUrl); }
        function bgPauseForHidden() {
            const v = document.getElementById('bgVideo');
            if (v && !v.paused && bgHasActiveVideo()) { try { v.pause(); } catch (e) {} }
        }
        function bgResumeForVisible() {
            const v = document.getElementById('bgVideo');
            if (!v || !v.paused || !bgHasActiveVideo()) return;
            const p = v.play();
            if (p && p.catch) p.catch(function () {
                if (!bgVideoMuted()) { // 自动播放策略兜底：先静音播，首次交互后恢复声音
                    v.muted = true;
                    const p2 = v.play(); if (p2 && p2.catch) p2.catch(function () {});
                    bgOnceInteract(function () {
                        const vv = document.getElementById('bgVideo');
                        if (vv && bgHasActiveVideo()) { vv.muted = false; vv.volume = bgVideoVol(); const p3 = vv.play(); if (p3 && p3.catch) p3.catch(function () {}); }
                    });
                }
            });
        }
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') bgPauseForHidden();
            else bgResumeForVisible();
        });
        // 桌面端（Tauri）窗口事件再兜一层：minimize/hide 暂停，unminimize/show/focus 续播
        (function () {
            try {
                const W = window.__TAURI__ && window.__TAURI__.window;
                const cur = W && W.getCurrentWindow;
                if (typeof cur === 'function') {
                    const w = cur.call(W);
                    if (w && typeof w.onEvent === 'function') {
                        w.onEvent(function (e) {
                            const t = e && e.type;
                            if (t === 'minimize' || t === 'hide') bgPauseForHidden();
                            else if (t === 'unminimize' || t === 'show' || t === 'focus') bgResumeForVisible();
                        });
                    }
                }
            } catch (e) {}
        })();
        // 删除 assets store 里旧的内置视频缓存（key 以 http 开头且 type 为 video 的 blob）
        function bgAssetDelOldVideos() {
            return bgOpenDb().then(function (db) {
                return new Promise(function (res) {
                    const tx = db.transaction(BG_ASSET_STORE, 'readwrite');
                    const store = tx.objectStore(BG_ASSET_STORE);
                    const req = store.openCursor();
                    req.onsuccess = function () {
                        const cur = req.result;
                        if (!cur) return;
                        const rec = cur.value;
                        if (rec && rec.blob && rec.blob.type && rec.blob.type.indexOf('video/') === 0) {
                            try { store.delete(cur.key); } catch (e) {}
                        }
                        cur.continue();
                    };
                    tx.oncomplete = function () { res(); };
                    tx.onerror = function () { res(); };
                });
            }).catch(function () {});
        }
        window.__bgToggleVideoSound = function (on) {
            localStorage.setItem(BG_VIDEO_MUTE_KEY, on ? '0' : '1');
            const v = document.getElementById('bgVideo');
            if (v && bgVideoId) {
                v.muted = !on;
                v.volume = bgVideoVol();
                const p = v.play(); if (p && p.catch) p.catch(function () {});
            }
            // 同步已打开背景设置面板里的开关状态（不重渲染整个面板，避免打断用户操作）
            const sw = document.getElementById('bgVideoSoundSwitch');
            if (sw) sw.checked = !!on;
            const vol = document.getElementById('bgVideoVolRange');
            if (vol) vol.disabled = !on;
            try { if (typeof showToast === 'function') showToast(on ? '🔊 背景视频声音已开启（音量 ' + Math.round(bgVideoVol() * 10) + '/10）' : '🔇 背景视频声音已关闭'); } catch (e) {}
        };
        // 背景视频音量调节（0~10，默认 5）
        window.__bgSetVideoVolume = function (v) {
            const lv = Math.max(0, Math.min(10, Math.round(parseFloat(v) || 0)));
            localStorage.setItem(BG_VIDEO_VOL_KEY, String(lv));
            const el = document.getElementById('bgVideo');
            if (el) el.volume = lv / 10;
            const lab = document.getElementById('bgVideoVolVal');
            if (lab) lab.textContent = lv + '';
        };

        function bgOpenDb() {
            return new Promise(function (res, rej) {
                if (!window.indexedDB) { rej('no idb'); return; }
                const req = indexedDB.open(BG_DB, 2); // 🔴 v2：新增 assets store（内置资源本地缓存）
                req.onupgradeneeded = function () {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(BG_STORE)) db.createObjectStore(BG_STORE, { keyPath: 'id' });
                    if (!db.objectStoreNames.contains(BG_ASSET_STORE)) db.createObjectStore(BG_ASSET_STORE, { keyPath: 'url' });
                };
                req.onsuccess = function () { res(req.result); };
                req.onerror = function () { rej(req.error); };
            });
        }
        function bgIdbStore(storeName, mode, fn) {
            return bgOpenDb().then(function (db) {
                return new Promise(function (res, rej) {
                    const tx = db.transaction(storeName, mode);
                    const store = tx.objectStore(storeName);
                    let out;
                    try { out = fn(store); } catch (e) { rej(e); return; }
                    tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
                    tx.onerror = function () { rej(tx.error); };
                });
            });
        }
        function bgIdb(mode, fn) { return bgIdbStore(BG_STORE, mode, fn); }
        // 内置资源本地缓存读写（IndexedDB 落盘 = "缓存到本地磁盘"；网页/桌面版同一套）
        function bgAssetGet(url) {
            return bgIdbStore(BG_ASSET_STORE, 'readonly', function (s) { return s.get(url); })
                .then(function (r) { return (r && r.blob) ? r.blob : null; });
        }
        function bgAssetPut(url, blob) {
            return bgIdbStore(BG_ASSET_STORE, 'readwrite', function (s) { return s.put({ url: url, ts: Date.now(), blob: blob }); });
        }
        function bgSaveImage(blob, name) {
            const rec = { id: 'bg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: name || '背景图', ts: Date.now(), blob: blob };
            return bgIdb('readwrite', function (s) { return s.put(rec); }).then(function () { return rec.id; });
        }
        function bgGetImage(id) { return bgIdb('readonly', function (s) { return s.get(id); }); }
        // 🔴 2026-09-18 供分享图「从背景图库选择默认背景」使用：仅列出图片类（视频做不了 canvas 背景）
        window.__bgLibImages = function () {
            return bgAllImages().then(function (list) {
                return (list || []).filter(function (x) { return x && x.blob && x.blob.type && x.blob.type.indexOf('image/') === 0; });
            });
        };
        window.__bgLibGet = bgGetImage;
        function bgAllImages() {
            return bgIdb('readonly', function (s) { return s.getAll(); })
                .then(function (r) { return (r || []).slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); });
        }
        function bgDelImage(id) { return bgIdb('readwrite', function (s) { return s.delete(id); }); }
        function bgRevokeUrl() {
            if (bgImgUrl) { try { URL.revokeObjectURL(bgImgUrl); } catch (e) {} }
            bgImgUrl = null; bgImgId = null;
        }
        function bgRevokeBuiltinUrl() {
            if (bgBuiltinBlobUrl) { try { URL.revokeObjectURL(bgBuiltinBlobUrl); } catch (e) {} }
            bgBuiltinBlobUrl = null;
        }
        function bgRevokeBuiltinThumbs() {
            bgBuiltinThumbUrls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
            bgBuiltinThumbUrls = [];
        }
        // 🔴 2026-09-20 内置背景图统一应用入口：**本地缓存优先（零网络）**；未命中才联网一次并落盘，
        //    下次启动直接本地读取（断网也能显示）。失败兜底直连原 URL。
        function bgApplyAsset(url) {
            const layer = ensureBgLayer() || document.body;
            layer.classList.add('bg-custom');
            layer.style.background = '';
            const setLocal = function (blob) {
                bgRevokeBuiltinUrl();
                bgBuiltinBlobUrl = URL.createObjectURL(blob);
                layer.style.backgroundImage = 'url(' + bgBuiltinBlobUrl + ')';
            };
            return bgAssetGet(url).catch(function () { return null; }).then(function (blob) {
                if (blob) { setLocal(blob); return true; }
                return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
                    if (!b) { layer.style.backgroundImage = 'url(' + url + ')'; return false; }
                    setLocal(b);
                    bgAssetPut(url, b).catch(function () {});   // 落盘，后续不再联网
                    return true;
                }).catch(function () { layer.style.backgroundImage = 'url(' + url + ')'; return false; });
            });
        }
        function bgApplyImage(id) {
            return bgGetImage(id).then(function (rec) {
                if (!rec || !rec.blob) throw new Error('image not found');
                bgRevokeUrl();
                bgImgUrl = URL.createObjectURL(rec.blob);
                bgImgId = id;
                const layer = ensureBgLayer() || document.body;
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

        // 背景层关键样式由 JS 内联（防止 SW 缓存不同步：新 HTML/JS + 旧 styles.css 时层没有定位样式 → 背景画了也看不见）
        function ensureBgLayer() {
            const layer = document.getElementById('bgLayer');
            if (!layer) return null;
            if (!layer.dataset.bgStyled) {
                layer.style.cssText = 'position:fixed;top:-40px;left:-40px;right:-40px;bottom:-40px;z-index:-2;' +
                    'background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);' +
                    'background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;';
                layer.dataset.bgStyled = '1';
            }
            return layer;
        }

        function applyUserBackground() {
            if (!bgMigrateTried) { bgMigrateTried = true; try { migrateLegacyCustomBg(); } catch (e) {} }
            // 背景统一画在独立层 #bgLayer 上（支持 filter 模糊）；body 只留兜底底色
            const layer = ensureBgLayer() || document.body;
            document.body.classList.remove('bg-custom', 'bg-anim-aurora', 'bg-anim-neon', 'bg-anim-stars');
            layer.classList.remove('bg-custom', 'bg-anim-aurora', 'bg-anim-neon', 'bg-anim-stars');
            layer.style.background = '';
            layer.style.backgroundImage = '';
            layer.style.backgroundAttachment = '';
            const val = (localStorage.getItem(BG_KEY) || '').trim();
            if (!val || val === 'default') {
                // 🔴 2026-09-18 默认背景改为内置「美女2」；用户自己改过背景后存了各自值，不再走到这里。
                //    「↺ 恢复默认」按钮 = 回到这张图。若用户已删除该内置图，则回退深色渐变。
                bgRevokeUrl(); stopBgVideo();
                const girl2Gone = (typeof bgHiddenBuiltins === 'function' && bgHiddenBuiltins().indexOf('bg/bg-girl2.jpg') >= 0);
                if (!girl2Gone) {
                    // 🔴 2026-09-20 走本地缓存（首拉落盘后永久本地读取，不再每次启动都远端拉取）
                    bgApplyAsset('bg/bg-girl2.jpg');
                } else {
                    bgRevokeBuiltinUrl();
                }
                applyBgBlur();
                return;
            }
            if (val.indexOf('builtin:') !== 0) bgRevokeBuiltinUrl(); // 离开内置图 → 释放其本地 blob
            const isBvid = val.indexOf('bvid:') === 0;
            if (val.indexOf('img:') !== 0 && val.indexOf('video:') !== 0 && !isBvid) bgRevokeUrl();
            if (val.indexOf('video:') !== 0 && !isBvid) stopBgVideo();
            if (isBvid) {
                // 内置视频主题（bvid:<themeId>）：本地缓存优先，首拉下载落盘
                const tid = val.slice(5);
                layer.classList.add('bg-custom');
                if (bgBuiltinVideoThemeId === tid && bgBuiltinVideoUrl) {
                    const v = ensureBgVideo();
                    bgApplyVideoSound(v);
                    if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(function () {}); }
                } else {
                    bgThemesLoad().then(function (list) {
                        const t = (list || []).find(function (x) { return x.id === tid; });
                        if (!t) { try { if (typeof showToast === 'function') showToast('⚠️ 该主题不存在或已下架'); } catch (e) {} return; }
                        bgBuiltinVideoThemeId = tid;
                        bgApplyBuiltinVideo(t).catch(function () {});
                    });
                }
            } else if (val.indexOf('video:') === 0) {
                const vid = val.slice(6);
                layer.classList.add('bg-custom');
                if (bgVideoId === vid && bgVideoUrl) {
                    const v = ensureBgVideo();
                    bgApplyVideoSound(v);
                    if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(function () {}); }
                } else {
                    bgApplyVideo(vid).catch(function () {});
                }
            } else if (val.indexOf('img:') === 0) {
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
                // 🔴 2026-09-20 选中的内置图同样走本地缓存（零网络；首拉落盘）
                bgApplyAsset(val.slice(8));
            } else if (val.indexOf('grad:') === 0) {
                layer.style.background = val.slice(5);
            }
            let ov = 0;
            if (localStorage.getItem(BG_OVERLAY_ON) === '1') ov = getBgOverlayForValue(val);
            document.body.style.setProperty('--bg-overlay', String(ov));
            applyBgBlur();
        }

        // 上传图片/视频：图片 canvas 压缩到最长边 1920px、JPEG 0.8；视频直接入媒体库（IndexedDB）
        function handleBgFile(file) {
            if (!file) return;
            if (file.type && file.type.indexOf('video/') === 0) {
                if (file.size > 100 * 1024 * 1024) {
                    try { if (typeof showToast === 'function') showToast('⚠️ 视频太大（超 100MB），请先压缩'); } catch (e) {}
                    return;
                }
                bgSaveImage(file, file.name).then(function (id) {
                    localStorage.setItem(BG_KEY, 'video:' + id);
                    applyUserBackground();
                    if (typeof renderBgImageList === 'function') renderBgImageList();
                    try { if (typeof showToast === 'function') showToast('✅ 视频背景已应用'); } catch (e) {}
                }).catch(function () {
                    try { if (typeof showToast === 'function') showToast('视频保存失败'); } catch (e) {}
                });
                return;
            }
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
            const layer = ensureBgLayer() || document.body;
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
                    const isVideo = !!(rec.blob && rec.blob.type && rec.blob.type.indexOf('video/') === 0);
                    const u = URL.createObjectURL(rec.blob);
                    bgThumbUrls.push(u);
                    const name = String(rec.name || (isVideo ? '视频' : '背景图')).replace(/[<>&"']/g, '');
                    const scheme = isVideo ? 'video:' : 'img:';
                    const active = cur === scheme + rec.id;
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'position:relative;width:78px;text-align:center;';
                    wrap.innerHTML =
                        '<div onclick="window.__bgUseImage(\'' + rec.id + '\',\'' + (isVideo ? 'video' : 'img') + '\')" title="点击切换到这张背景" style="width:78px;height:52px;border-radius:8px;display:flex;align-items:center;justify-content:center;' + (isVideo ? 'background:rgba(255,255,255,0.08);font-size:1.4rem;' : 'background-image:url(' + u + ');background-size:cover;background-position:center;') + 'border:2px solid ' + (active ? '#ffd700' : 'rgba(255,255,255,0.28)') + ';box-shadow:' + (active ? '0 0 10px rgba(255,215,0,0.55)' : 'none') + ';cursor:pointer;">' + (isVideo ? '🎬' : '') + '</div>' +
                        '<button onclick="window.__bgDeleteImage(\'' + rec.id + '\')" title="删除" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e53935;border:none;color:#fff;font-size:0.66rem;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.5);">✕</button>' +
                        '<div style="font-size:0.6rem;color:' + (active ? '#ffd700' : 'rgba(255,255,255,0.55)') + ';margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (active ? '使用中 ' : '') + name + '</div>';
                    box.appendChild(wrap);
                });
            }).catch(function () {
                box.innerHTML = '<span style="font-size:0.72rem;color:rgba(255,255,255,0.4);">读取背景图失败</span>';
            });
        }
        window.__bgUseImage = function (id, kind) {
            localStorage.setItem(BG_KEY, (kind === 'video' ? 'video:' : 'img:') + id);
            applyUserBackground();
            renderBgImageList();
            try { if (typeof showToast === 'function') showToast('✅ 已切换背景'); } catch (e) {}
        };
        window.__bgDeleteImage = function (id) {
            if (!window.confirm('删除这张背景图？（只会从本机图片库移除）')) return;
            const cur = (localStorage.getItem(BG_KEY) || '').trim();
            bgDelImage(id).then(function () {
                if (bgImgId === id) bgRevokeUrl();
                if (cur === 'img:' + id || cur === 'video:' + id) { localStorage.setItem(BG_KEY, 'default'); applyUserBackground(); }
                renderBgImageList();
                try { if (typeof showToast === 'function') showToast('🗑️ 已删除'); } catch (e) {}
            }).catch(function () { try { if (typeof showToast === 'function') showToast('删除失败'); } catch (e) {} });
        };

        window.__bgClearColors = function () { bgSelectedColors = []; renderBgColorList(); applyUserBackground(); };

        // 🔴 2026-09-18 新功能埋点：统一包装背景系统入口（延迟 1.5s 确保全部定义完成；2s 节流在 trackFeature 内）
        setTimeout(function () {
            try {
                const wrap = function (key, label) {
                    const orig = window[key];
                    if (typeof orig !== 'function' || orig.__tracked) return;
                    const tracked = function () { if (window.trackFeature) window.trackFeature(label); return orig.apply(this, arguments); };
                    tracked.__tracked = true;
                    window[key] = tracked;
                };
                wrap('__bgToggleOverlay', '背景压暗开关');
                wrap('__bgSetBlur', '面板模糊调节');
                wrap('__bgSetFrost', '面板底色调节');
                wrap('__bgToggleVideoSound', '背景视频声音开关');
                wrap('__bgSetVideoVolume', '背景视频音量调节');
                wrap('__bgApplyTheme', '内置视频主题应用');
                wrap('__setBgPreset', '背景预设');
                wrap('__setBgBuiltin', '内置背景图');
                wrap('__bgRandomGrad', '随机渐变');
                wrap('__bgApplyGrad', '应用自选渐变');
                wrap('__bgUseImage', '背景图切换');
                wrap('__bgDeleteImage', '背景图删除');
                wrap('__bgClearColors', '清空渐变色');
                wrap('__bgFile', '上传背景');
            } catch (e) {}
        }, 1500);
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
                const hidden = bgHiddenBuiltins();
                rows.push('<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin:12px 0 6px;">🖼️ 内置背景图（右上角 ✕ 可删除）</div>');
                rows.push('<div style="display:flex;flex-wrap:wrap;gap:8px;">');
                BG_BUILTIN.forEach(function (b) {
                    if (hidden.indexOf(b.url) >= 0) return;
                    rows.push('<div style="position:relative;">' +
                        // 🔴 2026-09-20 缩略图不直接写远端 URL（那会每次打开设置窗都联网下 6 张图）：
                        //    先占位，随后 data-bgthumb 走本地缓存填充（首拉落盘，之后零网络）。
                        '<button data-bgthumb="' + b.url + '" onclick="window.__setBgBuiltin(\'' + b.url + '\')" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);background-size:cover;background-position:center;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.85);cursor:pointer;font-size:0.8rem;min-width:96px;min-height:40px;">' + b.name + '</button>' +
                        '<button onclick="window.__bgHideBuiltin(\'' + b.url + '\')" title="删除" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e53935;border:none;color:#fff;font-size:0.66rem;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.5);">✕</button>' +
                        '</div>');
                });
                rows.push('</div>');
            }
            // 🎬 内置视频主题区：清单来自 Gitee/Gist，封面本地缓存优先；点击应用后视频也落盘缓存
            rows.push('<div id="bgVideoThemeWrap" style="display:none;">' +
                '<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin:12px 0 6px;">🎬 内置视频（点封面切换，应用后自动缓存本机、断网也能播）</div>' +
                '<div id="bgVideoThemeList" style="display:flex;flex-wrap:wrap;gap:8px;"></div>' +
                '</div>');
            const overlayOn = localStorage.getItem(BG_OVERLAY_ON) === '1';
            const blurVal = readLevel(BG_BLUR_KEY);
            const frostVal = readLevel(BG_FROST_KEY, 30);
            // 背景视频声音开关 + 音量：仅当前背景为视频（自传 video: / 内置 bvid:）时显示
            const curBgVal = (localStorage.getItem(BG_KEY) || '').trim();
            const isVideoBg = curBgVal.indexOf('video:') === 0 || curBgVal.indexOf('bvid:') === 0;
            const videoSoundOn = !bgVideoMuted();
            const videoVol = Math.round(bgVideoVol() * 10);
            const modal = document.createElement('div');
            modal.id = 'bgSettingsModal';
            modal.style.cssText = 'position:fixed;top:78px;right:18px;width:332px;max-width:92vw;z-index:100000;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,215,0,0.4);border-radius:16px;padding:14px 16px 16px;max-height:86vh;overflow:auto;box-shadow:0 12px 44px rgba(0,0,0,0.6);';
            modal.innerHTML = '' +
                '<div id="bgSettingsHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;cursor:move;user-select:none;">' +
                '  <span style="color:#ffd700;font-size:1.1rem;font-weight:bold;">🎨 背景设置</span>' +
                '  <button onclick="window.__bgCloseSettings()" onmousedown="event.stopPropagation()" title="关闭" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;">✕</button>' +
                '</div>' +
                '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.82rem;color:rgba(255,255,255,0.85);cursor:pointer;">' +
                '  <input type="checkbox" id="bgOverlaySwitch"' + (overlayOn ? ' checked' : '') + ' onchange="window.__bgToggleOverlay(this.checked)">' +
                '  背景协调压暗（开启后浅色背景自动压暗，深色不影响）</label>' +
                (isVideoBg ? ('<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.82rem;color:rgba(255,255,255,0.85);cursor:pointer;">' +
                '  <input type="checkbox" id="bgVideoSoundSwitch"' + (videoSoundOn ? ' checked' : '') + ' onchange="window.__bgToggleVideoSound(this.checked)">' +
                '  背景视频声音 🔊（默认开）</label>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.78rem;color:rgba(255,255,255,0.85);">' +
                '  <span style="flex-shrink:0;">视频音量</span>' +
                '  <input type="range" id="bgVideoVolRange" min="0" max="10" step="1" value="' + videoVol + '"' + (videoSoundOn ? '' : ' disabled') + ' oninput="window.__bgSetVideoVolume(this.value)" style="flex:1;min-width:0;">' +
                '  <span id="bgVideoVolVal" style="min-width:40px;text-align:right;color:#ffd700;">' + videoVol + '/10</span>' +
                '</div>') : '') +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.78rem;color:rgba(255,255,255,0.85);">' +
                '  <span style="flex-shrink:0;">面板模糊</span>' +
                '  <input type="range" id="bgBlurRange" min="0" max="100" step="1" value="' + blurVal + '" oninput="window.__bgSetBlur(this.value)" style="flex:1;min-width:0;">' +
                '  <span id="bgBlurVal" style="min-width:40px;text-align:right;color:#ffd700;">' + blurVal + '%</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.78rem;color:rgba(255,255,255,0.85);">' +
                '  <span style="flex-shrink:0;">面板底色</span>' +
                '  <input type="range" id="bgFrostRange" min="0" max="100" step="1" value="' + frostVal + '" oninput="window.__bgSetFrost(this.value)" style="flex:1;min-width:0;">' +
                '  <span id="bgFrostVal" style="min-width:40px;text-align:right;color:#ffd700;">' + frostVal + '%</span>' +
                '</div>' +
                '<div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-bottom:8px;">这两条调的是主面板：<b>模糊</b> 0=背景看清、100=糊掉；<b>底色</b> 0=面板全透明（背景原样可见）、100=最浓（含「出战选择」面板）</div>' +
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
                '      📤 上传图片/视频<input type="file" accept="image/*,video/mp4,video/webm" style="display:none;" onchange="window.__bgFile(this.files[0])">' +
                '    </label>' +
                '    <button onclick="window.__setBgPreset(\'default\')" style="padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:0.85rem;">↺ 恢复默认</button>' +
                '  </div>' +
                '  <div style="margin-top:12px;color:rgba(255,255,255,0.4);font-size:0.72rem;">提示：极光/星河为动态渐变背景；浅色背景可能让部分浅色文字变淡，可勾选上方「背景协调压暗」。</div>';
            document.body.appendChild(modal);
            // 🔴 2026-09-20 内置图缩略图填充：本地缓存优先（首拉落盘 → 以后打开设置窗零网络）
            try {
                bgRevokeBuiltinThumbs();
                document.querySelectorAll('#bgSettingsModal [data-bgthumb]').forEach(function (btn) {
                    const u = btn.getAttribute('data-bgthumb');
                    if (!u) return;
                    const useBlob = function (blob) {
                        try { const bu = URL.createObjectURL(blob); bgBuiltinThumbUrls.push(bu); btn.style.backgroundImage = 'url(' + bu + ')'; } catch (e) {}
                    };
                    bgAssetGet(u).catch(function () { return null; }).then(function (blob) {
                        if (blob) { useBlob(blob); return; }
                        fetch(u).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
                            if (!b) { btn.style.backgroundImage = 'url(' + u + ')'; return; }
                            useBlob(b);
                            bgAssetPut(u, b).catch(function () {});
                        }).catch(function () { btn.style.backgroundImage = 'url(' + u + ')'; });
                    });
                });
            } catch (e) {}
            renderBgVideoThemes();
            // 悬浮窗拖拽（仅标题栏空白区拖动；按钮内点击不触发拖拽，避免关闭时窗体被拖走）
            try {
                const hdr = document.getElementById('bgSettingsHeader');
                let dragging = false, offX = 0, offY = 0;
                function startDrag(cx, cy) {
                    dragging = true;
                    const r = modal.getBoundingClientRect();
                    offX = cx - r.left; offY = cy - r.top;
                    modal.style.right = 'auto'; modal.style.bottom = 'auto';
                }
                hdr.addEventListener('mousedown', function (e) { if (e.target.closest('button')) return; startDrag(e.clientX, e.clientY); });
                window.addEventListener('mousemove', function (e) { if (dragging && modal.isConnected) { modal.style.left = (e.clientX - offX) + 'px'; modal.style.top = (e.clientY - offY) + 'px'; } });
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

        // ===== 「🎬 内置视频」区渲染：清单拉取 → 封面本地缓存优先填充 =====
        function renderBgVideoThemes() {
            const wrap = document.getElementById('bgVideoThemeWrap');
            const box = document.getElementById('bgVideoThemeList');
            if (!wrap || !box) return;
            bgRevokeVideoThemeThumbs();
            const cur = (localStorage.getItem(BG_KEY) || '').trim();
            bgThemesLoad().then(function (list) {
                if (!wrap.isConnected) return; // 面板已关
                if (!list || !list.length) { wrap.style.display = 'none'; return; }
                wrap.style.display = 'block';
                box.innerHTML = '';
                const hidden = bgHiddenThemes();
                list.forEach(function (t) {
                    if (hidden.indexOf(t.id) >= 0) return;
                    const active = cur === 'bvid:' + t.id;
                    const div = document.createElement('div');
                    div.style.cssText = 'position:relative;width:96px;text-align:center;';
                    const btn = document.createElement('button');
                    btn.setAttribute('data-bgvthumb', t.cover || '');
                    btn.title = '点击切换到「' + String(t.name || '未命名').replace(/"/g, '') + '」';
                    btn.style.cssText = 'width:96px;height:54px;border-radius:8px;border:2px solid ' + (active ? '#ffd700' : 'rgba(255,255,255,0.28)') + ';box-shadow:' + (active ? '0 0 10px rgba(255,215,0,0.55)' : 'none') + ';cursor:pointer;background:rgba(255,255,255,0.06) center/cover no-repeat;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.85);font-size:1.3rem;padding:0;';
                    btn.innerHTML = '🎬';
                    btn.onclick = function () { window.__bgApplyTheme(t.id); };
                    div.appendChild(btn);
                    const del = document.createElement('button');
                    del.title = '删除';
                    del.textContent = '✕';
                    del.style.cssText = 'position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e53935;border:none;color:#fff;font-size:0.66rem;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.5);';
                    del.onclick = function () { window.__bgHideTheme(t.id); };
                    div.appendChild(del);
                    const cap = document.createElement('div');
                    cap.style.cssText = 'font-size:0.6rem;color:' + (active ? '#ffd700' : 'rgba(255,255,255,0.55)') + ';margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                    cap.textContent = (active ? '使用中 ' : '') + (t.name || '未命名');
                    div.appendChild(cap);
                    box.appendChild(div);
                    if (t.cover) {
                        bgAssetGet(t.cover).catch(function () { return null; }).then(function (blob) {
                            if (!btn.isConnected) return;
                            if (blob) { const bu = URL.createObjectURL(blob); bgVideoThemeThumbUrls.push(bu); btn.style.backgroundImage = 'url(' + bu + ')'; return; }
                            fetch(t.cover).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
                                if (!b || !btn.isConnected) return;
                                const bu = URL.createObjectURL(b); bgVideoThemeThumbUrls.push(bu); btn.style.backgroundImage = 'url(' + bu + ')';
                                bgAssetPut(t.cover, b).catch(function () {});
                            }).catch(function () {});
                        });
                    }
                });
            });
        }
        function bgRevokeVideoThemeThumbs() {
            try { bgVideoThemeThumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); } catch (e) {}
            bgVideoThemeThumbUrls = [];
        }
        let bgVideoThemeThumbUrls = [];
        // 应用内置视频主题
        window.__bgApplyTheme = function (id) {
            bgThemesLoad().then(function (list) {
                const t = (list || []).find(function (x) { return x.id === id; });
                if (!t) { try { if (typeof showToast === 'function') showToast('⚠️ 主题不存在或已下架'); } catch (e) {} return; }
                localStorage.setItem(BG_KEY, 'bvid:' + id);
                bgBuiltinVideoThemeId = id;
                applyUserBackground();
                try { if (typeof showToast === 'function') showToast('✅ 已应用「' + (t.name || '未命名') + '」，已缓存到本机'); } catch (e) {}
                if (typeof renderBgImageList === 'function') renderBgImageList();
            });
        };
        // 隐藏（本机不再显示）某个内置视频主题
        window.__bgHideTheme = function (id) {
            try {
                if (!window.confirm('本机不再显示这个主题？（不影响其他用户，重新安装/清缓存可恢复）')) return;
            } catch (e) { return; }
            const list = bgHiddenThemes();
            if (list.indexOf(id) < 0) list.push(id);
            try { localStorage.setItem(BG_THEMES_HIDE_KEY, JSON.stringify(list)); } catch (e) {}
            if ((localStorage.getItem(BG_KEY) || '').trim() === 'bvid:' + id) {
                localStorage.setItem(BG_KEY, 'default');
                applyUserBackground();
            }
            renderBgVideoThemes();
        };
        function bgHiddenThemes() {
            try { return JSON.parse(localStorage.getItem(BG_THEMES_HIDE_KEY) || '[]'); } catch (e) { return []; }
        }

        // ===== 管理后台「背景主题上传」：视频/封面 → Gitee Releases；清单 → 公开 Gist =====
        const GITEE_OWNER = 'dragon-soars-across-the-world_0';
        const GITEE_REPO = 'tfjl-web';
        const BG_THEMES_RELEASE_TAG = 'bg-themes';
        const BG_THEMES_TOKEN_KEY = 'tfjl_gitee_token'; // 与皮肤打包（app-skinmaker.js）同键，复用
        function giteeTok() { try { return localStorage.getItem(BG_THEMES_TOKEN_KEY) || ''; } catch (e) { return ''; } }
        function giteeApiBase() { return 'https://gitee.com/api/v5/repos/' + GITEE_OWNER + '/' + GITEE_REPO; }
        function giteeDlUrl(filename) { return 'https://gitee.com/' + GITEE_OWNER + '/' + GITEE_REPO + '/releases/download/' + BG_THEMES_RELEASE_TAG + '/' + filename; }
        // 确保 bg-themes release 存在（没有则创建）
        function giteeEnsureRelease(tok) {
            return fetch(giteeApiBase() + '/releases?access_token=' + encodeURIComponent(tok) + '&per_page=100')
                .then(function (r) { return r.json(); })
                .then(function (list) {
                    const rel = (list || []).find(function (x) { return x && x.tag_name === BG_THEMES_RELEASE_TAG; });
                    if (rel) return rel;
                    return fetch(giteeApiBase() + '/releases?access_token=' + encodeURIComponent(tok), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tag_name: BG_THEMES_RELEASE_TAG, name: '背景主题视频库', target_commit_id: 'master' })
                    }).then(function (r) { return r.json(); });
                });
        }
        // 上传附件到指定 release（浏览器 FormData multipart）
        function giteeUploadFile(tok, releaseId, file, filename) {
            const fd = new FormData();
            fd.append('file', file, filename);
            return fetch(giteeApiBase() + '/releases/' + releaseId + '/attach_files?access_token=' + encodeURIComponent(tok), { method: 'POST', body: fd })
                .then(function (r) { return r.json(); })
                .then(function (j) { if (!j || j.error) throw new Error((j && j.error_description) || '上传失败'); return j; });
        }
        // 从视频中抓一帧当封面（用户不传封面时）
        function bgGrabVideoFrame(file) {
            return new Promise(function (res, rej) {
                let v;
                try { v = document.createElement('video'); } catch (e) { rej(e); return; }
                v.muted = true; v.playsInline = true; v.preload = 'metadata';
                const url = URL.createObjectURL(file);
                const done = function (fn, arg) { try { URL.revokeObjectURL(url); } catch (e) {} fn(arg); };
                v.onloadeddata = function () { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { done(rej, e); } };
                v.onseeked = function () {
                    try {
                        const c = document.createElement('canvas');
                        c.width = 480;
                        c.height = Math.max(1, Math.round(480 * (v.videoHeight || 270) / (v.videoWidth || 480)));
                        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
                        c.toBlob(function (b) { if (b) done(res, b); else done(rej, new Error('封面抓帧失败')); }, 'image/jpeg', 0.72);
                    } catch (e) { done(rej, e); }
                };
                v.onerror = function () { done(rej, new Error('视频解析失败')); };
                v.src = url;
            });
        }
        // 读/写主题清单 Gist（无 ID 时自动创建公开 Gist 并把 ID 存本机）
        function bgThemesGistWrite(data) {
            const tok = (typeof getGistToken === 'function') ? getGistToken() : '';
            if (!tok) throw new Error('未读到 GitHub Token，无法写清单');
            const gid = bgThemesGistId();
            const content = JSON.stringify(data, null, 2);
            if (gid) {
                return fetch('https://api.github.com/gists/' + gid, {
                    method: 'PATCH',
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + tok },
                    body: JSON.stringify({ files: { 'bg-themes.json': { content: content } } })
                }).then(function (r) { if (!r.ok) throw new Error('清单更新失败 ' + r.status); return r.json(); });
            }
            return fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + tok },
                body: JSON.stringify({ description: 'tfjl-web 背景主题清单（自动创建）', public: true, files: { 'bg-themes.json': { content: content } } })
            }).then(function (r) { if (!r.ok) throw new Error('清单创建失败 ' + r.status); return r.json(); })
                .then(function (g) {
                    try { localStorage.setItem(BG_THEMES_GIST_KEY, g.id); } catch (e) {}
                    return g;
                });
        }
        function bgToast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (e) {} }
        function bgEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
        // 管理后台页面渲染
        window.renderBgThemesAdmin = function () {
            const body = document.getElementById('bgThemesAdminBody');
            if (!body) return;
            const gid = bgThemesGistId();
            body.innerHTML =
                '<div style="font-size:0.72rem;color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;line-height:1.7;margin-bottom:12px;">' +
                '上传后<b style="color:#ffd700;">所有人刷新页面即可看到</b>新主题；用户点应用后视频自动缓存到本机，断网也能播。<br>' +
                '视频文件走 <b>Gitee Releases</b>（tag：' + BG_THEMES_RELEASE_TAG + '），清单走 <b>公开 Gist</b>；本页填的 Gitee Token 只存本机浏览器，不进仓库。' +
                (gid ? ('<br>当前清单 Gist：<code style="color:#9ae6b4;">' + bgEsc(gid) + '</code>') : '<br>清单 Gist：<span style="color:#fbbf24;">未创建（首次上传自动创建）</span>') +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:0.78rem;color:rgba(255,255,255,0.85);">' +
                '  <span style="flex-shrink:0;">Gitee Token</span>' +
                '  <input id="bgThemesGiteeToken" type="password" placeholder="粘贴 Gitee 私人令牌（projects 权限）" value="' + bgEsc(giteeTok()) + '" style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:0.75rem;">' +
                '  <button class="admin-btn admin-btn-secondary" onclick="(function(){var v=document.getElementById(\'bgThemesGiteeToken\').value.trim();try{localStorage.setItem(\'' + BG_THEMES_TOKEN_KEY + '\',v);}catch(e){}bgToast(v?\'✅ Token 已保存到本机\':\'已清除\');})()" style="padding:6px 10px;font-size:0.75rem;white-space:nowrap;">保存</button>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">' +
                '  <input id="bgThemeName" type="text" placeholder="主题名称（如：星空漫步）" style="flex:1;min-width:140px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:0.8rem;">' +
                '  <label style="padding:7px 12px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:0.78rem;white-space:nowrap;">🎬 选视频<input id="bgThemeVideoFile" type="file" accept="video/mp4,video/webm" style="display:none;"></label>' +
                '  <label style="padding:7px 12px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:0.78rem;white-space:nowrap;">🖼️ 封面(可选)<input id="bgThemeCoverFile" type="file" accept="image/*" style="display:none;"></label>' +
                '  <button class="admin-btn" onclick="window.__bgThemeUpload()" style="padding:7px 14px;font-size:0.8rem;font-weight:bold;white-space:nowrap;">☁ 上传并上架</button>' +
                '</div>' +
                '<div id="bgThemeUploadLog" style="font-size:0.72rem;color:rgba(255,255,255,0.55);margin-bottom:12px;min-height:1em;"></div>' +
                '<div style="color:rgba(255,255,255,0.6);font-size:0.78rem;margin-bottom:8px;">📦 已上架主题（点「下架」仅从清单移除，Gitee 上的文件保留）</div>' +
                '<div id="bgThemesAdminList" style="display:flex;flex-direction:column;gap:8px;"></div>';
            renderBgThemesAdminList();
        };
        function renderBgThemesAdminList() {
            const box = document.getElementById('bgThemesAdminList');
            if (!box) return;
            box.innerHTML = '<div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">加载中…</div>';
            bgThemesLoad(true).then(function (list) {
                if (!box.isConnected) return;
                if (!list.length) { box.innerHTML = '<div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">还没有主题，上传第一个吧。</div>'; return; }
                box.innerHTML = '';
                list.slice().reverse().forEach(function (t) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;';
                    const cover = document.createElement('div');
                    cover.style.cssText = 'width:64px;height:36px;border-radius:4px;background:rgba(255,255,255,0.1) center/cover no-repeat;flex-shrink:0;';
                    if (t.cover) { bgAssetGet(t.cover).catch(function () { return null; }).then(function (b) { if (b) cover.style.backgroundImage = 'url(' + URL.createObjectURL(b) + ')'; }); }
                    row.appendChild(cover);
                    const info = document.createElement('div');
                    info.style.cssText = 'flex:1;min-width:0;font-size:0.75rem;color:rgba(255,255,255,0.85);line-height:1.5;';
                    info.innerHTML = '<div style="font-weight:bold;">' + bgEsc(t.name || '未命名') + '</div>' +
                        '<div style="color:rgba(255,255,255,0.45);font-size:0.68rem;word-break:break-all;">' + bgEsc(t.video || '') + '</div>' +
                        '<div style="color:rgba(255,255,255,0.4);font-size:0.66rem;">' + (t.size ? (Math.round(t.size / 1048576) + ' MB') : '') + (t.ts ? ' · ' + new Date(t.ts).toLocaleString('zh-CN', { hour12: false }) : '') + '</div>';
                    row.appendChild(info);
                    const del = document.createElement('button');
                    del.className = 'admin-btn admin-btn-secondary';
                    del.textContent = '下架';
                    del.style.cssText = 'padding:5px 10px;font-size:0.72rem;flex-shrink:0;';
                    del.onclick = function () { window.__bgThemeRemove(t.id); };
                    row.appendChild(del);
                    box.appendChild(row);
                });
            });
        }
        // 上传并上架
        window.__bgThemeUpload = function () {
            const tok = (document.getElementById('bgThemesGiteeToken').value || '').trim();
            try { localStorage.setItem(BG_THEMES_TOKEN_KEY, tok); } catch (e) {}
            const name = (document.getElementById('bgThemeName').value || '').trim();
            const vfile = document.getElementById('bgThemeVideoFile').files[0];
            const cfile = document.getElementById('bgThemeCoverFile').files[0];
            const log = function (m) { const el = document.getElementById('bgThemeUploadLog'); if (el) el.textContent = m; };
            if (!tok) { bgToast('⚠️ 请先填写 Gitee Token'); return; }
            if (!name) { bgToast('⚠️ 请填主题名称'); return; }
            if (!vfile) { bgToast('⚠️ 请选择视频文件'); return; }
            if (vfile.size > 100 * 1024 * 1024) { bgToast('⚠️ 视频超 100MB，请先压缩'); return; }
            const gid0 = bgThemesGistId();
            const themeId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const vExt = (vfile.name.match(/\.(mp4|webm|mov)$/i) || ['.mp4'])[0].toLowerCase();
            const vName = themeId + vExt;
            (async function () {
                log('① 检查 Gitee 发行版…');
                const rel = await giteeEnsureRelease(tok);
                const rid = rel && rel.id;
                if (!rid) throw new Error('无法创建/获取 Gitee release（检查 Token 权限：projects）');
                log('② 上传视频 ' + vfile.name + '（' + Math.round(vfile.size / 1048576) + 'MB）…');
                await giteeUploadFile(tok, rid, vfile, vName);
                let coverBlob = null, cName = '';
                if (cfile) { coverBlob = cfile; cName = themeId + '.jpg'; }
                else {
                    log('③ 未传封面，从视频抓帧…');
                    try { coverBlob = await bgGrabVideoFrame(vfile); cName = themeId + '.jpg'; } catch (e) { coverBlob = null; }
                }
                if (coverBlob) { log('④ 上传封面…'); await giteeUploadFile(tok, rid, coverBlob, cName); }
                log(gid0 ? '⑤ 更新主题清单…' : '⑤ 创建主题清单 Gist…');
                const ghTok = (typeof getGistToken === 'function') ? getGistToken() : '';
                if (!ghTok) throw new Error('未读到 GitHub Token，无法写清单');
                let data = { v: 1, themes: [] };
                if (gid0) {
                    const r = await fetch('https://api.github.com/gists/' + gid0, { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'token ' + ghTok } });
                    if (r.ok) { const g = await r.json(); const f = g.files && g.files['bg-themes.json']; if (f && f.content) { try { data = JSON.parse(f.content) || data; } catch (e) {} } }
                }
                if (!Array.isArray(data.themes)) data.themes = [];
                const theme = { id: themeId, name: name, video: giteeDlUrl(vName), cover: coverBlob ? giteeDlUrl(cName) : '', size: vfile.size, ts: Date.now() };
                data.themes.push(theme);
                const g = await bgThemesGistWrite(data);
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                log('✅ 上架成功！所有人刷新页面即可在「🎬 内置视频」看到「' + name + '」' + (gid0 ? '' : '（新清单 Gist：' + g.id + '，建议把此 ID 回填到 app-effects.js 的 BG_THEMES_GIST_ID）'));
                bgToast('✅ 主题「' + name + '」已上架');
                document.getElementById('bgThemeName').value = '';
                document.getElementById('bgThemeVideoFile').value = '';
                document.getElementById('bgThemeCoverFile').value = '';
                renderBgThemesAdminList();
            })().catch(function (e) {
                log('❌ 失败：' + (e && e.message ? e.message : e));
                bgToast('❌ 上传失败：' + (e && e.message ? e.message : e));
            });
        };
        // 下架（仅从清单移除）
        window.__bgThemeRemove = function (id) {
            if (!window.confirm('确定下架这个主题？（仅从清单移除，Gitee 上的文件保留）')) return;
            const ghTok = (typeof getGistToken === 'function') ? getGistToken() : '';
            const gid = bgThemesGistId();
            if (!ghTok || !gid) { bgToast('❌ 缺少 Token 或清单 Gist'); return; }
            fetch('https://api.github.com/gists/' + gid, { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'token ' + ghTok } })
                .then(function (r) { return r.json(); })
                .then(function (g) {
                    const f = g.files && g.files['bg-themes.json'];
                    let data = { v: 1, themes: [] };
                    if (f && f.content) { try { data = JSON.parse(f.content) || data; } catch (e) {} }
                    data.themes = (data.themes || []).filter(function (t) { return t.id !== id; });
                    return bgThemesGistWrite(data);
                })
                .then(function () {
                    try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                    bgToast('✅ 已下架');
                    renderBgThemesAdminList();
                })
                .catch(function (e) { bgToast('❌ 下架失败：' + (e && e.message ? e.message : e)); });
        };

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
        