
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

        // 性能模式菜单高亮当前选中项（打开菜单时刷新）
        function updatePerfModeVisibility() {
            let mode = 'high';
            try { mode = localStorage.getItem('tdjl_perf_mode') || 'high'; } catch (e) {}
            const map = { high: 'menuPerfHigh', optimized: 'menuPerfOptimized', lite: 'menuPerfLite' };
            ['menuPerfHigh', 'menuPerfOptimized', 'menuPerfLite'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (id === map[mode]) {
                    el.style.background = 'rgba(255,215,0,0.18)';
                    el.style.color = '#ffd54f';
                    el.style.fontWeight = 'bold';
                } else {
                    el.style.background = 'transparent';
                    el.style.color = '#fff';
                    el.style.fontWeight = 'normal';
                }
            });
        }
        window.updatePerfModeVisibility = updatePerfModeVisibility;

        // 点击其他地方关闭菜单
        document.addEventListener('click', function(e) {
            const menu = document.getElementById('backupMenu');
            if (menu && !e.target.closest('#backupMenu') && !e.target.closest('[onclick*="toggleBackupMenu"]')) {
                menu.style.display = 'none';
            }
        });

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

        // 1️⃣ 跟随拖尾特效
        const trailColors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#8b00ff'];
        function handleTrailEffect(e) {
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

            for (let i = 0; i < 30; i++) {
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
        