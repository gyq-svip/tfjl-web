
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
            if (!v.__bgGuard) {
                v.__bgGuard = true;
                // 🔴 H.265/HEVC 等当前环境无解码器时 videoWidth=0（只有声音没画面）：
                //    metadata 一到就标记并暂停；之后任何 play 尝试都立即再暂停，避免「音乐还在放」。
                v.addEventListener('loadedmetadata', function () {
                    if (!v.videoWidth || !v.videoHeight) {
                        v.__bgDecodeBad = true;
                        try { v.pause(); } catch (e) {}
                        try { if (typeof showToast === 'function') showToast('⚠️ 该视频编码不受支持（常见 H.265/HEVC），请换 H.264 版本'); } catch (e) {}
                    }
                });
                v.addEventListener('play', function () {
                    if (v.__bgDecodeBad) { try { v.pause(); } catch (e) {} }
                });
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
                v.__bgDecodeBad = false;
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
        // ===== 内置视频主题库（混合托管）：清单目录存 GitHub Gist（稳、公开可读、无需 token），视频/封面存 Gitee Releases（存二进制）=====
        // 清单 bg-themes.json 作为某公开 Gist 的一个文件：所有人刷新即读（公开无需 token），管理员上传时用站点自动 GitHub Token 写回。
        // 视频/封面仍是 Gitee（桌面端自动读系统环境变量 GITEE_TOKEN，网页版手动粘贴）——二进制不适合 Gist。
        const BG_THEMES_HIDE_KEY = 'TFJL_BG_THEMES_HIDE';
        const BG_THEMES_MANIFEST = 'bg-themes.json';
        const BG_THEMES_CACHE_KEY = 'TFJL_BG_THEMES_CACHE';
        const BG_THEMES_GIST_CONF = 'bg-themes-gist.json';        // 仓库公开文件，存 {gistId, owner}；零配置读取来源
        const BG_THEMES_GIST_OVERRIDE = 'tfjl_bg_gist_override'; // 本机覆盖（管理员自测用）
        const BG_THEMES_GIST_OWNER_OVERRIDE = 'tfjl_bg_gist_owner_override';
        let _bgGistInfoCache = null;
        let _bgDefaultBg = ''; // 清单里配置的默认背景（如 bvid:<id> / builtin:<url>），应用背景时优先
        let _bgDefPreloadTried = false; // 首启无清单缓存时，异步补拉默认背景只做一次
        // 取清单 Gist 信息 {id, owner}：本机覆盖 > 仓库公开文件 {gistId, owner} > 空（尚未配置）
        function bgThemesGistInfo() {
            if (_bgGistInfoCache) return Promise.resolve(_bgGistInfoCache);
            const ov = bgLs(BG_THEMES_GIST_OVERRIDE);
            if (ov) { _bgGistInfoCache = { id: ov, owner: bgLs(BG_THEMES_GIST_OWNER_OVERRIDE) }; return Promise.resolve(_bgGistInfoCache); }
            return fetch(new URL(BG_THEMES_GIST_CONF, location.href).href, { cache: 'no-cache' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (j) {
                    _bgGistInfoCache = { id: (j && j.gistId) ? j.gistId : '', owner: (j && j.owner) ? j.owner : '' };
                    return _bgGistInfoCache;
                })
                .catch(function () { _bgGistInfoCache = { id: '', owner: '' }; return _bgGistInfoCache; });
        }
        function bgThemesGistId() { return bgThemesGistInfo().then(function (i) { return i.id; }); }
        // 桌面端：本机未保存 Token 时，尝试从系统环境变量 GITEE_TOKEN 读取（复用用户曾设置的那个）
        let _bgEnvTokTried = false, _bgEnvTok = '';
        function bgGetEnvGiteeToken() {
            if (_bgEnvTokTried) return Promise.resolve(_bgEnvTok);
            _bgEnvTokTried = true;
            const fn = (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') ? window.__TAURI_INTERNALS__.invoke
                : (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') ? window.__TAURI__.core.invoke
                : (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') ? window.__TAURI__.invoke : null;
            if (!fn) return Promise.resolve('');
            return fn('get_gitee_token_env', {}).then(function (v) { _bgEnvTok = (v && typeof v === 'string') ? v : ''; return _bgEnvTok; }).catch(function () { return ''; });
        }
        // 拉取内置视频清单：优先 1 小时内的本地缓存；失败回退旧缓存；彻底失败返回空数组
        // 清单结构：{ v, themes:[视频主题], statics:[后台新增静态背景图], staticsRemoved:[全局删除的内置图URL] }
        function bgNormalizeManifest(obj) {
            obj = obj || {};
            return {
                v: obj.v || 1,
                themes: Array.isArray(obj.themes) ? obj.themes : [],
                statics: Array.isArray(obj.statics) ? obj.statics : [],
                staticsRemoved: Array.isArray(obj.staticsRemoved) ? obj.staticsRemoved : [],
                defaultBg: (typeof obj.defaultBg === 'string') ? obj.defaultBg : ''
            };
        }
        // 同步取默认背景：优先内存，其次本机清单缓存（首启无缓存时返回空，由异步预加载补上）
        function bgDefaultBgSync() {
            if (_bgDefaultBg) return _bgDefaultBg;
            try {
                const c = JSON.parse(localStorage.getItem(BG_THEMES_CACHE_KEY) || 'null');
                if (c && typeof c.defaultBg === 'string') return c.defaultBg;
            } catch (e) {}
            return '';
        }
        function bgManifestLoad(force) {
            const cached = (function () {
                try {
                    const c = JSON.parse(localStorage.getItem(BG_THEMES_CACHE_KEY) || 'null');
                    if (c && (Array.isArray(c.themes) || Array.isArray(c.statics)) && Date.now() - (c.ts || 0) < 3600 * 1000) return c;
                } catch (e) {}
                return null;
            })();
            if (cached && !force) { const m0 = bgNormalizeManifest(cached); _bgDefaultBg = m0.defaultBg; return Promise.resolve(m0); }
            // 清单 bg-themes.json 托管在 GitHub Gist。走 API + 站点注入的 GitHub Token（每个用户页面都带），
            // 认证请求额度 5000/h，不会像匿名请求那样被 60/h 限流；比 raw CDN 更快（用户实测/明确要求）。
            return bgThemesGistInfo().then(function (info) {
                if (!info.id) { _bgDefaultBg = ''; return bgNormalizeManifest(null); }
                const tok = (window.AllianceDB && typeof window.AllianceDB.ghToken === 'function') ? window.AllianceDB.ghToken() : '';
                const headers = { 'Accept': 'application/vnd.github.v3+json' };
                if (tok) headers['Authorization'] = 'token ' + tok;
                return fetch('https://api.github.com/gists/' + encodeURIComponent(info.id), { cache: 'no-cache', headers: headers })
                    .then(function (r) { if (!r.ok) throw new Error('清单读取失败(HTTP ' + r.status + ')'); return r.json(); })
                    .then(function (g) {
                        const c = g && g.files && g.files[BG_THEMES_MANIFEST] && g.files[BG_THEMES_MANIFEST].content;
                        let obj = null;
                        if (c) { try { obj = JSON.parse(c); } catch (e) {} }
                        const m = bgNormalizeManifest(obj);
                        _bgDefaultBg = m.defaultBg;
                        try { localStorage.setItem(BG_THEMES_CACHE_KEY, JSON.stringify(Object.assign({ ts: Date.now() }, m))); } catch (e2) {}
                        return m;
                    });
            })
            .catch(function () { const m2 = bgNormalizeManifest(cached); _bgDefaultBg = m2.defaultBg; return m2; });
        }
        function bgThemesLoad(force) { return bgManifestLoad(force).then(function (m) { return m.themes; }); }
        // 应用内置视频主题：优先 IndexedDB 本地缓存（首拉落盘后零网络），同时清理上一个内置视频缓存防爆盘
        let bgBuiltinVideoUrl = null;
        let bgBuiltinVideoThemeId = null;
        function bgApplyBuiltinVideo(theme) {
            const vurl = theme && theme.video;
            if (!vurl) return Promise.reject(new Error('no url'));
            const themeId = theme && theme.id;
            const applySrc = function (src) {
                stopBgVideo();
                bgBuiltinVideoUrl = src;
                bgBuiltinVideoThemeId = themeId || null; // stopBgVideo 会清空，这里恢复标记（用于「使用中」高亮）
                const v = ensureBgVideo();
                bgApplyVideoSound(v);
                v.__bgDecodeBad = false; // 新视频重置解码失败标记（ensureBgVideo 的守卫会在 metadata 到达时判定）
                v.src = src;
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
            };
            // 🔴 Gitee 不返回 CORS 头，fetch(vurl) 必被浏览器拦（Failed to fetch，即「下载不了」）。
            //    <video src> 直连不受 CORS 限制，故不再 fetch 下载；有本机缓存 blob 就优先用，否则直连播放。
            return bgAssetGet(vurl).catch(function () { return null; }).then(function (blob) {
                applySrc(blob ? URL.createObjectURL(blob) : vurl);
            }).catch(function (e) {
                try { applySrc(vurl); } catch (e2) {}
                try { if (typeof showToast === 'function') showToast('⚠️ 视频播放失败：' + (e && e.message ? e.message : '网络错误')); } catch (e2) {}
            });
        }
        // 窗口最小化 / 收进托盘 / 切到后台时暂停背景视频与声音（含音频）；重新可见时自动续播。
        // 覆盖：DOM visibilitychange（浏览器切标签）、window blur/focus（最小化/托盘/失焦）、
        //       Tauri v2 onFocusChanged + 原生 tauri://blur/focus + Rust 的 tfjl-minimized/restored 精确事件。
        function bgHasActiveVideo() { return !!(bgVideoUrl || bgBuiltinVideoUrl); }
        function bgPauseForHidden() {
            // 不再用 bgHasActiveVideo 兜底：只要元素在播就暂停（避免变量未置位时漏暂停）
            const v = document.getElementById('bgVideo');
            if (v && !v.paused) { try { v.pause(); } catch (e) {} }
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
        // 只「最小化 / 收托盘 / 页面隐藏」暂停；单纯失焦或被其它窗口遮挡**不暂停**（窗口置顶悬浮时仍可播）。
        window.addEventListener('focus', bgResumeForVisible);
        // 桌面端（Tauri v2）：修正旧代码误用的 onEvent（v2 无此方法 → 整段静默失效，最小化/托盘照播）
        (function () {
            try {
                const T = window.__TAURI__;
                if (!T) return;
                const W = T.window;
                const w = (W && typeof W.getCurrentWindow === 'function') ? W.getCurrentWindow() : null;
                if (w) {
                    if (typeof w.onFocusChanged === 'function') {
                        const p = w.onFocusChanged(function (e) {
                            if (e && e.payload) { bgResumeForVisible(); return; }
                            // 失焦后精确判断：只有真最小化或窗口不可见（收托盘）才暂停，普通遮挡/切窗口不打断
                            const pm = (typeof w.isMinimized === 'function') ? w.isMinimized().catch(function () { return false; }) : Promise.resolve(false);
                            const pv = (typeof w.isVisible === 'function') ? w.isVisible().catch(function () { return true; }) : Promise.resolve(true);
                            Promise.all([pm, pv]).then(function (r) {
                                if (r[0] || !r[1]) bgPauseForHidden();
                            }).catch(function () {});
                        });
                        if (p && p.catch) p.catch(function () {});
                    }
                    if (typeof w.listen === 'function') {
                        // 不监听 tauri://blur 暂停（会误伤「被遮挡/切窗口」）；focus 恢复保留
                        try { const p2 = w.listen('tauri://focus', function () { bgResumeForVisible(); }); if (p2 && p2.catch) p2.catch(function () {}); } catch (e) {}
                    }
                }
                const E = T.event;
                if (E && typeof E.listen === 'function') {
                    // Rust 端精确事件（lib.rs：Focused(false)+is_minimized → tfjl-minimized；Focused(true) → tfjl-restored）
                    try { const p3 = E.listen('tfjl-minimized', function () { bgPauseForHidden(); }); if (p3 && p3.catch) p3.catch(function () {}); } catch (e) {}
                    try { const p4 = E.listen('tfjl-restored', function () { bgResumeForVisible(); }); if (p4 && p4.catch) p4.catch(function () {}); } catch (e) {}
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
            let val = (localStorage.getItem(BG_KEY) || '').trim();
            if (!val || val === 'default') {
                // 🟢 管理员在清单里配置的默认背景优先（bvid:<视频主题> / builtin:<图片URL>）
                const def = bgDefaultBgSync();
                if (def) {
                    val = def;
                } else {
                    // 首启无清单缓存：异步补拉一次，拿到默认背景后自动重应用（用户未自定义背景时）
                    if (!_bgDefPreloadTried) {
                        _bgDefPreloadTried = true;
                        bgManifestLoad().then(function (m) {
                            const cur = (localStorage.getItem(BG_KEY) || '').trim();
                            if ((!cur || cur === 'default') && m && m.defaultBg) applyUserBackground();
                        }).catch(function () {});
                    }
                    // 回退旧默认：内置「美女2」；用户自己改过背景后存了各自值，不再走到这里。
                    bgRevokeUrl(); stopBgVideo();
                    const girl2Gone = (typeof bgHiddenBuiltins === 'function' && bgHiddenBuiltins().indexOf('bg/bg-girl2.jpg') >= 0);
                    if (!girl2Gone) {
                        // 走本地缓存（首拉落盘后永久本地读取，不再每次启动都远端拉取）
                        bgApplyAsset('bg/bg-girl2.jpg');
                    } else {
                        bgRevokeBuiltinUrl();
                    }
                    applyBgBlur();
                    return;
                }
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
                        if (!t) {
                            // 默认主题被下架/删除：回退旧默认图（美女2），避免背景空白；同时清掉失效的默认值
                            try { if (typeof showToast === 'function') showToast('⚠️ 默认背景主题已下架，已回退默认图'); } catch (e) {}
                            _bgDefaultBg = '';
                            bgRevokeUrl(); stopBgVideo();
                            const girl2Gone = (typeof bgHiddenBuiltins === 'function' && bgHiddenBuiltins().indexOf('bg/bg-girl2.jpg') >= 0);
                            if (!girl2Gone) bgApplyAsset('bg/bg-girl2.jpg'); else bgRevokeBuiltinUrl();
                            applyBgBlur();
                            return;
                        }
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
            // 🖼️ 静态背景图：内置默认（可被后台全局删除）+ 后台新增，统一异步渲染（需要读 Gist 清单）
            rows.push('<div style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin:12px 0 6px;">🖼️ 内置背景图（右上角 ✕ 可删除）</div>');
            rows.push('<div id="bgStaticList" style="display:flex;flex-wrap:wrap;gap:8px;"></div>');
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
            try { bgRevokeBuiltinThumbs(); } catch (e) {}
            renderBgStaticList();
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
        // 用户设置窗「🖼️ 内置背景图」：内置默认（后台可全局删除）+ 后台新增静态图，统一渲染
        function renderBgStaticList() {
            const box = document.getElementById('bgStaticList');
            if (!box) return;
            box.innerHTML = '<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);">加载中…</div>';
            bgManifestLoad().then(function (m) {
                if (!box.isConnected) return;
                const removed = m.staticsRemoved || [];
                const hidden = bgHiddenBuiltins();
                const items = [];
                BG_BUILTIN.forEach(function (b) {
                    if (removed.indexOf(b.url) >= 0) return;
                    if (hidden.indexOf(b.url) >= 0) return;
                    items.push({ name: b.name, url: b.url });
                });
                (m.statics || []).forEach(function (s) {
                    if (!s || !s.url) return;
                    if (hidden.indexOf(s.url) >= 0) return;
                    items.push({ name: s.name || '背景图', url: s.url });
                });
                if (!items.length) { box.innerHTML = '<div style="font-size:0.72rem;color:rgba(255,255,255,0.3);">暂无内置背景图</div>'; return; }
                box.innerHTML = '';
                items.forEach(function (it) {
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'position:relative;';
                    const btn = document.createElement('button');
                    btn.setAttribute('data-bgthumb', it.url);
                    btn.textContent = it.name;
                    btn.style.cssText = 'padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);background-size:cover;background-position:center;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.85);cursor:pointer;font-size:0.8rem;min-width:96px;min-height:40px;';
                    btn.onclick = function () { window.__setBgBuiltin(it.url); };
                    wrap.appendChild(btn);
                    const del = document.createElement('button');
                    del.textContent = '✕';
                    del.title = '本机不再显示';
                    del.style.cssText = 'position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e53935;border:none;color:#fff;font-size:0.66rem;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.5);';
                    del.onclick = function () { window.__bgHideBuiltin(it.url); };
                    wrap.appendChild(del);
                    box.appendChild(wrap);
                });
                // 缩略图：后台新增的 Gitee 图直接 URL（图片跨域不受 CORS 限制）；内置图走本地缓存（首拉落盘）
                box.querySelectorAll('[data-bgthumb]').forEach(function (b2) {
                    const u = b2.getAttribute('data-bgthumb');
                    if (!u) return;
                    const useBlob = function (blob) {
                        try { const bu = URL.createObjectURL(blob); bgBuiltinThumbUrls.push(bu); b2.style.backgroundImage = 'url(' + bu + ')'; } catch (e) {}
                    };
                    if (/^https?:/i.test(u) && u.indexOf('gitee.com') >= 0) { b2.style.backgroundImage = 'url("' + u.replace(/"/g, '') + '")'; return; }
                    bgAssetGet(u).catch(function () { return null; }).then(function (blob) {
                        if (blob) { useBlob(blob); return; }
                        fetch(u).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
                            if (!b) { b2.style.backgroundImage = 'url(' + u + ')'; return; }
                            useBlob(b);
                            bgAssetPut(u, b).catch(function () {});
                        }).catch(function () { b2.style.backgroundImage = 'url(' + u + ')'; });
                    });
                });
            });
        }
        function renderBgVideoThemes() {
            const wrap = document.getElementById('bgVideoThemeWrap');
            const box = document.getElementById('bgVideoThemeList');
            if (!wrap || !box) return;
            bgRevokeVideoThemeThumbs();
            const cur = (localStorage.getItem(BG_KEY) || '').trim();
            bgManifestLoad().then(function (m) {
                const list = m.themes || [];
                const defRef = m.defaultBg || '';
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
                    cap.textContent = (active ? '使用中 ' : '') + (t.name || '未命名') + (('bvid:' + t.id) === defRef ? ' · 默认' : '');
                    div.appendChild(cap);
                    box.appendChild(div);
                    if (t.cover) {
                        bgAssetGet(t.cover).catch(function () { return null; }).then(function (blob) {
                            if (!btn.isConnected) return;
                            if (blob) { const bu = URL.createObjectURL(blob); bgVideoThemeThumbUrls.push(bu); btn.style.backgroundImage = 'url(' + bu + ')'; return; }
                            // 无缓存：封面直接用网络 URL（CSS 背景跨域不受 CORS 限制，Gitee 可正常显示）
                            btn.style.backgroundImage = 'url("' + String(t.cover).replace(/"/g, '') + '")';
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
        // 确保 bg-themes release 存在（没有则创建）。
        // 注意：Gitee 创建 release 的字段是 target_commitish（不是 target_commit_id），
        // 且本仓库默认分支是 main（不是 master）——写错会导致创建失败。
        // Gitee WAF 偶发把已成功的 POST /releases 拦成假 400，故创建后复查列表确认。
        function giteeEnsureRelease(tok) {
            const base = giteeApiBase();
            const q = '?access_token=' + encodeURIComponent(tok);
            function getList() {
                return fetch(base + '/releases' + q + '&per_page=100', { cache: 'no-cache' })
                    .then(function (r) { return r.json(); })
                    .then(function (list) { return Array.isArray(list) ? list : []; });
            }
            function create() {
                const body = JSON.stringify({
                    tag_name: BG_THEMES_RELEASE_TAG,
                    name: '背景主题视频库',
                    body: '背景主题视频库（自动发布）',
                    target_commitish: 'main',
                    prerelease: false
                });
                return fetch(base + '/releases' + q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
                    .then(function (r) {
                        return r.json().then(function (j) {
                            if (j && j.id) return j; // 真的建好了
                            // 假 400 兜底：复查列表
                            return getList().then(function (list) {
                                const found = list.find(function (x) { return x && x.tag_name === BG_THEMES_RELEASE_TAG; });
                                if (found) return found;
                                throw new Error((j && (j.error_description || j.error)) || ('创建 release 失败(HTTP ' + r.status + ')'));
                            });
                        });
                    });
            }
            return getList().then(function (list) {
                const rel = list.find(function (x) { return x && x.tag_name === BG_THEMES_RELEASE_TAG; });
                if (rel) return rel;
                return create();
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
        // 直接读文件字节判断视频编码（与「本机能不能解」无关，保证跨电脑一致）。
        // MP4/MOV 的 sample entry：hvc1/hev1/dvhe/dvh1 = H.265/HEVC；avc1/avc3 = H.264；
        // vp09 = VP9；av01 = AV1。HEVC 是「有的电脑能播、有的不能」的根源（Windows 默认无解码器），统一拦掉。
        function bgDetectVideoCodec(file) {
            const CHUNK = 4 * 1024 * 1024; // 读头尾各 4MB（moov 可能在文件头或尾）
            const read = function (blob) {
                return blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function (res, rej) {
                    const fr = new FileReader();
                    fr.onload = function () { res(fr.result); };
                    fr.onerror = rej;
                    fr.readAsArrayBuffer(blob);
                });
            };
            const parts = [file.slice(0, Math.min(CHUNK, file.size))];
            if (file.size > CHUNK) parts.push(file.slice(Math.max(0, file.size - CHUNK)));
            return Promise.all(parts.map(read)).then(function (bufs) {
                const views = bufs.map(function (b) { return new Uint8Array(b); });
                const find = function (sig) {
                    const s = sig.split('').map(function (c) { return c.charCodeAt(0); });
                    for (let k = 0; k < views.length; k++) {
                        const a = views[k];
                        for (let i = 0; i + s.length <= a.length; i++) {
                            let ok = true;
                            for (let j = 0; j < s.length; j++) { if (a[i + j] !== s[j]) { ok = false; break; } }
                            if (ok) return true;
                        }
                    }
                    return false;
                };
                const hevc = find('hvc1') || find('hev1') || find('dvhe') || find('dvh1');
                let codec = 'unknown';
                if (hevc) codec = 'hevc';
                else if (find('avc1') || find('avc3')) codec = 'h264';
                else if (find('vp09')) codec = 'vp9';
                else if (find('av01')) codec = 'av1';
                return { codec: codec, hevc: hevc };
            }).catch(function () { return { codec: 'unknown', hevc: false }; });
        }
        // 自动转码：把 HEVC 等「本机能解码」的视频重编码为 H.264/MP4（Chrome 126+/WebView2 支持 MP4 录制），
        // 不支持 MP4 录制时回退 WebM（VP9/VP8）；两者都不支持才报错让用户手动转。
        // 注意：MediaRecorder 是实时录制，耗时 ≈ 视频时长，期间请勿关闭页面。
        function bgTranscodeToH264(file, onProgress) {
            return new Promise(function (resolve, reject) {
                const url = URL.createObjectURL(file);
                const v = document.createElement('video');
                v.playsInline = true; v.preload = 'auto';
                let done = false;
                const finish = function (err, out) {
                    if (done) return;
                    done = true;
                    try { v.pause(); } catch (e) {}
                    try { v.removeAttribute('src'); v.load(); } catch (e) {}
                    try { URL.revokeObjectURL(url); } catch (e) {}
                    if (err) reject(err); else resolve(out);
                };
                v.onerror = function () { finish(new Error('源视频无法解码（本机不支持该编码）')); };
                v.onloadedmetadata = function () {
                    let mime = '';
                    const cands = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4',
                        'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
                    for (let i = 0; i < cands.length; i++) {
                        try { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(cands[i])) { mime = cands[i]; break; } } catch (e) {}
                    }
                    if (!mime) { finish(new Error('当前环境不支持自动转码')); return; }
                    let stream = null;
                    try { stream = (typeof v.captureStream === 'function') ? v.captureStream() : (typeof v.mozCaptureStream === 'function' ? v.mozCaptureStream() : null); } catch (e) { stream = null; }
                    if (!stream) { finish(new Error('无法捕获视频流')); return; }
                    let rec;
                    // 码率跟随源文件（约等于源 bitrate，限制 1~4Mbps）：避免 2 分钟视频被固定 4Mbps 转成 60MB
                    const srcBps = (v.duration && v.duration > 0) ? (file.size * 8 / v.duration) : 2000000;
                    const bps = Math.max(1000000, Math.min(4000000, Math.round(srcBps)));
                    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps }); } catch (e) { finish(new Error('创建转码器失败')); return; }
                    const chunks = [];
                    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
                    rec.onerror = function (e) { finish(new Error('转码失败：' + ((e && e.error && e.error.message) || '未知'))); };
                    rec.onstop = function () {
                        const type = mime.split(';')[0];
                        const blob = new Blob(chunks, { type: type });
                        if (!blob.size) { finish(new Error('转码输出为空')); return; }
                        finish(null, { blob: blob, ext: type.indexOf('mp4') >= 0 ? '.mp4' : '.webm', mime: type });
                    };
                    const dur = v.duration || 0;
                    try { rec.start(500); } catch (e) { finish(new Error('启动转码失败')); return; }
                    const stop = function () { try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {} };
                    v.onended = stop;
                    const timer = setInterval(function () {
                        if (onProgress && dur > 0) { try { onProgress(Math.min(0.99, (v.currentTime || 0) / dur)); } catch (e) {} }
                        if (v.ended) { clearInterval(timer); stop(); }
                    }, 400);
                    const p = v.play();
                    if (p && p.catch) p.catch(function () {
                        // 自动播放策略拦截了声音 → 静音重试（会丢音频，但至少能转出画面）
                        try { v.muted = true; const p2 = v.play(); if (p2 && p2.catch) p2.catch(function () {}); } catch (e) {}
                    });
                };
                v.src = url;
            });
        }
        // 本地探测视频能否被当前浏览器解码。
        // 🔴 H.265/HEVC（hvc1）在 Chrome/WebView2 多数解不了：loadedmetadata 照常触发、duration 正常，
        //    但 videoWidth/videoHeight = 0 → 表现「只有声音没画面」。上传前拦掉，避免传上去放不出来。
        function bgProbeVideo(file) {
            return new Promise(function (resolve) {
                const url = URL.createObjectURL(file);
                const v = document.createElement('video');
                v.muted = true; v.playsInline = true; v.preload = 'metadata';
                const done = function (res) {
                    try { URL.revokeObjectURL(url); } catch (e) {}
                    try { v.removeAttribute('src'); v.load(); } catch (e) {}
                    resolve(res);
                };
                const t = setTimeout(function () { done({ ok: false, reason: 'timeout' }); }, 15000);
                v.onloadedmetadata = function () {
                    clearTimeout(t);
                    if (!v.videoWidth || !v.videoHeight) { done({ ok: false, reason: 'decode', w: v.videoWidth || 0, h: v.videoHeight || 0 }); return; }
                    done({ ok: true, w: v.videoWidth, h: v.videoHeight, dur: v.duration || 0 });
                };
                v.onerror = function () { clearTimeout(t); done({ ok: false, reason: 'error', code: v.error && v.error.code }); };
                v.src = url;
            });
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
        // 写清单到 GitHub Gist：用站点注入/本机保存的 GitHub Token 直接 PATCH（无需手动填第二把钥匙）。
        // 清单 bg-themes.json 作为该 Gist 的一个文件存在，公开可读；管理员写时自动带上 GitHub Token。
        function bgManifestWrite(data) {
            return bgThemesGistId().then(function (id) {
                if (!id) throw new Error('未配置背景主题清单 Gist：请先点「① 创建清单 Gist」或把 gistId 写入 bg-themes-gist.json');
                const files = {};
                files[BG_THEMES_MANIFEST] = { content: JSON.stringify(data, null, 2) };
                return window.AllianceDB.ghGistPatch(id, files);
            });
        }
        function bgToast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (e) {} }
        function bgEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
        function bgLs(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
        // 管理后台页面渲染
        window.renderBgThemesAdmin = function () {
            const body = document.getElementById('bgThemesAdminBody');
            if (!body) return;
            bgGetEnvGiteeToken().then(function (envTok) {
            const saved = giteeTok();
            if (!saved && envTok) { try { localStorage.setItem(BG_THEMES_TOKEN_KEY, envTok); } catch (e) {} }
            const curTok = saved || envTok;
            const tokStatus = curTok
                ? '<span style="color:#9ae6b4;">✅ 已自动读取本机/环境变量 Gitee Token（如需更换可覆盖）</span>'
                : '<span style="color:#fbbf24;">⚠️ 未检测到 Gitee Token，请粘贴一次（仅存本机，之后自动记住）</span>';
            return bgThemesGistId().then(function (gid) {
            const gistStatus = gid
                ? '<span style="color:#9ae6b4;">✅ 清单 Gist 已配置：' + bgEsc(gid) + '（所有人公开可读）</span>'
                : '<span style="color:#fbbf24;">⚠️ 尚未配置清单 Gist（点下方「① 创建清单 Gist」后把 ID 写入 bg-themes-gist.json）</span>';
            body.innerHTML =
                '<div style="font-size:0.72rem;color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;line-height:1.7;margin-bottom:12px;">' +
                '上传后<b style="color:#ffd700;">所有人刷新页面即可看到</b>新主题；用户点应用后视频自动缓存到本机，断网也能播。<br>' +
                '🎬 <b>视频/封面</b>走 <b>Gitee Releases</b>（需 Gitee Token）；📋 <b>主题清单目录</b>走 <b>GitHub Gist</b>（站点自动 Token，无需手动填）。<br>' +
                '<span style="color:#fbbf24;">⚠️ <b>H.265/HEVC 上传时会自动转成 H.264</b>（实时转码，耗时≈视频时长，请勿关闭页面）；H.264/MP4 则直接上传。</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.78rem;color:rgba(255,255,255,0.85);">' +
                '  <span style="flex-shrink:0;">Gitee Token</span>' +
                '  <input id="bgThemesGiteeToken" type="password" placeholder="粘贴 Gitee 私人令牌（projects 权限）" value="' + bgEsc(curTok) + '" style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:0.75rem;">' +
                '  <button class="admin-btn admin-btn-secondary" onclick="(function(){var v=document.getElementById(\'bgThemesGiteeToken\').value.trim();try{localStorage.setItem(\'' + BG_THEMES_TOKEN_KEY + '\',v);}catch(e){}bgToast(v?\'✅ Token 已保存到本机\':\'已清除\');})()" style="padding:6px 10px;font-size:0.75rem;white-space:nowrap;">保存</button>' +
                '</div>' +
                '<div id="bgThemesTokStatus" style="font-size:0.7rem;margin-bottom:10px;">' + tokStatus + '</div>' +
                '<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:12px;">' +
                '  <div style="font-size:0.7rem;margin-bottom:6px;">📋 主题清单 Gist：' + gistStatus + '</div>' +
                '  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
                '    <button class="admin-btn admin-btn-secondary" onclick="window.__bgThemeCreateGist()" style="padding:6px 10px;font-size:0.75rem;white-space:nowrap;">① 创建清单 Gist</button>' +
                '    <span style="font-size:0.7rem;color:rgba(255,255,255,0.5);">或本机自测：</span>' +
                '    <input id="bgThemesGistOverride" type="text" placeholder="粘贴 Gist ID（仅本机生效）" value="' + bgEsc(bgLs(BG_THEMES_GIST_OVERRIDE)) + '" style="flex:1;min-width:120px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:0.75rem;">' +
                '    <button class="admin-btn admin-btn-secondary" onclick="(function(){var v=document.getElementById(\'bgThemesGistOverride\').value.trim();try{localStorage.setItem(\'' + BG_THEMES_GIST_OVERRIDE + '\',v);}catch(e){}bgToast(v?\'✅ 本机 Gist ID 已保存\':\'已清除\');window.renderBgThemesAdmin();})()" style="padding:6px 10px;font-size:0.75rem;white-space:nowrap;">保存</button>' +
                '  </div>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px;">' +
                '  <input id="bgThemeName" type="text" placeholder="主题名称（如：星空漫步）" style="flex:1;min-width:140px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:0.8rem;">' +
                '  <label id="bgThemeVideoLabel" style="padding:7px 12px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:0.78rem;white-space:nowrap;">🎬 选视频<input id="bgThemeVideoFile" type="file" accept="video/mp4,video/webm" style="display:none;" onchange="window.__bgThemeFileChosen(\'video\')"></label>' +
                '  <label id="bgThemeCoverLabel" style="padding:7px 12px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:0.78rem;white-space:nowrap;">🖼️ 封面(可选)<input id="bgThemeCoverFile" type="file" accept="image/*" style="display:none;" onchange="window.__bgThemeFileChosen(\'cover\')"></label>' +
                '  <button class="admin-btn" onclick="window.__bgThemeUpload()" style="padding:7px 14px;font-size:0.8rem;font-weight:bold;white-space:nowrap;">☁ 上传并上架</button>' +
                '</div>' +
                '<div id="bgThemeFileStatus" style="font-size:0.72rem;color:rgba(255,255,255,0.6);margin-bottom:10px;min-height:1em;"></div>' +
                '<div id="bgThemeUploadLog" style="font-size:0.72rem;color:rgba(255,255,255,0.55);margin-bottom:12px;min-height:1em;"></div>' +
                '<div style="color:rgba(255,255,255,0.6);font-size:0.78rem;margin-bottom:8px;">📦 已上架视频主题（点「下架」仅从清单移除，Gitee 上的文件保留）</div>' +
                '<div id="bgThemesAdminList" style="display:flex;flex-direction:column;gap:8px;"></div>' +
                '<div style="color:rgba(255,255,255,0.6);font-size:0.78rem;margin:14px 0 8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">🖼️ 静态背景图（统一管理：新增 / 删除）</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px;">' +
                '  <input id="bgStaticName" type="text" placeholder="背景图名称（如：樱花）" style="flex:1;min-width:140px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:0.8rem;">' +
                '  <label id="bgStaticFileLabel" style="padding:7px 12px;border-radius:8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:0.78rem;white-space:nowrap;">🖼️ 选图片<input id="bgStaticFile" type="file" accept="image/*" style="display:none;" onchange="window.__bgStaticFileChosen()"></label>' +
                '  <button class="admin-btn" onclick="window.__bgStaticUpload()" style="padding:7px 14px;font-size:0.8rem;font-weight:bold;white-space:nowrap;">☁ 上传并上架</button>' +
                '</div>' +
                '<div id="bgStaticFileStatus" style="font-size:0.72rem;color:rgba(255,255,255,0.6);margin-bottom:6px;min-height:1em;"></div>' +
                '<div id="bgStaticUploadLog" style="font-size:0.72rem;color:rgba(255,255,255,0.55);margin-bottom:10px;min-height:1em;"></div>' +
                '<div id="bgStaticAdminList" style="display:flex;flex-direction:column;gap:8px;"></div>';
            renderBgThemesAdminList();
            renderBgStaticAdminList();
            });
            });
        };
        // 一键创建清单 Gist（用站点自动 GitHub Token），建好后存入本机覆盖，并提示把 ID 写入仓库文件
        window.__bgThemeCreateGist = function () {
            const log = function (m) { const el = document.getElementById('bgThemeUploadLog'); if (el) el.textContent = m; };
            if (!window.AllianceDB || !window.AllianceDB.ghGistCreate) { bgToast('❌ Gist 模块未加载'); return; }
            log('① 正在用站点 GitHub Token 创建清单 Gist…');
            window.AllianceDB.ghGistCreate(
                { 'bg-themes.json': { content: JSON.stringify({ v: 1, themes: [] }, null, 2) } },
                'tfjl 背景主题清单', true
            ).then(function (g) {
                const owner = (g && g.owner && g.owner.login) ? g.owner.login : '';
                try { localStorage.setItem(BG_THEMES_GIST_OVERRIDE, g.id); } catch (e) {}
                try { localStorage.setItem(BG_THEMES_GIST_OWNER_OVERRIDE, owner); } catch (e) {}
                log('✅ 已创建 Gist：' + g.id + '（owner：' + (owner || '未知') + '，已存入本机覆盖）。请把 {"gistId":"' + g.id + '","owner":"' + owner + '"} 写进仓库 bg-themes-gist.json 并提交，所有人即可零配置读取。');
                bgToast('✅ 清单 Gist 已创建：' + g.id);
                window.renderBgThemesAdmin();
            }).catch(function (e) { log('❌ 创建失败：' + (e && e.message ? e.message : e)); bgToast('❌ 创建失败：' + (e && e.message ? e.message : e)); });
        };
        // 选文件后即时显示选中状态（文件名 + 高亮），解决"选了没反应"
        window.__bgThemeFileChosen = function (kind) {
            const fs = document.getElementById('bgThemeFileStatus');
            if (kind === 'video') {
                const f = document.getElementById('bgThemeVideoFile').files[0];
                const lab = document.getElementById('bgThemeVideoLabel');
                if (f) {
                    if (lab) { lab.style.background = 'rgba(154,230,180,0.22)'; lab.style.borderColor = '#9ae6b4'; }
                    if (fs) fs.innerHTML = '🎬 已选视频：<b style="color:#9ae6b4;">' + bgEsc(f.name) + '</b>（' + Math.round(f.size / 1048576) + ' MB）';
                } else if (fs) fs.textContent = '';
            } else {
                const f = document.getElementById('bgThemeCoverFile').files[0];
                const lab = document.getElementById('bgThemeCoverLabel');
                if (f) {
                    if (lab) { lab.style.background = 'rgba(154,230,180,0.22)'; lab.style.borderColor = '#9ae6b4'; }
                    if (fs) fs.innerHTML = '🖼️ 已选封面：<b style="color:#9ae6b4;">' + bgEsc(f.name) + '</b>';
                } else if (fs) fs.textContent = '';
            }
        };
        function renderBgThemesAdminList() {
            const box = document.getElementById('bgThemesAdminList');
            if (!box) return;
            box.innerHTML = '<div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">加载中…</div>';
            bgManifestLoad(true).then(function (m) {
                const list = m.themes || [];
                if (!box.isConnected) return;
                if (!list.length) { box.innerHTML = '<div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">还没有主题，上传第一个吧。</div>'; return; }
                box.innerHTML = '';
                list.slice().reverse().forEach(function (t) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;';
                    const cover = document.createElement('div');
                    cover.style.cssText = 'width:64px;height:36px;border-radius:4px;background:rgba(255,255,255,0.1) center/cover no-repeat;flex-shrink:0;';
                    if (t.cover) { bgAssetGet(t.cover).catch(function () { return null; }).then(function (b) { cover.style.backgroundImage = b ? ('url(' + URL.createObjectURL(b) + ')') : ('url("' + String(t.cover).replace(/"/g, '') + '")'); }); }
                    row.appendChild(cover);
                    const info = document.createElement('div');
                    info.style.cssText = 'flex:1;min-width:0;font-size:0.75rem;color:rgba(255,255,255,0.85);line-height:1.5;';
                    info.innerHTML = '<div style="font-weight:bold;">' + bgEsc(t.name || '未命名') + (m.defaultBg === 'bvid:' + t.id ? ' <span style="color:#ffd700;font-size:0.64rem;">默认</span>' : '') + '</div>' +
                        '<div style="color:rgba(255,255,255,0.45);font-size:0.68rem;word-break:break-all;">' + bgEsc(t.video || '') + '</div>' +
                        '<div style="color:rgba(255,255,255,0.4);font-size:0.66rem;">' + (t.size ? (Math.round(t.size / 1048576) + ' MB') : '') + (t.ts ? ' · ' + new Date(t.ts).toLocaleString('zh-CN', { hour12: false }) : '') + (t.codec ? ' · <b style="color:' + (t.codec === 'hevc' ? '#f87171' : '#9ae6b4') + ';">' + (t.codec === 'h264' ? 'H.264' : t.codec === 'hevc' ? 'HEVC(部分电脑不支持)' : t.codec.toUpperCase()) + '</b>' : '') + '</div>';
                    row.appendChild(info);
                    const defRef = 'bvid:' + t.id;
                    const isDef = (m.defaultBg === defRef);
                    const defBtn = document.createElement('button');
                    defBtn.className = 'admin-btn admin-btn-secondary';
                    defBtn.textContent = isDef ? '取消默认' : '设为默认';
                    defBtn.style.cssText = 'padding:5px 10px;font-size:0.72rem;flex-shrink:0;' + (isDef ? 'color:#ffd700;' : '');
                    defBtn.onclick = function () { window.__bgSetDefault(defRef); };
                    row.appendChild(defBtn);
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
            const themeId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            let vName = themeId + ((vfile.name.match(/\.(mp4|webm|mov)$/i) || ['.mp4'])[0].toLowerCase());
            (async function () {
                log('⓪ 检测视频编码…');
                // 按文件字节判编码（与本机能否解码无关）；HEVC 上传时自动转 H.264，保证换任何电脑都能播
                const codec = await bgDetectVideoCodec(vfile);
                const probe = await bgProbeVideo(vfile);
                if (!probe.ok) {
                    if (probe.reason === 'decode') throw new Error('该视频本机无法解码，无法自动转码，请用 H.264/MP4 导出后重传');
                    if (probe.reason === 'error') throw new Error('视频解析失败，请换一个文件或重新导出');
                    throw new Error('视频检测超时，请重试');
                }
                let upFile = vfile, upCodec = codec.codec;
                if (codec.hevc) {
                    log('⓪ 检测到 H.265/HEVC，正在自动转码为 H.264…（实时转码，约需视频时长）');
                    const tr = await bgTranscodeToH264(vfile, function (p) {
                        log('⓪ 转码中… ' + Math.round(p * 100) + '%（实时转码，约需视频时长，请勿关闭页面）');
                    });
                    upFile = new File([tr.blob], themeId + tr.ext, { type: tr.mime });
                    upCodec = tr.mime.indexOf('mp4') >= 0 ? 'h264' : 'webm';
                    vName = themeId + tr.ext;
                    log('⓪ 转码完成：' + Math.round(upFile.size / 1048576) + ' MB（' + (upCodec === 'h264' ? 'H.264/MP4' : 'WebM') + '）');
                }
                log('① 检查 Gitee 发行版…');
                const rel = await giteeEnsureRelease(tok);
                const rid = rel && rel.id;
                if (!rid) throw new Error('无法创建/获取 Gitee release（检查 Token 权限：projects）');
                log('② 上传视频 ' + upFile.name + '（' + Math.round(upFile.size / 1048576) + 'MB）…');
                await giteeUploadFile(tok, rid, upFile, vName);
                let coverBlob = null, cName = '';
                if (cfile) { coverBlob = cfile; cName = themeId + '.jpg'; }
                else {
                    log('③ 未传封面，从视频抓帧…');
                    try { coverBlob = await bgGrabVideoFrame(upFile); cName = themeId + '.jpg'; } catch (e) { coverBlob = null; }
                }
                if (coverBlob) { log('④ 上传封面…'); await giteeUploadFile(tok, rid, coverBlob, cName); }
                log('⑤ 读取并更新主题清单（GitHub Gist）…');
                const m = await bgManifestLoad(true).catch(function () { return bgNormalizeManifest(null); });
                const theme = { id: themeId, name: name, video: giteeDlUrl(vName), cover: coverBlob ? giteeDlUrl(cName) : '', size: upFile.size, ts: Date.now(), codec: upCodec };
                m.themes.push(theme);
                await bgManifestWrite(m);
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                log('✅ 上架成功！所有人刷新页面即可在「🎬 内置视频」看到「' + name + '」');
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
        // 下架（仅从清单移除，Gitee 上的视频/封面文件保留；清单写回 GitHub Gist，用站点自动 Token）
        window.__bgThemeRemove = function (id) {
            if (!window.confirm('确定下架这个主题？（仅从清单移除，Gitee 上的文件保留）')) return;
            bgManifestLoad(true).then(function (m) {
                m.themes = (m.themes || []).filter(function (t) { return t.id !== id; });
                // 下架的正好是默认背景 → 清掉 defaultBg，避免指向不存在的主题
                if (m.defaultBg === 'bvid:' + id) { m.defaultBg = ''; _bgDefaultBg = ''; }
                return bgManifestWrite(m);
            }).then(function () {
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                bgToast('✅ 已下架');
                renderBgThemesAdminList();
            }).catch(function (e) { bgToast('❌ 下架失败：' + (e && e.message ? e.message : e)); });
        };

        // ===== 静态背景图后台管理（新增/删除；内置默认图可全局删除/恢复）=====
        window.__bgStaticFileChosen = function () {
            const el = document.getElementById('bgStaticFile');
            const f = el && el.files && el.files[0];
            const lab = document.getElementById('bgStaticFileLabel');
            const st = document.getElementById('bgStaticFileStatus');
            if (f) {
                if (lab) { lab.style.background = 'rgba(154,230,180,0.22)'; lab.style.borderColor = '#9ae6b4'; }
                if (st) st.innerHTML = '🖼️ 已选图片：<b style="color:#9ae6b4;">' + bgEsc(f.name) + '</b>（' + Math.round(f.size / 1024) + ' KB）';
            } else if (st) st.textContent = '';
        };
        window.__bgStaticUpload = function () {
            const tok = (document.getElementById('bgThemesGiteeToken').value || '').trim();
            const name = (document.getElementById('bgStaticName').value || '').trim();
            const f = document.getElementById('bgStaticFile').files[0];
            const log = function (m) { const el = document.getElementById('bgStaticUploadLog'); if (el) el.textContent = m; };
            if (!tok) { bgToast('⚠️ 请先填写 Gitee Token'); return; }
            if (!name) { bgToast('⚠️ 请填背景图名称'); return; }
            if (!f) { bgToast('⚠️ 请选择图片'); return; }
            if (f.size > 20 * 1024 * 1024) { bgToast('⚠️ 图片超 20MB，请先压缩'); return; }
            const sid = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const ext = (f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i) || ['.jpg'])[0].toLowerCase();
            const sName = sid + ext;
            (async function () {
                log('① 检查 Gitee 发行版…');
                const rel = await giteeEnsureRelease(tok);
                const rid = rel && rel.id;
                if (!rid) throw new Error('无法创建/获取 Gitee release');
                log('② 上传图片 ' + f.name + '…');
                await giteeUploadFile(tok, rid, f, sName);
                log('③ 更新清单（GitHub Gist）…');
                const m = await bgManifestLoad(true);
                m.statics = Array.isArray(m.statics) ? m.statics : [];
                m.statics.push({ id: sid, name: name, url: giteeDlUrl(sName), size: f.size, ts: Date.now() });
                await bgManifestWrite(m);
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                log('✅ 已上架：所有人刷新即可在「🖼️ 内置背景图」看到「' + name + '」');
                bgToast('✅ 静态背景「' + name + '」已上架');
                document.getElementById('bgStaticName').value = '';
                document.getElementById('bgStaticFile').value = '';
                renderBgStaticAdminList();
            })().catch(function (e) {
                log('❌ 失败：' + (e && e.message ? e.message : e));
                bgToast('❌ 上传失败：' + (e && e.message ? e.message : e));
            });
        };
        window.__bgStaticRemove = function (id) {
            if (!window.confirm('确定删除这个静态背景图？（仅从清单移除，Gitee 文件保留）')) return;
            bgManifestLoad(true).then(function (m) {
                const rm = (m.statics || []).find(function (s) { return s.id === id; });
                if (rm && m.defaultBg === 'builtin:' + rm.url) { m.defaultBg = ''; _bgDefaultBg = ''; }
                m.statics = (m.statics || []).filter(function (s) { return s.id !== id; });
                return bgManifestWrite(m);
            }).then(function () {
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                bgToast('✅ 已删除');
                renderBgStaticAdminList();
            }).catch(function (e) { bgToast('❌ 删除失败：' + (e && e.message ? e.message : e)); });
        };
        window.__bgStaticRemoveBuiltin = function (url) {
            if (!window.confirm('确定全局删除这张内置背景图？（所有用户都不再显示）')) return;
            bgManifestLoad(true).then(function (m) {
                m.staticsRemoved = Array.isArray(m.staticsRemoved) ? m.staticsRemoved : [];
                if (m.staticsRemoved.indexOf(url) < 0) m.staticsRemoved.push(url);
                if (m.defaultBg === 'builtin:' + url) { m.defaultBg = ''; _bgDefaultBg = ''; }
                return bgManifestWrite(m);
            }).then(function () {
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                bgToast('✅ 已全局删除');
                renderBgStaticAdminList();
            }).catch(function (e) { bgToast('❌ 删除失败：' + (e && e.message ? e.message : e)); });
        };
        window.__bgStaticRestoreBuiltin = function (url) {
            bgManifestLoad(true).then(function (m) {
                m.staticsRemoved = (m.staticsRemoved || []).filter(function (u) { return u !== url; });
                return bgManifestWrite(m);
            }).then(function () {
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                bgToast('✅ 已恢复');
                renderBgStaticAdminList();
            }).catch(function (e) { bgToast('❌ 恢复失败：' + (e && e.message ? e.message : e)); });
        };
        // 设为/取消默认背景：ref = 'bvid:<视频主题id>' 或 'builtin:<图片URL>'
        window.__bgSetDefault = function (ref) {
            if (!ref) return;
            bgManifestLoad(true).then(function (m) {
                m.defaultBg = (m.defaultBg === ref) ? '' : ref;
                return bgManifestWrite(m);
            }).then(function () {
                try { localStorage.removeItem(BG_THEMES_CACHE_KEY); } catch (e) {}
                return bgManifestLoad(true);
            }).then(function (m) {
                _bgDefaultBg = m.defaultBg || '';
                bgToast(m.defaultBg ? '✅ 已设为默认背景' : '已取消默认背景');
                renderBgThemesAdminList();
                renderBgStaticAdminList();
                // 当前就是默认背景的用户，立刻切换
                const cur = (localStorage.getItem(BG_KEY) || '').trim();
                if (!cur || cur === 'default') applyUserBackground();
            }).catch(function (e) { bgToast('❌ 设置失败：' + (e && e.message ? e.message : e)); });
        };
        function renderBgStaticAdminList() {
            const box = document.getElementById('bgStaticAdminList');
            if (!box) return;
            box.innerHTML = '<div style="font-size:0.72rem;color:rgba(255,255,255,0.4);">加载中…</div>';
            bgManifestLoad(true).then(function (m) {
                if (!box.isConnected) return;
                const removed = m.staticsRemoved || [];
                const rows = [];
                (m.statics || []).forEach(function (s) { rows.push({ kind: 'custom', id: s.id, name: s.name, url: s.url, size: s.size, ts: s.ts }); });
                BG_BUILTIN.forEach(function (b) { rows.push({ kind: 'builtin', name: b.name, url: b.url, removed: removed.indexOf(b.url) >= 0 }); });
                if (!rows.length) { box.innerHTML = '<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);">暂无静态背景图</div>'; return; }
                box.innerHTML = '';
                rows.forEach(function (r) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border-radius:8px;padding:6px 8px;';
                    const thumb = document.createElement('div');
                    thumb.style.cssText = 'width:56px;height:32px;border-radius:4px;background:rgba(255,255,255,0.1) center/cover no-repeat;flex-shrink:0;';
                    if (r.url) thumb.style.backgroundImage = 'url("' + String(r.url).replace(/"/g, '') + '")';
                    row.appendChild(thumb);
                    const info = document.createElement('div');
                    info.style.cssText = 'flex:1;min-width:0;font-size:0.72rem;color:rgba(255,255,255,0.85);line-height:1.45;';
                    info.innerHTML = '<div style="font-weight:bold;">' + bgEsc(r.name || '未命名') + (r.kind === 'builtin' ? ' <span style="color:rgba(255,255,255,0.4);font-size:0.64rem;">内置</span>' : '') +
                        (r.removed ? ' <span style="color:#f87171;font-size:0.64rem;">已删</span>' : '') +
                        (m.defaultBg === 'builtin:' + r.url ? ' <span style="color:#ffd700;font-size:0.64rem;">默认</span>' : '') + '</div>' +
                        '<div style="color:rgba(255,255,255,0.4);font-size:0.62rem;word-break:break-all;">' + bgEsc(r.url || '') + '</div>' +
                        (r.size ? '<div style="color:rgba(255,255,255,0.35);font-size:0.62rem;">' + Math.round(r.size / 1024) + ' KB' + (r.ts ? ' · ' + new Date(r.ts).toLocaleString('zh-CN', { hour12: false }) : '') + '</div>' : '');
                    row.appendChild(info);
                    if (!r.removed && r.url) {
                        const defRef = 'builtin:' + r.url;
                        const isDef = (m.defaultBg === defRef);
                        const dbtn = document.createElement('button');
                        dbtn.className = 'admin-btn admin-btn-secondary';
                        dbtn.textContent = isDef ? '取消默认' : '设为默认';
                        dbtn.style.cssText = 'padding:4px 9px;font-size:0.7rem;flex-shrink:0;' + (isDef ? 'color:#ffd700;' : '');
                        dbtn.onclick = function () { window.__bgSetDefault(defRef); };
                        row.appendChild(dbtn);
                    }
                    const btn = document.createElement('button');
                    btn.className = 'admin-btn admin-btn-secondary';
                    btn.style.cssText = 'padding:4px 9px;font-size:0.7rem;flex-shrink:0;';
                    if (r.kind === 'custom') { btn.textContent = '删除'; btn.onclick = function () { window.__bgStaticRemove(r.id); }; }
                    else if (r.removed) { btn.textContent = '恢复'; btn.onclick = function () { window.__bgStaticRestoreBuiltin(r.url); }; }
                    else { btn.textContent = '删除'; btn.onclick = function () { window.__bgStaticRemoveBuiltin(r.url); }; }
                    row.appendChild(btn);
                    box.appendChild(row);
                });
            });
        }

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
        