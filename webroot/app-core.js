
        // ==================== 控制台日志捕获（Tauri APP 无法 F12，在此捕获供管理员面板查看） ====================
        window.__consoleLogs = [];
        const MAX_CONSOLE_LOGS = 500;
        (function captureConsole() {
            const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
            function addLog(level, args) {
                const now = new Date();
                const time = now.toTimeString().slice(0, 8);
                const msg = Array.from(args).map(a => {
                    if (a instanceof Error) return a.stack || a.message;
                    if (typeof a === 'object') try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); }
                    return String(a);
                }).join(' ');
                window.__consoleLogs.push({ time, level, msg });
                if (window.__consoleLogs.length > MAX_CONSOLE_LOGS) window.__consoleLogs.splice(0, 100);
                orig[level] && orig[level].apply(console, args);
            }
            console.log = (...args) => addLog('log', args);
            console.warn = (...args) => addLog('warn', args);
            console.error = (...args) => addLog('error', args);
            console.info = (...args) => addLog('info', args);
        })();
        window.__consoleLogs.push({ time: new Date().toTimeString().slice(0, 8), level: 'info', msg: '控制台日志捕获已启动' });

        // ==================== IndexedDB 项目管理 ====================
        let currentProjectName = '默认项目';
        let currentProjectCategory = '默认分类';
        let db = null;
        const DB_NAME = 'TFJLProjectsDB';
        const DB_VERSION = 2;
        const STORE_NAME = 'projects';
        const CATEGORIES_STORE = 'categories';
        let categories = ['默认分类', '暗月', '寒冰', '漩涡', '深海', '临时']; // 默认分类
        
        // 默认配置项目（南门公主）
        const DEFAULT_PROJECT = {
            name: '南门公主',
            category: '深海',
            timestamp: '2026-06-06T05:20:57.138Z',
            myHandCards: [
                { id: "46", name: "水灵", placed: "u2", isEngineering: false, profession: "panda", type: "gold" },
                { id: "77", name: "死神", placed: "u1", isEngineering: false, profession: "priest", type: "purple" },
                { id: "34", name: "咕咕", placed: "u6", isEngineering: false, profession: "priest", type: "gold" },
                { id: "21", name: "蛇女", placed: "u3", isEngineering: false, profession: "archer", type: "gold" },
                { id: "47", name: "火灵", placed: "u4", isEngineering: false, profession: "panda", type: "gold" },
                { id: "55", name: "光精灵", placed: null, isEngineering: false, profession: "pokeball", type: "gold" },
                { id: "85", name: "雷精灵", placed: null, isEngineering: false, profession: "pokeball", type: "purple" },
                { id: "57", name: "木精灵", placed: null, isEngineering: false, profession: "pokeball", type: "gold" },
                { id: "custom_1780506538530", name: "火炮射线", placed: "u0", isEngineering: true, profession: "engineering", type: "gold" },
                { id: "custom_1780506403323", name: "小野酋长", placed: "u5", isEngineering: false, profession: "priest", type: "gold" }
            ],
            teammateHandCards: [
                { id: "47", name: "火灵", placed: "t6", isEngineering: false, profession: "panda", type: "gold" },
                { id: "45", name: "萌萌", placed: "t5", isEngineering: false, profession: "panda", type: "gold" },
                { id: "12", name: "女妖", placed: "t4", isEngineering: false, profession: "mage", type: "gold" },
                { id: "71", name: "骨弓", placed: "t3", isEngineering: false, profession: "archer", type: "purple" },
                { id: "66", name: "电法", placed: "t2", isEngineering: false, profession: "mage", type: "purple" },
                { id: "74", name: "悟空", placed: "t1", isEngineering: false, profession: "summoner", type: "purple" },
                { id: "56", name: "幻精灵", placed: null, isEngineering: false, profession: "pokeball", type: "gold" },
                { id: "58", name: "魔精灵", placed: null, isEngineering: false, profession: "pokeball", type: "gold" },
                { id: "55", name: "光精灵", placed: null, isEngineering: false, profession: "pokeball", type: "gold" },
                { id: "custom_1780506528280", name: "火炮宝库", placed: "t0", isEngineering: true, profession: "engineering", type: "gold" }
            ],
            myPlacedCards: [
                { id: "34", name: "咕咕", slot: "u6", isEngineering: false, profession: "priest" },
                { id: "47", name: "火灵", slot: "u4", isEngineering: false, profession: "panda" },
                { id: "21", name: "蛇女", slot: "u3", isEngineering: false, profession: "archer" },
                { id: "46", name: "水灵", slot: "u2", isEngineering: false, profession: "panda" },
                { id: "77", name: "死神", slot: "u1", isEngineering: false, profession: "priest" },
                { id: "custom_1780506538530", name: "火炮射线", slot: "u0", isEngineering: true, profession: "engineering" },
                { id: "custom_1780506403323", name: "小野酋长", slot: "u5", isEngineering: false, profession: "priest" }
            ],
            teammatePlacedCards: [
                { id: "47", name: "火灵", slot: "t6", isEngineering: false, profession: "panda" },
                { id: "45", name: "萌萌", slot: "t5", isEngineering: false, profession: "panda" },
                { id: "12", name: "女妖", slot: "t4", isEngineering: false, profession: "mage" },
                { id: "71", name: "骨弓", slot: "t3", isEngineering: false, profession: "archer" },
                { id: "66", name: "电法", slot: "t2", isEngineering: false, profession: "mage" },
                { id: "74", name: "悟空", slot: "t1", isEngineering: false, profession: "summoner" },
                { id: "custom_1780506528280", name: "火炮宝库", slot: "t0", isEngineering: true, profession: "engineering" }
            ],
            cardLevels: {},
            cardSkins: { "my_custom_1779492294329": "张顺·鱼人", "my_47": "太平乐·火灵", "my_34": "老爷爷·咕咕" },
            myDeckInfo: "",
            teammateDeckInfo: "",
            notepad: "马寒\n寒马\n死神海妖\n小野牛\n女妖可以换法师鱼人等\n主卡禁疗雷\n马寒容3级 副车血马",
            txtFiles: [
                { name: "【深海】南门死神容海妖组带人主.txt", content: "上阵：水灵,死神,小野,咕咕,蛇女,火灵,光精灵,火炮,雷精灵,木精灵,\n皮肤：咕咕3\n魔化：水灵,死神,小野,咕咕,蛇女,火灵,悟空,火炮,\n主战车：未设置\n副战车：未设置\n\n1,强制顺序上卡,光葫芦火炮,上火炮满,上咕咕,上小野,上火灵,上蛇女,上死神,上水灵,\n11,上火炮满,上咕咕满,上小野满,上火灵满,上蛇女满,上死神满,上水灵满,\n19,下火灵,\n49,光葫芦火灵,上火灵满,每4秒共100次雷精灵, \n51,停球,下火灵,\n59,光葫芦火灵,上火灵满,每4秒共100次雷精灵, \n61,停球,下火灵,\n69,光葫芦火灵,上火灵满,每4秒共100次雷精灵, \n71,停球,下火灵,\n79,光葫芦火灵,上火灵满,每4秒共100次雷精灵, \n80,停球,\n89,每4秒共100次雷精灵, \n90,停球,\n99,每4秒共100次雷精灵, 每4秒共100次木精灵, \n100,停球,\n109,每4秒共100次雷精灵, 每4秒共100次木精灵, \n\n\n\n" }
            ],
            referenceImages: []
        };

        // 初始化IndexedDB
        function initIndexedDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                
                request.onerror = function(event) {
                    console.error('IndexedDB错误:', event.target.error);
                    reject(event.target.error);
                };
                
                request.onsuccess = function(event) {
                    db = event.target.result;
                    window.db = db; // 暴露给 app-local.js 等外部脚本用于备份
                    loadCategories().then(() => {
                        // 检查是否有项目，如果没有则保存默认配置
                        checkAndSaveDefaultProject().then(() => resolve(db));
                    });
                };
                
                request.onupgradeneeded = function(event) {
                    const database = event.target.result;
                    if (!database.objectStoreNames.contains(STORE_NAME)) {
                        database.createObjectStore(STORE_NAME, { keyPath: 'name' });
                    }
                    if (!database.objectStoreNames.contains(CATEGORIES_STORE)) {
                        database.createObjectStore(CATEGORIES_STORE, { keyPath: 'name' });
                    }
                }
            });
        }
        
        // 检查并保存默认项目；重装/清缓存后优先从磁盘恢复项目
        async function checkAndSaveDefaultProject() {
            if (!db) return;

            const projects = await new Promise((res) => {
                const r = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
                r.onsuccess = () => res(r.result || []);
                r.onerror = () => res([]);
            });

            if (projects.length === 0) {
                // 重装/清缓存后：优先从磁盘恢复项目（APP 数据恢复，保留）
                let restored = [];
                if (typeof window.__tfjlRestoreAllProjects === 'function') {
                    try { restored = await window.__tfjlRestoreAllProjects(); } catch (e) { console.warn('[项目恢复] 失败:', e); }
                }
                if (restored && restored.length > 0) {
                    console.log('[项目恢复] 从磁盘恢复', restored.length, '个项目');
                    await new Promise((res) => {
                        const t = db.transaction([STORE_NAME], 'readwrite');
                        const s = t.objectStore(STORE_NAME);
                        restored.forEach(p => { try { s.put(p); } catch (e) {} });
                        t.oncomplete = res; t.onerror = res; t.onabort = res;
                    });
                    await restoreCategoriesFromLocalStorage();
                    await loadCategories();
                }
                // 不再自动注入内置「南门公主」默认项目：默认启动项目统一由 ensureDefaultProjectLoaded 加载「王城低配版」
                return;
            }

            // 注意：不再自动注入、也不再强制删除任何历史项目（含「南门公主」）。
            // 用户手动保留的项目一律保留；默认启动项目由 ensureDefaultProjectLoaded 决定（王城低配版）。
        }
        
        // 保存默认项目到 IndexedDB
        function saveDefaultProject() {
            return new Promise((resolve, reject) => {
                if (!db) {
                    reject('DB not initialized');
                    return;
                }
                
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(DEFAULT_PROJECT);
                
                request.onsuccess = function() {
                    console.log('默认配置已保存:', DEFAULT_PROJECT.name);
                    persistProjectsToDisk();
                    resolve();
                };
                
                request.onerror = function(event) {
                    console.error('保存默认配置失败:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        // 加载分类列表
        function loadCategories() {
            return new Promise((resolve, reject) => {
                if (!db) {
                    categories = ['默认分类', '暗月', '寒冰', '漩涡', '深海', '临时'];
                    window.categories = categories;
                    resolve();
                    return;
                }

                const transaction = db.transaction([CATEGORIES_STORE], 'readonly');
                const store = transaction.objectStore(CATEGORIES_STORE);
                const request = store.getAll();

                request.onsuccess = function() {
                    const defaultCategories = ['默认分类', '暗月', '寒冰', '漩涡', '深海', '临时'];
                    if (request.result && request.result.length > 0) {
                        categories = request.result.map(c => c.name);
                        // 确保默认分类存在
                        defaultCategories.forEach(cat => {
                            if (!categories.includes(cat)) {
                                categories.push(cat);
                            }
                        });
                    } else {
                        categories = defaultCategories;
                        saveCategories();
                    }
                    window.categories = categories;
                    resolve();
                };

                request.onerror = function() {
                    categories = ['默认分类', '暗月', '寒冰', '漩涡', '深海', '临时'];
                    window.categories = categories;
                    resolve();
                };
            });
        }

        // 保存分类列表
        function saveCategories() {
            return new Promise((resolve, reject) => {
                if (!db) {
                    reject('DB not initialized');
                    return;
                }

                const transaction = db.transaction([CATEGORIES_STORE], 'readwrite');
                const store = transaction.objectStore(CATEGORIES_STORE);
                store.clear();

                categories.forEach(catName => {
                    store.add({ name: catName });
                });

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        }

        // 创建新分类（弹出模态框）
        function createCategory() {
            document.getElementById('newCategoryName').value = '';
            document.getElementById('createCategoryModal').style.display = 'flex';
            document.getElementById('newCategoryName').focus();
        }

        function closeCreateCategoryModal() {
            document.getElementById('createCategoryModal').style.display = 'none';
        }

        function confirmCreateCategory() {
            const name = document.getElementById('newCategoryName').value.trim();
            if (!name) {
                alert('分类名称不能为空！');
                return;
            }
            if (categories.includes(name)) {
                alert('分类已存在！');
                return;
            }
            categories.push(name);
            saveCategories().then(() => {
                refreshCategorySelector();
                closeCreateCategoryModal();
                alert('✅ 分类"' + name + '"创建成功！');
            }).catch(e => {
                alert('❌ 创建分类失败：' + e);
            });
        }

        function refreshCategorySelector() {
            const catSel = document.getElementById('categorySelector1');
            if (!catSel) return;
            catSel.innerHTML = '<option value="">-- 选择分类 --</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catSel.appendChild(opt);
            });
        }

        // 删除分类（弹出模态框）
        let pendingDeleteCategory = '';

        function deleteCategory() {
            if (categories.length <= 1) {
                alert('至少需要保留一个分类！');
                return;
            }

            const defaultCategories = ['默认分类', '暗月', '寒冰', '漩涡', '深海', '临时', '合作', '活动', '日志', '其他'];
            // 显示删除确认模态框
            const container = document.getElementById('categoryListForSave');
            container.innerHTML = categories.map((cat, i) =>
                `<label style="display:block;padding:10px;cursor:pointer;border-bottom:1px solid #444;color:${defaultCategories.includes(cat) ? '#888' : '#fff'};">
                    <input type="radio" name="deleteCategory" value="${cat}" ${defaultCategories.includes(cat) ? 'disabled' : ''}> ${cat} ${defaultCategories.includes(cat) ? '(不可删除)' : ''}
                </label>`
            ).join('');
            document.getElementById('selectCategoryModal').style.display = 'flex';
            document.querySelector('#selectCategoryModal h3').textContent = '🗑️ 选择要删除的分类';
            document.querySelector('#selectCategoryModal button:last-child').textContent = '删除';
            document.querySelector('#selectCategoryModal button:last-child').style.background = '#f44336';
            document.querySelector('#selectCategoryModal button:last-child').onclick = confirmDeleteCategory;
        }

        function confirmDeleteCategory() {
            const selected = document.querySelector('input[name="deleteCategory"]:checked');
            if (!selected) {
                alert('请选择一个分类！');
                return;
            }

            const toDelete = selected.value;
            closeSelectCategoryModal();

            if (confirm(`确定要删除分类"${toDelete}"吗？\n该分类下的项目将移至"默认分类"。`)) {
                const idx = categories.indexOf(toDelete);
                if (idx > -1) {
                    categories.splice(idx, 1);
                    saveCategories().then(() => {
                        refreshProjectSelectors();
                        alert('✅ 分类已删除！');
                    }).catch(e => {
                        alert('❌ 删除失败：' + e);
                    });
                }
            }

            // 恢复模态框原状
            document.querySelector('#selectCategoryModal h3').textContent = '📁 选择保存到哪个分类';
            document.querySelector('#selectCategoryModal button:last-child').textContent = '保存';
            document.querySelector('#selectCategoryModal button:last-child').style.background = '#4caf50';
            document.querySelector('#selectCategoryModal button:last-child').onclick = confirmSelectCategory;
        }

        // 重命名分类（弹出模态框）
        function renameCategory() {
            if (categories.length <= 1) {
                alert('只有一个分类，无法重命名！');
                return;
            }

            const selected = prompt(`请选择要重命名的分类：\n\n${categories.map((c,i) => `${i+1}. ${c}`).join('\n')}\n\n请输入分类前的数字：`);

            if (!selected) return;

            const idx = parseInt(selected) - 1;
            if (isNaN(idx) || idx < 0 || idx >= categories.length) {
                alert('选择无效！');
                return;
            }

            const newName = prompt('请输入新分类名称：', categories[idx]);
            if (newName && newName.trim()) {
                const trimmed = newName.trim();
                if (categories.includes(trimmed)) {
                    alert('分类名称已存在！');
                    return;
                }
                categories[idx] = trimmed;
                saveCategories().then(() => {
                    refreshProjectSelectors();
                    alert('✅ 分类已重命名！');
                }).catch(e => {
                    alert('❌ 重命名失败：' + e);
                });
            }
        }

        // 更新分类按钮
        function updateCategoryButtons() {
            const container = document.getElementById('categoryButtons');
            if (!container) return;

            container.innerHTML = categories.map(cat =>
                `<button onclick="selectCategoryFilter('${cat}')" class="cat-btn">${cat}</button>`
            ).join('');
        }

        // 选择分类筛选
        function selectCategoryFilter(category) {
            currentCategoryFilter = category;
            refreshProjectSelectors();
        }

        let currentCategoryFilter = '全部';

        // 保存项目到IndexedDB
        function saveProjectToDB(projectName, category, currentData) {
            return new Promise((resolve, reject) => {
                if (!db) {
                    alert('数据库未初始化');
                    reject('DB not initialized');
                    return;
                }

                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                // 从DOM元素读取当前数据（确保即使变量未定义也能正常工作）
                const safeMyDeckInfo = document.getElementById('myDeckInfo')?.value || '';
                const safeTeammateDeckInfo = document.getElementById('teammateDeckInfo')?.value || '';
                const safeNotepad = document.getElementById('notepad')?.value || '';

                // 构建项目数据（保存当前页面的数据）
                const projectData = {
                    name: projectName,
                    category: category || '默认分类',
                    timestamp: new Date().toISOString(),
                    myHandCards: currentData?.myHandCards || (typeof myHandCards !== 'undefined' ? myHandCards : []),
                    teammateHandCards: currentData?.teammateHandCards || (typeof teammateHandCards !== 'undefined' ? teammateHandCards : []),
                    myPlacedCards: currentData?.myPlacedCards || (typeof myPlacedCards !== 'undefined' ? myPlacedCards : []),
                    teammatePlacedCards: currentData?.teammatePlacedCards || (typeof teammatePlacedCards !== 'undefined' ? teammatePlacedCards : []),
                    cardLevels: currentData?.cardLevels || (typeof cardLevels !== 'undefined' ? cardLevels : {}),
                    cardSkins: currentData?.cardSkins || (typeof cardSkins !== 'undefined' ? cardSkins : {}),
                    // 🔴 必须带 fusionSkins：手动保存会整条覆盖项目记录，若这里漏掉，persistFusionSkins 刚写好的副卡皮肤会被清空（v260805-264 修复）
                    fusionSkins: currentData?.fusionSkins || (typeof window.fusionSkins !== 'undefined' ? window.fusionSkins : {}),
                    cardMoHua: currentData?.cardMoHua || (typeof cardMoHua !== 'undefined' ? cardMoHua : {}),
                    // 【修复】新建项目显式传空串 '' 也要保留，不能用 || 被旧 DOM 值覆盖（否则新项目记事本/卡组残留旧内容）
                    myDeckInfo: (currentData && currentData.myDeckInfo !== undefined) ? currentData.myDeckInfo : safeMyDeckInfo,
                    teammateDeckInfo: (currentData && currentData.teammateDeckInfo !== undefined) ? currentData.teammateDeckInfo : safeTeammateDeckInfo,
                    notepad: (currentData && currentData.notepad !== undefined) ? currentData.notepad : safeNotepad,
                    txtFiles: currentData?.txtFiles || (typeof txtFiles !== 'undefined' ? txtFiles : []),
                    referenceImages: currentData?.referenceImages || (typeof referenceImages !== 'undefined' ? referenceImages : [])
                };

                // 保存项目数据
                const putRequest = store.put(projectData);
                
                putRequest.onsuccess = function() {
                    persistProjectsToDisk();
                    currentProjectName = projectName;
                    currentProjectCategory = category || '默认分类';
                    try { localStorage.setItem('tdjl_lastProject', projectName); } catch(e) {}
                    refreshProjectSelectors();
                    resolve();
                };
                
                putRequest.onerror = function(event) {
                    console.error('保存项目失败:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        // 从IndexedDB加载项目列表
        function loadProjectListFromDB() {
            return new Promise((resolve, reject) => {
                if (!db) {
                    reject('DB not initialized');
                    return;
                }
                
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();
                
                request.onsuccess = function(event) {
                    resolve(event.target.result || []);
                };
                
                request.onerror = function(event) {
                    console.error('加载项目列表失败:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        function loadProjectFromDB(projectName) {
            // 取消挂起的记事本自动保存定时器，防止把上一个项目的草稿写入即将打开的项目（切换/新建竞态）
            try { if (typeof notepadSaveTimer !== 'undefined' && notepadSaveTimer) clearTimeout(notepadSaveTimer); } catch (e) {}
            // 【优化】标记"过渡期"，自动保存挂起：仅在项目真正打开后才允许自动保存（见 autoSaveNotepad）
            notepadAutoSaveSuspended = true;
            return new Promise((resolve, reject) => {
                if (!db) {
                    notepadAutoSaveSuspended = false;
                    reject('DB not initialized');
                    return;
                }
                
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(projectName);
                
                request.onsuccess = function(event) {
                    const project = event.target.result;
                    if (project) {
                        clearCurrentData();
                        
                        myHandCards = Array.isArray(project.myHandCards) ? project.myHandCards : [];
                        teammateHandCards = Array.isArray(project.teammateHandCards) ? project.teammateHandCards : [];
                        myPlacedCards = Array.isArray(project.myPlacedCards) ? project.myPlacedCards : [];
                        teammatePlacedCards = Array.isArray(project.teammatePlacedCards) ? project.teammatePlacedCards : [];
                        cardLevels = project.cardLevels || {};
                        // 直接用项目自己的皮肤设置覆盖（避免上一个项目的皮肤串到这个项目）
                        cardSkins = project.cardSkins || {};
                        window.fusionSkins = project.fusionSkins || {}; // 副卡皮肤按项目独立保存，不污染全局
                        cardMoHua = project.cardMoHua || {};
                        saveCardSkins();
                        
                        if (document.getElementById('myDeckInfo')) {
                            document.getElementById('myDeckInfo').value = project.myDeckInfo || '';
                        }
                        if (document.getElementById('teammateDeckInfo')) {
                            document.getElementById('teammateDeckInfo').value = project.teammateDeckInfo || '';
                        }
                        
                        const notepad = document.getElementById('notepad');
                        if (notepad) {
                            notepad.value = project.notepad || '';
                        }
                        
                        loadTxtFilesFromProject(project);

                        currentProjectName = projectName;
                        currentProjectCategory = project.category || '默认分类';
                        // 刚加载的项目是干净的，清除"未保存"标记
                        window.__tfjlProjectDirty = false;
                        if (typeof updateSaveIndicator === 'function') updateSaveIndicator();

                        loadReferenceImagesFromProject(project);

                        try { localStorage.setItem('tdjl_lastProject', projectName); } catch(e) {}

                        updateHandDisplay('my');
                        updateHandDisplay('teammate');
                        restoreBattleSlots();
                        // 项目自带的副卡皮肤(fusionSkins)刚恢复，必须重绘融合卡，否则手牌/卡槽还是旧皮
                        if (typeof refreshAllFusionSkins === 'function') {
                            setTimeout(() => { refreshAllFusionSkins().catch(() => {}); }, 0);
                        }
                        updateFavoritesDisplay();
                        updateAllCardLevelDisplays();
                        updateDamageReductionDisplay(); // 切换项目后更新减伤显示

                        // 【修复】刷新卡池等级/皮肤徽章（基于全局预设 individualCardLevels / defaultCardSkins），
                        // 确保新建/切换项目后卡池显示与全局预设一致（魔化等上一个项目的标记被清空）
                        updateAllCardLevelBadges();

                        // 更新卡池中的常用卡标记
                        document.querySelectorAll('.card-item').forEach(card => {
                            const cardId = card.dataset.id;
                            const isFav = favoriteCards.some(f => f.id === cardId);
                            if (isFav) {
                                card.classList.add('favorite-card');
                            } else {
                                card.classList.remove('favorite-card');
                            }
                        });
                        
                        // 更新页面上的卡组等级显示
                        if (cardLevels['my']) {
                            updateDeckLevelDisplay('my', cardLevels['my']);
                        }
                        if (cardLevels['teammate']) {
                            updateDeckLevelDisplay('teammate', cardLevels['teammate']);
                        }
                        
                        resolve(project);  // 返回项目对象，供其他函数使用
                    } else {
                        reject('项目不存在');
                    }
                };
                
                request.onerror = function(event) {
                    console.error('加载项目失败:', event.target.error);
                    reject(event.target.error);
                };
            });
        }
        
        // 清空当前数据（加载项目前调用）
        function clearCurrentData() {
            // 清空手牌
            myHandCards = [];
            teammateHandCards = [];
            
            // 清空战斗槽
            myPlacedCards = [];
            teammatePlacedCards = [];
            
            // 清空战斗槽的UI
            document.querySelectorAll('.battle-slot').forEach(slot => {
                slot.innerHTML = '';
                slot.classList.remove('filled');
                slot.classList.add('empty');
                delete slot.dataset.cardId;
                delete slot.dataset.profession;
            });
            
            // 清空手牌显示
            updateHandDisplay('my');
            updateHandDisplay('teammate');

            // 【修复】清空记事本（textarea 内容 + 内存回写 + 清草稿缓存，避免跨项目残留）
            const notepadEl = document.getElementById('notepad');
            if (notepadEl) notepadEl.value = '';
            try { localStorage.removeItem('tdjl_notepad_temp'); } catch (e) {}

            // 【修复】清空脚本文件（全局变量 + 列表 UI）
            if (typeof txtFiles !== 'undefined') txtFiles = [];
            if (typeof updateTxtFilesList === 'function') updateTxtFilesList();

            // 【修复】清空参考图片/截图（全局变量 + 网格 UI）
            if (typeof referenceImages !== 'undefined') referenceImages = [];
            if (typeof renderReferenceImages === 'function') renderReferenceImages();

            // 清空卡组等级文本框
            const myDeck = document.getElementById('myDeckInfo');
            if (myDeck) myDeck.value = '';
            const tmDeck = document.getElementById('teammateDeckInfo');
            if (tmDeck) tmDeck.value = '';

            // 清空皮肤/墨化/等级（避免上个项目残留）
            if (typeof cardLevels !== 'undefined') cardLevels = {};
            if (typeof cardSkins !== 'undefined') cardSkins = {};
            window.fusionSkins = {};
            if (typeof cardMoHua !== 'undefined') cardMoHua = {};
            if (typeof updateAllCardLevelDisplays === 'function') updateAllCardLevelDisplays();
            // 刷新卡池徽章，反映清理后的全局预设状态（魔化等上一个项目的残留标记一并清除）
            if (typeof updateAllCardLevelBadges === 'function') updateAllCardLevelBadges();
        }
        
        // 更新所有卡牌等级显示
        function updateAllCardLevelDisplays() {
            Object.keys(cardLevels).forEach(handType => {
                updateDeckLevelDisplay(handType, cardLevels[handType]);
            });
        }

        // 删除项目
        function deleteProjectFromDB(projectName) {
            return new Promise((resolve, reject) => {
                if (!db) {
                    reject('DB not initialized');
                    return;
                }
                
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(projectName);
                
                request.onsuccess = function() {
                    persistProjectsToDisk();
                    resolve();
                };
                
                request.onerror = function(event) {
                    console.error('删除项目失败:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        // ==================== 项目磁盘持久化（重装/清缓存后不丢） ====================
        async function persistProjectsToDisk() {
            if (typeof window.__tfjlSaveAllProjects !== 'function') return;
            try {
                const all = await loadProjectListFromDB();
                await window.__tfjlSaveAllProjects(all);
            } catch (e) { console.warn('[项目磁盘持久化] 失败:', e); }
        }

        async function restoreCategoriesFromLocalStorage() {
            if (!db) return;
            const stored = await new Promise((res) => {
                const t = db.transaction([CATEGORIES_STORE], 'readonly');
                const r = t.objectStore(CATEGORIES_STORE).getAll();
                r.onsuccess = () => res(r.result || []);
                r.onerror = () => res([]);
            });
            if (stored.length > 0) return;
            let localCats = [];
            try { localCats = JSON.parse(localStorage.getItem('tfjl_categories') || '[]'); } catch (e) {}
            if (!Array.isArray(localCats) || localCats.length === 0) return;
            await new Promise((res) => {
                const t = db.transaction([CATEGORIES_STORE], 'readwrite');
                const s = t.objectStore(CATEGORIES_STORE);
                localCats.forEach(c => { try { s.put({ name: c }); } catch (e) {} });
                t.oncomplete = res; t.onerror = res; t.onabort = res;
            });
            console.log('[分类恢复] 从 localStorage 恢复', localCats.length, '个分类');
        }

        // 显示项目列表弹窗（点击项目名直接加载）
        async function showProjectDialog() {
            closeProjectDialog(); // 先关旧弹窗，避免叠加
            if (!db) {
                await initIndexedDB();
            }

            const projects = await loadProjectListFromDB();
            const startupProject = localStorage.getItem('tdjl_startupProject'); // 固定启动项目（null=用上次项目）

            // 顶部全宽、可下滑的面板（不再用居中小弹窗）
            let html = '<div id="projectDialogBox" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:2000;" onclick="closeProjectDialog()">';
            html += '<div onclick="event.stopPropagation()" style="position:fixed;top:0;left:0;right:0;background:linear-gradient(180deg,#1a1a2e,#16213e);box-shadow:0 10px 30px rgba(0,0,0,0.5);max-height:88vh;display:flex;flex-direction:column;">';

            // 头部：标题 + 关闭
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,215,0,0.15);">';
            html += '<h2 style="margin:0;color:#ffd700;font-size:1.15rem;">📂 选择项目</h2>';
            html += '<button onclick="closeProjectDialog()" title="关闭" style="background:rgba(255,255,255,0.08);color:#fff;border:none;width:36px;height:36px;border-radius:8px;cursor:pointer;font-size:1.2rem;line-height:1;">✕</button>';
            html += '</div>';

            // 可下滑的项目列表
            html += '<div style="overflow-y:auto;padding:12px 16px;flex:1;-webkit-overflow-scrolling:touch;">';
            if (projects.length === 0) {
                html += '<p style="color:rgba(255,255,255,0.6);text-align:center;padding:24px;">暂无保存的项目</p>';
            } else {
                projects.forEach(p => {
                    const date = new Date(p.timestamp).toLocaleString('zh-CN');
                    const isCurrent = p.name === currentProjectName;
                    const isStartup = startupProject === p.name;
                    html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:12px;margin-bottom:10px;${isCurrent ? 'border:1px solid #4fc3f7;' : 'border:1px solid rgba(255,255,255,0.06)'}">`;
                    html += `<div style="flex:1;min-width:0;cursor:pointer;" onclick="loadProjectByName('${p.name}').then(()=>closeProjectDialog()).catch(e=>alert('加载失败:'+e))">`;
                    html += `<div style="color:${isCurrent ? '#4fc3f7' : '#fff'};font-weight:bold;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}${isCurrent ? ' ✓' : ''}</div>`;
                    html += `<div style="color:rgba(255,255,255,0.5);font-size:0.8rem;margin-top:2px;">${date}</div>`;
                    html += `</div>`;
                    html += `<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">`;
                    // 启动项目星标（★=已固定为启动项目）
                    html += `<button onclick="event.stopPropagation();toggleStartupProject('${p.name}')" title="${isStartup ? '已设为启动项目（点击取消固定）' : '设为每次启动自动打开的项目'}" style="background:${isStartup ? 'linear-gradient(135deg,#ffd700,#ff9800)' : 'rgba(255,255,255,0.08)'};color:${isStartup ? '#1a1a2e' : 'rgba(255,215,0,0.85)'};border:none;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:1.15rem;line-height:1;">${isStartup ? '★' : '☆'}</button>`;
                    html += `<button onclick="event.stopPropagation();confirmDeleteProject('${p.name}')" title="删除项目" style="background:linear-gradient(135deg,#f44336,#c62828);color:white;border:none;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:1rem;line-height:1;">🗑️</button>`;
                    html += `</div>`;
                    html += `</div>`;
                });
            }
            html += '</div>';

            // 底部：启动项目说明 + 清除
            html += `<div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.08);background:rgba(255,215,0,0.05);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">`;
            html += `<div style="font-size:0.85rem;color:rgba(255,255,255,0.75);line-height:1.5;">启动自动打开：<b style="color:#ffd700;">${startupProject ? '「' + startupProject + '」' : '（上次使用的项目）'}</b></div>`;
            html += `<button onclick="clearStartupProject()" style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.2);padding:7px 14px;border-radius:8px;cursor:pointer;font-size:0.82rem;white-space:nowrap;">清除固定</button>`;
            html += `</div>`;

            html += '</div></div>';

            document.body.insertAdjacentHTML('beforeend', html);
        }

        function closeProjectDialog() {
            const d = document.getElementById('projectDialogBox');
            if (d) d.remove();
        }

        // 设置/取消"启动自动打开的项目"
        function toggleStartupProject(name) {
            const cur = localStorage.getItem('tdjl_startupProject');
            if (cur === name) localStorage.removeItem('tdjl_startupProject');
            else localStorage.setItem('tdjl_startupProject', name);
            showProjectDialog(); // 刷新弹窗以更新星标
        }

        function clearStartupProject() {
            localStorage.removeItem('tdjl_startupProject');
            showProjectDialog();
        }

        function confirmDeleteProject(name) {
            let projects = [];
            try { projects = loadProjectListSync(); } catch(e) {}
            const remaining = projects.filter(p => p.name !== name);
            if (remaining.length === 0) {
                if (!confirm(`「${name}」是最后一个项目。\n删除后将没有任何默认启动项目，下次打开会显示空白。\n\n确定要删除吗？`)) return;
            } else {
                if (!confirm(`确定要删除项目"${name}"吗？`)) return;
            }
            deleteProjectFromDB(name).then(async () => {
                if (name === currentProjectName) {
                    await loadFirstProjectOrBlank();
                }
                showProjectDialog();
            }).catch(e => alert('删除失败:' + e));
        }

        // 更新项目下拉菜单（按分类分组）
        function updateProjectSelector() {
            const selector = document.getElementById('projectSelector');
            if (!selector) return;

            loadProjectListFromDB().then(projects => {
                const currentValue = selector.value;
                selector.innerHTML = '<option value="">-- 选择项目 --</option>';

                // 按分类分组
                const grouped = {};
                categories.forEach(cat => grouped[cat] = []);
                grouped['未分类'] = [];

                projects.forEach(p => {
                    const cat = p.category || '未分类';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(p);
                });

                // 添加分组选项（包括没有项目的分类）
                categories.forEach(cat => {
                    const projectsInCat = grouped[cat] || [];

                    const group = document.createElement('optgroup');
                    group.label = `📁 ${cat}`;
                    selector.appendChild(group);

                    projectsInCat.forEach(p => {
                        const option = document.createElement('option');
                        option.value = p.name;
                        option.textContent = p.name + (p.name === currentProjectName ? ' ✓' : '');
                        if (p.name === currentProjectName) {
                            option.selected = true;
                        }
                        group.appendChild(option);
                    });
                });

                if (currentValue && currentValue !== currentProjectName) {
                    selector.value = currentProjectName;
                }
            }).catch(e => console.error('更新项目列表失败:', e));
        }

        // 根据下拉菜单选择加载项目
        function loadProjectByName(name) {
            if (!name) return;
            if (name === '-- 选择项目 --' || name === '') return;
            // 已是当前项目：不重载，避免丢失未保存修改
            if (name === currentProjectName) { const dlg = document.getElementById('projectDialog'); if (dlg) dlg.style.display = 'none'; return; }

            // 处理"新建项目"选项
            if (name === '__NEW__') {
                // 获取当前选中的分类
                const currentCat = document.getElementById('categorySelector1').value || '默认分类';
                const newProjectName = prompt('请输入新项目名称：', '');
                if (!newProjectName || !newProjectName.trim()) {
                    // 用户取消，恢复下拉框选中状态
                    const sel = document.getElementById('projectSelector1');
                    if (currentProjectName) {
                        sel.value = currentProjectName;
                    } else {
                        sel.value = '';
                    }
                    return;
                }
                pendingSaveProjectName = newProjectName.trim();
                const safeName = pendingSaveProjectName;
                // 直接使用当前分类创建新项目（空数据）
                const emptyData = {
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
                    txtFiles: [],
                    referenceImages: []
                };

                // 创建并加载空白项目：loadProjectFromDB 内部会 clearCurrentData() +
                // 重置所有变量 + 重绘空白工作区，确保新建项目是「全新空白」而非残留上一个项目。
                const createBlank = () => {
                    // 【修复】取消挂起的记事本防抖定时器，避免保存→加载窗口内把旧记事本写入新项目（竞态）
                    try { if (typeof notepadSaveTimer !== 'undefined' && notepadSaveTimer) clearTimeout(notepadSaveTimer); } catch (e) {}
                    saveProjectToDB(safeName, currentCat, emptyData)
                        .then(() => loadProjectFromDB(safeName))
                        .then(() => {
                            refreshProjectSelectors();
                            const sel = document.getElementById('projectSelector1');
                            if (sel) sel.value = safeName;
                            alert(`✅ 新项目"${safeName}"创建成功！\n分类：${currentCat}\n已为你打开空白工作区。`);
                        })
                        .catch(e => {
                            alert('❌ 创建失败：' + e);
                            const sel = document.getElementById('projectSelector1');
                            if (currentProjectName) { sel.value = currentProjectName; } else { sel.value = ''; }
                        });
                };

                // 新建前若当前项目有未保存改动，弹确认（保存当前 / 放弃当前），再建空白
                if (currentProjectName && currentProjectName !== safeName && window.__tfjlProjectDirty) {
                    showSwitchConfirmModal('__NEW__', createBlank);
                } else {
                    createBlank();
                }
                return;
            }

            // 【修复】切换项目前，先把当前项目（含 myPlacedCards 等）落盘；
            // 否则 loadProjectFromDB 开头的 clearCurrentData() 会清空未保存的站位，
            // 导致「上卡→保存→切项目→切回」时卡牌丢失。
            const doLoadTarget = () => {
                loadProjectFromDB(name).then(() => {
                    refreshProjectSelectors();
                    // 如果搜索面板打开，自动关闭
                    const searchPanel = document.getElementById('projectSearchPanel');
                    if (searchPanel) {
                        searchPanel.style.display = 'none';
                    }
                }).catch(e => {
                    console.error('加载项目失败:', e);
                });
            };

            if (currentProjectName && currentProjectName !== name) {
                // 不再自动落盘：有未保存修改时弹确认框（保存并切换 / 放弃修改 / 取消）
                requestSwitchProject(name);
            } else {
                doLoadTarget();
            }
        }

        // 刷新项目选择器（分类+项目下拉框）
        // 收集当前工作区内存数据（用于手动保存 / 切换确认时落盘）
        function collectCurrentProjectData() {
            return {
                myHandCards: (typeof myHandCards !== 'undefined') ? myHandCards : [],
                teammateHandCards: (typeof teammateHandCards !== 'undefined') ? teammateHandCards : [],
                myPlacedCards: (typeof myPlacedCards !== 'undefined') ? myPlacedCards : [],
                teammatePlacedCards: (typeof teammatePlacedCards !== 'undefined') ? teammatePlacedCards : [],
                cardLevels: (typeof cardLevels !== 'undefined') ? cardLevels : {},
                cardSkins: (typeof cardSkins !== 'undefined') ? cardSkins : {},
                fusionSkins: window.fusionSkins || {},
                cardMoHua: (typeof cardMoHua !== 'undefined') ? cardMoHua : {},
                myDeckInfo: (document.getElementById('myDeckInfo') ? document.getElementById('myDeckInfo').value : ''),
                teammateDeckInfo: (document.getElementById('teammateDeckInfo') ? document.getElementById('teammateDeckInfo').value : ''),
                notepad: (document.getElementById('notepad') ? document.getElementById('notepad').value : ''),
                txtFiles: (typeof txtFiles !== 'undefined') ? txtFiles : [],
                referenceImages: (typeof referenceImages !== 'undefined') ? referenceImages : []
            };
        }

        // 切换项目守卫：若当前有未保存修改，弹确认（保存并切换 / 放弃修改 / 取消）。绝不自动落盘。
        function requestSwitchProject(targetName) {
            const doLoad = () => {
                loadProjectFromDB(targetName).then(() => {
                    refreshProjectSelectors();
                    const sp = document.getElementById('projectSearchPanel');
                    if (sp) sp.style.display = 'none';
                }).catch(e => console.error('加载项目失败:', e));
            };
            if (window.__tfjlProjectDirty && currentProjectName && currentProjectName !== targetName) {
                showSwitchConfirmModal(targetName, doLoad);
            } else {
                doLoad();
            }
        }

        // 未保存修改确认框：保存并切换 / 放弃修改 / 取消
        function showSwitchConfirmModal(targetName, doLoad) {
            if (document.getElementById('__switchConfirm')) return;
            const isNew = (targetName === '__NEW__');
            const overlay = document.createElement('div');
            overlay.id = '__switchConfirm';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML =
                '<div style="background:#1a1a2e;border:2px solid rgba(255,215,0,0.4);border-radius:14px;padding:22px;max-width:430px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.5);">' +
                    '<div style="color:#ffd700;font-size:1.05rem;font-weight:600;margin-bottom:8px;">⚠️ 未保存的修改</div>' +
                    '<div style="color:rgba(255,255,255,0.85);font-size:0.86rem;line-height:1.55;margin-bottom:18px;">当前项目「' + (currentProjectName || '') + '」有未保存的改动（如下卡槽、移动卡牌、互换位置等）。' + (isNew ? '新建前请选择：' : '切换前请选择：') + '</div>' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<button id="__scSave" style="flex:1;min-width:120px;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#4ade80,#22c55e);color:#fff;cursor:pointer;font-weight:600;">💾 保存并切换</button>' +
                        '<button id="__scDiscard" style="flex:1;min-width:120px;padding:10px;border-radius:8px;border:1px solid rgba(255,158,128,0.5);background:rgba(255,158,128,0.12);color:#ff9e80;cursor:pointer;font-weight:600;">🗑 放弃修改</button>' +
                        '<button id="__scCancel" style="flex:1;min-width:120px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;">✖ 取消</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(overlay);
            const close = () => { overlay.remove(); };
            document.getElementById('__scSave').onclick = () => {
                const cur = collectCurrentProjectData();
                const cat = (typeof currentProjectCategory !== 'undefined' ? currentProjectCategory : '默认分类');
                saveProjectToDB(currentProjectName, cat, cur).then(() => {
                    window.__tfjlProjectDirty = false;
                    if (typeof updateSaveIndicator === 'function') updateSaveIndicator();
                    close(); doLoad();
                }).catch(() => { close(); doLoad(); });
            };
            document.getElementById('__scDiscard').onclick = () => { close(); doLoad(); };
            document.getElementById('__scCancel').onclick = () => {
                close();
                const sel = document.getElementById('projectSelector1');
                if (sel && currentProjectName) sel.value = currentProjectName;
            };
        }

        function refreshProjectSelectors() {
            // 先加载项目列表
            loadProjectListFromDB().then(allProjects => {
                window.projects = allProjects;

                // 刷新分类下拉框
                const catSel = document.getElementById('categorySelector1');
                if (catSel) {
                    catSel.innerHTML = '<option value="">-- 选择分类 --</option>';
                    categories.forEach(cat => {
                        const opt = document.createElement('option');
                        opt.value = cat;
                        opt.textContent = cat;
                        if (cat === currentProjectCategory) opt.selected = true;
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

                // 刷新项目下拉框（只显示选中分类的项目）
                const projSel = document.getElementById('projectSelector1');
                if (projSel) {
                    projSel.innerHTML = '<option value="">-- 选择项目 --</option>';
                    // 添加"新增项目"选项
                    const newOpt = document.createElement('option');
                    newOpt.value = '__NEW__';
                    newOpt.textContent = '➕ 新建项目';
                    newOpt.style.color = '#4ade80';
                    newOpt.style.fontWeight = 'bold';
                    projSel.appendChild(newOpt);
                    const cat = currentProjectCategory || '默认分类';
                    allProjects.filter(p => p.category === cat).forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.name;
                        opt.textContent = p.name;
                        if (p.name === currentProjectName) opt.selected = true;
                        projSel.appendChild(opt);
                    });
                }
            }).catch(e => console.error('刷新项目选择器失败:', e));
        }

        // 自动保存记事本到当前项目（防抖）
        let notepadSaveTimer = null;
        // 切换/新建项目过渡期挂起记事本自动保存：仅在项目"已打开"时才自动保存，
        // 防止过渡窗口内把上一个项目的旧记事本写入新项目（配合 loadProjectFromDB 的清空）
        let notepadAutoSaveSuspended = false;
        function autoSaveNotepad() {
            if (notepadSaveTimer) clearTimeout(notepadSaveTimer);
            notepadSaveTimer = setTimeout(() => {
                if (!db || !currentProjectName || currentProjectName === '默认项目') {
                    // 保存到localStorage作为临时备份
                    localStorage.setItem('tdjl_notepad_temp', document.getElementById('notepad')?.value || '');
                    return;
                }
                // 保存到当前项目（使用当前分类），传递完整数据
                const currentData = {
                    myHandCards: typeof myHandCards !== 'undefined' ? myHandCards : [],
                    teammateHandCards: typeof teammateHandCards !== 'undefined' ? teammateHandCards : [],
                    myPlacedCards: typeof myPlacedCards !== 'undefined' ? myPlacedCards : [],
                    teammatePlacedCards: typeof teammatePlacedCards !== 'undefined' ? teammatePlacedCards : [],
                    cardLevels: typeof cardLevels !== 'undefined' ? cardLevels : {},
                    cardSkins: typeof cardSkins !== 'undefined' ? cardSkins : {},
                    cardMoHua: typeof cardMoHua !== 'undefined' ? cardMoHua : {},
                    myDeckInfo: document.getElementById('myDeckInfo')?.value || '',
                    teammateDeckInfo: document.getElementById('teammateDeckInfo')?.value || '',
                    notepad: document.getElementById('notepad')?.value || '',
                    txtFiles: typeof txtFiles !== 'undefined' ? txtFiles : [],
                    referenceImages: typeof referenceImages !== 'undefined' ? referenceImages : []
                };
                const currentCat = currentProjectCategory || '默认分类';
                saveProjectToDB(currentProjectName, currentCat, currentData).catch(e => console.error('记事本自动保存失败:', e));
            }, 1000);
        }

        // 保存字体大小设置
        function saveFontSizeSetting(size) {
            localStorage.setItem('tdjl_notepad_fontsize', size);
        }

        // 加载字体大小设置
        function loadFontSizeSetting() {
            const saved = localStorage.getItem('tdjl_notepad_fontsize');
            if (saved) {
                const selector = document.getElementById('fontSizeSelector');
                if (selector) {
                    selector.value = saved;
                    changeFontSize();
                }
            }
        }

        // 切换字体大小
        function changeFontSize() {
            const selector = document.getElementById('fontSizeSelector');
            const notepad = document.getElementById('notepad');
            if (selector && notepad) {
                const size = selector.value;
                notepad.style.fontSize = size;
                saveFontSizeSetting(size);
            }
        }

        // ==================== TXT文件管理 ====================
        let txtFiles = []; // 动态数组，支持多个TXT文件

        // 获取TXT文件数据
        function getTxtFilesData() {
            return txtFiles.map(f => ({name: f.name, content: f.content}));
        }

        // 更新TXT文件列表显示
        function updateTxtFilesList() {
            const list = document.getElementById('txtFilesList');
            if (!list) return;

            if (txtFiles.length === 0) {
                list.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:10px;text-align:center;">暂无文本文件</div>';
                return;
            }

            let html = '';
            txtFiles.forEach((file, i) => {
                html += `
                    <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.2);border-radius:8px;padding:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div style="flex:1;overflow:hidden;">
                                <div style="color:#ffd700;font-weight:bold;margin-bottom:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:2px 6px 2px 0;border-radius:4px;transition:background 0.15s;" onclick="openScriptEditorTab(${i})" onmouseover="this.style.background='rgba(255,215,0,0.12)'" onmouseout="this.style.background='transparent'" title="点击在下方标签中打开编辑">📄 ${escapeHtml(file.name)}</div>
                                <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">${(file.content.length / 1024).toFixed(1)} KB</div>
                            </div>
                            <div style="display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap;">
                                <button onclick="shareTxtFileToWall(${i})" title="分享到需求墙" style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">📢</button>
                                <button onclick="openScriptNotebook({name: txtFiles[${i}].name, content: txtFiles[${i}].content, fileIndex: ${i}, readonly: false})" title="新记事本编辑" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">✏️</button>
                                <button onclick="renameTxtFile(${i})" title="重命名" style="background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">✏️</button>
                                <button onclick="downloadTxtFile(${i})" title="下载" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">📥</button>
                                <button onclick="deleteTxtFile(${i})" title="删除" style="background:linear-gradient(135deg,#f44336,#c62828);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">🗑️</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            list.innerHTML = html;
        }

        // ==================== 脚本列表多选状态 ====================
        window._selImportPaths = new Set();
        window._selShareIndices = new Set(); // 分享模式下选中的项目文件索引
        window._selShareScannedPaths = new Set(); // 分享模式下选中的扫描文件路径

        function toggleImportSelect(path, checked) {
            if (checked) { window._selImportPaths.add(path); }
            else { window._selImportPaths.delete(path); }
            refreshBatchImportBtn();
        }

        function toggleAllImportSelects(checked) {
            window._selImportPaths.clear();
            if (checked) {
                document.querySelectorAll('.import-checkbox').forEach(cb => { cb.checked = true; window._selImportPaths.add(cb.value); });
            } else {
                document.querySelectorAll('.import-checkbox').forEach(cb => { cb.checked = false; });
            }
            refreshBatchImportBtn();
        }

        function refreshBatchImportBtn() {
            const btn = document.getElementById('batchImportBtn');
            if (!btn) return;
            const n = window._selImportPaths.size;
            btn.textContent = n > 0 ? `📥 批量导入 (${n})` : '📥 批量导入';
            btn.style.opacity = n > 0 ? '1' : '0.5';
        }

        function doBatchImport() {
            const paths = Array.from(window._selImportPaths);
            if (paths.length === 0) { alert('请先勾选要导入的文件'); return; }
            if (window.batchImportFilesToProject) {
                window.batchImportFilesToProject(paths);
            }
        }

        // 分享模式：项目文件多选
        function toggleShareSelect(index, checked) {
            if (checked) { window._selShareIndices.add(index); }
            else { window._selShareIndices.delete(index); }
            refreshBatchShareBtn();
        }
        function toggleAllShareSelects(checked) {
            window._selShareIndices.clear();
            if (checked) {
                document.querySelectorAll('.share-index-checkbox').forEach(cb => { cb.checked = true; window._selShareIndices.add(parseInt(cb.value, 10)); });
            } else {
                document.querySelectorAll('.share-index-checkbox').forEach(cb => { cb.checked = false; });
            }
            refreshBatchShareBtn();
        }
        function refreshBatchShareBtn() {
            const btn = document.getElementById('batchShareBtn');
            if (!btn) return;
            const n = window._selShareIndices.size;
            btn.textContent = n > 0 ? `📢 批量分享 (${n})` : '📢 批量分享';
            btn.style.opacity = n > 0 ? '1' : '0.5';
        }
        function doBatchShareProjectFiles() {
            const indices = Array.from(window._selShareIndices).sort((a, b) => a - b);
            if (indices.length === 0) { alert('请先勾选要分享的项目文件'); return; }
            batchShareTxtFilesToWall(indices);
        }

        // 分享模式：扫描文件多选
        function toggleScannedShareSelect(path, checked) {
            if (!window._selShareScannedPaths) window._selShareScannedPaths = new Set();
            if (checked) window._selShareScannedPaths.add(path);
            else window._selShareScannedPaths.delete(path);
            refreshBatchScannedShareBtn();
        }
        function toggleAllScannedShareSelects(checked) {
            if (!window._selShareScannedPaths) window._selShareScannedPaths = new Set();
            window._selShareScannedPaths.clear();
            if (checked) {
                document.querySelectorAll('.share-scanned-checkbox').forEach(cb => { cb.checked = true; window._selShareScannedPaths.add(cb.getAttribute('data-scanned-path')); });
            } else {
                document.querySelectorAll('.share-scanned-checkbox').forEach(cb => { cb.checked = false; });
            }
            refreshBatchScannedShareBtn();
        }
        function refreshBatchScannedShareBtn() {
            const btn = document.getElementById('batchScannedShareBtn');
            if (!btn) return;
            const n = (window._selShareScannedPaths || new Set()).size;
            btn.textContent = n > 0 ? `📢 批量分享 (${n})` : '📢 批量分享';
            btn.style.opacity = n > 0 ? '1' : '0.5';
        }
        function doBatchScannedShare() {
            if (!window._selShareScannedPaths || window._selShareScannedPaths.size === 0) { alert('请先勾选要分享的扫描文件'); return; }
            const scanned = window.scannedFiles || [];
            const fileList = [];
            window._selShareScannedPaths.forEach(path => {
                const f = scanned.find(sf => sf.path === path);
                if (f) fileList.push({ path: f.path, name: f.name });
            });
            if (window.batchShareScannedFilesToWall) window.batchShareScannedFilesToWall(fileList);
        }

        // 生成可导入/可分享扫描文件的HTML（共用）
        function renderScannedFilesSection(scannedFiles, keyword, category) {
            const shareMode = isScriptFilesShareMode();
            const existingNames = new Set(txtFiles.map(f => f.name));
            let fresh = scannedFiles.filter(f => !existingNames.has(f.name));
            if (fresh.length === 0) return '';

            // 分类筛选
            if (category && category !== '全部') {
                fresh = fresh.filter(f => (f.category || '其他') === category);
            }
            if (fresh.length === 0) return '';

            // 关键字过滤
            const list = keyword ? fresh.filter(f => f.name.toLowerCase().includes(keyword)) : fresh;
            if (list.length === 0) return '';

            let html = `<div style="margin-top:12px;padding-top:10px;border-top:2px solid ${shareMode ? 'rgba(156,39,176,0.3)' : 'rgba(0,188,212,0.3)'};">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                    <div style="color:${shareMode ? '#ce93d8' : '#00bcd4'};font-size:0.85rem;font-weight:bold;">${shareMode ? '📢 可分享文件' : '📂 可导入文件'} (${list.length}个)</div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <label style="color:rgba(255,255,255,0.5);font-size:0.7rem;cursor:pointer;">
                            <input type="checkbox" onchange="${shareMode ? `toggleAllScannedShareSelects(this.checked)` : `toggleAllImportSelects(this.checked)`}" style="cursor:pointer;vertical-align:middle;"> 全选
                        </label>
                        ${shareMode ?
                            `<button id="batchScannedShareBtn" onclick="doBatchScannedShare()" style="background:linear-gradient(135deg,#ff6b6b,#ff9e80);color:white;border:none;padding:4px 12px;border-radius:5px;cursor:pointer;font-size:0.75rem;opacity:0.5;">📢 批量分享</button>` :
                            `<button id="batchImportBtn" onclick="doBatchImport()" style="background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:4px 12px;border-radius:5px;cursor:pointer;font-size:0.75rem;opacity:0.5;">📥 批量导入</button>`
                        }
                    </div>
                </div>
                <div style="overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(0,188,212,0.3) transparent;padding-right:4px;display:flex;flex-direction:column;gap:5px;">`;

            list.forEach(f => {
                const escPath = escapeHtml(f.path);
                const escName = escapeHtml(f.name);
                const fileCat = f.category || '其他';
                const catColor = getScriptFileCategoryColor(fileCat);
                let displayName = escapeHtml(f.name);
                if (keyword) {
                    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    displayName = displayName.replace(regex, `<span style="background:${catColor};color:#000;padding:0 2px;border-radius:2px;">$1</span>`);
                }
                html += `<div style="background:${catColor}15;border:1px solid ${catColor}40;border-left:3px solid ${catColor};border-radius:6px;padding:8px 10px;display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" ${shareMode ? 'class="share-scanned-checkbox"' : 'class="import-checkbox"'} value="${f.path}" data-scanned-path="${escPath}" onchange="${shareMode ? `toggleScannedShareSelect(this.getAttribute('data-scanned-path'), this.checked)` : `toggleImportSelect(this.value, this.checked)`}" style="flex-shrink:0;cursor:pointer;accent-color:${catColor};">
                    <div style="flex:1;overflow:hidden;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:${catColor};font-size:0.65rem;padding:1px 6px;border-radius:8px;background:${catColor}25;flex-shrink:0;">${fileCat}</span>
                            <span data-scanned-path="${escPath}" data-scanned-name="${escName}" onclick="${shareMode ? `shareScannedFileToWall(this.getAttribute('data-scanned-path'),this.getAttribute('data-scanned-name'))` : `openScannedInNotebook('${f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}','${f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',true)`}" style="color:#fff;font-weight:bold;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" title="${shareMode ? '点击分享到需求墙' : '在记事本中预览'}">${displayName}</span>
                        </div>
                        <div style="color:rgba(255,255,255,0.35);font-size:0.7rem;margin-left:4px;">${f.dirLabel} · ${f.ext.toUpperCase()}</div>
                    </div>
                    <div style="display:flex;gap:3px;flex-shrink:0;flex-wrap:wrap;align-items:center;">
                        ${shareMode ?
                            `<button data-scanned-path="${escPath}" data-scanned-name="${escName}" onclick="shareScannedFileToWall(this.getAttribute('data-scanned-path'),this.getAttribute('data-scanned-name'))" title="分享到需求墙" style="background:linear-gradient(135deg,#ff6b6b,#ff9e80);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:bold;white-space:nowrap;">📢 分享</button>` :
                            `<button onclick="openScannedInNotebook('${f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}','${f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',true)" title="预览" style="background:rgba(0,188,212,0.2);color:#00bcd4;border:1px solid rgba(0,188,212,0.3);padding:3px 6px;border-radius:4px;cursor:pointer;font-size:0.68rem;white-space:nowrap;">👁️</button>
                            <button onclick="openScannedInNotebook('${f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}','${f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',false)" title="编辑" style="background:rgba(76,175,80,0.2);color:#81c784;border:1px solid rgba(76,175,80,0.3);padding:3px 6px;border-radius:4px;cursor:pointer;font-size:0.68rem;white-space:nowrap;">✏️</button>
                            <button onclick="renameScannedFile('${f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}','${f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" title="改名" style="background:rgba(255,235,59,0.15);color:#ffee58;border:1px solid rgba(255,235,59,0.25);padding:3px 6px;border-radius:4px;cursor:pointer;font-size:0.68rem;white-space:nowrap;">🔤</button>
                            <button onclick="shareScannedFileToWall('${f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}','${f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" title="分享到需求墙" style="background:rgba(156,39,176,0.2);color:#ce93d8;border:1px solid rgba(156,39,176,0.3);padding:3px 6px;border-radius:4px;cursor:pointer;font-size:0.68rem;white-space:nowrap;">📢</button>
                            <button onclick="if(window.importFileToProject)window.importFileToProject('${f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" title="导入项目" style="background:rgba(255,152,0,0.2);color:#ff9800;border:1px solid rgba(255,152,0,0.3);padding:3px 6px;border-radius:4px;cursor:pointer;font-size:0.68rem;white-space:nowrap;">📥</button>`
                        }
                    </div>
                </div>`;
            });

            html += `</div>
                <div style="margin-top:6px;padding:3px 8px;color:rgba(255,255,255,0.45);font-size:0.68rem;border:1px solid rgba(255,255,255,0.08);border-radius:5px;background:rgba(255,255,255,0.02);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4;" title="${shareMode ? '勾选多个文件后可批量分享到需求墙，输入关键字可过滤列表' : '勾选多个文件后可批量导入，输入关键字可过滤列表'}">💡 ${shareMode ? '勾选后可批量分享到需求墙，输入关键字过滤' : '勾选后可批量导入，输入关键字过滤'}</div>
            </div>`;
            return html;
        }

        // 获取分类颜色
        function getScriptFileCategoryColor(cat) {
            const cm = {
                '寒冰': '#64b5f6', '暗月': '#ce93d8', '漩涡': '#4fc3f7',
                '合作': '#ffd54f', '深海': '#4db6ac', '活动': '#ff8a65',
                '日志': '#8d6e63', '临时': '#a5d6a7', '其他': '#bdbdbd', '全部': '#ffffff'
            };
            return cm[cat] || '#bdbdbd';
        }

        // 渲染分类筛选按钮
        window._scriptFileCategory = '全部';
        function renderScriptFileCategoryFilter() {
            const el = document.getElementById('scriptFileCategoryFilter');
            if (!el) return;
            const cats = ['全部', '寒冰', '暗月', '漩涡', '合作', '深海', '活动', '日志', '临时', '其他'];
            // 统计扫描文件各分类数量
            const scanned = window.scannedFiles || [];
            const counts = {};
            cats.forEach(c => { counts[c] = 0; });
            scanned.forEach(f => { const c = f.category || '其他'; if (counts[c] !== undefined) counts[c]++; else counts['其他']++; });
            counts['全部'] = scanned.length;

            let html = '';
            cats.forEach(cat => {
                const color = getScriptFileCategoryColor(cat);
                const active = window._scriptFileCategory === cat;
                const count = counts[cat] || 0;
                html += `<button onclick="setScriptFileCategory('${cat}')" 
                    style="background:${active ? color : 'rgba(255,255,255,0.08)'};color:${active ? '#000' : color};border:1px solid ${active ? color : 'rgba(255,255,255,0.15)'};padding:4px 10px;border-radius:14px;cursor:pointer;font-size:0.75rem;font-weight:${active ? 'bold' : 'normal'};transition:all 0.15s;white-space:nowrap;"
                    title="共 ${count} 个文件">${cat === '全部' ? '📋 ' : ''}${cat}${count > 0 && cat !== '全部' ? ' (' + count + ')' : ''}</button>`;
            });
            el.innerHTML = html;
        }

        // 设置当前分类筛选
        function setScriptFileCategory(cat) {
            window._scriptFileCategory = cat;
            renderScriptFileCategoryFilter();
            filterTxtFilesList();
        }

        // 模糊搜索过滤脚本列表（同时搜索项目文件 + 扫描目录文件）
        function filterTxtFilesList() {
            const keyword = (document.getElementById('txtFileSearchInput')?.value || '').trim().toLowerCase();
            const list = document.getElementById('txtFilesList');
            if (!list) return;

            // 取消进行中的分批渲染，防止叠加上次未完成的渲染导致白屏
            window._renderId = (window._renderId || 0) + 1;
            const renderId = window._renderId;

            const scannedFiles = window.scannedFiles || [];
            window._selImportPaths.clear(); // 切换搜索时清空选择
            window._selShareScannedPaths.clear(); // 切换搜索时清空扫描分享选择

            if (txtFiles.length === 0 && scannedFiles.length === 0) {
                list.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:10px;text-align:center;">暂无文本文件</div>';
                return;
            }

            const shareMode = isScriptFilesShareMode();
            if (shareMode) window._selShareIndices.clear();
            let html = '';

            // 0. 批量操作栏（分享模式显示批量分享，普通模式保留批量导入按钮等后续区域）
            if (shareMode) {
                html += `<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                    <div style="color:rgba(255,255,255,0.7);font-size:0.8rem;">📢 分享模式：点击文件直接分享，或勾选批量分享</div>
                    <button id="batchShareBtn" onclick="doBatchShareProjectFiles()" style="background:linear-gradient(135deg,#ff6b6b,#ff9e80);color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:0.8rem;font-weight:bold;opacity:0.5;transition:all 0.2s;">📢 批量分享</button>
                </div>`;
            }

            // 1. 项目中的脚本文件
            txtFiles.forEach((file, i) => {
                const nameMatch = file.name.toLowerCase().includes(keyword);
                const contentMatch = keyword ? file.content.toLowerCase().includes(keyword) : true;
                if (keyword && !nameMatch && !contentMatch) return;

                let displayName = escapeHtml(file.name);
                if (keyword && nameMatch) {
                    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    displayName = displayName.replace(regex, '<span style="background:#ff9800;color:#000;padding:0 2px;border-radius:2px;">$1</span>');
                }

                html += `<div class="scriptFileItem" style="background:rgba(0,0,0,0.3);border:1px solid ${shareMode ? 'rgba(156,39,176,0.35)' : 'rgba(255,215,0,0.2)'};border-radius:8px;padding:12px;">
                    <div class="scriptFileItemRow">
                        ${shareMode ? `<input type="checkbox" class="share-index-checkbox" value="${i}" onchange="toggleShareSelect(${i}, this.checked)" title="勾选批量分享" style="margin-right:8px;cursor:pointer;accent-color:#ff6b6b;">` : ''}
                        <div class="scriptFileItemInfo" style="flex:1;">
                            <div class="scriptFileItemName" onclick="${shareMode ? `shareTxtFileToWall(${i})` : `openScriptEditorTab(${i})`}" title="${shareMode ? '点击分享到需求墙' : '点击在下方标签中打开编辑'}" style="cursor:pointer;">📄 ${displayName}</div>
                            <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">${(file.content.length / 1024).toFixed(1)} KB</div>
                        </div>
                        <div class="scriptFileItemActions">
                            ${shareMode ?
                                `<button onclick="shareTxtFileToWall(${i})" title="分享到需求墙" style="background:linear-gradient(135deg,#ff6b6b,#ff9e80);color:white;border:none;padding:6px 16px;border-radius:5px;cursor:pointer;font-size:0.8rem;font-weight:bold;">📢 分享</button>` :
                                `<button onclick="shareTxtFileToWall(${i})" title="分享到需求墙" style="background:linear-gradient(135deg,#9c27b0,#7b1fa2);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">📢</button>
                                <button onclick="openScriptNotebook({name: txtFiles[${i}].name, content: txtFiles[${i}].content, fileIndex: ${i}, readonly: false})" title="新记事本编辑" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">✏️</button>
                                <button onclick="renameTxtFile(${i})" title="重命名" style="background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">✏️</button>
                                <button onclick="downloadTxtFile(${i})" title="下载" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">📥</button>
                                <button onclick="deleteTxtFile(${i})" title="删除" style="background:linear-gradient(135deg,#f44336,#c62828);color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">🗑️</button>`
                            }
                        </div>
                    </div>
                </div>`;
            });

            // 2. 扫描目录文件（按分类 + 关键字过滤）
            if (scannedFiles.length > 0) {
                html += renderScannedFilesSection(scannedFiles, keyword, window._scriptFileCategory || '全部');
            }

            // 2.1 有搜索关键字但扫描文件为空 → 提示扫描
            if (keyword && scannedFiles.length === 0) {
                html += `<div style="margin-top:10px;padding:10px;background:rgba(255,152,0,0.08);border:1px dashed rgba(255,152,0,0.2);border-radius:6px;text-align:center;">
                    <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-bottom:6px;">尚未扫描文件目录，无法搜索外部脚本</div>
                    <button onclick="if(window.silentScanFiles)window.silentScanFiles().then(()=>filterTxtFilesList())" style="background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:4px 14px;border-radius:5px;cursor:pointer;font-size:0.75rem;">🔍 扫描文件目录</button>
                </div>`;
            }

            if (!html) {
                html = '<div style="color:rgba(255,255,255,0.4);padding:10px;text-align:center;">未找到匹配的脚本</div>';
            }

            // 防白屏：先渲染项目文件（少）+ loading 占位，延迟到下一帧再渲染大块扫描文件列表
            // requestAnimationFrame 确保浏览器先完成标签切换 UI 的绘制，再处理 innerHTML 解析
            const scannedHtml = html.indexOf('📂 可导入文件') !== -1 ? html.substring(html.indexOf('<div style="margin-top:12px;padding-top:10px;border-top:')) : '';
            const projectHtml = scannedHtml ? html.substring(0, html.indexOf(scannedHtml)) : html;

            list.innerHTML = projectHtml + (scannedHtml ? '<div id="scannedFilesLoading" style="color:rgba(255,255,255,0.3);padding:12px;text-align:center;">⏳ 加载扫描文件列表...</div>' : '');

            if (scannedHtml) {
                // 延迟到下一帧渲染大批量 HTML，避免阻塞标签切换动画
                requestAnimationFrame(() => {
                    if (window._renderId !== renderId) return; // 已被新调用取消
                    const loadingEl = document.getElementById('scannedFilesLoading');
                    if (loadingEl) loadingEl.outerHTML = scannedHtml;
                });
            }
        }

        // ==================== 文本检索：多脚本关键词统计 ====================
        function openTextSearchModal() {
            // 收集所有可用脚本
            const allFiles = [];
            // 1. 项目脚本
            txtFiles.forEach((f, i) => {
                if (f.content && f.content.trim()) {
                    allFiles.push({ name: f.name, content: f.content, source: '项目' });
                }
            });
            // 2. 已打开的本地文件浮动窗口
            if (typeof localFileWindows !== 'undefined' && localFileWindows.length > 0) {
                localFileWindows.forEach(w => {
                    const ta = w.element?.querySelector('textarea');
                    if (ta && ta.value && ta.value.trim()) {
                        allFiles.push({ name: w.fileName, content: ta.value, source: '本地' });
                    }
                });
            }
            // 3. 编辑器标签页中未保存的内容
            if (typeof scriptEditorTabs !== 'undefined' && scriptEditorTabs.length > 0) {
                scriptEditorTabs.forEach(tab => {
                    if (tab.content && tab.content.trim()) {
                        // 避免与项目脚本重复（通过名称匹配）
                        const dup = allFiles.find(f => f.name === tab.name && f.source === '项目');
                        if (!dup) {
                            allFiles.push({ name: tab.name, content: tab.content, source: '标签' });
                        }
                    }
                });
            }

            if (allFiles.length === 0) {
                alert('没有可检索的脚本内容。请先打开项目或本地脚本。');
                return;
            }

            // 去重（同名的本地窗口覆盖旧 entry）
            const seen = new Map();
            const uniqueFiles = [];
            allFiles.forEach(f => {
                const key = f.name + '|' + f.source;
                seen.set(key, f);
            });
            seen.forEach(v => uniqueFiles.push(v));

            const fileCount = uniqueFiles.length;
            const scannedCount = (window.scannedFiles || []).length;

            // 构建弹窗
            const modal = document.createElement('div');
            modal.id = 'textSearchModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(79,195,247,0.5);border-radius:12px;width:750px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;">
                    <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                        <div style="color:#4fc3f7;font-weight:bold;font-size:1rem;">🔍 多脚本/日志关键词检索 <span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">（项目 ${fileCount} 个 + 日志 ${scannedCount} 个）</span></div>
                        <button onclick="document.getElementById('textSearchModal').remove()" style="background:transparent;border:none;color:white;font-size:1.3rem;cursor:pointer;">×</button>
                    </div>
                    <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;align-items:center;flex-shrink:0;">
                        <input id="textSearchKeywordInput" type="text" placeholder="输入关键词，多个用逗号/空格分隔…（如：减伤,战车,精灵）" style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid rgba(79,195,247,0.4);background:rgba(0,0,0,0.3);color:#fff;font-size:0.9rem;box-sizing:border-box;"
                            onkeydown="if(event.key==='Enter'){performTextSearch();}">
                        <button onclick="performTextSearch()" style="background:linear-gradient(135deg,#4fc3f7,#2196f3);color:white;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:0.85rem;white-space:nowrap;">搜索</button>
                        <div style="display:flex;align-items:center;gap:4px;font-size:0.75rem;color:rgba(255,255,255,0.5);margin-left:4px;">
                            <label style="cursor:pointer;display:flex;align-items:center;gap:3px;user-select:none;">
                                <input type="checkbox" id="textSearchRegex" style="accent-color:#4fc3f7;"> 正则
                            </label>
                            <label style="cursor:pointer;display:flex;align-items:center;gap:3px;margin-left:6px;user-select:none;">
                                <input type="checkbox" id="textSearchCaseSensitive" style="accent-color:#4fc3f7;"> 区分大小写
                            </label>
                        </div>
                    </div>
                    <div id="textSearchResults" style="flex:1;overflow-y:auto;padding:14px 18px;scrollbar-width:thin;scrollbar-color:rgba(255,215,0,0.3) transparent;">
                        <div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;">输入关键词后点击搜索</div>
                    </div>
                    <div id="textSearchSummary" style="padding:8px 18px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:0.75rem;flex-shrink:0;min-height:20px;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            // 点击背景关闭
            modal.addEventListener('click', function(e) {
                if (e.target === modal) modal.remove();
            });
            // 自动聚焦输入框
            setTimeout(() => {
                const inp = document.getElementById('textSearchKeywordInput');
                if (inp) inp.focus();
            }, 100);
        }

        async function performTextSearch() {
            const keywordRaw = (document.getElementById('textSearchKeywordInput')?.value || '').trim();
            if (!keywordRaw) return;
            const useRegex = document.getElementById('textSearchRegex')?.checked || false;
            const caseSensitive = document.getElementById('textSearchCaseSensitive')?.checked || false;
            const resultsDiv = document.getElementById('textSearchResults');
            const summaryDiv = document.getElementById('textSearchSummary');

            // 拆分关键词（逗号/中文逗号/空格分隔）
            let keywords = [];
            if (useRegex) {
                keywords = [keywordRaw]; // 正则模式下视为单个表达式
            } else {
                keywords = keywordRaw.split(/[,，\s]+/).filter(k => k.length > 0);
            }
            if (keywords.length === 0) return;

            // 加载中提示
            if (resultsDiv) resultsDiv.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:30px;">⏳ 正在读取日志文件…</div>';

            // 收集文件
            const allFiles = [];
            // 1. 项目脚本
            txtFiles.forEach(f => {
                if (f.content && f.content.trim()) allFiles.push({ name: f.name, content: f.content, source: '项目' });
            });
            // 2. 已打开的本地文件浮动窗口
            if (typeof localFileWindows !== 'undefined') {
                localFileWindows.forEach(w => {
                    const ta = w.element?.querySelector('textarea');
                    if (ta && ta.value && ta.value.trim()) {
                        allFiles.push({ name: w.fileName, content: ta.value, source: '本地' });
                    }
                });
            }
            // 3. 编辑器标签页
            if (typeof scriptEditorTabs !== 'undefined') {
                scriptEditorTabs.forEach(tab => {
                    if (tab.content && tab.content.trim()) {
                        const dup = allFiles.find(f => f.name === tab.name && f.source === '项目');
                        if (!dup) allFiles.push({ name: tab.name, content: tab.content, source: '标签' });
                    }
                });
            }
            // 4. 扫描目录文件（日志）—— 从磁盘读取
            const scannedFiles = window.scannedFiles || [];
            if (scannedFiles.length > 0 && window.readTextFile) {
                // 过滤掉已导入项目的（按名称去重）
                const projectNames = new Set(txtFiles.map(f => f.name));
                const toRead = scannedFiles.filter(f => !projectNames.has(f.name));
                if (toRead.length > 0) {
                    // 并行读取所有日志文件
                    const readResults = await Promise.all(
                        toRead.map(async (f) => {
                            try {
                                const content = await window.readTextFile(f.path);
                                if (content && content.trim()) {
                                    return { name: f.name, content: content, source: '日志', path: f.path };
                                }
                            } catch (e) {
                                // 读取失败的文件静默跳过
                                console.warn('日志读取失败:', f.name, e.message);
                            }
                            return null;
                        })
                    );
                    readResults.forEach(r => {
                        if (r) allFiles.push(r);
                    });
                }
            }

            if (resultsDiv) resultsDiv.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:30px;">🔎 正在搜索…</div>';

            // 为每个文件统计每个关键词出现次数
            const results = [];
            allFiles.forEach(file => {
                const row = { name: file.name, source: file.source, counts: {}, total: 0 };
                keywords.forEach(kw => {
                    let count = 0;
                    try {
                        const flags = caseSensitive ? 'g' : 'gi';
                        if (useRegex) {
                            const re = new RegExp(kw, flags);
                            const matches = file.content.match(re);
                            count = matches ? matches.length : 0;
                        } else {
                            // 转义正则特殊字符
                            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const re = new RegExp(escaped, flags);
                            const matches = file.content.match(re);
                            count = matches ? matches.length : 0;
                        }
                    } catch (e) {
                        count = -1; // 正则错误
                    }
                    row.counts[kw] = count;
                    if (count > 0) row.total += count;
                });
                // 只有至少匹配一个关键词的文件才显示
                if (row.total > 0 || Object.values(row.counts).some(c => c === -1)) {
                    results.push(row);
                }
            });

            // 按匹配总数降序排列
            results.sort((a, b) => b.total - a.total);

            if (!resultsDiv) return;

            if (results.length === 0) {
                resultsDiv.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:30px;">未找到匹配结果</div>';
                if (summaryDiv) summaryDiv.textContent = '';
                return;
            }

            // 颜色方案
            const colColors = ['#4fc3f7', '#ffd700', '#4ecdc4', '#ff9800', '#e040fb'];

            let html = '';
            html += `<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;font-size:0.8rem;">`;
            keywords.forEach((kw, ki) => {
                html += `<span style="background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;">🔑 <b style="color:${colColors[ki] || '#fff'}">${escapeHtml(kw)}</b></span>`;
            });
            html += `</div>`;

            html += `<div style="overflow-x:auto;">`;
            html += `<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">`;
            // 表头
            html += `<thead><tr style="background:rgba(255,255,255,0.06);">`;
            html += `<th style="padding:6px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);">文件</th>`;
            html += `<th style="padding:6px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);width:50px;">来源</th>`;
            keywords.forEach((kw, ki) => {
                html += `<th style="padding:6px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);color:${colColors[ki] || '#fff'};width:60px;">${escapeHtml(kw.length > 6 ? kw.slice(0,6)+'…' : kw)}</th>`;
            });
            html += `<th style="padding:6px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);color:#ffd700;width:50px;">合计</th>`;
            html += `</tr></thead><tbody>`;

            // 总计
            const totals = {};
            keywords.forEach(kw => { totals[kw] = 0; });
            let grandTotal = 0;

            results.forEach((row, ri) => {
                const bg = ri % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
                const srcColor = row.source === '日志' ? '#ff9800' : row.source === '本地' ? '#60c5a0' : row.source === '标签' ? '#4ecdc4' : 'rgba(255,255,255,0.5)';
                html += `<tr style="background:${bg};" onmouseover="this.style.background='rgba(79,195,247,0.08)';" onmouseout="this.style.background='${bg}';">`;
                html += `<td style="padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;" title="${escapeHtml(row.name)}">📄 ${escapeHtml(row.name)}</td>`;
                html += `<td style="padding:5px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.7rem;color:${srcColor};">${row.source}</td>`;
                keywords.forEach((kw, ki) => {
                    const cnt = row.counts[kw];
                    totals[kw] += (cnt > 0 ? cnt : 0);
                    const color = cnt > 0 ? (cnt >= 10 ? '#4ecdc4' : cnt >= 3 ? '#ffd700' : '#4fc3f7') : 'rgba(255,255,255,0.2)';
                    html += `<td style="padding:5px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);font-weight:${cnt>0?'bold':'normal'};color:${color};">${cnt === -1 ? '⚠' : cnt}</td>`;
                });
                html += `<td style="padding:5px 8px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);font-weight:bold;color:#ffd700;">${row.total}</td>`;
                html += `</tr>`;
                grandTotal += row.total;
            });

            // 总计行
            html += `<tr style="background:rgba(255,215,0,0.08);font-weight:bold;">`;
            html += `<td style="padding:6px 10px;border-top:2px solid rgba(255,215,0,0.3);color:#ffd700;">📊 总计（${results.length} 个文件）</td>`;
            html += `<td style="padding:6px 8px;text-align:center;border-top:2px solid rgba(255,215,0,0.3);"></td>`;
            keywords.forEach((kw, ki) => {
                html += `<td style="padding:6px 8px;text-align:center;border-top:2px solid rgba(255,215,0,0.3);color:${colColors[ki] || '#fff'};">${totals[kw]}</td>`;
            });
            html += `<td style="padding:6px 8px;text-align:center;border-top:2px solid rgba(255,215,0,0.3);color:#ffd700;">${grandTotal}</td>`;
            html += `</tr>`;

            html += `</tbody></table></div>`;

            resultsDiv.innerHTML = html;
            if (summaryDiv) summaryDiv.textContent = `匹配 ${results.length} 个文件 · 总计 ${grandTotal} 次出现 · ${keywords.length} 个关键词`;
        }

        // 触发上传TXT文件
        function uploadTxtFile() {
            const input = document.getElementById('txtFileInput');
            if (input) input.click();
        }

        // 处理TXT文件上传（支持多文件）
        function handleTxtFileUpload(input) {
            if (!input.files || input.files.length === 0) return;
            
            const files = Array.from(input.files);
            let uploadedCount = 0;
            
            files.forEach(file => {
                if (file.size > 10 * 1024 * 1024) {
                    alert(`文件 ${file.name} 太大，请上传小于10MB的文件`);
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const content = e.target.result;
                    const existsIndex = txtFiles.findIndex(f => f.name === file.name);
                    
                    if (existsIndex !== -1) {
                        txtFiles[existsIndex].content = content;
                    } else {
                        txtFiles.push({name: file.name, content: content});
                    }
                    
                    uploadedCount++;
                    if (uploadedCount === files.length) {
                        updateTxtFilesList();
                        autoSaveProject();
                        input.value = '';
                    }
                };
                reader.readAsText(file);
            });
        }

        // 自动保存项目
        // 【改动】不再自动保存项目：避免调卡调错了被直接存盘。请点工具栏 💾（确定保存）手动保存。
        // 这里只标记"有未保存的修改"，供 💾 旁的 ●未保存 提示。
        function autoSaveProject() {
            window.__tfjlProjectDirty = true;
            if (typeof updateSaveIndicator === 'function') updateSaveIndicator();
        }
        function updateSaveIndicator() {
            const dot = document.getElementById('saveDirtyDot');
            if (dot) dot.style.display = (window.__tfjlProjectDirty ? 'inline-block' : 'none');
        }

        // 预览/编辑TXT文件
        function previewTxtFile(index) {
            const file = txtFiles[index];
            if (!file) return;

            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `
                <div style="background:#1a1a2e;border:2px solid rgba(255,215,0,0.3);border-radius:16px;padding:24px;max-width:900px;width:100%;max-height:85vh;display:flex;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                        <h3 style="margin:0;color:#ffd700;">📄 ${escapeHtml(file.name)}</h3>
                        <span onclick="this.closest('div').parentElement.remove()" style="cursor:pointer;color:#f44336;font-size:1.5rem;">✕</span>
                    </div>
                    <textarea id="txtEditArea" style="flex:1;min-height:400px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.2);border-radius:8px;padding:12px;color:#fff;font-size:0.9rem;resize:none;font-family:monospace;line-height:1.6;">${escapeHtml(file.content)}</textarea>
                    <div id="txtParseResult" style="margin-top:10px;font-size:0.85rem;color:rgba(255,255,255,0.7);"></div>
                    <div style="margin-top:15px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                        <div style="display:flex;gap:10px;align-items:center;">
                            <select id="txtParseTarget" style="padding:8px;border-radius:6px;border:1px solid rgba(255,215,0,0.3);background:#2a2a4a;color:#fff;font-size:0.85rem;cursor:pointer;">
                                <option value="my">我的手牌</option>
                                <option value="teammate">队友手牌</option>
                            </select>
                            <button onclick="parseTxtFileContent(${index})" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:0.85rem;">🔍 解析到手牌</button>
                        </div>
                        <div style="display:flex;gap:10px;">
                            <button onclick="downloadTxtFile(${index})" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">📥 下载</button>
                            <button onclick="saveTxtFileEdit(${index})" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">💾 保存编辑</button>
                            <button onclick="this.closest('div').parentElement.parentElement.remove()" style="background:linear-gradient(135deg,#666,#444);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">关闭</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.addEventListener('click', function(e) {
                if (e.target === modal) modal.remove();
            });
        }

        // 从TXT文件内容解析英雄阵容
        function parseTxtFileContent(index) {
            const editArea = document.getElementById('txtEditArea');
            const resultEl = document.getElementById('txtParseResult');
            const targetSelect = document.getElementById('txtParseTarget');
            
            if (!editArea || !editArea.value.trim()) {
                resultEl.innerHTML = '<span style="color:#f44336;">文件内容为空！</span>';
                return;
            }

            const content = editArea.value.trim();
            const target = targetSelect.value;

            // 解析"上阵："后面的内容
            let heroNames = [];
            
            // 支持"上阵：英雄1,英雄2,..."格式
            const match = content.match(/上阵[：:]\s*(.+)/);
            if (match && match[1]) {
                // 按逗号分割，支持中英文逗号
                heroNames = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
            } else {
                // 如果没有"上阵："，尝试查找所有可能是英雄名称的词
                // 这里可以添加更多解析逻辑
                resultEl.innerHTML = '<span style="color:#f44336;">未找到"上阵："格式的阵容信息！</span>';
                return;
            }

            if (heroNames.length === 0) {
                resultEl.innerHTML = '<span style="color:#f44336;">未找到英雄名称！</span>';
                return;
            }

            // 限制最多10张
            if (heroNames.length > 10) {
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
            if (duplicateCards.length > 0) {
                resultHtml += `<br><span style="color:#ff9800;">⚠️ 重复卡牌：${duplicateCards.join('、')}</span>`;
            }
            if (notFoundCards.length > 0) {
                resultHtml += `<br><span style="color:#f44336;">❌ 未找到：${notFoundCards.join('、')}</span>`;
            }

            resultEl.innerHTML = resultHtml;
        }

        // 保存TXT文件编辑
        function saveTxtFileEdit(index) {
            const editArea = document.getElementById('txtEditArea');
            if (!editArea || !txtFiles[index]) return;

            txtFiles[index].content = editArea.value;
            updateTxtFilesList();
            autoSaveProject();

            // 关闭模态框
            const modal = document.querySelector('div[style*="z-index:3000"]');
            if (modal) modal.remove();

            alert('✅ 保存成功！');
        }

        // 下载TXT文件
        function downloadTxtFile(index) {
            const file = txtFiles[index];
            if (!file) { alert('文件不存在'); return; }
            if (!file.content) { alert('文件内容为空，无法下载'); return; }

            // Tauri App：使用原生文件保存（避免webview中Blob下载被静默阻止）
            if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
                downloadTxtFileApp(file);
                return;
            }

            downloadTxtFileBlob(file);
        }

        function downloadTxtFileBlob(file) {
            const blob = new Blob([file.content], {type: 'text/plain;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        async function downloadTxtFileApp(file) {
            // 复用 _downloadScriptTauri 的保存逻辑
            _downloadScriptTauri(file.name, file.content);
        }

        // 下载统一浮窗(openScriptNotebook)当前内容（用于远程/预览内容，fileIndex<0 无法回写本地）
        function downloadNotebookContent(windowId) {
            const ta = document.getElementById(windowId + '_content');
            if (!ta) return;
            const win = txtFileWindows.find(w => w.id === windowId);
            const name = (win && win.name) ? win.name : 'script.txt';
            const content = ta.value;
            if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
                _downloadScriptTauri(name, content);
            } else {
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        }

        // 删除TXT文件
        function deleteTxtFile(index) {
            if (!txtFiles[index]) return;
            const fileName = txtFiles[index].name;
            if (!confirm(`确定要删除"${fileName}"吗？`)) return;

            txtFiles.splice(index, 1);
            updateTxtFilesList();
            autoSaveProject();
        }

        // ========== 文件列表拖拽缩放 ==========
        window._fileListResizing = false;
        let _flrStartY = 0, _flrStartH = 0;

        function startFileListResize(e) {
            window._fileListResizing = true;
            _flrStartY = e.clientY;
            const list = document.getElementById('txtFilesList');
            _flrStartH = list.offsetHeight;
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            const grip = document.getElementById('fileListResizeGrip');
            if (grip) grip.style.opacity = '1';
            e.preventDefault();
        }

        document.addEventListener('mousemove', (e) => {
            if (!window._fileListResizing) return;
            const delta = e.clientY - _flrStartY;
            const maxH = Math.round(window.innerHeight * 0.55);
            const newH = Math.max(0, Math.min(maxH, _flrStartH + delta));
            const list = document.getElementById('txtFilesList');
            list.style.height = newH + 'px';
            list.style.maxHeight = newH + 'px';
            list.style.minHeight = newH + 'px';
            const hint = document.getElementById('fileListHint');
            if (hint) hint.style.display = newH === 0 ? 'none' : '';
        });

        document.addEventListener('mouseup', () => {
            if (!window._fileListResizing) return;
            window._fileListResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const grip = document.getElementById('fileListResizeGrip');
            if (grip) grip.style.opacity = '0';
            const handle = document.getElementById('fileListResizeHandle');
            if (handle) { handle.style.background = 'transparent'; handle.style.height = '6px'; handle.style.margin = '3px 0'; }
            const list = document.getElementById('txtFilesList');
            const hint = document.getElementById('fileListHint');
            if (list && hint) hint.style.display = list.offsetHeight === 0 ? 'none' : '';
        });

        // ========== 脚本文件布局切换（堆叠 ↔ IDE分栏） ==========
        const SCRIPT_LAYOUT_KEY = 'tfjl_script_layout';
        const SCRIPT_SIDEBAR_WIDTH_KEY = 'tfjl_script_sidebar_w';
        const SCRIPT_SIDEBAR_COLLAPSED_KEY = 'tfjl_script_sidebar_collapsed';
        const SCRIPT_PANEL_WIDTH_KEY = 'tfjl_script_panel_w';

        function getScriptLayout() {
            return localStorage.getItem(SCRIPT_LAYOUT_KEY) || 'stacked';
        }

        function setScriptLayout(mode) {
            localStorage.setItem(SCRIPT_LAYOUT_KEY, mode);
            applyScriptLayout(mode);
        }

        function toggleScriptLayout() {
            const current = getScriptLayout();
            const next = current === 'stacked' ? 'ide' : 'stacked';
            setScriptLayout(next);
        }

        // 脚本文件Tab分享模式
        let _scriptFilesShareMode = false;
        function toggleScriptFilesShareMode() {
            _scriptFilesShareMode = !_scriptFilesShareMode;
            const btn = document.getElementById('scriptFilesShareModeBtn');
            const label = document.getElementById('scriptFilesShareModeLabel');
            if (btn) {
                if (_scriptFilesShareMode) {
                    btn.style.background = 'linear-gradient(135deg,#ff6b6b,#ff9e80)';
                    btn.title = '退出分享模式';
                    if (label) label.textContent = '退出分享';
                } else {
                    btn.style.background = 'linear-gradient(135deg,#7c4dff,#b388ff)';
                    btn.title = '分享模式：快速把脚本分享到需求墙';
                    if (label) label.textContent = '分享模式';
                }
            }
            filterTxtFilesList();
            renderScannedFilesSection();
        }

        function isScriptFilesShareMode() { return _scriptFilesShareMode; }

        function applyScriptLayout(mode) {
            const body = document.getElementById('scriptFileBody');
            const sidebar = document.getElementById('fileListSidebar');
            const vDivider = document.getElementById('fileListVDivider');
            const collapseBtn = document.getElementById('fileListCollapseBtn');
            const editor = document.getElementById('scriptEditorTabs');
            const hHandle = document.getElementById('fileListResizeHandle');
            const toggleBtn = document.getElementById('scriptLayoutToggleBtn');
            const fileList = document.getElementById('txtFilesList');
            const panel = document.getElementById('txtFilesPanel');

            if (!body || !sidebar || !editor) return;
            body.dataset.layout = mode;

            if (mode === 'ide') {
                // IDE 分栏模式
                body.style.flexDirection = 'row';
                body.style.alignItems = 'stretch';
                sidebar.style.flexDirection = 'column';
                sidebar.style.minHeight = '0';
                sidebar.style.overflow = 'hidden';
                sidebar.style.display = 'flex';
                sidebar.style.flex = 'none';
                if (vDivider) vDivider.style.display = 'flex';
                if (collapseBtn) collapseBtn.style.display = 'flex';
                if (hHandle) hHandle.style.display = 'none';
                if (fileList) { fileList.style.flex = '1'; fileList.style.height = ''; fileList.style.maxHeight = '320px'; fileList.style.minHeight = '0'; }
                editor.style.flex = '1';
                editor.style.marginTop = '0';
                editor.style.borderTop = 'none';
                editor.style.paddingTop = '0';
                editor.style.paddingLeft = '4px';
                // 恢复侧边栏宽度
                const savedW = localStorage.getItem(SCRIPT_SIDEBAR_WIDTH_KEY);
                const w = savedW ? parseInt(savedW) : 260;
                sidebar.style.width = w + 'px';
                // 展开面板宽度
                if (panel) {
                    const panelW = panel.offsetWidth;
                    if (panelW < 700) {
                        const savedPanelW = localStorage.getItem(SCRIPT_PANEL_WIDTH_KEY);
                        panel.style.width = (savedPanelW ? parseInt(savedPanelW) : 850) + 'px';
                    }
                }
                // 恢复折叠状态
                if (localStorage.getItem(SCRIPT_SIDEBAR_COLLAPSED_KEY) === '1') {
                    applySidebarCollapse(true, false);
                } else {
                    applySidebarCollapse(false, false);
                }
                if (toggleBtn) { toggleBtn.innerHTML = '🗂'; toggleBtn.title = '切换布局：当前IDE分栏 → 点击切换为堆叠'; }
            } else {
                // 堆叠模式（默认）
                body.style.flexDirection = 'column';
                body.style.alignItems = 'stretch';
                sidebar.style.width = '';
                sidebar.style.flex = '';
                sidebar.style.display = 'flex';
                sidebar.style.overflow = 'hidden';
                if (vDivider) vDivider.style.display = 'none';
                if (collapseBtn) collapseBtn.style.display = 'none';
                if (hHandle) hHandle.style.display = 'flex';
                if (fileList) { fileList.style.flex = ''; fileList.style.height = 'auto'; fileList.style.maxHeight = '200px'; fileList.style.minHeight = '0'; }
                editor.style.flex = '1';
                editor.style.marginTop = '0';
                editor.style.borderTop = 'none';
                editor.style.paddingTop = '0';
                editor.style.paddingLeft = '0';
                // 恢复面板宽度
                if (panel) {
                    const savedPanelW = localStorage.getItem(SCRIPT_PANEL_WIDTH_KEY);
                    const targetW = savedPanelW ? parseInt(savedPanelW) : 450;
                    if (panel.offsetWidth !== targetW) panel.style.width = targetW + 'px';
                }
                // 堆叠模式不折叠
                applySidebarCollapse(false, false);
                if (toggleBtn) { toggleBtn.innerHTML = '📋'; toggleBtn.title = '切换布局：当前堆叠 → 点击切换为IDE分栏'; }
            }
        }

        function toggleFileListCollapse() {
            const sidebar = document.getElementById('fileListSidebar');
            if (!sidebar) return;
            const isCollapsed = sidebar.style.display === 'none';
            applySidebarCollapse(!isCollapsed, true);
        }

        function applySidebarCollapse(collapse, save) {
            const sidebar = document.getElementById('fileListSidebar');
            const vDivider = document.getElementById('fileListVDivider');
            const collapseBtn = document.getElementById('fileListCollapseBtn');
            if (!sidebar) return;
            if (collapse) {
                sidebar.style.display = 'none';
                if (vDivider) vDivider.style.display = 'none';
                if (collapseBtn) collapseBtn.innerHTML = '▶';
                if (collapseBtn) collapseBtn.title = '展开文件列表';
            } else {
                sidebar.style.display = 'flex';
                if (vDivider) vDivider.style.display = 'flex';
                if (collapseBtn) collapseBtn.innerHTML = '◀';
                if (collapseBtn) collapseBtn.title = '折叠文件列表';
            }
            if (save) {
                localStorage.setItem(SCRIPT_SIDEBAR_COLLAPSED_KEY, collapse ? '1' : '0');
            }
        }

        // IDE 分栏模式：垂直分隔条拖拽
        window._fileListVResizing = false;
        let _flvrStartX = 0, _flvrStartW = 0;

        function startFileListVResize(e) {
            if (getScriptLayout() !== 'ide') return;
            window._fileListVResizing = true;
            _flvrStartX = e.clientX;
            const sidebar = document.getElementById('fileListSidebar');
            _flvrStartW = sidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.querySelectorAll('.fileListVDividerGrip').forEach(el => el.style.opacity = '1');
            e.preventDefault();
        }

        document.addEventListener('mousemove', (e) => {
            if (!window._fileListVResizing) return;
            const delta = e.clientX - _flvrStartX;
            const newW = Math.max(160, Math.min(420, _flvrStartW + delta));
            const sidebar = document.getElementById('fileListSidebar');
            if (sidebar) sidebar.style.width = newW + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!window._fileListVResizing) return;
            window._fileListVResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.querySelectorAll('.fileListVDividerGrip').forEach(el => el.style.opacity = '0');
            const vDivider = document.getElementById('fileListVDivider');
            if (vDivider) { vDivider.style.background = 'transparent'; vDivider.style.width = '6px'; vDivider.style.margin = '0 2px'; }
            const sidebar = document.getElementById('fileListSidebar');
            if (sidebar) localStorage.setItem(SCRIPT_SIDEBAR_WIDTH_KEY, sidebar.offsetWidth);
        });

        function initScriptLayout() {
            const mode = getScriptLayout();
            applyScriptLayout(mode);
        }

        // 监听面板宽度变化，保存当前宽度供后续切换恢复
        (function watchPanelWidth() {
            const panel = document.getElementById('txtFilesPanel');
            if (!panel) return;
            let lastW = panel.offsetWidth;
            const saveW = () => {
                const w = panel.offsetWidth;
                if (w && w !== lastW && getScriptLayout() === 'stacked') {
                    localStorage.setItem(SCRIPT_PANEL_WIDTH_KEY, w);
                    lastW = w;
                }
            };
            // 用户手动 resize 面板时会触发 mouseup，这里简单在 document mouseup 时保存
            document.addEventListener('mouseup', () => {
                setTimeout(saveW, 50);
            });
        })();

        // ========== 底部多标签脚本编辑器 ==========
        let scriptEditorTabs = []; // { id, fileIndex, filePath?, name, content, originalContent, modified, isScanned? }
        let activeScriptEditorTabId = null;

        // 打开项目文件到编辑器（fileIndex 为 txtFiles 数组索引）
        function openScriptEditorTab(fileIndex) {
            if (!txtFiles[fileIndex]) return;
            const file = txtFiles[fileIndex];

            // 已有该文件的标签则激活
            const existing = scriptEditorTabs.find(t => t.fileIndex === fileIndex && !t.isScanned);
            if (existing) {
                switchScriptEditorTab(existing.id);
                return;
            }

            const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const drInfo = computeScriptDr(file.content);
            scriptEditorTabs.push({
                id: tabId,
                fileIndex: fileIndex,
                name: file.name,
                content: file.content,
                originalContent: file.content,
                modified: false,
                drInfo: drInfo
            });

            document.getElementById('scriptEditorTabs').style.display = 'flex';
            switchScriptEditorTab(tabId);
        }

        // 打开扫描文件到编辑器（filePath 为本地路径，用于去重和回写）
        async function openScannedFileInEditor(filePath, fileName) {
            // 解码路径
            let realPath = filePath;
            let realName = fileName;
            if (typeof realPath === 'string') realPath = realPath.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
            if (typeof realName === 'string') realName = realName.replace(/\\\\/g, '\\').replace(/\\'/g, "'");

            // 去重：已有该路径的标签则激活
            const existing = scriptEditorTabs.find(t => t.filePath === realPath);
            if (existing) {
                switchScriptEditorTab(existing.id);
                return;
            }

            // 读取文件内容
            let content = '';
            try {
                if (window.readTextFile) {
                    content = await window.readTextFile(realPath);
                    if (content === null || content === undefined) {
                        alert('读取文件失败: ' + realPath);
                        return;
                    }
                } else {
                    alert('当前环境不支持读取本地文件，请在 App 中使用此功能');
                    return;
                }
            } catch (e) {
                alert('读取文件失败: ' + e.message);
                return;
            }

            const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const scannedDrInfo = computeScriptDr(content);
            scriptEditorTabs.push({
                id: tabId,
                fileIndex: -1,
                filePath: realPath,
                name: realName,
                content: content,
                originalContent: content,
                modified: false,
                isScanned: true,
                drInfo: scannedDrInfo
            });

            document.getElementById('scriptEditorTabs').style.display = 'flex';
            switchScriptEditorTab(tabId);
        }

        function closeScriptEditorTab(tabId, event) {
            if (event) event.stopPropagation();
            const idx = scriptEditorTabs.findIndex(t => t.id === tabId);
            if (idx === -1) return;
            const tab = scriptEditorTabs[idx];

            if (tab.modified && tab.content !== tab.originalContent) {
                if (!confirm(`「${tab.name}」已修改但未保存，确定关闭？`)) return;
            }

            scriptEditorTabs.splice(idx, 1);
            if (activeScriptEditorTabId === tabId) {
                activeScriptEditorTabId = scriptEditorTabs.length > 0 ? scriptEditorTabs[Math.max(0, idx - 1)].id : null;
            }

            renderScriptEditorTabs();
            refreshScriptEditorBody();
            if (scriptEditorTabs.length === 0) {
                document.getElementById('scriptEditorTabs').style.display = 'none';
            }
        }

        function switchScriptEditorTab(tabId) {
            if (!scriptEditorTabs.find(t => t.id === tabId)) return;
            activeScriptEditorTabId = tabId;
            renderScriptEditorTabs();
            refreshScriptEditorBody();
        }

        function getActiveScriptEditorTab() {
            return scriptEditorTabs.find(t => t.id === activeScriptEditorTabId) || null;
        }

        function renderScriptEditorTabs() {
            const bar = document.getElementById('scriptEditorTabBar');
            if (!bar) return;
            bar.innerHTML = scriptEditorTabs.map(tab => {
                const active = tab.id === activeScriptEditorTabId;
                const dirty = tab.modified ? ' *' : '';
                const icon = tab.isScanned ? '📂' : '📄';
                // 减伤标签徽章（带文字说明）
                let drBadge = '';
                if (tab.drInfo) {
                    const f7c = tab.drInfo.first7 < 100 ? '#ff6b6b' : tab.drInfo.first7 < 130 ? '#ffd700' : '#4ecdc4';
                    const ac = tab.drInfo.all < 100 ? '#ff6b6b' : tab.drInfo.all < 130 ? '#ffd700' : '#4ecdc4';
                    drBadge = `<span style="font-size:0.72rem;opacity:0.92;padding:1px 4px;border-radius:3px;margin-left:1px;white-space:nowrap;flex-shrink:0;">🛡前7:<b style="color:${f7c}">${tab.drInfo.first7}%</b> 全:<b style="color:${ac}">${tab.drInfo.all}%</b></span>`;
                }
                return `<div onclick="switchScriptEditorTab('${tab.id}')" style="flex-shrink:0;cursor:pointer;display:flex;align-items:center;gap:5px;padding:6px 8px;border-radius:6px 6px 0 0;font-size:0.8rem;white-space:nowrap;transition:all 0.15s;background:${active ? (tab.isScanned ? 'rgba(0,188,212,0.22)' : 'rgba(76,175,80,0.22)') : 'rgba(255,255,255,0.05)'};border:${active ? (tab.isScanned ? '1px solid rgba(0,188,212,0.45)' : '1px solid rgba(76,175,80,0.45)') : '1px solid rgba(255,255,255,0.08)'};border-bottom:none;color:${active ? (tab.isScanned ? '#00bcd4' : '#4caf50') : 'rgba(255,255,255,0.7)'};font-weight:${active ? 'bold' : 'normal'};">
                    <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(tab.name)}">${icon} ${escapeHtml(tab.name)}${dirty}</span>${drBadge}
                    <span onclick="closeScriptEditorTab('${tab.id}', event)" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;font-size:0.75rem;transition:background 0.15s;" onmouseover="this.style.background='rgba(244,67,54,0.35)'" onmouseout="this.style.background='transparent'">×</span>
                </div>`;
            }).join('');
        }

        function refreshScriptEditorBody() {
            const ta = document.getElementById('scriptEditorTextarea');
            const status = document.getElementById('scriptEditorStatus');
            const parseResult = document.getElementById('scriptEditorParseResult');
            const findBar = document.getElementById('scriptEditorFindBar');
            if (!ta) return;

            const tab = getActiveScriptEditorTab();
            if (!tab) {
                ta.value = '';
                ta.placeholder = '选择标签开始编辑…';
                ta.disabled = true;
                if (status) status.textContent = '';
                if (parseResult) parseResult.textContent = '';
                if (findBar) findBar.style.display = 'none';
                return;
            }

            ta.disabled = false;
            ta.value = tab.content;
            if (status) status.textContent = `共 ${tab.content.length} 字${tab.modified ? ' · 已修改' : ''}`;
            if (parseResult) parseResult.textContent = '';
        }

        // 绑定编辑器 textarea 变更同步到标签数据
        (function bindScriptEditorTextarea() {
            const ta = document.getElementById('scriptEditorTextarea');
            if (!ta) return;
            ta.addEventListener('input', function() {
                const tab = getActiveScriptEditorTab();
                if (!tab) return;
                tab.content = this.value;
                tab.modified = tab.content !== tab.originalContent;
                // 实时计算减伤显示在标签上
                tab.drInfo = computeScriptDr(tab.content);
                renderScriptEditorTabs();
                const status = document.getElementById('scriptEditorStatus');
                if (status) status.textContent = tab.drInfo
                    ? `共 ${tab.content.length} 字 · 减伤 前7:${tab.drInfo.first7}% 全:${tab.drInfo.all}%${tab.modified ? ' · 已修改' : ''}`
                    : `共 ${tab.content.length} 字${tab.modified ? ' · 已修改' : ''}`;
            });
        })();

        function scriptEditorSave() {
            const tab = getActiveScriptEditorTab();
            if (!tab) { alert('请先打开一个标签'); return; }

            if (tab.isScanned) {
                // 扫描文件：写回本地原路径
                if (tab.filePath && window.saveFileContent) {
                    window.saveFileContent(tab.filePath, tab.content, (ok, msg) => {
                        if (ok) {
                            tab.originalContent = tab.content;
                            tab.modified = false;
                            renderScriptEditorTabs();
                            refreshScriptEditorBody();
                            const status = document.getElementById('scriptEditorStatus');
                            if (status) {
                                status.textContent = '保存成功（已写回源文件）';
                                setTimeout(() => { if (status) status.textContent = `共 ${tab.content.length} 字`; }, 1500);
                            }
                        } else {
                            alert('保存失败: ' + (msg || '未知错误'));
                        }
                    });
                } else {
                    alert('当前环境不支持写入本地文件');
                }
                return;
            }

            // 项目文件
            if (!txtFiles[tab.fileIndex]) return;

            txtFiles[tab.fileIndex].content = tab.content;
            tab.originalContent = tab.content;
            tab.modified = false;
            renderScriptEditorTabs();
            refreshScriptEditorBody();
            updateTxtFilesList();
            filterTxtFilesList();

            // 写回源文件
            if (txtFiles[tab.fileIndex].path && window.saveFileContent) {
                window.saveFileContent(txtFiles[tab.fileIndex].path, tab.content, (ok, msg) => {
                    if (!ok) console.warn('写回文件失败:', msg);
                });
            }

            // 触发项目自动保存
            if (typeof autoSaveProject === 'function') {
                setTimeout(() => autoSaveProject(), 50);
            }

            const status = document.getElementById('scriptEditorStatus');
            if (status) {
                status.textContent = '保存成功';
                setTimeout(() => { if (status) status.textContent = `共 ${tab.content.length} 字`; }, 1200);
            }
        }

        function scriptEditorParse() {
            const tab = getActiveScriptEditorTab();
            const resultEl = document.getElementById('scriptEditorParseResult');
            if (!tab) { alert('请先打开一个标签'); return; }
            if (!tab.content.trim()) {
                if (resultEl) resultEl.innerHTML = '<span style="color:#f44336;">文件内容为空！</span>';
                return;
            }

            const content = tab.content.trim();
            const target = document.getElementById('scriptEditorTarget')?.value || 'my';

            // 解析"上阵："后面的内容
            const match = content.match(/上阵[：:]\s*(.+)/);
            if (!match || !match[1]) {
                if (resultEl) resultEl.innerHTML = '<span style="color:#f44336;">未找到"上阵："格式的阵容信息！</span>';
                return;
            }

            let heroNames = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
            if (heroNames.length === 0) {
                if (resultEl) resultEl.innerHTML = '<span style="color:#f44336;">未找到英雄名称！</span>';
                return;
            }
            if (heroNames.length > 10) heroNames = heroNames.slice(0, 10);

            const targetHand = target === 'my' ? myHandCards : teammateHandCards;
            let addedCount = 0;
            let notFoundCards = [];
            let duplicateCards = [];

            heroNames.forEach(heroName => {
                const cardEl = document.querySelector(`.card-item[data-name="${heroName}"]`);
                if (!cardEl) { notFoundCards.push(heroName); return; }
                const cardId = cardEl.dataset.id;
                const cardType = cardEl.dataset.type;
                const isEngineering = cardEl.dataset.engineering === 'true';
                const profession = cardEl.dataset.profession;
                if (targetHand.some(c => c.id === cardId) || handHasIdentity(targetHand, heroName)) { duplicateCards.push(heroName); return; }
                if (targetHand.length >= MAX_HAND_CARDS) return;
                targetHand.push({ id: cardId, name: heroName, placed: null, isEngineering, profession, type: cardType });
                addedCount++;
            });

            if (typeof renderMyHand === 'function') renderMyHand();
            if (typeof renderTeammateHand === 'function') renderTeammateHand();
            if (typeof updateTimeLines === 'function') updateTimeLines();

            if (resultEl) {
                let msg = `成功添加 ${addedCount} 张卡牌`;
                const parts = [];
                if (notFoundCards.length > 0) parts.push(`未找到: ${notFoundCards.join(', ')}`);
                if (duplicateCards.length > 0) parts.push(`已存在: ${duplicateCards.join(', ')}`);
                if (parts.length > 0) msg += ' · ' + parts.join(' · ');
                resultEl.innerHTML = `<span style="color:${addedCount > 0 ? '#4caf50' : '#ff9800'};">${msg}</span>`;
            }
        }

        function scriptEditorDownload() {
            const tab = getActiveScriptEditorTab();
            if (!tab) { alert('请先打开一个标签'); return; }
            const isTauri = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
            if (isTauri) {
                _downloadScriptTauri(tab.name, tab.content);
            } else {
                _downloadScriptBlob(tab.name, tab.content);
            }
        }

        function scriptEditorToggleFind() {
            const bar = document.getElementById('scriptEditorFindBar');
            if (!bar) return;
            const show = bar.style.display === 'none';
            bar.style.display = show ? 'block' : 'none';
            if (show) {
                const input = document.getElementById('scriptEditorFindInput');
                const ta = document.getElementById('scriptEditorTextarea');
                if (input && ta) {
                    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                    if (sel) input.value = sel;
                    input.focus();
                    scriptEditorFind('count');
                }
            }
        }

        function scriptEditorFind(direction) {
            const ta = document.getElementById('scriptEditorTextarea');
            const input = document.getElementById('scriptEditorFindInput');
            const countEl = document.getElementById('scriptEditorFindCount');
            if (!ta || !input || !input.value) {
                if (countEl) countEl.textContent = '0个匹配';
                return;
            }
            const query = input.value;
            const caseSensitive = document.getElementById('scriptEditorCaseSensitive')?.checked || false;
            const text = ta.value;
            const flags = caseSensitive ? 'g' : 'gi';

            const matches = [];
            let m;
            const escQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escQuery, flags);
            while ((m = regex.exec(text)) !== null) {
                matches.push(m.index);
                if (m[0].length === 0) regex.lastIndex++;
            }

            if (countEl) countEl.textContent = matches.length > 0 ? '共' + matches.length + '个匹配' : '无匹配';

            if (matches.length === 0) {
                input.style.borderColor = '#f44336';
                setTimeout(() => { input.style.borderColor = ''; }, 1200);
                return;
            }
            input.style.borderColor = '';

            if (direction === 'count') return;

            const step = direction === 'prev' ? -1 : 1;
            let currentIdx = -1;
            if (direction === 'prev') {
                for (let i = matches.length - 1; i >= 0; i--) {
                    if (matches[i] < ta.selectionStart) { currentIdx = i; break; }
                }
                if (currentIdx === -1) currentIdx = matches.length - 1;
            } else {
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i] > ta.selectionStart) { currentIdx = i; break; }
                }
                if (currentIdx === -1) currentIdx = 0;
            }

            const pos = matches[currentIdx];
            ta.focus();
            ta.setSelectionRange(pos, pos + query.length);
            if (countEl) countEl.textContent = '第' + (currentIdx + 1) + '/' + matches.length + '个';
        }

        function scriptEditorReplace() {
            const ta = document.getElementById('scriptEditorTextarea');
            const findInput = document.getElementById('scriptEditorFindInput');
            const replaceInput = document.getElementById('scriptEditorReplaceInput');
            if (!ta || !findInput || !findInput.value) return;
            const query = findInput.value;
            const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
            const caseSensitive = document.getElementById('scriptEditorCaseSensitive')?.checked || false;
            const compare = caseSensitive ? sel === query : sel.toLowerCase() === query.toLowerCase();
            if (!compare) { scriptEditorFind('next'); return; }
            ta.setRangeText(replaceInput.value, ta.selectionStart, ta.selectionEnd, 'select');
            // 触发 input 同步
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            scriptEditorFind('next');
        }

        function scriptEditorReplaceAll() {
            const ta = document.getElementById('scriptEditorTextarea');
            const findInput = document.getElementById('scriptEditorFindInput');
            const replaceInput = document.getElementById('scriptEditorReplaceInput');
            if (!ta || !findInput || !findInput.value) return;
            const query = findInput.value;
            const caseSensitive = document.getElementById('scriptEditorCaseSensitive')?.checked || false;
            const flags = caseSensitive ? 'g' : 'gi';
            const escQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const count = (ta.value.match(new RegExp(escQuery, flags)) || []).length;
            if (count === 0) return;
            if (!confirm(`确定全部替换？共 ${count} 处「${query}」→「${replaceInput.value}」`)) return;
            ta.value = ta.value.replace(new RegExp(escQuery, flags), replaceInput.value);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            scriptEditorFind('count');
        }

        // ========== 多窗口脚本编辑系统 ==========
        let txtFileWindows = []; // 存储所有打开的窗口信息
        let windowZIndex = 1000; // 窗口层级管理
        let topWinZIndex = 0;   // 从设置面板等高层 modal 打开的浮窗专用层级（100000+ 盖过设置面板 99999）

        // 统一脚本查看/编辑浮窗（方案B：浮窗为唯一查看/编辑组件，标签页 openScriptEditorTab 保留）
        // opts: { name, content, fileIndex(可选,>=0=本地txtFiles可保存/对比), readonly(可选) }
        function openScriptNotebook(opts) {
            const name = opts.name || '未命名脚本';
            const content = opts.content || '';
            const fileIndex = (typeof opts.fileIndex === 'number') ? opts.fileIndex : -1;
            const readonly = !!opts.readonly;
            const localPath = opts.localPath || null; // 扫描文件的本地磁盘路径：非项目文件，可写回原文件
            const isTop = !!opts.zAboveSettings; // 是否高于设置面板(99999)，用于从 APP 设置内打开时不被遮挡

            // 本地文件（fileIndex>=0）按 fileIndex 去重，避免同文件多窗口编辑互相覆盖
            if (fileIndex >= 0) {
                const existing = txtFileWindows.find(w => w.fileIndex === fileIndex);
                if (existing) {
                    const existingEl = document.getElementById(existing.id);
                    if (existingEl) {
                        existingEl.style.zIndex = existing.isTop ? (100000 + (++topWinZIndex)) : (++windowZIndex);
                        existingEl.style.display = 'flex';
                        existingEl.style.opacity = '1';
                        // 闪烁提示
                        existingEl.style.borderColor = 'rgba(255,215,0,0.9)';
                        setTimeout(() => { existingEl.style.borderColor = 'rgba(255,215,0,0.3)'; }, 600);
                        return;
                    }
                }
            }
            // 扫描文件（localPath）按路径去重
            if (localPath) {
                const existing = txtFileWindows.find(w => w.localPath === localPath);
                if (existing) {
                    const existingEl = document.getElementById(existing.id);
                    if (existingEl) {
                        existingEl.style.zIndex = existing.isTop ? (100000 + (++topWinZIndex)) : (++windowZIndex);
                        existingEl.style.display = 'flex';
                        existingEl.style.opacity = '1';
                        existingEl.style.borderColor = 'rgba(255,215,0,0.9)';
                        setTimeout(() => { existingEl.style.borderColor = 'rgba(255,215,0,0.3)'; }, 600);
                        return;
                    }
                }
            }

            const windowId = `txtWindow_${fileIndex >= 0 ? fileIndex : 'r'}_${Date.now()}`;
            const winZ = isTop ? (100000 + (++topWinZIndex)) : (++windowZIndex);
            
            // 创建窗口容器
            const windowDiv = document.createElement('div');
            windowDiv.id = windowId;
            windowDiv.dataset.saveName = name;
            windowDiv.className = 'floating-txt-window';
            windowDiv.style.cssText = `
                position: fixed;
                top: ${100 + txtFileWindows.length * 30}px;
                left: ${200 + txtFileWindows.length * 30}px;
                width: 650px;
                height: 500px;
                min-width: 400px;
                min-height: 300px;
                background: linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98));
                border: 2px solid rgba(255,215,0,0.3);
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                z-index: ${winZ};
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 窗口标题栏
            const titleBar = document.createElement('div');
            titleBar.style.cssText = `
                background: linear-gradient(90deg, rgba(255,215,0,0.2), rgba(255,215,0,0.1));
                padding: 10px 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                border-bottom: 1px solid rgba(255,215,0,0.2);
                flex-shrink: 0;
            `;
            const drInfo = computeScriptDr(content);
            const drBadge = drInfo ? buildWindowDrBadge(drInfo) : '';
            titleBar.innerHTML = `
                <span style="color: #ffd700; font-weight: bold; font-size: 14px;display:flex;align-items:center;gap:8px;">
                    📄 ${escapeHtml(name)}
                    <span id="${windowId}_titleDr" style="font-size:0.72rem;font-weight:normal;">${drBadge}</span>
                </span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="position: relative;">
                        <button id="${windowId}_paletteBtn" onclick="toggleNotebookColorPicker('${windowId}')" title="字体颜色" style="background:rgba(255,255,255,0.08);border:none;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.9rem;">🎨</button>
                        <div id="${windowId}_colorPopup" onmousedown="event.stopPropagation()" style="display:none;position:absolute;top:118%;right:0;z-index:20;width:158px;background:linear-gradient(160deg,rgba(40,40,68,0.98),rgba(26,26,48,0.98));border:1px solid rgba(255,215,0,0.35);border-radius:12px;padding:10px 12px;box-shadow:0 8px 30px rgba(0,0,0,0.6);">
                            <div style="font-size:0.76rem;font-weight:bold;color:#ffd700;margin-bottom:8px;white-space:nowrap;">🎨 字体颜色</div>
                            <div style="position:relative;width:132px;height:132px;margin:0 auto 9px;">
                                <canvas id="${windowId}_wheel" style="width:132px;height:132px;border-radius:50%;display:block;cursor:crosshair;box-shadow:0 0 0 1px rgba(255,255,255,0.28),0 4px 14px rgba(0,0,0,0.55);"></canvas>
                                <div id="${windowId}_wheelDot" style="position:absolute;left:66px;top:66px;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,0.9);transform:translate(-50%,-50%);pointer-events:none;"></div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:9px;">
                                <span style="font-size:0.58rem;color:#9a9ab0;flex-shrink:0;">亮度</span>
                                <div id="${windowId}_vBar" style="position:relative;flex:1;height:12px;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.25);background:linear-gradient(to right,#000,#fff);">
                                    <div id="${windowId}_vDot" style="position:absolute;left:100%;top:50%;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,0.5);box-shadow:0 1px 4px rgba(0,0,0,0.7);transform:translate(-50%,-50%);pointer-events:none;"></div>
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                                <span id="${windowId}_preview" style="width:20px;height:20px;border-radius:50%;background:#e0e0e0;border:1px solid rgba(255,255,255,0.6);flex-shrink:0;"></span>
                                <span id="${windowId}_hexTxt" style="font-size:0.66rem;color:#c9c9dd;font-family:Consolas,monospace;">#e0e0e0</span>
                            </div>
                            <div id="${windowId}_colorSlots" style="display:flex;align-items:center;gap:10px;justify-content:center;border-top:1px solid rgba(255,255,255,0.12);padding-top:8px;"></div>
                            <div style="font-size:0.58rem;color:#9a9ab0;margin-top:7px;text-align:center;white-space:nowrap;">全部记事本统一 · 自动保存</div>
                        </div>
                    </div>
                    <button onclick="minimizeTxtWindow('${windowId}')" style="background:rgba(255,193,7,0.2);border:none;color:#ffc107;padding:4px 8px;border-radius:4px;cursor:pointer;">−</button>
                    <button onclick="closeTxtWindow('${windowId}', ${fileIndex})" style="background:rgba(244,67,54,0.2);border:none;color:#f44336;padding:4px 8px;border-radius:4px;cursor:pointer;">×</button>
                </div>
            `;
            
            // 编辑区域
            const contentArea = document.createElement('div');
            contentArea.style.cssText = `
                flex: 1;
                padding: 15px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;
            
            // 编辑器实时减伤显示栏
            const drBar = document.createElement('div');
            drBar.id = `${windowId}_drBar`;
            drBar.style.cssText = 'display:none;padding:8px 12px;border-radius:8px;background:linear-gradient(135deg,rgba(255,215,0,0.06),rgba(255,107,107,0.06));border:1px solid rgba(255,215,0,0.18);font-size:0.8rem;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
            drBar.innerHTML = '<span style="color:#ffd700;">🛡️ <b>减伤</b></span>'
                + '<select id="' + windowId + '_drTable" onchange="updateEditorDamageReduction(\'' + windowId + '\')" style="background:rgba(30,30,60,0.95);border:1px solid rgba(255,215,0,0.4);color:#ffd700;padding:3px 8px;border-radius:6px;font-size:0.78rem;"></select>'
                + '<span style="color:rgba(255,255,255,0.5);">前7卡：</span><b id="' + windowId + '_drFirst7" style="color:#4ecdc4;">--</b>'
                + ' <span style="color:rgba(255,255,255,0.5);">| 全部：</span><b id="' + windowId + '_drAll" style="color:#ff6b6b;">--</b>';
            contentArea.appendChild(drBar);
            
            // 填充减伤表下拉（每窗口独立选择，默认「我的」）
            const drTableSel = drBar.querySelector(`#${windowId}_drTable`);
            if (drTableSel) {
                try {
                    const order = (window.drTableOrder && window.drTableOrder.length) ? window.drTableOrder : ['我的'];
                    drTableSel.innerHTML = order.map(n => `<option value="${n}">${n}</option>`).join('');
                    if (window.__drTableByEditor && window.__drTableByEditor[windowId]) drTableSel.value = window.__drTableByEditor[windowId];
                    else drTableSel.value = (window.drActiveTable && window.drTables[window.drActiveTable]) ? window.drActiveTable : '我的';
                } catch (e) { /* 减伤表尚未初始化则跳过 */ }
            }
            
            const textarea = document.createElement('textarea');
            textarea.id = `${windowId}_content`;
            textarea.style.cssText = `
                width: 100%;
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,215,0,0.2);
                border-radius: 8px;
                color: #e0e0e0;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 14px;
                padding: 12px;
                resize: none;
                outline: none;
                line-height: 1.5;
            `;
            textarea.value = content;
            textarea.spellcheck = false;
            // 实时减伤计算
            if (!readonly) {
                textarea.addEventListener('input', () => {
                    updateEditorDamageReduction(windowId);
                    updateWindowTitleDr(windowId, textarea.value);
                });
            }
            // 初始计算（如果有内容）
            if (content && content.trim()) {
                setTimeout(() => updateEditorDamageReduction(windowId), 300);
            }

            // Ctrl+F 打开查找替换，Esc 关闭
            textarea.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    e.preventDefault();
                    webToggleFindReplace(windowId, true);
                }
                if (e.key === 'Escape') {
                    const bar = document.getElementById(windowId + '_findReplace');
                    if (bar && bar.style.display !== 'none') {
                        bar.style.display = 'none';
                        e.preventDefault();
                    }
                }
            });

            // 查找替换栏（默认隐藏）
            const findReplaceBar = document.createElement('div');
            findReplaceBar.id = `${windowId}_findReplace`;
            findReplaceBar.style.cssText = `
                display: none;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 8px;
                padding: 6px 8px;
                margin-top: 6px;
                flex-shrink: 0;
            `;
            findReplaceBar.innerHTML = `
                <div style="display:flex;gap:4px;align-items:center;margin-bottom:5px;">
                    <input id="${windowId}_findInput" placeholder="查找..." oninput="webFind('${windowId}','count')" onkeydown="if(event.key==='Enter')webFind('${windowId}','next')" style="width:150px;flex-shrink:0;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:0.78rem;">
                    <span id="${windowId}_findCount" style="color:rgba(255,255,255,0.55);font-size:0.72rem;min-width:80px;text-align:center;white-space:nowrap;">0个匹配</span>
                    <button onclick="webFind('${windowId}','prev')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.82rem;white-space:nowrap;" title="上一个 (Shift+Enter)">◀ 上一个</button>
                    <button onclick="webFind('${windowId}','next')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.82rem;white-space:nowrap;" title="下一个 (Enter)">下一个 ▶</button>
                    <span id="${windowId}_cycleHint" style="display:none;color:#ffeb3b;font-size:0.65rem;white-space:nowrap;animation:fadeOut 2s forwards;">↻ 已循环</span>
                    <label style="color:rgba(255,255,255,0.5);font-size:0.72rem;cursor:pointer;white-space:nowrap;margin-left:4px;"><input type="checkbox" id="${windowId}_caseSensitive" style="vertical-align:middle;"> Aa</label>
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <input id="${windowId}_replaceInput" placeholder="替换为..." style="width:150px;flex-shrink:0;background:rgba(0,0,0,0.4);color:#ffeb3b;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:0.78rem;">
                    <button onclick="webReplace('${windowId}')" style="background:rgba(255,152,0,0.25);color:#ff9800;border:1px solid rgba(255,152,0,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">替换</button>
                    <button onclick="webReplaceAll('${windowId}')" style="background:rgba(244,67,54,0.25);color:#f44336;border:1px solid rgba(244,67,54,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">全部替换</button>
                    <button onclick="swapFindReplaceInputs('${windowId}_findInput','${windowId}_replaceInput')" style="background:rgba(77,208,225,0.2);color:#4dd0e1;border:1px solid rgba(77,208,225,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">⇄ 互换</button>
                </div>
            `;

            // 解析结果显示区
            const parseResult = document.createElement('div');
            parseResult.id = `${windowId}_parseResult`;
            parseResult.style.cssText = `
                margin-top: 8px;
                font-size: 0.85rem;
                color: rgba(255,255,255,0.7);
                min-height: 20px;
            `;
            
            // 底部按钮栏
            const buttonBar = document.createElement('div');
            buttonBar.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                padding-top: 10px;
                flex-shrink: 0;
                flex-wrap: wrap;
            `;
            const isLocal = fileIndex >= 0;
            const isScan = !!localPath && !isLocal;
            // 保存按钮：本地项目→存回txtFiles；扫描文件→写回原磁盘路径；远程→保存副本到项目
            const saveBtn = isLocal
                ? `<button onclick="saveTxtWindowContent('${windowId}', ${fileIndex})" style="background:linear-gradient(135deg,#4CAF50,#45a049);border:none;color:white;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:bold;">💾 保存</button>`
                : (isScan
                    ? `<button onclick="saveNotebookLocalFile('${windowId}')" style="background:linear-gradient(135deg,#4CAF50,#45a049);border:none;color:white;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:bold;">💾 保存</button>`
                    : `<button onclick="(function(){try{window.__notebookSaveContent=window.__notebookSaveContent||{};window.__notebookSaveContent['${windowId}']=document.getElementById('${windowId}_content').value;window.__notebookSaveName=window.__notebookSaveName||{};var _sw=document.getElementById('${windowId}');window.__notebookSaveName['${windowId}']=_sw?_sw.dataset.saveName:'';showSaveScriptDialog(null, null, '${windowId}');}catch(e){console.error('保存副本失败:',e);showToast('❌ 打开保存失败：'+(e&&e.message||e));}})()" style="background:linear-gradient(135deg,#4CAF50,#45a049);border:none;color:white;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:bold;">💾 保存副本</button>`);
            buttonBar.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;">
                    <select id="${windowId}_target" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.3);background:#2a2a4a;color:#fff;font-size:0.85rem;cursor:pointer;">
                        <option value="my">我的手牌</option>
                        <option value="teammate">队友手牌</option>
                    </select>
                    <button onclick="parseTxtWindowContent('${windowId}', ${fileIndex})" style="background:linear-gradient(135deg,#00bcd4,#00838f);border:none;color:white;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;">🔍 解析阵容</button>
                </div>
                <div style="display:flex;gap:8px;">
                    <button onclick="webToggleFindReplace('${windowId}')" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔍 查找替换</button>
                    ${isLocal ? `<button onclick="webStartCompare(${fileIndex})" style="background:rgba(233,30,99,0.2);color:#e91e63;border:1px solid rgba(233,30,99,0.3);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📊 对比</button>` : ''}
                    <button onclick="${isLocal ? `downloadTxtFile(${fileIndex})` : `downloadNotebookContent('${windowId}')`}" style="background:linear-gradient(135deg,#2196f3,#1565c0);border:none;color:white;padding:8px 16px;border-radius:6px;cursor:pointer;">📥 下载</button>
                    ${saveBtn}
                </div>
            `;
            
            contentArea.appendChild(textarea);
            contentArea.appendChild(findReplaceBar);
            contentArea.appendChild(parseResult);
            contentArea.appendChild(buttonBar);
            
            windowDiv.appendChild(titleBar);
            windowDiv.appendChild(contentArea);
            
            document.body.appendChild(windowDiv);
            
            // 拖拽功能
            makeWindowDraggable(windowDiv, titleBar);
            
            // 调整大小功能
            makeWindowResizable(windowDiv);
            
            // 点击窗口时提升层级（isTop 浮窗保持高于设置面板 99999，避免掉回面板后面导致点不了）
            windowDiv.addEventListener('mousedown', () => {
                windowDiv.style.zIndex = isTop ? (100000 + (++topWinZIndex)) : (++windowZIndex);
            });
            
            // 记录窗口信息
            txtFileWindows.push({
                id: windowId,
                fileIndex: fileIndex,
                localPath: localPath,
                name: name,
                element: windowDiv,
                drInfo: drInfo,
                isTop: isTop
            });

            // 恢复记忆的字体颜色（全局统一，一处改处处生效）
            (async () => {
                try {
                    const ta0 = document.getElementById(windowId + '_content');
                    if (ta0) ta0.style.color = notebookColorCfg.color;      // 先用本地缓存秒显
                    const color = await getNotebookColorAsync();            // 再用磁盘值校正
                    const ta = document.getElementById(windowId + '_content');
                    if (ta) ta.style.color = color;
                } catch (e) {}
            })();
        }

        // 记事本字体颜色（整篇统一换色，仅显示层，不进文件，不影响保存/老马纯文本）
        // 全局统一：所有记事本共用一个颜色；1 个默认色 + 2 个自选色（调色盘选完自动存）
        // 持久化：D 盘 JSON（App）+ localStorage（网页兜底）
        const NOTEBOOK_COLOR_FILE = 'D:\\withfriends\\塔防精灵助手数据\\notebookColors.json';
        const LS_NOTEBOOK_COLORS = 'tfjl_notebook_colors';
        const DEFAULT_NOTEBOOK_COLOR = '#e0e0e0';        // 啥都没设时的默认色

        // 任意颜色字符串 → #rrggbb（input[type=color] 只认 hex）
        function toHexColor(c) {
            if (!c) return '';
            c = String(c).trim();
            if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
            if (/^#[0-9a-fA-F]{3}$/.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
            const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
            return '';
        }

        function normalizeNotebookColorCfg(o) {
            const color = (o && toHexColor(o.color)) || DEFAULT_NOTEBOOK_COLOR;
            let slots = (o && Array.isArray(o.slots)) ? o.slots.map(toHexColor).filter(Boolean) : [];
            slots = slots.filter((c, i) => c !== DEFAULT_NOTEBOOK_COLOR && slots.indexOf(c) === i).slice(0, 2);
            return { color: color, slots: slots };
        }

        // 当前配置（同步可用，先从 localStorage 秒读，磁盘值异步校正）
        let notebookColorCfg = (function () {
            try { const s = localStorage.getItem(LS_NOTEBOOK_COLORS); if (s) return normalizeNotebookColorCfg(JSON.parse(s)); } catch (e) {}
            return { color: DEFAULT_NOTEBOOK_COLOR, slots: [] };
        })();

        let _nbColorDiskLoaded = false;
        async function getNotebookColorAsync() {
            if (!_nbColorDiskLoaded) {
                _nbColorDiskLoaded = true;
                if (window.readTextFile) {
                    try {
                        const s = await window.readTextFile(NOTEBOOK_COLOR_FILE);
                        if (s) {
                            const o = JSON.parse(s);
                            if (o && typeof o === 'object') {
                                notebookColorCfg = normalizeNotebookColorCfg(o);
                                try { localStorage.setItem(LS_NOTEBOOK_COLORS, JSON.stringify(notebookColorCfg)); } catch (e) {}
                            }
                        }
                    } catch (e) {}
                }
            }
            return notebookColorCfg.color;
        }

        async function saveNotebookColorCfg() {
            try { localStorage.setItem(LS_NOTEBOOK_COLORS, JSON.stringify(notebookColorCfg)); } catch (e) {}
            if (window.writeTextFile) {
                try { await window.writeTextFile(NOTEBOOK_COLOR_FILE, JSON.stringify(notebookColorCfg, null, 2)); } catch (e) {}
            }
        }

        // 只改显示（拖动色轮时高频调用，不落盘）
        function previewNotebookColorLive(hex) {
            notebookColorCfg.color = hex;
            (typeof txtFileWindows !== 'undefined' ? txtFileWindows : []).forEach(w => {
                const ta = document.getElementById(w.id + '_content');
                if (ta) ta.style.color = hex;
            });
        }

        // 换色：所有已打开记事本同步生效并持久化；remember=true 时把颜色存进 2 个自选槽
        function applyNotebookColor(windowId, color, remember) {
            const hex = toHexColor(color) || DEFAULT_NOTEBOOK_COLOR;
            notebookColorCfg.color = hex;
            if (remember && hex !== DEFAULT_NOTEBOOK_COLOR) {
                const slots = notebookColorCfg.slots.filter(c => c !== hex);
                slots.unshift(hex);
                notebookColorCfg.slots = slots.slice(0, 2);
            }
            saveNotebookColorCfg();
            previewNotebookColorLive(hex);
            document.querySelectorAll('[id$="_colorSlots"]').forEach(box => {
                renderNotebookColorSwatches(box.id.replace(/_colorSlots$/, ''));
            });
            // 同步所有已展开浮层的色轮指针/亮度条/预览
            (typeof txtFileWindows !== 'undefined' ? txtFileWindows : []).forEach(w => {
                const pop = document.getElementById(w.id + '_colorPopup');
                if (pop && pop.style.display !== 'none') syncNotebookWheelUI(w.id, hex);
            });
        }

        // ---------- HSV 圆盘取色器（角度=色相，半径=饱和度，下方滑条=亮度）----------
        const nbWheelState = {};   // windowId -> {h(0-360), s(0-1), v(0-1)}

        function nbHsvToRgb(h, s, v) {
            h = ((h % 360) + 360) % 360;
            const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
            let r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
            return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
        }

        function nbHsvToHex(h, s, v) {
            return '#' + nbHsvToRgb(h, s, v).map(x => x.toString(16).padStart(2, '0')).join('');
        }

        function nbHexToHsv(hex) {
            const c = toHexColor(hex) || DEFAULT_NOTEBOOK_COLOR;
            const r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
            let h = 0;
            if (d !== 0) {
                if (mx === r) h = 60 * (((g - b) / d) % 6);
                else if (mx === g) h = 60 * ((b - r) / d + 2);
                else h = 60 * ((r - g) / d + 4);
            }
            if (h < 0) h += 360;
            return [h, mx === 0 ? 0 : d / mx, mx];
        }

        // 绘制色轮（按满亮度画，这样亮度调低时仍能看清各色相）
        function drawNotebookWheel(canvas) {
            const ctx = canvas.getContext('2d');
            const w = canvas.width, hgt = canvas.height, R = w / 2;
            const img = ctx.createImageData(w, hgt);
            const d = img.data;
            for (let y = 0; y < hgt; y++) {
                for (let x = 0; x < w; x++) {
                    const dx = x - R + 0.5, dy = y - R + 0.5;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const i = (y * w + x) * 4;
                    if (dist > R) { d[i + 3] = 0; continue; }
                    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
                    if (deg < 0) deg += 360;
                    const rgb = nbHsvToRgb(deg, Math.min(1, dist / R), 1);
                    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
                    d[i + 3] = dist > R - 1.5 ? Math.max(0, Math.round(255 * (R - dist) / 1.5)) : 255;
                }
            }
            ctx.putImageData(img, 0, 0);
        }

        // 把 hex 同步到色轮 UI（指针位置 / 亮度条 / 预览 / hex 文本）
        function syncNotebookWheelUI(windowId, hex) {
            const canvas = document.getElementById(windowId + '_wheel');
            if (!canvas || canvas.dataset.inited !== '1') return;
            const hsv = nbHexToHsv(hex);
            // 纯黑/纯灰反推不出色相饱和，沿用上一次的，避免亮度拉到 0 再拉回来色相丢失
            const prev = nbWheelState[windowId];
            if (prev) {
                if (hsv[2] === 0) { hsv[0] = prev.h; hsv[1] = prev.s; }
                else if (hsv[1] === 0) { hsv[0] = prev.h; }
            }
            nbWheelState[windowId] = { h: hsv[0], s: hsv[1], v: hsv[2] };
            const R = (canvas.clientWidth || 132) / 2;
            const dot = document.getElementById(windowId + '_wheelDot');
            if (dot) {
                const rad = hsv[0] * Math.PI / 180;
                dot.style.left = (R + Math.cos(rad) * hsv[1] * R) + 'px';
                dot.style.top = (R + Math.sin(rad) * hsv[1] * R) + 'px';
                dot.style.background = hex;
            }
            const bar = document.getElementById(windowId + '_vBar');
            if (bar) bar.style.background = 'linear-gradient(to right,#000,' + nbHsvToHex(hsv[0], hsv[1], 1) + ')';
            const vDot = document.getElementById(windowId + '_vDot');
            if (vDot) { vDot.style.left = (hsv[2] * 100) + '%'; vDot.style.background = hex; }
            const pv = document.getElementById(windowId + '_preview');
            if (pv) pv.style.background = hex;
            const tx = document.getElementById(windowId + '_hexTxt');
            if (tx) tx.textContent = hex;
        }

        // 渲染色块：默认色 + 2 个自选色（空槽显示虚线圆占位）
        function renderNotebookColorSwatches(windowId) {
            const box = document.getElementById(windowId + '_colorSlots');
            if (!box) return;
            const cur = notebookColorCfg.color;
            const list = [DEFAULT_NOTEBOOK_COLOR].concat(notebookColorCfg.slots);
            let html = list.map((c, i) => {
                const on = (c === cur);
                return `<button type="button" onclick="applyNotebookColor('${windowId}','${c}')" title="${i === 0 ? '默认色' : '自选色'} ${c}" style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid ${on ? '#ffd700' : 'rgba(255,255,255,0.55)'};cursor:pointer;padding:0;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></button>`;
            }).join('');
            for (let i = list.length; i < 3; i++) {
                html += `<span title="用右侧调色盘选个颜色，会自动存到这里" style="width:26px;height:26px;border-radius:50%;border:1px dashed rgba(255,255,255,0.3);display:inline-block;"></span>`;
            }
            box.innerHTML = html;
        }

        // 首次展开时初始化色轮（canvas 尺寸 + 点击/拖动事件）
        function setupNotebookColorWheel(windowId) {
            const canvas = document.getElementById(windowId + '_wheel');
            const bar = document.getElementById(windowId + '_vBar');
            if (!canvas || canvas.dataset.inited === '1') return;
            canvas.dataset.inited = '1';
            const SIZE = 132, dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.round(SIZE * dpr);
            canvas.height = Math.round(SIZE * dpr);
            drawNotebookWheel(canvas);

            const st = () => (nbWheelState[windowId] = nbWheelState[windowId] || { h: 0, s: 0, v: 0.88 });

            // 色轮：点任意位置 / 按住拖动（超出圆边则贴边取满饱和度）
            const pickFromWheel = (e) => {
                const rect = canvas.getBoundingClientRect();
                const nx = (e.clientX - rect.left) / rect.width * 2 - 1;
                const ny = (e.clientY - rect.top) / rect.height * 2 - 1;
                let deg = Math.atan2(ny, nx) * 180 / Math.PI;
                if (deg < 0) deg += 360;
                const s = st();
                s.h = deg;
                s.s = Math.min(1, Math.sqrt(nx * nx + ny * ny));
                if (s.v < 0.15) s.v = 1;   // 亮度太低时点色轮看不出变化，自动提亮
                const hex = nbHsvToHex(s.h, s.s, s.v);
                previewNotebookColorLive(hex);
                syncNotebookWheelUI(windowId, hex);
                return hex;
            };
            // 亮度条：点 / 拖
            const pickFromBar = (e) => {
                const rect = bar.getBoundingClientRect();
                const s = st();
                s.v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const hex = nbHsvToHex(s.h, s.s, s.v);
                previewNotebookColorLive(hex);
                syncNotebookWheelUI(windowId, hex);
                return hex;
            };

            const bindDrag = (el, picker) => {
                if (!el) return;
                el.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();   // 关键：不让标题栏 makeWindowDraggable 抢走，否则变成拖窗口
                    let hex = picker(e);
                    const onMove = (ev) => { ev.preventDefault(); hex = picker(ev); };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove, true);
                        document.removeEventListener('mouseup', onUp, true);
                        applyNotebookColor(windowId, hex, true);   // 松手才落盘 + 记进自选色
                    };
                    document.addEventListener('mousemove', onMove, true);
                    document.addEventListener('mouseup', onUp, true);
                });
            };
            bindDrag(canvas, pickFromWheel);
            bindDrag(bar, pickFromBar);
        }

        // 标题栏 🎨 颜料盘：展开/收起颜色浮层（点其他处自动关闭）
        function toggleNotebookColorPicker(windowId) {
            const pop = document.getElementById(windowId + '_colorPopup');
            if (!pop) return;
            const show = pop.style.display === 'none';
            document.querySelectorAll('[id$="_colorPopup"]').forEach(p => p.style.display = 'none');
            pop.style.display = show ? 'block' : 'none';
            if (show) {
                renderNotebookColorSwatches(windowId);
                setupNotebookColorWheel(windowId);
                syncNotebookWheelUI(windowId, notebookColorCfg.color);
                setTimeout(() => {
                    const docClose = (e) => {
                        if (!pop.contains(e.target) && e.target.id !== windowId + '_paletteBtn') {
                            pop.style.display = 'none';
                            document.removeEventListener('mousedown', docClose, true);
                        }
                    };
                    document.addEventListener('mousedown', docClose, true);
                }, 0);
            }
        }

        // 兼容包装：脚本文件列表「✏️ 浮窗编辑」仍调用统一浮窗（本地文件，可保存/对比）
        function openTxtFileWindow(index) {
            if (!txtFiles[index]) return;
            openScriptNotebook({ name: txtFiles[index].name, content: txtFiles[index].content, fileIndex: index });
        }

        // ==================== 网页版文本查找替换 ====================

        function webToggleFindReplace(windowId, forceOpen) {
            const bar = document.getElementById(windowId + '_findReplace');
            if (!bar) return;
            if (forceOpen === true) {
                bar.style.display = 'block';
                const findInput = document.getElementById(windowId + '_findInput');
                if (findInput) {
                    const ta = document.getElementById(windowId + '_content');
                    if (ta) {
                        const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                        if (sel) findInput.value = sel;
                    }
                    findInput.focus();
                    webFind(windowId, 'count');
                }
                return;
            }
            bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
            if (bar.style.display !== 'none') {
                const findInput = document.getElementById(windowId + '_findInput');
                if (findInput) {
                    const ta = document.getElementById(windowId + '_content');
                    if (ta) {
                        const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                        if (sel) findInput.value = sel;
                    }
                    findInput.focus();
                    webFind(windowId, 'count');
                }
            }
        }

        function webFind(windowId, direction) {
            const ta = document.getElementById(windowId + '_content');
            const input = document.getElementById(windowId + '_findInput');
            const countEl = document.getElementById(windowId + '_findCount');
            const cycleHint = document.getElementById(windowId + '_cycleHint');
            if (!ta || !input || !input.value) {
                if (countEl) countEl.textContent = '就绪';
                return;
            }
            const query = input.value;
            const caseSensitive = document.getElementById(windowId + '_caseSensitive')?.checked || false;
            const text = ta.value;
            const flags = caseSensitive ? 'g' : 'gi';

            const matches = [];
            let m;
            const escQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escQuery, flags);
            while ((m = regex.exec(text)) !== null) {
                matches.push(m.index);
                if (m[0].length === 0) regex.lastIndex++;
            }

            if (countEl) countEl.textContent = matches.length > 0 ? '共' + matches.length + '个匹配' : '无匹配';

            if (matches.length === 0) {
                input.style.borderColor = '#f44336';
                setTimeout(() => { input.style.borderColor = ''; }, 1200);
                if (cycleHint) cycleHint.style.display = 'none';
                return;
            }
            input.style.borderColor = '';

            if (direction === 'count') {
                if (cycleHint) cycleHint.style.display = 'none';
                return;
            }

            const step = direction === 'prev' ? -1 : 1;
            let currentIdx = -1;
            let wrapped = false;
            if (direction === 'prev') {
                for (let i = matches.length - 1; i >= 0; i--) {
                    if (matches[i] < ta.selectionStart) { currentIdx = i; break; }
                }
                if (currentIdx === -1) { currentIdx = matches.length - 1; wrapped = true; }
            } else {
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i] > ta.selectionStart) { currentIdx = i; break; }
                }
                if (currentIdx === -1) { currentIdx = 0; wrapped = true; }
            }

            const pos = matches[currentIdx];
            ta.focus();
            ta.setSelectionRange(pos, pos + query.length);
            ta.blur();
            ta.focus();
            const before = text.substring(0, pos);
            const lineNum = before.split('\n').length;
            ta.scrollTop = Math.max(0, (lineNum - 3) * 20);

            if (countEl) countEl.textContent = '第' + (currentIdx + 1) + '/' + matches.length + '个';

            // 循环提示
            if (wrapped && cycleHint) {
                cycleHint.style.display = 'inline';
                cycleHint.style.animation = 'none';
                void cycleHint.offsetWidth; // 强制回流
                cycleHint.style.animation = 'fadeOut 2s forwards';
            }
        }

        function webReplace(windowId) {
            const ta = document.getElementById(windowId + '_content');
            const findInput = document.getElementById(windowId + '_findInput');
            const replaceInput = document.getElementById(windowId + '_replaceInput');
            if (!ta || !findInput || !findInput.value) return;
            const query = findInput.value;
            const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
            const caseSensitive = document.getElementById(windowId + '_caseSensitive')?.checked || false;
            const compare = caseSensitive ? sel === query : sel.toLowerCase() === query.toLowerCase();
            if (!compare) { webFind(windowId, 'next'); return; }
            ta.setRangeText(replaceInput.value, ta.selectionStart, ta.selectionEnd, 'select');
            webFind(windowId, 'next');
        }

        function webReplaceAll(windowId) {
            const ta = document.getElementById(windowId + '_content');
            const findInput = document.getElementById(windowId + '_findInput');
            const replaceInput = document.getElementById(windowId + '_replaceInput');
            if (!ta || !findInput || !findInput.value) return;
            const query = findInput.value;
            const caseSensitive = document.getElementById(windowId + '_caseSensitive')?.checked || false;
            const flags = caseSensitive ? 'g' : 'gi';
            const escQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const count = (ta.value.match(new RegExp(escQuery, flags)) || []).length;
            if (count === 0) { alert('未找到匹配项'); return; }
            if (!confirm('找到 ' + count + ' 处匹配，确认全部替换？')) return;
            ta.value = ta.value.replace(new RegExp(escQuery, flags), replaceInput.value);
            const countEl = document.getElementById(windowId + '_findCount');
            if (countEl) countEl.textContent = '0/0';
            alert('已替换 ' + count + ' 处');
        }

        // ==================== 网页版文件对比 ====================

        function webStartCompare(currentIndex) {
            const currentFile = txtFiles[currentIndex];
            if (!currentFile) return;

            // 列出其他脚本文件供选择
            const others = txtFiles.filter((f, i) => i !== currentIndex).map((f, i) => {
                const realIdx = txtFiles.indexOf(f);
                return { label: `[${realIdx + 1}] ${escapeHtml(f.name)}`, index: realIdx };
            });

            if (others.length === 0) {
                alert('没有其他脚本文件可用于对比');
                return;
            }

            let modal = document.getElementById('webCompareSelectModal');
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = 'webCompareSelectModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:100000;display:flex;justify-content:center;align-items:center;';
            modal.innerHTML = `<div style="background:#1a1a2e;border:2px solid rgba(233,30,99,0.5);border-radius:12px;padding:20px;width:480px;max-width:95vw;height:60vh;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h3 style="color:#fff;margin:0;">📊 选择对比文件</h3>
                    <button onclick="document.getElementById('webCompareSelectModal').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:30px;height:30px;border-radius:5px;cursor:pointer;">×</button>
                </div>
                <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-bottom:6px;">当前文件：<span style="color:#4caf50;">${escapeHtml(currentFile.name)}</span></div>
                <input id="webCompareSearch" placeholder="搜索文件名..." oninput="webFilterCompareList()" style="background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;font-size:0.85rem;margin-bottom:8px;">
                <div id="webCompareList" style="flex:1;overflow:auto;">${others.map(f =>
                    `<div class="web-compare-item" data-idx="${f.index}" style="color:#fff;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;font-size:0.8rem;" onclick="webOpenCompare(${currentIndex},${f.index})">${f.label}</div>`
                ).join('')}</div>
            </div>`;
            document.body.appendChild(modal);
        }

        function webFilterCompareList() {
            const q = (document.getElementById('webCompareSearch')?.value || '').toLowerCase();
            document.querySelectorAll('.web-compare-item').forEach(el => {
                el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        }

        function webOpenCompare(idx1, idx2) {
            document.getElementById('webCompareSelectModal')?.remove();
            const f1 = txtFiles[idx1], f2 = txtFiles[idx2];
            if (!f1 || !f2) return;

            const lines1 = f1.content.split('\n');
            const lines2 = f2.content.split('\n');
            const diff = computeLineDiff(lines1, lines2);
            const sameCount = diff.filter(d => d.type === 'same').length;
            const diffCount = diff.filter(d => d.type !== 'same').length;

            let modal = document.getElementById('webDiffModal');
            if (modal) modal.remove();
            modal = document.createElement('div');
            modal.id = 'webDiffModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:100001;display:flex;justify-content:center;align-items:center;';

            const diffViewHtml = renderDiffView(diff);
            modal.innerHTML = `<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(233,30,99,0.5);border-radius:12px;padding:16px;width:95vw;max-width:1100px;height:85vh;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-shrink:0;">
                    <div style="display:flex;gap:16px;align-items:center;">
                        <span style="color:#4caf50;font-size:0.9rem;">📄 ${escapeHtml(f1.name)}</span>
                        <span style="color:#e91e63;">⇄</span>
                        <span style="color:#ff9800;font-size:0.9rem;">📄 ${escapeHtml(f2.name)}</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <span style="color:rgba(255,255,255,0.5);font-size:0.75rem;">相同<span style="color:#4caf50;">${sameCount}</span>行 · 差异<span style="color:#e91e63;">${diffCount}</span>行</span>
                        <button onclick="webToggleDiffView()" style="background:rgba(156,39,176,0.4);color:#ce93d8;border:1px solid rgba(156,39,176,0.4);padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">✏️ 并排编辑</button>
                        <button onclick="document.getElementById('webDiffModal').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:28px;height:28px;border-radius:5px;cursor:pointer;font-size:1.1rem;">×</button>
                    </div>
                </div>
                <!-- 差异视图 -->
                <div id="webDiffView" style="flex:1;overflow:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(0,0,0,0.4);">
                    <div style="display:flex;font-family:'Consolas','Courier New',monospace;font-size:0.75rem;line-height:1.6;">${diffViewHtml}</div>
                </div>
                <!-- 并排编辑视图（默认隐藏） -->
                <div id="webSplitView" style="display:none;flex:1;gap:8px;min-height:0;">
                    <div style="flex:1;display:flex;flex-direction:column;">
                        <div style="color:#4caf50;font-size:0.7rem;padding:2px 8px;background:rgba(0,0,0,0.3);border-radius:4px 4px 0 0;">${escapeHtml(f1.name)}</div>
                        <textarea id="webDiffLeft" style="flex:1;background:rgba(0,0,0,0.4);color:#0f0;border:1px solid rgba(76,175,80,0.3);border-radius:0 0 6px 6px;padding:10px;font-family:'Consolas',monospace;font-size:0.8rem;resize:none;line-height:1.5;overflow:auto;" onscroll="webSyncScroll(this,'right')">${escapeHtml(f1.content)}</textarea>
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;">
                        <div style="color:#ff9800;font-size:0.7rem;padding:2px 8px;background:rgba(0,0,0,0.3);border-radius:4px 4px 0 0;">${escapeHtml(f2.name)}</div>
                        <textarea id="webDiffRight" style="flex:1;background:rgba(0,0,0,0.4);color:#0f0;border:1px solid rgba(255,152,0,0.3);border-radius:0 0 6px 6px;padding:10px;font-family:'Consolas',monospace;font-size:0.8rem;resize:none;line-height:1.5;overflow:auto;" onscroll="webSyncScroll(this,'left')">${escapeHtml(f2.content)}</textarea>
                    </div>
                </div>
            </div>`;
            document.body.appendChild(modal);

            window._webDiffIdx1 = idx1;
            window._webDiffIdx2 = idx2;
        }

        function webToggleDiffView() {
            const diffView = document.getElementById('webDiffView');
            const splitView = document.getElementById('webSplitView');
            const btn = document.querySelector('#webDiffModal button[onclick="webToggleDiffView()"]');
            if (!diffView || !splitView) return;
            if (diffView.style.display !== 'none') {
                diffView.style.display = 'none';
                splitView.style.display = 'flex';
                if (btn) btn.textContent = '📊 差异视图';
            } else {
                diffView.style.display = 'block';
                splitView.style.display = 'none';
                if (btn) btn.textContent = '✏️ 并排编辑';
            }
        }

        function webSyncScroll(source, targetSide) {
            const target = document.getElementById(targetSide === 'right' ? 'webDiffRight' : 'webDiffLeft');
            if (target && !target.dataset.scrolling) {
                target.dataset.scrolling = '1';
                target.scrollTop = source.scrollTop;
                setTimeout(() => { delete target.dataset.scrolling; }, 50);
            }
        }

        // ==================== 通用LCS差异算法（app-local.js和网页版共用） ====================

        function computeLineDiff(lines1, lines2) {
            const m = lines1.length, n = lines2.length;
            if (m === 0 && n === 0) return [];
            // 对较短的数组用简化算法
            const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    if (lines1[i - 1] === lines2[j - 1]) {
                        dp[i][j] = dp[i - 1][j - 1] + 1;
                    } else {
                        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                    }
                }
            }
            const result = [];
            let i = m, j = n;
            const stack = [];
            while (i > 0 || j > 0) {
                if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
                    stack.push({ type: 'same', left: lines1[i - 1], right: lines2[j - 1] });
                    i--; j--;
                } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                    stack.push({ type: 'added', left: null, right: lines2[j - 1] });
                    j--;
                } else {
                    stack.push({ type: 'deleted', left: lines1[i - 1], right: null });
                    i--;
                }
            }
            while (stack.length > 0) result.push(stack.pop());
            return result;
        }

        function renderDiffView(diff) {
            let leftHtml = '<div style="flex:1;min-width:0;border-right:1px solid rgba(255,255,255,0.1);"><div style="color:#4caf50;padding:4px 8px;font-size:0.7rem;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.1);font-weight:bold;">左侧文件</div>';
            let rightHtml = '<div style="flex:1;min-width:0;"><div style="color:#ff9800;padding:4px 8px;font-size:0.7rem;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.1);font-weight:bold;">右侧文件</div>';
            for (const d of diff) {
                if (d.type === 'same') {
                    leftHtml += '<div style="padding:1px 8px;color:rgba(255,255,255,0.7);font-size:0.7rem;">' + (d.left ? escapeHtml(d.left) : ' ') + '</div>';
                    rightHtml += '<div style="padding:1px 8px;color:rgba(255,255,255,0.7);font-size:0.7rem;">' + (d.right ? escapeHtml(d.right) : ' ') + '</div>';
                } else if (d.type === 'deleted') {
                    leftHtml += '<div style="padding:1px 8px;background:rgba(244,67,54,0.25);color:#ef9a9a;font-size:0.7rem;">− ' + escapeHtml(d.left || ' ') + '</div>';
                    rightHtml += '<div style="padding:1px 8px;background:rgba(244,67,54,0.08);">&nbsp;</div>';
                } else {
                    leftHtml += '<div style="padding:1px 8px;background:rgba(76,175,80,0.08);">&nbsp;</div>';
                    rightHtml += '<div style="padding:1px 8px;background:rgba(76,175,80,0.25);color:#a5d6a7;font-size:0.7rem;">+ ' + escapeHtml(d.right || ' ') + '</div>';
                }
            }
            leftHtml += '</div>'; rightHtml += '</div>';
            return leftHtml + rightHtml;
        }

        // 窗口拖拽
        function makeWindowDraggable(windowDiv, handle) {
            let isDragging = false;
            let startX, startY, startLeft, startTop;
            
            handle.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = windowDiv.offsetLeft;
                startTop = windowDiv.offsetTop;
                windowDiv.style.transition = 'none';
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                windowDiv.style.left = (startLeft + dx) + 'px';
                windowDiv.style.top = (startTop + dy) + 'px';
            });
            
            document.addEventListener('mouseup', () => {
                isDragging = false;
                windowDiv.style.transition = '';
            });
        }

        // 窗口调整大小
        function makeWindowResizable(windowDiv) {
            const resizer = document.createElement('div');
            resizer.style.cssText = `
                position: absolute;
                right: 0;
                bottom: 0;
                width: 20px;
                height: 20px;
                cursor: se-resize;
                background: linear-gradient(135deg, transparent 50%, rgba(255,215,0,0.3) 50%);
                border-radius: 0 0 12px 0;
            `;
            windowDiv.appendChild(resizer);
            windowDiv.style.position = 'fixed';
            
            let isResizing = false;
            let startX, startY, startWidth, startHeight;
            
            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = windowDiv.offsetWidth;
                startHeight = windowDiv.offsetHeight;
                e.stopPropagation();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const newWidth = Math.max(300, startWidth + dx);
                const newHeight = Math.max(200, startHeight + dy);
                windowDiv.style.width = newWidth + 'px';
                windowDiv.style.height = newHeight + 'px';
            });
            
            document.addEventListener('mouseup', () => {
                isResizing = false;
            });
        }

        // 最小化窗口
        function minimizeTxtWindow(windowId) {
            const win = document.getElementById(windowId);
            if (win) {
                win.style.display = win.style.display === 'none' ? 'flex' : 'none';
            }
        }

        // 关闭窗口
        function closeTxtWindow(windowId, fileIndex) {
            const win = document.getElementById(windowId);
            if (win) {
                win.remove();
                txtFileWindows = txtFileWindows.filter(w => w.id !== windowId);
            }
        }

        // ==================== 本地扫描文件窗口（预览/编辑） ====================
        let localFileWindows = [];

        // 扫描文件走统一记事本框架：先读磁盘内容，再交给 openScriptNotebook（带减伤栏/解析/查找替换/写回原文件/存项目）
        async function openScannedInNotebook(filePath, fileName, readOnly, zAboveSettings) {
            let realPath = filePath, realName = fileName;
            if (typeof realPath === 'string') realPath = realPath.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
            if (typeof realName === 'string') realName = realName.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
            let content = '';
            try {
                if (window.readTextFile) {
                    content = await window.readTextFile(realPath);
                    if (content === null || content === undefined) { alert('读取文件失败: ' + realPath); return; }
                } else {
                    alert('当前环境不支持读取本地文件，请在 App 中使用此功能'); return;
                }
            } catch (e) { alert('读取文件失败: ' + e.message); return; }
            openScriptNotebook({ name: realName, content: content, localPath: realPath, readonly: !!readOnly, zAboveSettings: !!zAboveSettings });
        }

        async function openLocalFileWindow(filePath, fileName, readOnly) {
            // 解码路径（从 HTML 属性中传入的路径可能有转义）
            let realPath = filePath;
            let realName = fileName;
            if (typeof realPath === 'string') realPath = realPath.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
            if (typeof realName === 'string') realName = realName.replace(/\\\\/g, '\\').replace(/\\'/g, "'");

            // 如果该文件已有打开窗口，直接聚焦
            const existing = localFileWindows.find(w => w.filePath === realPath);
            if (existing) {
                const existingEl = document.getElementById(existing.id);
                if (existingEl) {
                    existingEl.style.zIndex = ++windowZIndex;
                    existingEl.style.display = 'flex';
                    existingEl.style.opacity = '1';
                    existingEl.style.borderColor = 'rgba(255,215,0,0.9)';
                    setTimeout(() => { existingEl.style.borderColor = 'rgba(255,215,0,0.3)'; }, 600);
                    return;
                }
            }

            // 读取文件内容
            let content = '';
            try {
                if (window.readTextFile) {
                    content = await window.readTextFile(realPath);
                    if (content === null || content === undefined) {
                        alert('读取文件失败: ' + realPath);
                        return;
                    }
                } else {
                    alert('当前环境不支持读取本地文件，请在 App 中使用此功能');
                    return;
                }
            } catch (e) {
                alert('读取文件失败: ' + e.message);
                return;
            }

            const windowId = `localWin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const borderColor = readOnly ? 'rgba(0,188,212,0.3)' : 'rgba(76,175,80,0.3)';
            const titleColor = readOnly ? '#00bcd4' : '#81c784';

            const windowDiv = document.createElement('div');
            windowDiv.id = windowId;
            windowDiv.className = 'floating-txt-window';
            windowDiv.style.cssText = `
                position: fixed;
                top: ${100 + localFileWindows.length * 30}px;
                left: ${200 + localFileWindows.length * 30}px;
                width: 650px;
                height: 500px;
                min-width: 400px;
                min-height: 300px;
                background: linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98));
                border: 2px solid ${borderColor};
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                z-index: ${++windowZIndex};
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            const titleBar = document.createElement('div');
            titleBar.style.cssText = `
                background: linear-gradient(90deg, ${readOnly ? 'rgba(0,188,212,0.2), rgba(0,188,212,0.1)' : 'rgba(76,175,80,0.2), rgba(76,175,80,0.1)'});
                padding: 10px 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                border-bottom: 1px solid ${borderColor};
                flex-shrink: 0;
            `;
            const modeLabel = readOnly ? '👁️ 预览' : '✏️ 编辑';
            const localDrInfo = computeScriptDr(content);
            const localDrBadge = localDrInfo ? buildWindowDrBadge(localDrInfo) : '';
            titleBar.innerHTML = `
                <span style="color: ${titleColor}; font-weight: bold; font-size: 14px;display:flex;align-items:center;gap:8px;">
                    ${modeLabel}: ${escapeHtml(realName)}
                    <span id="${windowId}_titleDr" style="font-size:0.72rem;font-weight:normal;">${localDrBadge}</span>
                </span>
                <div style="display: flex; gap: 8px;">
                    <button onclick="minimizeTxtWindow('${windowId}')" style="background:rgba(255,193,7,0.2);border:none;color:#ffc107;padding:4px 8px;border-radius:4px;cursor:pointer;">−</button>
                    <button onclick="closeLocalFileWindow('${windowId}')" style="background:rgba(244,67,54,0.2);border:none;color:#f44336;padding:4px 8px;border-radius:4px;cursor:pointer;">×</button>
                </div>
            `;

            const contentArea = document.createElement('div');
            contentArea.style.cssText = `
                flex: 1;
                padding: 15px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            const textarea = document.createElement('textarea');
            textarea.id = `${windowId}_content`;
            textarea.style.cssText = `
                width: 100%;
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid ${borderColor};
                border-radius: 8px;
                color: #e0e0e0;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 14px;
                padding: 12px;
                resize: none;
                outline: none;
                line-height: 1.5;
            `;
            textarea.value = content;
            textarea.spellcheck = false;
            if (readOnly) {
                textarea.readOnly = true;
                textarea.style.cursor = 'default';
            } else {
                // 本地文件编辑模式：实时更新标题栏减伤
                textarea.addEventListener('input', () => updateWindowTitleDr(windowId, textarea.value));
            }
            textarea.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    e.preventDefault();
                    webToggleFindReplace('${windowId}', true);
                }
                if (e.key === 'Escape') {
                    const bar = document.getElementById('${windowId}_findReplace');
                    if (bar && bar.style.display !== 'none') {
                        bar.style.display = 'none';
                        e.preventDefault();
                    }
                }
            });

            // 查找替换栏
            const findReplaceBar = document.createElement('div');
            findReplaceBar.id = `${windowId}_findReplace`;
            findReplaceBar.style.cssText = `
                display: none;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 8px;
                padding: 6px 8px;
                margin-top: 6px;
                flex-shrink: 0;
            `;
            findReplaceBar.innerHTML = `
                <div style="display:flex;gap:4px;align-items:center;margin-bottom:5px;">
                    <input id="${windowId}_findInput" placeholder="查找..." oninput="webFind('${windowId}','count')" onkeydown="if(event.key==='Enter')webFind('${windowId}','next')" style="width:150px;flex-shrink:0;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:0.78rem;">
                    <span id="${windowId}_findCount" style="color:rgba(255,255,255,0.55);font-size:0.72rem;min-width:80px;text-align:center;white-space:nowrap;">0个匹配</span>
                    <button onclick="webFind('${windowId}','prev')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.82rem;white-space:nowrap;" title="上一个 (Shift+Enter)">◀ 上一个</button>
                    <button onclick="webFind('${windowId}','next')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.82rem;white-space:nowrap;" title="下一个 (Enter)">下一个 ▶</button>
                    <span id="${windowId}_cycleHint" style="display:none;color:#ffeb3b;font-size:0.65rem;white-space:nowrap;animation:fadeOut 2s forwards;">↻ 已循环</span>
                    <label style="color:rgba(255,255,255,0.5);font-size:0.72rem;cursor:pointer;white-space:nowrap;margin-left:4px;"><input type="checkbox" id="${windowId}_caseSensitive" style="vertical-align:middle;"> Aa</label>
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <input id="${windowId}_replaceInput" placeholder="替换为..." style="width:150px;flex-shrink:0;background:rgba(0,0,0,0.4);color:#ffeb3b;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:0.78rem;">
                    <button onclick="webReplace('${windowId}')" style="background:rgba(255,152,0,0.25);color:#ff9800;border:1px solid rgba(255,152,0,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">替换</button>
                    <button onclick="webReplaceAll('${windowId}')" style="background:rgba(244,67,54,0.25);color:#f44336;border:1px solid rgba(244,67,54,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">全部替换</button>
                    <button onclick="swapFindReplaceInputs('${windowId}_findInput','${windowId}_replaceInput')" style="background:rgba(77,208,225,0.2);color:#4dd0e1;border:1px solid rgba(77,208,225,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">⇄ 互换</button>
                </div>
            `;

            const buttonBar = document.createElement('div');
            buttonBar.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                padding-top: 10px;
                flex-shrink: 0;
                flex-wrap: wrap;
            `;

            const saveBtn = readOnly ? '' : `<button onclick="saveLocalFileWindow('${windowId}')" style="background:linear-gradient(135deg,#4CAF50,#45a049);border:none;color:white;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:bold;">💾 保存</button>`;

            buttonBar.innerHTML = `
                <div style="display:flex;gap:8px;">
                    <span style="color:rgba(255,255,255,0.3);font-size:0.75rem;display:flex;align-items:center;">${escapeHtml(realPath)}</span>
                </div>
                <div style="display:flex;gap:8px;">
                    <button onclick="webToggleFindReplace('${windowId}')" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔍 查找替换</button>
                    <button onclick="downloadLocalFileContent('${windowId}')" style="background:linear-gradient(135deg,#2196f3,#1565c0);border:none;color:white;padding:8px 16px;border-radius:6px;cursor:pointer;">📥 下载</button>
                    ${saveBtn}
                </div>
            `;

            contentArea.appendChild(textarea);
            contentArea.appendChild(findReplaceBar);
            contentArea.appendChild(buttonBar);

            windowDiv.appendChild(titleBar);
            windowDiv.appendChild(contentArea);

            document.body.appendChild(windowDiv);

            makeWindowDraggable(windowDiv, titleBar);
            makeWindowResizable(windowDiv);

            windowDiv.addEventListener('mousedown', () => {
                windowDiv.style.zIndex = ++windowZIndex;
            });

            localFileWindows.push({
                id: windowId,
                filePath: realPath,
                fileName: realName,
                readOnly: readOnly,
                element: windowDiv,
                drInfo: localDrInfo
            });
        }

        function closeLocalFileWindow(windowId) {
            const win = document.getElementById(windowId);
            if (win) {
                win.remove();
                localFileWindows = localFileWindows.filter(w => w.id !== windowId);
            }
        }

        async function saveLocalFileWindow(windowId) {
            const textarea = document.getElementById(`${windowId}_content`);
            if (!textarea) { alert('找不到编辑区域'); return; }
            const win = localFileWindows.find(w => w.id === windowId);
            if (!win) { alert('找不到窗口信息'); return; }

            try {
                if (window.writeTextFile) {
                    const ok = await window.writeTextFile(win.filePath, textarea.value);
                    if (ok) {
                        showToast('✅ 文件已保存: ' + win.fileName);
                    } else {
                        alert('保存失败，请检查文件路径权限');
                    }
                } else {
                    alert('当前环境不支持保存本地文件，请在 App 中使用此功能');
                }
            } catch (e) {
                alert('保存失败: ' + e.message);
            }
        }

        async function downloadLocalFileContent(windowId) {
            const textarea = document.getElementById(`${windowId}_content`);
            if (!textarea) return;
            const win = localFileWindows.find(w => w.id === windowId);
            if (!win) return;
            const content = textarea.value;
            const isTauri = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
            if (isTauri) {
                await _downloadScriptTauri(win.fileName, content);
            } else {
                _downloadScriptBlob(win.fileName, content);
            }
        }

        async function renameScannedFile(filePath, fileName) {
            let realPath = filePath.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
            let realName = fileName.replace(/\\\\/g, '\\').replace(/\\'/g, "'");

            if (!window.readTextFile || !window.renameLocalFile) {
                alert('改名功能仅在 App 中可用');
                return;
            }

            const newName = prompt('请输入新文件名：', realName);
            if (!newName || newName === realName) return;

            // 构建新路径（在同一目录下）
            const dirPath = realPath.substring(0, realPath.lastIndexOf('\\') + 1);
            const newPath = dirPath + newName;

            try {
                const ok = await window.renameLocalFile(realPath, newPath);
                if (ok) {
                    showToast('✅ 文件已重命名: ' + realName + ' → ' + newName);
                    // 重新扫描以刷新列表
                    if (typeof window.scanAllFiles === 'function') {
                        setTimeout(() => window.scanAllFiles(), 300);
                    }
                } else {
                    alert('重命名失败，请检查目标文件是否已存在');
                }
            } catch (e) {
                alert('重命名失败: ' + e.message);
            }
        }

        async function shareScannedFileToWall(filePath, fileName, providedName = null, shareOpts = null) {
            let realPath = filePath.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
            let realName = fileName.replace(/\\\\/g, '\\').replace(/\\'/g, "'");

            // 强需求：分享前必须设置昵称（仅用于展示，全局唯一，取消则不打开发布）
            const nick = await ensureNickname();
            if (!nick) { alert('分享脚本需要先设置昵称（昵称仅用于发言/分享脚本展示，设置后不可自行修改）'); return; }

            if (!getGistToken()) {
                alert('离线版暂不支持发送，请检查网络连接');
                return;
            }

            // 读取文件内容
            let content = '';
            try {
                if (window.readTextFile) {
                    content = await window.readTextFile(realPath);
                    if (content === null || content === undefined) {
                        alert('读取文件失败');
                        return false;
                    }
                } else {
                    alert('当前环境不支持读取本地文件，请在 App 中使用此功能');
                    return false;
                }
            } catch (e) {
                alert('读取文件失败: ' + e.message);
                return false;
            }

            // 复用 shareTxtFileToWall 的分享逻辑
            if (wallMessages.length === 0) {
                try { await fetchMessages(); } catch (e) { console.warn('预加载消息失败:', e); }
            }

            let shareFileName = providedName;
            if (!shareFileName) {
                const now = new Date();
                const defaultName = realName.replace(/\.\w+$/, '') + '_' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
                const inputName = prompt('请输入分享文件名（不含扩展名）：', defaultName);
                if (!inputName) return false;
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
                if (opts === null || opts[0] === null) return false;
                expireMinutes = opts[0];
                sharePassword = opts[1];
                recoveryKey = opts[2] || '';
            }

            try {
                const token = getGistToken();
                // 有密码则加密内容
                let uploadContent = content;
                let passwordHash = null;
                const willEncrypt = !!(sharePassword || recoveryKey);
                if (willEncrypt) {
                    uploadContent = recoveryKey ? await encryptContentB(content, sharePassword, recoveryKey) : await encryptContent(content, sharePassword);
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
                        description: '脚本分享: ' + shareFileName + (sharePassword ? ' [加密]' : ''),
                        public: true,
                        files: { [shareFileName]: { content: uploadContent } }
                    })
                });

                if (!response.ok) throw new Error('上传失败');
                const data = await response.json();
                const scriptUrl = data.files[shareFileName]?.raw_url || 'https://gist.githubusercontent.com/' + data.id + '/raw/' + encodeURIComponent(shareFileName);

                const nickname = localStorage.getItem('TFJL_UserName') || '匿名用户';
                const msgContent = '分享脚本: ' + shareFileName + '\n' + scriptUrl;
                const newMsg = {
                    content: msgContent,
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
                if (!providedName) {
                    if (sharePassword) {
                        showPasswordReminder(shareFileName, sharePassword, '脚本已分享', recoveryKey);
                    } else {
                        showToast('✅ 脚本已分享到需求墙！');
                    }
                }
                return true;
            } catch (err) {
                console.error('分享失败:', err);
                if (!providedName) alert('分享失败: ' + err.message);
                return false;
            }
        }

        // 批量分享扫描文件到需求墙
        async function batchShareScannedFilesToWall(fileList) {
            if (!fileList || fileList.length === 0) return;
            if (!getGistToken()) { alert('离线版暂不支持发送，请检查网络连接'); return; }
            const now = new Date();
            const suffix = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
            const baseName = prompt('请输入批量分享文件名前缀（留空则每个用原文件名）：', '');
            if (baseName === null) return;
            // 批量统一选择分享选项
            const opts = await new Promise(function(resolve) { showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); }); });
            if (opts === null || opts[0] === null) return;
            const shareOpts = { expireMinutes: opts[0], password: opts[1], recoveryKey: opts[2] || '' };
            let success = 0, fail = 0;
            for (const f of fileList) {
                if (!f || !f.path || !f.name) continue;
                const name = baseName ? baseName + '_' + f.name.replace(/\.\w+$/, '') + '_' + suffix + '.txt' : f.name.replace(/\.\w+$/, '') + '_' + suffix + '.txt';
                const ok = await shareScannedFileToWall(f.path, f.name, name, shareOpts);
                if (ok) success++; else fail++;
            }
            showToast(`✅ 批量分享完成：成功 ${success} 个${fail ? '，失败 ' + fail + ' 个' : ''}`);
        }

        // 暴露给 app-local.js 的批量分享入口
        window.batchShareScannedFilesToWall = batchShareScannedFilesToWall;
        window.shareScannedFileToWall = shareScannedFileToWall;

        // 解析窗口内容中的阵容
        function parseTxtWindowContent(windowId, fileIndex) {
            const textarea = document.getElementById(`${windowId}_content`);
            const resultEl = document.getElementById(`${windowId}_parseResult`);
            const targetSelect = document.getElementById(`${windowId}_target`);
            
            if (!textarea || !textarea.value.trim()) {
                resultEl.innerHTML = '<span style="color:#f44336;">文件内容为空！</span>';
                return;
            }

            const content = textarea.value.trim();
            const target = targetSelect.value;

            // 解析"上阵："后面的内容
            let heroNames = [];
            
            const match = content.match(/上阵[：:]\s*(.+)/);
            if (match && match[1]) {
                heroNames = match[1].split(/[,，]/).map(name => name.trim()).filter(name => name);
            } else {
                resultEl.innerHTML = '<span style="color:#f44336;">未找到"上阵："格式的阵容信息！</span>';
                return;
            }

            if (heroNames.length === 0) {
                resultEl.innerHTML = '<span style="color:#f44336;">未找到英雄名称！</span>';
                return;
            }

            // 限制最多10张
            if (heroNames.length > 10) {
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
            
            // 保存数据
            autoSaveProject();

            // 显示结果
            let resultHtml = '';
            if (addedCount > 0) {
                resultHtml += `<span style="color:#4caf50;">✅ 成功添加 ${addedCount} 张卡牌到${target === 'my' ? '我的手牌' : '队友手牌'}</span>`;
            }
            if (duplicateCards.length > 0) {
                resultHtml += `<br><span style="color:#ff9800;">⚠️ 重复卡牌：${duplicateCards.join('、')}</span>`;
            }
            if (notFoundCards.length > 0) {
                resultHtml += `<br><span style="color:#f44336;">❌ 未找到：${notFoundCards.join('、')}</span>`;
            }

            resultEl.innerHTML = resultHtml;
        }

        // 保存窗口内容
        function saveTxtWindowContent(windowId, fileIndex) {
            const textarea = document.getElementById(`${windowId}_content`);
            if (!textarea || !txtFiles[fileIndex]) return;
            
            txtFiles[fileIndex].content = textarea.value;
            updateTxtFilesList();
            autoSaveProject();
            
            // 显示保存成功提示
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #4CAF50, #45a049);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 10000;
                animation: fadeInOut 2s forwards;
            `;
            toast.textContent = '✅ 保存成功！';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }

        // 扫描文件：写回原磁盘路径（老马直接用它）
        async function saveNotebookLocalFile(windowId) {
            const textarea = document.getElementById(`${windowId}_content`);
            if (!textarea) { alert('找不到编辑区域'); return; }
            const win = txtFileWindows.find(w => w.id === windowId);
            if (!win || !win.localPath) { alert('找不到文件路径'); return; }
            try {
                if (window.writeTextFile) {
                    const ok = await window.writeTextFile(win.localPath, textarea.value);
                    if (ok) {
                        showToast('✅ 已写回原文件: ' + win.name);
                    } else {
                        alert('保存失败，请检查文件路径权限');
                    }
                } else {
                    alert('当前环境不支持保存本地文件，请在 App 中使用此功能');
                }
            } catch (e) {
                alert('保存失败: ' + e.message);
            }
        }

        // 重命名文件
        function renameTxtFile(index) {
            if (!txtFiles[index]) return;
            
            const oldName = txtFiles[index].name;
            const newName = prompt('请输入新的文件名：', oldName);
            
            if (!newName || newName.trim() === '') return;
            
            const trimmedName = newName.trim();
            
            // 检查是否有同名文件
            const existsIndex = txtFiles.findIndex((f, i) => i !== index && f.name === trimmedName);
            if (existsIndex !== -1) {
                alert('已存在同名文件，请使用其他名称');
                return;
            }
            
            txtFiles[index].name = trimmedName;
            updateTxtFilesList();
            autoSaveProject();
        }

        // HTML转义防XSS
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 加载项目时恢复TXT文件
        function loadTxtFilesFromProject(project) {
            if (project.txtFiles && Array.isArray(project.txtFiles)) {
                txtFiles = project.txtFiles.filter(f => f && f.name && f.content);
            } else {
                txtFiles = [];
            }
            updateTxtFilesList();
        }

        // 获取当前项目的参考图片数据
        function getReferenceImagesData() {
            // 过滤掉不在当前项目中的图片
            return referenceImages.filter(img => img.projectName === currentProjectName);
        }

        // 从项目加载参考图片
        function loadReferenceImagesFromProject(project) {
            if (project.referenceImages && Array.isArray(project.referenceImages)) {
                // 过滤并确保每个图片都有必要的数据
                referenceImages = project.referenceImages
                    .filter(img => img && img.name && img.data)
                    .map(img => ({
                        name: img.name,
                        data: img.data,
                        projectName: img.projectName || currentProjectName
                    }));
            } else {
                referenceImages = [];
            }
            renderReferenceImages();
        }

        // 删除当前选中的项目
        // 重命名项目
        function renameProject() {
            const selector = document.getElementById('projectSelector1');
            if (!selector || !selector.value) {
                alert('请先选择一个项目');
                return;
            }

            const oldName = selector.value;
            const newName = prompt(`请输入新项目名称（当前：${oldName}）：`, oldName);
            
            if (!newName || !newName.trim()) {
                return;
            }
            
            const trimmedName = newName.trim();
            
            if (trimmedName === oldName) {
                alert('新项目名称与原名称相同！');
                return;
            }

            loadProjectListFromDB().then(allProjects => {
                const sameNameProject = allProjects.find(p => p.name === trimmedName && p.category === currentProjectCategory);
                if (sameNameProject) {
                    alert(`❌ 同一分类下已存在名为"${trimmedName}"的项目！`);
                    return;
                }

                getProjectFromDB(oldName).then(projectData => {
                    if (!projectData) {
                        alert('未找到该项目！');
                        return;
                    }

                    projectData.name = trimmedName;
                    saveProjectToDBDirect(projectData).then(() => {
                        deleteProjectFromDB(oldName).then(() => {
                            if (currentProjectName === oldName) {
                                currentProjectName = trimmedName;
                            }
                            refreshProjectSelectors();
                            alert(`✅ 项目已重命名为"${trimmedName}"！`);
                        }).catch(e => alert('删除原项目失败:' + e));
                    }).catch(e => alert('保存新项目失败:' + e));
                }).catch(e => alert('获取项目数据失败:' + e));
            }).catch(e => alert('加载项目列表失败:' + e));
        }

        function deleteCurrentProject() {
            const selector = document.getElementById('projectSelector1');
            if (!selector || !selector.value) {
                alert('请先选择一个项目');
                return;
            }

            const name = selector.value;
            let projects = [];
            try { projects = loadProjectListSync(); } catch(e) {}
            const remaining = projects.filter(p => p.name !== name);
            if (remaining.length === 0) {
                if (!confirm(`「${name}」是最后一个项目。\n删除后将没有任何默认启动项目，下次打开会显示空白。\n\n确定要删除吗？`)) return;
            } else {
                if (!confirm(`确定要删除项目"${name}"吗？`)) return;
            }
            deleteProjectFromDB(name).then(() => {
                if (currentProjectName === name) {
                    loadFirstProjectOrBlank();
                } else {
                    refreshProjectSelectors();
                }
            }).catch(e => alert('删除失败:' + e));
        }

        // 移动项目到其他分类
        function moveProjectToCategory() {
            const selector = document.getElementById('projectSelector1');
            if (!selector || !selector.value) {
                alert('请先选择一个项目');
                return;
            }

            const projectName = selector.value;
            const currentCategory = currentProjectCategory || '默认分类';

            // 创建选择分类的模态框
            const modal = document.createElement('div');
            modal.id = 'moveProjectModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

            let categoryOptions = categories.map(cat => 
                `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`
            ).join('');

            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,rgba(40,40,70,0.98),rgba(30,30,60,0.98));border:2px solid rgba(255,215,0,0.3);border-radius:15px;padding:25px;min-width:320px;max-width:400px;">
                    <h3 style="margin:0 0 20px 0;color:#ffd700;text-align:center;">📦 移动项目到分类</h3>
                    <p style="color:rgba(255,255,255,0.8);margin-bottom:15px;text-align:center;">项目: <strong style="color:#ffd700;">${escapeHtml(projectName)}</strong></p>
                    <label style="color:#fff;display:block;margin-bottom:8px;">目标分类：</label>
                    <select id="targetCategorySelect" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,215,0,0.3);background:#1a1a3a;color:#fff;font-size:14px;margin-bottom:20px;">
                        ${categoryOptions}
                    </select>
                    <div style="display:flex;gap:10px;justify-content:center;">
                        <button onclick="confirmMoveProject('${projectName}')" style="background:linear-gradient(135deg,#4CAF50,#45a049);color:white;border:none;padding:10px 25px;border-radius:8px;cursor:pointer;font-weight:bold;">✅ 确认移动</button>
                        <button onclick="closeMoveProjectModal()" style="background:linear-gradient(135deg,#757575,#616161);color:white;border:none;padding:10px 25px;border-radius:8px;cursor:pointer;">取消</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            document.getElementById('projectMenu').style.display = 'none';
        }

        // 确认移动项目
        function confirmMoveProject(projectName) {
            const targetCategory = document.getElementById('targetCategorySelect').value;
            if (!targetCategory) {
                alert('请选择目标分类');
                return;
            }

            // 从数据库加载项目并更新分类
            const transaction = db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.get(projectName);

            request.onsuccess = function() {
                if (request.result) {
                    const project = request.result;
                    project.category = targetCategory;
                    
                    const updateRequest = store.put(project);
                    updateRequest.onsuccess = function() {
                        currentProjectCategory = targetCategory;
                        refreshProjectSelectors();
                        closeMoveProjectModal();
                        alert(`✅ 项目"${projectName}"已移动到"${targetCategory}"`);
                    };
                    updateRequest.onerror = function() {
                        alert('❌ 移动失败');
                    };
                } else {
                    alert('项目不存在');
                }
            };

            request.onerror = function() {
                alert('❌ 读取项目失败');
            };
        }

        // 关闭移动项目模态框
        function closeMoveProjectModal() {
            const modal = document.getElementById('moveProjectModal');
            if (modal) modal.remove();
        }

        // 导出所有数据为JSON文件
        function exportAllData() {
            if (!requireLogin()) return;
            // 🔴 白名单备份 localStorage（项目相关前缀），不导出登录态/token/admin哈希等敏感键
            // 历史教训：原版只备份 projects+categories，所有卡皮肤/减伤/收藏/默认皮肤等全丢了
            const localStorageData = {};
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && /^(tdjl_|tfjl_|TFJL_)/.test(k)) localStorageData[k] = localStorage.getItem(k);
                }
            } catch (e) { console.warn('[BACKUP] localStorage 收集失败:', e); }
            const exportData = {
                version: '2.1',
                exportDate: new Date().toISOString(),
                categories: categories,
                projects: [],
                localStorage: localStorageData
            };

            const transaction = db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = function() {
                exportData.projects = request.result;
                const jsonStr = JSON.stringify(exportData, null, 2);
                const fileName = `TFJL-backup-${new Date().toISOString().slice(0,10)}.json`;
                const isTauri = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
                if (isTauri) {
                    // 先让用户选目的地，saved=true 才提示成功；取消(saved=false)不误报
                    _downloadScriptTauri(fileName, jsonStr).then(function(saved) {
                        if (saved) {
                            alert('✅ 数据导出成功！\n项目：' + exportData.projects.length + ' 个\n分类：' + exportData.categories.length + ' 个\n配置：' + Object.keys(localStorageData).length + ' 项');
                        }
                    });
                } else {
                    _downloadScriptBlob(fileName, jsonStr);
                    alert('✅ 数据导出成功！\n项目：' + exportData.projects.length + ' 个\n分类：' + exportData.categories.length + ' 个\n配置：' + Object.keys(localStorageData).length + ' 项');
                }
            };

            request.onerror = function() {
                alert('❌ 导出失败');
            };
        }

        // 导入所有数据
        function importAllData() {
            if (!requireLogin()) return;
            document.getElementById('importFileInput').click();
        }

        // 处理导入文件
        function handleImportFile(input) {
            if (!requireLogin()) return;
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importData = JSON.parse(e.target.result);
                    if (!importData.projects || !Array.isArray(importData.projects)) {
                        alert('❌ 文件格式不正确');
                        return;
                    }

                    const catCount = importData.categories ? importData.categories.length : 0;
                    const lsCount = importData.localStorage ? Object.keys(importData.localStorage).length : 0;
                    const lsMsg = lsCount > 0 ? `，${lsCount} 项配置（卡皮肤/减伤/收藏等）` : '';
                    if (confirm(`确定要导入吗？\n\n将导入 ${importData.projects.length} 个项目${catCount > 0 ? '，' + catCount + ' 个分类' : ''}${lsMsg}。\n同名项目将被覆盖。`)) {
                        // 导入分类
                        if (importData.categories && Array.isArray(importData.categories)) {
                            importData.categories.forEach(cat => {
                                if (!categories.includes(cat)) {
                                    categories.push(cat);
                                }
                            });
                            saveCategories();
                        }

                        // 🔴 白名单恢复 localStorage（项目相关前缀），跳过登录态/token/admin哈希/设备ID等敏感键
                        // 历史教训：原版根本漏备份 localStorage，恢复后所有配置全空
                        if (importData.localStorage && typeof importData.localStorage === 'object') {
                            const SENSITIVE_KEYS = /^(TFJL_LoggedIn|TFJL_Admin_SavedPwd|TFJL_Pending_Sync|TFJL_Device_ID|HARDCODED_TOKEN|messages_gist_deleted|messages_backup_gist_id|tfjl_admin$)/;
                            let lsRestored = 0;
                            Object.keys(importData.localStorage).forEach(k => {
                                if (!/^(tdjl_|tfjl_|TFJL_)/.test(k)) return;
                                if (SENSITIVE_KEYS.test(k)) return; // 敏感键永不覆盖
                                try { localStorage.setItem(k, importData.localStorage[k]); lsRestored++; } catch (e) {}
                            });
                            console.log('[BACKUP] localStorage restored:', lsRestored, '/', Object.keys(importData.localStorage).length);
                        }

                        // 使用 put 代替 add，避免主键冲突
                        let imported = 0;
                        let errors = 0;
                        const importedNames = importData.projects.map(p => p.name);
                        const transaction = db.transaction(['projects'], 'readwrite');
                        const store = transaction.objectStore('projects');

                        importData.projects.forEach(project => {
                            const putRequest = store.put(project);
                            putRequest.onsuccess = () => imported++;
                            putRequest.onerror = () => errors++;
                        });

                        transaction.oncomplete = function() {
                            refreshProjectSelectors();
                            // 触发全局重渲（皮肤/卡池等）以让恢复的配置立即生效
                            try { if (typeof restoreBattleSlots === 'function') restoreBattleSlots(); } catch (e) {}
                            try { if (typeof reapplyAllSkins === 'function') reapplyAllSkins(); } catch (e) {}
                            const lastName = importedNames.length ? importedNames[importedNames.length - 1] : null;
                            const baseMsg = `成功恢复 ${imported} 个项目${errors > 0 ? '（' + errors + ' 个失败）' : ''}`;
                            if (lastName) {
                                loadProjectFromDB(lastName).then(() => {
                                    if (typeof showToast === 'function') showToast('✅ ' + baseMsg + '，已打开「' + lastName + '」');
                                }).catch(() => {
                                    if (typeof showToast === 'function') showToast('✅ ' + baseMsg + '，请在下拉选择打开');
                                });
                            } else {
                                if (typeof showToast === 'function') showToast('✅ ' + baseMsg);
                            }
                        };

                        transaction.onerror = function() {
                            alert('❌ 导入过程中发生错误');
                        };
                    }
                } catch (err) {
                    alert('❌ 导入失败：文件格式错误 - ' + err.message);
                }
            };
            reader.readAsText(file);
            input.value = '';
        }

        // 保存当前项目（弹出模态框选择分类）
        let pendingSaveProjectName = '';

        function saveCurrentProject() {
            const _skinCfg = (typeof materializeProjectSkinConfig === 'function')
                ? materializeProjectSkinConfig({ cardSkins: cardSkins, fusionSkins: window.fusionSkins, myHandCards: myHandCards, teammateHandCards: teammateHandCards, myPlacedCards: myPlacedCards, teammatePlacedCards: teammatePlacedCards })
                : { cardSkins: cardSkins, fusionSkins: window.fusionSkins || {} };
            const currentData = {
                myHandCards: myHandCards,
                teammateHandCards: teammateHandCards,
                myPlacedCards: myPlacedCards,
                teammatePlacedCards: teammatePlacedCards,
                cardLevels: cardLevels,
                cardSkins: _skinCfg.cardSkins,
                fusionSkins: _skinCfg.fusionSkins,
                cardMoHua: cardMoHua,
                myDeckInfo: document.getElementById('myDeckInfo')?.value || '',
                teammateDeckInfo: document.getElementById('teammateDeckInfo')?.value || '',
                notepad: document.getElementById('notepad')?.value || '',
                txtFiles: typeof txtFiles !== 'undefined' ? txtFiles : [],
                referenceImages: typeof referenceImages !== 'undefined' ? referenceImages : []
            };
            const isOpen = currentProjectName && currentProjectName !== '默认项目';
            if (!isOpen) {
                // 未打开具体项目：仍需输入名称
                const name = prompt('请输入项目名称：', '');
                if (!name || !name.trim()) return;
                const targetName = name.trim();
                saveProjectToDB(targetName, currentProjectCategory || '默认分类', currentData).then(() => {
                    window.__tfjlProjectDirty = false; updateSaveIndicator();
                    alert(`✅ 项目"${targetName}"保存成功！`);
                }).catch(e => alert('❌ 保存失败：' + e));
                return;
            }
            // 已打开的项目：直接覆盖保存（确定保存），不再弹分类框
            loadProjectListFromDB().then(projects => {
                const existing = projects.find(p => p.name === currentProjectName);
                const cat = (existing && existing.category) || currentProjectCategory || '默认分类';
                saveProjectToDB(currentProjectName, cat, currentData).then(() => {
                    window.__tfjlProjectDirty = false; updateSaveIndicator();
                    alert(`✅ 项目"${currentProjectName}"已保存`);
                }).catch(e => alert('❌ 保存失败：' + e));
            });
        }

        function showCategorySelectModal() {
            const container = document.getElementById('categoryListForSave');
            // 默认选中当前项目的分类
            const defaultCat = currentProjectCategory || categories[0] || '默认分类';
            container.innerHTML = categories.map((cat) =>
                `<label style="display:block;padding:10px;cursor:pointer;border-bottom:1px solid #444;">
                    <input type="radio" name="selectedCategory" value="${cat}" ${cat === defaultCat ? 'checked' : ''}> ${cat}
                </label>`
            ).join('');
            document.getElementById('selectCategoryModal').style.display = 'flex';
        }

        function closeSelectCategoryModal() {
            document.getElementById('selectCategoryModal').style.display = 'none';
            pendingSaveProjectName = '';
        }

        function confirmSelectCategory() {
            const selected = document.querySelector('input[name="selectedCategory"]:checked');
            if (!selected) {
                alert('请选择一个分类！');
                return;
            }

            const category = selected.value;
            const projectName = pendingSaveProjectName;

            closeSelectCategoryModal();

            // 收集当前页面数据
            const currentData = {
                myHandCards: myHandCards,
                teammateHandCards: teammateHandCards,
                myPlacedCards: myPlacedCards,
                teammatePlacedCards: teammatePlacedCards,
                cardLevels: cardLevels,
                cardSkins: cardSkins,
                fusionSkins: window.fusionSkins || {},
                myDeckInfo: myDeckInfo,
                teammateDeckInfo: teammateDeckInfo,
                notepad: notepad,
                txtFiles: txtFiles,
                referenceImages: referenceImages
            };

            saveProjectToDB(projectName, category, currentData).then(() => {
                refreshProjectSelectors();
                alert(`✅ 项目"${projectName}"保存成功！`);
            }).catch(e => {
                alert('❌ 保存失败：' + e);
            });
        }

        // ==================== 初始化变量 ====================
        let myHandCards = [];
        let teammateHandCards = [];
        let myPlacedCards = [];
        let teammatePlacedCards = [];
        let favoriteCards = [];
        let cardLevels = {};
        let individualCardLevels = {}; // 每张卡的独立等级存储
        let cardSkins = {}; // 每张卡的皮肤存储（项目级）{ "my_47": "烈焰皮肤", ... }
        // 副卡（被融合卡）皮肤存储（项目级）{ "副卡英雄名": "皮肤名"/""(关闭) }，只作用于当前项目，不污染全局
        // 🔴 必须挂在 window 上：setFusionSkin/getFusionComponentSkin 等读写都用 window.fusionSkins，
        //    若这里用 `let` 声明会变成「块级变量 ≠ window.fusionSkins」两个对象，导致保存的永远是空对象、刷新后副卡皮丢失。
        window.fusionSkins = window.fusionSkins || {};
        let defaultCardSkins = {}; // 全局默认皮肤（英雄级，卡池常用皮，跨项目保留）{ "47": "太平乐·火灵", ... }
        let cardMoHua = {}; // 每张卡的魔化开关 { "my_47": true, ... }
        let professionOrder = [];
        const MAX_HAND_CARDS = 10;
        const MAX_PLACED_CARDS = 7;
        
        // ==================== 卡牌皮肤定义 ====================
        // 默认皮肤列表（每个英雄的基础皮肤）
        const DEFAULT_CARD_SKINS = {
            "天使": ["默认", "神炎·天使", "戚秦氏·天使"],
            "鱼人": ["默认", "小鱼儿·鱼人", "张顺·鱼人", "甘宁·鱼人", "梁宽·鱼人", "田伯光·鱼人"],
            "风灵": ["默认", "太平乐·风灵"],
            "圣骑": ["默认", "无头骑士·圣骑", "孙权·圣骑", "风暴·圣骑"],
            "射线": ["默认", "雷峰塔·侏儒射线", "剑冢·侏儒射线", "日晷·侏儒射线"],
            "宝库": ["默认", "金刚石·地精宝库", "暗月·地精宝库"],
            "潜艇": ["默认", "鲨鱼号·微型潜艇"],
            "死神": ["默认", "万圣节·死神", "粉色南瓜·死神"],
            "酋长": ["默认", "奶牛·酋长", "粉色奶牛·酋长"],
            "电法": ["默认", "水娃·电法", "戴宗·电法", "春香·电法", "华山掌门·电法"],
            "火灵": ["默认", "谢晓峰·火灵", "张飞·火灵", "太平乐·火灵", "令狐冲·火灵"],
            "战将": ["默认", "虹猫·战将", "刀马·战将", "冰雪·战将", "许仕林·战将", "许仙·战将", "萧十一郎·战将", "武松·战将", "吕布·战将", "风暴·战将", "黄飞鸿·战将", "林平之·战将"],
            "咕咕": ["默认", "虚空兽·咕咕", "老爷爷·咕咕", "天机星·咕咕", "宋江·咕咕", "华佗·咕咕", "华夫人·咕咕", "深海异兽·咕咕", "太平乐·咕咕", "少林掌门·咕咕"],
            "火炮": ["默认", "龙吼·邪能火炮", "小李飞刀·邪能火炮", "尚方宝剑·邪能火炮"],
            "水灵": ["默认", "潮汐·水灵", "刘备·水灵", "太平乐·水灵"],
            "萌萌": ["默认", "冰雪·萌萌", "唐三藏·萌萌", "武大郎·萌萌", "诸葛亮·萌萌", "太平乐·萌萌", "烈火奶奶·萌萌"],
            "小野": ["默认", "小七·小野", "万圣甜心·小野", "紫霞仙子·小野", "沈璧君·小野", "万圣女巫·小野", "貂蝉·小野", "秋香·小野", "十三姨·小野", "太平乐·小野", "仪琳·小野"]
        };
        
        // 用户自定义皮肤（可手动添加，保存在localStorage）
        let customCardSkins = {};
        
        // 获取卡牌可用的皮肤列表（默认 + 自定义 + SKIN_ATTRIBUTES自动提取，排除魔化）
        function getAvailableSkins(cardName) {
            const mainCardName = getMainCardName(cardName);
            const defaultSkins = DEFAULT_CARD_SKINS[mainCardName] || ["默认"];
            const customSkins = customCardSkins[mainCardName] || [];
            // 自动从 SKIN_ATTRIBUTES 提取所有皮肤名称（排除魔化）
            const attrSkins = [];
            if (SKIN_ATTRIBUTES[mainCardName]) {
                attrSkins.push(...Object.keys(SKIN_ATTRIBUTES[mainCardName]).filter(k => k !== '魔化'));
            }
            // 合并云端皮肤注册表（skins-web.js 的 syncRemoteSkins 填充到 window.skinRegistry），
            // 否则云端新加的皮肤图会下载但不会出现在切皮序列里（修：闪/骨弓/死神/天使 等新增云端皮肤切不到）
            const remoteSkins = (window.skinRegistry && Array.isArray(window.skinRegistry[mainCardName]))
                ? window.skinRegistry[mainCardName].map(s => s.name).filter(Boolean)
                : [];
            // 过滤与英雄同名的「默认等价」条目：它与合成「默认」指向同一张基础图，
            // 不过滤会在切皮列表里重复出现（如 冰弓 → 默认/冰弓/雪莲·冰弓 三选）。
            // 仅影响展示列表；registry 中的同名条目保留，保证「默认」仍能解析到基础图。
            const remoteSkinsFiltered = remoteSkins.filter(n => n !== mainCardName);
            const allSkins = [...new Set([...defaultSkins, ...customSkins, ...attrSkins, ...remoteSkinsFiltered])];
            return allSkins;
        }
        
        // 检查卡牌是否有魔化数据
        function hasMoHuaData(cardName) {
            const mainCardName = getMainCardName(cardName);
            // 精灵卡不支持魔化，直接返回false
            const jingLingNames = ['冰精灵', '光精灵', '魔精灵', '木精灵', '土精灵', '雷精灵', '暗精灵', '幻精灵', '魂精灵', '彩精灵'];
            if (jingLingNames.some(jl => mainCardName.includes(jl))) return false;
            return SKIN_ATTRIBUTES[mainCardName] && SKIN_ATTRIBUTES[mainCardName]['魔化'];
        }
        
        // 所有基础英雄名集合（优先取卡牌选择网格，兜底用皮肤/属性表；含术士1字英雄）
        function getAllHeroNames() {
            const set = new Set();
            try {
                document.querySelectorAll('.card-item[data-name]').forEach(el => {
                    const n = el.getAttribute('data-name');
                    if (n) set.add(n);
                });
            } catch (e) {}
            Object.keys(DEFAULT_CARD_SKINS).forEach(n => set.add(n));
            Object.keys(SKIN_ATTRIBUTES).forEach(n => set.add(n));
            if (window.cloudCards) Object.keys(window.cloudCards).forEach(n => set.add(n));
            return set;
        }

        // 将名字整体拆成已知英雄名（最长优先匹配）。能完整拆分且≥2段 → 视为融合卡，返回各段；否则返回 []。
        function splitIntoHeroes(name, heroSet) {
            const parts = [];
            let i = 0;
            while (i < name.length) {
                let matched = false;
                const maxLen = Math.min(4, name.length - i);
                for (let len = maxLen; len >= 1; len--) {
                    const piece = name.substring(i, i + len);
                    if (heroSet.has(piece)) {
                        parts.push(piece);
                        i += len;
                        matched = true;
                        break;
                    }
                }
                if (!matched) return [];
            }
            return parts;
        }

        function getMainCardName(cardName) {
            if (!cardName) return cardName;
            // 云端已启用(有≥1条融合定义)时，严格只认云端：云端定义的融合卡取主卡(part[0])，
            // 其余一律按单卡/英雄名返回，禁用内置硬编码融合表与兜底拆分，避免假融合卡污染。
            const cloudEnabled = window.cloudFusions && typeof window.cloudFusions === 'object' && Object.keys(window.cloudFusions).length > 0;
            if (cloudEnabled) {
                const cf = window.cloudFusions[cardName];
                if (cf && Array.isArray(cf.components) && cf.components.length >= 2) return cf.components[0];
                // 云端未收录 → 回退内置识别（fusionCards 表 + splitIntoHeroes），
                // 避免内置融合卡(死神海妖/小野酋长/咕咕萨满等)被当单卡导致皮肤全丢(2026-08-08 回归)
            }
            const fusionCards = [
                '火炮射线', '射线潜艇', '火炮潜艇', '宝库射线', '宝库潜艇', '宝库火炮',
                '潜艇射线', '潜艇火炮', '射线火炮',
                '水灵刀客', '刀客水灵', '蛇女爱神', '爱神蛇女',
                '咕咕天使', '天使咕咕', '圣骑天使', '天使圣骑',
                '战将鱼人', '鱼人战将', '电法冰法', '冰法电法',
                '萌萌水灵', '水灵萌萌', '火灵风灵', '风灵火灵'
            ];
            if (fusionCards.includes(cardName)) {
                return cardName.substring(0, 2);
            }
            const heroSet = getAllHeroNames();
            // 单卡：直接返回
            if (heroSet.has(cardName)) return cardName;
            // 通用融合检测：术士等"1字英雄组成的2字融合"(如 影魇) 也能识别，返回第一个英雄
            const parts = splitIntoHeroes(cardName, heroSet);
            if (parts.length >= 2) return parts[0];
            // 兼容旧逻辑：4字融合且前2字为已知英雄
            if (cardName.length === 4 && !DEFAULT_CARD_SKINS[cardName]) {
                const firstTwo = cardName.substring(0, 2);
                if (heroSet.has(firstTwo)) return firstTwo;
            }
            return cardName;
        }

        // ===== 融合卡对角切割皮肤 =====
        // 默认开启；关掉则回到只显示主卡整张皮肤
        let fusionSkinSplitEnabled = true;
        try { fusionSkinSplitEnabled = (localStorage.getItem('tfjl_fusion_skin_split') !== '0'); } catch (e) {}
        // 融合锁：按「卡组(我方/队友)」整体锁定，而非逐张卡。锁一方→该侧全部融合卡锁定
        let myFusionLocked = false;
        let teammateFusionLocked = false;
        try { myFusionLocked = (localStorage.getItem('tfjl_my_fusion_locked') === '1'); } catch (e) {}
        try { teammateFusionLocked = (localStorage.getItem('tfjl_teammate_fusion_locked') === '1'); } catch (e) {}
        // 初始化卡组标题下的融合锁图标（函数声明已提升，此处可安全调用）
        refreshFusionLockIcons();

        // 融合卡拆分：返回各英雄名数组（≥2 视为融合卡），否则 null
        function getFusionParts(cardName) {
            if (!cardName) return null;
            // 云端融合定义优先（管理员维护，含2基础卡校验）
            if (window.cloudFusions && window.cloudFusions[cardName] && Array.isArray(window.cloudFusions[cardName].components) && window.cloudFusions[cardName].components.length >= 2) {
                return window.cloudFusions[cardName].components.slice();
            }
            // 云端优先，但云端未收录的内置/兜底融合卡回退内置识别（fusionCards 表 + splitIntoHeroes）。
            // 若云端只收录部分融合卡仍"严格只认云端"，其余内置融合卡(死神海妖/小野酋长/咕咕萨满等)
            // 会被当单卡 → 融合皮肤全丢(2026-08-08 用户反馈回归)。内置识别即云端未启用时的既有可靠逻辑。
            const fusionCards = [
                '火炮射线', '射线潜艇', '火炮潜艇', '宝库射线', '宝库潜艇', '宝库火炮',
                '潜艇射线', '潜艇火炮', '射线火炮',
                '水灵刀客', '刀客水灵', '蛇女爱神', '爱神蛇女',
                '咕咕天使', '天使咕咕', '圣骑天使', '天使圣骑',
                '战将鱼人', '鱼人战将', '电法冰法', '冰法电法',
                '萌萌水灵', '水灵萌萌', '火灵风灵', '风灵火灵'
            ];
            if (fusionCards.includes(cardName)) {
                return [cardName.substring(0, 2), cardName.substring(2)];
            }
            const heroSet = getAllHeroNames();
            if (heroSet.has(cardName)) return null;
            const parts = splitIntoHeroes(cardName, heroSet);
            if (parts.length >= 2) return parts;
            // 兜底：4字融合且前2字为已知英雄
            if (cardName.length === 4 && !DEFAULT_CARD_SKINS[cardName] && heroSet.has(cardName.substring(0, 2))) {
                return [cardName.substring(0, 2), cardName.substring(2)];
            }
            return null;
        }

        // 被融合卡（副卡）皮肤：优先取当前项目独立设置的 fusionSkins，无则回退卡池全局默认皮肤（defaultCardSkins → heroSkinSelections）
        function getFusionComponentSkin(heroName) {
            if (window.fusionSkins && window.fusionSkins[heroName] !== undefined) {
                const s = window.fusionSkins[heroName];
                return s ? s : '默认';
            }
            if (typeof getHeroDefaultSkin === 'function') {
                const s = getHeroDefaultSkin(heroName);
                return s ? s : '默认';
            }
            if (window.heroSkinSelections && window.heroSkinSelections[heroName] !== undefined) {
                const s = window.heroSkinSelections[heroName];
                return s ? s : '默认';
            }
            return '默认';
        }
        // 融合关闭（副卡隐藏，heroSkinSelections[副卡]===''）时，卡面只显示主卡名；否则显示完整融合名
        function getFusionDisplayName(fullName) {
            const parts = (typeof getFusionParts === 'function') ? getFusionParts(fullName) : null;
            if (parts && parts.length >= 2) {
                if (window.fusionSkins && window.fusionSkins[parts[1]] === '') return parts[0];
                if (window.heroSkinSelections && window.heroSkinSelections[parts[1]] === '') return parts[0];
            }
            return fullName;
        }
        // 读槽位卡的完整名字：优先 data-full-name（显示名可能已被截为主卡名），否则回退 .card-name 文本
        function getSlotCardName(slot) {
            if (!slot) return '';
            const el = slot.querySelector('.card-name');
            if (!el) return '';
            return el.dataset.fullName || el.textContent || '';
        }
        // 卡牌身份 = 主卡英雄名。融合卡「主卡·副卡」只看 · 前的主卡（不考虑副卡，且不依赖云端是否收录）；
        // 无 · 的融合卡（内置格式如 水灵刀客）由 getMainCardName 取主卡；基础卡即自身。
        function cardIdentity(name) {
            if (!name) return name;
            const dot = name.indexOf('·');
            if (dot > 0) return name.substring(0, dot);
            return (typeof getMainCardName === 'function') ? getMainCardName(name) : name;
        }
        // 该手牌里是否已有同一张卡（含基础卡与它的融合形态）
        function handHasIdentity(hand, name) {
            const id = cardIdentity(name);
            if (!id) return false;
            return (hand || []).some(c => c && cardIdentity(c.name) === id);
        }

        // ===== 上阵卡"融合卡切换"角标：基础英雄 → 可融合变体 =====
        // 已知融合卡名：以云端(管理员维护的 fusions.json)为准，避免硬编码污染；
        // 仅当云端为空（管理员尚未添加任何融合）才回退内置表，保证老功能不失效
        // 融合卡名：严格只认云端(管理员维护的 fusions.json = window.cloudFusions)。
        // 不再内置任何硬编码回退表——管理员没加过的卡绝不显示「融合」按钮，杜绝数据污染。
        function getAllFusionNames() {
            const names = new Set();
            if (window.cloudFusions) Object.keys(window.cloudFusions).forEach(n => names.add(n));
            return [...names];
        }
        // 基础英雄 → 以其为主卡(part[0])的融合卡列表
        function getFusionVariantsForBase(baseHero) {
            if (!baseHero) return [];
            const out = new Set();
            getAllFusionNames().forEach(fn => {
                const parts = (typeof getFusionParts === 'function') ? getFusionParts(fn) : null;
                if (parts && parts.length >= 2 && parts[0] === baseHero) out.add(fn);
            });
            return [...out];
        }
            // 在槽位上刷新"融合卡切换"控件（基础英雄有融合变体→显示「融合」；当前卡本身是融合卡→额外显示「编辑融合」）
        function refreshSlotFusionControl(slot) {
            if (!slot || !slot.classList.contains('filled')) return;
            const slotId = slot.dataset.slot;
            if (!slotId) return;
            const isUserSlot = slotId.startsWith('u');
            const handCards = isUserSlot ? myHandCards : teammateHandCards;
            const cardId = slot.dataset.cardId;
            const card = handCards.find(c => c.id === cardId);
            const name = card ? card.name : getSlotCardName(slot);
            const baseHero = (typeof getMainCardName === 'function') ? getMainCardName(name) : name;
            const variants = getFusionVariantsForBase(baseHero);
            const isFusion = !!(getFusionParts(name) && getFusionParts(name).length >= 2);
            const old = slot.querySelector('.fusion-ctrl');
            if (old) old.remove();
            if (variants.length === 0 && !isFusion) return;
            const ctrl = document.createElement('div');
            ctrl.className = 'fusion-ctrl';
            ctrl.style.cssText = 'position:absolute;top:1px;left:1px;display:flex;gap:2px;z-index:6;pointer-events:auto;';
            ctrl.addEventListener('contextmenu', (e) => { e.stopPropagation(); });
            ctrl.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
            // 「融合」：只对非融合的基础卡显示，用于把单卡就地升级/切换为融合卡。
            // 融合卡本身卡面已显示完整卡名，顶部不再显示黄色"融合·XX"长条。
            // 融合入口统一改到「解锁态单击卡槽卡」（handleSlotClick），不再在卡上显示黄色按钮，避免遮挡角标
            slot.appendChild(ctrl);
        }
        // ===== 融合锁图标：放在卡组标题下（不在卡上），按侧整体锁 =====
        function refreshFusionLockIcons() {
            const myIcon = document.getElementById('myFusionLockIcon');
            const myText = document.getElementById('myFusionLockText');
            const myTip = myFusionLocked
                ? '🔒 我方融合已锁定（点此图标可解锁）\n· 单击卡槽的卡 → 取下回手牌\n· 右击卡槽的卡 → 切换【主卡】皮肤'
                : '🔓 我方融合编辑中（点此图标可锁定）\n· 单击卡槽的卡 → 弹出融合切换菜单（选/退回/切别的融合卡）\n· 右击卡槽的卡 → 切换融合（皮肤循环，切到「关闭」还原单卡）\n· 点手牌的卡 → 上到卡槽（只上不下）';
            if (myIcon) { myIcon.textContent = myFusionLocked ? '🔒' : '🔓'; myIcon.title = myTip; }
            if (myText) { myText.textContent = myFusionLocked ? '融合已锁定' : '融合编辑中'; myText.title = myTip; }
            const tmIcon = document.getElementById('teammateFusionLockIcon');
            const tmText = document.getElementById('teammateFusionLockText');
            const tmTip = teammateFusionLocked
                ? '🔒 队友融合已锁定（点此图标可解锁）\n· 单击卡槽的卡 → 取下回手牌\n· 右击卡槽的卡 → 切换【主卡】皮肤'
                : '🔓 队友融合编辑中（点此图标可锁定）\n· 单击卡槽的卡 → 弹出融合切换菜单（选/退回/切别的融合卡）\n· 右击卡槽的卡 → 切换融合（皮肤循环，切到「关闭」还原单卡）\n· 点手牌的卡 → 上到卡槽（只上不下）';
            if (tmIcon) { tmIcon.textContent = teammateFusionLocked ? '🔒' : '🔓'; tmIcon.title = tmTip; }
            if (tmText) { tmText.textContent = teammateFusionLocked ? '融合已锁定' : '融合编辑中'; tmText.title = tmTip; }
        }
        function toggleMyFusionLock() {
            myFusionLocked = !myFusionLocked;
            try { localStorage.setItem('tfjl_my_fusion_locked', myFusionLocked ? '1' : '0'); } catch (e) {}
            refreshFusionLockIcons();
            if (typeof autoSaveProject === 'function') autoSaveProject();
        }
        function toggleTeammateFusionLock() {
            teammateFusionLocked = !teammateFusionLocked;
            try { localStorage.setItem('tfjl_teammate_fusion_locked', teammateFusionLocked ? '1' : '0'); } catch (e) {}
            refreshFusionLockIcons();
            if (typeof autoSaveProject === 'function') autoSaveProject();
        }
        // 弹出融合变体选择菜单（第一项=原卡不融合）
        function openFusionVariantMenu(slot, baseHero, variants, currentName) {
            const items = [baseHero].concat(variants).map(opt => ({ value: opt, label: opt, py: window.hanziInitials(opt), current: opt === currentName }));
            openGenericPicker({
                title: baseHero + ' 系融合卡',
                searchPlaceholder: '🔍 搜融合卡（关键字 / 首字母）',
                items: items,
                onPick: function(val) { upgradeCardToFusion(slot, val); }
            });
        }
        // 原地升级/降级为某融合卡（不替换卡，只改名字+重渲染皮肤）
        async function upgradeCardToFusion(slot, newName) {
            const slotId = slot.dataset.slot;
            if (!slotId) return;
            const isUserSlot = slotId.startsWith('u');
            const handCards = isUserSlot ? myHandCards : teammateHandCards;
            const placedArray = isUserSlot ? myPlacedCards : teammatePlacedCards;
            const cardId = slot.dataset.cardId;
            const hc = handCards.find(c => c.id === cardId);
            if (hc) hc.name = newName;
            const pc = placedArray.find(c => c.id === cardId);
            if (pc) pc.name = newName;
            const nameSpan = slot.querySelector('.card-name');
            if (nameSpan) { nameSpan.dataset.fullName = newName; nameSpan.textContent = getFusionDisplayName(newName); }
            slot.classList.remove('skin-bg');
            const oldBase = slot.querySelector('.skin-layer'); if (oldBase) oldBase.remove();
            const oldFused = slot.querySelector('.skin-layer-fused'); if (oldFused) oldFused.remove();
            try { await applySkinBgToSlot(slot, newName); } catch (e) {}
            updateHandDisplay(isUserSlot ? 'my' : 'teammate');
            refreshSlotFusionControl(slot);
            if (typeof autoSaveProject === 'function') autoSaveProject();
        }

        // ===== 融合卡徽章皮：canvas 切右下角缩放徽章 + 本地缓存 + 云端预切优先 =====
        // 生成"右下角徽章"PNG：把被融合卡图缩放约 1/4 后放在右下透明底图上（尺寸与主卡一致）
        function cropFusionBadgeFromUrl(url, w, h) {
            return new Promise((resolve) => {
                const img = new Image();
                if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const cw = w && w > 0 ? w : 400, ch = h && h > 0 ? h : 520;
                    const canvas = document.createElement('canvas');
                    canvas.width = cw; canvas.height = ch;
                    const ctx = canvas.getContext('2d');
                    const badgeRatio = 0.25;
                    const bw = cw * badgeRatio, bh = ch * badgeRatio;
                    const iw = img.naturalWidth, ih = img.naturalHeight;
                    const scale = Math.max(bw / iw, bh / ih);
                    const dw = iw * scale, dh = ih * scale;
                    const dx = cw - dw - 2, dy = ch - dh - 2;
                    ctx.drawImage(img, dx, dy, dw, dh);
                    canvas.toBlob(b => resolve(b), 'image/png');
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        }

        // 本地 IndexedDB 缓存切半皮（key = 融合{英雄}），命中即复用，免重复切割
        let _fusionHalfDB = null;
        function _openFusionHalfDB() {
            return new Promise((res, rej) => {
                if (_fusionHalfDB) return res(_fusionHalfDB);
                const r = indexedDB.open('tfjl_fusion_halves', 1);
                r.onupgradeneeded = () => { try { r.result.createObjectStore('halves'); } catch (e) {} };
                r.onsuccess = () => { _fusionHalfDB = r.result; res(_fusionHalfDB); };
                r.onerror = () => rej(r.error);
            });
        }
        async function getFusionHalfCached(fusedHero) {
            try {
                const db = await _openFusionHalfDB();
                return await new Promise((resolve) => {
                    const tx = db.transaction('halves', 'readonly');
                    const req = tx.objectStore('halves').get('融合' + fusedHero);
                    req.onsuccess = () => {
                        const blob = req.result;
                        resolve(blob ? URL.createObjectURL(blob) : null);
                    };
                    req.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        }
        async function setFusionHalfCached(fusedHero, blob) {
            try {
                const db = await _openFusionHalfDB();
                await new Promise((resolve) => {
                    const tx = db.transaction('halves', 'readwrite');
                    tx.objectStore('halves').put(blob, '融合' + fusedHero);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                });
            } catch (e) {}
        }

        // 解析被融合卡显示源：副卡皮肤整图 → 右上角金边+左下切角小图（与卡池副卡一致）
        // 融合XX 现统一为整图（被融合卡面板 cgmCutHeroSkins 产出整图），不再用满铺透明徽章，故 isBadge:false
        async function resolveFusionHalf(fusedHero, el) {
            if (!fusedHero) return null;
            // 用户明确选了「不显示副卡」→ 直接不显示
            // （getFusionComponentSkin 会把 '' 归一为 '默认'，需在此提前判，否则下面仍会回退到默认图）
            if (window.fusionSkins && window.fusionSkins[fusedHero] === '') return null;
            if (window.heroSkinSelections && window.heroSkinSelections[fusedHero] === '') return null;
            const sel = getFusionComponentSkin(fusedHero) || '默认';
            // 融合卡没有"融合皮肤"这种东西——副卡直接用【它自己英雄当前皮肤】的整图（按 fusionSkins 指定的皮肤取）。
            const fullUrl = window.resolveHeroSkinUrl ? await window.resolveHeroSkinUrl(fusedHero, sel) : null;
            if (fullUrl) return { url: fullUrl, isBadge: false };
            return null;
        }

        // 失效某被融合卡的徽章缓存（换皮肤后须重切，缓存只按英雄不按皮肤）
        async function invalidateFusionHalfCache(fusedHero) {
            try {
                const db = await _openFusionHalfDB();
                await new Promise((resolve) => {
                    const tx = db.transaction('halves', 'readwrite');
                    tx.objectStore('halves').delete('融合' + fusedHero);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                });
            } catch (e) {}
        }

        // 循环切换被融合卡(徽章)皮肤：只更新全局 heroSkinSelections[副卡]，不动主卡皮肤
        async function cycleFusionFusedSkin(fusedHero, slotId) {
            const skins = window.getHeroSkins ? window.getHeroSkins(fusedHero) : [];
            if (!skins.length) return;
            const current = (window.fusionSkins && window.fusionSkins[fusedHero] !== undefined) ? window.fusionSkins[fusedHero] : (window.heroSkinSelections ? window.heroSkinSelections[fusedHero] : '');
            const cycleList = skins.map(s => s.name).filter(name => name !== fusedHero).concat(['']);
            const effectiveCurrent = (current === fusedHero) ? '' : current;
            const idx = cycleList.indexOf(effectiveCurrent);
            const nextIdx = (idx + 1) % cycleList.length;
            const nextSkin = cycleList[nextIdx];
            await setFusionSkin(fusedHero, nextSkin); // 只写当前项目副卡皮肤，不污染全局
            await invalidateFusionHalfCache(fusedHero); // 旧皮肤徽章缓存失效，重新切
            const slot = document.querySelector('.battle-slot[data-slot="' + slotId + '"]');
            if (slot) {
                const skinLabel = slot.querySelector('.skin-label') || (() => {
                    const label = document.createElement('span');
                    label.className = 'skin-label';
                    label.style.cssText = 'position:absolute;top:2px;right:2px;font-size:9px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:4px;z-index:4;pointer-events:none;';
                    slot.appendChild(label);
                    return label;
                })();
                // '' = 不显示副卡（关闭哨兵）：明确标注「融合关闭」，不再用「融合·无/默认」误导用户以为是个皮肤
                skinLabel.textContent = nextSkin === '' ? '融合关闭' : ('融合·' + nextSkin);
                setTimeout(() => { if (skinLabel.parentNode) skinLabel.remove(); }, 1500);
            }
        }

        // 右击融合流程用的瞬时标签
        function _showFusionRightLabel(slot, text) {
            if (!slot) return;
            const label = slot.querySelector('.skin-label') || (() => {
                const l = document.createElement('span');
                l.className = 'skin-label';
                l.style.cssText = 'position:absolute;top:2px;right:2px;font-size:9px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:4px;z-index:4;pointer-events:none;';
                slot.appendChild(l);
                return l;
            })();
            label.textContent = text;
            setTimeout(() => { if (label.parentNode) label.remove(); }, 1500);
        }
        // 🔓 解锁右击融合流程：把主卡的全部融合变体副卡皮肤都加入循环
        //   （主卡·副卡）循环：变体1皮肤a→b→…→变体2皮肤a→…→「关闭融合」= 真正还原为单卡（基础英雄名）
        async function _safeCycleFusionSkinOrClose(slot, slotId, heroName, baseHeroInput) {
            const variants = (typeof getFusionVariantsForBase === 'function') ? getFusionVariantsForBase(baseHeroInput) : [];
            if (!variants.length) return;
            // 构建全部融合变体的副卡皮肤循环列表：{ variant, subHero, skin }
            const entries = [];
            for (const v of variants) {
                const parts = (typeof getFusionParts === 'function') ? getFusionParts(v) : null;
                if (!parts || parts.length < 2) continue;
                const subHero = parts[1];
                const skins = window.getHeroSkins ? window.getHeroSkins(subHero) : [];
                // 保留副卡同名的默认皮条目，让默认皮也能循环切到
                const names = skins.map(s => s.name);
                for (const n of names) entries.push({ variant: v, subHero: subHero, skin: n });
            }
            const CLOSE = '__FUSION_CLOSE__';
            const totalLen = entries.length + 1;  // 末尾 +1 =「关闭融合」
            // 当前卡位置：当前融合变体 + 当前副卡皮肤
            const curParts = (typeof getFusionParts === 'function') ? getFusionParts(heroName) : null;
            const isNowFusion = !!(curParts && curParts.length >= 2);
            const currentVariant = isNowFusion ? heroName : null;
            const currentSubHero = isNowFusion ? curParts[1] : null;
            const currentSkin = currentSubHero ? ((window.fusionSkins && window.fusionSkins[currentSubHero] !== undefined) ? (window.fusionSkins[currentSubHero] || '') : (window.heroSkinSelections ? (window.heroSkinSelections[currentSubHero] || '') : '')) : '';
            // '' / '默认' / 副卡同名 都视为默认皮（对应循环里副卡同名条目）
            const effectiveCurrentSkin = (currentSkin === '' || currentSkin === '默认') ? currentSubHero : currentSkin;
            let idx = -1;
            if (currentVariant) {
                for (let i = 0; i < entries.length; i++) {
                    if (entries[i].variant === currentVariant && entries[i].skin === effectiveCurrentSkin) { idx = i; break; }
                }
            }
            const nextIdx = (idx + 1) % totalLen;
            if (nextIdx === entries.length) {
                // 关闭融合 = 还原为单卡（基础英雄名），卡名自然变回基础卡，无需强改显示文字
                await upgradeCardToFusion(slot, baseHeroInput);
                _showFusionRightLabel(slot, '融合关闭');
                return;
            }
            const entry = entries[nextIdx];
            // 先设副卡皮肤（只写当前项目），再切变体（升级卡名会按新变体重渲染皮肤）
            await setFusionSkin(entry.subHero, entry.skin);
            await invalidateFusionHalfCache(entry.subHero);
            if (entry.variant !== heroName) {
                // 换变体：upgradeCardToFusion 内部已 applySkinBgToSlot + updateHandDisplay + autoSaveProject
                await upgradeCardToFusion(slot, entry.variant);
            } else {
                // 同变体换皮
                try { await applySkinBgToSlot(slot, entry.variant); } catch (e) {}
                const isUserSlot = slotId && slotId.startsWith('u');
                const _ht = isUserSlot ? 'my' : 'teammate';
                const placedArray = isUserSlot ? myPlacedCards : teammatePlacedCards;
                const c = placedArray.find(x => x.slot === slotId);
                const hc = c ? document.querySelector('#' + (_ht === 'my' ? 'myHandContainer' : 'teammateHandContainer') + ' .selected-card[data-id="' + c.id + '"]') : null;
                if (hc) { try { await reapplySingleHandCard(hc, c.id, _ht); } catch (e) {} }
                if (typeof autoSaveProject === 'function') autoSaveProject();
            }
            _showFusionRightLabel(slot, '融合·' + (entry.skin === entry.subHero ? '默认' : entry.skin));
        }

// ==================== 融合卡（统一配置）====================
// 思路：主卡满铺当背景（与基础卡一致），副卡缩小放右上角小圆角矩形（金色外框 + 左下角切角）。
// 改大小只动 FUSION_SIZE 一处，CSS+三处 JS 全靠它。
const FUSION_SIZE = '40%';                                        // 副卡直径，调大小改这里

// 手牌：主卡用独立 <img class="hand-skin-layer"> 满铺（与普通手牌一致）
//   + 副卡 <img class="hand-skin-fused"> 右下角小圆角矩形（金色外框）
// ⚠️ 早期用 card.style.backgroundImage 走背景图，但 .selected-card.card-item.skin-bg { background: transparent !important }
//    （864行）会强制干掉 inline backgroundImage，主卡永远不显示。改用独立 img 层规避。
function applyFusionSkinToHandCard(card, mainUrl, fusedUrl, fusedIsBadge) {
    if (!card) return;
    card.classList.add('skin-bg');
    const isFusedLayout = !!(fusedUrl && !fusedIsBadge);

    // 主卡：独立 <img class="hand-skin-layer"> 满铺（复用 .selected-card.card-item .hand-skin-layer 样式）
    let base = card.querySelector('.hand-skin-layer');
    if (mainUrl) {
        if (!base) {
            base = document.createElement('img');
            base.className = 'hand-skin-layer';
            base.draggable = false;
            card.insertBefore(base, card.firstChild);
        }
        const isDataOrBlob = mainUrl.startsWith('data:') || mainUrl.startsWith('blob:');
        const next = isDataOrBlob ? mainUrl : (mainUrl + '?t=' + Date.now());
        if (base.src !== next) base.src = next;
    } else if (base) {
        base.remove();
    }

    // 副卡：左上角小圆角矩形 + 金色外框 + 右下角切角（好区分）
    let overlay = card.querySelector('.hand-skin-fused');
    if (fusedUrl) {
        if (!overlay) {
            overlay = document.createElement('img');
            overlay.className = 'hand-skin-fused';
            card.appendChild(overlay);   // 区别于 .hand-skin-layer（主卡），副卡 z-index 更高
        }
        overlay.style.cssText = fusedIsBadge
            ? 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius:inherit;z-index:1;pointer-events:none;'
            : 'position:absolute;left:2px;top:2px;width:' + FUSION_SIZE + ';height:auto;aspect-ratio:1/1;max-height:70%;object-fit:cover;box-sizing:border-box;border:3px solid #FFD700;clip-path:polygon(0 0,100% 0,100% 85%,85% 100%,0 100%);z-index:2;pointer-events:none;filter:drop-shadow(0 0 2px rgba(0,0,0,0.7));';
        if (overlay.src !== fusedUrl) overlay.src = fusedUrl;
    } else if (overlay && overlay.parentNode) {
        overlay.remove();
    }
}

// 槽位：主卡用独立 <img class="skin-layer"> 满铺（与普通卡槽 applySkinBgToSlot 一致）
//   + 副卡 <img class="skin-layer-fused"> 右下角小圆角矩形（带白边）
// ⚠️ 早期曾用 slot.style.backgroundImage 走背景图路径，但 .battle-slot.skin-bg { background: transparent !important }
//   会用 CSS !important 强制干掉 inline backgroundImage（CSS !important 优先级 > inline style），
//   导致主卡永远不显示。改用独立 img 层后完全规避。
function applyFusionSkinToSlot(slot, mainUrl, fusedUrl, fusedIsBadge) {
    if (!slot) return;
    const isFusedLayout = !!(fusedUrl && !fusedIsBadge);

    // 主卡：独立 <img class="skin-layer"> 满铺（与 applySkinBgToSlot 同款，带白边/圆角/inset 阴影）
    let base = slot.querySelector('.skin-layer');
    if (mainUrl) {
        if (!base) {
            base = document.createElement('img');
            base.className = 'skin-layer';
            base.alt = '';
            slot.insertBefore(base, slot.firstChild);
        }
        const isDataOrBlob = mainUrl.startsWith('data:') || mainUrl.startsWith('blob:');
        const next = isDataOrBlob ? mainUrl : (mainUrl + '?t=' + Date.now());
        if (base.src !== next) base.src = next;
        base.onerror = function () { /* 静默：与 applySkinBgToSlot 一致不报警 */ };
    } else if (base) {
        base.remove();
    }

    // 副卡：左上角小圆角矩形（金色外框 + 右下角切角）
    let overlay = slot.querySelector('.skin-layer-fused');
    if (fusedUrl) {
        if (!overlay) {
            overlay = document.createElement('img');
            overlay.className = 'skin-layer-fused';
            slot.appendChild(overlay);
            overlay.style.cursor = 'pointer';
            overlay.title = '点击切换被融合卡(徽章)皮肤';
            overlay.addEventListener('click', async (ev) => {
                ev.stopPropagation(); ev.preventDefault();
                const slotEl = overlay.closest('.battle-slot');
                if (!slotEl) return;
                const sid = slotEl.dataset.slot;
                const isUser = sid && sid.startsWith('u');
                const arr = isUser ? myPlacedCards : teammatePlacedCards;
                const c = arr.find(x => x.slot === sid);
                const hn = c ? c.name : '';
                const parts = (typeof getFusionParts === 'function') ? getFusionParts(hn) : null;
                if (parts && parts.length >= 2) {
                    await cycleFusionFusedSkin(parts[1], sid);
                    try { await applySkinBgToSlot(slotEl, hn); } catch (e) {}
                    const _ht = isUser ? 'my' : 'teammate';
                    const hc = document.querySelector('#' + (_ht === 'my' ? 'myHandContainer' : 'teammateHandContainer') + ' .selected-card[data-id="' + c.id + '"]');
                    if (hc) { try { await reapplySingleHandCard(hc, c.id, _ht); } catch (e) {} }
                }
            });
        }
        // isBadge:预切PNG(透明底+角落已含被融合卡)→满铺；否则副卡缩成小圆角矩形放左上金边框
        overlay.style.cssText = fusedIsBadge
            ? 'position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);object-fit:contain;border-radius:5px;z-index:1;pointer-events:none;'
            : 'position:absolute;left:3px;top:3px;width:' + FUSION_SIZE + ';height:auto;aspect-ratio:1/1;max-height:70%;object-fit:cover;box-sizing:border-box;border:3px solid #FFD700;clip-path:polygon(0 0,100% 0,100% 85%,85% 100%,0 100%);z-index:2;cursor:pointer;filter:drop-shadow(0 0 2px rgba(0,0,0,0.7));';
        if (overlay.src !== fusedUrl) overlay.src = fusedUrl;
    } else if (overlay && overlay.parentNode) {
        overlay.remove();
    }
    if (mainUrl || fusedUrl) slot.classList.add('skin-bg');
    else slot.classList.remove('skin-bg');
}

        // 开关：默认开启，可一键关
        // ==================== 卡组管理（管理员·仅桌面端）===================
        function _cgmIsTauri() { return !!(window.__TAURI__ || window.__TAURI_INTERNALS__); }
        async function _cgmInvoke(cmd, args) {
            const fn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
            if (!fn) throw new Error('非桌面端');
            return await fn(cmd, args);
        }
        async function _cgmWriteRepoFile(relPath, content) {
            const filePath = 'd:\\tfjl-web\\' + relPath.split('/').join('\\');
            await _cgmInvoke('write_text_file', { filePath, content });
        }
        async function _cgmReadRepoFile(relPath) {
            const filePath = 'd:\\tfjl-web\\' + relPath.split('/').join('\\');
            try { return await _cgmInvoke('read_text_file_auto', { filePath }); } catch (e) { return null; }
        }
        function openCardGroupManager(tab) {
            if (!_cgmIsTauri()) { alert('❌ 卡组管理仅桌面端可用（网页版不提供上传通道）'); return; }
            const modal = document.getElementById('cardGroupMgrModal');
            if (modal) modal.style.display = 'flex';
            const t = tab || 'fusion';
            cgmInitProfOptions();
            cgmSwitchTab(t);
            cgmRefreshFusionList();
        }
        // 职业下拉动态填充现有职业（读取 PROFESSION_KEY_MAP，不再硬编码乱写的职业）
        function cgmInitProfOptions() {
            const profs = (typeof PROFESSION_KEY_MAP === 'object' && PROFESSION_KEY_MAP)
                ? Object.keys(PROFESSION_KEY_MAP)
                : ['工程', '战士', '法师', '射手', '召唤', '牧师', '术士', '熊猫', '精灵球'];
            ['cgmFusionProf', 'cgmHeroProf'].forEach(id => {
                const sel = document.getElementById(id);
                if (!sel) return;
                sel.innerHTML = '<option value="">职业（可选）</option>' +
                    profs.map(p => '<option value="' + p + '">' + p + '</option>').join('');
            });
        }
        function cgmSwitchTab(tab) {
            const panes = { fusion: 'cgmFusionPane', hero: 'cgmHeroPane', skin: 'cgmSkinPane' };
            const tabs = { fusion: 'cgmTabFusion', hero: 'cgmTabHero', skin: 'cgmTabSkin' };
            const on = 'rgba(255,215,0,0.18)', off = 'rgba(255,255,255,0.05)';
            Object.keys(panes).forEach(k => {
                const p = document.getElementById(panes[k]); if (p) p.style.display = (k === tab) ? '' : 'none';
                const t = document.getElementById(tabs[k]);
                if (t) {
                    if (k === tab) { t.style.background = on; t.style.color = '#ffd700'; t.style.borderColor = 'rgba(255,215,0,0.4)'; }
                    else { t.style.background = off; t.style.color = 'rgba(255,255,255,0.8)'; t.style.borderColor = 'rgba(255,255,255,0.2)'; }
                }
            });
            // 皮肤制作 Tab：无论是带参进入还是手动点 Tab 切换，都要初始化+重绘，
            // 否则画布从未渲染过 → 全黑、选图无反应。用 rAF 等面板 display 生效后再画。
            // 皮肤制作器(app-skinmaker.js)已改为按需懒加载：未载入时先 loadModule 再初始化。
            if (tab === 'skin') {
                if (typeof window.openSkinMaker === 'function') {
                    requestAnimationFrame(function () { try { window.openSkinMaker(); } catch (e) { console.warn('[skinMaker] init failed', e); } });
                } else if (window.loadModule) {
                    window.loadModule('skinmaker').then(function () {
                        requestAnimationFrame(function () { try { window.openSkinMaker(); } catch (e) { console.warn('[skinMaker] init failed', e); } });
                    }).catch(function (e) { console.warn('[skinMaker] load failed', e); });
                }
            }
            if (tab === 'hero') { try { cgmRefreshHeroList(); } catch (e) {} }
        }
        // 添加融合卡：校验"必须正好是100张基础卡里的2张"
        let _cgmValidParts = null;
        function cgmValidateFusion() {
            const name = (document.getElementById('cgmFusionName').value || '').trim();
            const res = document.getElementById('cgmFusionResult');
            const addBtn = document.getElementById('cgmFusionAddBtn');
            _cgmValidParts = null;
            if (!name) { res.style.color = '#ff9e80'; res.textContent = '请输入融合卡名'; addBtn.disabled = true; addBtn.style.opacity = 0.5; return; }
            const baseSet = new Set(Object.keys(SKIN_ATTRIBUTES || {}));
            if (window.cloudCards) Object.keys(window.cloudCards).forEach(n => baseSet.add(n));
            const parts = splitIntoHeroes(name, baseSet);
            if (parts.length === 2 && baseSet.has(parts[0]) && baseSet.has(parts[1])) {
                _cgmValidParts = parts;
                res.style.color = '#4ade80';
                res.textContent = '✓ 校验通过：' + parts[0] + ' + ' + parts[1] + '（均为基础卡）';
                addBtn.disabled = false; addBtn.style.opacity = 1;
            } else if (parts.length < 2) {
                res.style.color = '#ff9e80';
                res.textContent = '✗ 无法拆成2张基础卡，请确认名字由2张100张卡内的英雄组成（如 小野酋长 / 影魇）';
                addBtn.disabled = true; addBtn.style.opacity = 0.5;
            } else {
                res.style.color = '#ff9e80';
                res.textContent = '✗ 拆出 ' + parts.length + ' 段（' + parts.join('+') + '），融合卡只能由恰好2张基础卡组成';
                addBtn.disabled = true; addBtn.style.opacity = 0.5;
            }
        }
        // 添加新英雄（基础卡）：写入 skins/cards.json，云端生效无需发版
        async function cgmAddNewHeroCard() {
            if (!_cgmIsTauri()) { alert('❌ 仅桌面端可用（网页版无上传通道）'); return; }
            const name = (document.getElementById('cgmHeroName').value || '').trim();
            const prof = document.getElementById('cgmHeroProf').value;
            const quality = document.getElementById('cgmHeroQuality').value;
            const desc = (document.getElementById('cgmHeroDesc').value || '').trim();
            const skinDesc = (document.getElementById('cgmHeroSkinDesc').value || '').trim();
            const status = document.getElementById('cgmHeroStatus');
            if (!name) { status.style.color = '#ff9e80'; status.textContent = '请输入英雄名'; return; }
            try {
                let base = { cards: {} };
                const local = await _cgmReadRepoFile('skins/cards.json');
                if (local) { try { const p = JSON.parse(local); if (p && p.cards) base = p; else if (p) { base.cards = p; } } catch (e) { base = { cards: {} }; } }
                if (!base.cards) base.cards = {};
                const rec = {};
                if (quality) rec.quality = quality;
                if (prof) rec.profession = prof;
                if (desc) rec.desc = desc;
                if (skinDesc) rec.skinDesc = skinDesc;
                base.cards[name] = rec;
                base.updated = new Date().toISOString();
                const content = JSON.stringify(base, null, 2);
                await _cgmWriteRepoFile('skins/cards.json', content);
                window.cloudCards = base.cards;
                if (typeof renderCloudCardsToPool === 'function') renderCloudCardsToPool();
                cgmRefreshHeroList();
                status.style.color = '#4ade80';
                status.textContent = '✓ 已写入 d:\\tfjl-web\\skins\\cards.json\n请在本机终端运行：\n  cd d:\\tfjl-web\n  git add skins/cards.json\n  git commit -m "hero: ' + name + '"\n  git push origin main\n  git -c http.proxy= -c https.proxy= push gitee';
                document.getElementById('cgmHeroName').value = '';
            } catch (e) {
                status.style.color = '#ff9e80';
                status.textContent = '✗ 写入失败：' + e.message;
            }
        }
        // 已添加英雄列表（带删除）
        function cgmRefreshHeroList() {
            const list = document.getElementById('cgmHeroList');
            const cnt = document.getElementById('cgmHeroCount');
            if (!list) return;
            const cards = (window.cloudCards && typeof window.cloudCards === 'object') ? window.cloudCards : {};
            const names = Object.keys(cards);
            if (cnt) cnt.textContent = names.length;
            if (!names.length) { list.innerHTML = '<div style="font-size:0.78rem;color:rgba(255,255,255,0.5);padding:6px 0;">（暂无自定义英雄）</div>'; return; }
            list.innerHTML = '';
            names.forEach(n => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);margin-bottom:6px;';
                const info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;font-size:0.84rem;color:#fff;';
                const c = cards[n] || {};
                const tags = [];
                if (c.profession) tags.push(c.profession);
                if (c.quality) tags.push(c.quality);
                info.textContent = n + (tags.length ? ('（' + tags.join('·') + '）') : '');
                const del = document.createElement('button');
                del.textContent = '🗑 删除';
                del.style.cssText = 'flex:none;padding:4px 9px;border-radius:6px;border:1px solid rgba(255,120,120,0.5);background:rgba(255,80,80,0.15);color:#ff9e9e;cursor:pointer;font-size:0.74rem;white-space:nowrap;';
                del.addEventListener('click', () => cgmDeleteHeroCard(n));
                row.appendChild(info); row.appendChild(del);
                list.appendChild(row);
            });
        }
        async function cgmDeleteHeroCard(name) {
            if (!confirm('确认删除英雄「' + name + '」？\n仅改本地 cards.json，需重新 git 推送才对线上生效。\n（该英雄已切的皮肤图片仍在 skins/' + name + '/ 不受影响）')) return;
            const status = document.getElementById('cgmHeroStatus');
            try {
                let base = { cards: {} };
                const local = await _cgmReadRepoFile('skins/cards.json');
                if (local) { try { const p = JSON.parse(local); if (p && p.cards) base = p; else if (p) base.cards = p; } catch (e) { base = { cards: {} }; } }
                if (!base.cards || !base.cards[name]) { if (status) { status.style.color = '#ff9e80'; status.textContent = '该英雄不存在'; } return; }
                delete base.cards[name];
                base.updated = new Date().toISOString();
                await _cgmWriteRepoFile('skins/cards.json', JSON.stringify(base, null, 2));
                window.cloudCards = base.cards;
                if (typeof renderCloudCardsToPool === 'function') renderCloudCardsToPool();
                cgmRefreshHeroList();
                if (status) { status.style.color = '#4ade80'; status.textContent = '✓ 已删除「' + name + '」并写入 cards.json\n请 git add skins/cards.json 并提交推送'; }
            } catch (e) {
                if (status) { status.style.color = '#ff9e80'; status.textContent = '✗ 删除失败：' + e.message; }
            }
        }
        // 融合卡编辑：填充表单进入覆盖模式（_cgmEditFusionName 非空时保存即覆盖同名条目）
        let _cgmEditFusionName = null;
        function cgmEditFusionCard(name) {
            const f = window.cloudFusions && window.cloudFusions[name];
            if (!f) return;
            _cgmEditFusionName = name;
            const ni = document.getElementById('cgmFusionName');
            const pi = document.getElementById('cgmFusionProf');
            const qi = document.getElementById('cgmFusionQuality');
            if (ni) ni.value = name;
            if (pi) pi.value = f.profession || '';
            if (qi) qi.value = f.quality || '';
            cgmValidateFusion();
            const addBtn = document.getElementById('cgmFusionAddBtn');
            if (addBtn) addBtn.textContent = '✓ 保存修改';
            const status = document.getElementById('cgmFusionStatus');
            if (status) { status.style.color = '#ffd700'; status.textContent = '✏️ 正在编辑「' + name + '」，修改职业/品质后点「保存修改」覆盖（组成须仍为 2 张基础卡；改名会变为新增另一张）'; }
        }
        async function cgmAddFusionCard() {
            if (!_cgmValidParts) return;
            const name = (document.getElementById('cgmFusionName').value || '').trim();
            const prof = document.getElementById('cgmFusionProf').value;
            const quality = document.getElementById('cgmFusionQuality').value;
            const status = document.getElementById('cgmFusionStatus');
            try {
                const base = (window.cloudFusions && typeof window.cloudFusions === 'object') ? JSON.parse(JSON.stringify(window.cloudFusions)) : {};
                base[name] = { components: _cgmValidParts.slice(), profession: prof || undefined, quality: quality || undefined };
                const content = JSON.stringify({ version: 1, updated: new Date().toISOString(), note: '融合卡定义：components 为参与融合的2张基础卡。', fusions: base }, null, 2);
                await _cgmWriteRepoFile('skins/fusions.json', content);
                window.cloudFusions = base;
                cgmRefreshFusionList();
                cgmRefreshAllSlots();
                if (typeof renderFusionCardsToPool === 'function') renderFusionCardsToPool();
                // 一步到位：添加融合卡后立即自动切副卡皮并入 skins（副卡 = components[1]）
                let cutMsg = '';
                try {
                    const subHero = (_cgmValidParts && _cgmValidParts[1]) || null;
                    if (subHero) {
                        const skins = (window.skinRegistry && window.skinRegistry[subHero]) || [];
                        if (skins.length) {
                            const blobs = [];
                            for (const s of skins) {
                                try {
                                    const url = window.resolveHeroSkinUrl ? await window.resolveHeroSkinUrl(subHero, s.name) : null;
                                    if (!url) continue;
                                    const blob = await (async () => { try { return await (await fetch(url)).blob(); } catch (e) { return null; } })();
                                    if (blob) blobs.push({ name: s.name, blob });
                                } catch (e) {}
                            }
                            if (blobs.length) {
                                let registry = null;
                                try { const local = await _cgmReadRepoFile('skins/registry.json'); if (local) registry = JSON.parse(local); } catch (e) {}
                                if (!registry || !registry.heroes) registry = { version: 2, heroes: {} };
                                registry.heroes['融合' + subHero] = await cgmWriteFusedHero(subHero, blobs);
                                registry.updated = new Date().toISOString();
                                await _cgmWriteRepoFile('skins/registry.json', JSON.stringify(registry, null, 2));
                                cutMsg = '\n✓ 已自动切副卡「' + subHero + '」' + blobs.length + ' 张皮肤并入 skins/融合' + subHero + '\\（到「🎨 皮肤制作」Tab 点「🚀 一键推送」推上线即可）';
                            } else {
                                cutMsg = '\n⚠ 副卡「' + subHero + '」暂未加载到皮肤，可稍后点「🚀 一键全切所有融合卡副卡」补切';
                            }
                        } else {
                            cutMsg = '\n⚠ 副卡「' + subHero + '」暂未加载到皮肤，可稍后点「🚀 一键全切所有融合卡副卡」补切';
                        }
                    }
                } catch (e2) {
                    cutMsg = '\n⚠ 自动切副卡皮失败：' + e2.message + '（可点「🚀 一键全切所有融合卡副卡」重试）';
                }
                status.style.color = '#4ade80';
                status.textContent = '✓ 已写入 d:\\tfjl-web\\skins\\fusions.json\n请在本机终端运行：\n  cd d:\\tfjl-web\n  git add skins/fusions.json skins/registry.json skins/融合*\n  git commit -m "fusion: ' + name + '"\n  git push origin main\n  git -c http.proxy= -c https.proxy= push gitee' + cutMsg;
                if (_cgmEditFusionName) { const ab = document.getElementById('cgmFusionAddBtn'); if (ab) ab.textContent = '✓ 添加融合卡'; _cgmEditFusionName = null; }
            } catch (e) {
                status.style.color = '#ff9e80';
                status.textContent = '✗ 写入失败：' + e.message;
            }
        }
        // 已添加融合卡列表（带删除）
        function cgmRefreshAllSlots() {
            document.querySelectorAll('.battle-slot.filled').forEach(slot => {
                if (typeof refreshSlotFusionControl === 'function') refreshSlotFusionControl(slot);
            });
        }
        function cgmRefreshFusionList() {
            const list = document.getElementById('cgmFusionList');
            const cnt = document.getElementById('cgmFusionCount');
            if (!list) return;
            const fusions = (window.cloudFusions && typeof window.cloudFusions === 'object') ? window.cloudFusions : {};
            const names = Object.keys(fusions);
            if (cnt) cnt.textContent = names.length;
            if (names.length === 0) {
                list.innerHTML = '<div style="font-size:0.78rem;color:rgba(255,255,255,0.5);padding:6px 0;">（暂无，添加后会出现在这里）</div>';
                return;
            }
            list.innerHTML = '';
            // 按 components 排序，便于查看哪些开过
            names.sort((a, b) => {
                const ca = (fusions[a].components || []).join('+'), cb = (fusions[b].components || []).join('+');
                return ca.localeCompare(cb);
            });
            for (const n of names) {
                const c = fusions[n].components || [];
                const tags = [];
                if (fusions[n].profession) tags.push(fusions[n].profession);
                if (fusions[n].quality) tags.push(fusions[n].quality);
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);';
                const info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;';
                info.innerHTML = '<div style="font-size:0.86rem;color:#fff;font-weight:600;">' + n + '</div>' +
                    '<div style="font-size:0.72rem;color:rgba(255,255,255,0.6);">' + (c.length ? ('组成：' + c.join(' + ')) : '（无 components）') + (tags.length ? ' · ' + tags.join(' · ') : '') + '</div>';
                const del = document.createElement('button');
                del.textContent = '🗑 删除';
                del.title = '从 fusions.json 删除「' + n + '」';
                del.style.cssText = 'flex:none;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,120,120,0.5);background:rgba(255,80,80,0.15);color:#ff9e9e;cursor:pointer;font-size:0.76rem;white-space:nowrap;';
                del.addEventListener('click', () => cgmDeleteFusionCard(n));
                const edt = document.createElement('button');
                edt.textContent = '✏️ 编辑';
                edt.title = '修改「' + n + '」组成 / 属性（覆盖同名条目）';
                edt.style.cssText = 'flex:none;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,215,0,0.5);background:rgba(255,215,0,0.15);color:#ffd700;cursor:pointer;font-size:0.76rem;white-space:nowrap;';
                edt.addEventListener('click', () => cgmEditFusionCard(n));
                row.appendChild(info);
                row.appendChild(edt);
                row.appendChild(del);
                list.appendChild(row);
            }
        }
        // 删除融合卡定义时，同步清理其副卡（components[1]）切出来的「融合XX」皮
        async function cgmDeleteFusionSkin(subHero) {
            const key = '融合' + subHero;
            try {
                const local = await _cgmReadRepoFile('skins/registry.json');
                const registry = local ? JSON.parse(local) : { version: 2, heroes: {} };
                if (!registry.heroes) registry.heroes = {};
                const skins = registry.heroes[key] || [];
                // 删磁盘 png
                for (const s of skins) {
                    const fn = s.file || (key + '_' + (s.name === '默认' ? 'default' : s.name) + '.png');
                    try { await _cgmInvoke('delete_file', { filePath: 'd:\\tfjl-web\\skins\\' + key + '\\' + fn }); } catch (e) {}
                }
                delete registry.heroes[key];
                registry.updated = new Date().toISOString();
                await _cgmWriteRepoFile('skins/registry.json', JSON.stringify(registry, null, 2));
                if (window.skinRegistry) delete window.skinRegistry[key];
                return skins.length;
            } catch (e) { return -1; }
        }
        async function cgmDeleteFusionCard(name) {
            if (!window.cloudFusions || !window.cloudFusions[name]) return;
            const fusion = window.cloudFusions[name];
            const subHero = (fusion && Array.isArray(fusion.components) && fusion.components.length >= 2) ? fusion.components[1] : null;
            // 三档：仅删定义 / 删定义+副卡皮 / 取消
            let mode = 'def';
            if (subHero) {
                const msg = '删除融合卡「' + name + '」：\n\n点「确定」= 仅删定义（皮「融合' + subHero + '」保留）\n点「取消」后弹窗选「删皮」= 定义+切的皮一起删\n\n是否仅删除定义？';
                if (!confirm(msg)) {
                    const del = confirm('确认同时删除切出来的皮肤「融合' + subHero + '」？\n（将从 registry.json 移除并删除 skins/融合' + subHero + '/ 下相关 png）');
                    if (!del) return; // 用户两次都取消 → 不删
                    mode = 'both';
                }
            } else {
                if (!confirm('确认删除融合卡「' + name + '」？\n删除仅改本地 fusions.json，需重新 git 推送才对线上生效。')) return;
            }
            const status = document.getElementById('cgmFusionStatus');
            try {
                const base = JSON.parse(JSON.stringify(window.cloudFusions));
                delete base[name];
                const content = JSON.stringify({ version: 1, updated: new Date().toISOString(), note: '融合卡定义：components 为参与融合的2张基础卡。', fusions: base }, null, 2);
                await _cgmWriteRepoFile('skins/fusions.json', content);
                window.cloudFusions = base;
                let skinMsg = '';
                if (mode === 'both' && subHero) {
                    const n = await cgmDeleteFusionSkin(subHero);
                    skinMsg = (n > 0 ? '\n✓ 已一并删除副卡皮「融合' + subHero + '」（' + n + ' 张 png + registry 登记）' : (n === 0 ? '\n（副卡皮「融合' + subHero + '」无登记，跳过）' : ''));
                }
                cgmRefreshFusionList();
                cgmRefreshAllSlots();
                if (typeof renderFusionCardsToPool === 'function') renderFusionCardsToPool();
                if (status) {
                    status.style.color = '#4ade80';
                    status.textContent = '✓ 已删除「' + name + '」并写入 fusions.json' + skinMsg + '\n请在本机终端运行：\n  cd d:\\tfjl-web\n  git add skins/fusions.json' + (mode === 'both' ? ' skins/registry.json skins/融合' + subHero + '/*' : '') + '\n  git commit -m "fusion: 删除 ' + name + '"\n  git push origin main\n  git -c http.proxy= -c https.proxy= push gitee';
                }
            } catch (e) {
                if (status) { status.style.color = '#ff9e80'; status.textContent = '✗ 删除失败：' + e.message; }
            }
        }
        // 一键推送：调用 Rust 命令把本地 fusions.json 推到 GitHub（及 Gitee），Pages 自动部署
        async function cgmPushFusions() {
            if (!_cgmIsTauri()) { alert('❌ 仅桌面端可用（网页版无 git 通道）'); return; }
            const status = document.getElementById('cgmFusionStatus');
            const btn = document.getElementById('cgmPushBtn');
            btn.disabled = true; const old = btn.textContent; btn.textContent = '⏳ 推送中…';
            try {
                const out = await _cgmInvoke('git_push_fusions', {});
                if (status) { status.style.color = '#4ade80'; status.textContent = '✓ 推送完成：\n' + out; }
                cgmRefreshFusionList();
            } catch (e) {
                if (status) { status.style.color = '#ff9e80'; status.textContent = '✗ 推送失败：' + (e.message || e); }
            } finally {
                btn.disabled = false; btn.textContent = old;
            }
        }
        // 系统托盘图标闪动（需求墙新未读提醒）：仅桌面端有效；on=true 闪动，on=false 停
        function flashTray(on) {
            if (!_cgmIsTauri()) return;
            _cgmInvoke('flash_tray_icon', { on: !!on }).catch(() => {});
        }
        // blob → base64（去掉 data URL 前缀），供 Tauri write_binary_file 直写
        function cgmBlobToBase64(blob) {
            return new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => { const res = r.result; const i = res.indexOf(','); resolve(i >= 0 ? res.slice(i + 1) : res); };
                r.onerror = reject;
                r.readAsDataURL(blob);
            });
        }
        function cgmDownloadBlob(blob, fn) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = fn;
            document.body.appendChild(a); a.click(); a.remove();
        }
        // 把单个副卡英雄的整图皮肤写进 registry + 落盘（Tauri 直写优先，否则浏览器下载）
        async function cgmWriteFusedHero(hero, blobs) {
            const key = '融合' + hero;
            const isTauri = _cgmIsTauri();
            for (const b of blobs) {
                const fn = key + '_' + (b.name === '默认' ? 'default' : b.name) + '.png';
                if (isTauri) {
                    try {
                        const base64 = await cgmBlobToBase64(b.blob);
                        await _cgmInvoke('write_binary_file', { filePath: 'd:\\tfjl-web\\skins\\' + key + '\\' + fn, contentBase64: base64 });
                        continue;
                    } catch (e) { /* 直写失败回退下载 */ }
                }
                cgmDownloadBlob(b.blob, fn);
            }
            window.skinRegistry[key] = blobs.map(b => ({ name: b.name, url: URL.createObjectURL(b.blob), path: null, loaded: true, remote: false }));
            return blobs.map(b => ({ name: b.name, file: key + '_' + (b.name === '默认' ? 'default' : b.name) + '.png' }));
        }
        // 一键全切：遍历所有融合卡，取其副卡英雄（components[1]）一次性生成 融合XX 整图皮
        async function cgmCutAllFusions() {
            const status = document.getElementById('cgmFusedStatus');
            const btn = document.getElementById('cgmCutAllBtn');
            const progWrap = document.getElementById('cgmCutProgressWrap');
            const progBar = document.getElementById('cgmCutProgressBar');
            const progText = document.getElementById('cgmCutProgressText');
            const progPct = document.getElementById('cgmCutProgressPct');
            if (!window.cloudFusions || !Object.keys(window.cloudFusions).length) {
                status.style.color = '#ff9e80'; status.textContent = '没有融合卡定义，请先去「融合卡」Tab 添加'; return;
            }
            const subSet = new Set();
            Object.values(window.cloudFusions).forEach(f => {
                if (f && Array.isArray(f.components) && f.components.length >= 2) subSet.add(f.components[1]);
            });
            const subs = [...subSet];
            if (!subs.length) { status.style.color = '#ff9e80'; status.textContent = '融合卡未包含副卡英雄'; return; }
            btn.disabled = true; const old = btn.textContent; btn.textContent = '⏳ 批量切皮中…';
            if (progWrap) progWrap.style.display = 'block';
            if (progBar) progBar.style.width = '0%';
            if (progPct) progPct.textContent = '0%';
            if (progText) progText.textContent = '批量切皮中：共 ' + subs.length + ' 个副卡英雄…';
            status.style.color = '#4ecdc4'; status.textContent = '批量切皮中…（进度见上方进度条）';
            let registry = null;
            try { const local = await _cgmReadRepoFile('skins/registry.json'); if (local) registry = JSON.parse(local); } catch (e) {}
            if (!registry || !registry.heroes) registry = { version: 2, heroes: {} };
            let ok = 0, skip = 0;
            for (const hero of subs) {
                const skins = (window.skinRegistry && window.skinRegistry[hero]) || [];
                if (!skins.length) { skip++; continue; }
                const blobs = [];
                for (const s of skins) {
                    try {
                        const url = window.resolveHeroSkinUrl ? await window.resolveHeroSkinUrl(hero, s.name) : null;
                        if (!url) continue;
                        const blob = await (async () => { try { return await (await fetch(url)).blob(); } catch (e) { return null; } })();
                        if (blob) blobs.push({ name: s.name, blob });
                    } catch (e) {}
                }
                if (!blobs.length) { skip++; continue; }
                registry.heroes['融合' + hero] = await cgmWriteFusedHero(hero, blobs);
                ok++;
                const pct = Math.round(ok / subs.length * 100);
                if (progBar) progBar.style.width = pct + '%';
                if (progPct) progPct.textContent = pct + '%';
                if (progText) progText.textContent = '切皮中：' + ok + '/' + subs.length + '（' + hero + ' 完成）';
                if (status) status.textContent = '切皮中：' + ok + '/' + subs.length + '（' + hero + ' 完成）';
            }
            registry.updated = new Date().toISOString();
            try { await _cgmWriteRepoFile('skins/registry.json', JSON.stringify(registry, null, 2)); } catch (e) {}
            btn.disabled = false; btn.textContent = old;
            if (progWrap) progWrap.style.display = 'none';
            status.style.color = '#4ade80';
            status.textContent = '✅ 全部切完！共切 ' + ok + ' 个副卡英雄（' + skip + ' 个无皮肤跳过）\n已写入 skins/registry.json 与各 skins/融合XX/ 目录\n👉 现在切到「🎨 皮肤制作」Tab，点 🚀 一键推送 把 skins/ 推上线（git_push_skins 会自动包含 skins/）';
        }

        function toggleFusionSkinSplit(on) {
            fusionSkinSplitEnabled = !!on;
            try { localStorage.setItem('tfjl_fusion_skin_split', fusionSkinSplitEnabled ? '1' : '0'); } catch (e) {}
            refreshAllFusionSkins();
        }

        // 重新应用所有融合卡皮肤（换肤 / 切开关后调用）
        async function refreshAllFusionSkins() {
            document.querySelectorAll('.selected-card[data-name]').forEach(card => {
                const parts = getFusionParts(card.dataset.name);
                if (parts && parts.length >= 2) reapplySingleHandCard(card, card.dataset.id, card.dataset.handType || 'my');
            });
            const slots = document.querySelectorAll('.battle-slot.filled');
            const jobs = [];
            slots.forEach(slot => {
                const name = getSlotCardName(slot);
                if (getFusionParts(name)) jobs.push((async () => {
                    try { await applySkinBgToSlot(slot, name); } catch (e) {}
                })());
            });
            await Promise.all(jobs);
        }

        // 单个手牌卡重铺皮肤（融合→对角切，非融合→原逻辑）
        async function reapplySingleHandCard(card, cid, ht) {
            const cardName = card.dataset.name;
            if (!cardName) return;
            // 刷新手牌卡名显示：融合关闭（副卡隐藏）时只显主卡名；完整名存 data-full-name 供逻辑读取
            const nameEl0 = card.querySelector('.card-name');
            if (nameEl0) { nameEl0.dataset.fullName = cardName; nameEl0.textContent = getFusionDisplayName(cardName); }
            if (fusionSkinSplitEnabled) {
                const parts = getFusionParts(cardName);
                if (parts && parts.length >= 2) {
                    const mainHero = parts[0], fusedHero = parts[1];
                    const mainSkin = cid ? getCardSkin(cid, mainHero, ht) : '默认';
                    const mainUrl = window.resolveHeroSkinUrl ? await window.resolveHeroSkinUrl(mainHero, mainSkin) : null;
                    const fusedInfo = await resolveFusionHalf(fusedHero, card);
                    const fusedUrl = fusedInfo ? fusedInfo.url : null;
                    const fusedIsBadge = fusedInfo ? fusedInfo.isBadge : false;
                    if (mainUrl || fusedUrl) { applyFusionSkinToHandCard(card, mainUrl, fusedUrl, fusedIsBadge); return; }
                }
            }
            const name = getMainCardName(cardName);
            if (!name) return;
            const skin = cid ? getCardSkin(cid, name, ht) : '默认';
            if (window.resolveHeroSkinUrl) {
                const url = await window.resolveHeroSkinUrl(name, skin);
                if (url) { applySkinBgToHandCard(card, url); }
                else { removeSkinBgFromHandCard(card); }
            }
        }
        
        function addCustomSkin(cardName, skinName) {
            const mainCardName = getMainCardName(cardName);
            if (!customCardSkins[mainCardName]) {
                customCardSkins[mainCardName] = [];
            }
            if (!customCardSkins[mainCardName].includes(skinName)) {
                customCardSkins[mainCardName].push(skinName);
                saveCustomSkins();
                return true;
            }
            return false;
        }

        // 一键全部重置皮肤：清空所有自定义默认皮肤，重渲染所有卡牌/融合卡（无需逐英雄选择）
        async function resetAllSkins() {
            try {
                window.heroSkinSelections = {};
                try { localStorage.removeItem('tdjl_heroSkinSelections'); } catch (e) {}
                // 重渲染当前所有战斗槽位 + 全场刷新融合卡
                if (typeof restoreBattleSlots === 'function') { try { await restoreBattleSlots(); } catch (e) {} }
                if (typeof refreshAllFusionSkins === 'function') { try { await refreshAllFusionSkins(); } catch (e) {} }
                if (typeof refreshProjectSelectors === 'function') refreshProjectSelectors();
                console.log('[皮肤] 已全部重置为默认');
            } catch (e) { console.warn('[皮肤] 重置失败:', e); }
        }
        window.resetAllSkins = resetAllSkins;

        let customSkinAttributes = {};
        
        function addCustomSkinAttribute(cardName, skinName, attrDesc) {
            if (!customSkinAttributes[cardName]) {
                customSkinAttributes[cardName] = {};
            }
            customSkinAttributes[cardName][skinName] = { desc: attrDesc };
            saveCustomSkinAttributes();
        }
        
        function saveCustomSkinAttributes() {
            localStorage.setItem('tdjl_customSkinAttributes', JSON.stringify(customSkinAttributes));
        }
        
        function loadCustomSkinAttributes() {
            const saved = localStorage.getItem('tdjl_customSkinAttributes');
            if (saved) {
                customSkinAttributes = JSON.parse(saved);
            }
        }
        
        function removeCustomSkin(cardName, skinName) {
            if (customCardSkins[cardName]) {
                const index = customCardSkins[cardName].indexOf(skinName);
                if (index > -1) {
                    customCardSkins[cardName].splice(index, 1);
                    saveCustomSkins();
                    return true;
                }
            }
            return false;
        }
        
        function saveCustomSkins() {
            localStorage.setItem('tdjl_customCardSkins', JSON.stringify(customCardSkins));
        }
        
        // 加载自定义皮肤
        function loadCustomSkins() {
            const saved = localStorage.getItem('tdjl_customCardSkins');
            if (saved) {
                customCardSkins = JSON.parse(saved);
            }
        }
        
        // 皮肤属性定义 引用请注明出处
        const SKIN_ATTRIBUTES = {
            "天使": {
                "默认": { desc: "技能:回复100%攻击生命，且对全屏目标造成3段100%攻击真实伤害\n初始被动 攻击造成目标1.5%生命上限伤害\n满星被动 每上阵1个牧师，自身基础攻速-1秒" },
                "神炎·天使": { desc: "额外被动：自身攻击+1500、真实伤害加成+30%" },
                "戚秦氏·天使": { desc: "额外被动：不触发职业被动时，自身攻击额外造成一次伤害" },
                "魔化": { desc: "自身PVE附加伤害+320000" }
            },
            "鱼人": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害。\n初始被动 攻击同一目标时每次攻击攻速+20%\n满星被动 攻击造成目标0.4%生命上限伤害" },
                "小鱼儿·鱼人": { desc: "额外被动：战斗中，同时视为战士和法师职业，且PVE附加伤害+80000" },
                "张顺·鱼人": { desc: "额外被动：战斗中，自身基础攻速-0.2秒，且PVE附加伤害+160000" },
                "甘宁·鱼人": { desc: "额外被动：满星后，转换目标保留当前攻速，且PVE附加伤害+80000" },
                "梁宽·鱼人": { desc: "额外被动：战斗中，同时视为战士和术士职业，且PVE附加伤害+80000" },
                "田伯光·鱼人": { desc: "额外被动：战斗中，同时视为战士和熊猫职业，且PVE附加伤害+80000" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "风灵": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害。\n初始被动 每上阵1个熊猫，自身PVE附加伤害+100000\n满星被动 每上阵1个熊猫，全体攻速+40%" },
                "太平乐·风灵": { desc: "额外被动：自身PVE附加伤害+320000" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "圣骑": {
                "默认": { desc: "技能:回复1000%攻击生命。\n初始被动 战车免疫持续伤害、迟滞、减(攻)速，被控-80%；治疗3%生命\n满星被动 战车免疫持续伤害、迟滞、减(攻)速，被控-80%；治疗回复7.5%生命" },
                "无头骑士·圣骑": { desc: "额外被动：光环：敌方治疗效果-50%" },
                "孙权·圣骑": { desc: "额外被动：PVP战斗中，己方战车无视减疗和禁疗效果" },
                "风暴·圣骑": { desc: "额外被动：满星后，己方天使获得祝福，攻速+300%" },
                "魔化": { desc: "每次攻击后使所在战车攻击最高的英雄连击次数+1(仅对连击英雄有效，且优先连击英雄)，持续6秒" }
            },
            "射线": {
                "默认": { desc: "技能:安装在战车前部，无法主动攻击。\n初始被动(光环) 真实伤害减免+35%，且敌方攻击-20%（唯一）\n满星被动(光环) 真实伤害减免+70%，且敌方攻击-20%（唯一）" },
                "雷峰塔·侏儒射线": { desc: "额外被动：光环：真实伤害减免+5%，且附加伤害减免+25%" },
                "剑冢·侏儒射线": { desc: "额外被动：光环：真实伤害减免" },
                "日晷·侏儒射线": { desc: "额外被动：将敌方战车上攻击最高的英雄技能百分比变为50%" },
                "魔化": { desc: "光环：真实伤害减免+5%" }
            },
            "宝库": {
                "默认": { desc: "技能:安装在战车前部，无法主动攻击。\n初始被动 每9秒为所在战车提供1%*银币数量的银币\n满星被动 每9秒为所在战车提供1.5%*银币数量的银币" },
                "金刚石·地精宝库": { desc: "额外被动：每100银币战车伤害减免+0.01%" },
                "暗月·地精宝库": { desc: "额外被动：每100银币战车伤害减免+0.02%" },
                "魔化": { desc: "每10000银币，全体附加伤害加成+1%" }
            },
            "潜艇": {
                "默认": { desc: "技能:安装在战车前部，无法主动攻击。\n初始被动(光环) 百分比伤害减免+30%，且水下作战时氧气不再消耗（唯一）\n满星被动(光环) 百分比伤害减免+60%，且水下作战时氧气不再消耗（唯一）" },
                "鲨鱼号·微型潜艇": { desc: "额外被动：光环：百分比伤害减免+10%" },
                "魔化": { desc: "光环：百分比伤害减免+10%" }
            },
            "死神": {
                "默认": { desc: "技能:回复200%攻击生命。\n初始被动(光环) 生命+50%\n满星被动(光环) 生命+150%" },
                "万圣节·死神": { desc: "额外被动：光环：生命+25%" },
                "粉色南瓜·死神": { desc: "额外被动：不触发职业被动时，全体护甲+20%、魔抗+20%" },
                "魔化": { desc: "己方每上阵1个牧师，战车生命+10%" }
            },
            "酋长": {
                "默认": { desc: "技能:回复200%攻击生命。\n初始被动 光环：伤害减免+35%，护甲+5，魔抗+5（唯一）\n满星被动 光环：伤害减免+60%，护甲+5，魔抗+5（唯一）" },
                "奶牛·酋长": { desc: "额外被动：光环：伤害减免+10%" },
                "粉色奶牛·酋长": { desc: "额外被动：不触发职业被动时，全体伤害减免+25%" },
                "魔化": { desc: "战车生命+25%" }
            },
            "电法": {
                "默认": { desc: "技能:对范围目标造成200%攻击伤害。\n初始被动 光环：上阵3法师时，全体攻速+150%，且敌方魔抗-10\n满星被动 光环：上阵5法师时，全体攻速+225%，且敌方魔抗-35" },
                "水娃·电法": { desc: "额外被动：光环：攻速+30%" },
                "戴宗·电法": { desc: "额外被动：光环：敌方魔抗-20%" },
                "春香·电法": { desc: "额外被动：上阵5法师时，全体PVE战斗中无视冰盾效果" },
                "华山掌门·电法": { desc: "额外被动：上阵5法师时，全体PVE战斗中无视冰盾效果" },
                "魔化": { desc: "光环：全体攻速+60%，且敌方魔抗-10%" }
            },
            "火灵": {
                "默认": { desc: "技能:对单个目标8连击，造成8次100%攻击伤害。\n初始被动 技能强化为8连击，对单个目标造成8次伤害\n满星被动 己方每上阵1个熊猫，自身伤害x4" },
                "谢晓峰·火灵": { desc: "额外被动：基础攻速-0.3秒" },
                "张飞·火灵": { desc: "额外被动：基础攻速-0.3秒" },
                "太平乐·火灵": { desc: "额外被动：自身PVE附加伤害+320000" },
                "令狐冲·火灵": { desc: "额外被动：攻击同一个目标时，有1%概率发现敌方破绽，无视冰甲+3%，最高可叠33层" },
                "魔化": { desc: "自身连击次数+2，且攻击附带溅射效果" }
            },
            "战将": {
                "默认": { desc: "技能:对最多2个目标造成100%攻击伤害。\n初始被动 每击杀一个目标攻击+4%\n满星被动 每击杀一个目标攻速+12%" },
                "虹猫·战将": { desc: "技能强化：攻击时额外投掷1个斧子" },
                "刀马·战将": { desc: "额外被动：基础攻速+30%" },
                "冰雪·战将": { desc: "额外被动：自身攻击+999" },
                "许仕林·战将": { desc: "额外被动：伤害加成+15%，己方上阵白娘子时伤害加成额外+15%" },
                "许仙·战将": { desc: "额外被动：伤害加成+25%，己方上阵白娘子时伤害加成额外+25%" },
                "萧十一郎·战将": { desc: "额外被动：敌人死亡时都会视为由萧十一郎击杀，己方上阵沈璧君时伤害加成+50%" },
                "武松·战将": { desc: "额外被动：敌人死亡时都会视为由武松击杀，己方上阵武大郎时伤害加成+50%" },
                "吕布·战将": { desc: "技能强化：攻击时额外投掷2个斧子" },
                "风暴·战将": { desc: "额外被动：初始上阵时即可生效满星被动，且每击杀一个目标自身伤害加成+2%" },
                "黄飞鸿·战将": { desc: "技能强化：攻击时额外投掷2个斧子" },
                "林平之·战将": { desc: "技能强化：攻击时额外投掷2个斧子" },
                "魔化": { desc: "攻击不再分裂，变为每多一柄斧子连击概率+50%，且附带溅射效果" }
            },
            "咕咕": {
                "默认": { desc: "技能:回复战车和小兵1250%攻击生命。\n初始被动 职业被动触发需求职业数量-2\n满星被动 额外回复8%生命，每上阵一个职业核心，战车护甲、魔抗、纯粹减免+8%" },
                "虚空兽·咕咕": { desc: "额外被动：己方每上阵一个职业核心，所有英雄伤害加成+15%" },
                "老爷爷·咕咕": { desc: "额外被动：己方每上阵一个职业核心，战车伤害减免+10%" },
                "天机星·咕咕": { desc: "额外被动：己方每上阵一个职业核心，战车伤害减免+10%" },
                "宋江·咕咕": { desc: "额外被动：己方每上阵一个职业核心，战车生命+15%" },
                "华佗·咕咕": { desc: "额外被动：己方每上阵一个职业核心，战车伤害减免+10%" },
                "华夫人·咕咕": { desc: "额外被动：己方每上阵一个职业核心，战车生命+15%" },
                "深海异兽·咕咕": { desc: "额外被动：诅咒敌方战车，使敌方出售收益失效" },
                "太平乐·咕咕": { desc: "额外被动：不触发职业被动时，全体附加伤害加成+50%" },
                "少林掌门·咕咕": { desc: "额外被动：己方每上阵一个职业核心，全体附加伤害加成+30%" },
                "魔化": { desc: "己方每上阵一个魔化英雄，全体附加伤害加成+10%" }
            },
            "火炮": {
                "默认": { desc: "技能:安装在战车前部，对范围目标造成150%攻击伤害。\n初始被动 每次攻击后增加自身8%攻击\n满星被动 每次攻击后增加自身15%攻击，1%攻速" },
                "龙吼·邪能火炮": { desc: "额外被动：基础攻速+25%" },
                "小李飞刀·邪能火炮": { desc: "额外被动：战斗中每秒自身伤害加成+0.8%，且攻击必定命中" },
                "尚方宝剑·邪能火炮": { desc: "额外被动：真实伤害+40%，己方上阵包婆婆时基础攻速-0.5秒" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "水灵": {
                "默认": { desc: "技能:对范围目标造成200%攻击伤害。\n初始被动 上阵3熊猫时，全体伤害加成+60%\n满星被动 上阵5熊猫时，全体伤害加成+75%，附加伤害加成+50%" },
                "潮汐·水灵": { desc: "额外被动：上阵5熊猫时，全体PVE战斗中无视冰盾效果" },
                "刘备·水灵": { desc: "额外被动：战斗中，同时视为熊猫和法师职业" },
                "太平乐·水灵": { desc: "额外被动：光环：附加伤害加成+50%" },
                "魔化": { desc: "光环：附加伤害加成+50%" }
            },
            "萌萌": {
                "默认": { desc: "技能:用泡泡困住对方攻击最高的一个英雄，持续6.8秒（控制时间随等级提升）。\n初始被动 场上有同样英雄时，则己方该英雄的伤害和治疗×5\n满星被动 场上有同样英雄时，则己方该英雄的伤害和治疗×4（可与初始叠加）" },
                "冰雪·萌萌": { desc: "额外被动：场上有相同英雄时，己方相同的英雄的伤害和治疗额外增加2倍" },
                "唐三藏·萌萌": { desc: "额外被动：无视敌方萌萌被动，且满星后场上同样英雄攻击+120%" },
                "武大郎·萌萌": { desc: "额外被动：无视敌方萌萌被动，且满星后场上同样英雄攻击+120%" },
                "诸葛亮·萌萌": { desc: "额外被动：无视敌方萌萌被动，且施放技能时额外附带1个目标为随机英雄的泡泡" },
                "太平乐·萌萌": { desc: "额外被动：无视敌方萌萌被动，且满星后场上同样英雄攻击+120%" },
                "烈火奶奶·萌萌": { desc: "额外被动：无视敌方萌萌被动，且满星后场上同样英雄附加伤害加成+100%" },
                "魔化": { desc: "场上有同样英雄时，己方该英雄PVE附加伤害+240000" }
            },
            "小野": {
                "默认": { desc: "技能:回复500%攻击生命，且附带伤害减免+90%，持续1.5秒。\n初始被动 战车生命每-1%，受治疗效果+2%\n满星被动 保护战车，使其在受到致命伤害前无敌5秒（每场战斗只能触发1次）。" },
                "小七·小野": { desc: "额外被动：战斗中，自身职业替换为法师" },
                "万圣甜心·小野": { desc: "额外被动：战斗中，自身职业替换为法师" },
                "紫霞仙子·小野": { desc: "额外被动：战斗中，自身职业替换为猎人" },
                "沈璧君·小野": { desc: "额外被动：每次治疗后使所在战车攻击最高的英雄PVE附加伤害+240000（优先连击英雄），持续6秒" },
                "万圣女巫·小野": { desc: "额外被动：战斗中，自身职业替换为术士" },
                "貂蝉·小野": { desc: "额外被动：战斗中，自身职业替换为猎人" },
                "秋香·小野": { desc: "额外被动：全体PVE附加伤害+100000，且触发无敌时间延长3秒" },
                "十三姨·小野": { desc: "额外被动：全体真实伤害加成+10%，与黄飞鸿出战时，魔化·黄飞鸿·战将连击+1" },
                "太平乐·小野": { desc: "额外被动：战斗中，自身职业替换为熊猫" },
                "仪琳·小野": { desc: "额外被动：触发无敌时间+100%，不触发职业被动时自身基础攻速+100%" },
                "魔化": { desc: "每次攻击后使所在战车攻击最高的英雄连击次数+1(仅对连击英雄有效，且优先连击英雄)，持续6秒" }
            },
            "刀客": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害\n初始被动 光环：攻击+60%\n满星被动 光环：攻击+150%" },
                "圣诞怪杰·刀客": { desc: "额外被动：光环：攻击+30%" },
                "魔化": { desc: "光环：PVE附加伤害+100000" }
            },
            "霸王": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害，且附带范围溅射\n初始被动 战车生命每-1%，则霸王自身攻击+6%、攻速+6%\n满星被动 战车生命每-1%，则霸王自身攻击+8%、攻速+8%" },
                "龙的传人·霸王": { desc: "额外被动：战车生命每-1%，自身命中+0.8%，且刷新概率提高30%" },
                "奥特曼赛文·霸王": { desc: "额外被动：战车生命每-1%，则战车伤害减免+0.6%" },
                "银河之光·霸王": { desc: "额外被动：战车生命每-1%，则战车伤害减免+0.6%" },
                "龙年·霸王": { desc: "额外被动：战车生命每-1%，则自身伤害加成+0.8%" },
                "李寻欢·霸王": { desc: "额外被动：战车生命每-1%，则自身吸血+0.8%，且己方上阵小李飞刀时伤害加成+50%" },
                "唐伯虎·霸王": { desc: "额外被动：攻击附带目标3%生命上限伤害" },
                "常威·霸王": { desc: "额外被动：初始上阵时自动升为蓝星，且刷新概率提高30%" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "亡将": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害\n初始被动 吸血+20%，自身吸血+200%\n满星被动 吸血+30%，自身吸血+200%" },
                "法海·亡将": { desc: "额外被动：全体反伤减免+20%，被控-50%" },
                "番僧·亡将": { desc: "额外被动：全体反伤减免+20%，被控-50%" },
                "魔化": { desc: "光环：PVE附加伤害+100000" }
            },
            "铁骑": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害\n初始被动 上阵3战士时，全体攻击+3000，且免疫控制\n满星被动 上阵5战士时，全体攻击+12000，且敌方纯粹减免-60%" },
                "银河之光·铁骑": { desc: "额外被动：上阵3战士时，战车免疫持续伤害、诅咒、减(攻)速效果" },
                "大娃·铁骑": { desc: "额外被动：上阵3战士时，战车反伤减免+40%" },
                "花无缺·铁骑": { desc: "额外被动：上阵5战士时，全体PVE战斗中无视冰盾效果" },
                "林冲·铁骑": { desc: "额外被动：上阵3战士时，全体攻击+3000" },
                "祝枝山·铁骑": { desc: "额外被动：己方击杀目标时，额外获得当前上阵战士数量的银币" },
                "方唐镜·铁骑": { desc: "额外被动：上阵5战士时，全体PVE战斗中无视冰盾效果" },
                "嵩山掌门·铁骑": { desc: "额外被动：每上阵1个战士，所有战士PVE附加伤害+40000" },
                "魔化": { desc: "光环：附加伤害加成+30%" }
            },
            "石头": {
                "默认": { desc: "技能:对地面目标造成200%攻击伤害，且附带击退效果\n初始被动 光环：敌方纯粹减免-35%\n满星被动 光环：敌方纯粹减免-50%" },
                "石狮子·石头": { desc: "额外被动：光环：敌方纯粹减免-25%" },
                "魔化": { desc: "无" }
            },
            "小丑": {
                "默认": { desc: "技能:对单个目标造成300%攻击伤害\n初始被动 80%几率将对方施放的精灵变成绚烂的烟花\n满星被动 自身攻击+800%" },
                "虚空兽·小丑": { desc: "额外被动：每次变出烟花时，为己方战车回复生命上限35%的生命" },
                "川谱·白·小丑": { desc: "额外被动：变出烟花时，随机打出1-5筒麻将，对敌方战车造成点数*10%当前生命伤害" },
                "川谱·金·小丑": { desc: "额外被动：变出烟花时，随机打出1-9筒麻将，对敌方战车造成点数*10%当前生命伤害" },
                "如花·小丑": { desc: "额外被动：复制敌方战车使用的精灵（按自身精灵效果复制）" },
                "魔化": { desc: "无" }
            },
            "女王": {
                "默认": { desc: "技能:对全屏目标造成100%攻击伤害，且附带击退效果\n初始被动 不触发职业被动时，全体暴击+100%、暴伤+100%\n满星被动 不触发职业被动时，全体暴击+100%、暴伤+1500%" },
                "冰雪·女王": { desc: "额外被动：光环：暴击+25%" },
                "虚空兽·女王": { desc: "额外被动：战斗开始时必定出现在初始卡牌中" },
                "白娘子·女王": { desc: "额外被动：满星后，所在战车的同层英雄基础攻速+100%" },
                "潘金莲·女王": { desc: "额外被动：满星后，所在战车的同层英雄基础攻速+100%" },
                "如烟·女王": { desc: "额外被动：满星后，所在战车的同层英雄基础攻速+100%" },
                "任盈盈·女王": { desc: "额外被动：满星后，所在战车的同层英雄连击+1（仅对连击英雄有效）" },
                "魔化": { desc: "光环：不触发职业被动时，全体附加伤害加成+100%" }
            },
            "沙皇": {
                "默认": { desc: "技能:对全屏目标造成750%攻击伤害\n初始被动 不触发职业被动时，全体伤害转为40%的真实伤害\n满星被动 不触发职业被动时，全体伤害转为120%真实伤害，真实伤害加成+20%" },
                "小青·沙皇": { desc: "额外被动：不触发职业被动时，全体暴击+25%" },
                "青蛇·沙皇": { desc: "额外被动：不触发职业被动时，全体暴击+25%，且PVE战斗中无视冰盾效果" },
                "西门庆·沙皇": { desc: "额外被动：不触发职业被动时，全体暴击+25%，且PVE战斗中无视冰盾效果" },
                "包有为·沙皇": { desc: "额外被动：不触发职业被动时，全体附加伤害+50%，且PVE战斗中无视冰盾效果" },
                "魔化": { desc: "光环：不触发职业被动时，全体伤害减免+25%，且真实伤害加成+10%" }
            },
            "飞机": {
                "默认": { desc: "技能:对大范围目标造成130%攻击伤害\n初始被动 每1银币攻击+7\n满星被动 每1银币攻击+100" },
                "UFO·飞机": { desc: "额外被动：每100银币攻速+1.5%" },
                "深海魔鬼·飞机": { desc: "额外被动：每100银币攻速+1.5%，且PVE附加伤害+80000" },
                "魔化": { desc: "光环：自身基础攻速+80%" }
            },
            "炎魔": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害，且点燃目标(每秒造成2%生命上限伤害，持续6秒)\n初始被动 光环：敌方魔抗-40%\n满星被动 光环：敌方魔抗-60%" },
                "冰霜·炎魔": { desc: "额外被动：光环：敌方魔抗-20%" },
                "向左使·炎魔": { desc: "技能强化：点燃目标时，点燃持续伤害翻倍" },
                "魔化": { desc: "光环：敌方魔抗-20%" }
            },
            "蛇女": {
                "默认": { desc: "技能:对最多5个目标造成200%攻击伤害\n初始被动 攻击减速/中毒目标必暴，有25%几率提高全体猎人50%命中，持续3秒\n满星被动 攻击减速/中毒目标必暴，有50%几率提高全体猎人80%命中，持续3秒" },
                "丝西娜·蛇女": { desc: "额外被动：自身暴击+75%" },
                "蛇精·蛇女": { desc: "额外被动：满星后，所在战车的同层英雄基础攻速-0.7秒" },
                "春三十娘·蛇女": { desc: "额外被动：满星后，所在战车的同层英雄基础攻速-0.7秒" },
                "玉罗刹·蛇女": { desc: "额外被动：满星后，所在战车的同层英雄基础攻速-0.7秒" },
                "魔化": { desc: "光环：皮肤效果额外作用于自身正下方英雄" }
            },
            "虎弓": {
                "默认": { desc: "技能:对最多5个目标造成100%攻击伤害\n初始被动 攻击同一个目标时，伤害递增(1+12%*猎人数量)倍\n满星被动 攻击同一个目标时，伤害递增(1+20%*猎人数量)倍" },
                "黑小虎·虎弓": { desc: "额外被动：自身攻击+999" },
                "嫦娥·虎弓": { desc: "额外被动：满星后，全体攻速+30%" },
                "月神·虎弓": { desc: "额外被动：满星后，全体攻速+60%" },
                "小乔·虎弓": { desc: "额外被动：自身PVE附加伤害+320000" },
                "风暴·虎弓": { desc: "额外被动：基础攻速+25%" },
                "东方不败·虎弓": { desc: "技能强化：攻击不再分裂，变为对目标造成2连击" },
                "魔化": { desc: "光环：攻击不再分裂，变为对目标造成2连击(如已有连击效果则变为连击次数+1)，且附带溅射效果" }
            },
            "后羿": {
                "默认": { desc: "技能:对最多5个目标造成100%攻击伤害\n初始被动 攻击有30%几率提高全体猎人500%攻速，持续1秒\n满星被动 攻击有35%几率提高全体猎人500%攻速，持续1秒" },
                "阿育娅·后羿": { desc: "额外被动：触发攻速增益期间全体猎人伤害加成+50%" },
                "仙·后羿": { desc: "被动强化：被动触发时猎人攻速增益提升至600%" },
                "真仙·后羿": { desc: "被动强化：被动触发时猎人攻速增益提升至750%" },
                "太平乐·后羿": { desc: "额外被动：自身提高猎人500%攻速的触发几率翻倍" },
                "魔化": { desc: "光环：触发攻速增益期间全体猎人PVE附加伤害+200000" }
            },
            "海妖": {
                "默认": { desc: "技能:对全屏目标造成100%攻击伤害，且附带打断和眩晕(持续2秒)\n初始被动 光环：魔抗+25\n满星被动 光环：魔抗+45" },
                "巨灵神·海妖": { desc: "额外被动：光环：魔抗+20%" },
                "魔化": { desc: "光环：魔抗+20%" }
            },
            "骨弓": {
                "默认": { desc: "技能:对最多5个目标造成100%攻击伤害，且使目标护甲-30，持续6秒\n初始被动 上阵3猎人时，全体攻击+150%，魔抗+15\n满星被动 上阵5猎人时，全体攻击+225%，且敌方护甲-45" },
                "冰雪·骨弓": { desc: "额外被动：上阵5猎人时，全体PVE战斗中无视冰盾效果" },
                "花荣·骨弓": { desc: "额外被动：光环：攻击+30%" },
                "文徽明·骨弓": { desc: "额外被动：光环：附加伤害加成+30%" },
                "魔化": { desc: "光环：全体攻击+60%，且魔抗+10%" }
            },
            "鲛女": {
                "默认": { desc: "技能:回复500%攻击生命，并附带鼓舞效果，持续6秒\n初始被动 鼓舞所在战车攻击最高的英雄，使其攻击+4000\n满星被动 鼓舞所在战车攻击最高的英雄，使其攻击+7500" },
                "蓝兔·鲛女": { desc: "额外被动：敌方暴击-25%" },
                "碧莲·鲛女": { desc: "额外被动：己方所有牧师攻速+100%" },
                "李师师·鲛女": { desc: "额外被动：己方所有牧师攻速+100%" },
                "岳灵珊·鲛女": { desc: "额外被动：己方所有牧师攻速+100%，与林平之出战时，魔化·林平之·战将连击+1" },
                "魔化": { desc: "额外使被鼓舞的英雄PVE附加伤害+240000" }
            },
            "巫医": {
                "默认": { desc: "技能:回复200%攻击生命\n初始被动 上阵3牧师时，战车和小兵反弹35%伤害\n满星被动 上阵5牧师时，战车和小兵反弹40%伤害，且牧师治疗效果+90%" },
                "七娃·巫医": { desc: "额外被动：战车和小兵反弹10%伤害" },
                "柴进·巫医": { desc: "额外被动：战车和小兵反弹10%伤害" },
                "夏香·巫医": { desc: "额外被动：战车和小兵反弹10%伤害" },
                "深海刺豚·巫医": { desc: "额外被动：上阵5牧师时，全体PVE战斗中无视冰盾效果" },
                "衡山掌门·巫医": { desc: "额外被动：己方每上阵一个牧师，全体真实伤害加成+5%" },
                "魔化": { desc: "光环：附加伤害加成+30%" }
            },
            "影": {
                "默认": { desc: "技能:随机复制对方英雄技能\n初始被动 影复制的技能造成的伤害和治疗 x4\n满星被动 影复制的技能造成的伤害和治疗 x8" },
                "知世郎·影": { desc: "额外被动：每复制1次技能自身攻速+2%" },
                "太上老君·影": { desc: "额外被动：每复制1次技能自身攻速+2%" },
                "魔化": { desc: "每复制1次技能自身伤害加成+0.1%" }
            },
            "魇": {
                "默认": { desc: "技能:对范围目标造成200%攻击伤害\n初始被动 战车每次触发闪避时，攻击+3000；诅咒敌方战车\n满星被动 战车每次触发闪避时，攻速+15%；诅咒敌方战车" },
                "虚空兽·魇": { desc: "额外被动：基础攻速+20%" },
                "牛魔王·魇": { desc: "额外被动：战车每次触发闪避时，自身伤害加成+0.2%" },
                "高俅·魇": { desc: "额外被动：战车每次触发闪避时，自身伤害加成+0.2%" },
                "曹操·魇": { desc: "额外被动：战斗开始时必定出现在初始卡牌中" },
                "雷豹·魇": { desc: "额外被动：自身无视冰甲+50%" },
                "魔教教主·魇": { desc: "额外被动：自身吸血+50%" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "葵": {
                "默认": { desc: "技能:对最多3个目标造成200%攻击伤害\n初始被动 每2秒获得术士数量*2的银币，每上阵1个术士，所有术士暴击+15%\n满星被动 每2秒获得术士数量*4.5的银币，每上阵1个术士，所有术士暴击+15%" },
                "冰雪·葵": { desc: "额外被动：每上阵1个术士，战车伤害减免+5%" },
                "深海公主·葵": { desc: "额外被动：战斗中，同时视为术士和牧师职业" },
                "莫再提·葵": { desc: "技能强化：每次攻击后使所在战车攻击最高的英雄连击次数+1(仅对连击英雄有效，且优先连击英雄)，持续6秒" },
                "魔化": { desc: "每上阵1个术士，所有术士附加伤害加成+20%" }
            },
            "傀": {
                "默认": { desc: "技能:对最多3个目标造成200%攻击伤害，且附带减疗效果(治疗效果-100%)\n初始被动 每5秒对己方战车造成3%当前生命伤害，此伤害可被闪避（唯一）\n满星被动 战车每次闪避后回复生命上限4.5%的生命" },
                "蜈蚣精·傀": { desc: "技能强化：技能伤害降低为100%攻击，范围提升至全屏" },
                "铁扇公主·傀": { desc: "额外被动：战斗中，同时视为术士和法师职业，且对战车伤害间隔-1秒" },
                "左慈·傀": { desc: "技能强化：技能伤害降低为100%攻击，范围提升至全屏" },
                "石榴姐·傀": { desc: "额外被动：对自身造成伤害-80%，且间隔-2秒" },
                "李公公·傀": { desc: "额外被动：自身PVE附加伤害+320000" },
                "魔化": { desc: "每上阵1个术士，所有术士PVE附加伤害+40000" }
            },
            "邪": {
                "默认": { desc: "技能:对全屏目标造成100%攻击伤害\n初始被动 己方其他英雄星级每+1，则自身攻击+3000\n满星被动 己方其他英雄星级每+1，则自身攻速+40%" },
                "蝎子精·邪": { desc: "额外被动：自身伤害加成+30%" },
                "西门吹雪·邪": { desc: "额外被动：满星后，自身基础攻速+80%" },
                "夺命书生·邪": { desc: "额外被动：战车每次触发闪避时，自身攻击+8%" },
                "魔化": { desc: "自身技能百分比变为250%攻击伤害" }
            },
            "大圣": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害\n初始被动 上阵时，立即获得所在战车同层英雄100%攻击\n满星被动 满星时，攻速立刻变为所在战车同层英雄50%攻速" },
                "美猴王·大圣": { desc: "额外被动：伤害加成+20%" },
                "齐天·大圣": { desc: "额外被动：伤害加成+25%，且所在战车的同层英雄伤害加成+25%" },
                "至尊宝·大圣": { desc: "额外被动：满星后，技能范围变为全屏且攻击+60%，己方上阵紫霞仙子时攻击额外+20%" },
                "太平乐·大圣": { desc: "技能强化：自身连击次数+1" },
                "魔化": { desc: "光环：攻击+120%" }
            },
            "闪": {
                "默认": { desc: "技能:对范围目标造成200%攻击伤害\n初始被动 上阵3术士时，战车闪避+30%，术士攻速+150%\n满星被动 上阵5术士时，战车闪避+40%，术士攻速+225%" },
                "隐身娃·闪": { desc: "额外被动：光环：闪避+10%" },
                "菩提老祖·闪": { desc: "额外被动：上阵5术士时，全体PVE战斗中无视冰盾效果" },
                "呼延灼·闪": { desc: "额外被动：上阵5术士时，全体PVE战斗中无视冰盾效果" },
                "冬香·闪": { desc: "额外被动：光环：闪避+10%" },
                "莫再讲·闪": { desc: "额外被动：上阵5术士时，全体PVE战斗中无视冰盾效果" },
                "魔化": { desc: "光环：真实伤害加成+30%" }
            },
            "土灵": {
                "默认": { desc: "技能:对地面目标造成200%攻击伤害，且附带击退效果\n初始被动 光环：元素减免+30%，每上阵1个熊猫战车元素减免+5%(唯一)\n满星被动 光环：元素减免+60%，每上阵1个熊猫战车元素减免+5%(唯一)" },
                "武圣·土灵": { desc: "额外被动：光环：元素减免+10%" },
                "关羽·土灵": { desc: "额外被动：光环：元素减免+10%" },
                "太平乐·土灵": { desc: "额外被动：每上阵1个熊猫，所有熊猫PVE附加伤害+20000" },
                "魔化": { desc: "光环：生命+20%" }
            },
            "咬人娃娃": {
                "默认": { desc: "技能:吞噬目标，对战车附近单个目标造成4000%攻击伤害\n初始被动 吞噬目标为战车回复8%生命\n满星被动 自身攻速+100%" },
                "炼丹炉·咬人娃娃": { desc: "额外被动：吞噬成功获得10银币" },
                "触须·咬人娃娃": { desc: "额外被动：光环：魔抗+20，攻击+500" },
                "魔化": { desc: "无" }
            },
            "龙王": {
                "默认": { desc: "技能:召唤1朵雷云，雷云造成300%攻击魔法伤害(额外造成目标2%生命上限伤害)\n初始被动 光环：召唤物移速+80%，攻速+160%\n满星被动 光环：召唤物移速+120%，攻速+240%" },
                "杨广·龙王": { desc: "额外被动：召唤后赋予本次召唤的雷云无敌，持续3秒" },
                "太平乐·龙王": { desc: "技能强化：在远端召唤静止的祥云，且技能攻击范围+50%" },
                "玉帝·龙王": { desc: "额外被动：召唤后赋予本次召唤的雷云无敌，持续3秒" },
                "张角·龙王": { desc: "额外被动：满星后，自身召唤的雷云基础攻速+100%" },
                "魔化": { desc: "技能额外召唤1朵雷云" }
            },
            "钟馗": {
                "默认": { desc: "技能:召唤1只小鬼，小鬼造成100%攻击魔法伤害\n初始被动 光环：己方上阵幽灵和龙王时，召唤白无常攻击全屏(附带1.5%生命上限伤害)\n满星被动 光环：召唤物基础攻速+25%" },
                "智多星·吴用·钟馗": { desc: "额外被动：光环：元素减免+10%，召唤物基础攻速+25%" },
                "风暴·钟馗": { desc: "额外被动：光环：召唤物PVE附加伤害+160000" },
                "魔化": { desc: "光环：召唤物附加伤害+50%" }
            },
            "悟空": {
                "默认": { desc: "技能:20%概率召唤1个空投宝箱\n初始被动 上阵3召唤时，召唤攻速+150%\n满星被动 上阵5召唤时，召唤攻速+180%，且敌方攻击-35%" },
                "太平乐·悟空": { desc: "技能强化：成功召唤时有30%概率额外召唤1个空投宝箱" },
                "二娃·悟空": { desc: "技能强化：攻速提升至6秒/次" },
                "暗月·悟空": { desc: "额外被动：PVP技能额外在场中央召唤1只机械猴，且上阵5召唤时，全体PVE战斗中无视冰盾效果" },
                "魔化": { desc: "上阵5召唤时，召唤攻速+60%，且敌方攻击-10%" }
            },
            "冰骑": {
                "默认": { desc: "技能:召唤1只小骷髅，小骷髅造成100%攻击物理伤害\n初始被动 光环：纯粹减免+60%\n满星被动 光环：纯粹减免+80%" },
                "星陨·冰骑": { desc: "额外被动：光环：纯粹减免+10%" },
                "魔化": { desc: "光环：纯粹减免+10%" }
            },
            "恶魔": {
                "默认": { desc: "技能:召唤1只小恶魔，小恶魔造成100%攻击魔法伤害(附带50%暴击)\n初始被动 光环：暴伤+250%\n满星被动 光环：暴伤+500%" },
                "花满楼·恶魔": { desc: "额外被动：光环：命中+25%" },
                "魔化": { desc: "光环：暴击+50%" }
            },
            "幽灵": {
                "默认": { desc: "技能:在远处召唤1个鬼影，鬼影造成100%攻击物理伤害\n初始被动 每召唤一次，鬼影攻击+6%，生命+6%\n满星被动 每召唤一次，鬼影攻击+25%，生命+25%" },
                "二郎真君·幽灵": { desc: "技能强化：召唤哮天犬，技能转为魔法伤害，满星后哮天犬额外造成目标1%生命上限伤害" },
                "卢俊义·幽灵": { desc: "技能强化：召唤麒麟，技能转为魔法伤害，满星后麒麟额外造成目标1%生命上限伤害" },
                "魔化": { desc: "自身召唤的幽灵攻击变为对目标造成2连击" }
            },
            "神龙": {
                "默认": { desc: "技能:使用精灵时，有40%概率再次施放（无法被影复制）\n初始被动 成功使用精灵时，有5%概率召唤神龙(附带100%暴击)，造成真实伤害\n满星被动 成功使用精灵时，有25%概率召唤神龙(附带100%暴击)，造成真实伤害" },
                "烈焰·神龙": { desc: "额外被动：可召唤烈焰神龙，攻击点燃目标(每秒造成3%生命上限真实伤害，持续10秒)" },
                "武状元·神龙": { desc: "额外被动：触发自身技能效果再次施放精灵时，有相同概率再次施放" },
                "魔化": { desc: "自身召唤神龙概率+10%" }
            },
            "骨龙": {
                "默认": { desc: "技能:召唤1只幼龙，幼龙造成200%攻击魔法伤害(附带30%减速效果、50%暴击)\n初始被动 光环：召唤物攻击+120%\n满星被动 光环：召唤物攻击+240%" },
                "魔化": { desc: "无" }
            },
            "祭司": {
                "默认": { desc: "技能:召唤1个小树人，小树人造成100%攻击物理伤害(附带50%暴击)\n初始被动 光环：召唤物生命+60%\n满星被动 光环：召唤物生命+180%" },
                "魔化": { desc: "无" }
            },
            "小炮": {
                "默认": { desc: "技能:对目标造成100%攻击伤害\n初始被动 攻击额外造成4%自身战车生命上限伤害\n满星被动 每上阵1个猎人，所有猎人攻速+40%" },
                "司令官·小炮": { desc: "额外被动：自身造成的伤害无视敌方护甲" },
                "风暴·小炮": { desc: "额外被动：攻击必定命中" },
                "水师提督·小炮": { desc: "额外被动：满星后，自身连击次数+1" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "爱神": {
                "默认": { desc: "技能:对最多5个目标造成100%攻击伤害\n初始被动 光环：敌方护甲-60%，自身攻击后回复战车2%生命\n满星被动 光环：敌方护甲-60%，自身攻击后回复战车4.5%生命" },
                "燕青·爱神": { desc: "技能强化：技能额外附带治疗效果-180%" },
                "永恒之心·爱神": { desc: "额外被动：光环：敌方护甲-40%" },
                "魔化": { desc: "每次攻击后使所在战车攻击最高的英雄连击次数+1(仅对连击英雄有效，且优先连击英雄)，持续6秒" }
            },
            "船长": {
                "默认": { desc: "技能:对最多5个目标造成100%攻击伤害\n初始被动 攻击有25%几率使全体猎人攻击+3000，持续4秒；诅咒敌方战车\n满星被动 攻击有50%几率使全体猎人攻击+6000，持续4秒；诅咒敌方战车" },
                "幽冥·船长": { desc: "额外被动：攻击有5%概率召唤幽灵船，对全屏目标造成2000%伤害" },
                "对穿肠·船长": { desc: "额外被动：自身诅咒伤害+60%" },
                "刑部尚书·船长": { desc: "额外被动：每上阵1个猎人，所有猎人PVE附加伤害+40000" },
                "魔化": { desc: "触发攻击增益期间全体猎人附加伤害加成+100%" }
            },
            "毒王": {
                "默认": { desc: "技能:对全屏目标造成100%攻击伤害，附带中毒效果(每秒造成100伤害，持续6秒)\n初始被动 吞噬全场被出售的卡牌，且攻击+2500\n满星被动 吞噬全场被出售的卡牌，且攻击+5000" },
                "谛听·毒王": { desc: "额外被动：基础攻速+25%" },
                "叶孤城·毒王": { desc: "额外被动：基础攻速+25%" },
                "杨志·毒王": { desc: "额外被动：满星后，额外吞噬自身击杀的目标" },
                "魔化": { desc: "攻击额外造成一次伤害" }
            },
            "炸弹": {
                "默认": { desc: "技能:对全屏目标造成150%攻击伤害\n初始被动 自身升星成功概率-20%\n满星被动 攻击+99999" },
                "魔化": { desc: "无" }
            },
            "火枪": {
                "默认": { desc: "技能:对单个目标造成200%攻击伤害\n初始被动 攻击造成目标6%生命上限伤害\n满星被动 攻击造成目标12%生命上限伤害" },
                "吉利服·火枪": { desc: "额外被动：满星后，自身基础攻速+60%" },
                "魔化": { desc: "无" }
            },
            "松鼠": {
                "默认": { desc: "技能:对5个目标造成100%攻击伤害，附带中毒效果(每秒造成100伤害，持续6秒)\n初始被动 击杀额外获得60%银币\n满星被动 击杀额外获得180%银币" },
                "兔宝宝·松鼠": { desc: "额外被动：每击杀1个目标自身攻击+200" },
                "魔化": { desc: "无" }
            },
            "绿弓": {
                "默认": { desc: "技能:对最多5个目标造成130%攻击伤害\n初始被动 光环：攻速+60%\n满星被动 光环：攻速+90%" },
                "万圣猎手·绿弓": { desc: "额外被动：光环：攻速+30%" },
                "魔化": { desc: "无" }
            },
            "蜘蛛": {
                "默认": { desc: "技能:对范围目标造成1300%攻击伤害\n初始被动 光环：敌方攻速-30%\n满星被动 光环：敌方攻速-60%" },
                "魔化": { desc: "无" }
            },
            "冰弓": {
                "默认": { desc: "技能:对最多5个目标造成100%攻击伤害，且附带50%减速效果\n初始被动 光环：攻击+150\n满星被动 光环：攻击+1500" },
                "雪莲·冰弓": { desc: "额外被动：光环：PVE附加伤害+40000" },
                "魔化": { desc: "无" }
            },
            "小鹿": {
                "默认": { desc: "技能:回复200%攻击生命\n初始被动 出售获得60银币\n满星被动 出售获得320银币" },
                "千年蟠桃·小鹿": { desc: "额外被动：出售回复战车生命上限25%的生命" },
                "蟠桃·小鹿": { desc: "额外被动：出售回复战车生命上限15%的生命" },
                "魔化": { desc: "无" }
            },
            "大树": {
                "默认": { desc: "技能:回复300%攻击生命\n初始被动 战车和小兵反弹15%伤害\n满星被动 战车和小兵反弹25%伤害" },
                "魔化": { desc: "无" }
            },
            "猫咪": {
                "默认": { desc: "技能:回复200%攻击生命，附带战车受治疗效果+50%\n初始被动 光环：命中+35%\n满星被动 光环：命中+50%" },
                "招财·猫咪": { desc: "额外被动：光环：命中+10%，且每2秒获得1银币" },
                "暗月·猫咪": { desc: "额外被动：光环：命中+10%，且战车受治疗效果+25%" },
                "魔化": { desc: "光环：命中+10%" }
            },
            "萨满": {
                "默认": { desc: "技能:回复200%攻击生命\n初始被动 光环：伤害加成+50%，攻击+1000\n满星被动 光环：伤害加成+80%，攻击+1000" },
                "鸦人·萨满": { desc: "额外被动：光环：伤害加成+15%" },
                "青城掌门·萨满": { desc: "额外被动：光环：真实伤害加成+10%" },
                "魔化": { desc: "光环：暴击+50%" }
            },
            "地精": {
                "默认": { desc: "技能:回复100%攻击生命\n初始被动 每当对手或队友获得银币时，地精获得40%收益\n满星被动 每当对手或队友获得银币时，地精获得60%收益" },
                "暗月财阀·地精": { desc: "额外被动：对手或队友获得银币时额外获得10%收益，且暗月岛中将己方全体视为哥布林" },
                "魔化": { desc: "无" }
            },
            "工匠": {
                "默认": { desc: "技能:回复200%攻击生命\n初始被动 光环：敌方暴击-65%，暴伤-200%\n满星被动 光环：敌方暴击-100%，暴伤-200%" },
                "医疗机甲·工匠": { desc: "额外被动：光环：敌方暴击-20%" },
                "包婆婆·工匠": { desc: "额外被动：满星后，己方邪能火炮攻速+300%" },
                "魔化": { desc: "光环：敌方暴击-50%" }
            },
            "火法": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害，且附带点燃效果(每秒造成400伤害，持续6秒)\n初始被动 光环：敌方魔抗-9\n满星被动 光环：敌方魔抗-25%" },
                "魔化": { desc: "无" }
            },
            "暗法": {
                "默认": { desc: "技能:对范围目标造成130%攻击伤害\n初始被动 对点燃目标必暴，且初始攻击+2500\n满星被动 攻击+250%" },
                "魔化": { desc: "无" }
            },
            "冰法": {
                "默认": { desc: "技能:对范围目标造成100%攻击伤害，且附带20%减速效果\n初始被动 每秒获得2银币，出售获得40银币\n满星被动 每秒获得3银币" },
                "圣诞女郎·冰法": { desc: "额外被动：每秒获得1银币" },
                "风暴·冰法": { desc: "额外被动：每次售卖额外获得10银币" },
                "魔化": { desc: "无" }
            },
            "凤凰": {
                "默认": { desc: "技能:蛋形态无法主动攻击，凤凰形态对范围目标造成100%攻击伤害\n初始被动 上阵时为蛋形态，每秒攻击+18%、攻速+8%，无法攻击\n满星被动 破壳变为凤凰形态，可攻击敌人但不再成长属性" },
                "陆小凤·凤凰": { desc: "额外被动：破壳时保护战车，使战车无敌6秒（每场战斗只能触发一次）" },
                "周瑜·凤凰": { desc: "额外被动：满星后，继续属性成长" },
                "五毒教主·凤凰": { desc: "额外被动：破壳时保护战车，使战车无敌6秒（每场战斗只能触发一次）" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "火神": {
                "默认": { desc: "技能:对全屏目标造成200%攻击伤害，且附带点燃效果(每秒造成500伤害，持续6秒)\n初始被动 对点燃目标造成6倍伤害\n满星被动 对点燃目标造成12倍伤害" },
                "王子·火神": { desc: "额外被动：自身暴伤+100%，且被动不再需要点燃效果触发" },
                "魔化": { desc: "无" }
            },
            "阿翼": {
                "默认": { desc: "技能:冲力射球，对全屏目标造成100%攻击伤害\n初始被动 场上每存活1个敌方目标，攻击+2000；每击杀1个目标攻击+10%\n满星被动 场上每存活1个敌方目标，攻击+6000；每击杀1个目标攻击+10%" },
                "哪吒·阿翼": { desc: "额外被动：每击杀1个目标自身攻速+3%" },
                "魔化": { desc: "无" }
            },
            "龟相": {
                "默认": { desc: "技能:对范围目标造成375%攻击伤害\n初始被动 每次攻击后增加自身4%攻速\n满星被动 自身攻击+300%" },
                "海象人·龟相": { desc: "额外被动：战斗中，自身职业替换为猎人" },
                "龙宫·龟相": { desc: "额外被动：自身攻击+1500" },
                "东海龙宫·龟相": { desc: "额外被动：满星后，自身伤害加成+80%" },
                "包龙星·龟相": { desc: "额外被动：自身PVE附加伤害+320000，己方上阵包有为时附加伤害额外+320000" },
                "魔化": { desc: "攻击变为对目标造成2连击" }
            },
            "谜云": {
                "默认": { desc: "技能:对范围目标造成200%攻击伤害，且附带减疗效果(治疗效果-50%)\n初始被动 己方其他英雄星级每+1，则谜云自身攻击+40%\n满星被动 己方其他英雄星级每+1，则谜云自身攻击+120%" },
                "黑山老妖·谜云": { desc: "技能强化：技能攻击范围扩大至全屏，且使目标伤害减免-20%，持续10秒" },
                "魔化": { desc: "无" }
            },
            "雷神": {
                "默认": { desc: "技能:对全屏目标造成100%攻击伤害，且附带打断和短暂眩晕\n初始被动 提高0.6%战车生命上限攻击\n满星被动 提高3%战车生命上限攻击" },
                "科学怪人·雷神": { desc: "额外被动：光环：敌方魔抗-20%，敌方魔抗-10" },
                "钢铁·雷神": { desc: "额外被动：光环：生命+15%" },
                "暗月·雷神": { desc: "额外被动：光环：生命+15%，且自身伤害类型转化为真实伤害" },
                "华太师·雷神": { desc: "额外被动：自身造成的伤害无视敌方魔抗" },
                "深海科学家·雷神": { desc: "额外被动：战斗中，同时视为法师和牧师职业" },
                "魔化": { desc: "每次攻击后增加自身10%攻速" }
            },
            "女妖": {
                "默认": { desc: "技能:对全屏目标造成100%攻击伤害，且附带禁疗效果(无法获得治疗)\n初始被动 每上阵1个法师，所有法师吸血+2%\n满星被动 每上阵1个法师，所有法师吸血+4%" },
                "白晶晶·女妖": { desc: "技能强化：使目标伤害减免-30%，持续10秒" },
                "深海幽影·女妖": { desc: "额外被动：光环：敌方牧师英雄攻击-60%" },
                "魔化": { desc: "无" }
            },
            "神龛": {
                "默认": { desc: "技能:对单个目标造成130%攻击伤害\n初始被动 战车生命每-1%，则神龛自身攻击+50\n满星被动 战车生命每-1%，则神龛自身攻击+150" },
                "魔化": { desc: "无" }
            },
            "刺客": {
                "默认": { desc: "技能:对单个目标造成130%攻击伤害\n初始被动 暴击+40%，且初始攻击+1500\n满星被动 暴伤+250%" },
                "魔化": { desc: "无" }
            },
            "钢鬃": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害，且附带流血(每秒造成1%生命上限伤害，持续6秒)\n初始被动 光环：护甲+25，每上阵1个战士护甲+5\n满星被动 光环：护甲+45，每上阵1个战士护甲+5" },
                "冰雪·钢鬃": { desc: "额外被动：光环：护甲+10" },
                "天蓬元帅·钢鬃": { desc: "额外被动：光环：护甲+20%" },
                "魔化": { desc: "光环：护甲+20%" }
            },
            "恶匪": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害\n满星被动 战车伤害减免+10%，且战车生命每-1%，则战车伤害减免+0.9%" },
                "金钱法王·恶匪": { desc: "额外被动：战车伤害减免+10%" },
                "魔化": { desc: "无" }
            },
            "斧客": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害，且附带减疗效果(治疗效果-90%)\n初始被动 目标生命每-1%，则斧客自身攻击+8%\n满星被动 目标生命每-1%，则斧客自身攻击+20%" },
                "卷帘大将·斧客": { desc: "技能强化：技能额外附带治疗效果-90%" },
                "魔化": { desc: "无" }
            },
            "剑客": {
                "默认": { desc: "技能:对地空目标造成300%攻击伤害\n初始被动 击杀目标额外获得4银币\n满星被动 击杀目标额外获得8银币" },
                "竖·剑客": { desc: "额外被动：自身攻击+500，且击杀额外获得35%银币" },
                "小白龙·剑客": { desc: "额外被动：己方上阵唐三藏、卷帘大将、天蓬元帅皮肤和大圣时，如来佛祖每秒对全场造成5%生命纯粹伤害" },
                "魔化": { desc: "自身基础攻速+100%" }
            },
            "龙拳": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害\n初始被动 己方上阵霸王和狂龙时，技能变为升龙拳每5秒对全屏造成2000%伤害\n满星被动 自身生命每-1%，攻速+6%；目标生命每-1%，攻击+4%" },
                "银河之光·龙拳": { desc: "额外被动：己方上阵霸王和狂龙时，攻击有5%概率施放机甲合体技对全屏造成巨量伤害" },
                "鲁智深·龙拳": { desc: "额外被动：每击杀一个目标自身伤害加成+2%" },
                "鬼脚七·龙拳": { desc: "技能强化：己方上阵霸王和狂龙时，释放技能有50%概率降低对方英雄星级，对1星和满星英雄无效" },
                "魔化": { desc: "无" }
            },
            "狂将": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害，且使目标纯粹免伤-40%（同时适用于回旋斧）\n初始被动 每上阵1个战士，所有战士暴击+20%\n满星被动 技能切换为回旋斧，暴伤+200%，且每4秒对全屏造成600%攻击伤害" },
                "黑旋风·狂将": { desc: "额外被动：每上阵1个战士，所有战士伤害加成+15%" },
                "李逵·狂将": { desc: "额外被动：每上阵1个战士，所有战士伤害加成+15%" },
                "魔化": { desc: "无" }
            },
            "孤星": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害，有30%概率散射（额外攻击最多4个目标）\n初始被动 敌方战车每上阵1个英雄，攻击+70%；每击杀1个目标攻击+300\n满星被动 敌方战车每上阵1个英雄，攻击+210%；每击杀1个目标攻击+300" },
                "和伊玄·孤星": { desc: "额外被动：敌方战车每上阵一个英雄，自身攻速+20%" },
                "魔化": { desc: "无" }
            },
            "领主": {
                "默认": { desc: "技能:对敌方战车造成300%攻击伤害，且附带诅咒和减疗效果(治疗效果-100%)\n初始被动 诅咒效果每秒造成目标0.6%生命上限伤害，并使装备失效\n满星被动 诅咒效果每秒造成目标1.8%生命上限伤害，并使装备失效" },
                "宁王·领主": { desc: "额外被动：光环：敌方基础攻速+1秒" },
                "深海典狱长·领主": { desc: "额外被动：满星后，全体PVP战斗中无视冰盾效果" },
                "魔化": { desc: "无" }
            },
            "狂龙": {
                "默认": { desc: "技能:对单个目标造成100%攻击伤害\n初始被动 受到攻击时，以狂龙之息化为冰盾护佑战车无敌，持续0.3秒\n满星被动 技能切换为多杀技，每6秒对全屏造成1000%攻击伤害，自身获得斩杀效果" },
                "奥特曼艾斯·狂龙": { desc: "额外被动：满星后，自身伤害加成+80%" },
                "银河之光·狂龙": { desc: "额外被动：满星后，自身伤害加成+80%" },
                "秦明·狂龙": { desc: "额外被动：触发无敌期间，每次被击回复战车生命上限1.5%的生命" },
                "唐天豪·狂龙": { desc: "额外被动：触发无敌期间，每次被击回复战车生命上限1.5%的生命" },
                "魔化": { desc: "受到攻击时，狂龙之息的无敌时间翻倍" }
            },
            "土精灵": {
                "默认": { desc: "技能:70%概率升级战车\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "泰坦·土精灵": { desc: "技能强化：升级战车概率+5%" },
                "创世泰坦·土精灵": { desc: "技能强化：升级战车概率+10%" },
                "魔化": { desc: "无" }
            },
            "彩精灵": {
                "默认": { desc: "技能:随机施放一个精灵，精灵等级与彩精灵一致\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "魔化": { desc: "无" }
            },
            "魔精灵": {
                "默认": { desc: "技能:消耗战车25%当前生命，提高全体英雄225%攻速，持续6秒\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "黑葫芦·魔精灵": { desc: "技能强化：生效期间额外提高全体英雄25%攻速" },
                "星光宝盒·魔精灵": { desc: "技能强化：使用时消耗生命降低为12%当前生命" },
                "月光宝盒·魔精灵": { desc: "技能强化：使用时不再消耗生命" },
                "绝影·魔精灵": { desc: "技能强化：消耗战车50%当前生命，生效期间额外提高全体英雄50%伤害加成" },
                "魔化": { desc: "无" }
            },
            "木精灵": {
                "默认": { desc: "技能:回复战车生命上限34%的生命\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "仙葫芦·木精灵": { desc: "技能强化：生效时提高战车25%伤害减免，持续6秒" },
                "魔化": { desc: "无" }
            },
            "光精灵": {
                "默认": { desc: "技能:100%概率升星一个英雄，不受小丑影响\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "神葫芦·光精灵": { desc: "额外被动：被升星的英雄伤害加成+30%（此效果不可叠加）" },
                "传国玉玺·光精灵": { desc: "额外被动：被升星的英雄攻击+35%（此效果不可叠加）" },
                "狮王令牌·光精灵": { desc: "额外被动：被升星的英雄基础攻速-0.15秒（此效果不可叠加）" },
                "魔化": { desc: "无" }
            },
            "幻精灵": {
                "默认": { desc: "技能:100%概率改变双方装备类型\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "紫金铃铛·幻精灵": { desc: "额外被动：改变自身装备时，可将橙色品质装备强化为红色品质" },
                "孔明灯·幻精灵": { desc: "额外被动：改变自身装备时，可将橙色品质装备强化为红色品质" },
                "魔化": { desc: "无" }
            },
            "雷精灵": {
                "默认": { desc: "技能:召唤全屏闪电攻击敌方，造成目标35%当前生命伤害，且附带打断和短暂眩晕\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "电葫芦·雷精灵": { desc: "技能强化：降低目标25%伤害减免，持续6秒" },
                "太平符咒·雷精灵": { desc: "技能强化：技能附带禁疗效果（无法获得治疗），持续6秒" },
                "魔化": { desc: "无" }
            },
            "冰精灵": {
                "默认": { desc: "技能:冰冻己方英雄（除治疗英雄），使其无法攻击，持续3.2秒\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "雪莲·冰精灵": { desc: "额外被动：立即生效且不受小丑影响，冰冻期间战车护甲+20，魔抗+20" },
                "寒冰真气·冰精灵": { desc: "额外被动：立即生效且不受小丑影响，冰冻会作用于己方召唤物" },
                "魔化": { desc: "无" }
            },
            "暗精灵": {
                "默认": { desc: "技能:100%概率降低对方英雄星级，对1星和满星英雄无效\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "宝葫芦·暗精灵": { desc: "额外被动：被降低星级的英雄伤害加成-30%（此效果不可叠加）" },
                "魔化": { desc: "无" }
            },
            "魂精灵": {
                "默认": { desc: "技能:提高全体英雄90%吸血，持续7秒\n初始被动 使用立即生效，不占用上阵位置\n满星被动 无" },
                "还魂丹·魂精灵": { desc: "额外被动：立即生效，且吸血效果持续时间+4秒" },
                "魔化": { desc: "无" }
            },
            "冰鸟": {
                "默认": { desc: "技能:对范围目标造成200%伤害，且附带冻伤效果，持续6秒（可叠加60层）\n初始被动 冻伤效果每秒造成0.5%生命上限魔法伤害\n满星被动 每次攻击附带3层冻伤" },
                "魔化": { desc: "自身冻伤叠加上限+60层" }
            }
        };
        
        // 获取卡牌魔化状态
        function getCardMoHua(cardId, handType = 'my') {
            const key = `${handType}_${cardId}`;
            return cardMoHua[key] === true;
        }
        
        // 设置卡牌魔化状态
        function setCardMoHua(cardId, enabled, handType = 'my') {
            const key = `${handType}_${cardId}`;
            if (enabled) {
                cardMoHua[key] = true;
            } else {
                delete cardMoHua[key];
            }
            saveCardMoHua();
            if (typeof autoSaveProject === 'function') autoSaveProject();
        }
        
        // 保存魔化数据到localStorage
        function saveCardMoHua() {
            localStorage.setItem('tdjl_cardMoHua', JSON.stringify(cardMoHua));
        }
        
        // 加载魔化数据
        function loadCardMoHua() {
            const saved = localStorage.getItem('tdjl_cardMoHua');
            if (saved) {
                cardMoHua = JSON.parse(saved);
            }
        }
        
        // 获取卡牌当前皮肤
        function getCardSkin(cardId, cardName, handType = 'my') {
            const key = `${handType}_${cardId}`;
            // 1) 当前项目内手动设置的皮肤（最高优先级）
            if (cardSkins[key] !== undefined) {
                return cardSkins[key];
            }
            // 2) 全局默认皮肤（英雄级 cardId，跨项目/跨上阵记住；队友卡未单独设时自动同步）
            if (typeof defaultCardSkins !== 'undefined' && defaultCardSkins[cardId] !== undefined) {
                return defaultCardSkins[cardId];
            }
            // 3) 全局英雄级选择（右键 selectHeroSkin 设置）；不回退到这里切换皮肤会无效
            if (typeof window.heroSkinSelections !== 'undefined' && cardName) {
                const baseHero = (typeof getBaseHeroName === 'function') ? getBaseHeroName(cardName).heroName : cardName;
                if (window.heroSkinSelections[baseHero] !== undefined) {
                    return window.heroSkinSelections[baseHero];
                }
            }
            return "默认";
        }
        
        // 设置卡牌皮肤
        async function setCardSkin(cardId, skin, handType = 'my') {
            const key = `${handType}_${cardId}`;
            cardSkins[key] = skin;
            saveCardSkins();
            if (typeof persistProjectSkins === 'function') persistProjectSkins();

            // 同步刷新该卡牌所有相关位置（手牌 + 战斗槽）
            try {
                // 1. 刷新手牌中的卡牌皮肤
                const handContainerId = handType === 'my' ? 'myHandContainer' : 'teammateHandContainer';
                const handCard = document.querySelector(`#${handContainerId} .selected-card[data-id="${cardId}"]`);
                if (handCard) {
                    const cardName = handCard.dataset.name || '';
                    if (window.resolveHeroSkinUrl) {
                        const url = await window.resolveHeroSkinUrl(cardName, skin);
                        if (url) {
                            if (typeof applySkinBgToHandCard === 'function') applySkinBgToHandCard(handCard, url);
                        } else if (typeof removeSkinBgFromHandCard === 'function') {
                            removeSkinBgFromHandCard(handCard);
                        }
                    }
                }
                // 2. 刷新所有战斗槽里该卡牌的皮肤（我方+队友）—— 用已算好的 skin 直接重渲，与手牌对称
                document.querySelectorAll('.battle-slot.filled').forEach(async (slot) => {
                    if (slot.dataset.cardId !== cardId) return;
                    const slotCardName = getSlotCardName(slot)
                        || (handCard && handCard.dataset.name)
                        || '';
                    if (typeof applySkinBgToSlot === 'function') {
                        try { await applySkinBgToSlot(slot, slotCardName, undefined, undefined, skin); } catch (e) {}
                    }
                });
                // 3. ❌ 不刷新收藏区/卡池：项目内换皮只作用于卡槽+手牌，
                //    收藏区与卡池永远显示全局卡池皮（getPoolOnlySkin），不受当前项目影响。
            } catch (e) {
                console.warn('[SKIN] setCardSkin refresh error:', e);
            }
            // 换肤后刷新所有融合卡（主卡或被融合卡皮肤变化都要即时反映）
            if (typeof refreshAllFusionSkins === 'function') refreshAllFusionSkins();
        }

        // 设置副卡（被融合卡）皮肤：只写当前项目 fusionSkins，绝不污染全局 heroSkinSelections
        async function setFusionSkin(fusedHero, skin) {
            if (!fusedHero) return;
            if (typeof window.fusionSkins === 'undefined') window.fusionSkins = {};
            window.fusionSkins[fusedHero] = skin; // '' = 关闭副卡显示
            if (typeof persistFusionSkins === 'function') await persistFusionSkins();
        }
        // 立即把副卡皮肤偏好落盘到当前项目记录（与 persistProjectSkins 对称）
        async function persistFusionSkins() {
            if (typeof window.fusionSkins === 'undefined') window.fusionSkins = {};
            if (!db || !currentProjectName) return;
            try {
                await new Promise((resolve) => {
                    const t = db.transaction([STORE_NAME], 'readwrite');
                    const s = t.objectStore(STORE_NAME);
                    const req = s.get(currentProjectName);
                    req.onsuccess = () => {
                        const p = req.result;
                        if (p) { p.fusionSkins = window.fusionSkins; s.put(p); }
                        resolve();
                    };
                    req.onerror = () => resolve();
                    t.oncomplete = () => resolve();
                    t.onerror = () => resolve();
                });
                if (typeof persistProjectsToDisk === 'function') persistProjectsToDisk();
            } catch (e) { console.warn('[SKIN] persistFusionSkins failed:', e); }
        }
        
        // 保存皮肤数据到localStorage
        function saveCardSkins() {
            localStorage.setItem('tdjl_cardSkins', JSON.stringify(cardSkins));
        }
        
        // 加载皮肤数据
        function loadCardSkins() {
            const saved = localStorage.getItem('tdjl_cardSkins');
            if (saved) {
                cardSkins = JSON.parse(saved);
            }
        }
        // 保存全局默认皮肤到 localStorage
        function saveDefaultCardSkins() {
            localStorage.setItem('tdjl_defaultCardSkins', JSON.stringify(defaultCardSkins));
        }
        function loadDefaultCardSkins() {
            const saved = localStorage.getItem('tdjl_defaultCardSkins');
            if (saved) {
                try { defaultCardSkins = JSON.parse(saved); } catch (e) { defaultCardSkins = {}; }
            }
        }

        // 立即把皮肤偏好（cardSkins / cardMoHua）落盘到当前项目记录（仅更新皮肤字段，不连带存脏阵容）
        // 修复：之前 setCardSkin 只写 localStorage，加载项目时会被项目旧 cardSkins 覆盖并回写 → 皮肤丢失
        // 物化本项目皮肤为「自包含配置」：把继承全局默认皮的卡 / 融合副卡也显式写进本项目表，
        // 使备份 / 还原 / 分享只看本项目配置，还原后皮肤与备份时完全一致，不再依赖全局皮肤配置。
        function materializeProjectSkinConfig(project) {
            if (!project) return { cardSkins: {}, fusionSkins: {} };
            const cardOut = Object.assign({}, project.cardSkins || {});
            const resolveCard = function (cardId, cardName, handType) {
                const key = handType + '_' + cardId;
                if (cardOut[key] !== undefined) return cardOut[key];
                if (typeof defaultCardSkins !== 'undefined' && defaultCardSkins[cardId] !== undefined) return defaultCardSkins[cardId];
                if (typeof window.heroSkinSelections !== 'undefined' && cardName) {
                    const baseHero = (typeof getBaseHeroName === 'function') ? getBaseHeroName(cardName).heroName : cardName;
                    if (window.heroSkinSelections[baseHero] !== undefined) return window.heroSkinSelections[baseHero];
                }
                return '默认';
            };
            const fillCards = function (cards, handType) {
                if (!Array.isArray(cards)) return;
                cards.forEach(function (c) {
                    if (!c || !c.id) return;
                    const key = handType + '_' + c.id;
                    if (cardOut[key] === undefined) {
                        const eff = resolveCard(c.id, c.name, handType);
                        if (eff !== undefined && eff !== '默认') cardOut[key] = eff;
                    }
                });
            };
            fillCards(project.myHandCards, 'my');
            fillCards(project.teammateHandCards, 'teammate');
            fillCards(project.myPlacedCards, 'my');
            fillCards(project.teammatePlacedCards, 'teammate');

            const fusionOut = Object.assign({}, project.fusionSkins || {});
            const placed = [].concat(project.myPlacedCards || [], project.teammatePlacedCards || []);
            placed.forEach(function (c) {
                if (!c || !c.name) return;
                const parts = (typeof getFusionParts === 'function') ? getFusionParts(c.name) : null;
                if (!Array.isArray(parts) || parts.length < 2) return;
                parts.forEach(function (hero) {
                    if (fusionOut[hero] !== undefined) return;
                    const eff = (typeof getFusionComponentSkin === 'function') ? getFusionComponentSkin(hero) : undefined;
                    if (eff !== undefined && eff !== '默认') fusionOut[hero] = eff;
                });
            });
            return { cardSkins: cardOut, fusionSkins: fusionOut };
        }

        async function persistProjectSkins() {
            saveCardSkins();
            if (typeof saveCardMoHua === 'function') saveCardMoHua();
            if (!db || !currentProjectName) return;
            try {
                await new Promise((resolve) => {
                    const t = db.transaction([STORE_NAME], 'readwrite');
                    const s = t.objectStore(STORE_NAME);
                    const req = s.get(currentProjectName);
                    req.onsuccess = () => {
                        const p = req.result;
                        if (p) {
                            const mat = (typeof materializeProjectSkinConfig === 'function')
                                ? materializeProjectSkinConfig({ cardSkins: cardSkins, fusionSkins: window.fusionSkins, myHandCards: myHandCards, teammateHandCards: teammateHandCards, myPlacedCards: myPlacedCards, teammatePlacedCards: teammatePlacedCards })
                                : null;
                            p.cardSkins = mat ? mat.cardSkins : cardSkins;
                            p.fusionSkins = mat ? mat.fusionSkins : (window.fusionSkins || {});
                            p.cardMoHua = cardMoHua;
                            s.put(p);
                        }
                        resolve();
                    };
                    req.onerror = () => resolve();
                    t.oncomplete = () => resolve();
                    t.onerror = () => resolve();
                });
                if (typeof persistProjectsToDisk === 'function') persistProjectsToDisk();
            } catch (e) { console.warn('[SKIN] persistProjectSkins failed:', e); }
        }

        // 设置全局默认皮肤（英雄级，跨项目/跨上阵记住；队友卡未单独设时自动同步）
        async function setDefaultCardSkin(cardId, skin) {
            defaultCardSkins[cardId] = skin;
            saveDefaultCardSkins();
            // 刷新该卡所有相关位置（手牌 + 战斗槽），让默认皮立即生效
            try {
                const refreshHandCard = async (el) => {
                    const name = el.dataset.name || '';
                    if (!name) return;
                    const url = await window.resolveHeroSkinUrl(name, skin);
                    if (url) applySkinBgToHandCard(el, url);
                    else removeSkinBgFromHandCard(el);
                };
                document.querySelectorAll('.selected-card[data-id="' + cardId + '"]').forEach(el => refreshHandCard(el));
                document.querySelectorAll('.battle-slot.filled[data-card-id="' + cardId + '"]').forEach(async (slot) => {
                    try { await applySkinBgToSlot(slot, getSlotCardName(slot)); } catch (e) {}
                });
            } catch (e) { console.warn('[SKIN] setDefaultCardSkin refresh error:', e); }
            if (typeof persistProjectSkins === 'function') persistProjectSkins();
        }
        
        // 获取皮肤属性描述（含魔化）
        function getSkinAttribute(cardName, skinName, includeMoHua = false) {
            const mainCardName = getMainCardName(cardName);
            const cloud = (typeof window !== 'undefined' && window.skinAttributesCloud) ? window.skinAttributesCloud : null;
            let defaultAttr = null;
            if (SKIN_ATTRIBUTES[mainCardName] && SKIN_ATTRIBUTES[mainCardName]["默认"]) {
                defaultAttr = SKIN_ATTRIBUTES[mainCardName]["默认"];
            } else if (customSkinAttributes[mainCardName] && customSkinAttributes[mainCardName]["默认"]) {
                defaultAttr = customSkinAttributes[mainCardName]["默认"];
            } else if (cloud && cloud[mainCardName] && cloud[mainCardName]["默认"]) {
                defaultAttr = cloud[mainCardName]["默认"];
            }
            if (skinName === "默认" && !includeMoHua) {
                return defaultAttr || { desc: "无特殊属性" };
            }
            
            let descParts = [];
            if (defaultAttr) descParts.push(defaultAttr.desc);
            
            // 皮肤属性
            if (skinName !== "默认") {
                let skinAttr = null;
                if (SKIN_ATTRIBUTES[mainCardName] && SKIN_ATTRIBUTES[mainCardName][skinName]) {
                    skinAttr = SKIN_ATTRIBUTES[mainCardName][skinName];
                } else if (customSkinAttributes[mainCardName] && customSkinAttributes[mainCardName][skinName]) {
                    skinAttr = customSkinAttributes[mainCardName][skinName];
                } else if (cloud && cloud[mainCardName] && cloud[mainCardName][skinName]) {
                    skinAttr = cloud[mainCardName][skinName];
                }
                if (skinAttr) {
                    descParts.push(`【${skinName}】\n${skinAttr.desc}`);
                }
            }
            
            // 魔化属性
            if (includeMoHua) {
                let mohuaAttr = null;
                if (SKIN_ATTRIBUTES[mainCardName] && SKIN_ATTRIBUTES[mainCardName]["魔化"]) {
                    mohuaAttr = SKIN_ATTRIBUTES[mainCardName]["魔化"];
                } else if (customSkinAttributes[mainCardName] && customSkinAttributes[mainCardName]["魔化"]) {
                    mohuaAttr = customSkinAttributes[mainCardName]["魔化"];
                } else if (cloud && cloud[mainCardName] && cloud[mainCardName]["魔化"]) {
                    mohuaAttr = cloud[mainCardName]["魔化"];
                }
                if (mohuaAttr) {
                    descParts.push(`【魔化】\n${mohuaAttr.desc}`);
                }
            }
            
            return { desc: descParts.join('\n\n') || '无特殊属性' };
        }

        // ==================== 卡牌等级管理 ====================
        // 根据卡牌类型获取可选等级
        function getAvailableLevels(cardType) {
            const levelMap = {
                'gold': [1, 3, 6, 9, 12, 15, 18, 21, 24],
                'purple': [1, 4, 8, 12, 16, 20, 24],
                'blue': [1, 5, 10, 15, 20, 25],
                'green': [1, 6, 12, 18, 24],
                'engineering-card': [1, 3, 6, 9, 12, 15, 18, 21, 24] // 工程卡使用金卡等级
            };
            return levelMap[cardType] || [1];
        }

        // 获取卡牌等级
        // handType='my' → 我的卡，使用永久保存的等级
        // handType='teammate' → 队友卡，优先用队友单独设置的，没有则用我的卡等级
        function getCardLevel(cardId, cardType, handType = 'my') {
            if (handType === 'my') {
                // 我的卡：使用永久保存的等级
                const key = `my_${cardId}`;
                if (individualCardLevels[key] !== undefined) {
                    return individualCardLevels[key];
                }
                // 兼容旧数据
                if (individualCardLevels[cardId] !== undefined) {
                    return individualCardLevels[cardId];
                }
                return 1;
            } else {
                // 队友的卡：优先使用队友单独设置的等级
                const teammateKey = `teammate_${cardId}`;
                if (individualCardLevels[teammateKey] !== undefined) {
                    return individualCardLevels[teammateKey];
                }
                // 如果队友没有单独设置，使用"我的卡等级"
                const myKey = `my_${cardId}`;
                if (individualCardLevels[myKey] !== undefined) {
                    return individualCardLevels[myKey];
                }
                // 兼容旧数据
                if (individualCardLevels[cardId] !== undefined) {
                    return individualCardLevels[cardId];
                }
                return 1;
            }
        }

        // 设置卡牌等级 - 支持分"我的"和"队友"
        function setCardLevel(cardId, level, cardType, handType = 'my') {
            const key = `${handType}_${cardId}`;
            individualCardLevels[key] = level;
            saveIndividualCardLevels();
            updateAllCardLevelBadges();
        }

        // 保存卡牌等级到localStorage
        function saveIndividualCardLevels() {
            localStorage.setItem('tdjl_individualCardLevels', JSON.stringify(individualCardLevels));
        }

        // 加载卡牌等级
        function loadIndividualCardLevels() {
            const saved = localStorage.getItem('tdjl_individualCardLevels');
            if (saved) {
                individualCardLevels = JSON.parse(saved);
            }
        }

        // 创建等级徽章HTML
        function createLevelBadgeHTML(cardId, cardType, handType = 'my', cardName = '') {
            const level = getCardLevel(cardId, cardType, handType);
            const skin = getCardSkin(cardId, cardName, handType);
            const hasMoHua = getCardMoHua(cardId, handType);
            const hasCustomSkin = skin !== '默认';
            let skinClass = '';
            if (hasCustomSkin && hasMoHua) skinClass = 'has-skin has-mohua';
            else if (hasCustomSkin) skinClass = 'has-skin';
            else if (hasMoHua) skinClass = 'has-mohua';
            const levelBadge = `<span class="card-level-badge ${skinClass}" data-card-id="${cardId}" data-card-type="${cardType}" data-hand-type="${handType}" data-card-name="${cardName}" data-skin="${skin}">${level}${hasMoHua ? '🔮' : ''}</span>`;
            return levelBadge;
        }

        // 显示等级下拉选择器
        function showLevelDropdown(event, cardId, cardType, handType = 'my', cardName = '') {
            event.stopPropagation();
            event.preventDefault();
            // 判断右键的卡属于「项目上阵卡」还是「卡池/收藏定义卡」：
            // 手牌容器/战斗槽内 → 选皮肤=当前阵容(project)；卡池/收藏内 → 选皮肤=全局默认(default)
            const _scopeEl = (event.target && event.target.closest) ? event.target.closest('#myHandContainer, #teammateHandContainer, .battle-slot') : null;
            const isProjectScope = !!_scopeEl;

            // 移除已存在的下拉框
            document.querySelectorAll('.level-dropdown').forEach(el => el.remove());

            const badge = event.target;
            const levels = getAvailableLevels(cardType);
            const currentLevel = getCardLevel(cardId, cardType, handType);
            const skins = getAvailableSkins(cardName);
            const currentSkin = getCardSkin(cardId, cardName, handType);
            const currentMoHua = getCardMoHua(cardId, handType);
            const canMoHua = hasMoHuaData(cardName);

            const dropdown = document.createElement('div');
            dropdown.className = 'level-dropdown';

            // 等级选择标题
            const levelTitle = document.createElement('div');
            levelTitle.style.cssText = 'color:#4ecdc4;font-size:0.75rem;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.1);';
            levelTitle.textContent = '📊 等级';
            dropdown.appendChild(levelTitle);

            levels.forEach(level => {
                const item = document.createElement('div');
                item.className = 'level-dropdown-item' + (level === currentLevel ? ' selected' : '');
                item.textContent = level;
                item.onclick = (e) => {
                    e.stopPropagation();
                    setCardLevel(cardId, level, cardType, handType);
                    dropdown.remove();
                    updateAllCardLevelBadges();
                };
                dropdown.appendChild(item);
            });
            
            // 皮肤选择区域
            const skinTitle = document.createElement('div');
            skinTitle.style.cssText = 'color:#ff9800;font-size:0.75rem;padding:5px 10px;border-top:1px solid rgba(255,255,255,0.1);margin-top:5px;border-bottom:1px solid rgba(255,255,255,0.1);';
            skinTitle.textContent = '🎨 皮肤';
            dropdown.appendChild(skinTitle);
            
            skins.forEach(skin => {
                const item = document.createElement('div');
                item.className = 'level-dropdown-item' + (skin === currentSkin ? ' selected' : '');
                item.textContent = skin;
                item.style.color = skin === currentSkin ? '#ff9800' : '#fff';
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (isProjectScope) setCardSkin(cardId, skin, handType);
                    else setDefaultCardSkin(cardId, skin);
                    dropdown.remove();
                    updateAllCardLevelBadges();
                };
                dropdown.appendChild(item);
            });
            
            // 添加自定义皮肤选项
            const addSkinItem = document.createElement('div');
            addSkinItem.className = 'level-dropdown-item';
            addSkinItem.style.cssText = 'color:#4caf50;font-style:italic;';
            addSkinItem.textContent = '+ 添加皮肤...';
            addSkinItem.onclick = (e) => {
                e.stopPropagation();
                dropdown.remove();
                showAddSkinDialog(cardName, cardId, cardType, handType, badge, currentLevel);
            };
            dropdown.appendChild(addSkinItem);
            
            // 魔化开关区域（仅有魔化数据的卡才显示）
            if (canMoHua) {
                const mohuaTitle = document.createElement('div');
                mohuaTitle.style.cssText = 'color:#a855f7;font-size:0.75rem;padding:5px 10px;border-top:1px solid rgba(255,255,255,0.1);margin-top:5px;border-bottom:1px solid rgba(255,255,255,0.1);';
                mohuaTitle.textContent = '🔮 魔化';
                dropdown.appendChild(mohuaTitle);
                
                const mohuaItem = document.createElement('div');
                mohuaItem.className = 'level-dropdown-item' + (currentMoHua ? ' selected' : '');
                mohuaItem.style.cssText = `cursor:pointer;padding:8px 15px;color:${currentMoHua ? '#a855f7' : '#fff'};font-size:0.85rem;transition:background 0.2s;`;
                mohuaItem.textContent = currentMoHua ? '✅ 魔化已开启' : '魔化未开启';
                mohuaItem.onmouseenter = () => mohuaItem.style.background = 'rgba(168,85,247,0.2)';
                mohuaItem.onmouseleave = () => mohuaItem.style.background = 'transparent';
                mohuaItem.onclick = (e) => {
                    e.stopPropagation();
                    setCardMoHua(cardId, !currentMoHua, handType);
                    dropdown.remove();
                    updateAllCardLevelBadges();
                };
                dropdown.appendChild(mohuaItem);
            }
            
            // 将下拉框添加到body，使用fixed定位
            document.body.appendChild(dropdown);
            
            // 计算下拉框位置
            const rect = badge.getBoundingClientRect();
            dropdown.style.left = (rect.right - dropdown.offsetWidth) + 'px';
            dropdown.style.top = (rect.bottom + 5) + 'px';
            
            // 如果下拉框超出屏幕底部，显示在上方
            setTimeout(() => {
                const dropdownRect = dropdown.getBoundingClientRect();
                if (dropdownRect.bottom > window.innerHeight) {
                    dropdown.style.top = (rect.top - dropdownRect.height - 5) + 'px';
                }
                // 如果超出屏幕右侧，向左偏移
                if (dropdownRect.right > window.innerWidth) {
                    dropdown.style.left = (window.innerWidth - dropdownRect.width - 10) + 'px';
                }
            }, 0);
            
            // 点击其他地方关闭下拉框
            const handleClickOutside = (e) => {
                if (!dropdown.contains(e.target) && !e.target.closest('.card-level-badge')) {
                    dropdown.remove();
                    document.removeEventListener('click', handleClickOutside);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', handleClickOutside);
            }, 10);
        }

        // 关闭等级下拉框
        function closeLevelDropdown() {
            document.querySelectorAll('.level-dropdown').forEach(el => el.remove());
        }

        function updateAllCardLevelBadges() {
            document.querySelectorAll('.collapsible-section .card-item').forEach(card => {
                if (card.closest('#favoriteCardsGrid')) return;
                
                const cardId = card.dataset.id;
                const cardType = card.dataset.type;
                const cardName = card.dataset.name || card.textContent.trim();
                if (!cardId || !cardType) return;
                
                card.querySelector('.card-level-badge')?.remove();
                card.insertAdjacentHTML('afterbegin', createLevelBadgeHTML(cardId, cardType, 'my', cardName));
            });
            
            document.querySelectorAll('.my-hand .selected-card.card-item').forEach(card => {
                const cardId = card.dataset.id;
                const cardType = card.dataset.type;
                const cardName = card.dataset.name || '';
                if (!cardId) return;

                const actualType = cardType || findCardTypeById(cardId);
                if (!actualType) return;

                card.querySelector('.card-level-badge')?.remove();
                card.insertAdjacentHTML('afterbegin', createLevelBadgeHTML(cardId, actualType, 'my', cardName));
            });

            document.querySelectorAll('.teammate-hand .selected-card.card-item').forEach(card => {
                const cardId = card.dataset.id;
                const cardType = card.dataset.type;
                const cardName = card.dataset.name || '';
                if (!cardId) return;

                const actualType = cardType || findCardTypeById(cardId);
                if (!actualType) return;

                card.querySelector('.card-level-badge')?.remove();
                card.insertAdjacentHTML('afterbegin', createLevelBadgeHTML(cardId, actualType, 'teammate', cardName));
            });
            
            document.querySelectorAll('#favoriteCardsGrid .card-item').forEach(card => {
                const cardId = card.dataset.id;
                const cardType = card.dataset.type;
                const cardName = card.dataset.name || card.textContent.trim();
                if (!cardId || !cardType) return;
                
                card.querySelector('.card-level-badge')?.remove();
                card.insertAdjacentHTML('afterbegin', createLevelBadgeHTML(cardId, cardType, 'my', cardName));
            });
            
            document.querySelectorAll('.user-column .battle-slot.filled .card-item').forEach(card => {
                const slot = card.closest('.battle-slot');
                const cardId = slot?.dataset.cardId;
                if (!cardId) return;
                
                const actualType = findCardTypeById(cardId);
                if (!actualType) return;
                
                const handCard = myHandCards.find(c => c.id === cardId);
                const cardName = handCard?.name || '';
                
                card.querySelector('.card-level-badge')?.remove();
                card.insertAdjacentHTML('afterbegin', createLevelBadgeHTML(cardId, actualType, 'my', cardName));
            });

            document.querySelectorAll('.teammate-column .battle-slot.filled .card-item').forEach(card => {
                const slot = card.closest('.battle-slot');
                const cardId = slot?.dataset.cardId;
                if (!cardId) return;
                
                const actualType = findCardTypeById(cardId);
                if (!actualType) return;
                
                const handCard = teammateHandCards.find(c => c.id === cardId);
                const cardName = handCard?.name || '';
                
                card.querySelector('.card-level-badge')?.remove();
                card.insertAdjacentHTML('afterbegin', createLevelBadgeHTML(cardId, actualType, 'teammate', cardName));
            });

            // 同步刷新卡池皮肤小图（全局预设：defaultCardSkins / heroSkinSelections）
            if (typeof updateCardPoolSkins === 'function') updateCardPoolSkins().catch(() => {});
        }

        // 卡池皮肤铺满：基础卡 / 融合卡主卡用 .skin-layer cover 铺满卡牌，融合卡副卡用 .skin-layer-fused 小图
        // 全部基于全局预设（defaultCardSkins / heroSkinSelections / cloudFusions），跨项目保留
        // 未设置过皮肤（"默认"）的卡，也显示皮肤库里的默认皮肤图（与英雄同名那张）
        async function updateCardPoolSkins() {
            if (typeof window.resolveHeroSkinUrl !== 'function') return;
            // 含收藏区（#favoriteCardsGrid）：收藏的卡同样铺皮肤
            const cards = document.querySelectorAll('.collapsible-section .card-item');
            const tasks = [];
            for (const card of cards) {
                card.classList.remove('skin-bg');
                card.style.backgroundImage = '';
                card.style.background = '';
                card.querySelectorAll('.card-skin-thumb, .card-skin-thumb-fused, .skin-layer-fused').forEach(e => e.remove());
                const cardName = card.dataset.name || '';
                if (!cardName) continue;
                if (card.dataset.fusion === 'true') {
                    const def = (window.cloudFusions && window.cloudFusions[cardName]) || {};
                    const comps = (def.components && def.components.length >= 2) ? def.components : null;
                    if (!comps) continue;
                    const mainHero = comps[0], subHero = comps[1];
                    tasks.push((async () => {
                        const mainSkin = getHeroDefaultSkin(mainHero);
                        const u = await resolvePoolSkinUrl(mainHero, mainSkin);
                        const subSkin = getHeroDefaultSkin(subHero);
                        const u2 = await resolvePoolSkinUrl(subHero, subSkin);
                        if (u && u2) {
                            // 新方案：主卡满铺当背景（与基础卡一致），副卡缩成圆图放右上角金边切角(左下)
                            card.classList.add('skin-bg');
                            card.style.background = '';
                            card.style.backgroundImage = 'url("' + u + '")';
                            addSkinThumb(card, u2, 'skin-layer-fused', subHero + (subSkin && subSkin !== '默认' ? '·' + subSkin : ''));
                        } else if (u) {
                            // 只有主卡图 → 退回整张铺满
                            card.classList.add('skin-bg'); card.style.backgroundImage = 'url("' + u + '")';
                        }
                    })());
                } else {
                    tasks.push((async () => {
                        // 只读全局卡池皮：卡槽/手牌在项目里换皮不得反向影响卡池与收藏区
                        const skin = getPoolOnlySkin(card.dataset.id, cardName);
                        const u = await resolvePoolSkinUrl(cardName, skin);
                        if (u) { card.classList.add('skin-bg'); card.style.backgroundImage = 'url("' + u + '")'; }
                    })());
                }
            }
            await Promise.all(tasks);
        }

        // ==================== 卡池分区皮肤锁 ====================
        // 🔒 上锁(默认)：左键上卡、右键收藏（原行为不变）
        // 🔓 解锁：左键上卡不变、右键循环切换该卡皮肤（全局预设，跨项目保留）
        const POOL_SKIN_LOCK_KEY = 'tdjl_poolSkinUnlocked';
        let poolSkinUnlocked = {};
        try { poolSkinUnlocked = JSON.parse(localStorage.getItem(POOL_SKIN_LOCK_KEY) || '{}') || {}; } catch (e) { poolSkinUnlocked = {}; }

        function togglePoolSkinLock(e, rarity) {
            e.preventDefault();
            e.stopPropagation();   // 别触发标题栏的折叠
            poolSkinUnlocked[rarity] = !poolSkinUnlocked[rarity];
            localStorage.setItem(POOL_SKIN_LOCK_KEY, JSON.stringify(poolSkinUnlocked));
            applyPoolSkinLockUI();
            const on = poolSkinUnlocked[rarity];
            showToast(on ? '🔓 已解锁：右键卡牌可循环换皮' : '🔒 已上锁：右键恢复为收藏');
        }

        function applyPoolSkinLockUI() {
            document.querySelectorAll('.pool-skin-lock').forEach(icon => {
                const r = icon.dataset.rarity;
                const on = !!poolSkinUnlocked[r];
                icon.textContent = on ? '🔓' : '🔒';
                icon.classList.toggle('unlocked', on);
                icon.setAttribute('data-tip', on
                    ? '已解锁：右键卡牌循环切换皮肤（左键上卡不变）。点此上锁恢复右键收藏'
                    : '点击解锁后，右键卡牌可快速循环换皮肤；上锁时右键=收藏');
                const sec = icon.closest('.collapsible-section');
                if (sec) sec.classList.toggle('skin-unlocked', on);
            });
        }

        // 右键循环切换皮肤：默认 → 皮肤1 → 皮肤2 → ... → 回到默认
        // 注意：getAvailableSkins 是同步函数且已含「默认」；setDefaultCardSkin 第一个参数是 cardId
        async function cyclePoolCardSkin(card) {
            const cardName = card.dataset.name || '';
            const cardId = card.dataset.id;
            if (!cardName || !cardId) return;

            // 融合卡按主卡取皮肤列表（getAvailableSkins 内部已做 getMainCardName）
            const skins = getAvailableSkins(cardName) || [];
            if (skins.length <= 1) {
                showToast(`「${cardName}」只有默认皮肤，无可切换`);
                return;
            }

            // 保证「默认」排在序列首位
            const seq = ['默认', ...skins.filter(s => s !== '默认')];
            // 循环起点只看全局卡池皮，避免被当前项目的卡槽皮带偏
            const cur = getPoolOnlySkin(cardId, cardName) || '默认';
            let idx = seq.indexOf(cur);
            if (idx < 0) idx = 0;
            const next = seq[(idx + 1) % seq.length];

            await setDefaultCardSkin(cardId, next);
            await updateCardPoolSkins();
            showToast(`${cardName} → ${next}（${seq.indexOf(next) + 1}/${seq.length}）`);
        }

        // 卡池取皮肤图：未设置 / "默认" → 回退到皮肤库里与英雄同名的默认图（再兜底第一张）
        // 显式空串 '' = 用户主动选择「不显示皮肤」，保持原样不铺图
        async function resolvePoolSkinUrl(heroName, skin) {
            if (skin === '') return null;
            try {
                if (!skin || skin === '默认') {
                    return (await window.resolveHeroSkinUrl(heroName, heroName))
                        || (await window.resolveHeroSkinUrl(heroName));
                }
                return await window.resolveHeroSkinUrl(heroName, skin);
            } catch (e) { return null; }
        }
        // 卡池/收藏区专用取皮：**只读全局卡池皮**，绝不读项目级 cardSkins。
        // 与 getCardSkin 的区别 = 去掉了「当前项目内手动设置」那一层，
        // 保证卡槽/手牌换皮不会反向污染卡池和收藏区。
        function getPoolOnlySkin(cardId, cardName) {
            if (cardId && typeof defaultCardSkins !== 'undefined' && defaultCardSkins[cardId] !== undefined) {
                return defaultCardSkins[cardId];
            }
            if (typeof window.heroSkinSelections !== 'undefined' && cardName) {
                const baseHero = (typeof getBaseHeroName === 'function') ? getBaseHeroName(cardName).heroName : cardName;
                if (window.heroSkinSelections[baseHero] !== undefined) {
                    return window.heroSkinSelections[baseHero];
                }
            }
            return '默认';
        }

        function getHeroDefaultSkin(heroName) {
            // 英雄名 → cardId（卡池静态映射）→ defaultCardSkins，回退 heroSkinSelections（均为全局预设）
            const el = document.querySelector('.collapsible-section .card-item[data-name="' + (heroName || '').replace(/"/g, '\\"') + '"]');
            const cid = el ? el.dataset.id : null;
            if (cid && typeof defaultCardSkins !== 'undefined' && defaultCardSkins[cid] !== undefined) return defaultCardSkins[cid];
            if (typeof window.heroSkinSelections !== 'undefined' && window.heroSkinSelections[heroName] !== undefined) return window.heroSkinSelections[heroName];
            return '默认';
        }
        function addSkinThumb(card, url, cls, title) {
            const img = document.createElement('img');
            img.className = cls;
            img.src = url;
            img.title = title || '';
            img.draggable = false;
            img.style.opacity = '0';
            img.style.transition = 'opacity .2s';
            img.addEventListener('load', () => { img.style.opacity = '1'; });
            card.appendChild(img);
        }

        // 根据卡牌ID查找卡牌类型
        function findCardTypeById(cardId) {
            // 先从卡池中查找
            const poolCard = document.querySelector(`.collapsible-section .card-item[data-id="${cardId}"]`);
            if (poolCard) return poolCard.dataset.type;
            
            // 从手牌数组查找
            const myCard = myHandCards.find(c => c.id === cardId);
            if (myCard && myCard.type) return myCard.type;
            
            const teammateCard = teammateHandCards.find(c => c.id === cardId);
            if (teammateCard && teammateCard.type) return teammateCard.type;
            
            // 从收藏数组查找
            const favCard = favoriteCards.find(c => c.id === cardId);
            if (favCard && favCard.type) return favCard.type;
            
            return 'gold'; // 默认返回金卡类型
        }
        
        // ==================== 皮肤悬停提示功能 ====================
        let skinTooltip = null;
        let tooltipTimeout = null;
        
        // 创建皮肤tooltip元素
        function createSkinTooltip() {
            if (skinTooltip) return;
            
            skinTooltip = document.createElement('div');
            skinTooltip.id = 'skinTooltip';
            skinTooltip.style.cssText = `
                position: fixed;
                background: linear-gradient(135deg, rgba(30,30,60,0.98), rgba(20,20,50,0.98));
                border: 2px solid rgba(255,215,0,0.5);
                border-radius: 10px;
                padding: 12px 16px;
                color: #fff;
                font-size: 0.85rem;
                z-index: 100000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s;
                max-width: 250px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.5);
            `;
            document.body.appendChild(skinTooltip);
        }
        
        // 显示皮肤tooltip
        function showSkinTooltip(event, cardId, cardName, handType = 'my') {
            clearTimeout(tooltipTimeout);
            
            const skin = getCardSkin(cardId, cardName, handType);
            const hasMoHua = getCardMoHua(cardId, handType);
            const skinAttr = getSkinAttribute(cardName, skin, hasMoHua);
            const mainCardName = getMainCardName(cardName);
            const displayCardName = mainCardName !== cardName ? `${cardName} (${mainCardName})` : cardName;
            
            createSkinTooltip();
            
            const formattedDesc = skinAttr.desc.replace(/\n/g, '<br>');
            
            let infoLines = '';
            infoLines += `<div style="margin-bottom:6px;"><span style="color:#4ecdc4;">皮肤：</span><span style="color:#fff;">${skin}</span></div>`;
            if (hasMoHuaData(cardName)) {
                infoLines += `<div style="margin-bottom:6px;"><span style="color:#a855f7;">魔化：</span><span style="color:${hasMoHua ? '#a855f7' : '#666'};">${hasMoHua ? '✅ 已开启' : '未开启'}</span></div>`;
            }
            
            skinTooltip.innerHTML = `
                <div style="color:#ffd700;font-weight:bold;margin-bottom:8px;font-size:0.9rem;">🎨 ${displayCardName}</div>
                ${infoLines}
                <div style="color:#888;font-size:0.8rem;">
                    <span style="color:#ff9800;">属性：</span><br>
                    <span style="color:#ccc;">${formattedDesc}</span>
                </div>
                <div style="color:#666;font-size:0.7rem;margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;">
                    点击等级徽章可设置皮肤和魔化
                </div>
            `;
            
            // 计算位置 — 悬浮窗显示在角标下方，角标始终在悬浮窗上方不被遮挡
            const rect = event.target.getBoundingClientRect();
            let left = rect.left;
            let top = rect.bottom + 6;

            // 水平方向：优先左对齐角标，超出右侧则右对齐
            if (left + 250 > window.innerWidth) {
                left = window.innerWidth - 255;
            }
            if (left < 5) left = 5;

            // 如果超出底部，则改显示在角标上方
            if (top + skinTooltip.offsetHeight > window.innerHeight) {
                top = rect.top - skinTooltip.offsetHeight - 6;
            }
            if (top < 5) {
                top = 5;
            }

            skinTooltip.style.left = left + 'px';
            skinTooltip.style.top = top + 'px';
            skinTooltip.style.opacity = '1';
        }
        
        // 隐藏皮肤tooltip
        function hideSkinTooltip() {
            clearTimeout(tooltipTimeout);
            if (skinTooltip) {
                skinTooltip.style.opacity = '0';
            }
        }
        
        // 延迟显示tooltip（悬停0.8秒后显示）
        function scheduleShowTooltip(event, cardId, cardName, handType = 'my') {
            clearTimeout(tooltipTimeout);
            hideSkinTooltip();
            tooltipTimeout = setTimeout(() => {
                showSkinTooltip(event, cardId, cardName, handType);
            }, 1500);
        }
        
        function scheduleShowSkinTooltip(event, cardId, cardName, handType = 'my') {
            clearTimeout(tooltipTimeout);
            hideSkinTooltip();
            tooltipTimeout = setTimeout(() => {
                showSkinTooltip(event, cardId, cardName, handType);
            }, 1500);
        }
        
        // 显示单独的皮肤下拉选择器（点击皮肤图标）
        function showSkinOnlyDropdown(event, cardId, cardName, handType = 'my') {
            event.stopPropagation();
            event.preventDefault();
            // 判断右键的卡属于「项目上阵卡」还是「卡池/收藏定义卡」
            const _scopeEl = (event.target && event.target.closest) ? event.target.closest('#myHandContainer, #teammateHandContainer, .battle-slot') : null;
            const isProjectScope = !!_scopeEl;
            
            hideSkinTooltip(); // 关闭tooltip
            document.querySelectorAll('.skin-dropdown').forEach(el => el.remove());
            document.querySelectorAll('.level-dropdown').forEach(el => el.remove());
            
            const skins = getAvailableSkins(cardName);
            const currentSkin = getCardSkin(cardId, cardName, handType);
            const currentMoHua = getCardMoHua(cardId, handType);
            const canMoHua = hasMoHuaData(cardName);
            
            const dropdown = document.createElement('div');
            dropdown.className = 'skin-dropdown';
            dropdown.style.cssText = `
                position: fixed;
                background: linear-gradient(135deg, rgba(30,30,60,0.98), rgba(20,20,50,0.98));
                border: 2px solid rgba(255,215,0,0.5);
                border-radius: 8px;
                padding: 5px 0;
                z-index: 99999;
                min-width: 140px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.5);
            `;
            
            // 皮肤标题
            const title = document.createElement('div');
            title.style.cssText = 'color:#ff9800;font-size:0.75rem;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.1);';
            title.textContent = `🎨 ${cardName}`;
            dropdown.appendChild(title);
            
            skins.forEach(skin => {
                const item = document.createElement('div');
                item.className = 'skin-dropdown-item';
                item.style.cssText = `
                    padding: 8px 15px;
                    cursor: pointer;
                    color: ${skin === currentSkin ? '#ffd700' : '#fff'};
                    font-size: 0.85rem;
                    transition: background 0.2s;
                `;
                item.textContent = skin;
                item.onmouseenter = () => item.style.background = 'rgba(255,215,0,0.2)';
                item.onmouseleave = () => item.style.background = 'transparent';
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (isProjectScope) setCardSkin(cardId, skin, handType);
                    else setDefaultCardSkin(cardId, skin);
                    dropdown.remove();
                    updateAllCardLevelBadges();
                };
                dropdown.appendChild(item);
            });
            
            // 添加自定义皮肤选项
            const addSkinItem = document.createElement('div');
            addSkinItem.className = 'skin-dropdown-item';
            addSkinItem.style.cssText = 'color:#4caf50;font-style:italic;padding:8px 15px;cursor:pointer;';
            addSkinItem.textContent = '+ 添加皮肤...';
            addSkinItem.onclick = (e) => {
                e.stopPropagation();
                dropdown.remove();
                showAddSkinDialog(cardName, cardId, null, handType, null, null);
            };
            dropdown.appendChild(addSkinItem);
            
            // 魔化开关区域（仅有魔化数据的卡才显示）
            if (canMoHua) {
                const mohuaTitle = document.createElement('div');
                mohuaTitle.style.cssText = 'color:#a855f7;font-size:0.75rem;padding:5px 10px;border-top:1px solid rgba(255,255,255,0.1);margin-top:5px;border-bottom:1px solid rgba(255,255,255,0.1);';
                mohuaTitle.textContent = '🔮 魔化';
                dropdown.appendChild(mohuaTitle);
                
                const mohuaItem = document.createElement('div');
                mohuaItem.className = 'skin-dropdown-item';
                mohuaItem.style.cssText = `cursor:pointer;padding:8px 15px;color:${currentMoHua ? '#a855f7' : '#fff'};font-size:0.85rem;transition:background 0.2s;`;
                mohuaItem.textContent = currentMoHua ? '✅ 魔化已开启' : '魔化未开启';
                mohuaItem.onmouseenter = () => mohuaItem.style.background = 'rgba(168,85,247,0.2)';
                mohuaItem.onmouseleave = () => mohuaItem.style.background = 'transparent';
                mohuaItem.onclick = (e) => {
                    e.stopPropagation();
                    setCardMoHua(cardId, !currentMoHua, handType);
                    dropdown.remove();
                    updateAllCardLevelBadges();
                };
                dropdown.appendChild(mohuaItem);
            }
            
            document.body.appendChild(dropdown);
            
            const rect = event.target.getBoundingClientRect();
            dropdown.style.left = Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - 10) + 'px';
            dropdown.style.top = (rect.bottom + 5) + 'px';
            
            setTimeout(() => {
                document.addEventListener('click', () => dropdown.remove(), { once: true });
            }, 10);
        }
        
        // 显示皮肤下拉选择器
        function showSkinDropdown(event, cardId, cardName, handType = 'my') {
            event.stopPropagation();
            event.preventDefault();
            
            document.querySelectorAll('.skin-dropdown').forEach(el => el.remove());
            
            const skins = getAvailableSkins(cardName);
            const currentSkin = getCardSkin(cardId, cardName, handType);
            
            const dropdown = document.createElement('div');
            dropdown.className = 'skin-dropdown';
            dropdown.style.cssText = `
                position: fixed;
                background: linear-gradient(135deg, rgba(30,30,60,0.98), rgba(20,20,50,0.98));
                border: 2px solid rgba(255,215,0,0.5);
                border-radius: 8px;
                padding: 5px 0;
                z-index: 99999;
                min-width: 120px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.5);
            `;
            
            skins.forEach(skin => {
                const item = document.createElement('div');
                item.className = 'skin-dropdown-item';
                item.style.cssText = `
                    padding: 8px 15px;
                    cursor: pointer;
                    color: ${skin === currentSkin ? '#ffd700' : '#fff'};
                    font-size: 0.85rem;
                    transition: background 0.2s;
                `;
                item.textContent = skin;
                item.onmouseenter = () => item.style.background = 'rgba(255,215,0,0.2)';
                item.onmouseleave = () => item.style.background = 'transparent';
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (isProjectScope) setCardSkin(cardId, skin, handType);
                    else setDefaultCardSkin(cardId, skin);
                    dropdown.remove();
                    updateAllCardLevelBadges();
                };
                dropdown.appendChild(item);
            });
            
            document.body.appendChild(dropdown);
            
            const rect = event.target.getBoundingClientRect();
            dropdown.style.left = (rect.right - dropdown.offsetWidth) + 'px';
            dropdown.style.top = (rect.bottom + 5) + 'px';
            
            setTimeout(() => {
                document.addEventListener('click', closeSkinDropdown, { once: true });
            }, 10);
        }
        
        function closeSkinDropdown() {
            document.querySelectorAll('.skin-dropdown').forEach(el => el.remove());
        }
        
        // 显示添加皮肤对话框
        function showAddSkinDialog(cardName, cardId, cardType, handType, badge, currentLevel, scope = 'project') {
            const existingSkins = getAvailableSkins(cardName);
            
            const modal = document.createElement('div');
            modal.id = 'addSkinDialog';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 100001;
            `;
            
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,rgba(40,40,70,0.98),rgba(30,30,60,0.98));border:2px solid rgba(255,215,0,0.3);border-radius:15px;padding:25px;min-width:350px;max-width:450px;">
                    <h3 style="margin:0 0 15px 0;color:#ffd700;text-align:center;">🎨 添加自定义皮肤</h3>
                    <p style="color:#888;font-size:0.85rem;margin-bottom:15px;">为 <strong style="color:#4ecdc4;">${cardName}</strong> 添加新皮肤</p>
                    
                    <div style="margin-bottom:15px;">
                        <label style="color:#fff;font-size:0.85rem;display:block;margin-bottom:5px;">皮肤名称：</label>
                        <input type="text" id="newSkinName" placeholder="输入皮肤名称" maxlength="20" 
                            style="width:100%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:5px;padding:8px 12px;color:#fff;font-size:0.9rem;outline:none;box-sizing:border-box;">
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <label style="color:#fff;font-size:0.85rem;display:block;margin-bottom:5px;">皮肤属性描述：</label>
                        <textarea id="newSkinAttr" placeholder="输入皮肤属性描述（可选）" rows="3" maxlength="200"
                            style="width:100%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:5px;padding:8px 12px;color:#fff;font-size:0.85rem;outline:none;box-sizing:border-box;resize:vertical;"></textarea>
                    </div>
                    
                    <div style="margin-bottom:20px;">
                        <label style="color:#fff;font-size:0.85rem;display:block;margin-bottom:5px;">已有皮肤：</label>
                        <div style="display:flex;flex-wrap:wrap;gap:5px;max-height:80px;overflow-y:auto;">
                            ${existingSkins.map(s => `<span style="background:rgba(255,255,255,0.1);padding:3px 8px;border-radius:3px;font-size:0.75rem;color:#888;">${s}</span>`).join('')}
                        </div>
                    </div>
                    
                    <div style="display:flex;gap:10px;justify-content:center;">
                        <button onclick="this.closest('#addSkinDialog').remove()" 
                            style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;">取消</button>
                        <button id="confirmAddSkin" 
                            style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;">添加</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const input = modal.querySelector('#newSkinName');
            const attrInput = modal.querySelector('#newSkinAttr');
            const confirmBtn = modal.querySelector('#confirmAddSkin');
            
            input.focus();
            
            confirmBtn.onclick = () => {
                const skinName = input.value.trim();
                const skinAttr = attrInput.value.trim();
                if (!skinName) {
                    alert('请输入皮肤名称');
                    return;
                }
                if (existingSkins.includes(skinName)) {
                    alert('该皮肤已存在');
                    return;
                }
                
                addCustomSkin(cardName, skinName);
                
                if (skinAttr) {
                    addCustomSkinAttribute(cardName, skinName, skinAttr);
                }
                
                if (scope === 'project') setCardSkin(cardId, skinName, handType);
                else setDefaultCardSkin(cardId, skinName);
                
                modal.remove();
                
                updateAllCardLevelBadges();
                
                const toast = document.createElement('div');
                toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg,#4caf50,#2e7d32);
                    color: #fff;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    z-index: 100002;
                `;
                toast.textContent = `✅ 已添加皮肤「${skinName}」`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2000);
            };
            
            input.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    confirmBtn.click();
                }
            };
        }

        function loadCardLevels() {
            const saved = localStorage.getItem('tdjl_cardLevels');
            if (saved) {
                cardLevels = JSON.parse(saved);
            }
            
            // 加载保存的卡牌等级
            if (cardLevels['my']) {
                const myLevelEl = document.getElementById('myCardLevel');
                if (myLevelEl) myLevelEl.value = cardLevels['my'];
            }
            if (cardLevels['teammate']) {
                const teammateLevelEl = document.getElementById('teammateCardLevel');
                if (teammateLevelEl) teammateLevelEl.value = cardLevels['teammate'];
            }
        }

        function saveCardLevel(handType, level) {
            cardLevels[handType] = level;
            localStorage.setItem('tdjl_cardLevels', JSON.stringify(cardLevels));
            updateDeckLevelDisplay(handType, level);
        }

        // 为手牌应用皮肤背景
        function applySkinBgToHandCard(card, url) {
            if (!card || !url) return;
            card.classList.add('skin-bg');
            let layer = card.querySelector('.hand-skin-layer');
            if (!layer) {
                layer = document.createElement('img');
                layer.className = 'hand-skin-layer';
                layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:0;pointer-events:none;';
                card.insertBefore(layer, card.firstChild);
            }
            if (layer.src !== url) layer.src = url;
        }
        function removeSkinBgFromHandCard(card) {
            if (!card) return;
            card.classList.remove('skin-bg');
            const layer = card.querySelector('.hand-skin-layer');
            if (layer) layer.remove();
            const fused = card.querySelector('.hand-skin-fused');
            if (fused) fused.remove();
        }

        // 给战斗槽卡牌应用皮肤背景
        async function applySkinBgToSlot(slot, heroName, forceCardId, forceHandType, forceSkin) {
            console.log('[SKIN] applySkinBgToSlot slot:', slot.dataset ? slot.dataset.slot : '?', 'heroName:', heroName);
            // 移除旧皮肤层（含融合上层）和旧皮肤名
            const oldLayer = slot.querySelector('.skin-layer');
            if (oldLayer) oldLayer.remove();
            const oldFused = slot.querySelector('.skin-layer-fused');
            if (oldFused) oldFused.remove();
            const oldSkinName = slot.querySelector('.skin-name');
            if (oldSkinName) oldSkinName.remove();
            slot.classList.remove('skin-bg');
            // 刷新卡面显示名：融合关闭（副卡隐藏）时只显主卡名；完整名存 data-full-name 供逻辑读取
            if (heroName) {
                const nameEl = slot.querySelector('.card-name');
                if (nameEl) { nameEl.dataset.fullName = heroName; nameEl.textContent = getFusionDisplayName(heroName); }
            }
            if (!heroName) { console.log('[SKIN] No heroName, returning'); return; }

            // 融合卡：主卡整皮(底层) + 被融合卡左上斜切半张(上层)
            if (fusionSkinSplitEnabled) {
                const parts = getFusionParts(heroName);
                if (parts && parts.length >= 2) {
                    const mainHero = parts[0], fusedHero = parts[1];
                    const slotCardId = forceCardId !== undefined ? forceCardId : (slot && slot.dataset ? slot.dataset.cardId : null);
                    const slotHandType = forceHandType !== undefined ? forceHandType : (slot && slot.dataset && slot.dataset.handType ? slot.dataset.handType : 'my');
                    const mainSkin = slotCardId ? getCardSkin(slotCardId, mainHero, slotHandType) : '默认';
                    let mainInfo = null;
                    if (window.resolveHeroSkinInfo) {
                        mainInfo = await window.resolveHeroSkinInfo(mainHero, mainSkin);
                    } else if (window.resolveHeroSkinUrl) {
                        const mu = await window.resolveHeroSkinUrl(mainHero, mainSkin);
                        if (mu) mainInfo = { url: mu };
                    } else if (window.getHeroSkinUrl) {
                        const mu = window.getHeroSkinUrl(mainHero);
                        if (mu) mainInfo = { url: mu };
                    }
                    const fusedInfo = await resolveFusionHalf(fusedHero, slot);
                    const mainUrl = mainInfo ? mainInfo.url : null;
                    const fusedUrl = fusedInfo ? fusedInfo.url : null;
                    const fusedIsBadge = fusedInfo ? fusedInfo.isBadge : false;
                    if (mainUrl || fusedUrl) { applyFusionSkinToSlot(slot, mainUrl, fusedUrl, fusedIsBadge); return; }
                    return;
                }
            }

            // 非融合 / 未开启：原逻辑（显示主卡整张皮肤）
            const skinHeroName = (typeof getMainCardName === 'function' && getMainCardName(heroName) !== heroName)
                ? getMainCardName(heroName)
                : heroName;
            // 🔴 优先用调用方已知的确切皮肤值（cycleHeroSkin/setCardSkin 算好的 nextSkin），
            // 避免再经 getCardSkin 反查 slot.dataset.cardId —— 旧项目/跨版本时 dataset 可能陈旧导致反查到默认/旧皮。
            // 与手牌渲染 resolveHeroSkinUrl(cardName, skin) 完全对称。
            let slotSkin = (forceSkin !== undefined) ? forceSkin : '默认';
            const slotCardId = forceCardId !== undefined ? forceCardId : (slot && slot.dataset ? slot.dataset.cardId : null);
            const slotHandType = forceHandType !== undefined ? forceHandType : (slot && slot.dataset && slot.dataset.handType ? slot.dataset.handType : 'my');
            if (slotSkin === '默认' && slotCardId) {
                slotSkin = getCardSkin(slotCardId, skinHeroName, slotHandType);
            }
            console.log('[SKIN] slotSkin resolved:', slotSkin, '(forceSkin:', forceSkin !== undefined ? forceSkin : 'n/a', ')');
            let skinInfo = null;
            if (window.resolveHeroSkinInfo) {
                skinInfo = await window.resolveHeroSkinInfo(skinHeroName, slotSkin);
            } else if (window.resolveHeroSkinUrl) {
                const url = await window.resolveHeroSkinUrl(skinHeroName, slotSkin);
                if (url) skinInfo = { url };
            } else {
                const url = window.getHeroSkinUrl && window.getHeroSkinUrl(skinHeroName);
                if (url) skinInfo = { url };
            }
            console.log('[SKIN] skinInfo:', skinInfo ? (skinInfo.url ? skinInfo.url.substring(0, 80) : 'no url') : 'NULL');
            if (!skinInfo || !skinInfo.url) { console.warn('[SKIN] No skin for', heroName); return; }

            const skinUrl = skinInfo.url;
            const isDataOrBlob = skinUrl.startsWith('data:') || skinUrl.startsWith('blob:');

            // 创建独立的 <img> 皮肤层
            const img = document.createElement('img');
            img.className = 'skin-layer';
            img.src = isDataOrBlob ? skinUrl : (skinUrl + '?t=' + Date.now());
            img.alt = '';
            img.onerror = function() { console.error('[SKIN] Failed to load skin image:', skinUrl.substring(0, 80)); img.remove(); };
            img.onload = function() { console.log('[SKIN] Skin image loaded OK for slot', slot.dataset.slot); };
            slot.insertBefore(img, slot.firstChild);
            slot.classList.add('skin-bg');

            console.log('[SKIN] Skin <img> inserted into slot', slot.dataset.slot);
        }

        async function restoreBattleSlots() {
            // 恢复我方战斗槽
            for (const card of myPlacedCards) {
                const slot = document.querySelector(`.battle-slot[data-slot="${card.slot}"]`);
                if (!slot) continue;
                if (!slot.classList.contains('filled')) {
                    const cardType = card.type || findCardTypeById(card.id);
                    const cardName = card.name || '';
                    const levelBadge = cardType ? createLevelBadgeHTML(card.id, cardType, 'my', cardName) : '';
                    slot.innerHTML = `<span class="card-item" data-profession="${card.profession}">${levelBadge}<span class="card-name">${card.name}</span></span>`;
                    slot.classList.add('filled');
                    slot.classList.remove('empty');
                }
                // 🔴 无论是否已 filled 都强制刷新 dataset（旧项目跨版本恢复时槽位可能残留旧 cardId）
                slot.dataset.cardId = card.id;
                slot.dataset.handType = 'my';
                slot.dataset.profession = card.profession;
                // 🔴 皮肤重渲必须每次都跑（重置皮肤/切皮等场景靠这里刷新已填卡槽的视觉）
                // 显式传入 card.id/'my'，避免回读可能陈旧的 slot.dataset.cardId（旧项目跨版本恢复时偶发）
                try { await applySkinBgToSlot(slot, card.name, card.id, 'my'); } catch (e) {}
                refreshSlotFusionControl(slot);
            }

            // 恢复队友战斗槽
            for (const card of teammatePlacedCards) {
                const slot = document.querySelector(`.battle-slot[data-slot="${card.slot}"]`);
                if (!slot) continue;
                if (!slot.classList.contains('filled')) {
                    const cardType = card.type || findCardTypeById(card.id);
                    const cardName = card.name || '';
                    const levelBadge = cardType ? createLevelBadgeHTML(card.id, cardType, 'teammate', cardName) : '';
                    slot.innerHTML = `<span class="card-item" data-profession="${card.profession}">${levelBadge}<span class="card-name">${card.name}</span></span>`;
                    slot.classList.add('filled');
                    slot.classList.remove('empty');
                }
                // 🔴 无论是否已 filled 都强制刷新 dataset（旧项目跨版本恢复时槽位可能残留旧 cardId）
                slot.dataset.cardId = card.id;
                slot.dataset.handType = 'teammate';
                slot.dataset.profession = card.profession;
                // 🔴 皮肤重渲必须每次都跑（重置皮肤/切皮等场景靠这里刷新已填卡槽的视觉）
                // 显式传入 card.id/'teammate'，避免回读可能陈旧的 slot.dataset.cardId
                try { await applySkinBgToSlot(slot, card.name, card.id, 'teammate'); } catch (e) {}
                refreshSlotFusionControl(slot);
            }
        }

        function updateDeckLevelDisplay(handType, level) {
            const displayEl = handType === 'my' ? 'myDeckLevelDisplay' : 'teammateDeckLevelDisplay';
            const display = document.getElementById(displayEl);
            if (display) {
                display.textContent = '卡组等级：' + level + '级';
            }
        }

        function saveFavorites() {
            localStorage.setItem('tdjl_favoriteCards', JSON.stringify(favoriteCards));
            localStorage.setItem('tdjl_professionOrder', JSON.stringify(professionOrder));
        }

        function handleCardRightClick(e, card) {
            e.preventDefault();

            // 分区皮肤锁已解锁 → 右键改为「循环切换皮肤」，不再收藏
            const sec = card.closest('.collapsible-section');
            if (sec && sec.classList.contains('skin-unlocked') && !card.closest('#favoriteCardsGrid')) {
                cyclePoolCardSkin(card);
                return;
            }

            const cardId = card.dataset.id;
            const cardName = card.dataset.name;
            const cardType = card.dataset.type;
            const isEngineering = card.dataset.engineering === 'true';
            const profession = card.dataset.profession;
            
            const existingIndex = favoriteCards.findIndex(c => c.id === cardId);
            
            if (existingIndex > -1) {
                // 删除常用卡
                favoriteCards.splice(existingIndex, 1);
                card.classList.remove('favorite-card');
            } else {
                // 添加常用卡
                favoriteCards.push({
                    id: cardId,
                    name: cardName,
                    type: cardType,
                    isEngineering: isEngineering,
                    profession: profession
                });
                card.classList.add('favorite-card');
                
                // 记录职业添加顺序
                if (!professionOrder.includes(profession)) {
                    professionOrder.push(profession);
                }
            }
            
            saveFavorites();
            updateFavoritesDisplay();
            updateAllCardLevelBadges();
        }

        // 处理常用卡点击（添加到手牌）
        function handleFavoriteCardClick(card) {
            const cardId = card.dataset.id;
            const cardName = card.dataset.name;
            const isEngineering = card.dataset.engineering === 'true';
            const profession = card.dataset.profession;
            const cardType = card.dataset.type;
            
            const myHasThis = myHandCards.some(c => c.id === cardId) || handHasIdentity(myHandCards, cardName);
            const teammateHasThis = teammateHandCards.some(c => c.id === cardId) || handHasIdentity(teammateHandCards, cardName);
            
            if (myHandCards.length < MAX_HAND_CARDS && !myHasThis) {
                myHandCards.push({ id: cardId, name: cardName, placed: null, isEngineering, profession, type: cardType });
                updateHandDisplay('my');
            } else if (teammateHandCards.length < MAX_HAND_CARDS && !teammateHasThis) {
                teammateHandCards.push({ id: cardId, name: cardName, placed: null, isEngineering, profession, type: cardType });
                updateHandDisplay('teammate');
            } else if (handHasIdentity(myHandCards, cardName) || handHasIdentity(teammateHandCards, cardName)) {
                // 手牌已有同一张卡（含融合形态），同一张卡只能带 1 张
                if (typeof showToast === 'function') showToast('⚠️ 手牌已有「' + cardName + '」（含融合形态），同一张卡只能带 1 张');
            }
        }

        // 更新常用卡显示
        function updateFavoritesDisplay() {
            const grid = document.getElementById('favoriteCardsGrid');
            
            if (favoriteCards.length === 0) {
                grid.innerHTML = '<div class="no-favorites" id="noFavorites">暂无收藏，右键点击卡牌添加到收藏</div>';
                return;
            }
            
            // 按职业分组
            const professionGroups = {};
            const professionNames = {
                'warrior': '⚔️ 战士',
                'mage': '🔮 法师',
                'archer': '🏹 射手',
                'summoner': '🐉 召唤',
                'priest': '⛪ 牧师',
                'warlock': '😈 术士',
                'panda': '🐼 熊猫',
                'engineering': '🔧 工程',
                'pokeball': '🔴 精灵球'
            };
            
            favoriteCards.forEach(card => {
                if (!professionGroups[card.profession]) {
                    professionGroups[card.profession] = [];
                }
                professionGroups[card.profession].push(card);
            });
            
            let html = '';
            
            // 按添加顺序显示职业
            const allProfessions = [...new Set([...professionOrder, ...Object.keys(professionGroups)])];
            
            allProfessions.forEach(profession => {
                if (professionGroups[profession] && professionGroups[profession].length > 0) {
                    html += '<div class="favorite-group">';
                    html += '<div class="favorite-group-header">' + professionNames[profession] + '</div>';
                    html += '<div class="cards-grid">';
                    professionGroups[profession].forEach(card => {
                        // 添加等级徽章
                        const levelBadge = createLevelBadgeHTML(card.id, card.type, 'my', card.name);
                        // 带上 data-fusion，融合卡才能正确铺「主卡整皮 + 副卡右下角小图」
                        const isFusion = !!(window.cloudFusions && window.cloudFusions[card.name]);
                        html += '<div class="card-item favorite-card"' + (isFusion ? ' data-fusion="true"' : '') + ' data-id="' + card.id + '" data-name="' + card.name + '" data-type="' + card.type + '" data-engineering="' + card.isEngineering + '" data-profession="' + card.profession + '">' + levelBadge + card.name + '</div>';
                    });
                    html += '</div></div>';
                }
            });
            
            grid.innerHTML = html;
            
            // 添加事件监听
            grid.querySelectorAll('.card-item').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.card-level-badge')) return;
                    handleFavoriteCardClick(card);
                });
                
                // 右键删除收藏
                card.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const cardId = card.dataset.id;
                    const existingIndex = favoriteCards.findIndex(c => c.id === cardId);
                    if (existingIndex > -1) {
                        favoriteCards.splice(existingIndex, 1);
                        saveFavorites();
                        updateFavoritesDisplay();
                        
                        document.querySelectorAll('.card-item[data-id="' + cardId + '"]').forEach(c => {
                            c.classList.remove('favorite-card');
                        });
                    }
                });
                
                // 长按删除收藏（手机版）
                setupLongPress(card, (e) => {
                    e.preventDefault();
                    const cardId = card.dataset.id;
                    const existingIndex = favoriteCards.findIndex(c => c.id === cardId);
                    if (existingIndex > -1) {
                        favoriteCards.splice(existingIndex, 1);
                        saveFavorites();
                        updateFavoritesDisplay();
                        
                        document.querySelectorAll('.card-item[data-id="' + cardId + '"]').forEach(c => {
                            c.classList.remove('favorite-card');
                        });
                    }
                });
            });

            // 收藏区是 innerHTML 整体重绘，重绘后必须重新铺皮肤，否则收藏的卡是光板
            if (typeof updateCardPoolSkins === 'function') updateCardPoolSkins().catch(() => {});
            // 同步刷新顶部「搜索选卡」按钮栏的卡数统计
            if (typeof refreshPoolCardCount === 'function') refreshPoolCardCount();
        }
        
        // 设置常用卡拖拽
        function setupFavoriteCardDrag() {
            const cards = document.querySelectorAll('#favoriteCardsGrid .card-item');
            cards.forEach(card => {
                card.setAttribute('draggable', 'true');
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', card.dataset.name || '');
                    e.dataTransfer.setData('text/id', card.dataset.id || '');
                    e.dataTransfer.setData('text/engineer', card.dataset.engineering || 'false');
                    e.dataTransfer.setData('text/source', 'favorite');
                    e.dataTransfer.setData('text/profession', card.dataset.profession || '');
                    draggedCard = card;
                    window.__dragPayload = { source: 'favorite', id: card.dataset.id || '', name: card.dataset.name || '', isEngineering: card.dataset.engineering === 'true', profession: card.dataset.profession || '', handType: 'favorite' };
                    card.classList.add('dragging');
                });
            });
        }
        
        // 设置常用卡拖拽排序
        function setupFavoriteCardSortDrag() {
            const favoriteGrid = document.getElementById('favoriteCardsGrid');
            if (!favoriteGrid) return;
            
            favoriteGrid.addEventListener('dragover', (e) => {
                e.preventDefault();
                const card = e.target.closest('.card-item');
                if (card && draggedCard && card !== draggedCard) {
                    card.classList.add('drag-over-card');
                }
            });
            
            favoriteGrid.addEventListener('dragleave', (e) => {
                const card = e.target.closest('.card-item');
                if (card) card.classList.remove('drag-over-card');
            });
            
            favoriteGrid.addEventListener('drop', (e) => {
                e.preventDefault();
                const card = e.target.closest('.card-item');
                if (card && draggedCard && card !== draggedCard) {
                    card.classList.remove('drag-over-card');
                    const grid = card.parentElement;
                    const allCards = [...grid.querySelectorAll('.card-item')];
                    const draggedIndex = allCards.indexOf(draggedCard);
                    const targetIndex = allCards.indexOf(card);
                    if (draggedIndex < targetIndex) {
                        card.after(draggedCard);
                    } else {
                        card.before(draggedCard);
                    }
                    // 重新排序 favoriteCards 数组
                    const cardId = draggedCard.dataset.id;
                    const index = favoriteCards.findIndex(c => c.id === cardId);
                    if (index > -1) {
                        const cardData = favoriteCards.splice(index, 1)[0];
                        favoriteCards.splice(targetIndex, 0, cardData);
                        saveFavorites();
                    }
                }
            });
        }

        // 设置常用卡拖放到手牌
        function setupFavoriteCardDropToHand(containerId, handCardsArray) {
            const container = document.getElementById(containerId);
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            container.addEventListener('drop', (e) => {
                e.preventDefault();
                const source = e.dataTransfer.getData('text/source') || (window.__dragPayload && window.__dragPayload.source) || '';
                if (source !== 'favorite') return;

                const cardId = e.dataTransfer.getData('text/id') || (window.__dragPayload && window.__dragPayload.id) || '';
                const cardName = e.dataTransfer.getData('text/plain') || (window.__dragPayload && window.__dragPayload.name) || '';
                const isEngineering = (e.dataTransfer.getData('text/engineer') === 'true') || !!(window.__dragPayload && window.__dragPayload.isEngineering);
                const profession = e.dataTransfer.getData('text/profession') || (window.__dragPayload && window.__dragPayload.profession) || '';

                const existingIndex = handCardsArray.findIndex(c => c.id === cardId);
                const blockedByIdentity = (existingIndex === -1) && handHasIdentity(handCardsArray, cardName);
                if (!blockedByIdentity && existingIndex === -1 && handCardsArray.length < MAX_HAND_CARDS) {
                    handCardsArray.push({ id: cardId, name: cardName, placed: null, isEngineering, profession });
                    updateHandDisplay(containerId === 'myHandContainer' ? 'my' : 'teammate');
                } else if (blockedByIdentity) {
                    // 手牌已有同一张卡（含融合形态），同一张卡只能带 1 张
                    if (typeof showToast === 'function') showToast('⚠️ 手牌已有「' + cardName + '」（含融合形态），同一张卡只能带 1 张');
                }
            });
        }

        // 设置常用卡拖放到战斗槽
        function setupFavoriteCardDropToSlot(slot, handCardsArray, containerId) {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            slot.addEventListener('drop', async (e) => {
                e.preventDefault();
                const source = e.dataTransfer.getData('text/source') || (window.__dragPayload && window.__dragPayload.source) || '';
                if (source !== 'favorite') return;
                
                const cardId = e.dataTransfer.getData('text/id') || (window.__dragPayload && window.__dragPayload.id) || '';
                const cardName = e.dataTransfer.getData('text/plain') || (window.__dragPayload && window.__dragPayload.name) || '';
                const isEngineering = (e.dataTransfer.getData('text/engineer') === 'true') || !!(window.__dragPayload && window.__dragPayload.isEngineering);
                const profession = e.dataTransfer.getData('text/profession') || (window.__dragPayload && window.__dragPayload.profession) || '';
                const slotId = slot.dataset.slot;
                const slotType = slot.dataset.type;
                const isUserSlot = slotId.startsWith('u');
                
                // 验证工程卡位置
                if (slotType === 'engineering' && !isEngineering) {
                    slot.classList.add('invalid-drop');
                    setTimeout(() => slot.classList.remove('invalid-drop'), 500);
                    return;
                }
                if (isEngineering && slotType !== 'engineering') {
                    slot.classList.add('invalid-drop');
                    setTimeout(() => slot.classList.remove('invalid-drop'), 500);
                    return;
                }
                
                // 精灵球不能上阵
                if (profession === 'pokeball') {
                    slot.classList.add('invalid-drop');
                    setTimeout(() => slot.classList.remove('invalid-drop'), 500);
                    return;
                }
                
                // 检查槽位是否已被占用
                if (slot.classList.contains('filled')) {
                    removeCardFromSlot(slotId);
                }
                
                // 检查是否已在手牌中（含基础卡/融合形态同身份的不同卡）
                const existingInHand = handCardsArray.findIndex(c => c.id === cardId);
                if (existingInHand === -1 && handHasIdentity(handCardsArray, cardName)) {
                    slot.classList.add('invalid-drop');
                    setTimeout(() => slot.classList.remove('invalid-drop'), 500);
                    if (typeof showToast === 'function') showToast('⚠️ 手牌已有同一张卡（含融合形态），不能重复上阵');
                    return;
                }
                if (existingInHand === -1) {
                    // 不在手牌中，先添加到手牌
                    if (handCardsArray.length >= MAX_HAND_CARDS) return;
                    
                    if (isEngineering) {
                        const engCount = handCardsArray.filter(c => c.isEngineering).length;
                        if (engCount >= 2) return;
                    } else {
                        const normalCount = handCardsArray.filter(c => !c.isEngineering).length;
                        if (normalCount >= 9) return;
                    }
                    
                    handCardsArray.push({ id: cardId, name: cardName, placed: slotId, isEngineering, profession });
                } else {
                    // 已在手牌中，更新放置位置
                    handCardsArray[existingInHand].placed = slotId;
                }
                
                // 更新槽位显示
                const slotCardType = findCardTypeById(cardId) || 'gold';
                const slotHandType = isUserSlot ? 'my' : 'teammate';
                const slotLevelBadge = createLevelBadgeHTML(cardId, slotCardType, slotHandType, cardName);
                slot.innerHTML = `<span class="card-item" data-profession="${profession}">${slotLevelBadge}<span class="card-name">${cardName}</span></span>`;
                slot.classList.add('filled');
                slot.classList.remove('empty');
                slot.dataset.cardId = cardId;
                slot.dataset.handType = slotHandType;
                slot.dataset.profession = profession;

                // 应用皮肤背景
                try { await applySkinBgToSlot(slot, cardName); } catch (e) {}
                refreshSlotFusionControl(slot);

                // 更新放置卡牌数组
                const placedArray = isUserSlot ? myPlacedCards : teammatePlacedCards;
                if (!Array.isArray(placedArray)) {
                    if (isUserSlot) myPlacedCards = [];
                    else teammatePlacedCards = [];
                }
                const existingPlacedIndex = placedArray.findIndex(c => c.id === cardId);
                if (existingPlacedIndex > -1) {
                    placedArray[existingPlacedIndex].slot = slotId;
                } else {
                    placedArray.push({ id: cardId, name: cardName, slot: slotId, isEngineering, profession });
                }
                
                updateHandDisplay(isUserSlot ? 'my' : 'teammate');
                updateDamageReductionDisplay(); // 拖放上卡后立即更新减伤显示
            });
        }

        // 处理卡池卡牌点击（添加到手牌）
        // side 可选：'my' | 'teammate' 指定上阵到哪侧；不传则沿用原自动逻辑（优先我的，满了才队友）
        function handlePoolCardClick(card, side) {
            const cardId = card.dataset.id;
            const cardName = card.dataset.name;
            const isEngineering = card.dataset.engineering === 'true';
            const profession = card.dataset.profession;
            const cardType = card.dataset.type;

            const myHasThis = myHandCards.some(c => c.id === cardId) || handHasIdentity(myHandCards, cardName);
            const teammateHasThis = teammateHandCards.some(c => c.id === cardId) || handHasIdentity(teammateHandCards, cardName);

            let targetSide = side;
            if (!targetSide) {
                // 原自动逻辑：优先我的，满了才队友
                if (myHandCards.length < MAX_HAND_CARDS && !myHasThis) targetSide = 'my';
                else if (teammateHandCards.length < MAX_HAND_CARDS && !teammateHasThis) targetSide = 'teammate';
                else if (myHasThis || teammateHasThis) { if (typeof showToast === 'function') showToast('⚠️ 手牌已有「' + cardName + '」（含融合形态），同一张卡只能带 1 张'); return; }
                else { if (typeof showToast === 'function') showToast('⚠️ 手牌已满（最多 ' + MAX_HAND_CARDS + ' 张）'); return; }
            }
            const target = targetSide === 'teammate' ? teammateHandCards : myHandCards;
            const hasThis = targetSide === 'teammate' ? teammateHasThis : myHasThis;
            const sideName = targetSide === 'teammate' ? '队友' : '我的';
            if (hasThis) { if (typeof showToast === 'function') showToast('⚠️ ' + sideName + '手牌已有「' + cardName + '」'); return; }
            if (target.length >= MAX_HAND_CARDS) { if (typeof showToast === 'function') showToast('⚠️ ' + sideName + '手牌已满（最多 ' + MAX_HAND_CARDS + ' 张）'); return; }
            if (isEngineering) {
                const engCount = target.filter(c => c.isEngineering).length;
                if (engCount >= 2) { if (typeof showToast === 'function') showToast('⚠️ ' + sideName + '手牌工程卡已达上限（2 张）'); return; }
            } else {
                const normalCount = target.filter(c => !c.isEngineering).length;
                if (normalCount >= 9) { if (typeof showToast === 'function') showToast('⚠️ ' + sideName + '手牌普通卡已达上限（9 张）'); return; }
            }
            target.push({ id: cardId, name: cardName, placed: null, isEngineering, profession, type: cardType });
            updateHandDisplay(targetSide);
        }

        // 职业中文名 → data-profession（融合卡与云端基础卡共用）
        const PROFESSION_KEY_MAP = {
            '工程': 'engineering', '战士': 'warrior', '法师': 'mage', '射手': 'archer',
            '召唤': 'summoner', '牧师': 'priest', '术士': 'warlock', '熊猫': 'panda', '精灵球': 'pokeball'
        };
        // 职业英文 key → 中文（供通用筛选器分类标签显示中文；内部 profession 仍用英文 key 不变）
        const PROFESSION_CN_MAP = {};
        Object.keys(PROFESSION_KEY_MAP).forEach(function (cn) { PROFESSION_CN_MAP[PROFESSION_KEY_MAP[cn]] = cn; });
        function professionToCn(key) { return key ? (PROFESSION_CN_MAP[key] || key) : key; }
        if (typeof window !== 'undefined') window.professionToCn = professionToCn;

        // ===== 通用筛选器：从卡池选英雄卡上阵 =====
        // 收集卡池所有英雄卡（基础卡 + 融合卡 + 收藏），来源为卡池 DOM 节点（已含全部 100+ 张）
        function collectPoolCards() {
            const seen = new Set();
            const list = [];
            function pushCard(el, favorite) {
                const id = el.dataset.id;
                const name = el.dataset.name;
                if (!name || seen.has(name)) return;
                seen.add(name);
                // 手牌是否已上阵（含融合形态）：标记 current 以便筛选器高亮
                const inMy = myHandCards.some(c => c.id === id) || handHasIdentity(myHandCards, name);
                const inTeam = teammateHandCards.some(c => c.id === id) || handHasIdentity(teammateHandCards, name);
                const current = inMy ? '我的手牌' : (inTeam ? '队友手牌' : null);
                const isFusion = el.dataset.fusion === 'true';
                list.push({
                    value: name,
                    label: name,
                    py: window.hanziInitials ? window.hanziInitials(name) : '',
                    profession: el.dataset.profession, // 顶层职业字段，供筛选器分类
                    current: current,
                    sub: (isFusion ? '🜂融合 ' : '') + (current ? '✓ ' + current : ''),
                    favorite: !!favorite, // 收藏卡标记，供选择器「收藏」分类
                    // 透传上阵所需字段
                    _ds: { id, name, engineering: el.dataset.engineering, profession: el.dataset.profession, type: el.dataset.type }
                });
            }
            // 收藏卡优先收集（标记 favorite），再收集卡池普通卡（按 name 去重跳过已加）
            document.querySelectorAll('#favoriteCardsGrid .card-item').forEach(el => pushCard(el, true));
            document.querySelectorAll('.collapsible-section .card-item').forEach(el => pushCard(el, false));
            // 按首字母排序，方便浏览
            list.sort((a, b) => (a.py || a.label).localeCompare(b.py || b.label, 'zh-Hans-CN'));
            return list;
        }

        // 打开通用筛选器选卡 → 复用 handlePoolCardClick（mock dataset）上阵到指定侧
        // side: 'my' | 'teammate'，从手牌旁放大镜入口调用，确保我和队友分开选
        // 我点左侧放大镜→面板靠左；点队友右侧放大镜→面板靠右，无需额外按钮
        // 多职业卡片变多也不拥挤：默认 2 列 + 加宽面板（见 app-picker.js 的 multi 分支）
        function openPoolCardPicker(side) {
            const items = collectPoolCards();
            const title = side === 'teammate' ? '🔍 选卡上阵到「队友手牌」' : '🔍 选卡上阵到「我的手牌」';
            openGenericPicker({
                title: title,
                searchPlaceholder: '输入首字母（如 sl=水灵）或卡名关键字…',
                items: items,
                multi: true,
                align: side === 'teammate' ? 'right' : 'left',
                floatKey: 'hand_' + side, // 记忆各自的位置/大小
                floating: true, // 悬浮窗：可拖拽/缩放，左右两个可同时停屏幕上
                onPick: function (vals, its) {
                    // 多选：批量上阵所有选中卡（复用既有上阵逻辑）
                    (its || []).forEach(function (it) {
                        handlePoolCardClick({ dataset: it._ds }, side);
                    });
                }
            });
        }

        // 统计卡池卡片数（供按钮栏展示）
        function refreshPoolCardCount() {
            const el = document.getElementById('poolCardCount');
            if (el) el.textContent = collectPoolCards().length;
        }
        // 把云端融合卡同步到卡池对应「金卡类/紫卡类」的职业子分类（与基础卡并列，点/拖即可上阵）
        function renderFusionCardsToPool() {
            // 先清掉上一轮插入的融合卡节点
            document.querySelectorAll('.card-item[data-id^="fusion_"]').forEach(el => el.remove());
            const fusions = (window.cloudFusions && typeof window.cloudFusions === 'object') ? window.cloudFusions : {};
            const names = Object.keys(fusions);
            if (!names.length) return;
            names.forEach(name => {
                const def = fusions[name] || {};
                const quality = (def.quality === '紫') ? 'purple' : 'gold'; // 默认金
                const profCn = def.profession || '';
                const profKey = PROFESSION_KEY_MAP[profCn] || '';
                const qSection = document.querySelector('.collapsible-section.' + quality);
                if (!qSection) return;
                let grid = null;
                if (profKey) {
                    const sample = qSection.querySelector('.card-item[data-profession="' + profKey + '"]');
                    if (sample) grid = sample.closest('.cards-grid');
                }
                if (!grid) {
                    // 该职业在对应品质分类不存在 → 在该分类末尾新建一个子分类
                    const inner = qSection.querySelector('.collapsible-inner') || qSection.querySelector('.collapsible-content');
                    if (!inner) return;
                    const profSection = document.createElement('div');
                    profSection.className = 'profession-section';
                    profSection.innerHTML = '<h4>🔥 ' + (profCn || '融合') + '</h4>';
                    grid = document.createElement('div');
                    grid.className = 'cards-grid';
                    profSection.appendChild(grid);
                    inner.appendChild(profSection);
                }
                const card = document.createElement('div');
                card.className = 'card-item';
                card.dataset.id = 'fusion_' + name;
                card.dataset.name = name;
                card.dataset.profession = profKey || 'fusion';
                card.dataset.type = quality;
                card.dataset.fusion = 'true';
                if (profKey === 'engineering') card.dataset.engineering = 'true';
                card.setAttribute('draggable', 'false');
                card.style.cursor = 'pointer';
                card.innerHTML = '<span class="card-name">' + name + '</span>';
                grid.appendChild(card);
            });
            // 重新绑定拖拽/长按（与基础卡一致）
            document.querySelectorAll('.card-item[data-id^="fusion_"]').forEach(card => {
                card.setAttribute('draggable', 'false');
                setupLongPress(card, (e) => handleCardRightClick(e, card));
            });

            // 融合卡节点生成后刷新主/副卡皮（全局预设）
            if (typeof updateCardPoolSkins === 'function') updateCardPoolSkins().catch(() => {});
        }

        // 把云端基础卡（管理员在 skins/cards.json 添加的新英雄）同步到卡池对应职业子分类
        function renderCloudCardsToPool() {
            document.querySelectorAll('.card-item[data-id^="cloudcard_"]').forEach(el => el.remove());
            const cards = (window.cloudCards && typeof window.cloudCards === 'object') ? window.cloudCards : {};
            const names = Object.keys(cards);
            if (!names.length) return;
            names.forEach(name => {
                const def = cards[name] || {};
                const quality = (def.quality === '紫') ? 'purple' : 'gold'; // 默认金
                const profCn = def.profession || '';
                const profKey = PROFESSION_KEY_MAP[profCn] || '';
                const qSection = document.querySelector('.collapsible-section.' + quality);
                if (!qSection) return;
                let grid = null;
                if (profKey) {
                    const sample = qSection.querySelector('.card-item[data-profession="' + profKey + '"]');
                    if (sample) grid = sample.closest('.cards-grid');
                }
                if (!grid) {
                    const inner = qSection.querySelector('.collapsible-inner') || qSection.querySelector('.collapsible-content');
                    if (!inner) return;
                    const profSection = document.createElement('div');
                    profSection.className = 'profession-section';
                    profSection.innerHTML = '<h4>🆕 ' + (profCn || '新卡') + '</h4>';
                    grid = document.createElement('div');
                    grid.className = 'cards-grid';
                    profSection.appendChild(grid);
                    inner.appendChild(profSection);
                }
                const card = document.createElement('div');
                card.className = 'card-item';
                card.dataset.id = 'cloudcard_' + name;
                card.dataset.name = name;
                card.dataset.profession = profKey || 'newcard';
                card.dataset.type = quality;
                if (profKey === 'engineering') card.dataset.engineering = 'true';
                card.setAttribute('draggable', 'false');
                card.style.cursor = 'pointer';
                // 描述（悬停可见）
                const tipParts = [];
                if (def.desc) tipParts.push('📝 ' + def.desc);
                if (def.skinDesc) tipParts.push('🖼️ ' + def.skinDesc);
                card.title = tipParts.length ? name + '\n' + tipParts.join('\n') : name;
                // 皮肤图：有则显示，无则默认背景占位 + 角标提示
                const heroSkins = (window.skinRegistry && window.skinRegistry[name]) || [];
                let inner = '<span class="card-name">' + name + '</span>';
                if (heroSkins.length) {
                    const s0 = heroSkins[0];
                    const imgUrl = s0.url || (s0.path ? 'file://' + s0.path : '');
                    if (imgUrl) inner = '<img src="' + imgUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.outerHTML=\'<span class=&quot;card-name&quot;>' + name + '</span>\'"><span class="card-name" style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);font-size:0.6rem;padding:1px 2px;">' + name + '</span>';
                } else {
                    inner += '<span style="position:absolute;top:2px;right:2px;font-size:0.55rem;background:rgba(255,165,0,0.85);color:#000;padding:0 3px;border-radius:3px;line-height:1.3;">皮肤未配置</span>';
                }
                card.style.position = 'relative';
                card.innerHTML = inner;
                grid.appendChild(card);
            });
            document.querySelectorAll('.card-item[data-id^="cloudcard_"]').forEach(card => {
                card.setAttribute('draggable', 'false');
                setupLongPress(card, (e) => handleCardRightClick(e, card));
            });
        }

        // 卡池拖拽开始
        function handlePoolDragStart(e) {
            const card = e.target.closest('.card-item') || e.target;
            e.dataTransfer.setData('text/plain', card.dataset.name || '');
            e.dataTransfer.setData('text/id', card.dataset.id || '');
            e.dataTransfer.setData('text/engineer', card.dataset.engineering || 'false');
            e.dataTransfer.setData('text/source', 'pool');
            e.dataTransfer.setData('text/profession', card.dataset.profession || '');
            window.__dragPayload = { source: 'pool', id: card.dataset.id || '', name: card.dataset.name || '', isEngineering: card.dataset.engineering === 'true', profession: card.dataset.profession || '' };
        }

        // 手牌拖拽开始
        function handleHandDragStart(e, handType) {
            const cardEl = e.target.closest('.selected-card') || e.target;
            const cardId = cardEl.dataset.id;
            const cardName = cardEl.dataset.name;
            const isEngineering = cardEl.dataset.engineering === 'true';
            const profession = cardEl.dataset.profession;
            
            e.dataTransfer.setData('text/plain', cardName);
            e.dataTransfer.setData('text/id', cardId);
            e.dataTransfer.setData('text/engineer', isEngineering.toString());
            e.dataTransfer.setData('text/source', 'hand');
            e.dataTransfer.setData('text/hand', handType);
            e.dataTransfer.setData('text/profession', profession);
            window.__dragPayload = { source: 'hand', id: cardId, name: cardName, isEngineering: isEngineering, profession: profession, handType: handType };
        }

        // 手牌卡牌点击（上卡到战斗槽）
        async function handleHandCardClick(e, handType) {
            if (e.target.closest('.card-level-badge')) return;
            
            const cardEl = e.target.closest('.selected-card');
            if (!cardEl) return;
            
            e.stopPropagation();
            
            if (cardEl.classList.contains('placed') || cardEl.classList.contains('empty')) return;
            
            const cardId = cardEl.dataset.id;
            const cardName = cardEl.dataset.name;
            const isEngineering = cardEl.dataset.engineering === 'true';
            const profession = cardEl.dataset.profession;
            const cardType = cardEl.dataset.type;
            
            const handCards = handType === 'my' ? myHandCards : teammateHandCards;
            let placedCards = handType === 'my' ? myPlacedCards : teammatePlacedCards;
            if (!Array.isArray(placedCards)) {
                placedCards = [];
                if (handType === 'my') myPlacedCards = [];
                else teammatePlacedCards = [];
            }
            
            const cardIndex = handCards.findIndex(c => c.id === cardId);
            
            if (cardIndex === -1) return;
            
            const card = handCards[cardIndex];
            
            const slotId = findEmptySlot(handType, card.profession, card.isEngineering);
            
            if (slotId) {
                // 不从手牌移除，只标记为已放置（变暗）
                card.placed = slotId;
                
                // 更新放置卡牌数组
                const existingPlacedIndex = placedCards.findIndex(c => c.id === cardId);
                if (existingPlacedIndex > -1) {
                    placedCards[existingPlacedIndex].slot = slotId;
                } else {
                    placedCards.push({ id: cardId, name: cardName, slot: slotId, isEngineering, profession });
                }
                
                // 更新槽位显示
                const slot = document.querySelector(`.battle-slot[data-slot="${slotId}"]`);
                if (slot) {
                    // 获取卡牌类型并添加等级徽章
                    const cardType = card.type || findCardTypeById(cardId);
                    const levelBadge = cardType ? createLevelBadgeHTML(cardId, cardType, handType, cardName) : '';
                    slot.innerHTML = `<span class="card-item" data-profession="${profession}">${levelBadge}<span class="card-name">${cardName}</span></span>`;
                    slot.classList.add('filled');
                    slot.classList.remove('empty');
                    slot.dataset.cardId = cardId;
                    slot.dataset.handType = handType;
                    slot.dataset.profession = profession;

                    try { await applySkinBgToSlot(slot, cardName); } catch (e) {}
                }

                // 手牌中的卡牌变暗，但不移除
                cardEl.classList.add('placed');
                
                updateHandDisplay(handType);
                updateDamageReductionDisplay(); // 上卡后立即更新减伤显示
            }
        }
        
        // 查找空的战斗槽
        function findEmptySlot(handType, profession, isEngineering) {
            const isUserSlot = handType === 'my';
            const slotContainer = isUserSlot ? '.user-column' : '.teammate-column';
            
            // 精灵球不能上到战斗槽
            if (profession === 'pokeball') {
                return null;
            }
            
            // 工程卡只能上到最上面位置（u0/t0）
            if (isEngineering) {
                const engSlot = document.querySelector(`${slotContainer} .battle-slot[data-slot="${isUserSlot ? 'u0' : 't0'}"]`);
                if (engSlot && engSlot.classList.contains('empty')) {
                    return isUserSlot ? 'u0' : 't0';
                }
                return null;
            }
            
            // 普通卡从下往上、从右往左上卡（u6→u1）
            // 移除 data-type 属性筛选，因为所有普通槽位都没有这个属性
            const slots = document.querySelectorAll(`${slotContainer} .battle-slot:not(.engineering-slot)`);
            // 倒序遍历，从最后一个（u6/t6）开始
            for (let i = slots.length - 1; i >= 0; i--) {
                if (slots[i].classList.contains('empty')) {
                    return slots[i].dataset.slot;
                }
            }
            
            return null;
        }

        // 手牌卡牌右键（下阵卡牌，但不从手牌删除）
        async function handleHandCardRightClick(e, handType) {
            e.preventDefault();
            const cardEl = e.target.closest('.selected-card');
            if (cardEl.classList.contains('empty')) return;
            
            const cardId = cardEl.dataset.id;
            const handCards = handType === 'my' ? myHandCards : teammateHandCards;
            let placedCards = handType === 'my' ? myPlacedCards : teammatePlacedCards;
            if (!Array.isArray(placedCards)) {
                placedCards = [];
                if (handType === 'my') myPlacedCards = [];
                else teammatePlacedCards = [];
            }
            
            const index = handCards.findIndex(c => c.id === cardId);
            if (index > -1) {
                const card = handCards[index];
                // 二次确认，防止误触把手牌卡下掉
                const confirmed = await new Promise(resolve => {
                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
                    const box = document.createElement('div');
                    box.style.cssText = 'background:#1b1e29;border:1px solid rgba(255,215,0,0.4);border-radius:10px;padding:18px 20px;max-width:280px;color:#fff;font-size:0.9rem;box-shadow:0 8px 30px rgba(0,0,0,0.6);';
                    box.innerHTML = '<div style="margin-bottom:12px;">确定要把「' + (card.name || '这张卡') + '」从手牌下掉吗？</div>';
                    const btnRow = document.createElement('div');
                    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
                    const cancel = document.createElement('button');
                    cancel.textContent = '取消';
                    cancel.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#444;color:#fff;cursor:pointer;';
                    const yes = document.createElement('button');
                    yes.textContent = '确定下掉';
                    yes.style.cssText = 'padding:6px 14px;border:none;border-radius:6px;background:#e53935;color:#fff;cursor:pointer;';
                    cancel.onclick = () => { overlay.remove(); resolve(false); };
                    yes.onclick = () => { overlay.remove(); resolve(true); };
                    btnRow.appendChild(cancel); btnRow.appendChild(yes);
                    box.appendChild(btnRow); overlay.appendChild(box);
                    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { overlay.remove(); resolve(false); } });
                    document.body.appendChild(overlay);
                });
                if (!confirmed) return;
                
                // 如果已放置，从槽位移除
                if (card.placed) {
                    removeCardFromSlot(card.placed);
                }
                
                // 从手牌移除（不删除，只标记为未放置）
                handCards.splice(index, 1);
                
                // 从放置数组删除
                const placedIndex = placedCards.findIndex(c => c.id === cardId);
                if (placedIndex > -1) {
                    placedCards.splice(placedIndex, 1);
                }
                
                updateHandDisplay(handType);
            }
        }

        // 更新手牌显示
        function updateHandDisplay(handType) {
            const container = handType === 'my' 
                ? document.getElementById('myHandContainer') : document.getElementById('teammateHandContainer');
            const countEl = handType === 'my' 
                ? document.getElementById('myHandCount') : document.getElementById('teammateHandCount');
            const handCards = handType === 'my' ? myHandCards : teammateHandCards;
            
            let html = '';
            
            for (let i = 0; i < MAX_HAND_CARDS; i++) {
                if (i < handCards.length) {
                    const card = handCards[i];
                    const placedClass = card.placed ? 'placed' : '';
                    const engineerClass = card.isEngineering ? 'engineering-card' : '';
                    // 获取卡牌类型用于显示等级
                    const cardType = card.type || findCardTypeById(card.id);
                    const levelBadge = cardType ? createLevelBadgeHTML(card.id, cardType, handType, card.name) : '';
                    html += '<div class="selected-card ' + placedClass + ' ' + engineerClass + ' card-item" data-id="' + card.id + '" data-name="' + card.name + '" data-type="' + (cardType || '') + '" data-engineering="' + card.isEngineering + '" data-profession="' + card.profession + '" draggable="' + (!card.placed) + '">' + levelBadge + '<span class="card-name" data-full-name="' + card.name + '">' + getFusionDisplayName(card.name) + '</span></div>';
                } else {
                    html += '<div class="selected-card empty">空</div>';
                }
            }
            
            container.innerHTML = html;

            // 直接给每个卡牌元素添加事件监听器
            document.querySelectorAll('#' + container.id + ' .selected-card:not(.empty)').forEach(card => {
                if (!card.classList.contains('placed')) {
                    card.setAttribute('draggable', 'false');
                    card.addEventListener('dragstart', (e) => handleHandDragStart(e, handType));
                    card.addEventListener('click', (e) => handleHandCardClick(e, handType));
                }
                card.addEventListener('contextmenu', (e) => handleHandCardRightClick(e, handType));
            });

            // 为手牌应用皮肤背景（融合卡：主卡整皮 + 被融合卡右下角徽章）
            document.querySelectorAll('#' + container.id + ' .selected-card:not(.empty)').forEach(async card => {
                try { await reapplySingleHandCard(card, card.dataset.id, handType); } catch (e) {}
            });
            
            countEl.textContent = handCards.length + '/' + MAX_HAND_CARDS;
        }

        // 远程皮肤注册表加载完成后，为已上阵/手牌刷新皮肤
        async function refreshAllBattleSlotSkins() {
            const slots = document.querySelectorAll('.battle-slot.filled');
            const jobs = [];
            slots.forEach(slot => {
                const name = getSlotCardName(slot);
                if (!name) return;
                jobs.push((async () => {
                    try { await applySkinBgToSlot(slot, name); } catch (e) {}
                })());
            });
            await Promise.all(jobs);
        }

        window.reapplyAllSkins = async function() {
            console.log('[SKIN] reapplyAllSkins start');
            await refreshAllBattleSlotSkins();
            updateHandDisplay('my');
            updateHandDisplay('teammate');
            console.log('[SKIN] reapplyAllSkins done');
        };

        // 战斗槽拖拽经过
        function handleSlotDragOver(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        }

        // 战斗槽拖拽离开
        function handleSlotDragLeave(e) {
            this.classList.remove('drag-over');
        }

        // 战斗槽放置
        // 把一张卡数据渲染进槽位（含等级徽章 + 皮肤背景）
        async function paintSlotCard(slot, card, isUser) {
            if (!card) { clearSlotVisual(slot); return; }
            const cardId = card.id, cardName = card.name, prof = card.profession, isEng = !!card.isEngineering;
            const cardType = card.type || (typeof findCardTypeById === 'function' ? findCardTypeById(cardId) : '');
            const handType = isUser ? 'my' : 'teammate';
            const levelBadge = cardType ? createLevelBadgeHTML(cardId, cardType, handType, cardName) : '';
            slot.innerHTML = '<span class="card-item" data-profession="' + prof + '">' + levelBadge + '<span class="card-name">' + cardName + '</span></span>';
            slot.classList.add('filled'); slot.classList.remove('empty');
            slot.dataset.cardId = cardId; slot.dataset.profession = prof;
            if (isEng) slot.dataset.engineering = 'true'; else delete slot.dataset.engineering;
            try { await applySkinBgToSlot(slot, cardName); } catch (e) {}
            refreshSlotFusionControl(slot);
        }
        // 清空槽位视觉
        function clearSlotVisual(slot) {
            slot.innerHTML = (slot.dataset.type === 'engineering') ? '<span class="slot-label">🔧</span><span class="slot-empty">空</span>' : '空';
            slot.classList.remove('filled', 'skin-bg'); slot.classList.add('empty');
            delete slot.dataset.cardId; delete slot.dataset.profession; delete slot.dataset.engineering;
            const oldLayer = slot.querySelector('.skin-layer'); if (oldLayer) oldLayer.remove();
        }

        async function handleSlotDrop(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            
            const source = e.dataTransfer.getData('text/source') || (window.__dragPayload && window.__dragPayload.source) || '';
            const cardId = e.dataTransfer.getData('text/id') || (window.__dragPayload && window.__dragPayload.id) || '';
            const cardName = e.dataTransfer.getData('text/plain') || (window.__dragPayload && window.__dragPayload.name) || '';
            const isEngineering = (e.dataTransfer.getData('text/engineer') === 'true') || !!(window.__dragPayload && window.__dragPayload.isEngineering);
            const profession = e.dataTransfer.getData('text/profession') || (window.__dragPayload && window.__dragPayload.profession) || '';
            const slotId = this.dataset.slot;
            const slotType = this.dataset.type;
            const isUserSlot = slotId.startsWith('u');
            const isTeammateSlot = slotId.startsWith('t');
            
            // 验证工程卡位置
            if (slotType === 'engineering' && !isEngineering) {
                this.classList.add('invalid-drop');
                setTimeout(() => this.classList.remove('invalid-drop'), 500);
                return;
            }
            
            if (isEngineering && slotType !== 'engineering') {
                this.classList.add('invalid-drop');
                setTimeout(() => this.classList.remove('invalid-drop'), 500);
                return;
            }
            
            // 精灵球不能上阵
            if (profession === 'pokeball') {
                this.classList.add('invalid-drop');
                setTimeout(() => this.classList.remove('invalid-drop'), 500);
                return;
            }
            
            if (source === 'hand') {
                const handType = e.dataTransfer.getData('text/hand') || (window.__dragPayload && window.__dragPayload.handType) || '';
                if (isUserSlot && handType !== 'my') return;
                if (isTeammateSlot && handType !== 'teammate') return;
            }

            // ===== 卡槽卡 → 卡槽：互换位置 =====
            if (source === 'slot') {
                const fromSlotId = (window.__dragPayload && window.__dragPayload.slotId) || '';
                if (!fromSlotId || fromSlotId === slotId) return;
                const fromSlot = document.querySelector('.battle-slot[data-slot="' + fromSlotId + '"]');
                if (!fromSlot || !fromSlot.classList.contains('filled')) return;
                // 阵营约束：u 槽只与 u 槽换，t 槽只与 t 槽换
                if (slotId.charAt(0) !== fromSlotId.charAt(0)) {
                    this.classList.add('invalid-drop'); setTimeout(() => this.classList.remove('invalid-drop'), 500); return;
                }
                const fromIsEng = fromSlot.dataset.type === 'engineering';
                const toIsEng = slotType === 'engineering';
                if (fromIsEng !== toIsEng) {
                    this.classList.add('invalid-drop'); setTimeout(() => this.classList.remove('invalid-drop'), 500); return;
                }
                const isUser = slotId.startsWith('u');
                const placedArray = isUser ? myPlacedCards : teammatePlacedCards;
                if (!Array.isArray(placedArray)) return;
                const fromCard = placedArray.find(c => c.slot === fromSlotId);
                const toCard = placedArray.find(c => c.slot === slotId);
                if (fromCard) fromCard.slot = slotId;
                if (toCard) toCard.slot = fromSlotId;
                const handCards = isUser ? myHandCards : teammateHandCards;
                if (fromCard) { const h = handCards.find(c => c.id === fromCard.id); if (h) h.placed = slotId; }
                if (toCard) { const h = handCards.find(c => c.id === toCard.id); if (h) h.placed = fromSlotId; }
                await paintSlotCard(this, toCard, isUser);
                if (toCard) {
                    await paintSlotCard(fromSlot, fromCard, isUser);
                } else {
                    clearSlotVisual(fromSlot);
                }
                updateHandDisplay(isUser ? 'my' : 'teammate');
                updateDamageReductionDisplay();
                if (typeof autoSaveProject === 'function') autoSaveProject();
                return;
            }

            if (this.classList.contains('filled')) {
                removeCardFromSlot(slotId);
            }

            if (source === 'pool') {
                const targetHand = isUserSlot ? myHandCards : teammateHandCards;
                if (targetHand.length >= MAX_HAND_CARDS) return;
                
                // 检查是否已存在相同卡牌（含基础卡/融合形态同身份）
                if (targetHand.some(c => c.id === cardId) || handHasIdentity(targetHand, cardName)) {
                    this.classList.add('invalid-drop');
                    setTimeout(() => this.classList.remove('invalid-drop'), 500);
                    return;
                }
                
                if (isEngineering) {
                    const engCount = targetHand.filter(c => c.isEngineering).length;
                    if (engCount >= 2) return;
                } else {
                    const normalCount = targetHand.filter(c => !c.isEngineering).length;
                    if (normalCount >= 9) return;
                }
                
                const poolCard = document.querySelector('.card-item[data-id="' + cardId + '"]');
                const cardType = poolCard ? poolCard.dataset.type : '';
                
                targetHand.push({ id: cardId, name: cardName, placed: slotId, isEngineering, profession, type: cardType });
                
                // 添加等级徽章
                const levelBadge = cardType ? createLevelBadgeHTML(cardId, cardType, isUserSlot ? 'my' : 'teammate', cardName) : '';
                this.innerHTML = '<span class="card-item" data-profession="' + profession + '">' + levelBadge + '<span class="card-name">' + cardName + '</span></span>';
                this.classList.add('filled');
                this.classList.remove('empty');
                this.dataset.cardId = cardId;
                this.dataset.handType = isUserSlot ? 'my' : 'teammate';
                this.dataset.profession = profession;

                try { await applySkinBgToSlot(this, cardName); } catch (e) {}
                refreshSlotFusionControl(this);

                const placedArray = isUserSlot ? myPlacedCards : teammatePlacedCards;
                if (!Array.isArray(placedArray)) {
                    if (isUserSlot) myPlacedCards = [];
                    else teammatePlacedCards = [];
                }
                placedArray.push({ id: cardId, name: cardName, slot: slotId, isEngineering, profession });
                
                updateHandDisplay(isUserSlot ? 'my' : 'teammate');
                updateDamageReductionDisplay(); // 更新减伤显示
            } else if (source === 'hand') {
                const handType = e.dataTransfer.getData('text/hand') || (window.__dragPayload && window.__dragPayload.handType) || '';
                const handCards = handType === 'my' ? myHandCards : teammateHandCards;
                const placedArray = handType === 'my' ? myPlacedCards : teammatePlacedCards;
                if (!Array.isArray(placedArray)) {
                    if (handType === 'my') myPlacedCards = [];
                    else teammatePlacedCards = [];
                }
                
                const cardIndex = handCards.findIndex(c => c.id === cardId);
                if (cardIndex > -1) {
                    // 【修复】一张卡在同一边只能占据一个槽位：放下前先从它已有的槽位移除，
                    // 避免同一张卡被拖到多个卡槽形成重复上阵。
                    const prevSlot = handCards[cardIndex].placed;
                    if (prevSlot && prevSlot !== slotId) {
                        const prevSlotEl = document.querySelector('.battle-slot[data-slot="' + prevSlot + '"]');
                        const prevIdx = placedArray.findIndex(c => c.slot === prevSlot);
                        if (prevIdx > -1) placedArray.splice(prevIdx, 1);
                        if (prevSlotEl) clearSlotVisual(prevSlotEl);
                    }
                    handCards[cardIndex].placed = slotId;
                    const prof = handCards[cardIndex].profession;
                    const cardType = handCards[cardIndex].type || findCardTypeById(cardId);
                    const levelBadge = cardType ? createLevelBadgeHTML(cardId, cardType, handType, cardName) : '';
                    this.innerHTML = '<span class="card-item" data-profession="' + prof + '">' + levelBadge + '<span class="card-name">' + cardName + '</span></span>';
                    this.classList.add('filled');
                    this.classList.remove('empty');
                    this.dataset.cardId = cardId;
                    this.dataset.profession = prof;

                    try { await applySkinBgToSlot(this, cardName); } catch (e) {}
                    refreshSlotFusionControl(this);

                    const existingIndex = placedArray.findIndex(c => c.id === cardId);
                    if (existingIndex > -1) {
                        placedArray[existingIndex].slot = slotId;
                    } else {
                        placedArray.push({ id: cardId, name: cardName, slot: slotId, isEngineering, profession: prof });
                    }
                    
                    updateHandDisplay(handType);
                    updateDamageReductionDisplay(); // 更新减伤显示
                }
            }

            // 上阵数据有变化，自动保存到项目（修复刷新后丢失的问题）
            if (typeof autoSaveProject === 'function') autoSaveProject();
        }

        // 战斗槽点击（移除卡牌）
        function handleSlotClick(e) {
            if (e.target.closest('.card-level-badge')) return;
            if (!this.classList.contains('filled')) return; // 空槽不处理（放卡由手牌点击负责）
            const slotId = this.dataset.slot;
            const isUserSlot = slotId.startsWith('u');
            const _locked = isUserSlot ? myFusionLocked : teammateFusionLocked;
            if (_locked) {
                // 🔒 锁定：单击取下回手牌（编辑完成后整理阵容用）
                removeCardFromSlot(slotId);
                return;
            }
            // 🔓 解锁（编辑中）：单击开融合切换菜单（选/退回/切换，只上不下）
            const handCards = isUserSlot ? myHandCards : teammateHandCards;
            const cardId = this.dataset.cardId;
            const card = handCards.find(c => c.id === cardId);
            const name = card ? card.name : getSlotCardName(this);
            const baseHero = (typeof getMainCardName === 'function') ? getMainCardName(name) : name;
            const variants = getFusionVariantsForBase(baseHero);
            openFusionVariantMenu(this, baseHero, variants, name);
        }

        async function handleSlotRightClick(e) {
            e.preventDefault();
            console.log('[SKIN] handleSlotRightClick fired, slot:', this.dataset.slot, 'filled:', this.classList.contains('filled'));
            if (e.target.closest('.card-level-badge')) { console.log('[SKIN] target is card-level-badge, aborting'); return; }
            if (this.classList.contains('filled')) {
                const slotId = this.dataset.slot;
                const isUserSlot = slotId.startsWith('u');
                const placedArray = isUserSlot ? myPlacedCards : teammatePlacedCards;
                const card = placedArray.find(c => c.slot === slotId);
                console.log('[SKIN] card found:', card ? card.name : 'null', 'slotId:', slotId, 'isUserSlot:', isUserSlot);
                const heroName = card ? (card.name || '') : '';
                const _parts = (typeof getFusionParts === 'function') ? getFusionParts(heroName) : null;
                const isFusionCard = (_parts && _parts.length >= 2);
                const _locked = isUserSlot ? myFusionLocked : teammateFusionLocked;
                // 🔓 解锁：融合卡或可融合单卡 → 全变体副卡皮肤循环（末尾「关闭融合」= 真正还原为单卡）
                if (!_locked) {
                    const baseHero = isFusionCard ? _parts[0] : ((typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName);
                    const variants = (typeof getFusionVariantsForBase === 'function') ? getFusionVariantsForBase(baseHero) : [];
                    if (variants.length > 0) {
                        await _safeCycleFusionSkinOrClose(this, slotId, heroName, baseHero);
                        return;
                    }
                    // 单卡不可融合：继续向下走切主卡皮逻辑
                }
                // 非融合 / 已锁定：右键切换【主卡】皮肤（原逻辑）
                const skinHeroName = isFusionCard ? _parts[0] : (typeof getMainCardName === 'function' ? getMainCardName(heroName) : heroName);
                const skins = skinHeroName && window.getHeroSkins ? window.getHeroSkins(skinHeroName) : [];
                const hasSkinBg = this.classList.contains('skin-bg');
                console.log('[SKIN] heroName:', heroName, 'skinHeroName:', skinHeroName, 'skins count:', skins.length, 'hasSkinBg:', hasSkinBg);
                if (skins.length >= 1) {
                    if (skins.length > 1) {
                        // 多皮肤：循环切换（用 cycleHeroSkin 返回的 nextSkin 直接重渲战斗槽，避免反查依赖陈旧 dataset）
                        const ns = await cycleHeroSkin(skinHeroName, slotId);
                        try { await applySkinBgToSlot(this, heroName, undefined, undefined, ns); } catch (e) { console.error('[SKIN] applySkinBgToSlot error in right-click:', e); }
                        return;
                    }
                    // 单皮肤：切换皮肤开/关
                    const _ht = isUserSlot ? 'my' : 'teammate';
                    const _cid = card ? card.id : null;
                    if (hasSkinBg) {
                        // 关闭皮肤，恢复默认 profession 渐变
                        this.classList.remove('skin-bg');
                        const oldLayer = this.querySelector('.skin-layer');
                        if (oldLayer) oldLayer.remove();
                        // 用空字符串标记默认无皮肤（仅写当前项目卡级皮肤，不污染全局）
                        if (_cid) { try { await setCardSkin(_cid, '', _ht); } catch (e) {} }
                        console.log('[SKIN] Single-skin toggled OFF for', heroName, '(skin key:', skinHeroName, ')');
                    } else {
                        // 打开皮肤（仅写当前项目卡级皮肤，不污染全局）
                        if (_cid) { try { await setCardSkin(_cid, skins[0].name, _ht); } catch (e) {} }
                        try { await applySkinBgToSlot(this, heroName); } catch (e) { console.error('[SKIN] applySkinBgToSlot error in right-click:', e); }
                        console.log('[SKIN] Single-skin toggled ON for', heroName, '(skin key:', skinHeroName, ')');
                    }
                    return;
                }
                // 无皮肤：🔒锁定态不删卡（下卡只走单击）；🔓解锁态才移除卡牌
                if (_locked) { console.log('[SKIN] locked + no skins, ignoring right-click (use single-click to remove)'); return; }
                console.log('[SKIN] No skins available, removing card from slot');
                removeCardFromSlot(slotId);
            } else {
                console.log('[SKIN] slot not filled, ignoring right-click');
            }
        }

        // 循环切换英雄皮肤（包含"默认"选项）
        async function cycleHeroSkin(heroName, slotId) {
            console.log('[SKIN] cycleHeroSkin called:', heroName, slotId);
            const skins = window.getHeroSkins ? window.getHeroSkins(heroName) : [];
            console.log('[SKIN] getHeroSkins result:', skins.length, 'skins:', skins.map(s => s.name));
            if (!skins.length) { console.warn('[SKIN] No skins available, aborting cycle'); return; }
            const baseHero = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : ((window.getBaseHeroName && window.getBaseHeroName(heroName).heroName) || heroName);
            // 先拿到槽位上的卡 id / 阵营，用于读取"当前项目内该卡皮肤"作为循环起点
            const cycleSlot = document.querySelector('.battle-slot[data-slot="' + slotId + '"]');
            const cardId = cycleSlot && cycleSlot.dataset ? cycleSlot.dataset.cardId : null;
            const handType = (cycleSlot && cycleSlot.dataset && cycleSlot.dataset.handType) ? cycleSlot.dataset.handType : 'my';
            // 当前皮肤 = 当前项目该卡已设皮肤（cardSkins 优先）；无则读取全局默认（只读，不写全局）
            let current = (cardId && typeof getCardSkin === 'function') ? (getCardSkin(cardId, heroName, handType) || '') : '';
            if (current === '默认' || current === baseHero) current = ''; // 归一化：默认/英雄同名 → 空(默认档)
            console.log('[SKIN] baseHero:', baseHero, 'current project skin:', current);
            // 循环列表：排除与英雄同名的默认皮肤（'' 即代表默认，避免重复显示同一张图）
            // 如 水灵 skins=[水灵, 刘备·水灵, ...] → cycleList=[刘备·水灵, 其他·水灵, ..., '']
            const cycleList = skins.map(s => s.name).filter(name => name !== baseHero).concat(['']);
            // 如果当前选择是被过滤掉的英雄同名皮肤，视为默认''
            const effectiveCurrent = (current === baseHero) ? '' : current;
            const idx = cycleList.indexOf(effectiveCurrent);
            const nextIdx = (idx + 1) % cycleList.length;
            const nextSkin = cycleList[nextIdx];
            console.log('[SKIN] Cycling from', current || '(default)', 'to', nextSkin || '(default)', '(idx', idx, '->', nextIdx, ')');
            console.log('[SKIN] cycleHeroSkin input: cardId=', cardId, 'handType=', handType, 'heroName=', heroName);
            // 只写当前项目卡级皮肤（cardSkins），绝不调用 selectHeroSkin 污染全局 heroSkinSelections
            if (cardId) {
                try { await setCardSkin(cardId, nextSkin, handType); } catch (e) { console.warn('[SKIN] setCardSkin in cycle failed:', e); }
            }
            // 🔴 关键：写完 cardSkins 后必须立即重渲该卡槽皮肤层（融合路径就是这么做的，单卡漏了导致切皮不渲染）
            const _reSlot = cycleSlot || document.querySelector('.battle-slot[data-slot="' + slotId + '"]');
            if (_reSlot) {
                try { await applySkinBgToSlot(_reSlot, heroName, undefined, undefined, nextSkin); } catch (e) { console.warn('[SKIN] applySkinBgToSlot after cycle failed:', e); }
            }
            if (cycleSlot) {
                console.log('[SKIN] cycleHeroSkin final: cardId=', cardId, 'handType=', handType, 'current=', current, 'nextSkin=', nextSkin);
                const skinLabel = cycleSlot.querySelector('.skin-label') || (() => {
                    const label = document.createElement('span');
                    label.className = 'skin-label';
                    label.style.cssText = 'position:absolute;top:2px;right:2px;font-size:9px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:4px;z-index:4;pointer-events:none;';
                    cycleSlot.appendChild(label);
                    return label;
                })();
                skinLabel.textContent = nextSkin || '默认';
                setTimeout(() => { if (skinLabel.parentNode) skinLabel.remove(); }, 1500);
            }
            return nextSkin;
        }

        // 从槽位移除卡牌
        function removeCardFromSlot(slotId) {
            const slot = document.querySelector('.battle-slot[data-slot="' + slotId + '"]');
            if (!slot) return;
            
            const cardId = slot.dataset.cardId;
            if (!cardId) return;
            
            const isUserSlot = slotId.startsWith('u');
            const handCards = isUserSlot ? myHandCards : teammateHandCards;
            let placedCards = isUserSlot ? myPlacedCards : teammatePlacedCards;
            if (!Array.isArray(placedCards)) {
                placedCards = [];
                if (isUserSlot) myPlacedCards = [];
                else teammatePlacedCards = [];
            }
            
            // 从手牌更新放置状态
            const handIndex = handCards.findIndex(c => c.id === cardId);
            if (handIndex > -1) {
                handCards[handIndex].placed = null;
            }
            
            // 从放置数组删除
            const placedIndex = placedCards.findIndex(c => c.id === cardId);
            if (placedIndex > -1) {
                placedCards.splice(placedIndex, 1);
            }
            
            // 清空槽位
            slot.innerHTML = '';
            slot.classList.remove('filled');
            slot.classList.add('empty');
            delete slot.dataset.cardId;
            delete slot.dataset.profession;
            // 清除皮肤背景
            slot.classList.remove('skin-bg');
            const oldLayer2 = slot.querySelector('.skin-layer');
            if (oldLayer2) oldLayer2.remove();
            
            // 如果是工程槽，恢复提示
            if (slot.dataset.type === 'engineering') {
                slot.innerHTML = '<span class="slot-label">🔧</span><span class="slot-empty">空</span>';
            } else {
                slot.innerHTML = '空';
            }
            
            updateHandDisplay(isUserSlot ? 'my' : 'teammate');
            updateDamageReductionDisplay(); // 更新减伤显示
            // 卡牌移除后自动保存到项目
            if (typeof autoSaveProject === 'function') autoSaveProject();
        }

        // 重置所有选择
        function resetAll() {
            if (!confirm('确定要重置所有选择吗？')) return;
            
            myHandCards = [];
            teammateHandCards = [];
            myPlacedCards = [];
            teammatePlacedCards = [];
            
            localStorage.removeItem('tdjl_myHandCards');
            localStorage.removeItem('tdjl_teammateHandCards');
            localStorage.removeItem('tdjl_myPlacedCards');
            localStorage.removeItem('tdjl_teammatePlacedCards');
            
            // 清空所有战斗槽
            document.querySelectorAll('.battle-slot').forEach(slot => {
                slot.innerHTML = '';
                slot.classList.remove('filled');
                slot.classList.add('empty');
                delete slot.dataset.cardId;
                delete slot.dataset.profession;
                if (slot.dataset.type === 'engineering') {
                    slot.innerHTML = '<span class="slot-label">🔧</span><span class="slot-empty">空</span>';
                } else {
                    slot.innerHTML = '空';
                }
            });
            
            updateHandDisplay('my');
            updateHandDisplay('teammate');
            updateDamageReductionDisplay();
        }
        
        // ==================== 减伤记录功能（多减伤表 v260805-267）====================
        // 支持多张自定义命名的「减伤表」，每张含自己的洗炼减伤 + 战车特殊减伤。
        // 小野/酋长/宝库 仍共享（specialDamageReduction）。
        // 默认两张：「我的」「队友」，按 side 自动选用；可在编辑弹窗里 + 新建 / 重命名 / 删除。
        // 老数据自动迁移：旧的 damageReductionData（localStorage / D盘）会被合入「我的」表。
        let specialDamageReduction = { // 共享：特殊减伤参数（技能减伤，与洗炼不冲突）
            "我的战车": 0,
            "队友战车": 0,
            "小野": 0,
            "酋长": 0,
            "宝库": 0
        };
        window.drTables = {
            '我的': { 洗炼: {}, 我的战车: 0, 队友战车: 0 },
            '队友': { 洗炼: {}, 我的战车: 0, 队友战车: 0 }
        };
        window.drTableOrder = ['我的', '队友'];        // 渲染顺序
        window.drActiveTable = '我的';                  // 弹窗当前编辑对象
        window.drSelectedTables = ['我的', '队友'];    // 弹窗对比视图勾选的表
        // 兼容旧字段：把 drTables['我的'].洗炼 暴露为 damageReductionData，让现有所有读取
        // 点（buildDamageReductionCardsList 等）继续可用，避免大规模替换。
        let damageReductionData = window.drTables['我的'].洗炼;
        let damageReductionDiskLoaded = false; // 磁盘恢复是否已完成首次尝试
        
        // 加载减伤数据（兼容旧键 + 新键）
        function loadDamageReductionData() {
            // 优先读新结构
            const savedV2 = localStorage.getItem('tdjl_dr_tables_v2');
            if (savedV2) {
                try {
                    const data = JSON.parse(savedV2);
                    hydrateDrTables(data);
                    return;
                } catch (e) { /* fallthrough to legacy */ }
            }
            // 回退到老结构（自动迁移到「我的」表）
            const saved = localStorage.getItem('tdjl_damageReduction');
            if (saved) {
                try {
                    const legacy = JSON.parse(saved);
                    if (legacy && typeof legacy === 'object') {
                        window.drTables['我的'].洗炼 = legacy;
                        damageReductionData = window.drTables['我的'].洗炼;
                    }
                } catch (e) { /* ignore */ }
            }
            const savedSpecial = localStorage.getItem('tdjl_specialDamageReduction');
            if (savedSpecial) {
                try {
                    const spec = JSON.parse(savedSpecial);
                    if (spec && typeof spec === 'object') {
                        if (spec["战车"] !== undefined && spec["我的战车"] === undefined) {
                            spec["我的战车"] = spec["战车"];
                            delete spec["战车"];
                        }
                        specialDamageReduction = Object.assign(
                            { "我的战车": 0, "队友战车": 0, "小野": 0, "酋长": 0, "宝库": 0 },
                            spec
                        );
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // ===== 多减伤表：迁移 / 序列化 =====
        // 把 drTables 序列化为存盘结构：{ tables, special, activeTable }
        function serializeDrTables() {
            return {
                tables: JSON.parse(JSON.stringify(window.drTables)),
                order: [...window.drTableOrder],
                special: JSON.parse(JSON.stringify(specialDamageReduction)),
                activeTable: window.drActiveTable,
                selectedTables: [...window.drSelectedTables]
            };
        }

        // 从存盘结构恢复 drTables，并把老的 damageReductionData 平滑迁移到「我的」表
        function hydrateDrTables(data) {
            if (!data || typeof data !== 'object') return;
            // 新结构
            if (data.tables && typeof data.tables === 'object') {
                window.drTables = JSON.parse(JSON.stringify(data.tables));
                if (Array.isArray(data.order) && data.order.length) window.drTableOrder = data.order.filter(n => window.drTables[n]);
                // 兜底：补齐顺序
                Object.keys(window.drTables).forEach(n => {
                    if (!window.drTableOrder.includes(n)) window.drTableOrder.push(n);
                });
                if (window.drActiveTable && window.drTables[window.drActiveTable]) {
                    window.drActiveTable = data.activeTable;
                }
                if (Array.isArray(data.selectedTables)) {
                    window.drSelectedTables = data.selectedTables.filter(n => window.drTables[n]);
                    if (!window.drSelectedTables.length) window.drSelectedTables = [window.drTableOrder[0]];
                }
            } else if (data.damageReductionData && typeof data.damageReductionData === 'object') {
                // 老结构：把 damageReductionData 灌进「我的」表
                window.drTables['我的'].洗炼 = JSON.parse(JSON.stringify(data.damageReductionData));
            }
            if (data.special && typeof data.special === 'object') {
                specialDamageReduction = Object.assign({ "我的战车": 0, "队友战车": 0, "小野": 0, "酋长": 0, "宝库": 0 }, data.special);
            }
            // 同步兼容旧字段
            damageReductionData = window.drTables['我的'].洗炼;
        }

        // 获取指定表的洗炼 DR（兼容未指定，默认 active）
        function getDrTable(name) {
            name = name || window.drActiveTable;
            if (!window.drTables[name]) {
                window.drTables[name] = { 洗炼: {}, 我的战车: 0, 队友战车: 0 };
                if (!window.drTableOrder.includes(name)) window.drTableOrder.push(name);
            }
            return window.drTables[name];
        }

        // 减伤数据 D 盘持久化路径（与 deepsea-rankings.json 同目录），避免 WebView2 缓存失效导致丢失
        const DAMAGE_REDUCTION_FILE = 'D:\\withfriends\\塔防精灵助手数据\\data\\damageReduction.json';

        // 保存减伤数据（兼容老 localStorage 键名，新结构写到新键）
        function saveDamageReductionData() {
            const payload = serializeDrTables();
            localStorage.setItem('tdjl_dr_tables_v2', JSON.stringify(payload));
            // 兼容老键（保持现有读路径能立即看到「我的」表的数据，避免旧调用拿到空）
            localStorage.setItem('tdjl_damageReduction', JSON.stringify(damageReductionData));
            localStorage.setItem('tdjl_specialDamageReduction', JSON.stringify(specialDamageReduction));
            // APP 环境：额外写入 D 盘文件作为可靠真相源；网页版无 window.__TAURI__，仅用 localStorage
            persistDamageReductionToDisk();
        }

        // APP 下异步把减伤数据写入 D 盘（失败静默，不阻塞）
        function persistDamageReductionToDisk() {
            const T = window.__TAURI__ || window.__TAURI_INTERNALS__;
            const invoke = T && (T.core && T.core.invoke || T.invoke);
            if (!invoke) return;
            if (!damageReductionDiskLoaded) return; // 磁盘首次加载完成前，禁止回写，避免把空数据覆盖真数据
            try {
                const payload = serializeDrTables();
                invoke('write_text_file', { filePath: DAMAGE_REDUCTION_FILE, content: JSON.stringify(payload) });
            } catch (e) { /* 忽略写入异常 */ }
        }

        // APP 启动/初始化时：从 D 盘恢复减伤数据并写回 localStorage，确保缓存失效后也不丢
        async function loadDamageReductionFromDisk() {
            const T = window.__TAURI__ || window.__TAURI_INTERNALS__;
            const invoke = T && (T.core && T.core.invoke || T.invoke);
            if (!invoke) { damageReductionDiskLoaded = true; return; }
            try {
                // 注意：Tauri v2 命令参数名为 file_path，JS 侧须用 filePath（或 file_path），不能写 path（匹配不到会报错被吞）
                const txt = await invoke('read_text_file_auto', { filePath: DAMAGE_REDUCTION_FILE });
                const json = JSON.parse(txt);
                if (json && typeof json === 'object') {
                    hydrateDrTables(json);
                    saveDamageReductionData();
                    updateDamageReductionDisplay();
                }
            } catch (e) { /* 文件不存在或解析失败则忽略 */ }
            damageReductionDiskLoaded = true; // 无论成功失败，首次尝试后允许回写磁盘
        }
        
        // 显示减伤记录弹窗
        function showDamageReductionDialog() {
            loadDamageReductionData();
            
            // 获取所有职业分类（排除精灵类 pokeball）
            const professions = ['战士', '法师', '弓箭手', '召唤师', '熊猫', '牧师', '术士', '工程'];
            const professionNames = {
                '战士': 'warrior',
                '法师': 'mage',
                '弓箭手': 'archer',
                '召唤师': 'summoner',
                '熊猫': 'panda',
                '牧师': 'priest',
                '术士': 'warlock',
                '工程': 'engineering'
            };
            
            // 获取每个职业下的卡牌列表
            const cardsByProfession = {};
            professions.forEach(prof => {
                cardsByProfession[prof] = [];
            });
            
            // 完整的99张英雄卡列表（排除精灵卡）
            const allCards = [
                // 金卡 - 战士
                { name: '战将', profession: 'warrior' },
                { name: '刀客', profession: 'warrior' },
                { name: '霸王', profession: 'warrior' },
                { name: '狂龙', profession: 'warrior' },
                { name: '亡将', profession: 'warrior' },
                { name: '领主', profession: 'warrior' },
                { name: '孤星', profession: 'warrior' },
                { name: '狂将', profession: 'warrior' },
                { name: '龙拳', profession: 'warrior' },
                { name: '鱼人', profession: 'warrior' },
                // 金卡 - 法师
                { name: '小丑', profession: 'mage' },
                { name: '女妖', profession: 'mage' },
                { name: '雷神', profession: 'mage' },
                { name: '谜云', profession: 'mage' },
                { name: '女王', profession: 'mage' },
                { name: '沙皇', profession: 'mage' },
                { name: '龟相', profession: 'mage' },
                { name: '阿翼', profession: 'mage' },
                { name: '火神', profession: 'mage' },
                { name: '凤凰', profession: 'mage' },
                { name: '冰鸟', profession: 'mage' },
                // 金卡 - 弓箭手
                { name: '蛇女', profession: 'archer' },
                { name: '炸弹', profession: 'archer' },
                { name: '虎弓', profession: 'archer' },
                { name: '毒王', profession: 'archer' },
                { name: '后羿', profession: 'archer' },
                { name: '船长', profession: 'archer' },
                { name: '爱神', profession: 'archer' },
                { name: '小炮', profession: 'archer' },
                // 金卡 - 召唤师
                { name: '恶魔', profession: 'summoner' },
                { name: '幽灵', profession: 'summoner' },
                { name: '神龙', profession: 'summoner' },
                { name: '龙王', profession: 'summoner' },
                { name: '钟馗', profession: 'summoner' },
                // 金卡 - 牧师
                { name: '咕咕', profession: 'priest' },
                { name: '小野', profession: 'priest' },
                { name: '圣骑', profession: 'priest' },
                { name: '鲛女', profession: 'priest' },
                { name: '天使', profession: 'priest' },
                // 金卡 - 术士
                { name: '影', profession: 'warlock' },
                { name: '魇', profession: 'warlock' },
                { name: '葵', profession: 'warlock' },
                { name: '傀', profession: 'warlock' },
                { name: '邪', profession: 'warlock' },
                { name: '大圣', profession: 'warlock' },
                // 金卡 - 熊猫
                { name: '萌萌', profession: 'panda' },
                { name: '水灵', profession: 'panda' },
                { name: '火灵', profession: 'panda' },
                { name: '风灵', profession: 'panda' },
                // 金卡 - 工程
                { name: '火炮', profession: 'engineering' },
                { name: '宝库', profession: 'engineering' },
                { name: '射线', profession: 'engineering' },
                { name: '咬人娃娃', profession: 'engineering' },
                { name: '潜艇', profession: 'engineering' },
                // 紫卡 - 战士
                { name: '铁骑', profession: 'warrior' },
                { name: '剑客', profession: 'warrior' },
                { name: '斧客', profession: 'warrior' },
                { name: '恶匪', profession: 'warrior' },
                { name: '钢鬃', profession: 'warrior' },
                // 紫卡 - 法师
                { name: '电法', profession: 'mage' },
                { name: '冰法', profession: 'mage' },
                { name: '飞机', profession: 'mage' },
                { name: '炎魔', profession: 'mage' },
                // 紫卡 - 弓箭手
                { name: '海妖', profession: 'archer' },
                { name: '骨弓', profession: 'archer' },
                { name: '火枪', profession: 'archer' },
                { name: '松鼠', profession: 'archer' },
                // 紫卡 - 召唤师
                { name: '悟空', profession: 'summoner' },
                { name: '冰骑', profession: 'summoner' },
                // 紫卡 - 牧师
                { name: '巫医', profession: 'priest' },
                { name: '死神', profession: 'priest' },
                { name: '工匠', profession: 'priest' },
                { name: '地精', profession: 'priest' },
                { name: '萨满', profession: 'priest' },
                { name: '酋长', profession: 'priest' },
                { name: '猫咪', profession: 'priest' },
                // 紫卡 - 术士
                { name: '闪', profession: 'warlock' },
                // 紫卡 - 熊猫
                { name: '土灵', profession: 'panda' },
                // 蓝卡 - 战士
                { name: '刺客', profession: 'warrior' },
                // 蓝卡 - 法师
                { name: '暗法', profession: 'mage' },
                // 蓝卡 - 弓箭手
                { name: '绿弓', profession: 'archer' },
                { name: '蜘蛛', profession: 'archer' },
                // 蓝卡 - 召唤师
                { name: '骨龙', profession: 'summoner' },
                // 蓝卡 - 牧师
                { name: '大树', profession: 'priest' },
                // 绿卡 - 战士
                { name: '神龛', profession: 'warrior' },
                { name: '石头', profession: 'warrior' },
                // 绿卡 - 法师
                { name: '火法', profession: 'mage' },
                // 绿卡 - 弓箭手
                { name: '冰弓', profession: 'archer' },
                // 绿卡 - 召唤师
                { name: '祭司', profession: 'summoner' },
                // 绿卡 - 牧师
                { name: '小鹿', profession: 'priest' },
                // 金卡 - 精灵
                { name: '光精灵', profession: 'pokeball' },
                { name: '木精灵', profession: 'pokeball' },
                { name: '魔精灵', profession: 'pokeball' },
                { name: '魂精灵', profession: 'pokeball' },
                { name: '幻精灵', profession: 'pokeball' },
                { name: '彩精灵', profession: 'pokeball' },
                // 紫卡 - 精灵
                { name: '冰精灵', profession: 'pokeball' },
                { name: '雷精灵', profession: 'pokeball' },
                { name: '暗精灵', profession: 'pokeball' },
                { name: '土精灵', profession: 'pokeball' }
            ];
            
            // 按职业分组并去重排序
            const cardSet = new Set();
            allCards.forEach(card => {
                const profKey = Object.keys(professionNames).find(key => professionNames[key] === card.profession);
                if (profKey && cardsByProfession[profKey] && !cardSet.has(card.name)) {
                    cardsByProfession[profKey].push(card.name);
                    cardSet.add(card.name);
                }
            });
            
            // 对每个职业的卡牌排序
            Object.keys(cardsByProfession).forEach(prof => {
                cardsByProfession[prof].sort();
            });
            
            // 动态添加所有自定义卡牌到减伤列表
            if (typeof customCards !== 'undefined' && customCards) {
                Object.keys(customCards).forEach(key => {
                    const [cardType, profession] = key.split('_');
                    const cards = customCards[key];
                    if (Array.isArray(cards) && profession) {
                        const profKey = Object.keys(professionNames).find(k => professionNames[k] === profession);
                        if (profKey && cardsByProfession[profKey]) {
                            cards.forEach(card => {
                                if (card.name && !cardSet.has(card.name)) {
                                    cardsByProfession[profKey].push(card.name);
                                    cardSet.add(card.name);
                                }
                            });
                        }
                    }
                });
                // 重新排序
                Object.keys(cardsByProfession).forEach(prof => {
                    cardsByProfession[prof].sort();
                });
            }
            
            // 同时从DOM中获取所有已添加的卡牌（确保不遗漏）
            try {
                const allCardElements = document.querySelectorAll('.card-item[data-name][data-profession]');
                allCardElements.forEach(el => {
                    const name = el.dataset.name;
                    const profession = el.dataset.profession;
                    if (!name || !profession || profession === 'pokeball') return;
                    if (cardSet.has(name)) return;
                    const profKey = Object.keys(professionNames).find(k => professionNames[k] === profession);
                    if (profKey && cardsByProfession[profKey]) {
                        cardsByProfession[profKey].push(name);
                        cardSet.add(name);
                    }
                });
                // 重新排序
                Object.keys(cardsByProfession).forEach(prof => {
                    cardsByProfession[prof].sort();
                });
            } catch (err) {
                console.warn('从DOM加载卡牌失败:', err);
            }
            
            // 构建弹窗HTML
            let html = `
                <div id="damageReductionModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;">
                    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:16px;padding:20px;max-width:640px;width:90%;max-height:80vh;overflow-y:auto;border:2px solid rgba(78,205,196,0.3);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                            <h3 style="color:#4ecdc4;margin:0;">🛡️ 减伤记录</h3>
                            <button onclick="document.getElementById('damageReductionModal').remove()" style="background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;">✕</button>
                        </div>
                        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:15px;font-size:0.85rem;color:rgba(255,255,255,0.6);">
                            💡 多张自定义减伤表，<b style="color:#9ad">我的卡组</b>用「我的」表、<b style="color:#9ad">队友卡组</b>用「队友」表；勾选多张参与对比，主界面会同时显示各表在我方/队友侧的总减伤。
                        </div>
                        <div id="drTableHeader" style="background:rgba(78,205,196,0.08);border:1px solid rgba(78,205,196,0.25);border-radius:8px;padding:10px;margin-bottom:12px;">
                            <div style="color:#4ecdc4;font-size:0.85rem;margin-bottom:8px;">📋 减伤表（勾选参与对比，点击表名切换编辑对象）</div>
                            <div id="drTableChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                <button onclick="drAddTable()" style="background:rgba(78,205,196,0.2);border:1px solid rgba(78,205,196,0.4);color:#4ecdc4;padding:6px 10px;border-radius:6px;font-size:0.8rem;">+ 新建表</button>
                                <button onclick="drRenameActiveTable()" style="background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.3);color:#ffd700;padding:6px 10px;border-radius:6px;font-size:0.8rem;">重命名</button>
                                <button onclick="drDeleteActiveTable()" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:6px 10px;border-radius:6px;font-size:0.8rem;">删除表</button>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;margin-bottom:15px;">
                            <select id="professionFilter" onchange="filterDamageReductionCards()" style="background:rgba(30,30,60,0.95);border:1px solid rgba(78,205,196,0.4);color:#fff;padding:8px 12px;border-radius:6px;flex:1;">
                                <option value="all" style="background:rgba(30,30,60,0.95);">全部职业</option>
                                ${professions.map(prof => `<option value="${prof}" style="background:rgba(30,30,60,0.95);">${prof}</option>`).join('')}
                            </select>
                            <button onclick="exportDamageReductionToTxt()" style="background:rgba(74,222,128,0.2);border:1px solid rgba(74,222,128,0.4);color:#4ade80;padding:8px 12px;border-radius:6px;">导出</button>
                            <button onclick="importDamageReductionFromTxt();setTimeout(()=>{filterDamageReductionCards();},500);" style="background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.4);color:#60a5fa;padding:8px 12px;border-radius:6px;">导入</button>
                            <button onclick="clearActiveDrTable()" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#ef4444;padding:8px 12px;border-radius:6px;">清空当前表</button>
                        </div>
                        <div style="background:rgba(255,152,0,0.1);border-radius:8px;padding:12px;margin-bottom:15px;">
                            <div style="color:#ff9800;font-size:0.85rem;margin-bottom:8px;padding:5px;background:rgba(255,152,0,0.1);border-radius:4px;">⚡ 当前表战车减伤 <span style="color:#888">（小野/酋长/宝库共享，编辑在下方）</span></div>
                            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="color:#fff;font-size:0.85rem;">主战车:</span>
                                    <input type="number" data-special="我的战车" value="${(window.drTables[window.drActiveTable] && window.drTables[window.drActiveTable]['我的战车']) || 0}" min="0" max="100" step="0.1" style="width:50px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,152,0,0.4);color:#ff9800;padding:4px 6px;border-radius:4px;text-align:center;font-size:0.8rem;">
                                </div>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="color:#fff;font-size:0.85rem;">副战车:</span>
                                    <input type="number" data-special="队友战车" value="${(window.drTables[window.drActiveTable] && window.drTables[window.drActiveTable]['队友战车']) || 0}" min="0" max="100" step="0.1" style="width:50px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,152,0,0.4);color:#ff9800;padding:4px 6px;border-radius:4px;text-align:center;font-size:0.8rem;">
                                </div>
                            </div>
                            <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-top:8px;">💡 「主战车」算我方卡组，「副战车」算队友卡组。每张表独立保存。</div>
                            <div style="color:#ff9800;font-size:0.85rem;margin:10px 0 6px;padding:5px;background:rgba(255,152,0,0.1);border-radius:4px;">⚡ 共享技能减伤（小野/酋长/宝库 — 被动技能，卡在场上有就算；与上方「卡的洗炼」无关，数值填在这一栏）</div>
                            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="color:#fff;font-size:0.85rem;">小野:</span>
                                    <input type="number" data-shared="小野" value="${specialDamageReduction['小野'] || 0}" min="0" max="100" step="0.1" style="width:50px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,152,0,0.4);color:#ff9800;padding:4px 6px;border-radius:4px;text-align:center;font-size:0.8rem;">
                                </div>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="color:#fff;font-size:0.85rem;">酋长:</span>
                                    <input type="number" data-shared="酋长" value="${specialDamageReduction['酋长'] || 0}" min="0" max="100" step="0.1" style="width:50px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,152,0,0.4);color:#ff9800;padding:4px 6px;border-radius:4px;text-align:center;font-size:0.8rem;">
                                </div>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="color:#fff;font-size:0.85rem;">宝库:</span>
                                    <input type="number" data-shared="宝库" value="${specialDamageReduction['宝库'] || 0}" min="0" max="100" step="0.1" style="width:50px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,152,0,0.4);color:#ff9800;padding:4px 6px;border-radius:4px;text-align:center;font-size:0.8rem;">
                                </div>
                            </div>
                        </div>
                        <div id="drActiveEditLabel" style="display:flex;align-items:center;gap:8px;margin:10px 0;padding:10px 14px;border-radius:8px;font-size:0.95rem;font-weight:bold;"></div>
                        <div id="damageReductionCardsList" style="display:flex;flex-direction:column;gap:8px;">
                            ${buildDamageReductionCardsList('all', cardsByProfession, getDrTable(window.drActiveTable).洗炼)}
                        </div>
                        <div style="display:flex;justify-content:center;margin-top:15px;">
                            <button onclick="saveDamageReductionFromDialog();document.getElementById('damageReductionModal').remove();updateDamageReductionDisplay();" style="background:linear-gradient(135deg,#4ecdc4,#44a08d);color:#1a1a2e;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-weight:bold;">保存</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', html);
            
            // 存储卡牌列表供后续筛选使用
            window._damageReductionCardsByProfession = cardsByProfession;

            // 渲染多减伤表头部 chip + 初始化选中态
            if (!window.drSelectedTables || !window.drSelectedTables.length) {
                window.drSelectedTables = [...window.drTableOrder];
            }
            if (!window.drActiveTable || !window.drTables[window.drActiveTable]) {
                window.drActiveTable = window.drTableOrder[0] || '我的';
            }
            renderDrTableChips();
            updateDrActiveEditLabel();
        }
        
        // 构建减伤卡牌列表
        function buildDamageReductionCardsList(filter, cardsByProfession, currentData) {
            let html = '';
            const professions = Object.keys(cardsByProfession);
            
            professions.forEach(prof => {
                if (filter !== 'all' && filter !== prof) return;
                
                const cards = cardsByProfession[prof];
                if (cards.length === 0) return;
                
                html += `<div style="margin-bottom:10px;">
                    <div style="color:#ffd700;font-size:0.85rem;margin-bottom:5px;padding:5px;background:rgba(255,215,0,0.1);border-radius:4px;">${prof}类 (${cards.length}张)</div>
                    <div style="display:flex;flex-direction:column;gap:4px;">`;
                
                cards.forEach(cardName => {
                    const value = currentData[cardName] || 0;
                    html += `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,0.05);border-radius:6px;">
                            <span style="color:#fff;font-size:0.85rem;">${cardName}</span>
                            <input type="number" 
                                   data-card="${cardName}" 
                                   value="${value}" 
                                   min="0" 
                                   max="100"
                                   step="0.1"
                                   style="width:60px;background:rgba(255,255,255,0.1);border:1px solid rgba(78,205,196,0.3);color:#4ecdc4;padding:4px 8px;border-radius:4px;text-align:center;font-size:0.85rem;"
                                   onchange="this.style.color='#4ecdc4'">
                        </div>
                    `;
                });
                
                html += `</div></div>`;
            });
            
            return html;
        }
        
        // 每张表固定颜色（我的=青、队友=橙、其余=紫），用于高亮区分当前编辑对象
        function drTableColor(name) {
            if (name === '我的') return '#4ecdc4';
            if (name === '队友') return '#ff9800';
            return '#b388ff';
        }

        // 更新弹窗里"正在编辑：XXX 表"的高亮标识
        function updateDrActiveEditLabel() {
            const el = document.getElementById('drActiveEditLabel');
            if (!el) return;
            const name = window.drActiveTable || '我的';
            const color = drTableColor(name);
            const sideNote = name === '我的' ? '（用于「我的卡组」减伤计算）'
                : name === '队友' ? '（用于「队友卡组」减伤计算）' : '';
            el.style.background = `rgba(${hexToRgb(color)},0.12)`;
            el.style.border = `1px solid ${color}`;
            el.innerHTML = `📝 正在编辑：<span style="color:${color};font-size:1.05rem;">${escapeHtml(name)}</span> 表 ${sideNote}`;
        }

        // #xxxxxx → "r,g,b"
        function hexToRgb(hex) {
            const h = hex.replace('#', '');
            const r = parseInt(h.substring(0, 2), 16);
            const g = parseInt(h.substring(2, 4), 16);
            const b = parseInt(h.substring(4, 6), 16);
            return `${r},${g},${b}`;
        }

        // 筛选减伤卡牌（始终按当前激活表筛选，修复"队友表筛选刷不出"的 bug）
        function filterDamageReductionCards() {
            const filter = document.getElementById('professionFilter').value;
            const listContainer = document.getElementById('damageReductionCardsList');
            listContainer.innerHTML = buildDamageReductionCardsList(filter, window._damageReductionCardsByProfession, getDrTable(window.drActiveTable).洗炼);
        }
        
        // 从弹窗保存减伤数据：洗炼写当前激活表，战车写当前激活表，小野/酋长/宝库写共享
        function saveDamageReductionFromDialog() {
            const t = getDrTable(window.drActiveTable);
            const cardInputs = document.querySelectorAll('#damageReductionCardsList input[data-card]');
            cardInputs.forEach(input => {
                const cardName = input.dataset.card;
                const value = parseFloat(input.value) || 0;
                if (value > 0) t.洗炼[cardName] = value; else delete t.洗炼[cardName];
            });

            const chariotInputs = document.querySelectorAll('#damageReductionModal input[data-special]');
            chariotInputs.forEach(input => {
                const key = input.dataset.special;
                t[key] = parseFloat(input.value) || 0;
            });

            const sharedInputs = document.querySelectorAll('#damageReductionModal input[data-shared]');
            sharedInputs.forEach(input => {
                const key = input.dataset.shared;
                specialDamageReduction[key] = parseFloat(input.value) || 0;
            });

            // 兼容别名：当前激活表若为「我的」，同步给 damageReductionData（兼容旧读取点）
            if (window.drActiveTable === '我的') damageReductionData = t.洗炼;

            saveDamageReductionData();
            updateDamageReductionDisplay();
        }
        
        // 清空当前激活表的数据
        function clearActiveDrTable() {
            if (!confirm(`确定要清空「${window.drActiveTable}」表的所有减伤记录吗？`)) return;
            const t = getDrTable(window.drActiveTable);
            t.洗炼 = {};
            t['我的战车'] = 0;
            t['队友战车'] = 0;
            damageReductionData = window.drTables['我的'].洗炼;
            saveDamageReductionData();
            // 局部刷新弹窗列表（不关弹窗）
            const listContainer = document.getElementById('damageReductionCardsList');
            if (listContainer) listContainer.innerHTML = buildDamageReductionCardsList('all', window._damageReductionCardsByProfession, t.洗炼);
            // 同步战车输入框
            const chariotInputs = document.querySelectorAll('#damageReductionModal input[data-special]');
            chariotInputs.forEach(inp => {
                const key = inp.dataset.special;
                inp.value = (typeof t[key] === 'number') ? t[key] : 0;
            });
            updateDamageReductionDisplay();
        }

        // 兼容旧调用名
        function clearAllDamageReduction() { clearActiveDrTable(); }

        // 渲染表头 chip 列表：每张表一个 chip（点 = 切换编辑对象；复选框 = 是否参与对比）
        function renderDrTableChips() {
            const wrap = document.getElementById('drTableChips');
            if (!wrap) return;
            const selected = new Set(window.drSelectedTables || []);
            const html = window.drTableOrder.map(name => {
                const isActive = name === window.drActiveTable;
                const isChecked = selected.has(name);
                const baseColor = drTableColor(name);
                const tagColor = isActive ? baseColor : 'rgba(255,255,255,0.4)';
                const bg = isActive ? `rgba(${hexToRgb(baseColor)},0.2)` : 'rgba(255,255,255,0.05)';
                const border = isActive ? `1px solid ${baseColor}` : '1px solid rgba(255,255,255,0.2)';
                return `<label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:14px;background:${bg};border:${border};cursor:pointer;font-size:0.85rem;color:${tagColor};" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="drToggleSelectTable('${name}', this.checked)" style="cursor:pointer">
                    <span onclick="drSetActiveTable('${name}')" style="cursor:pointer">${escapeHtml(name)}${isActive ? ' ✎' : ''}</span>
                </label>`;
            }).join('');
            wrap.innerHTML = html || '<span style="color:#888;font-size:0.8rem">（暂无表，点 + 新建表）</span>';
        }

        function drSetActiveTable(name) {
            if (!window.drTables[name]) return;
            // 先把当前弹窗未保存的输入同步到旧激活表（避免切表时丢修改）
            syncDialogEditsToActiveTable();
            window.drActiveTable = name;
            refreshDamageReductionDialogContent();
        }
        function drToggleSelectTable(name, checked) {
            const set = new Set(window.drSelectedTables || []);
            if (checked) set.add(name); else set.delete(name);
            if (!set.size && window.drTableOrder.length) set.add(window.drTableOrder[0]);
            window.drSelectedTables = window.drTableOrder.filter(n => set.has(n));
            renderDrTableChips();
        }
        function drAddTable() {
            const name = prompt('给新减伤表起个名字：', '方案' + (window.drTableOrder.length + 1));
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            if (window.drTables[trimmed]) { alert('表名已存在'); return; }
            window.drTables[trimmed] = { 洗炼: {}, 我的战车: 0, 队友战车: 0 };
            if (!window.drTableOrder.includes(trimmed)) window.drTableOrder.push(trimmed);
            if (!window.drSelectedTables.includes(trimmed)) window.drSelectedTables.push(trimmed);
            window.drActiveTable = trimmed;
            saveDamageReductionData();
            refreshDamageReductionDialogContent();
        }
        function drRenameActiveTable() {
            const old = window.drActiveTable;
            const name = prompt('把「' + old + '」改名为：', old);
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed || trimmed === old) return;
            if (window.drTables[trimmed]) { alert('表名已存在'); return; }
            window.drTables[trimmed] = window.drTables[old];
            delete window.drTables[old];
            window.drTableOrder = window.drTableOrder.map(n => n === old ? trimmed : n);
            window.drSelectedTables = window.drSelectedTables.map(n => n === old ? trimmed : n);
            window.drActiveTable = trimmed;
            if (trimmed === '我的' || old === '我的') damageReductionData = window.drTables['我的'].洗炼;
            saveDamageReductionData();
            refreshDamageReductionDialogContent();
        }
        function drDeleteActiveTable() {
            const name = window.drActiveTable;
            if (window.drTableOrder.length <= 1) { alert('至少保留一张表'); return; }
            if (!confirm(`确定删除「${name}」表？此操作不可撤销。`)) return;
            delete window.drTables[name];
            window.drTableOrder = window.drTableOrder.filter(n => n !== name);
            window.drSelectedTables = window.drSelectedTables.filter(n => n !== name);
            window.drActiveTable = window.drTableOrder[0] || '我的';
            if (window.drActiveTable === '我的') damageReductionData = window.drTables['我的'].洗炼;
            saveDamageReductionData();
            refreshDamageReductionDialogContent();
        }

        // 把弹窗里的所有输入（含战车 / 洗炼）写回 window.drActiveTable 的内存对象（不持久化）
        function syncDialogEditsToActiveTable() {
            const t = getDrTable(window.drActiveTable);
            const cardInputs = document.querySelectorAll('#damageReductionCardsList input[data-card]');
            cardInputs.forEach(input => {
                const cardName = input.dataset.card;
                const v = parseFloat(input.value) || 0;
                if (v > 0) t.洗炼[cardName] = v; else delete t.洗炼[cardName];
            });
            const chariotInputs = document.querySelectorAll('#damageReductionModal input[data-special]');
            chariotInputs.forEach(input => {
                const key = input.dataset.special;
                t[key] = parseFloat(input.value) || 0;
            });
        }

        // 切表后重渲染弹窗内容（卡牌列表 + 战车输入框 + 当前表高亮标签）
        function refreshDamageReductionDialogContent() {
            const t = getDrTable(window.drActiveTable);
            const listContainer = document.getElementById('damageReductionCardsList');
            if (listContainer) listContainer.innerHTML = buildDamageReductionCardsList('all', window._damageReductionCardsByProfession, t.洗炼);
            const chariotInputs = document.querySelectorAll('#damageReductionModal input[data-special]');
            chariotInputs.forEach(inp => {
                const key = inp.dataset.special;
                inp.value = (typeof t[key] === 'number') ? t[key] : 0;
            });
            renderDrTableChips();
            updateDrActiveEditLabel();
        }
        
        // 计算卡组的总减伤（洗炼减伤 + 特殊技能减伤）
        // side: 'my' 表示我方卡组，'teammate' 表示队友卡组，默认为 'my'
        function calculateTotalDamageReduction(cardList, side, tableName) {
            if (!side) side = 'my';
            // 选表：side='my' → 「我的」表；side='teammate' → 「队友」表；显式 tableName 优先。
            if (!tableName) {
                tableName = (side === 'teammate') ? '队友' : '我的';
            }
            const table = getDrTable(tableName);
            const tableData = table.洗炼;

            let total = 0;
            const seenCards = new Set(); // 用于洗炼去重

            // 确保 specialDamageReduction 有必要的键
            if (!specialDamageReduction || typeof specialDamageReduction !== 'object') {
                specialDamageReduction = { "我的战车": 0, "队友战车": 0, "小野": 0, "酋长": 0, "宝库": 0 };
            }

            // ========== 第一步：战车特殊减伤（每张表自带 我的战车/队友战车；side 决定取哪一项）==========
            const chariotKey = (side === 'teammate') ? '队友战车' : '我的战车';
            const chariotVal = (table && typeof table[chariotKey] === 'number') ? table[chariotKey] : 0;
            if (chariotVal > 0) total += chariotVal;

            // ========== 第二步：洗炼减伤 + 小野/酋长/宝库的特殊技能减伤（仅上阵时计算）==========
            if (Array.isArray(cardList)) {
                cardList.forEach(card => {
                    // 精灵卡不参与减伤计算
                    if (!card || card.profession === 'pokeball') return;

                    const cardName = card.name || '';
                    if (!cardName) return;

                    const parts = [];
                    let isFusion = false;

                    // 处理融合卡，拆分各部分
                    if (cardName.includes('、') || cardName.includes('+') || cardName.includes(' ')) {
                        const separators = ['、', '+', ' '];
                        for (const sep of separators) {
                            if (cardName.includes(sep)) {
                                const splitParts = cardName.split(sep).map(p => p.trim()).filter(p => p);
                                parts.push(...splitParts);
                                break;
                            }
                        }
                        if (parts.length === 0) parts.push(cardName);
                        isFusion = (parts.length >= 2);
                    } else {
                        parts.push(cardName);
                    }

                    // 洗炼减伤（读指定表）
                    let usedKey = cardName;
                    if (isFusion) {
                        if (tableData[cardName] !== undefined && tableData[cardName] > 0) {
                            usedKey = cardName;
                        } else {
                            usedKey = parts[0];
                        }
                    } else {
                        usedKey = parts[0];
                        // 回退：非分隔符融合卡（如"火炮射线"）→ 匹配基础卡（如"火炮"）
                        if (tableData[usedKey] === undefined || tableData[usedKey] <= 0) {
                            const baseCard = findBaseCardInFusion(usedKey, tableData);
                            if (baseCard) usedKey = baseCard;
                        }
                    }

                    if (!seenCards.has(usedKey)) {
                        seenCards.add(usedKey);
                        // 洗炼减伤永远只算主卡（usedKey=parts[0] 天然排除副卡洗炼）；
                        // 小野/酋长/宝库的技能减伤走下方共享技能栏（出现就算，哪怕副卡），此处不混入。
                        if (tableData[usedKey] && tableData[usedKey] > 0) {
                            total += tableData[usedKey];
                        }
                    }

                    // 特殊技能减伤（小野、酋长、宝库 — 仅上阵时计算，共享表）
                    ['小野', '酋长', '宝库'].forEach(special => {
                        const isMatch = parts.some(part => part.includes(special));
                        if (isMatch) {
                            const seenKey = '_special_' + special;
                            if (!seenCards.has(seenKey)) {
                                seenCards.add(seenKey);
                                if (specialDamageReduction[special] && specialDamageReduction[special] > 0) {
                                    total += specialDamageReduction[special];
                                }
                            }
                        }
                    });
                });
            }

            return parseFloat(total.toFixed(1));
        }

        // 减伤显示：我的卡组用「我的」表、队友卡组用「队友」表；额外渲染勾选表的对比汇总
        function updateDamageReductionDisplay() {
            loadDamageReductionData();

            // 计算我的卡组减伤（用「我的」表）
            const myTotal = calculateTotalDamageReduction(myPlacedCards, 'my', '我的');
            const myEl = document.getElementById('myDamageReduction');
            if (myEl) {
                myEl.textContent = `总减伤:${myTotal}`;
            }

            // 计算队友卡组减伤（用「队友」表）
            const teammateTotal = calculateTotalDamageReduction(teammatePlacedCards, 'teammate', '队友');
            const teammateEl = document.getElementById('teammateDamageReduction');
            if (teammateEl) {
                teammateEl.textContent = `总减伤:${teammateTotal}`;
            }

            // 对比区：展示每张被勾选的表在我方/队友侧的减伤汇总
            renderDrComparisonPanel();
        }

        // 减伤表下拉选项（供各显示处复用）
        function drTableSelectOptions(selected) {
            const order = window.drTableOrder || (window.drTables ? Object.keys(window.drTables) : []);
            return order.map(function (n) {
                return '<option value="' + escapeHtml(n) + '"' + (n === selected ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
            }).join('');
        }
        // 自动生成（活动）减伤按所选表实时重算
        function recomputeAutoGenDr() {
            const sel = document.getElementById('autoGenDrTable');
            const el = document.getElementById('autoGenDrValue');
            if (!sel || !el) return;
            window._autoGenDrTable = sel.value || '我的';
            el.textContent = calculateDamageReductionForCards(window._autoGenBattleCards || [], 'my', window._autoGenDrTable);
        }
        // 自动生成（深海）减伤按所选表实时重算
        function recomputeDungeonDr() {
            const sel = document.getElementById('dungeonDrTable');
            const el = document.getElementById('dungeonDrValue');
            if (!sel || !el) return;
            window._dungeonDrTable = sel.value || '我的';
            el.textContent = calculateDamageReductionForCards(window._dungeonBattleCards || [], 'my', window._dungeonDrTable);
        }

        // 渲染「多减伤表对比」面板：列每张表 × 我方/队友
        function renderDrComparisonPanel() {
            const panel = document.getElementById('drComparisonPanel');
            if (!panel) return;
            const selected = (window.drSelectedTables && window.drSelectedTables.length) ? window.drSelectedTables : window.drTableOrder;
            if (!selected || selected.length < 2) {
                panel.style.display = 'none';
                panel.innerHTML = '';
                return;
            }
            const rows = selected.map(name => {
                const myT = calculateTotalDamageReduction(myPlacedCards, 'my', name);
                const tmT = calculateTotalDamageReduction(teammatePlacedCards, 'teammate', name);
                return `<tr><td>${escapeHtml(name)}</td><td>${myT}%</td><td>${tmT}%</td></tr>`;
            }).join('');
            panel.innerHTML = `<div style="margin-top:8px;font-size:12px;color:#bbb">多减伤表对比</div>
                <table style="width:100%;font-size:12px;color:#fff;border-collapse:collapse">
                    <thead><tr style="color:#9ad"><th style="text-align:left">表名</th><th>我方</th><th>队友</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
            panel.style.display = 'block';
        }
        
        // 切换减伤菜单
        function toggleDamageReductionMenu(btn) {
            const menu = document.getElementById('damageReductionMenu');
            if (menu.style.display === 'none') {
                menu.style.display = 'block';
            } else {
                menu.style.display = 'none';
            }
        }
        
        // 非分隔符融合卡匹配基础卡（如"火炮射线" → "火炮"）
        function findBaseCardInFusion(name, srcData) {
            const data = srcData || damageReductionData;
            if (!data || typeof data !== 'object') return null;
            // 获取所有有减伤值的卡名，按长度降序匹配（优先匹配更长的名称）
            const baseNames = Object.keys(data)
                .filter(k => data[k] > 0 && !k.includes('精灵'))
                .sort((a, b) => b.length - a.length);
            for (const base of baseNames) {
                if (name !== base && name.includes(base)) {
                    return base;
                }
            }
            return null;
        }

        // 计算指定卡牌列表的总减伤（用于脚本解析 / 实时显示）
        // side: 'my' 我方 / 'teammate' 队友，tableName: 显式指定用哪张表
        // 约定：side='my' → 「我的」表；side='teammate' → 「队友」表；显式 tableName 优先。
        function calculateDamageReductionForCards(cardNames, side, tableName) {
            if (!side) side = 'my';
            // 选表
            if (!tableName) {
                tableName = (side === 'teammate') ? '队友' : '我的';
                // 无显式表名时，「我方」默认用「我的」表（与主界面显示一致），「队友」用「队友」表
                if (!window.drTables[tableName]) tableName = '我的';
            }
            const table = getDrTable(tableName);
            const tableData = table.洗炼;

            let total = 0;
            const seenCards = new Set(); // 用于去重

            // 确保 specialDamageReduction 有必要的键
            if (!specialDamageReduction || typeof specialDamageReduction !== 'object') {
                specialDamageReduction = { "我的战车": 0, "队友战车": 0, "小野": 0, "酋长": 0, "宝库": 0 };
            }

            // 战车特殊减伤（每张表自带 我的战车/队友战车；side 决定取哪一项）
            // 这样「我的」表里既能配自己的战车也能配队友战车的减伤，方便对比。
            const chariotKey = (side === 'teammate') ? '队友战车' : '我的战车';
            const chariotVal = (table && typeof table[chariotKey] === 'number') ? table[chariotKey] : 0;
            if (chariotVal > 0) total += chariotVal;

            if (Array.isArray(cardNames)) {
                cardNames.forEach(name => {
                    if (!name || typeof name !== 'string') return;
                    // 精灵卡不参与
                    if (name.includes('精灵')) return;

                    const parts = [];
                    let isFusion = false;

                    // 处理融合卡，拆分各部分
                    if (name.includes('、') || name.includes('+') || name.includes(' ')) {
                        const separators = ['、', '+', ' '];
                        for (const sep of separators) {
                            if (name.includes(sep)) {
                                const splitParts = name.split(sep).map(p => p.trim()).filter(p => p);
                                parts.push(...splitParts);
                                break;
                            }
                        }
                        if (parts.length === 0) parts.push(name);
                        isFusion = (parts.length >= 2);
                    } else {
                        parts.push(name);
                    }

                    // 洗炼减伤（读当前表）
                    let usedKey = name;
                    if (isFusion) {
                        if (tableData[name] !== undefined && tableData[name] > 0) {
                            usedKey = name;
                        } else {
                            usedKey = parts[0];
                        }
                    } else {
                        usedKey = parts[0];
                        // 回退：非分隔符融合卡（如"火炮射线"）→ 匹配基础卡（如"火炮"）
                        if (tableData[usedKey] === undefined || tableData[usedKey] <= 0) {
                            const baseCard = findBaseCardInFusion(usedKey, tableData);
                            if (baseCard) usedKey = baseCard;
                        }
                    }

                    if (!seenCards.has(usedKey)) {
                        seenCards.add(usedKey);
                        // 洗炼减伤永远只算主卡（usedKey=parts[0] 天然排除副卡洗炼）；
                        // 小野/酋长/宝库的技能减伤走下方共享技能栏（出现就算，哪怕副卡），此处不混入。
                        if (tableData[usedKey] && tableData[usedKey] > 0) {
                            total += tableData[usedKey];
                        }
                    }

                    // 特殊技能减伤（小野、酋长、宝库 — 仅上阵时计算，共享表）
                    ['小野', '酋长', '宝库'].forEach(special => {
                        const isMatch = parts.some(part => part.includes(special));
                        if (isMatch) {
                            const seenKey = '_special_' + special;
                            if (!seenCards.has(seenKey)) {
                                seenCards.add(seenKey);
                                if (specialDamageReduction[special] && specialDamageReduction[special] > 0) {
                                    total += specialDamageReduction[special];
                                }
                            }
                        }
                    });
                });
            }

            return parseFloat(total.toFixed(1));
        }
        
        // 实时更新解析区的减伤显示（前7张卡 / 全部卡）
        function updateRealTimeDamageReduction() {
            const input = document.getElementById('parserInput');
            const display = document.getElementById('parserDrDisplay');
            const first7El = document.getElementById('parserDrFirst7');
            const allEl = document.getElementById('parserDrAll');
            const detailEl = document.getElementById('parserDrDetail');
            if (!input || !display || !first7El || !allEl) return;
            
            const text = input.value.trim();
            if (!text) {
                display.style.display = 'none';
                return;
            }
            
            // 确保减伤数据已加载
            loadDamageReductionData();
            
            // 提取卡牌名称
            let cardNames = [];
            const match = text.match(/上阵[：:]\s*(.+)/);
            if (match && match[1]) {
                cardNames = match[1].split(/[,，、]/).map(n => n.trim()).filter(n => n);
            } else {
                cardNames = text.split(/[,，、\n]/).map(n => n.trim()).filter(n => n);
            }
            
            if (cardNames.length === 0) {
                display.style.display = 'none';
                return;
            }
            
            // 过滤掉精灵卡（精灵不参与减伤计算）
            const isSpirit = (name) => name.includes('精灵') || name === '幻球' || name === '冰球';
            const battleCards = cardNames.filter(c => !isSpirit(c));
            
            if (battleCards.length === 0) {
                display.style.display = 'none';
                return;
            }
            
            // 全部卡减伤（按「脚本解析面板」选中的减伤表计算）
            const parserTable = (window._parserDrTable) || '我的';
            const allDr = calculateDamageReductionForCards(battleCards, 'my', parserTable);
            
            // 前7张卡减伤
            const first7 = battleCards.slice(0, 7);
            const first7Dr = calculateDamageReductionForCards(first7, 'my', parserTable);
            
            // 显示结果
            display.style.display = 'block';
            // 确保减伤表下拉有选项（首次显示时填充，记忆上次选择）
            const drSelect = document.getElementById('parserDrTable');
            if (drSelect && drSelect.options.length === 0) {
                if (!window._parserDrTable) window._parserDrTable = '我的';
                drSelect.innerHTML = drTableSelectOptions(window._parserDrTable);
            } else if (drSelect && window._parserDrTable && drSelect.value !== window._parserDrTable) {
                drSelect.value = window._parserDrTable;
            }
            first7El.textContent = `${first7Dr}%`;
            allEl.textContent = `${allDr}%`;
            
            // 高亮低减伤的等级
            if (first7Dr < 100) first7El.style.color = '#ff6b6b';
            else if (first7Dr < 130) first7El.style.color = '#ffd700';
            else first7El.style.color = '#4ecdc4';
            
            if (allDr < 100) allEl.style.color = '#ff6b6b';
            else if (allDr < 130) allEl.style.color = '#ffd700';
            else allEl.style.color = '#4ecdc4';
            
            // 每张卡的减伤明细
            const details = battleCards.slice(0, 15).map(name => {
                const dr = calculateDamageReductionForCards([name], 'my', parserTable);
                return `${name}:<b style="color:${dr < 30 ? '#ff6b6b' : dr < 50 ? '#ffd700' : '#4ecdc4'}">${dr}%</b>`;
            });
            detailEl.innerHTML = '📋 单卡减伤：' + details.join(' | ');
        }
        
        // 从脚本内容中提取减伤信息（供标签栏显示用）
        function computeScriptDr(content, tableName) {
            if (!content || !content.trim()) return null;
            loadDamageReductionData();
            const tbl = tableName || '我的';
            const lines = content.split('\n');
            let cardNames = [];
            for (const line of lines) {
                const m = line.match(/上阵[：:]\s*(.+)/);
                if (m && m[1]) {
                    cardNames = cardNames.concat(m[1].split(/[,，、]/).map(n => n.trim()).filter(n => n));
                }
            }
            const isSpirit = (n) => n.includes('精灵') || n === '幻球' || n === '冰球';
            const battleCards = cardNames.filter(c => !isSpirit(c));
            if (battleCards.length === 0) return null;
            const allDr = calculateDamageReductionForCards(battleCards, 'my', tbl);
            const first7 = battleCards.slice(0, 7);
            const first7Dr = calculateDamageReductionForCards(first7, 'my', tbl);
            return { first7: first7Dr, all: allDr };
        }
        window.computeScriptDr = computeScriptDr;
        window.calculateDamageReductionForCards = calculateDamageReductionForCards;
        window.loadDamageReductionData = loadDamageReductionData;

        // 构建窗口标题栏减伤徽章 HTML
        function buildWindowDrBadge(drInfo) {
            if (!drInfo) return '';
            const f7c = drInfo.first7 < 100 ? '#ff6b6b' : drInfo.first7 < 130 ? '#ffd700' : '#4ecdc4';
            const ac = drInfo.all < 100 ? '#ff6b6b' : drInfo.all < 130 ? '#ffd700' : '#4ecdc4';
            return `🛡前7:<b style="color:${f7c}">${drInfo.first7}%</b> 全:<b style="color:${ac}">${drInfo.all}%</b>`;
        }

        // 更新浮窗标题栏减伤徽章（跟随该脚本窗口自己选的减伤表）
        function updateWindowTitleDr(windowId, content) {
            const titleEl = document.getElementById(`${windowId}_titleDr`);
            if (!titleEl) return;
            const tbl = (window.__drTableByEditor && window.__drTableByEditor[windowId]) ? window.__drTableByEditor[windowId] : '我的';
            const drInfo = computeScriptDr(content, tbl);
            titleEl.innerHTML = buildWindowDrBadge(drInfo);
        }

        // 编辑器实时减伤显示
        function updateEditorDamageReduction(windowId) {
            const textarea = document.getElementById(`${windowId}_content`);
            const drBar = document.getElementById(`${windowId}_drBar`);
            const first7El = document.getElementById(`${windowId}_drFirst7`);
            const allEl = document.getElementById(`${windowId}_drAll`);
            const tableSel = document.getElementById(`${windowId}_drTable`);
            if (!textarea || !drBar || !first7El || !allEl) return;

            // 记忆每个脚本窗口选中的减伤表
            let tableName = (window.drActiveTable && window.drTables[window.drActiveTable]) ? window.drActiveTable : '我的';
            if (tableSel) {
                if (tableSel.value) {
                    tableName = tableSel.value;
                    window.__drTableByEditor = window.__drTableByEditor || {};
                    window.__drTableByEditor[windowId] = tableName;
                }
            }

            const text = textarea.value.trim();
            if (!text) {
                drBar.style.display = 'none';
                return;
            }
            
            loadDamageReductionData();
            
            // 尝试提取上阵行
            let cardNames = [];
            const lines = text.split('\n');
            for (const line of lines) {
                const match = line.match(/上阵[：:]\s*(.+)/);
                if (match && match[1]) {
                    cardNames = cardNames.concat(match[1].split(/[,，、]/).map(n => n.trim()).filter(n => n));
                }
            }
            
            if (cardNames.length === 0) {
                // 没有「上阵：」行也让减伤栏（含减伤表下拉）可见，方便选择表；仅减伤值显示占位
                drBar.style.display = 'flex';
                first7El.textContent = '--';
                allEl.textContent = '--';
                first7El.style.color = 'rgba(255,255,255,0.5)';
                allEl.style.color = 'rgba(255,255,255,0.5)';
                return;
            }
            
            const isSpirit = (name) => name.includes('精灵') || name === '幻球' || name === '冰球';
            const battleCards = cardNames.filter(c => !isSpirit(c));
            
            if (battleCards.length === 0) {
                drBar.style.display = 'flex';
                first7El.textContent = '--';
                allEl.textContent = '--';
                first7El.style.color = 'rgba(255,255,255,0.5)';
                allEl.style.color = 'rgba(255,255,255,0.5)';
                return;
            }
            
            // 按选中的减伤表计算（脚本编辑器默认算「我方」侧，side='my' 映射到对应表）
            const allDr = calculateDamageReductionForCards(battleCards, 'my', tableName);
            const first7 = battleCards.slice(0, 7);
            const first7Dr = calculateDamageReductionForCards(first7, 'my', tableName);
            
            drBar.style.display = 'flex';
            first7El.textContent = `${first7Dr}%`;
            allEl.textContent = `${allDr}%`;
            
            first7El.style.color = first7Dr < 100 ? '#ff6b6b' : first7Dr < 130 ? '#ffd700' : '#4ecdc4';
            allEl.style.color = allDr < 100 ? '#ff6b6b' : allDr < 130 ? '#ffd700' : '#4ecdc4';
        }

        // 导出减伤记录为TXT文件（导出当前激活表；战车导出表内的两个值，小野/酋长/宝库导出共享）
        function exportDamageReductionToTxt() {
            loadDamageReductionData();
            const t = getDrTable(window.drActiveTable);
            const tableData = t.洗炼;
            const safeName = (window.drActiveTable || '我的').replace(/[\\/:*?"<>|]/g, '_');

            let content = '# 减伤记录配置文件\n';
            content += `# 表名：${window.drActiveTable}\n`;
            content += '# 格式：卡牌名=减伤数值（支持小数，如 10.5）\n';
            content += '# 战车：我的战车（主）、队友战车（副） — 写入当前表\n';
            content += '# 共享技能：小野 / 酋长 / 宝库 — 全局共享\n';
            content += '# 示例：水灵=10.5\n';
            content += '# 精灵卡不参与减伤计算\n';
            content += '# 导出时间：' + new Date().toLocaleString('zh-CN') + '\n\n';

            // 导出当前表的战车
            content += '===== 当前表 战车减伤 =====\n';
            content += `我的战车=${t['我的战车'] || 0}\n`;
            content += `队友战车=${t['队友战车'] || 0}\n`;

            // 导出共享技能减伤
            content += '\n===== 共享 技能减伤 =====\n';
            const sharedKeys = ['小野', '酋长', '宝库'];
            sharedKeys.forEach(key => {
                content += `${key}=${specialDamageReduction[key] || 0}\n`;
            });

            // 导出洗炼减伤数据
            content += '\n===== 洗炼减伤 =====\n';
            const sortedCards = Object.keys(tableData).sort();
            sortedCards.forEach(cardName => {
                content += `${cardName}=${tableData[cardName]}\n`;
            });

            const fileName = `减伤记录_${safeName}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
            const isTauri = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
            if (isTauri) {
                _downloadScriptTauri(fileName, content);
            } else {
                _downloadScriptBlob(fileName, content);
            }
        }

        // 导入减伤记录从TXT文件（弹窗选择导入到哪张表）
        function importDamageReductionFromTxt() {
            const options = window.drTableOrder.map(n => `${n}:导入到「${n}」表`).join('\n');
            const choice = prompt(`要把 TXT 减伤导入到哪张表？\n当前激活（选中）的表是：「${window.drActiveTable}」\n\n可用表名：\n${options}\n\n直接回车 = 导入到当前激活的表「${window.drActiveTable}」；\n也可输入其它已存在的表名导入到那张表。`, window.drActiveTable || '');
            let target = (choice || '').trim();
            if (!target) target = window.drActiveTable || '我的';
            if (!window.drTables[target]) {
                alert(`表「${target}」不存在，请先在头部新建。`);
                return;
            }
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt';
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(event) {
                    parseDamageReductionTxt(event.target.result, target);
                };
                reader.readAsText(file);
            };
            input.click();
        }

        // 解析减伤TXT文件，写入指定表（targetTable）
        function parseDamageReductionTxt(content, targetTable) {
            targetTable = targetTable || window.drActiveTable || '我的';
            const t = getDrTable(targetTable);
            const lines = content.split('\n');
            const newData = {};
            const newSpecial = { 我的战车: 0, 队友战车: 0, 小野: 0, 酋长: 0, 宝库: 0 };
            const chariotKeys = ['我的战车', '队友战车'];
            const sharedKeys = ['小野', '酋长', '宝库'];

            lines.forEach(line => {
                if (line.startsWith('#') || line.trim() === '') return;
                if (line.includes('=====')) return;
                const match = line.match(/^([^=]+)=(\d+(?:\.\d+)?)$/);
                if (match) {
                    let cardName = match[1].trim();
                    const value = parseFloat(match[2]);
                    if (cardName === '战车') cardName = '我的战车';
                    if (!cardName || isNaN(value)) return;
                    if (chariotKeys.includes(cardName)) {
                        // 当前表的战车
                        t[cardName] = value;
                    } else if (sharedKeys.includes(cardName)) {
                        newSpecial[cardName] = value;
                    } else {
                        newData[cardName] = value;
                    }
                }
            });

            // 合并（不清空已有数据，覆盖同名键；想清空请用「清空当前表」）
            Object.assign(t.洗炼, newData);
            // 共享：覆盖小野/酋长/宝库（保留我的战车/队友战车共享值不动，避免误覆盖）
            Object.assign(specialDamageReduction, newSpecial);

            // 兼容别名
            if (targetTable === '我的') damageReductionData = t.洗炼;

            saveDamageReductionData();
            updateDamageReductionDisplay();

            // 刷新弹窗当前列表
            const listContainer = document.getElementById('damageReductionCardsList');
            if (listContainer) listContainer.innerHTML = buildDamageReductionCardsList('all', window._damageReductionCardsByProfession, t.洗炼);
            const chariotInputs = document.querySelectorAll('#damageReductionModal input[data-special]');
            chariotInputs.forEach(inp => {
                const key = inp.dataset.special;
                inp.value = (typeof t[key] === 'number') ? t[key] : 0;
            });
            const sharedInputs = document.querySelectorAll('#damageReductionModal input[data-shared]');
            sharedInputs.forEach(inp => {
                const key = inp.dataset.shared;
                inp.value = specialDamageReduction[key] || 0;
            });

            const count = Object.keys(newData).length;
            const specialCount = sharedKeys.filter(k => newSpecial[k] > 0).length;
            const chariotCount = chariotKeys.filter(k => t[k] > 0).length;
            const msg = [];
            if (count) msg.push(`洗炼${count}条`);
            if (chariotCount) msg.push(`战车${chariotCount}条`);
            if (specialCount) msg.push(`共享技能${specialCount}条`);
            if (msg.length) {
                alert(`已导入到「${targetTable}」表：${msg.join('，')}`);
            } else {
                alert('未找到有效的减伤记录');
            }
        }

        function toggleSection(header) {
            header.classList.toggle('open');
            const content = header.nextElementSibling;
            content.classList.toggle('open');

            const section = header.closest('.collapsible-section');
            const sectionClass = section.classList[1];

            const icons = header.querySelector('.toggle-icon');
            if (header.classList.contains('open')) {
                icons.textContent = '▲';
                content.style.display = 'block';
            } else {
                icons.textContent = '▼';
                content.style.display = 'none';
            }

            if (sectionClass === 'favorite') {
                const isOpen = header.classList.contains('open');
                localStorage.setItem('tdjl_favorite_open', isOpen);
            }

            // 保存记事本展开状态
            if (sectionClass && sectionClass !== 'favorite') {
                const isNotepadSection = section.querySelector('#notepad');
                if (isNotepadSection) {
                    const isOpen = header.classList.contains('open');
                    localStorage.setItem('tdjl_notepad_open', isOpen);
                }
            }
        }

        let customCards = {};
        
        function loadCustomCards() {
            const saved = localStorage.getItem('tdjl_customCards');
            if (saved) {
                customCards = JSON.parse(saved);
                let needSave = false;
                let needSaveFavorites = false;
                
                Object.keys(customCards).forEach(key => {
                    const [cardType, profession] = key.split('_');
                    customCards[key].forEach(card => {
                        if (!card.cardType) { card.cardType = cardType; needSave = true; }
                        if (!card.profession) { card.profession = profession; needSave = true; }
                        if (!card.id || !card.id.startsWith('custom_')) {
                            const oldId = card.id;
                            card.id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                            needSave = true;
                            
                            if (oldId) {
                                const savedFav = localStorage.getItem('tdjl_favoriteCards');
                                if (savedFav) {
                                    let favs = JSON.parse(savedFav);
                                    favs.forEach(fav => {
                                        if (fav.id === oldId) {
                                            fav.id = card.id;
                                            needSaveFavorites = true;
                                        }
                                    });
                                    if (needSaveFavorites) {
                                        localStorage.setItem('tdjl_favoriteCards', JSON.stringify(favs));
                                    }
                                }
                            }
                        }
                    });
                });
                
                if (needSave) {
                    localStorage.setItem('tdjl_customCards', JSON.stringify(customCards));
                }
                
                Object.keys(customCards).forEach(key => {
                    const [cardType, profession] = key.split('_');
                    customCards[key].forEach(card => {
                        addCardToGrid(card.name, card.id, card.cardType || cardType, card.profession || profession, false);
                    });
                });
            }
        }
        
        // 保存自定义卡牌
        function saveCustomCards() {
            localStorage.setItem('tdjl_customCards', JSON.stringify(customCards));
        }
        
        function addCardToGrid(name, id, cardType, profession, save = true) {
            const profMap = {'战士': 'warrior', '法师': 'mage', '射手': 'archer', '召唤': 'summoner', '牧师': 'priest', '术士': 'warlock', '熊猫': 'panda', '精灵球': 'pokeball', '工程': 'engineering'};
            const profName = Object.keys(profMap).find(k => profMap[k] === profession);
            
            const targetSection = Array.from(document.querySelectorAll(`.collapsible-section.${cardType} .profession-section h4`)).find(h4 => {
                return h4.textContent.includes(profName);
            });
            
            if (!targetSection) {
                console.warn('找不到目标职业区域:', cardType, profession, profName);
                return;
            }
            
            const grid = targetSection.nextElementSibling;
            const cardEl = document.createElement('div');
            cardEl.className = 'card-item';
            cardEl.dataset.id = id;
            cardEl.dataset.name = name;
            cardEl.dataset.type = cardType;
            cardEl.dataset.profession = profession;
            cardEl.dataset.engineering = (profession === 'engineering') ? 'true' : 'false';
                
                const levelBadge = createLevelBadgeHTML(id, cardType, 'my', name);
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-card-btn';
                deleteBtn.textContent = '×';
                deleteBtn.style.cssText = 'position:absolute;bottom:2px;left:2px;background:rgba(244,67,54,0.9);border:none;color:white;border-radius:50%;width:16px;height:16px;cursor:pointer;font-size:0.7rem;line-height:1;z-index:5;';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteCustomCard(e, id, cardType, profession);
                };
                
            cardEl.innerHTML = levelBadge + name;
            cardEl.appendChild(deleteBtn);
            cardEl.style.position = 'relative';
            grid.appendChild(cardEl);
            
            cardEl.setAttribute('draggable', 'true');
            setupLongPress(cardEl, (e) => handleCardRightClick(e, cardEl));
            
            if (save) {
                const key = `${cardType}_${profession}`;
                if (!customCards[key]) customCards[key] = [];
                customCards[key].push({id, name, cardType, profession});
                saveCustomCards();
                
                // 自动初始化自定义卡牌的减伤记录（默认为0）
                loadDamageReductionData();
                if (damageReductionData[name] === undefined) {
                    damageReductionData[name] = 0;
                    saveDamageReductionData();
                }
            }
        }
        
        // 长按事件处理 - 手机版收藏功能
        let longPressTimer = null;
        
        function setupLongPress(card, callback) {
            let isLongPress = false;
            
            card.addEventListener('touchstart', (e) => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    callback(e);
                }, 500); // 500ms长按触发
            });
            
            card.addEventListener('touchend', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            card.addEventListener('touchmove', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            card.addEventListener('touchcancel', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
        }
        
        function loadFavorites() {
            const saved = localStorage.getItem('tdjl_favoriteCards');
            const savedOrder = localStorage.getItem('tdjl_professionOrder');
            if (saved) {
                favoriteCards = JSON.parse(saved);
                
                let needSave = false;
                favoriteCards = favoriteCards.filter(fav => {
                    if (!fav.id) return false;
                    if (!fav.type && fav.cardType) { fav.type = fav.cardType; needSave = true; }
                    if (!fav.type) { fav.type = 'custom'; needSave = true; }
                    if (fav.isEngineering === undefined) { fav.isEngineering = false; needSave = true; }
                    if (!fav.profession) { fav.profession = 'unknown'; needSave = true; }
                    return true;
                });
                
                if (needSave) {
                    localStorage.setItem('tdjl_favoriteCards', JSON.stringify(favoriteCards));
                }
            }
            if (savedOrder) {
                professionOrder = JSON.parse(savedOrder);
            }
            
            favoriteCards.forEach(fav => {
                let card = document.querySelector(`.card-item[data-id="${fav.id}"]`);
                if (!card && fav.name) {
                    card = document.querySelector(`.card-item[data-name="${fav.name}"][data-type="${fav.type}"]`);
                    if (card) {
                        fav.id = card.dataset.id;
                        localStorage.setItem('tdjl_favoriteCards', JSON.stringify(favoriteCards));
                    }
                }
                if (card) {
                    card.classList.add('favorite-card');
                }
            });
            
            updateFavoritesDisplay();
        }
        
        // 删除自定义卡牌
        function deleteCustomCard(e, id, cardType, profession) {
            e.stopPropagation();
            if (!confirm('确定删除这张卡牌吗？')) return;
            
            const cardEl = document.querySelector(`.card-item[data-id="${id}"]`);
            let cardName = null;
            if (cardEl) {
                cardName = cardEl.dataset.name;
                cardEl.remove();
            }
            
            const key = `${cardType}_${profession}`;
            if (customCards[key]) {
                // 找到要删除的卡牌名
                const removedCard = customCards[key].find(c => c.id === id);
                if (removedCard && !cardName) cardName = removedCard.name;
                
                customCards[key] = customCards[key].filter(c => c.id !== id);
                saveCustomCards();
                
                // 清理该自定义卡牌的减伤记录（如果减伤值为0则删除，否则保留设置）
                if (cardName) {
                    loadDamageReductionData();
                    if (damageReductionData[cardName] !== undefined && damageReductionData[cardName] === 0) {
                        delete damageReductionData[cardName];
                        saveDamageReductionData();
                    }
                }
            }
        }
        
        // 显示添加卡牌弹窗
        let currentAddCardInfo = null;
        function showAddCardModal(cardType, profession) {
            currentAddCardInfo = {cardType, profession};
            const modal = document.createElement('div');
            modal.className = 'add-card-modal';
            modal.id = 'addCardModal';
            modal.innerHTML = `
                <div class="add-card-modal-content">
                    <h3>➕ 添加新卡牌</h3>
                    <input type="text" id="newCardName" placeholder="请输入卡牌名称" maxlength="10">
                    <div class="add-card-modal-buttons">
                        <button class="modal-cancel-btn" onclick="closeAddCardModal()">取消</button>
                        <button class="modal-confirm-btn" onclick="confirmAddCard()">确认添加</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('newCardName').focus();
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeAddCardModal();
            });
        }
        
        function closeAddCardModal() {
            const modal = document.getElementById('addCardModal');
            if (modal) modal.remove();
        }
        
        function confirmAddCard() {
            const name = document.getElementById('newCardName').value.trim();
            if (!name) {
                alert('请输入卡牌名称');
                return;
            }
            const id = 'custom_' + Date.now();
            addCardToGrid(name, id, currentAddCardInfo.cardType, currentAddCardInfo.profession);
            closeAddCardModal();
        }
        
        // 添加按钮点击事件
        function setupAddCardButtons() {
            document.querySelectorAll('.profession-section h4').forEach(h4 => {
                const profMap = {'战士': 'warrior', '法师': 'mage', '射手': 'archer', '召唤': 'summoner', '牧师': 'priest', '术士': 'warlock', '熊猫': 'panda', '精灵球': 'pokeball', '工程': 'engineering'};
                const section = h4.closest('.profession-section');
                const collapsibleSection = section?.closest('.collapsible-section');
                if (!collapsibleSection) return;
                
                const cardType = collapsibleSection.classList[1];
                const professionText = h4.textContent.split(' ').pop().trim();
                const profession = profMap[professionText];
                
                if (cardType && profession) {
                    const btn = document.createElement('button');
                    btn.className = 'add-card-btn';
                    btn.textContent = '+ 添加';
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        showAddCardModal(cardType, profession);
                    };
                    h4.appendChild(btn);
                }
            });
        }
        
        // 卡牌拖动排序
        let draggedCard = null;
        // 拖拽数据兜底：WebView2 下自定义 MIME 的 getData 常返回空，用全局变量回退
        window.__dragPayload = null;
        let cardOrder = {}; // 存储卡牌顺序
        
        // 加载卡牌顺序
        function loadCardOrder() {
            const saved = localStorage.getItem('tdjl_cardOrder');
            if (saved) {
                cardOrder = JSON.parse(saved);
            }
        }
        
        // 保存卡牌顺序
        function saveCardOrder() {
            localStorage.setItem('tdjl_cardOrder', JSON.stringify(cardOrder));
        }
        
        // 应用卡牌顺序
        function applyCardOrder() {
            // 应用卡池卡牌顺序
            document.querySelectorAll('.collapsible-section .profession-section').forEach(section => {
                const grid = section.querySelector('.cards-grid');
                if (!grid) return;
                
                const profession = section.querySelector('h4').textContent.trim();
                const key = profession.replace(/[⚔️🔮🏹🐉⛪🌑🐼🔧🔴]/g, '').trim();
                const order = cardOrder.pool?.[key];
                
                if (order && Array.isArray(order)) {
                    const cards = [...grid.querySelectorAll('.card-item')];
                    cards.forEach(card => {
                        const index = order.indexOf(card.dataset.id);
                        if (index !== -1) {
                            card.style.order = index;
                        }
                    });
                }
            });
            
            // 应用收藏卡牌顺序
            document.querySelectorAll('.favorite-group').forEach(group => {
                const header = group.querySelector('.favorite-group-header');
                const grid = group.querySelector('.cards-grid');
                if (!header || !grid) return;
                
                const profession = header.textContent.trim();
                const order = cardOrder.favorite?.[profession];
                
                if (order && Array.isArray(order)) {
                    const cards = [...grid.querySelectorAll('.card-item')];
                    cards.forEach(card => {
                        const index = order.indexOf(card.dataset.id);
                        if (index !== -1) {
                            card.style.order = index;
                        }
                    });
                }
            });
        }
        
        function setupCardSortDrag() {
            document.querySelectorAll('.cards-grid').forEach(grid => {
                grid.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const card = e.target.closest('.card-item');
                    if (card && draggedCard && card !== draggedCard) {
                        card.classList.add('drag-over-card');
                    }
                });
                
                grid.addEventListener('dragleave', (e) => {
                    const card = e.target.closest('.card-item');
                    if (card) card.classList.remove('drag-over-card');
                });
                
                grid.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const card = e.target.closest('.card-item');
                    if (card && draggedCard && card !== draggedCard) {
                        card.classList.remove('drag-over-card');
                        const grid = card.parentElement;
                        const allCards = [...grid.querySelectorAll('.card-item')];
                        const draggedIndex = allCards.indexOf(draggedCard);
                        const targetIndex = allCards.indexOf(card);
                        if (draggedIndex < targetIndex) {
                            card.after(draggedCard);
                        } else {
                            card.before(draggedCard);
                        }
                        
                        // 保存新顺序
                        saveCurrentCardOrder(grid);
                    }
                });
            });
            
            document.addEventListener('dragend', () => {
                if (draggedCard) {
                    draggedCard.classList.remove('dragging');
                    draggedCard = null;
                }
                document.querySelectorAll('.drag-over-card').forEach(el => el.classList.remove('drag-over-card'));
            });
        }
        
        // 保存当前卡牌顺序
        function saveCurrentCardOrder(grid) {
            const cards = [...grid.querySelectorAll('.card-item')];
            const cardIds = cards.map(card => card.dataset.id);
            
            // 确定是卡池还是收藏
            if (grid.closest('.collapsible-section')) {
                // 卡池
                const section = grid.closest('.profession-section');
                const profession = section.querySelector('h4').textContent.trim();
                const key = profession.replace(/[⚔️🔮🏹🐉⛪🌑🐼🔧🔴]/g, '').trim();
                
                if (!cardOrder.pool) cardOrder.pool = {};
                cardOrder.pool[key] = cardIds;
            } else if (grid.closest('.favorite-group')) {
                // 收藏
                const group = grid.closest('.favorite-group');
                const header = group.querySelector('.favorite-group-header');
                const profession = header.textContent.trim();
                
                if (!cardOrder.favorite) cardOrder.favorite = {};
                cardOrder.favorite[profession] = cardIds;
            }
            
            saveCardOrder();
        }

        document.addEventListener('DOMContentLoaded', () => {
            // 登录检查（异步：需读磁盘 auth_state.json 判断是否已登录过）。
            // 优先级：localStorage 已登录 → 磁盘已登录 → 记住密码且校验通过 → 否则显示密码门。
            // 注：网页版（无 Tauri）isLoggedInFromDisk 永远 false，仅依赖 localStorage，与原行为一致。
            (async () => {
                const overlay = document.getElementById('passwordOverlay');
                const main = document.getElementById('mainContent');
                const enter = () => { overlay.style.display = 'none'; main.classList.add('visible'); };
                const showLogin = () => { overlay.style.display = 'flex'; };
                // 已登录（localStorage 或磁盘 auth_state.json）→ 直接进入，完全不显示密码门
                const diskLoggedIn = await isLoggedInFromDisk();
                if (isLoggedIn() || diskLoggedIn) {
                    localStorage.setItem('TFJL_LoggedIn', 'true');
                    saveAuthToDisk(true);
                    enter();
                    return;
                }
                // 未登录但记住过密码 → 尝试自动登录（修复旧 bug：原用 getAdminPasswords().includes(明文) 永远不成立）
                const savedPwd = localStorage.getItem('TFJL_SavedPwd');
                if (savedPwd) {
                    try {
                        const pwd = atob(savedPwd);
                        let ok = false;
                        for (const h of getAdminPasswords()) { if (await verifyPassword(pwd, h)) { ok = true; break; } }
                        if (ok) {
                            recordLogin();
                            localStorage.setItem('TFJL_LoggedIn', 'true');
                            saveAuthToDisk(true);
                            enter();
                            return;
                        } else {
                            // 保存的密码已失效（密码表变了），清除并预填方便重输
                            localStorage.removeItem('TFJL_SavedPwd');
                            const input = document.getElementById('passwordInput');
                            if (input) input.value = pwd;
                        }
                    } catch (e) {
                        localStorage.removeItem('TFJL_SavedPwd');
                    }
                }
                // 确认未登录 → 显示密码门（此刻才出现，已登录用户全程看不到）
                showLogin();
            })();
            
            initIndexedDB().then(() => {
                refreshProjectSelectors();
                // 默认项目自动加载移到 window.onload 末尾（await 确保竞态安全）
            });
            loadCardLevels();
            loadIndividualCardLevels();
            loadCardSkins();
            loadDefaultCardSkins();
            loadCardMoHua();
            loadCustomSkins();
            // 同步融合卡显示开关初始状态（默认开启）
            try { const t = document.getElementById('fusionSkinSplitToggle'); if (t) t.checked = fusionSkinSplitEnabled; } catch (e) {}
            if (typeof refreshAllFusionSkins === 'function') refreshAllFusionSkins();
            loadCustomSkinAttributes();
            loadCustomCards();
            loadFavorites();
            loadDamageReductionData(); // 加载减伤数据（localStorage）
            loadDamageReductionFromDisk(); // APP 下额外从 D 盘恢复（缓存失效保护）
            setupAddCardButtons();
            setupCardSortDrag();
            updateTxtFilesList();
            loadFontSizeSetting();
            
            // 加载卡牌顺序
            loadCardOrder();
            // 应用保存的卡牌顺序
            applyCardOrder();
            // 初始化所有卡牌的等级徽章显示
            updateAllCardLevelBadges();
            // 更新减伤显示
            updateDamageReductionDisplay();

            // 恢复收藏折叠状态（默认折叠，仅用户曾显式展开才展开）
            const favoriteOpen = localStorage.getItem('tdjl_favorite_open');
            if (favoriteOpen === 'true') {
                const favoriteHeader = document.querySelector('.collapsible-header.favorite');
                const favoriteContent = document.querySelector('.collapsible-content.favorite');
                if (favoriteHeader && favoriteContent) {
                    favoriteHeader.classList.add('open');
                    favoriteContent.classList.add('open');
                    const icon = favoriteHeader.querySelector('.toggle-icon');
                    if (icon) icon.textContent = '▲';
                }
            }

            // 恢复记事本折叠状态
            const notepadOpen = localStorage.getItem('tdjl_notepad_open');
            const notepadHeader = document.querySelector('.collapsible-section .collapsible-header');
            const notepadContent = document.querySelector('.collapsible-section .collapsible-content');
            if (notepadHeader && notepadContent) {
                if (notepadOpen === 'true') {
                    notepadHeader.classList.add('open');
                    notepadContent.classList.add('open');
                    notepadContent.style.display = 'block';
                    const icon = notepadHeader.querySelector('.toggle-icon');
                    if (icon) icon.textContent = '▲';
                }
            }

            // 加载临时记事本内容（如果没有项目）
            if (!currentProjectName || currentProjectName === '默认项目') {
                const tempNotepad = localStorage.getItem('tdjl_notepad_temp');
                const notepad = document.getElementById('notepad');
                if (notepad && tempNotepad) {
                    notepad.value = tempNotepad;
                }
            }
            
            document.addEventListener('click', (e) => {
                const badge = e.target.closest('.card-level-badge');
                if (badge) {
                    e.stopPropagation();
                    e.preventDefault();
                    const cardId = badge.dataset.cardId;
                    const cardType = badge.dataset.cardType;
                    const handType = badge.dataset.handType || 'my';
                    const cardName = badge.dataset.cardName || '';
                    showLevelDropdown(e, cardId, cardType, handType, cardName);
                    return;
                }
                
                const deleteBtn = e.target.closest('.delete-card-btn');
                if (deleteBtn) return;
                
                const card = e.target.closest('.card-item');
                if (!card) return;
                
                if (card.closest('#favoriteCardsGrid')) return;
                
                const grid = card.closest('.cards-grid');
                if (!grid) return;
                
                const section = grid.closest('.collapsible-section');
                if (!section) return;
                
                handlePoolCardClick(card);
            });
            
            document.addEventListener('contextmenu', (e) => {
                const card = e.target.closest('.card-item');
                console.log('[SKIN] global contextmenu target:', e.target.tagName, e.target.className, 'card-item:', card ? 'yes' : 'no', 'battle-slot:', card && card.closest('.battle-slot') ? 'yes' : 'no');
                if (!card) return;
                
                // 战场槽内的 card-item 由 handleSlotRightClick 处理，不在这里处理
                if (card.closest('.battle-slot')) { console.log('[SKIN] card-item inside battle-slot, skip global favorite handler'); return; }
                
                if (card.closest('#favoriteCardsGrid')) return;
                
                const grid = card.closest('.cards-grid');
                if (!grid) return;
                
                const section = grid.closest('.collapsible-section');
                if (!section) return;
                
                console.log('[SKIN] global favorite right-click on', card.dataset.name);
                handleCardRightClick(e, card);
            });
            
            document.addEventListener('dragstart', (e) => {
                window.__nativeDrag = true;
                if (window.__pd) { window.__pd = null; if (window.__ghost) { window.__ghost.remove(); window.__ghost = null; } }
                const card = e.target.closest('.card-item');
                if (!card) return;
                
                if (card.closest('#favoriteCardsGrid')) return;
                
                const grid = card.closest('.cards-grid');
                if (!grid) return;
                
                const section = grid.closest('.collapsible-section');
                if (!section) return;
                
                handlePoolDragStart(e);
                draggedCard = card;
                card.classList.add('dragging');
            });
            
            document.querySelectorAll('.card-item').forEach(card => {
                const grid = card.closest('.cards-grid');
                if (!grid) return;
                const section = grid.closest('.collapsible-section');
                if (!section) return;
                
                // 非收藏卡禁用原生 DnD，改由 Pointer Events 拖拽层接管（不依赖 webview 原生拖拽，避开卡槽/角标事件干扰）
                card.setAttribute('draggable', card.closest('#favoriteCardsGrid') ? 'true' : 'false');
                if (!card.dataset.id || !card.dataset.id.startsWith('custom_')) {
                    setupLongPress(card, (e) => handleCardRightClick(e, card));
                }
            });

            // ===== Pointer Events 拖拽兜底（不依赖 webview 原生 DnD，桌面/触屏通用）=====
            if (!window.__pointerDragInited) {
                window.__pointerDragInited = true;
                window.__pd = null; window.__ghost = null; window.__suppressClick = false; window.__nativeDrag = false;
                document.addEventListener('pointerdown', (e) => {
                    if (e.button !== undefined && e.button !== 0) return;
                    const card = e.target.closest('.selected-card:not(.empty), .battle-slot.filled .card-item');
                    if (!card || card.closest('#favoriteCardsGrid')) return;
                    if (e.target.closest('.card-level-badge')) return; // 等级徽章不触发拖拽
                    window.__pd = { el: card, x: e.clientX, y: e.clientY, started: false, payload: buildDragPayload(card) };
                }, true);
                document.addEventListener('pointermove', (e) => {
                    if (window.__nativeDrag) { cleanupPointerDrag(); return; }
                    if (!window.__pd) return;
                    if (!window.__pd.started) {
                        if (Math.hypot(e.clientX - window.__pd.x, e.clientY - window.__pd.y) < 8) return;
                        window.__pd.started = true;
                        window.__ghost = createDragGhost(window.__pd.el);
                        document.body.style.userSelect = 'none';
                    }
                    if (window.__ghost) { window.__ghost.style.left = e.clientX + 'px'; window.__ghost.style.top = e.clientY + 'px'; }
                }, true);
                document.addEventListener('pointerup', async (e) => {
                    if (window.__nativeDrag) return;
                    if (!window.__pd) return;
                    const pd = window.__pd; window.__pd = null;
                    if (!pd.started) return;
                    e.preventDefault();
                    window.__suppressClick = true;
                    cleanupPointerDrag();
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    const slot = el && el.closest('.battle-slot');
                    if (slot && pd.payload) {
                        window.__dragPayload = pd.payload;
                        try { await handleSlotDrop.call(slot, { preventDefault(){}, dataTransfer: { getData: () => '' } }); } catch (err) { console.error('[DRAG] pointer drop error', err); }
                    } else if (pd.payload && pd.payload.source === 'slot') {
                        // 从卡槽拖到手牌区 = 取下回手牌
                        const hand = el && (el.closest('#myHandContainer') || el.closest('#teammateHandContainer'));
                        if (hand) { window.__dragPayload = pd.payload; removeCardFromSlot(pd.payload.slotId); }
                    }
                }, true);
                document.addEventListener('click', (e) => {
                    if (window.__suppressClick) { window.__suppressClick = false; e.stopPropagation(); e.preventDefault(); }
                }, true);
                document.addEventListener('dragend', () => { window.__nativeDrag = false; });
            }

            function buildDragPayload(card) {
                const slotEl = card.closest('.battle-slot');
                if (slotEl) {
                    const nm = card.dataset.name || getSlotCardName(slotEl);
                    const isEng = card.dataset.engineering === 'true' || !!(slotEl.querySelector('.card-item[data-profession="engineering"]'));
                    return { source: 'slot', slotId: slotEl.dataset.slot, id: slotEl.dataset.cardId || card.dataset.id || '', name: nm, isEngineering: isEng, profession: slotEl.dataset.profession || card.dataset.profession || '' };
                }
                const handType = card.closest('#myHandContainer') ? 'my' : (card.closest('#teammateHandContainer') ? 'teammate' : (card.dataset.handType || 'my'));
                return { source: 'hand', id: card.dataset.id || '', name: card.dataset.name || '', isEngineering: card.dataset.engineering === 'true', profession: card.dataset.profession || '', handType: handType };
            }
            function createDragGhost(card) {
                const g = document.createElement('div');
                g.textContent = (card.dataset && card.dataset.name) || '';
                g.style.cssText = 'position:fixed;z-index:100000;pointer-events:none;transform:translate(-50%,-50%);background:#2a2a4a;color:#fff;padding:6px 12px;border-radius:16px;border:2px solid #ffd700;font-size:0.85rem;box-shadow:0 6px 20px rgba(0,0,0,0.6);opacity:0.92;';
                document.body.appendChild(g);
                return g;
            }
            function cleanupPointerDrag() {
                if (window.__ghost) { window.__ghost.remove(); window.__ghost = null; }
                window.__pd = null;
                document.body.style.userSelect = '';
            }

            document.addEventListener('mouseover', (e) => {
                if (!e.target || !e.target.closest) return;
                const badge = e.target.closest('.card-level-badge');
                if (badge) {
                    const cardId = badge.dataset.cardId;
                    const cardName = badge.dataset.cardName || '';
                    const handType = badge.dataset.handType || 'my';
                    scheduleShowSkinTooltip(e, cardId, cardName, handType);
                }
            });
            
            document.addEventListener('mouseout', (e) => {
                if (!e.target || !e.target.closest) return;
                const badge = e.target.closest('.card-level-badge');
                if (badge) {
                    hideSkinTooltip();
                }
            });

            document.querySelectorAll('.battle-slot').forEach(slot => {
                slot.addEventListener('dragover', handleSlotDragOver);
                slot.addEventListener('dragleave', handleSlotDragLeave);
                slot.addEventListener('drop', handleSlotDrop);
                slot.addEventListener('click', handleSlotClick);
                console.log('[SKIN] binding battle-slot contextmenu:', slot.dataset.slot);
                slot.addEventListener('contextmenu', handleSlotRightClick);
            });

            updateHandDisplay('my');
            updateHandDisplay('teammate');
            updateFavoritesDisplay();
            
            // 启用收藏卡牌拖拽
            setupFavoriteCardDrag();
            setupFavoriteCardSortDrag();
            setupFavoriteCardDropToHand('myHandContainer', myHandCards);
            setupFavoriteCardDropToHand('teammateHandContainer', teammateHandCards);
            
            document.querySelectorAll('.user-column .battle-slot').forEach(slot => {
                setupFavoriteCardDropToSlot(slot, myHandCards, 'myHandContainer');
            });
            
            document.querySelectorAll('.teammate-column .battle-slot').forEach(slot => {
                setupFavoriteCardDropToSlot(slot, teammateHandCards, 'teammateHandContainer');
            });

            // 初始化跟随拖尾特效
            initTrailEffect();
            
            // 初始化粒子背景
            initParticleBackground();

            // 根据保存的偏好控制特效开关
            updateEffectsVisibility();

            // 重新扫描皮肤目录，让日志在浮动控制台可见（app-local.js 初始化时控制台捕获器尚未启动）
            setTimeout(async () => {
                if (window.scanSkins) {
                    console.log('[SKIN] Re-scanning skins from DOMContentLoaded...');
                    try {
                        await window.scanSkins();
                        const keys = window.skinRegistry ? Object.keys(window.skinRegistry) : [];
                        console.log('[SKIN] Re-scan complete, registry keys:', keys.join(',') || '(empty)');
                        console.log('[SKIN] heroSkinSelections:', JSON.stringify(window.heroSkinSelections || {}));
                        // 同步远程皮肤（GitHub Pages 托管，所有设备打开即自动获取）
                        if (window.syncRemoteSkins) {
                            await window.syncRemoteSkins();
                        }
                        // 皮肤加载完成后刷新卡池皮肤小图
                        if (typeof updateCardPoolSkins === 'function') updateCardPoolSkins().catch(() => {});
                        // 恢复卡池分区皮肤锁的显示状态
                        if (typeof applyPoolSkinLockUI === 'function') applyPoolSkinLockUI();
                    } catch (err) {
                        console.error('[SKIN] Re-scan skins error:', err);
                    }
                } else {
                    console.warn('[SKIN] window.scanSkins not available');
                }
            }, 500);
        });
        
        // ==================== 配置管理 ====================
        const CONFIG_URL = 'https://raw.githubusercontent.com/gyq-svip/my-web-config/refs/heads/main/config.json';
        const NEWS_URL = 'https://raw.githubusercontent.com/gyq-svip/my-web-config/refs/heads/main/news.json';
        const CONFIG_CACHE_KEY = 'TFJL_Config_Cache';
        const CONFIG_CACHE_TIME_KEY = 'TFJL_Config_Cache_Time';
        const NEWS_CACHE_KEY = 'TFJL_News_Cache';
        const NEWS_CACHE_TIME_KEY = 'TFJL_News_Cache_Time';
        
        // 默认配置
        const DEFAULT_CONFIG = {
            wechat: 'GYQSVIP',
            game: '九区-龙行',
            notice: '',
            open: true,
            auctionNews: true,
            title: '【工具数据本地化储存】【新增PC客户端】【新增老马脚本一键密文分享】【导出 导入 分享 分类管理】【部分副本支持卡组截图识别一键脚本】'
        };

        const DEFAULT_NEWS = [
            { category: '公告', name: '欢迎使用塔防精灵阵容归档', content: '支持导入脚本解析、阵容存储快速查看、需求墙留言等功能', author: 'gyq', publish_time: new Date().toISOString().substring(0, 19).replace('T', ' ') }
        ];
        
        // 当前配置
        let currentConfig = { ...DEFAULT_CONFIG };
        
        // 新闻/公告数据
        let newsItems = [];
        
// 统计相关常量
// ⚠️ 重要：这个 GIST_ID 是索引文件的固定 ID，所有设备必须使用同一个！
const GIST_ID = 'a32a0628bd9275f3a4922cd12cf298c9';
const COUNTER_GIST_ID = 'e1bd9a5139e1c4e011bfea707e917d61';
const MESSAGES_GIST_ID = 'b02794a8d5c43874b76286185f7b1f7f';
const INDEX_GIST_ID_KEY = 'TFJL_Index_Gist_ID';
const COUNTER_CACHE_KEY = 'TFJL_Counter_Cache';
const COUNTER_CACHE_TIME_KEY = 'TFJL_Counter_Cache_Time';

// 获取索引文件的 Gist URL（使用固定 ID，不自动创建）
async function getIndexGistUrl() {
    const token = getGistToken();
    
    // 先从 localStorage 获取
    let indexGistId = localStorage.getItem(INDEX_GIST_ID_KEY);
    
    if (indexGistId) {
        return `https://api.github.com/gists/${indexGistId}`;
    }
    
    // 使用硬编码的 GIST_ID（必须所有设备使用同一个！）
    if (GIST_ID && GIST_ID !== 'YOUR_GIST_ID_HERE') {
        const testUrl = `https://api.github.com/gists/${GIST_ID}`;
        const response = await fetch(testUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                ...(token && { 'Authorization': `token ${token}` })
            }
        });
        
        if (response.ok) {
            // 硬编码的 ID 有效，缓存它
            localStorage.setItem(INDEX_GIST_ID_KEY, GIST_ID);
            return testUrl;
        }
        
        // 如果硬编码的 ID 无效，尝试创建
        if (token && response.status === 404) {
            const createdUrl = await createIndexGist(token);
            const createdId = createdUrl.split('/').pop();
            return createdUrl;
        }
    }
    
    // 最后回退到硬编码 URL
    return `https://api.github.com/gists/${GIST_ID}`;
}

// 创建索引文件
async function createIndexGist(token) {
    const createResponse = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'Authorization': `token ${token}`
        },
        body: JSON.stringify({
            description: '房间索引文件',
            public: false,
            files: {
                'room_index.json': {
                    content: JSON.stringify({}, null, 2)
                }
            }
        })
    });
    
    if (createResponse.ok) {
        const data = await createResponse.json();
        localStorage.setItem(INDEX_GIST_ID_KEY, data.id);
        return `https://api.github.com/gists/${data.id}`;
    }
    
    throw new Error('创建索引文件失败');
}

// 兼容旧的 GIST_URL（但推荐使用 getIndexGistUrl()）
const GIST_URL = `https://api.github.com/gists/${GIST_ID}`;
const BROADCASTS_GIST_URL = `https://api.github.com/gists/${MESSAGES_GIST_ID}`;

// 动态获取消息Gist URL（考虑Gist可能被删除重建的情况）
function getMessagesGistUrl() {
    const gistDeleted = localStorage.getItem('messages_gist_deleted') === 'true';
    const gistId = (!gistDeleted && MESSAGES_GIST_ID) ? MESSAGES_GIST_ID : (localStorage.getItem('messages_gist_id') || MESSAGES_GIST_ID);
    return `https://api.github.com/gists/${gistId}`;
}

// Gist Token 管理 - 优先从环境变量读取（GitHub Actions），其次从localStorage读取
const GIST_TOKEN_KEY = 'TFJL_Gist_Token';
function getGistToken() {
    // 优先使用硬编码Token（GitHub Actions部署时会替换为实际的Token）
    const HARDCODED_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';

    // 如果Token不是占位符，就使用它
    if (HARDCODED_TOKEN && HARDCODED_TOKEN.length > 20 && HARDCODED_TOKEN.startsWith('ghp_')) {
        return HARDCODED_TOKEN;
    }

    // 其次从localStorage读取（本地开发/用户手动填写时使用，iframe 同域共享）
    try { const ls = localStorage.getItem(GIST_TOKEN_KEY); if (ls) return ls; } catch (e) {}

    // iframe 内嵌时，复用父窗口（首页）已注入的真实 token（兜底，避免子页 token 为空）
    try {
        if (window.parent && window.parent !== window && typeof window.parent.getGistToken === 'function') {
            const pt = window.parent.getGistToken();
            if (pt && pt !== 'YOUR_GITHUB_TOKEN_HERE' && pt.length > 10) return pt;
        }
    } catch (e) {}

    return '';
}
function setGistToken(token) {
    localStorage.setItem(GIST_TOKEN_KEY, token);
}
function hasGistToken() {
    return !!getGistToken();
}

        // 当前统计数据
        let counterData = null;
        
        // 检查是否需要刷新配置缓存（每天刷新一次）
        function shouldRefreshCache() {
            const lastUpdate = localStorage.getItem(CONFIG_CACHE_TIME_KEY);
            if (!lastUpdate) return true;
            
            const lastDate = new Date(lastUpdate);
            const today = new Date();
            
            return lastDate.toDateString() !== today.toDateString();
        }
        
        // 保存配置到缓存
        function saveConfigToCache(config) {
            localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
            localStorage.setItem(CONFIG_CACHE_TIME_KEY, new Date().toISOString());
        }
        
        // 从缓存加载配置
        function loadConfigFromCache() {
            const cached = localStorage.getItem(CONFIG_CACHE_KEY);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    console.error('解析配置缓存失败:', e);
                }
            }
            return null;
        }
        
        // 从GitHub获取配置
        async function fetchConfigFromGitHub() {
            try {
                const response = await fetch(CONFIG_URL, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                let text = await response.text();
                
                // 尝试直接解析
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    text = fixJsonFormat(text);
                    data = JSON.parse(text);
                }
                
                return data;
            } catch (error) {
                console.error('从GitHub获取配置失败:', error);
                throw error;
            }
        }
        
        // 修复JSON格式
        function fixJsonFormat(text) {
            let fixed = text.replace(/\/\/.*$/gm, '');
            fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
            return fixed;
        }
        
        // 加载配置（优先缓存，每天刷新一次）
        async function loadConfig() {
            const cachedConfig = loadConfigFromCache();
            if (cachedConfig) {
                currentConfig = { ...DEFAULT_CONFIG, ...cachedConfig };
            }
            
            if (shouldRefreshCache() || !cachedConfig) {
                try {
                    const freshConfig = await fetchConfigFromGitHub();
                    // config.json 只处理联系方式，不处理title（title由news文件负责）
                    currentConfig = { ...DEFAULT_CONFIG };
                    if (freshConfig.wechat) currentConfig.wechat = freshConfig.wechat;
                    if (freshConfig.game) currentConfig.game = freshConfig.game;
                    if (freshConfig.notice) currentConfig.notice = freshConfig.notice;
                    if (freshConfig.open !== undefined) currentConfig.open = freshConfig.open;
                    if (freshConfig.auctionNews !== undefined) currentConfig.auctionNews = freshConfig.auctionNews;
                    saveConfigToCache(currentConfig);
                } catch (error) {
                    if (!cachedConfig) {
                        currentConfig = { ...DEFAULT_CONFIG };
                    }
                }
            }
            
            return currentConfig;
        }
        
        // 检查是否需要刷新新闻缓存（每天刷新一次）
        function shouldRefreshNewsCache() {
            const lastUpdate = localStorage.getItem(NEWS_CACHE_TIME_KEY);
            if (!lastUpdate) return true;
            
            const lastDate = new Date(lastUpdate);
            const today = new Date();
            
            return lastDate.toDateString() !== today.toDateString();
        }
        
        // 保存新闻到缓存
        function saveNewsToCache(news) {
            localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(news));
            localStorage.setItem(NEWS_CACHE_TIME_KEY, new Date().toISOString());
        }
        
        // 从缓存加载新闻
        function loadNewsFromCache() {
            const cached = localStorage.getItem(NEWS_CACHE_KEY);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    console.error('解析新闻缓存失败:', e);
                }
            }
            return null;
        }
        
            // 从GitHub获取新闻和配置
        async function fetchNewsFromGitHub() {
            try {
                let data = null;

                try {
                    const token = getGistToken();
                    
                    // 从索引文件获取公告的 GIST_ID
                    let newsGistId = localStorage.getItem('news_gist_id');
                    let indexGistData = null; // 缓存索引Gist的完整响应
                    
                    if (!newsGistId) {
                        // 从索引文件获取
                        const indexUrl = await getIndexGistUrl();
                        const indexResponse = await fetch(indexUrl, {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                ...(token && { 'Authorization': `token ${token}` })
                            }
                        });
                        
                        if (indexResponse.ok) {
                            indexGistData = await indexResponse.json();
                            if (indexGistData.files && indexGistData.files['room_index.json'] && indexGistData.files['room_index.json'].content) {
                                try {
                                    const index = JSON.parse(indexGistData.files['room_index.json'].content);
                                    if (index['news']) {
                                        newsGistId = index['news'];
                                        localStorage.setItem('news_gist_id', newsGistId);
                                    }
                                } catch (e) {
                                    console.warn('解析索引文件失败');
                                }
                            }
                        }
                    }
                    
                    if (newsGistId) {
                        // 从独立 Gist 加载公告
                        const gistResponse = await fetch(`https://api.github.com/gists/${newsGistId}`, {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                ...(token && { 'Authorization': `token ${token}` })
                            }
                        });

                        if (gistResponse.ok) {
                            const gistData = await gistResponse.json();
                            const newsContent = gistData.files?.['news.json']?.content;
                            if (newsContent) {
                                data = JSON.parse(newsContent);
                            }
                        }
                    } else if (indexGistData) {
                        // 没有独立公告Gist，直接从索引Gist读取news.json
                        const newsContent = indexGistData.files?.['news.json']?.content;
                        if (newsContent) {
                            data = JSON.parse(newsContent);
                        }
                    }
                } catch (gistError) {
                    console.warn('📢 从Gist获取新闻失败，尝试GitHub仓库:', gistError);
                }

                if (!data) {
                    // Gist获取失败时，优先使用本地缓存，避免回退到GitHub仓库的旧数据
                    const cachedNews = loadNewsFromCache();
                    if (cachedNews && cachedNews.length >= 0) {
                        // 有本地缓存就用缓存（包括空数组，表示管理员可能已清空公告）
                        return cachedNews;
                    }
                    // 完全没有缓存时才回退到GitHub仓库
                    const response = await fetch(NEWS_URL, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    let text = await response.text();
                    
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        text = fixJsonFormat(text);
                        data = JSON.parse(text);
                    }
                }
                
                if (data && data.title) {
                    currentConfig.title = data.title;
                }
                if (data && data.wechat) {
                    currentConfig.wechat = data.wechat;
                }
                if (data && data.game) {
                    currentConfig.game = data.game;
                }
                if (data && data.notice) {
                    currentConfig.notice = data.notice;
                }
                if (data && typeof data.open !== 'undefined') {
                    currentConfig.open = data.open;
                }
                if (data && typeof data.auctionNews !== 'undefined') {
                    currentConfig.auctionNews = data.auctionNews;
                }
                
                if (data && data.data && Array.isArray(data.data)) {
                    return data.data;
                }
                
                return [];
            } catch (error) {
                console.error('📢 从GitHub获取新闻失败:', error);
                throw error;
            }
        }
        
        // 加载新闻（优先缓存，每天刷新一次）
        async function loadNews() {
            const cachedNews = loadNewsFromCache();
            if (cachedNews) {
                newsItems = cachedNews;
            }
            
            if (shouldRefreshNewsCache() || !cachedNews) {
                try {
                    const freshNews = await fetchNewsFromGitHub();
                    newsItems = freshNews;
                    saveNewsToCache(freshNews);
                } catch (error) {
                    if (!cachedNews) {
                        newsItems = [...DEFAULT_NEWS];
                    }
                }
            }
            
            initMarquee();
            startActiveTimeCheck();
            return newsItems;
        }
        
               // 拼接新闻内容用于滚动显示
        function getNewsMarqueeText() {
            const now = new Date();
            const activeItems = newsItems.filter(item => {
                if (item.active_time && new Date(item.active_time) > now) return false;
                if (item.expire_time && new Date(item.expire_time) <= now) return false;
                return true;
            });

            const allTexts = [];

            // 普通公告
            if (activeItems.length > 0) {
                activeItems.forEach(item => {
                    let text = '';
                    if (item.category) text += `[${item.category}]`;
                    if (item.name) {
                        if (text) text += ' ';
                        text += item.name;
                    }
                    if (item.content && item.content.trim()) {
                        if (text) text += ' - ';
                        text += item.content.trim();
                    }
                    if (item.author && item.author !== '无名') {
                        if (text) text += ` (${item.author})`;
                    }
                    if (item.publish_time) {
                        if (text) text += ` [${item.publish_time.substring(0, 16)}]`;
                    }
                    text = text.trim();
                    if (text) allTexts.push(text);
                });
            }

            // 需求墙最新消息（最多5条）- 只显示文件名和作者，去掉网址
            if (wallMessages && wallMessages.length > 0) {
                const recentMsgs = wallMessages.slice(0, 5);
                recentMsgs.forEach(msg => {
                    let text = '📢[需求墙] ';
                    let content = msg.content || '';
                    // 去掉内容中包含的脚本网址，只保留文字部分
                    if (msg.scriptUrl) {
                        content = content.replace(msg.scriptUrl, '').trim();
                    }
                    // 再兜底清理可能残留的网址片段
                    content = content.replace(/https?:\/\/\S+/g, '').trim();
                    content = content.substring(0, 60);
                    // 有脚本分享时显示文件名
                    if (msg.scriptUrl) {
                        let fileName = '';
                        try {
                            const parts = msg.scriptUrl.split('/');
                            fileName = decodeURIComponent(parts[parts.length - 1] || '');
                        } catch (e) {
                            fileName = msg.scriptUrl.split('/').pop() || '';
                        }
                        if (fileName) {
                            text += `📎${fileName}`;
                            if (content) text += ` ${content}`;
                        } else {
                            text += content || '📎[含脚本分享]';
                        }
                    } else {
                        text += content;
                    }
                    if (msg.author) text += ` (${msg.author})`;
                    allTexts.push(text);
                });
            }

            if (allTexts.length === 0) return '暂无公告';
            return allTexts.join('　　◆　　');
        }

        // 拍卖快讯显示开关（全网云端 config）：关闭后全网公告弹窗只显示普通公告+需求咨询，隐藏拍卖快讯
        function _getAuctionNewsVisible() {
            return currentConfig.auctionNews !== false;
        }
        async function toggleAuctionNewsVisibility() {
            const next = !_getAuctionNewsVisible();
            currentConfig.auctionNews = next;
            updateAuctionNewsToggleStatus();
            // 立即重渲（缓存未刷新也能即时生效）
            const modal = document.getElementById('newsListModal');
            if (modal && modal.style.display === 'flex') showNewsListModal();
            console.log('[公告] 拍卖快讯全网显示已' + (next ? '开启' : '关闭') + '，正在同步到云端...');
            try {
                await adminSaveNewsToGist(newsItems);
                console.log('[公告] 拍卖快讯全网开关已同步到云端');
            } catch (e) {
                console.error('[公告] 拍卖快讯全网开关同步失败:', e);
                alert('拍卖快讯开关已切换，但同步到云端失败：' + (e && e.message ? e.message : e));
            }
            updateAuctionNewsToggleStatus();
        }
        function updateAuctionNewsToggleStatus() {
            const status = document.getElementById('auctionNewsToggleStatus');
            if (status) {
                const vis = _getAuctionNewsVisible();
                status.textContent = vis ? '全网开启' : '全网关闭';
                status.style.color = vis ? 'rgba(74,222,128,0.9)' : 'rgba(239,68,68,0.9)';
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateAuctionNewsToggleStatus);
        } else {
            updateAuctionNewsToggleStatus();
        }

        function showNewsListModal() {
            const modal = document.getElementById('newsListModal');
            const content = document.getElementById('newsListContent');
            modal.style.display = 'flex';

            const now = new Date();
            const activeItems = newsItems.filter(item => {
                if (item.active_time && new Date(item.active_time) > now) return false;
                if (item.expire_time && new Date(item.expire_time) <= now) return false;
                return true;
            });

            // 普通公告HTML
            let normalHtml = '';
            if (activeItems.length === 0) {
                normalHtml = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">暂无公告</div>';
            } else {
                normalHtml = activeItems.map((item, index) => {
                    const category = item.category || '';
                    const name = item.name || '无标题';
                    const contentText = item.content || '';
                    const author = item.author || '';
                    const time = item.publish_time || '';

                    const categoryColors = {
                        '公告': '#ffd700',
                        '活动': '#4ade80',
                        '更新': '#60a5fa',
                        '通知': '#f472b6',
                        '其他': '#a78bfa'
                    };
                    const catColor = categoryColors[category] || '#a78bfa';

                    return `
                        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:15px;margin-bottom:10px;${index === 0 ? 'border-left:3px solid ' + catColor + ';' : ''}">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                ${category ? `<span style="background:${catColor};color:#000;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:bold;">${category}</span>` : ''}
                                <span style="color:#ffd700;font-size:0.95rem;font-weight:500;">${name}</span>
                            </div>
                            ${contentText ? `<div style="color:rgba(255,255,255,0.8);font-size:0.9rem;line-height:1.6;margin-bottom:8px;">${contentText}</div>` : ''}
                            <div style="color:rgba(255,255,255,0.35);font-size:0.75rem;">
                                ${author && author !== '无名' ? author : ''}${author && time ? ' · ' : ''}${time ? time.substring(0, 16) : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // 拍卖快讯HTML
            let auctionHtml = '';
            const isAdminUser = checkIsAdmin();
            if (auctionBroadcastQueue.length === 0) {
                auctionHtml = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">暂无拍卖快讯</div>';
            } else {
                auctionHtml = auctionBroadcastQueue.map(item => {
                    const timeAgo = Math.floor((Date.now() - item.addedAt) / 60000);
                    const timeStr = timeAgo < 1 ? '刚刚' : timeAgo < 60 ? `${timeAgo}分钟前` : timeAgo < 1440 ? `${Math.floor(timeAgo / 60)}小时前` : `${Math.floor(timeAgo / 1440)}天前`;
                    const dateStr = new Date(item.addedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    const deleteBtn = isAdminUser ? `<button onclick="adminDeleteAuctionBroadcast('${item.id}')" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:0.7rem;padding:2px 8px;border-radius:4px;cursor:pointer;margin-left:auto;white-space:nowrap;">删除</button>` : '';
                    return `
                        <div style="background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.15);border-radius:8px;padding:10px 14px;margin-bottom:8px;">
                            <div style="display:flex;align-items:flex-start;gap:6px;">
                                <div style="color:rgba(255,255,255,0.85);font-size:0.85rem;line-height:1.5;flex:1;">${item.text}</div>
                                ${deleteBtn}
                            </div>
                            <div style="color:rgba(255,255,255,0.3);font-size:0.7rem;margin-top:4px;">${timeStr} · ${dateStr}</div>
                        </div>
                    `;
                }).join('');
            }

            // 需求咨询HTML（需求墙消息）- 样式与需求墙renderMessages完全一致
            let wallHtml = '';
            const nowMs = Date.now();
            const wallNicknameInput = document.getElementById('messageNickname');
            const wallCurrentNickname = wallNicknameInput?.value.trim() || localStorage.getItem('TFJL_UserName') || '';
            const wallAdminNicks = ['gyq', 'GYQ', '龙行'];
            const wallIsAdmin = wallAdminNicks.some(nick => wallCurrentNickname.toLowerCase() === nick.toLowerCase());

            // 过滤消息（与renderMessages一致：只有设置了expireMinutes的才过期）
            const validWallMsgs = (wallMessages || []).filter(msg => {
                if (msg.expireMinutes && msg.expireMinutes > 0) {
                    const expireTime = msg.expireMinutes * 60 * 1000;
                    return (nowMs - (msg.time || 0)) < expireTime;
                }
                return true;
            });
            const recentWallMsgs = validWallMsgs.slice(0, 20);

            if (recentWallMsgs.length === 0) {
                wallHtml = '<div style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;padding:20px;">暂无需求咨询，快去需求墙发布吧！</div>';
            } else {
                wallHtml = recentWallMsgs.map((msg, index) => {
                    const timeAgo = formatMessageTime(msg.time);
                    let contentHtml = escapeHtml(msg.content);

                    // 判断是否可以删除（发布者可删自己的，管理员可删所有）
                    const isOwner = (msg.author || '').toLowerCase() === wallCurrentNickname.toLowerCase();
                    const canDelete = isOwner || wallIsAdmin;

                    // 过期标签
                    const expireLabel = msg.expireMinutes ? `<span style="color:#ff9800;font-size:0.7rem;margin-left:5px;" title="${formatDuration(msg.expireMinutes)}后过期">⏱️${formatDuration(msg.expireMinutes)}</span>` : '';

                    // 脚本分享按钮（与renderMessages一致）
                    if (msg.scriptUrl) {
                        const urlFileName = msg.scriptUrl.split('/').pop() || '';
                        const isJsonFile = urlFileName.toLowerCase().endsWith('.json');
                        const isBackup = msg.shareType === 'backup' || msg.scriptUrl.includes('backup') || contentHtml.includes('备份') || contentHtml.includes('项目') || isJsonFile;

                        if (isBackup) {
                            contentHtml = contentHtml.replace(
                                msg.scriptUrl,
                                `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                                    <a href="javascript:void(0)" onclick="previewScriptFile('${msg.scriptUrl}')" style="color:#e0e0e0;text-decoration:underline;cursor:pointer;background:rgba(224,224,224,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">👁️ 预览</a>
                                    <a href="javascript:void(0)" onclick="downloadScript('${msg.scriptUrl}')" style="color:#4fc3f7;text-decoration:underline;cursor:pointer;background:rgba(79,195,247,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📥 下载</a>
                                    <a href="javascript:void(0)" onclick="importBackupFromWall('${msg.scriptUrl}')" style="color:#ff9800;text-decoration:underline;cursor:pointer;background:rgba(255,152,0,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📦 导入备份</a>
                                </div>`
                            );
                        } else {
                            contentHtml = contentHtml.replace(
                                msg.scriptUrl,
                                `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                                    <a href="javascript:void(0)" onclick="previewScriptFile('${msg.scriptUrl}')" style="color:#e0e0e0;text-decoration:underline;cursor:pointer;background:rgba(224,224,224,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">👁️ 预览</a>
                                    <a href="javascript:void(0)" onclick="downloadScript('${msg.scriptUrl}')" style="color:#4fc3f7;text-decoration:underline;cursor:pointer;background:rgba(79,195,247,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📥 下载</a>
                                    <a href="javascript:void(0)" onclick="importScriptToTxtFiles('${msg.scriptUrl}')" style="color:#4caf50;text-decoration:underline;cursor:pointer;background:rgba(76,175,80,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📄 智能导入</a>
                                </div>`
                            );
                        }
                    }

                    const deleteBtn = canDelete ? `<a href="javascript:void(0)" onclick="deleteWallMsgInModal(${index})" style="color:#ff6b6b;cursor:pointer;margin-left:10px;font-size:0.7rem;" title="${isOwner ? '删除我的消息' : '管理员删除'}">🗑️</a>` : '';

                    return `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 12px;font-size:0.85rem;margin-bottom:8px;">
                        <div style="color:#fff;margin-bottom:6px;line-height:1.5;">${contentHtml}</div>
                        <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;">${escapeHtml(msg.author || '匿名')} · ${timeAgo}${expireLabel}${deleteBtn}</div>
                    </div>`;
                }).join('');
            }

            // 拍卖快讯显示开关（全网云端）：关闭后公告弹窗只显示普通公告+需求咨询
            const auctionVis = _getAuctionNewsVisible();
            const auctionCol = auctionVis
                ? `<div style="flex:1;overflow-y:auto;max-height:65vh;padding:0 5px;border-right:1px solid rgba(255,107,107,0.15);">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,107,107,0.2);">
                            <span style="color:#ff6b6b;font-size:0.9rem;font-weight:600;">🔨 拍卖快讯</span>
                            <span style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-left:auto;">${auctionBroadcastQueue.length}条</span>
                        </div>
                        ${auctionHtml}
                    </div>`
                : '';
            content.innerHTML = `
                <div style="display:flex;gap:10px;min-height:300px;">
                    <div style="flex:1;overflow-y:auto;max-height:65vh;padding-right:5px;${auctionVis ? 'border-right:1px solid rgba(255,215,0,0.15);' : ''}">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,215,0,0.2);">
                            <span style="color:#ffd700;font-size:0.9rem;font-weight:600;">📢 普通公告</span>
                            <span style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-left:auto;">${activeItems.length}条</span>
                        </div>
                        ${normalHtml}
                    </div>
                    ${auctionCol}
                    <div style="flex:1;overflow-y:auto;max-height:65vh;padding-left:5px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,152,0,0.2);">
                            <span style="color:#ff9800;font-size:0.9rem;font-weight:600;">💡 需求咨询</span>
                            <span style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-left:auto;">${recentWallMsgs.length}条</span>
                        </div>
                        ${wallHtml}
                    </div>
                </div>
            `;
        }

        function closeNewsListModal() {
            document.getElementById('newsListModal').style.display = 'none';
        }

        // 从全部公告弹窗中删除需求墙消息（删除后刷新弹窗）
        async function deleteWallMsgInModal(index) {
            await deleteMessage(index);
            // 删除完成后刷新弹窗（如果还开着）
            const modal = document.getElementById('newsListModal');
            if (modal && modal.style.display === 'flex') {
                showNewsListModal();
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeNewsListModal();
        });

        document.addEventListener('click', (e) => {
            const modal = document.getElementById('newsListModal');
            if (e.target === modal) closeNewsListModal();
        });
        
        // 更新实时时间
        function updateCurrentTime() {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const weekday = weekdays[now.getDay()];
            const timeStr = now.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false
            });
            const timeText = document.getElementById('timeText');
            if (timeText) {
                timeText.textContent = `${year}-${month}-${day} ${weekday} ${timeStr}`;
            }
        }
        
        // 初始化实时时间
        function initCurrentTime() {
            updateCurrentTime();
            // 每秒更新一次
            setInterval(updateCurrentTime, 1000);
        }
        
        // 随机颜色数组
        const marqueeColors = [
            '#ffd700',  // 金色
            '#ff6b6b',  // 红色
            '#4ecdc4',  // 青色
            '#45b7d1',  // 蓝色
            '#96ceb4',  // 绿色
            '#ffeaa7',  // 浅黄
            '#fd79a8',  // 粉色
            '#a29bfe',  // 紫色
            '#74b9ff',  // 浅蓝
            '#55efc4',  // 薄荷绿
        ];
        
        // 获取随机颜色
        function getRandomMarqueeColor() {
            return marqueeColors[Math.floor(Math.random() * marqueeColors.length)];
        }
        
        // 重启公告滚动动画：按文本长度动态计算时长，保持恒定滚动速度，
        // 避免文本从短变长时位移基准突变导致"飞快"。每次文本变化都应调用以重置动画。
        let _lastMarqueeText = null;
        function restartMarquee(force) {
            const marqueeEl = document.getElementById('newsMarquee');
            if (!marqueeEl) return;
            const text = marqueeEl.textContent;
            if (!force && text === _lastMarqueeText) return; // 文本未变则不重置（避免每分钟跳回起点）
            _lastMarqueeText = text;
            const SPEED = 45; // px/s，恒定滚动速度
            const W = marqueeEl.scrollWidth; // 含 paddingLeft:100%
            const duration = Math.max(8, W / SPEED); // 至少 8 秒，避免极短文本过快
            marqueeEl.style.animation = 'none';
            void marqueeEl.offsetWidth; // 触发重排，重置动画进度
            marqueeEl.style.animation = 'marqueeScroll ' + duration.toFixed(1) + 's linear infinite';
        }

              // 初始化滚动公告
        function initMarquee() {
            initCurrentTime();
            
            const titleEl = document.getElementById('mainTitle');
            if (titleEl && currentConfig.title) {
                titleEl.textContent = ' ' + currentConfig.title + ' ';
            }
            
            const marqueeText = getNewsMarqueeText();
            const marqueeEl = document.getElementById('newsMarquee');
            if (marqueeEl) {
                marqueeEl.style.paddingLeft = '0';
                marqueeEl.textContent = marqueeText;
                
                setTimeout(() => {
                    marqueeEl.style.paddingLeft = '100%';
                    restartMarquee(true);
                }, 100);
                
                setInterval(() => {
                    // 有拍卖播报且全网/本地开关均未关闭时不改变颜色，保持红色
                    if (_globalBroadcastEnabled && _getAuctionNewsVisible() && auctionBroadcastQueue.length > 0) return;
                    const newColor = getRandomMarqueeColor();
                    marqueeEl.style.color = newColor;
                    marqueeEl.style.textShadow = `0 0 10px ${newColor}, 0 0 20px ${newColor}`;
                }, 3000);
            }
        }

        let activeTimeCheckInterval = null;
        function startActiveTimeCheck() {
            if (activeTimeCheckInterval) clearInterval(activeTimeCheckInterval);
            activeTimeCheckInterval = setInterval(() => {
                const hasTimeChange = newsItems.some(item => {
                    if (item.active_time && new Date(item.active_time) > new Date()) return true;
                    if (item.expire_time && new Date(item.expire_time) <= new Date()) return true;
                    return false;
                });
                if (hasTimeChange) {
                    // 有拍卖播报且全网/本地开关均未关闭时不覆盖，由播报系统管理
                    if (_globalBroadcastEnabled && _getAuctionNewsVisible() && auctionBroadcastQueue.length > 0) return;
                    const marqueeEl = document.getElementById('newsMarquee');
                    if (marqueeEl) {
                        marqueeEl.textContent = getNewsMarqueeText();
                        restartMarquee(); // 文本可能变化，按需重置动画（保持速度恒定）
                    }
                }
            }, 60000);
        }
        
        
        
        // ==================== 刷新公告和标题 ====================
        async function refreshNewsAndTitle() {
            const marqueeEl = document.getElementById('newsMarquee');
            const titleEl = document.getElementById('mainTitle');
            
            const backupNewsItems = [...newsItems];
            const backupTitle = currentConfig.title;
            
            // 有拍卖播报时只刷新数据，不覆盖公告显示
            const hasBroadcast = auctionBroadcastQueue.length > 0;
            if (!hasBroadcast) {
                marqueeEl.textContent = '正在刷新...';
                marqueeEl.style.animation = 'none';
            }
            
            try {
                const freshNews = await fetchNewsFromGitHub();
                newsItems = freshNews;
                
                // 同时刷新拍卖快讯
                try {
                    const broadcasts = await fetchAuctionBroadcastsFromGist();
                    auctionBroadcastQueue = broadcasts;
                } catch (e) {
                    console.warn('刷新拍卖快讯失败:', e);
                }

                // 同时预加载需求墙消息（供公告栏滚动显示）
                try {
                    if (wallMessages.length === 0) {
                        await fetchMessages();
                    }
                } catch (e) {
                    console.warn('预加载需求墙失败:', e);
                }
                
                if (titleEl && currentConfig.title) {
                    titleEl.textContent = ' ' + currentConfig.title + ' ';
                }
                
                saveConfigToCache(currentConfig);
                localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(newsItems));
                localStorage.setItem(NEWS_CACHE_TIME_KEY, new Date().toISOString());
                
                if (hasBroadcast) {
                    // 有拍卖播报时，更新播报显示即可
                    updateMarqueeWithBroadcast();
                } else {
                    initMarquee();
                }
            } catch (error) {
                console.error('刷新公告失败:', error);
                if (backupNewsItems.length > 0) {
                    newsItems = backupNewsItems;
                } else {
                    newsItems = [...DEFAULT_NEWS];
                }
                currentConfig.title = backupTitle || DEFAULT_CONFIG.title;
                if (!hasBroadcast) {
                    marqueeEl.textContent = '网络不可用，显示缓存数据';
                    setTimeout(() => {
                        marqueeEl.textContent = getNewsMarqueeText();
                        restartMarquee(true);
                    }, 1500);
                }
            }
        }
        
        // ==================== 智能版本切换系统 ====================
        const ONLINE_VERSION_URL = 'https://gyq-svip.github.io/tfjl-web/';
        let isOnlineVersionAvailable = false;
        let isCurrentVersionOnline = false;
        let versionCheckInterval = null;
        
        function initVersionSwitch() {
            // APP(Tauri)内不需要在线版/离线版切换提示，直接跳过
            if (window.__TAURI__ || window.__TAURI_INTERNALS__) return;
            isCurrentVersionOnline = checkIfOnlineVersion();
            checkOnlineVersionAvailability();
            versionCheckInterval = setInterval(checkOnlineVersionAvailability, 30000);
        }
        
        function checkIfOnlineVersion() {
            const HARDCODED_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';
            return HARDCODED_TOKEN && HARDCODED_TOKEN.length > 20 && HARDCODED_TOKEN.startsWith('ghp_');
        }
        
        async function checkOnlineVersionAvailability() {
            const btn = document.getElementById('versionSwitchBtn');
            if (!btn) return;
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                const response = await fetch(ONLINE_VERSION_URL, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                isOnlineVersionAvailable = true;
                updateVersionSwitchButton();
                
            } catch (error) {
                isOnlineVersionAvailable = false;
                updateVersionSwitchButton();
            }
        }
        
        function updateVersionSwitchButton() {
            const btn = document.getElementById('versionSwitchBtn');
            if (!btn) return;
            // APP(Tauri)内永不显示在线版切换图标
            if (window.__TAURI__ || window.__TAURI_INTERNALS__) { btn.style.display = 'none'; return; }
            
            if (isCurrentVersionOnline) {
                // 在线版：始终隐藏版本切换按钮（不再支持下载离线版）
                btn.style.display = 'none';
            } else {
                if (isOnlineVersionAvailable) {
                    btn.style.display = 'flex';
                    btn.innerHTML = '🌐';
                    btn.style.background = 'rgba(0,188,212,0.8)';
                    btn.title = '在线版可用，点击切换';
                } else {
                    btn.style.display = 'none';
                }
            }
        }
        
        function handleVersionSwitch() {
            if (isCurrentVersionOnline) {
                if (!isOnlineVersionAvailable) {
                    alert('当前网络异常，部分功能可能受限。请检查网络后刷新页面。');
                } else {
                    checkOnlineVersionAvailability();
                }
            } else {
                if (isOnlineVersionAvailable) {
                    window.location.href = ONLINE_VERSION_URL;
                }
            }
        }
        

        
        // 页面加载时初始化
        window.onload = async function() {

            // 启动即从本地磁盘恢复昵称（独立于安装目录，重启/更新/卸载重装都不丢），须早于 initMessageWall 等读取逻辑
            await restoreNicknameFromDisk();

            // 应用管理员对浮动控制台可见性的设置（默认隐藏）
            try {
                applyConsoleVisibility(localStorage.getItem(CONSOLE_VISIBILITY_KEY) === '1');
            } catch (e) {}
            
            // 初始化版本号显示 & 自动检查更新（非阻塞）
            initVersionDisplay();
            autoCheckUpdate();
            
            // 初始化消息墙 & 网络监听（非阻塞，不拖慢首屏）
            initMessageWall();
            setupNetworkListener();

            // —— 首屏核心：尽早加载王城低配版，不排队等待下面的网络统计请求 ——
            try {
                await initIndexedDB();
                // 任何非「王城低配版」的固定启动项都视为残留，统一默认启动王城低配版
                const fixedProject = localStorage.getItem('tdjl_startupProject');
                if (fixedProject && fixedProject !== '' && fixedProject !== '王城低配版') {
                    console.warn('[默认项目] 清除残留固定启动项「' + fixedProject + '」，统一默认启动王城低配版');
                    localStorage.removeItem('tdjl_startupProject');
                }
                // 默认：所有人打开即展示「深海 / 王城低配版」
                await ensureDefaultProjectLoaded();
            } catch (e) {
                console.warn('自动加载项目失败:', e);
            }

            // —— 以下网络统计/快讯请求改为后台非阻塞，不再阻塞首屏 ——
            // 加载全局拍卖快讯开关状态
            loadGlobalBroadcastStatus().catch(()=>{});

            // 初始化统计数据：始终优先从Gist获取最新数据，失败用缓存
            (async () => {
                try {
                    const fresh = await fetchCounterFromGist();
                    if (fresh) { counterData = fresh; saveCounterToCache(counterData); }
                    else { counterData = loadCounterFromCache() || getDefaultCounter(); }
                } catch (error) {
                    console.warn('从Gist获取失败，尝试使用缓存:', error);
                    counterData = loadCounterFromCache() || getDefaultCounter();
                }
                // 🔴 D 盘兜底：缓存为空或拿到的仍是默认值时，尝试用本机备份恢复（Gist 被清空场景）
                if (!counterData || (counterData.total_visits === 0 && counterData.total_downloads === 0 && !counterData.script_downloads)) {
                    try {
                        const disk = await restoreStatsFromDisk();
                        if (disk && (disk.total_visits || disk.total_downloads || (disk.script_downloads && Object.keys(disk.script_downloads).length))) {
                            counterData = disk;
                            saveCounterToCache(counterData);
                            console.warn('✅ 已从 D 盘兜底恢复统计快照');
                        }
                    } catch (e) { /* 忽略 */ }
                }
                updateStatsBar();
            })();

            // 记录访问
            recordVisit().catch((error) => { console.error('❌ 记录访问失败:', error); });

            // 启动图片清理定时任务
            startImageCleanup();

            // 加载配置和新闻
            (async () => {
                try { await loadConfig(); await loadNews(); }
                catch (error) { console.error('❌ 加载配置和新闻失败:', error); }
            })();

            // 从Gist加载拍卖快讯（先确保开关状态已加载，避免竞态导致关闭后仍显示）
            (async () => {
                try {
                    await loadGlobalBroadcastStatus().catch(()=>{});
                    const broadcasts = await fetchAuctionBroadcastsFromGist();
                    if (broadcasts && broadcasts.length > 0) {
                        auctionBroadcastQueue = broadcasts;
                    }
                    updateMarqueeWithBroadcast(); // 内部已按 _globalBroadcastEnabled 决定显示拍卖/普通公告
                } catch (error) { console.warn('加载拍卖快讯失败:', error); }
            })();

            // 预加载需求墙消息
            (async () => {
                try { if (wallMessages.length === 0) await fetchMessages(); }
                catch (error) { console.warn('预加载需求墙消息失败:', error); }
            })();

            // 检查登录状态
            if (localStorage.getItem('TFJL_LoggedIn') === 'true') {
                document.getElementById('passwordOverlay').style.display = 'none';
                document.getElementById('mainContent').classList.add('visible');
                
                // 检查是否是纯拍卖模式，如果是则自动打开拍卖行
                if (localStorage.getItem('TFJL_AuctionOnlyMode') === 'true') {
                    setTimeout(() => {
                        openChatRoomEntry();
                    }, 300);
                }
            }
            updateStatsBar();
        };

        // 确保「深海 / 王城低配版」默认项目已加载：本地缓存(IndexedDB) > 远程拉取并缓存 > 内置默认项目
        // 远程 projects/wangcheng-dipin.json 由开发者统一维护（含截图，体积较大），所有用户首次打开即拉取缓存到本地，
        // 之后默认启动展示此项目，无需联网。
        const DEFAULT_PROJECT_REMOTE = './projects/wangcheng-dipin.json';
        const DEFAULT_PROJECT_META_REMOTE = './projects/wangcheng-dipin.meta.json';
        const DEFAULT_PROJECT_CACHE_KEY = 'tdjl_defaultProjectExportDate';
        const DEFAULT_PROJECT_INIT_KEY = 'tdjl_defaultProjectInitialized'; // 首次安装拉取远端并缓存后置位，之后启动永不联网重拉

        async function ensureDefaultProjectLoaded() {
            const DEFAULT_CAT = '深海';
            const DEFAULT_NAME = '王城低配版';

            // 1. 本地缓存优先（瞬间展示，无需联网）；但若远端默认项目已更新（exportDate 更新），则后台重拉覆盖，保证老用户也能自动拿到新皮肤
            try {
                const all = await loadProjectListFromDB();
                const local = all.find(p => p.name === DEFAULT_NAME && (p.category || '默认分类') === DEFAULT_CAT)
                               || all.find(p => p.name === DEFAULT_NAME);
                if (local && hasRealCards(local)) {
                    await loadProjectFromDB(DEFAULT_NAME).catch(() => {});
                    refreshProjectSelectors();
                    if (window._hideLoadingScreen) window._hideLoadingScreen();
                    console.log('[默认项目] 从本地缓存加载:', DEFAULT_NAME);
                    // 标记为已初始化：首次/升级后仅此一次，之后启动不再联网（保证删除持久、启动快、省服务器资源）
                    try { localStorage.setItem(DEFAULT_PROJECT_INIT_KEY, '1'); } catch (e) {}
                    // 后台比对远端 exportDate：若新版则静默重拉并覆盖本地缓存（用户先看到旧版，毫秒级后被新版替换）
                    _maybeRefreshDefaultProject(DEFAULT_CAT, DEFAULT_NAME);
                    // 兜底：默认项目启动即渲染，皮肤索引可能尚未就绪；等皮肤同步完成后重刷融合卡皮肤，确保融合显示
                    if (typeof window._ensureSynced === 'function') {
                        window._ensureSynced().then(() => {
                            if (typeof refreshAllFusionSkins === 'function') refreshAllFusionSkins().catch(() => {});
                        }).catch(() => {});
                    }
                    return;
                }
            } catch (e) { console.warn('[默认项目] 读本地缓存失败:', e); }

            // 2. 本地没有默认项目
            let initialized = false;
            try { initialized = localStorage.getItem(DEFAULT_PROJECT_INIT_KEY) === '1'; } catch (e) {}
            if (initialized) {
                // 已初始化过却找不到 → 说明用户删除了默认项目，不再联网重拉；回退到第一个项目/空白
                console.log('[默认项目] 默认项目已被删除，回退到第一个项目/空白（不联网重拉）');
                await loadFirstProjectOrBlank();
                return;
            }
            // 首次安装：拉取远端并缓存（本次联网后永不重复拉取）
            await fetchAndCacheDefaultProject(DEFAULT_CAT, DEFAULT_NAME);
        }

        function hasRealCards(p) {
            return !!(p && (
                (Array.isArray(p.myHandCards) && p.myHandCards.length) ||
                (Array.isArray(p.teammateHandCards) && p.teammateHandCards.length) ||
                (Array.isArray(p.myPlacedCards) && p.myPlacedCards.length) ||
                (Array.isArray(p.teammatePlacedCards) && p.myPlacedCards.length)
            ));
        }

        async function fetchAndCacheDefaultProject(cat, name) {
            try {
                const resp = await fetch(DEFAULT_PROJECT_REMOTE);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                const proj = data.project || data;
                proj.name = name;
                proj.category = cat;
                proj.timestamp = new Date().toISOString();
                try { localStorage.setItem(DEFAULT_PROJECT_CACHE_KEY, data.exportDate || ''); } catch (e) {}
                await saveProjectToDB(name, cat, proj).catch(() => {});
                await loadProjectFromDB(name).catch(() => {});
                refreshProjectSelectors();
                if (window._hideLoadingScreen) window._hideLoadingScreen();
                console.log('[默认项目] 已从远程拉取并缓存:', name);
                // 兜底：首次拉取即渲染，皮肤索引可能未就绪，等同步后重刷融合卡
                if (typeof window._ensureSynced === 'function') {
                    window._ensureSynced().then(() => { if (typeof refreshAllFusionSkins === 'function') refreshAllFusionSkins().catch(() => {}); }).catch(() => {});
                }
            } catch (e) {
                console.warn('[默认项目] 远程拉取失败，回退内置默认项目:', e);
                if (DEFAULT_PROJECT && DEFAULT_PROJECT.name) {
                    await loadProjectFromDB(DEFAULT_PROJECT.name).catch(() => {});
                    refreshProjectSelectors();
                    if (window._hideLoadingScreen) window._hideLoadingScreen();
                }
            }
        }

        // 后台静默检查远端默认项目是否有更新：比对远程 exportDate 与本地缓存的 exportDate，
        // 若远程更新则重拉并覆盖本地缓存（老用户强刷即可自动拿到新皮肤，无需手动清 IndexedDB）。
        // 仅当默认项目确实被本地缓存命中（不是首次安装、不是被删除）时才比对，避免与首装/删除回退逻辑冲突。
        async function _maybeRefreshDefaultProject(cat, name) {
            try {
                const localExport = localStorage.getItem(DEFAULT_PROJECT_CACHE_KEY) || '';
                // 🔧 轻量更新检查：只拉几字节的 meta 文件比对 exportDate，避免每次启动下载 10MB 全量 json（占用带宽+主线程解析，拖慢皮肤同步）
                const metaResp = await fetch(DEFAULT_PROJECT_META_REMOTE, { cache: 'no-cache' });
                if (!metaResp.ok) return;
                const meta = await metaResp.json();
                const remoteExport = meta.exportDate || '';
                if (!remoteExport) return;
                // 远程更新（字典序比较 ISO 时间字符串，新日期更大）则重拉覆盖
                if (localExport && localExport >= remoteExport) {
                    console.log('[默认项目] 远端无更新，跳过重拉');
                    return;
                }
                console.log('[默认项目] 远端有更新，后台重拉覆盖本地缓存');
                const resp = await fetch(DEFAULT_PROJECT_REMOTE, { cache: 'no-cache' });
                if (!resp.ok) return;
                const data = await resp.json();
                const proj = data.project || data;
                proj.name = name;
                proj.category = cat;
                proj.timestamp = new Date().toISOString();
                try { localStorage.setItem(DEFAULT_PROJECT_CACHE_KEY, remoteExport); } catch (e) {}
                await saveProjectToDB(name, cat, proj).catch(() => {});
                // 仅当当前展示的正是默认项目时才重新加载并刷新界面
                if (typeof currentProjectName !== 'undefined' && currentProjectName === name) {
                    await loadProjectFromDB(name).catch(() => {});
                    refreshProjectSelectors();
                    if (typeof updateAllCardLevelBadges === 'function') updateAllCardLevelBadges();
                    // 兜底：皮肤索引可能尚未就绪，等同步完成后重刷融合卡皮肤
                    if (typeof window._ensureSynced === 'function') {
                        window._ensureSynced().then(() => { if (typeof refreshAllFusionSkins === 'function') refreshAllFusionSkins().catch(() => {}); }).catch(() => {});
                    }
                }
            } catch (e) {
                console.warn('[默认项目] 后台更新检查失败（不影响使用）:', e);
            }
        }

        // 默认项目被删除/不存在时：打开用户的第一个项目（按创建时间最久的优先）；若无任何项目则空白
        async function loadFirstProjectOrBlank() {
            try {
                const all = await loadProjectListFromDB();
                if (!all || !all.length) {
                    console.log('[默认项目] 无任何项目，空白展示');
                    if (window._hideLoadingScreen) window._hideLoadingScreen();
                    refreshProjectSelectors();
                    return;
                }
                const sorted = all.slice().sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
                const first = sorted[0];
                await loadProjectFromDB(first.name).catch(() => {});
                refreshProjectSelectors();
                if (window._hideLoadingScreen) window._hideLoadingScreen();
                console.log('[默认项目] 已回退打开用户第一个项目:', first.name);
            } catch (e) {
                if (window._hideLoadingScreen) window._hideLoadingScreen();
                console.warn('[默认项目] 回退打开失败:', e);
            }
        }

        
        // ==================== 统计功能 ====================
        
        // 获取今天的日期字符串
        function getTodayString() {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }
        
        // 获取当前时间字符串
        function getCurrentTimeString() {
            const now = new Date();
            return now.toLocaleString('zh-CN');
        }
        
        // 从缓存加载统计数据
        function loadCounterFromCache() {
            const cached = localStorage.getItem(COUNTER_CACHE_KEY);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    console.error('解析统计缓存失败:', e);
                }
            }
            return null;
        }
        
        // 保存统计数据到缓存
        // 清理异常数据（修复历史累加bug导致的超大数值）
        function sanitizeCounterData(data) {
            if (!data || !data.daily_stats) return data;
            for (const date in data.daily_stats) {
                const s = data.daily_stats[date];
                if (s.hourly_visits) {
                    for (let h = 0; h < 24; h++) {
                        if (s.hourly_visits[h] > 10000) s.hourly_visits[h] = 0;
                    }
                }
                if (s.visits > 100000) s.visits = 0;
                if (s.new_users > 100000) s.new_users = 0;
            }
            return data;
        }

        function saveCounterToCache(data) {
            // 保存前先清理异常数据
            data = sanitizeCounterData(data);
            localStorage.setItem(COUNTER_CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(COUNTER_CACHE_TIME_KEY, new Date().toISOString());
            // D 盘兜底双写（仅 App / Tauri 环境；Gist 被清空时能从本机恢复）
            backupStatsToDisk();
        }
        
        // 从缓存加载待同步队列
        function loadPendingSync() {
            const cached = localStorage.getItem('TFJL_Pending_Sync');
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    console.error('解析待同步队列失败:', e);
                }
            }
            return [];
        }
        
        // 保存待同步队列到缓存
        function savePendingSync(queue) {
            localStorage.setItem('TFJL_Pending_Sync', JSON.stringify(queue));
        }
        
        // ==================== 统计合并 / 本地磁盘兜底 ====================
        // 🔴 全字段最大值合并（防止任何字段被空/旧数据覆盖丢失，尤其是 script_downloads）
        function mergeCounters(target, src) {
            if (!target || typeof target !== 'object') target = {};
            if (!src || typeof src !== 'object') return target;
            target.total_visits = Math.max(target.total_visits || 0, src.total_visits || 0);
            target.total_downloads = Math.max(target.total_downloads || 0, src.total_downloads || 0);
            target.total_users = Math.max(target.total_users || 0, src.total_users || 0);
            // unique_users / active_today_users：取并集
            if (Array.isArray(src.unique_users)) {
                if (!Array.isArray(target.unique_users)) target.unique_users = [];
                src.unique_users.forEach(id => { if (!target.unique_users.includes(id)) target.unique_users.push(id); });
            }
            target.total_users = target.unique_users ? target.unique_users.length : (target.total_users || 0);
            if (Array.isArray(src.active_today_users)) {
                if (!Array.isArray(target.active_today_users)) target.active_today_users = [];
                src.active_today_users.forEach(id => { if (!target.active_today_users.includes(id)) target.active_today_users.push(id); });
            }
            target.active_today = target.active_today_users ? target.active_today_users.length : (target.active_today || 0);
            // 🔴 script_downloads：并集 key + 每 key 取最大值（之前漏合并，是脚本下载统计莫名变空的真凶）
            if (src.script_downloads && typeof src.script_downloads === 'object') {
                if (!target.script_downloads || typeof target.script_downloads !== 'object') target.script_downloads = {};
                for (const k in src.script_downloads) {
                    target.script_downloads[k] = Math.max(target.script_downloads[k] || 0, src.script_downloads[k] || 0);
                }
            }
            // sources：逐字段最大值
            if (src.sources && typeof src.sources === 'object') {
                if (!target.sources) target.sources = {};
                for (const k in src.sources) target.sources[k] = Math.max(target.sources[k] || 0, src.sources[k] || 0);
            }
            // user_sources：并集
            if (src.user_sources && typeof src.user_sources === 'object') {
                if (!target.user_sources) target.user_sources = {};
                for (const uid in src.user_sources) { if (!target.user_sources[uid]) target.user_sources[uid] = src.user_sources[uid]; }
            }
            // daily_stats：逐日最大值（visits/downloads/new_users/来源/hourly）
            if (src.daily_stats && typeof src.daily_stats === 'object') {
                if (!target.daily_stats || typeof target.daily_stats !== 'object') target.daily_stats = {};
                for (const date in src.daily_stats) {
                    const sd = src.daily_stats[date];
                    if (!sd || typeof sd !== 'object') continue;
                    if (!target.daily_stats[date]) {
                        target.daily_stats[date] = JSON.parse(JSON.stringify(sd));
                    } else {
                        const td = target.daily_stats[date];
                        td.visits = Math.max(td.visits || 0, sd.visits || 0);
                        td.downloads = Math.max(td.downloads || 0, sd.downloads || 0);
                        td.new_users = Math.max(td.new_users || 0, sd.new_users || 0);
                        td.app_visits = Math.max(td.app_visits || 0, sd.app_visits || 0);
                        td.web_visits = Math.max(td.web_visits || 0, sd.web_visits || 0);
                        td.new_app_users = Math.max(td.new_app_users || 0, sd.new_app_users || 0);
                        td.new_web_users = Math.max(td.new_web_users || 0, sd.new_web_users || 0);
                        if (Array.isArray(sd.hourly_visits)) {
                            if (!Array.isArray(td.hourly_visits)) td.hourly_visits = new Array(24).fill(0);
                            for (let h = 0; h < 24; h++) td.hourly_visits[h] = Math.max(td.hourly_visits[h] || 0, sd.hourly_visits[h] || 0);
                        }
                    }
                }
            }
            return target;
        }

        // 本地磁盘兜底：把统计快照写到 D 盘（仅 App / Tauri 环境），Gist 被清空时能从本机恢复
        const STATS_BACKUP_PATH = 'D:\\withfriends\\塔防精灵助手数据\\tfjl-stats.json';
        function _statsInvoke(cmd, args) {
            const fn = (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') ? window.__TAURI_INTERNALS__.invoke
                : (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') ? window.__TAURI__.core.invoke
                : (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') ? window.__TAURI__.invoke : null;
            return fn ? fn(cmd, args) : Promise.reject(new Error('NOT_TAURI'));
        }
        async function backupStatsToDisk() {
            try { if (counterData) await _statsInvoke('write_text_file', { filePath: STATS_BACKUP_PATH, content: JSON.stringify(counterData, null, 2) }); }
            catch (e) { /* 非 Tauri / 写失败静默 */ }
        }
        async function restoreStatsFromDisk() {
            try {
                const txt = await _statsInvoke('read_text_file_auto', { filePath: STATS_BACKUP_PATH });
                if (!txt) return null;
                const d = JSON.parse(txt);
                return (d && typeof d === 'object') ? d : null;
            } catch (e) { return null; }
        }
        // 最近一次成功同步到的远端快照：写之前再并一遍，确保绝不回退已确认的数据
        let lastGoodCounter = null;

        // 获取默认统计数据结构
        function getDefaultCounter() {
            const today = getTodayString();
            return {
                total_visits: 0,
                total_users: 0,
                unique_users: [],
                total_downloads: 0,
                active_today: 0,
                active_today_users: [],
                active_today_app: 0,
                active_today_web: 0,
                active_today_app_users: [],
                active_today_web_users: [],
                active_date: today,
                online_users: {},
                online_timeout: 3600000,
                sources: { app_visits: 0, web_visits: 0, new_app_users: 0, new_web_users: 0, app_users: 0, web_users: 0 },
                user_sources: {},  // 每个用户的注册平台：{ deviceId: 'app' | 'web' }
                daily_stats: {
                    [today]: {
                        visits: 0,
                        app_visits: 0,
                        web_visits: 0,
                        downloads: 0,
                        new_users: 0,
                        new_app_users: 0,
                        new_web_users: 0
                    }
                },
                script_downloads: {},  // { "脚本名": 次数, ... }
                last_updated: getCurrentTimeString()
            };
        }
        
        // 检查网络状态
        function isOnline() {
            return navigator.onLine;
        }
        
        // 从Gist获取统计数据
        async function fetchCounterFromGist() {
            try {
                const token = getGistToken();
                
                // 优先使用硬编码的 COUNTER_GIST_ID
                let counterGistId = COUNTER_GIST_ID || localStorage.getItem('counter_gist_id');
                
                // 如果都没有，尝试从索引文件获取
                if (!counterGistId) {
                    try {
                        const indexUrl = await getIndexGistUrl();
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
                                    if (indexData['counter']) {
                                        counterGistId = indexData['counter'];
                                        // 缓存到 localStorage
                                        localStorage.setItem('counter_gist_id', counterGistId);
                                    }
                                } catch (e) {
                                    console.warn('解析索引文件失败');
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('获取索引文件失败:', e);
                    }
                }
                
                if (counterGistId) {
                    // 从独立 Gist 加载
                    const response = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            ...(token && { 'Authorization': `token ${token}` })
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.files && data.files['counter.json'] && data.files['counter.json'].content) {
                            const content = data.files['counter.json'].content;
                            let parsed;
                            try {
                                parsed = JSON.parse(content);
                            } catch (parseErr) {
                                console.warn('⚠️ counter.json 解析失败，返回 null:', parseErr.message);
                                return null;
                            }
                            
                            // 向后兼容：转换旧数据格式
                            if (!parsed.unique_users) parsed.unique_users = [];
                            if (!parsed.active_today_users) parsed.active_today_users = [];
                            if (parsed.total_users === undefined) parsed.total_users = parsed.unique_users.length;
                            if (parsed.active_today === undefined) parsed.active_today = parsed.active_today_users.length;
                            if (parsed.total_visits === undefined) parsed.total_visits = 0;
                            if (parsed.total_downloads === undefined) parsed.total_downloads = 0;
                            if (!parsed.online_users) parsed.online_users = {};
                            if (!parsed.online_timeout) parsed.online_timeout = 3600000;
                            if (!parsed.sources) parsed.sources = { app_visits: 0, web_visits: 0 };
                            if (parsed.sources.new_app_users === undefined) parsed.sources.new_app_users = 0;
                            if (parsed.sources.new_web_users === undefined) parsed.sources.new_web_users = 0;
                            if (parsed.sources.app_users === undefined) parsed.sources.app_users = 0;
                            if (parsed.sources.web_users === undefined) parsed.sources.web_users = 0;
                            if (!parsed.user_sources) parsed.user_sources = {};
                            
                            // ========== 历史数据迁移：旧用户统一归为网页来源 ==========
                            if (parsed.unique_users && parsed.unique_users.length > 0) {
                                let appUsers = 0, webUsers = 0;
                                let needRecalc = false;
                                for (const uid of parsed.unique_users) {
                                    if (!parsed.user_sources[uid]) {
                                        parsed.user_sources[uid] = 'web'; // 旧用户归为网页
                                        needRecalc = true;
                                    }
                                    if (parsed.user_sources[uid] === 'app') appUsers++;
                                    else webUsers++;
                                }
                                if (needRecalc || parsed.sources.app_users + parsed.sources.web_users !== parsed.unique_users.length) {
                                    parsed.sources.app_users = appUsers;
                                    parsed.sources.web_users = webUsers;
                                }
                            }
                            if (parsed.active_today_app === undefined) parsed.active_today_app = 0;
                            if (parsed.active_today_web === undefined) parsed.active_today_web = 0;
                            if (!parsed.active_today_app_users) parsed.active_today_app_users = [];
                            if (!parsed.active_today_web_users) parsed.active_today_web_users = [];
                            
                            // ========== 历史数据迁移：旧数据未区分APP/网页来源，全部归为网页 ==========
                            const srcApp = parsed.sources.app_visits || 0;
                            const srcWeb = parsed.sources.web_visits || 0;
                            const srcTotal = parsed.total_visits || 0;
                            if (srcApp + srcWeb < srcTotal) {
                                // 差额全部补到网页访问（历史数据无APP来源记录）
                                parsed.sources.web_visits = srcWeb + (srcTotal - srcApp - srcWeb);
                                // 对每日数据同样处理
                                if (parsed.daily_stats) {
                                    for (const date in parsed.daily_stats) {
                                        const ds = parsed.daily_stats[date];
                                        const dApp = ds.app_visits || 0;
                                        const dWeb = ds.web_visits || 0;
                                        const dTotal = ds.visits || 0;
                                        if (dApp + dWeb < dTotal) {
                                            ds.web_visits = dWeb + (dTotal - dApp - dWeb);
                                        }
                                        // 新增用户来源：历史数据也归为网页
                                        const nApp = ds.new_app_users || 0;
                                        const nWeb = ds.new_web_users || 0;
                                        const nTotal = ds.new_users || 0;
                                        if (nApp + nWeb < nTotal) {
                                            ds.new_web_users = nWeb + (nTotal - nApp - nWeb);
                                        }
                                    }
                                }
                            }
                            // 总计新增用户来源迁移
                            const srcNewApp = parsed.sources.new_app_users || 0;
                            const srcNewWeb = parsed.sources.new_web_users || 0;
                            const totalNewUsers = parsed.total_users || 0;
                            if (srcNewApp + srcNewWeb < totalNewUsers) {
                                parsed.sources.new_web_users = srcNewWeb + (totalNewUsers - srcNewApp - srcNewWeb);
                            }
                            
                            // 检查日期是否变化，如果新的一天则清空今日活跃用户
                            const today = getTodayString();
                            if (!parsed.active_date || parsed.active_date !== today) {
                                parsed.active_today_users = [];
                                parsed.active_today = 0;
                                parsed.active_today_app_users = [];
                                parsed.active_today_web_users = [];
                                parsed.active_today_app = 0;
                                parsed.active_today_web = 0;
                                parsed.active_date = today;
                            }
                            
                            // 清理过期的在线用户
                            const now = Date.now();
                            const timeout = parsed.online_timeout;
                            for (const id in parsed.online_users) {
                                if (now - parsed.online_users[id] > timeout) {
                                    delete parsed.online_users[id];
                                }
                            }
                            
                            return parsed;
                        }
                    } else if (response.status === 404 || response.status === 403) {
                        // Gist 不存在或无权限，清除缓存
                        localStorage.removeItem('counter_gist_id');
                    }
                }
                
                // 🔴 修复（v260805-266）：获取失败（网络/限流）返回 null 而非空默认，
                // 否则调用方会用空对象覆盖远程、导致统计全丢。调用方会回退到本地缓存。
                console.warn('⚠️ 统计数据 Gist 获取失败/不存在，返回 null（调用方回退本地缓存）');
                return null;
            } catch (error) {
                console.warn('⚠️ 获取统计数据异常，返回 null（调用方回退本地缓存）:', error.message);
                return null;
            }
        }
        
        // 更新统计数据
        async function updateCounter(type, scriptName = null) {
            try {
                // 获取本地缓存作为备份
                const localData = loadCounterFromCache();
                
                // 先从Gist获取最新数据，避免覆盖其他设备的更新
                if (isOnline()) {
                    try {
                        const fresh = await fetchCounterFromGist();
                        if (fresh) {
                            // 合并本地缓存的关键数据到 Gist 数据
                            // 确保使用最大的访问数和用户数，防止数据丢失
                            if (localData) {
                                // 合并 unique_users（用户列表）
                                if (localData.unique_users && Array.isArray(localData.unique_users)) {
                                    localData.unique_users.forEach(id => {
                                        if (!fresh.unique_users.includes(id)) {
                                            fresh.unique_users.push(id);
                                        }
                                    });
                                }
                                // 合并今日活跃用户
                                if (localData.active_today_users && Array.isArray(localData.active_today_users)) {
                                    localData.active_today_users.forEach(id => {
                                        if (!fresh.active_today_users.includes(id)) {
                                            fresh.active_today_users.push(id);
                                        }
                                    });
                                }
                                // 取最大访问数和下载数（防止数据回退）
                                fresh.total_visits = Math.max(fresh.total_visits || 0, localData.total_visits || 0);
                                fresh.total_users = Math.max(fresh.total_users || 0, fresh.unique_users.length);
                                fresh.total_downloads = Math.max(fresh.total_downloads || 0, localData.total_downloads || 0);
                                fresh.active_today = fresh.active_today_users.length;
                                
                                // 合并来源统计（APP/网页，取最大值防止数据回退）
                                if (!fresh.sources) fresh.sources = { app_visits: 0, web_visits: 0 };
                                if (localData.sources) {
                                    fresh.sources.app_visits = Math.max(fresh.sources.app_visits || 0, localData.sources.app_visits || 0);
                                    fresh.sources.web_visits = Math.max(fresh.sources.web_visits || 0, localData.sources.web_visits || 0);
                                    fresh.sources.new_app_users = Math.max(fresh.sources.new_app_users || 0, localData.sources.new_app_users || 0);
                                    fresh.sources.new_web_users = Math.max(fresh.sources.new_web_users || 0, localData.sources.new_web_users || 0);
                                    // 合并平台用户数（取最大值）
                                    fresh.sources.app_users = Math.max(fresh.sources.app_users || 0, localData.sources.app_users || 0);
                                    fresh.sources.web_users = Math.max(fresh.sources.web_users || 0, localData.sources.web_users || 0);
                                }
                                
                                // 合并用户平台归属（user_sources）
                                if (localData.user_sources && typeof localData.user_sources === 'object') {
                                    if (!fresh.user_sources) fresh.user_sources = {};
                                    for (const uid in localData.user_sources) {
                                        if (!fresh.user_sources[uid]) {
                                            fresh.user_sources[uid] = localData.user_sources[uid];
                                        }
                                    }
                                    // 重新统计平台用户数
                                    let appU = 0, webU = 0;
                                    for (const uid in fresh.user_sources) {
                                        if (fresh.user_sources[uid] === 'app') appU++;
                                        else webU++;
                                    }
                                    fresh.sources.app_users = appU;
                                    fresh.sources.web_users = webU;
                                }
                                
                                // 合并今日活跃APP/网页用户
                                if (localData.active_today_app_users && Array.isArray(localData.active_today_app_users)) {
                                    if (!fresh.active_today_app_users) fresh.active_today_app_users = [];
                                    localData.active_today_app_users.forEach(id => {
                                        if (!fresh.active_today_app_users.includes(id)) {
                                            fresh.active_today_app_users.push(id);
                                        }
                                    });
                                }
                                if (localData.active_today_web_users && Array.isArray(localData.active_today_web_users)) {
                                    if (!fresh.active_today_web_users) fresh.active_today_web_users = [];
                                    localData.active_today_web_users.forEach(id => {
                                        if (!fresh.active_today_web_users.includes(id)) {
                                            fresh.active_today_web_users.push(id);
                                        }
                                    });
                                }
                                
                                // 合并每日统计数据
                                if (localData.daily_stats) {
                                    for (const date in localData.daily_stats) {
                                        if (!fresh.daily_stats[date]) {
                                            fresh.daily_stats[date] = localData.daily_stats[date];
                                        } else {
                                            // 取每日数据的最大值
                                            fresh.daily_stats[date].visits = Math.max(
                                                fresh.daily_stats[date].visits || 0,
                                                localData.daily_stats[date].visits || 0
                                            );
                                            fresh.daily_stats[date].downloads = Math.max(
                                                fresh.daily_stats[date].downloads || 0,
                                                localData.daily_stats[date].downloads || 0
                                            );
                                            fresh.daily_stats[date].new_users = Math.max(
                                                fresh.daily_stats[date].new_users || 0,
                                                localData.daily_stats[date].new_users || 0
                                            );
                                            // 合并每日APP/网页来源（取最大值防止数据回退）
                                            fresh.daily_stats[date].app_visits = Math.max(
                                                fresh.daily_stats[date].app_visits || 0,
                                                localData.daily_stats[date].app_visits || 0
                                            );
                                            fresh.daily_stats[date].web_visits = Math.max(
                                                fresh.daily_stats[date].web_visits || 0,
                                                localData.daily_stats[date].web_visits || 0
                                            );
                                            // 合并每日新增用户来源（取最大值防止数据回退）
                                            fresh.daily_stats[date].new_app_users = Math.max(
                                                fresh.daily_stats[date].new_app_users || 0,
                                                localData.daily_stats[date].new_app_users || 0
                                            );
                                            fresh.daily_stats[date].new_web_users = Math.max(
                                                fresh.daily_stats[date].new_web_users || 0,
                                                localData.daily_stats[date].new_web_users || 0
                                            );
                                            // 合并时段分布（取最大值，避免刷新累加导致数据膨胀）
                                            if (localData.daily_stats[date].hourly_visits) {
                                                if (!fresh.daily_stats[date].hourly_visits) fresh.daily_stats[date].hourly_visits = new Array(24).fill(0);
                                                for (let h = 0; h < 24; h++) {
                                                    fresh.daily_stats[date].hourly_visits[h] = Math.max(
                                                        fresh.daily_stats[date].hourly_visits[h] || 0,
                                                        localData.daily_stats[date].hourly_visits[h] || 0
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            // 确保fresh数据所有必要字段存在，缺失用默认值填充
                            const defaultCounter = getDefaultCounter();
                            const requiredFields = ['unique_users', 'active_today_users', 'daily_stats', 'online_users'];
                            for (const field of requiredFields) {
                                if (fresh[field] === undefined || fresh[field] === null) {
                                    fresh[field] = defaultCounter[field];
                                }
                            }
                            if (fresh.total_visits === undefined || fresh.total_visits === null) fresh.total_visits = 0;
                            if (fresh.total_users === undefined || fresh.total_users === null) fresh.total_users = fresh.unique_users ? fresh.unique_users.length : 0;
                            if (fresh.total_downloads === undefined || fresh.total_downloads === null) fresh.total_downloads = 0;
                            if (fresh.active_today === undefined || fresh.active_today === null) fresh.active_today = fresh.active_today_users ? fresh.active_today_users.length : 0;
                            if (!fresh.online_timeout) fresh.online_timeout = 3600000;
                            if (!fresh.active_date) fresh.active_date = getTodayString();
                            // 确保 unique_users 和 active_today_users 是数组
                            if (!Array.isArray(fresh.unique_users)) fresh.unique_users = [];
                            if (!Array.isArray(fresh.active_today_users)) fresh.active_today_users = [];
                            if (typeof fresh.daily_stats !== 'object' || fresh.daily_stats === null) fresh.daily_stats = {};
                            if (typeof fresh.online_users !== 'object' || fresh.online_users === null) fresh.online_users = {};
                            if (typeof fresh.script_downloads !== 'object' || fresh.script_downloads === null) fresh.script_downloads = {};
                            
                            // 清理 daily_stats 中超过365天的旧数据
                            const allDates = Object.keys(fresh.daily_stats).sort();
                            if (allDates.length > 365) {
                                const datesToRemove = allDates.slice(0, allDates.length - 365);
                                datesToRemove.forEach(d => delete fresh.daily_stats[d]);
                            }
                            
                            // 🔴 全字段最大值合并（含 script_downloads），确保本地数据不丢任何字段
                            mergeCounters(fresh, localData);
                            counterData = fresh;
                            lastGoodCounter = JSON.parse(JSON.stringify(fresh));
                            // 修复异常数据：清理因累加bug导致的超大hourly_visits值
                            if (counterData.daily_stats) {
                                for (const date in counterData.daily_stats) {
                                    const s = counterData.daily_stats[date];
                                    if (s.hourly_visits) {
                                        for (let h = 0; h < 24; h++) {
                                            // 超过10000的肯定是bug数据，重置为0
                                            if (s.hourly_visits[h] > 10000) {
                                                s.hourly_visits[h] = 0;
                                            }
                                        }
                                    }
                                    // 修复异常大的visits
                                    if (s.visits > 100000) s.visits = 0;
                                    if (s.new_users > 100000) s.new_users = 0;
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('获取最新数据失败，使用本地数据:', error);
                        // 如果获取失败但有本地数据，尝试使用本地数据
                        if (localData) {
                            counterData = localData;
                        }
                    }
                }
                
                // 如果没有数据，使用默认值或本地数据
                if (!counterData) {
                    counterData = localData || getDefaultCounter();
                }
                
                const today = getTodayString();
                const deviceId = getDeviceId();
                
                // 确保今日数据存在
                if (!counterData.daily_stats[today]) {
                    counterData.daily_stats[today] = {
                        visits: 0,
                        app_visits: 0,
                        web_visits: 0,
                        downloads: 0,
                        new_users: 0,
                        hourly_visits: new Array(24).fill(0)
                    };
                }
                if (!counterData.daily_stats[today].new_users) counterData.daily_stats[today].new_users = 0;
                if (!counterData.daily_stats[today].hourly_visits) counterData.daily_stats[today].hourly_visits = new Array(24).fill(0);
                if (counterData.daily_stats[today].app_visits === undefined) counterData.daily_stats[today].app_visits = 0;
                if (counterData.daily_stats[today].web_visits === undefined) counterData.daily_stats[today].web_visits = 0;
                // 确保 unique_users 和 active_today_users 数组存在
                if (!counterData.unique_users) counterData.unique_users = [];
                if (!counterData.active_today_users) counterData.active_today_users = [];
                if (!counterData.active_today_app_users) counterData.active_today_app_users = [];
                if (!counterData.active_today_web_users) counterData.active_today_web_users = [];
                if (!counterData.sources) counterData.sources = { app_visits: 0, web_visits: 0 };
                
                // 检查日期是否变化，如果新的一天则清空今日活跃用户
                if (!counterData.active_date || counterData.active_date !== today) {
                    counterData.active_today_users = [];
                    counterData.active_today = 0;
                    counterData.active_today_app_users = [];
                    counterData.active_today_web_users = [];
                    counterData.active_today_app = 0;
                    counterData.active_today_web = 0;
                    counterData.active_date = today;
                }
                
                // 确保在线用户对象存在
                if (!counterData.online_users) counterData.online_users = {};
                // 强制更新在线时间为60分钟（兼容旧数据）
                if (!counterData.online_timeout || counterData.online_timeout === 7200000) counterData.online_timeout = 3600000;
                
                // 记录用户最后活跃时间（用于计算在线用户）
                counterData.online_users[deviceId] = Date.now();
                
                // 清理超过时间窗口的用户
                const now = Date.now();
                const timeout = counterData.online_timeout;
                for (const id in counterData.online_users) {
                    if (now - counterData.online_users[id] > timeout) {
                        delete counterData.online_users[id];
                    }
                }
                
                // 更新对应统计
                switch (type) {
                    case 'visit':
                        const isApp = !!(window.__TAURI__);
                        counterData.total_visits++;
                        counterData.daily_stats[today].visits++;
                        // 记录来源（APP/网页）
                        if (isApp) {
                            counterData.sources.app_visits++;
                            counterData.daily_stats[today].app_visits++;
                        } else {
                            counterData.sources.web_visits++;
                            counterData.daily_stats[today].web_visits++;
                        }
                        // 记录访问时段
                        const hour = new Date().getHours();
                        if (counterData.daily_stats[today].hourly_visits) {
                            counterData.daily_stats[today].hourly_visits[hour]++;
                        }
                        
                        // 记录新用户（含来源/平台归属）
                        if (!counterData.unique_users.includes(deviceId)) {
                            counterData.unique_users.push(deviceId);
                            counterData.total_users = counterData.unique_users.length;
                            // 记录用户注册平台（持久化归属）
                            if (!counterData.user_sources) counterData.user_sources = {};
                            if (!counterData.user_sources[deviceId]) {
                                counterData.user_sources[deviceId] = isApp ? 'app' : 'web';
                            }
                            // 重新统计平台用户数
                            let appUserCount = 0, webUserCount = 0;
                            for (const uid in counterData.user_sources) {
                                if (counterData.user_sources[uid] === 'app') appUserCount++;
                                else webUserCount++;
                            }
                            counterData.sources.app_users = appUserCount;
                            counterData.sources.web_users = webUserCount;
                            // 总新增数（全来源）
                            counterData.daily_stats[today].new_users = (counterData.daily_stats[today].new_users || 0) + 1;
                            // 按来源区分新增
                            if (isApp) {
                                counterData.daily_stats[today].new_app_users = (counterData.daily_stats[today].new_app_users || 0) + 1;
                                counterData.sources.new_app_users = (counterData.sources.new_app_users || 0) + 1;
                            } else {
                                counterData.daily_stats[today].new_web_users = (counterData.daily_stats[today].new_web_users || 0) + 1;
                                counterData.sources.new_web_users = (counterData.sources.new_web_users || 0) + 1;
                            }
                        }
                        
                        // 记录今日活跃用户
                        if (!counterData.active_today_users.includes(deviceId)) {
                            counterData.active_today_users.push(deviceId);
                            counterData.active_today = counterData.active_today_users.length;
                        }
                        // 记录每日活跃用户数到daily_stats
                        counterData.daily_stats[today].active_users = counterData.active_today_users.length;
                        // 记录活跃用户来源
                        if (isApp) {
                            if (!counterData.active_today_app_users.includes(deviceId)) {
                                counterData.active_today_app_users.push(deviceId);
                                counterData.active_today_app = counterData.active_today_app_users.length;
                            }
                        } else {
                            if (!counterData.active_today_web_users.includes(deviceId)) {
                                counterData.active_today_web_users.push(deviceId);
                                counterData.active_today_web = counterData.active_today_web_users.length;
                            }
                        }
                        break;
                        
                    case 'download':
                        counterData.total_downloads++;
                        counterData.daily_stats[today].downloads++;
                        // 记录单个脚本的下载次数
                        if (scriptName) {
                            if (!counterData.script_downloads) counterData.script_downloads = {};
                            counterData.script_downloads[scriptName] = (counterData.script_downloads[scriptName] || 0) + 1;
                        }
                        break;
                }
                
                counterData.last_updated = getCurrentTimeString();
                
                // 保存到缓存
                saveCounterToCache(counterData);
                
                // 更新底部统计栏显示
                updateStatsBar();
                
                // 如果网络在线，直接同步到Gist
                if (isOnline()) {
                    await syncCounterToGist();
                } else {
                    // 网络离线，加入待同步队列
                    addToPendingSync(type);
                }
                
            } catch (error) {
                console.error('更新统计失败:', error);
            }
        }
        
        // 添加到待同步队列
        function addToPendingSync(type) {
            const queue = loadPendingSync();
            queue.push({
                type: type,
                timestamp: new Date().toISOString(),
                date: getTodayString()
            });
            savePendingSync(queue);
        }
        
        // 同步待处理数据到Gist
        async function syncPendingQueue() {
            try {
                if (!isOnline()) {
                    return;
                }
                
                const queue = loadPendingSync();
                if (queue.length === 0) {
                    return;
                }
                
                // 先获取最新的Gist数据
                const remoteData = await fetchCounterFromGist();
                if (!remoteData) {
                    return;
                }
                
                // 确保必要字段存在
                if (!remoteData.unique_users) remoteData.unique_users = [];
                if (!remoteData.active_today_users) remoteData.active_today_users = [];
                if (!remoteData.total_users) remoteData.total_users = remoteData.unique_users.length;
                if (!remoteData.active_today) remoteData.active_today = remoteData.active_today_users.length;
                if (!remoteData.online_users) remoteData.online_users = {};
                if (!remoteData.online_timeout) remoteData.online_timeout = 3600000;
                if (!remoteData.total_visits) remoteData.total_visits = 0;
                if (!remoteData.total_downloads) remoteData.total_downloads = 0;
                
                // 获取本地缓存，合并用户信息
                const localData = loadCounterFromCache();
                const deviceId = getDeviceId();
                
                // 合并本地 unique_users 到远程
                if (localData && localData.unique_users && Array.isArray(localData.unique_users)) {
                    localData.unique_users.forEach(id => {
                        if (!remoteData.unique_users.includes(id)) {
                            remoteData.unique_users.push(id);
                        }
                    });
                }
                
                // 更新 total_users
                remoteData.total_users = remoteData.unique_users.length;
                
                // 合并待同步的数据
                const today = getTodayString();
                
                // 清理过期的在线用户
                const now = Date.now();
                const timeout = remoteData.online_timeout;
                for (const id in remoteData.online_users) {
                    if (now - remoteData.online_users[id] > timeout) {
                        delete remoteData.online_users[id];
                    }
                }
                
                // 更新当前设备在线状态
                remoteData.online_users[deviceId] = Date.now();
                
                let hasVisit = false;
                queue.forEach(item => {
                    const syncDate = item.date || today;
                    
                    // 确保日期数据存在
                    if (!remoteData.daily_stats[syncDate]) {
                        remoteData.daily_stats[syncDate] = {
                            visits: 0,
                            downloads: 0
                        };
                    }
                    
                    // 更新统计
                    switch (item.type) {
                        case 'visit':
                            remoteData.total_visits++;
                            remoteData.daily_stats[syncDate].visits++;
                            hasVisit = true;
                            break;
                        case 'download':
                            remoteData.total_downloads++;
                            remoteData.daily_stats[syncDate].downloads++;
                            break;
                    }
                });
                
                // 如果有访问记录，更新今日活跃用户
                if (hasVisit) {
                    // 检查日期是否变化，如果新的一天则清空今日活跃用户
                    if (!remoteData.active_date || remoteData.active_date !== today) {
                        remoteData.active_today_users = [];
                        remoteData.active_today = 0;
                        remoteData.active_date = today;
                    }
                    
                    // 添加当前设备到今日活跃用户（如果不在）
                    if (!remoteData.active_today_users.includes(deviceId)) {
                        remoteData.active_today_users.push(deviceId);
                        remoteData.active_today = remoteData.active_today_users.length;
                    }
                }
                
                remoteData.last_updated = getCurrentTimeString();
                
                // 同步到Gist
                const success = await syncCounterDataToGist(remoteData);
                
                if (success) {
                    // 清空队列
                    savePendingSync([]);
                    // 更新本地缓存
                    saveCounterToCache(remoteData);
                    counterData = remoteData;
                    // 更新底部统计栏显示
                    updateStatsBar();
                }
                
            } catch (error) {
                console.error('同步待处理队列失败:', error);
            }
        }
         // 清空待同步队列
        function clearPendingSync() {
            localStorage.removeItem('TFJL_Pending_Sync');
        }
        
        // 同步统计数据到Gist（带成功返回）
        async function syncCounterDataToGist(data) {
            try {
                const token = getGistToken();
                
                // 优先使用硬编码的 COUNTER_GIST_ID
                let counterGistId = COUNTER_GIST_ID || localStorage.getItem('counter_gist_id');
                
                if (counterGistId) {
                    // PATCH之前先读取远程数据，合并后再写入，防止本地小数据覆盖远程大数据
                    let remoteOk = false;
                    try {
                        const remoteResp = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                ...(token && { 'Authorization': `token ${token}` })
                            }
                        });
                        if (remoteResp.status === 404) {
                            remoteOk = true;
                        } else if (remoteResp.ok) {
                            const remoteJson = await remoteResp.json();
                            if (remoteJson.files && remoteJson.files['counter.json'] && remoteJson.files['counter.json'].content) {
                                try {
                                    const remoteData = JSON.parse(remoteJson.files['counter.json'].content);
                                    if (remoteData) {
                                        remoteOk = true;
                                        // 合并远程数据（全字段最大值，含 script_downloads）到待写数据
                                        mergeCounters(data, remoteData);
                                        lastGoodCounter = JSON.parse(JSON.stringify(data));
                                    }
                                } catch (parseErr) {
                                    console.warn('syncCounterDataToGist 合并远程数据失败:', parseErr);
                                }
                            }
                        }
                    } catch (fetchErr) {
                        console.warn('syncCounterDataToGist 读取远程数据失败:', fetchErr);
                    }

                    // 🔴 防御（v260805-266）：读不到远程就绝不写 Gist，避免覆盖导致统计全丢
                    if (!remoteOk) {
                        console.warn('⚠️ 未能确认远程统计状态，跳过本次写入（保留待同步）');
                        addToPendingSync('counter');
                        return false;
                    }

                    let content = JSON.stringify(data, null, 2);
                    // 使用 PATCH 更新现有 Gist
                    const response = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                        method: 'PATCH',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'TFJL-App/1.0',
                            ...(token && { 'Authorization': `token ${token}` })
                        },
                        body: JSON.stringify({
                            files: {
                                'counter.json': {
                                    content: content
                                }
                            }
                        })
                    });
                    
                    if (response.ok) {
                        return true;
                    }
                    // 如果 PATCH 失败（404 或 403），清除 localStorage，尝试从索引获取
                    if (response.status === 404 || response.status === 403) {
                        localStorage.removeItem('counter_gist_id');
                        counterGistId = null;
                    }
                }
                
                // 如果不存在或 PATCH 失败，创建新的 Gist
                // 【双重检查】创建前先从索引文件确认是否已有counter
                if (!counterGistId && token) {
                    try {
                        const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                        const checkResp = await fetch(indexUrl, {
                            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` }
                        });
                        if (checkResp.ok) {
                            const checkData = await checkResp.json();
                            if (checkData.files && checkData.files['room_index.json'] && checkData.files['room_index.json'].content) {
                                let checkIndex;
                                try {
                                    checkIndex = JSON.parse(checkData.files['room_index.json'].content);
                                } catch (parseErr) {
                                    console.warn('syncCounterDataToGist 双重检查：索引文件解析失败:', parseErr);
                                    checkIndex = null;
                                }
                                if (checkIndex && checkIndex['counter']) {
                                    counterGistId = checkIndex['counter'];
                                    localStorage.setItem('counter_gist_id', counterGistId);
                                    // 先尝试从已有Gist获取数据合并，防止数据丢失
                                    try {
                                        const existDataResp = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                                            headers: {
                                                'Accept': 'application/vnd.github.v3+json',
                                                'Authorization': `token ${token}`
                                            }
                                        });
                                        if (existDataResp.ok) {
                                            const existDataJson = await existDataResp.json();
                                            if (existDataJson.files && existDataJson.files['counter.json'] && existDataJson.files['counter.json'].content) {
                                                try {
                                                    const existingData = JSON.parse(existDataJson.files['counter.json'].content);
                                                    if (existingData) {
                                                        data.total_visits = Math.max(data.total_visits || 0, existingData.total_visits || 0);
                                                        data.total_downloads = Math.max(data.total_downloads || 0, existingData.total_downloads || 0);
                                                        if (existingData.unique_users && Array.isArray(existingData.unique_users)) {
                                                            existingData.unique_users.forEach(id => {
                                                                if (!data.unique_users.includes(id)) {
                                                                    data.unique_users.push(id);
                                                                }
                                                            });
                                                        }
                                                        data.total_users = data.unique_users.length;
                                                        if (existingData.daily_stats) {
                                                            for (const date in existingData.daily_stats) {
                                                                if (!data.daily_stats[date]) {
                                                                    data.daily_stats[date] = existingData.daily_stats[date];
                                                                } else {
                                                                    data.daily_stats[date].visits = Math.max(
                                                                        data.daily_stats[date].visits || 0,
                                                                        existingData.daily_stats[date].visits || 0
                                                                    );
                                                                    data.daily_stats[date].downloads = Math.max(
                                                                        data.daily_stats[date].downloads || 0,
                                                                        existingData.daily_stats[date].downloads || 0
                                                                    );
                                                                }
                                                            }
                                                        }
                                                        content = JSON.stringify(data, null, 2);
                                                    }
                                                } catch (mergeErr) {
                                                    console.warn('syncCounterDataToGist 双重检查：合并已有数据失败:', mergeErr);
                                                }
                                            }
                                        }
                                    } catch (fetchErr) {
                                        console.warn('syncCounterDataToGist 双重检查：获取已有Gist数据失败:', fetchErr);
                                    }
                                    // 用已有的Gist去PATCH
                                    const existResp = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                                        method: 'PATCH',
                                        headers: {
                                            'Accept': 'application/vnd.github.v3+json',
                                            'Content-Type': 'application/json',
                                            'User-Agent': 'TFJL-App/1.0',
                                            'Authorization': `token ${token}`
                                        },
                                        body: JSON.stringify({ files: { 'counter.json': { content: content } } })
                                    });
                                    if (existResp.ok) return true;
                                    console.warn('⚠️ syncCounterDataToGist 双重检查PATCH也失败，继续创建新Gist');
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('syncCounterDataToGist 双重检查失败，继续创建:', e);
                    }
                }
                
                const createResponse = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'TFJL-App/1.0',
                        ...(token && { 'Authorization': `token ${token}` })
                    },
                    body: JSON.stringify({
                        description: '统计数据',
                        public: false,
                        files: {
                            'counter.json': {
                                content: content
                            }
                        }
                    })
                });
                
                if (createResponse.ok) {
                    const responseData = await createResponse.json();
                    // 保存 GIST_ID 到 localStorage
                    localStorage.setItem('counter_gist_id', responseData.id);
                    // 更新索引文件（含冲突检测）
                    const conflictResult = await updateRoomIndex('counter', responseData.id);
                    if (conflictResult && conflictResult.conflict && conflictResult.existingGistId) {
                        try {
                            await fetch(`https://api.github.com/gists/${responseData.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `token ${token}` }
                            });
                        } catch (delErr) { console.warn('删除重复counter Gist失败:', delErr); }
                        localStorage.setItem('counter_gist_id', conflictResult.existingGistId);
                        // PATCH到已有Gist
                        await fetch(`https://api.github.com/gists/${conflictResult.existingGistId}`, {
                            method: 'PATCH',
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json',
                                'User-Agent': 'TFJL-App/1.0',
                                'Authorization': `token ${token}`
                            },
                            body: JSON.stringify({ files: { 'counter.json': { content: content } } })
                        });
                    }
                    return true;
                }
                
                const errorText = await createResponse.text();
                console.error('❌ Gist同步失败:', createResponse.status, errorText);
                return false;
            } catch (error) {
                console.error('❌ 同步统计到Gist失败:', error);
                console.error('错误详情:', error.message);
                return false;
            }
        }
        
        // 同步统计数据到Gist（异步）
        async function syncCounterToGist() {
            try {
                if (!counterData) {
                    console.warn('⚠️ 没有统计数据可同步');
                    return;
                }

                const token = getGistToken();

                // 优先使用硬编码的 COUNTER_GIST_ID
                let counterGistId = COUNTER_GIST_ID || localStorage.getItem('counter_gist_id');
                
                if (counterGistId) {
                    // PATCH之前先读取远程数据，合并后再写入，防止本地小数据覆盖远程大数据
                    let remoteOk = false;
                    try {
                        const remoteResp = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                ...(token && { 'Authorization': `token ${token}` })
                            }
                        });
                        if (remoteResp.status === 404) {
                            // Gist 尚不存在（首次创建场景）：视为远程为空，允许后续走创建流程
                            remoteOk = true;
                        } else if (remoteResp.ok) {
                            const remoteJson = await remoteResp.json();
                            if (remoteJson.files && remoteJson.files['counter.json'] && remoteJson.files['counter.json'].content) {
                                try {
                                    const remoteData = JSON.parse(remoteJson.files['counter.json'].content);
                                        if (remoteData) {
                                            remoteOk = true;
                                            // 合并远程数据到本地（全字段最大值，含 script_downloads，防止数据回退/丢失）
                                            mergeCounters(counterData, remoteData);
                                            lastGoodCounter = JSON.parse(JSON.stringify(counterData));
                                        }
                                } catch (parseErr) {
                                    console.warn('合并远程数据失败，使用本地数据:', parseErr);
                                }
                            }
                        }
                    } catch (fetchErr) {
                        console.warn('读取远程数据失败（网络/被墙），本次不覆盖远程统计:', fetchErr);
                    }

                    // 🔴 防御（v260805-266）：读不到远程（限流403/网络错误）就绝不写 Gist，避免把本地空/旧数据顶掉导致统计全丢
                    if (!remoteOk) {
                        console.warn('⚠️ 未能确认远程统计状态，跳过本次 Gist 写入（保留待同步）');
                        addToPendingSync('counter');
                        return;
                    }

                    let content = JSON.stringify(counterData, null, 2);
                    try {
                        // 使用 PATCH 更新现有 Gist
                        const patchResponse = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                            method: 'PATCH',
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json',
                                'User-Agent': 'TFJL-App/1.0',
                                ...(token && { 'Authorization': `token ${token}` })
                            },
                            body: JSON.stringify({
                                files: {
                                    'counter.json': {
                                        content: content
                                    }
                                }
                            })
                        });
                        
                        if (patchResponse.ok) {
                            saveCounterToCache(counterData);
                            clearPendingSync();
                            updateStatsBar();
                            return;
                        }
                        
                        // 如果 PATCH 失败（404 或 403），清除缓存重新创建
                        if (patchResponse.status === 404 || patchResponse.status === 403) {
                            localStorage.removeItem('counter_gist_id');
                            counterGistId = null;
                        }
                    } catch (e) {
                        console.warn('PATCH 异常，清除缓存重新创建:', e);
                        localStorage.removeItem('counter_gist_id');
                        counterGistId = null;
                    }
                }
                
                // 如果不存在或 PATCH 失败，使用 POST 创建新的 Gist
                // 【双重检查】创建前先从索引文件确认是否已有counter
                if (!counterGistId && token) {
                    try {
                        const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                        const checkResp = await fetch(indexUrl, {
                            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` }
                        });
                        if (checkResp.ok) {
                            const checkData = await checkResp.json();
                            if (checkData.files && checkData.files['room_index.json'] && checkData.files['room_index.json'].content) {
                                let checkIndex;
                                try {
                                    checkIndex = JSON.parse(checkData.files['room_index.json'].content);
                                } catch (parseErr) {
                                    console.warn('counter双重检查：索引文件解析失败:', parseErr);
                                    checkIndex = null;
                                }
                                if (checkIndex && checkIndex['counter']) {
                                    counterGistId = checkIndex['counter'];
                                    localStorage.setItem('counter_gist_id', counterGistId);
                                    // 先尝试从已有Gist获取数据合并，防止数据丢失
                                    try {
                                        const existDataResp = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                                            headers: {
                                                'Accept': 'application/vnd.github.v3+json',
                                                'Authorization': `token ${token}`
                                            }
                                        });
                                        if (existDataResp.ok) {
                                            const existDataJson = await existDataResp.json();
                                            if (existDataJson.files && existDataJson.files['counter.json'] && existDataJson.files['counter.json'].content) {
                                                try {
                                                    const existingData = JSON.parse(existDataJson.files['counter.json'].content);
                                                    // 合并已有数据到当前数据（取最大值，防止数据回退）
                                                    if (existingData) {
                                                        counterData.total_visits = Math.max(counterData.total_visits || 0, existingData.total_visits || 0);
                                                        counterData.total_downloads = Math.max(counterData.total_downloads || 0, existingData.total_downloads || 0);
                                                        if (existingData.unique_users && Array.isArray(existingData.unique_users)) {
                                                            existingData.unique_users.forEach(id => {
                                                                if (!counterData.unique_users.includes(id)) {
                                                                    counterData.unique_users.push(id);
                                                                }
                                                            });
                                                        }
                                                        counterData.total_users = counterData.unique_users.length;
                                                        if (existingData.daily_stats) {
                                                            for (const date in existingData.daily_stats) {
                                                                if (!counterData.daily_stats[date]) {
                                                                    counterData.daily_stats[date] = existingData.daily_stats[date];
                                                                } else {
                                                                    counterData.daily_stats[date].visits = Math.max(
                                                                        counterData.daily_stats[date].visits || 0,
                                                                        existingData.daily_stats[date].visits || 0
                                                                    );
                                                                    counterData.daily_stats[date].downloads = Math.max(
                                                                        counterData.daily_stats[date].downloads || 0,
                                                                        existingData.daily_stats[date].downloads || 0
                                                                    );
                                                                }
                                                            }
                                                        }
                                                        content = JSON.stringify(counterData, null, 2);
                                                    }
                                                } catch (mergeErr) {
                                                    console.warn('counter双重检查：合并已有数据失败:', mergeErr);
                                                }
                                            }
                                        }
                                    } catch (fetchErr) {
                                        console.warn('counter双重检查：获取已有Gist数据失败:', fetchErr);
                                    }
                                    // 用已有的Gist去PATCH
                                    const existResp = await fetch(`https://api.github.com/gists/${counterGistId}`, {
                                        method: 'PATCH',
                                        headers: {
                                            'Accept': 'application/vnd.github.v3+json',
                                            'Content-Type': 'application/json',
                                            'User-Agent': 'TFJL-App/1.0',
                                            'Authorization': `token ${token}`
                                        },
                                        body: JSON.stringify({ files: { 'counter.json': { content: content } } })
                                    });
                                    if (existResp.ok) {
                                        saveCounterToCache(counterData);
                                        clearPendingSync();
                                        updateStatsBar();
                                        return;
                                    }
                                    console.warn('⚠️ 双重检查PATCH也失败，继续创建新Gist');
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('counter双重检查失败，继续创建:', e);
                    }
                }
                
                const createResponse = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'TFJL-App/1.0',
                        ...(token && { 'Authorization': `token ${token}` })
                    },
                    body: JSON.stringify({
                        description: '统计数据',
                        public: false,
                        files: {
                            'counter.json': {
                                content: content
                            }
                        }
                    })
                });
                
                if (createResponse.ok) {
                    const data = await createResponse.json();
                    saveCounterToCache(counterData);
                    clearPendingSync();
                    updateStatsBar();
                    // 保存 GIST_ID 到 localStorage
                    localStorage.setItem('counter_gist_id', data.id);
                    // 更新索引文件（含冲突检测）
                    const conflictResult = await updateRoomIndex('counter', data.id);
                    if (conflictResult && conflictResult.conflict && conflictResult.existingGistId) {
                        try {
                            await fetch(`https://api.github.com/gists/${data.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `token ${token}` }
                            });
                        } catch (delErr) { console.warn('删除重复counter Gist失败:', delErr); }
                        localStorage.setItem('counter_gist_id', conflictResult.existingGistId);
                        await fetch(`https://api.github.com/gists/${conflictResult.existingGistId}`, {
                            method: 'PATCH',
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json',
                                'User-Agent': 'TFJL-App/1.0',
                                'Authorization': `token ${token}`
                            },
                            body: JSON.stringify({ files: { 'counter.json': { content: content } } })
                        });
                    }
                    return;
                }
                
                // 创建失败
                const errorText = await createResponse.text();
                console.warn('⚠️ 创建统计数据失败:', createResponse.status, errorText);
                addToPendingSync(counterData);
            } catch (error) {
                console.warn('⚠️ 同步统计数据异常:', error.message);
                if (counterData) {
                    addToPendingSync(counterData);
                }
            }
        }
        
        // 监听网络状态变化
        function setupNetworkListener() {
            // 网络恢复时自动同步
            window.addEventListener('online', () => {
                setTimeout(() => {
                    syncPendingQueue();
                    // 重新获取最新数据
                    refreshCounterData();
                }, 3000);
            });
            
            // 页面加载时检查并同步
            setTimeout(() => {
                if (isOnline()) {
                    syncPendingQueue();
                }
            }, 5000);
            
            // 定期刷新数据（每60秒），确保多设备同步
            setInterval(() => {
                if (isOnline()) {
                    refreshCounterData();
                }
            }, 60000);
        }
        
        // 刷新统计数据（从Gist获取最新）
        async function refreshCounterData() {
            try {
                const fresh = await fetchCounterFromGist();
                if (fresh) {
                    counterData = fresh;
                    saveCounterToCache(counterData);
                    updateStatsBar();
                }
            } catch (error) {
                console.warn('刷新统计数据失败:', error);
            }
        }
        
        // 更新底部统计栏显示
        function updateStatsBar() {
            if (!counterData) return;
            
            const runtimeEl = document.getElementById('statRuntime');
            const visitEl = document.getElementById('statVisits');
            const usersEl = document.getElementById('statUsers');
            const onlineEl = document.getElementById('statOnline');
            const downloadEl = document.getElementById('statDownloads');

            // 计算在线用户数（清理过期用户后）
            let onlineCount = 0;
            if (counterData.online_users) {
                const now = Date.now();
                const timeout = counterData.online_timeout || 3600000;
                for (const id in counterData.online_users) {
                    if (now - counterData.online_users[id] <= timeout) {
                        onlineCount++;
                    }
                }
            }

            if (runtimeEl) runtimeEl.textContent = calculateRuntime();
            if (visitEl) visitEl.textContent = counterData.total_visits || 0;
            if (usersEl) usersEl.textContent = counterData.total_users || 0;
            if (onlineEl) onlineEl.textContent = onlineCount;
            if (downloadEl) downloadEl.textContent = counterData.total_downloads || 0;
        }
        
        // 计算网站运行时长（从2026年5月20日开始）
        function calculateRuntime() {
            const startDate = new Date('2026-05-20T00:00:00');
            const now = new Date();
            const diff = now - startDate;
            
            if (diff < 0) return '未开始';
            
            const totalMinutes = Math.floor(diff / (1000 * 60));
            const totalHours = Math.floor(totalMinutes / 60);
            const totalDays = Math.floor(totalHours / 24);
            
            const years = Math.floor(totalDays / 365);
            const remainingDays = totalDays % 365;
            const months = Math.floor(remainingDays / 30);
            const days = remainingDays % 30;
            const hours = totalHours % 24;
            
            if (years > 0) {
                return `${years}年${months}月${days}天`;
            } else if (months > 0) {
                return `${months}月${days}天${hours}时`;
            } else if (days > 0) {
                return `${days}天${hours}时`;
            } else {
                return `${hours}时${totalMinutes % 60}分`;
            }
        } 
        
        // ==================== 消息墙功能 ====================
        let wallMessages = [];
        let messageWallOpen = false;
        let wallLastSeenTime = Number(localStorage.getItem('TFJL_WallLastSeen') || 0);
        let messageScrollInterval = null;
        let messageFetchInterval = null;
        let msgRefreshCountdown = 30;
        let msgCountdownInterval = null;
        let pendingScriptFile = null;
        const MESSAGE_REFRESH_INTERVAL = 30000;
        const MAX_MESSAGES = 5000;
        // ============ 需求墙消息防丢：本地 IndexedDB 兜底 + 云端备份 Gist ============
        const WALL_DB_NAME = 'TFJLWallDB';
        const WALL_STORE = 'wallMessages';
        function openWallDB() {
            return new Promise((resolve) => {
                try {
                    const req = indexedDB.open(WALL_DB_NAME, 1);
                    req.onupgradeneeded = () => { try { req.result.createObjectStore(WALL_STORE); } catch (e) {} };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            });
        }
        async function loadWallFromDB() {
            const db = await openWallDB();
            if (!db) return null;
            return await new Promise((resolve) => {
                try {
                    const tx = db.transaction(WALL_STORE, 'readonly');
                    const r = tx.objectStore(WALL_STORE).get('messages');
                    r.onsuccess = () => resolve(r.result || null);
                    r.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            });
        }
        async function saveWallToDB(arr) {
            const db = await openWallDB();
            if (!db) return;
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction(WALL_STORE, 'readwrite');
                    tx.objectStore(WALL_STORE).put(arr, 'messages');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                } catch (e) { resolve(); }
            });
        }
        // 云端备份 Gist（与主 Gist 独立，主 Gist 被删时重建先从此恢复）。初始为空，运行时首个已登录用户保存即创建并记录到 localStorage
        const MESSAGES_BACKUP_GIST_ID = '36a871e70faf95cd86641a7080952192';
        async function backupWallMessages(arr) {
            try {
                const token = getGistToken();
                if (!token) return;
                const content = JSON.stringify({ messages: arr }, null, 2);
                const headers = { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + token };
                let backupId = localStorage.getItem('messages_backup_gist_id') || MESSAGES_BACKUP_GIST_ID;
                if (backupId) {
                    const resp = await fetch('https://api.github.com/gists/' + backupId, {
                        method: 'PATCH', headers, body: JSON.stringify({ files: { 'messages.json': { content } } })
                    });
                    if (resp.ok) { console.log('[消息备份] 已备份', arr.length, '条'); return; }
                    if (resp.status !== 404) return;
                }
                const c = await fetch('https://api.github.com/gists', {
                    method: 'POST', headers, body: JSON.stringify({ description: 'TFJL 需求墙消息备份(自动)', public: true, files: { 'messages.json': { content } } })
                });
                if (c.ok) { const d = await c.json(); localStorage.setItem('messages_backup_gist_id', d.id); console.log('[消息备份] 创建备份Gist:', d.id); }
            } catch (e) { console.warn('[消息备份] 失败(不影响主保存):', e); }
        }
        async function restoreWallFromBackup() {
            try {
                // 目录式指针：优先从索引 room_index.json 的 backup 字段取备用 Gist（真实数据源，长期保活，无需 token 即可读）
                let backupId = localStorage.getItem('messages_backup_gist_id') || MESSAGES_BACKUP_GIST_ID;
                try {
                    const idxResp = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
                    if (idxResp.ok) {
                        const idxData = await idxResp.json();
                        const ri = idxData.files && idxData.files['room_index.json'];
                        if (ri && ri.content) {
                            const idx = JSON.parse(ri.content);
                            if (idx.backup) { backupId = idx.backup; localStorage.setItem('messages_backup_gist_id', backupId); }
                        }
                    }
                } catch (e) {}
                if (!backupId) return null;
                const resp = await fetch('https://api.github.com/gists/' + backupId);
                if (!resp.ok) return null;
                const d = await resp.json();
                const f = d.files && d.files['messages.json'];
                if (!f || !f.content) return null;
                const parsed = JSON.parse(f.content);
                return parsed.messages || null;
            } catch (e) { return null; }
        }

        // 管理员一键还原：把备用 Gist（目录式 backup 字段）的消息合并写回当前需求墙指向的主 Gist
        async function adminRestoreFromBackup() {
            const token = getGistToken();
            if (!token) { alert('离线版暂不支持还原，请检查网络连接'); return; }
            if (!confirm('确认从备用 Gist 一键还原需求墙？\n\n将把备用 Gist 的消息合并到当前需求墙指向的主 Gist（不会删除主 Gist 中已有的新消息）。')) return;
            try {
                showToast('⏳ 正在从备用 Gist 还原...');
                // 1) 取备用 Gist ID（目录式优先：索引 backup 字段 → 常量）
                let backupId = localStorage.getItem('messages_backup_gist_id') || MESSAGES_BACKUP_GIST_ID;
                try {
                    const idxResp = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
                    if (idxResp.ok) {
                        const idxData = await idxResp.json();
                        const ri = idxData.files && idxData.files['room_index.json'];
                        if (ri && ri.content) { const idx = JSON.parse(ri.content); if (idx.backup) backupId = idx.backup; }
                    }
                } catch (e) {}
                if (!backupId) { showToast('❌ 未找到备用 Gist'); return; }
                // 2) 读备用内容（public 免 token）
                const bkResp = await fetch('https://api.github.com/gists/' + backupId);
                if (!bkResp.ok) { showToast('❌ 备用 Gist 读取失败(' + bkResp.status + ')'); return; }
                const bkData = await bkResp.json();
                const bkContent = bkData.files && bkData.files['messages.json'] && bkData.files['messages.json'].content;
                if (!bkContent) { showToast('❌ 备用 Gist 无消息'); return; }
                const bkMsgs = (JSON.parse(bkContent).messages) || [];
                // 3) 解析当前主 Gist ID（索引 messages 优先 → 硬编码兜底）
                const gistDeleted = localStorage.getItem('messages_gist_deleted') === 'true';
                let mainId = (!gistDeleted && MESSAGES_GIST_ID) ? MESSAGES_GIST_ID : (localStorage.getItem('messages_gist_id') || '');
                if (!gistDeleted) {
                    try {
                        const idxResp = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
                        if (idxResp.ok) {
                            const idxData = await idxResp.json();
                            const ri = idxData.files && idxData.files['room_index.json'];
                            if (ri && ri.content) { const idx = JSON.parse(ri.content); if (idx.messages) { mainId = idx.messages; localStorage.setItem('messages_gist_id', mainId); } }
                        }
                    } catch (e) {}
                }
                if (!mainId) { showToast('❌ 未确定主 Gist'); return; }
                // 4) 合并：主现有 wallMessages + 备用，去重（保留主里的新消息）
                const merged = (wallMessages || []).slice();
                const seen = new Set(merged.map(m => m.time + '_' + m.author + '_' + (m.content || '').substring(0, 30)));
                let added = 0;
                bkMsgs.forEach(m => { const k = m.time + '_' + m.author + '_' + (m.content || '').substring(0, 30); if (!seen.has(k)) { merged.push(m); seen.add(k); added++; } });
                merged.sort((a, b) => b.time - a.time);
                const finalMsgs = merged.slice(0, MAX_MESSAGES);
                // 5) 写回主 Gist（用户 token 可写主 Gist）
                const resp = await fetch('https://api.github.com/gists/' + mainId, {
                    method: 'PATCH',
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'Authorization': 'token ' + token },
                    body: JSON.stringify({ files: { 'messages.json': { content: JSON.stringify({ messages: finalMsgs }, null, 2) } } })
                });
                if (!resp.ok) { showToast('❌ 还原写入失败(' + resp.status + ')'); return; }
                wallMessages = finalMsgs;
                localStorage.removeItem('messages_gist_deleted');
                localStorage.removeItem('messages_gist_id');
                await saveWallToDB(finalMsgs);
                await fetchMessages();
                showToast('✅ 已还原：合并 ' + added + ' 条备用消息，共 ' + finalMsgs.length + ' 条');
            } catch (e) { showToast('❌ 还原出错：' + (e.message || e)); }
        }

        // 仅管理员可见还原按钮：URL 带 ?admin=1 或 localStorage.tfjl_admin=1 时才显示
        function showAdminRestoreBtnIfAllowed() {
            try {
                const allowed = (new URLSearchParams(location.search).get('admin') === '1') || (localStorage.getItem('tfjl_admin') === '1');
                const btn = document.getElementById('msgRestoreBtn');
                if (btn) btn.style.display = allowed ? '' : 'none';
            } catch (e) {}
        }


        function updateMsgRefreshBtn() {
            const btn = document.getElementById('msgRefreshBtn');
            if (btn) btn.textContent = '⏳' + msgRefreshCountdown;
        }

        function startMsgCountdown() {
            if (msgCountdownInterval) clearInterval(msgCountdownInterval);
            msgRefreshCountdown = 30;
            updateMsgRefreshBtn();
            msgCountdownInterval = setInterval(() => {
                const wallEl = document.getElementById('messageWall');
                const isOpen = messageWallOpen || (wallEl && wallEl.style.display !== 'none');
                if (!isOpen) return;
                msgRefreshCountdown--;
                updateMsgRefreshBtn();
                if (msgRefreshCountdown <= 0) {
                    msgRefreshCountdown = 30;
                    fetchMessages();
                }
            }, 1000);
        }
        const MAX_SCRIPT_SIZE = 10 * 1024 * 1024;
        const SCRIPT_EXPIRE_DAYS = 10;
        
        // 开门即检：打开需求墙前若未设置昵称，先弹窗设置；已设置则放行。
        // 返回是否允许进入：取消设置（ensureNickname 返回 null）则不允许 → 墙不打开
        async function ensureWallNickBeforeOpen() {
            const hasSet = localStorage.getItem('TFJL_HasSetNick') === 'true';
            const existing = localStorage.getItem('TFJL_UserName');
            if (hasSet && existing) return true;
            const nick = await ensureNickname();
            return !!nick;
        }

        async function toggleMessageWall() {
            const wall = document.getElementById('messageWall');
            const toggle = document.getElementById('messageWallToggle');
            const min = document.getElementById('messageWallMin');
            const chatToggle = document.getElementById('chatRoomToggle');
            
            if (messageWallOpen) {
                wall.style.display = 'none';
                min.style.display = 'flex';
                // 需求墙最小化时，拍卖行按钮右移
                if (chatToggle) chatToggle.style.left = '160px';
                messageWallOpen = false;
                updateWallAttention();   // 关闭后重新评估未读提醒
            } else {
                const ok = await ensureWallNickBeforeOpen();
                if (!ok) return; // 强制必须设昵称：取消设置则不开墙，保持入口按钮
                wall.style.display = 'flex';
                min.style.display = 'none';
                toggle.style.display = 'none';
                // 需求墙打开时，拍卖行按钮回到原位置
                if (chatToggle) chatToggle.style.left = '68px';
                messageWallOpen = true;
                wallLastSeenTime = Date.now();
                localStorage.setItem('TFJL_WallLastSeen', String(wallLastSeenTime));
                updateWallAttention();   // 打开即清除未读提醒
                if (wallMessages.length === 0) fetchMessages();
                initMessageWallDrag();
            }
        }
        
        // 未读提醒：墙关闭状态下，若自上次打开后出现了新留言 → 图标 QQ 式闪动 + 红点(未读数)；打开墙即清除
        function updateWallAttention() {
            const toggle = document.getElementById('messageWallToggle');
            const dot = document.getElementById('wallUnreadDot');
            if (!toggle) return;
            if (messageWallOpen) {
                toggle.classList.remove('wall-attention');
                if (dot) dot.style.display = 'none';
                flashTray(false);   // 墙已开 → 停托盘闪动
                return;
            }
            const newCount = wallMessages.filter(m => m.time > wallLastSeenTime).length;
            if (newCount > 0) {
                toggle.classList.add('wall-attention');
                if (dot) { dot.style.display = 'block'; dot.textContent = newCount > 99 ? '99+' : String(newCount); }
                flashTray(true);    // 有未读新消息 → 托盘图标闪动提醒
            } else {
                toggle.classList.remove('wall-attention');
                if (dot) { dot.style.display = 'none'; dot.textContent = ''; }
                flashTray(false);   // 无未读 → 停闪动
            }
        }

        function closeMessageWall() {
            const wall = document.getElementById('messageWall');
            const toggle = document.getElementById('messageWallToggle');
            const chatToggle = document.getElementById('chatRoomToggle');
            wall.style.display = 'none';
            toggle.style.display = 'flex';
            if (chatToggle) chatToggle.style.left = '68px';
            messageWallOpen = false;
            updateWallAttention();
        }
        
        function toggleMessageWallSize() {
            const wall = document.getElementById('messageWall');
            const min = document.getElementById('messageWallToggle');
            const chatToggle = document.getElementById('chatRoomToggle');
            wall.style.display = 'none';
            min.style.display = 'flex';
            if (chatToggle) chatToggle.style.left = '160px';
            messageWallOpen = false;
        }
        
        async function expandMessageWall() {
            await ensureWallNickBeforeOpen();
            const wall = document.getElementById('messageWall');
            const min = document.getElementById('messageWallMin');
            const toggle = document.getElementById('messageWallToggle');
            const chatToggle = document.getElementById('chatRoomToggle');
            wall.style.display = 'flex';
            min.style.display = 'none';
            toggle.style.display = 'none';
            if (chatToggle) chatToggle.style.left = '68px';
            messageWallOpen = true;
            initMessageWallDrag();
        }
        
        function initMessageWallDrag() {
        }
        
        async function fetchMessages() {
            try {
                const token = getGistToken();
                
                // ★ 权威指针：消息Gist ID 优先取索引 room_index.messages（免部署即可迁移Gist），其次硬编码常量
                // ★ 防丢A：本地 IndexedDB 兜底——内存为空时先显示本地缓存，后台再拉远程
                if (wallMessages.length === 0) {
                    try {
                        const dbCache = await loadWallFromDB();
                        if (dbCache && dbCache.length) { wallMessages = dbCache; renderMessages(); updateWallAttention(); console.log('[消息] 本地缓存兜底显示', dbCache.length, '条'); }
                    } catch (e) {}
                }

                const gistDeleted = localStorage.getItem('messages_gist_deleted') === 'true';
                let messagesGistId = (!gistDeleted && MESSAGES_GIST_ID) ? MESSAGES_GIST_ID : (localStorage.getItem('messages_gist_id') || '');
                // 若未确认删除，从索引拿最新 ID（防止硬编码的旧 Gist 被删后卡死、消息全空）
                if (!gistDeleted) {
                    try {
                        const idxResp = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Accept': 'application/vnd.github.v3+json', ...(token && { 'Authorization': `token ${token}` }) } });
                        if (idxResp.ok) {
                            const idxData = await idxResp.json();
                            const ri = idxData.files && idxData.files['room_index.json'];
                            if (ri && ri.content) {
                                const idx = JSON.parse(ri.content);
                                if (idx.messages) { messagesGistId = idx.messages; localStorage.setItem('messages_gist_id', messagesGistId); }
                            }
                        }
                    } catch (e) { console.warn('[消息] 索引解析失败，用硬编码兜底:', e); }
                }
                
                // 如果都没有，从索引文件获取
                if (!messagesGistId) {
                    try {
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
                                    if (indexData['messages']) {
                                        messagesGistId = indexData['messages'];
                                        localStorage.setItem('messages_gist_id', messagesGistId);
                                    }
                                } catch (e) { console.warn('解析索引文件失败:', e); }
                            }
                        }
                    } catch (e) { console.warn('获取索引文件失败:', e); }
                }
                
                if (messagesGistId) {
                    // 从独立 Gist 加载
                    const response = await fetch(`https://api.github.com/gists/${messagesGistId}`, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            ...(token && { 'Authorization': `token ${token}` })
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.files && data.files['messages.json']) {
                            const fileData = data.files['messages.json'];
                            let content = fileData.content;
                            
                            // ★ 处理 truncated：如果内容被截断，使用 raw_url 获取完整内容
                            // 这是消息丢失的常见原因！GitHub API 会截断大文件
                            if (fileData.truncated || !content) {
                                try {
                                    const rawResponse = await fetch(fileData.raw_url, {
                                        headers: {
                                            ...(token && { 'Authorization': `token ${token}` })
                                        }
                                    });
                                    if (rawResponse.ok) {
                                        content = await rawResponse.text();
                                    } else {
                                        console.warn('raw_url 获取失败，状态码:', rawResponse.status);
                                    }
                                } catch (e) { console.warn('raw_url 获取失败:', e); }
                            }
                            
                            if (content) {
                                try {
                                    const parsed = JSON.parse(content);
                                    const fetchedMessages = parsed.messages || [];
                                    
                                    // ★ 关键修复：不要清空已有本地消息，而是合并
                                    // 防止用户刚发的消息因为网络延迟被覆盖
                                    if (wallMessages.length > 0) {
                                        // 使用和 saveMessagesToGist 相同的唯一ID逻辑合并
                                        function getMsgId(m) {
                                            const cs = (m.content || '').substring(0, 30);
                                            return m.time + '_' + m.author + '_' + cs;
                                        }
                                        const fetchedIds = new Set(fetchedMessages.map(getMsgId));
                                        const merged = [...fetchedMessages];
                                        wallMessages.forEach(m => {
                                            if (!fetchedIds.has(getMsgId(m))) merged.push(m);
                                        });
                                        merged.sort((a, b) => b.time - a.time);
                                        wallMessages = merged;
                                    } else {
                                        wallMessages = fetchedMessages;
                                    }
                                    
                                    await saveWallToDB(wallMessages);
                                    renderMessages();
                                    updateWallAttention();
                                    console.log('[消息加载] 成功加载', wallMessages.length, '条消息');
                                    return;
                                } catch (e) { console.warn('解析消息 JSON 失败:', e); }
                            }
                        }
                    } else if (response.status === 404) {
                        // Gist已被删除，标记为失效，允许后续重建
                        console.warn('[消息加载] 消息Gist已删除(404)，标记为失效');
                        localStorage.setItem('messages_gist_deleted', 'true');
                        localStorage.removeItem('messages_gist_id');
                    } else if (response.status === 403) {
                        // 403可能是限流或权限问题，不标记删除
                        console.warn('[消息加载] 消息Gist访问被拒(403)');
                    }
                }
                
                // 如果加载失败，不要清空已有消息，保持原来的消息
                if (wallMessages.length === 0) {
                    wallMessages = [];
                    renderMessages();
                }
            } catch (error) {
                console.warn('获取消息失败:', error);
                const scroller = document.getElementById('messageScroller');
                if (scroller) {
                    scroller.innerHTML = '<div style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;padding:20px;">暂无消息，快来发布第一条吧！</div>';
                }
            }
        }
        
        async function renderMessages() {
            const scroller = document.getElementById('messageScroller');
            if (!scroller) return;
            
            const now = Date.now();
            const nicknameInput = document.getElementById('messageNickname');
            const currentNickname = nicknameInput?.value.trim() || localStorage.getItem('TFJL_UserName') || '';
            const adminNicknames = ['gyq', 'GYQ', '龙行'];
            const isAdmin = adminNicknames.some(nick => currentNickname.toLowerCase() === nick.toLowerCase());
            
            // 过滤消息：默认永久保存，只有设置了expireMinutes的消息才过期
            const validMessages = wallMessages.filter(msg => {
                if (msg.expireMinutes && msg.expireMinutes > 0) {
                    const expireTime = msg.expireMinutes * 60 * 1000;
                    return (now - msg.time) < expireTime;
                }
                return true; // 没有设置过期时间的消息永久保存
            });

            if (validMessages.length === 0) {
                scroller.innerHTML = '<div style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center;padding:20px;">暂无消息，快来发布第一条吧！</div>';
                return;
            }
            
            const html = validMessages.map((msg, index) => {
                const timeAgo = formatMessageTime(msg.time);
                let contentHtml = escapeHtml(msg.content);
                
                // 判断是否可以删除（发布者可删自己的，管理员可删所有）
                const isOwner = msg.author.toLowerCase() === currentNickname.toLowerCase();
                const canDelete = isOwner || isAdmin;
                
                // 过期标签
                const expireLabel = msg.expireMinutes ? `<span style="color:#ff9800;font-size:0.7rem;margin-left:5px;" title="${formatDuration(msg.expireMinutes)}后过期">⏱️${formatDuration(msg.expireMinutes)}</span>` : '';
                // 加密标签
                const encryptedLabel = msg.isEncrypted ? `<span style="color:#ce93d8;font-size:0.7rem;margin-left:5px;" title="密码保护">🔒</span>` : '';
                
                if (msg.scriptUrl) {
                    // 检查文件名是否是JSON备份文件
                    const urlFileName = msg.scriptUrl.split('/').pop() || '';
                    const isJsonFile = urlFileName.toLowerCase().endsWith('.json');
                    const isBackup = msg.shareType === 'backup' || msg.scriptUrl.includes('backup') || contentHtml.includes('备份') || contentHtml.includes('项目') || isJsonFile;
                    const encInfo2 = msg.isEncrypted ? `,true,'${(msg.passwordHash || '').replace(/'/g,"\\'")}'` : `,false,''`;
                    
                    if (msg.shareType === 'project') {
                        // 阵容项目分享：整项目 JSON，只支持「智能导入」+「下载」，不支持预览/导入到老马
                        contentHtml = contentHtml.replace(
                            msg.scriptUrl,
                            `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                                <a href="javascript:void(0)" onclick="importScriptToTxtFiles('${msg.scriptUrl}'${encInfo2})" style="color:#4caf50;text-decoration:underline;cursor:pointer;background:rgba(76,175,80,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📄 智能导入</a>
                                <a href="javascript:void(0)" onclick="downloadScript('${msg.scriptUrl}'${encInfo2})" style="color:#4fc3f7;text-decoration:underline;cursor:pointer;background:rgba(79,195,247,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📥 下载</a>
                            </div>`
                        );
                    } else if (isBackup) {
                        contentHtml = contentHtml.replace(
                            msg.scriptUrl,
                            `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                                <a href="javascript:void(0)" onclick="previewScriptFile('${msg.scriptUrl}'${encInfo2})" style="color:#e0e0e0;text-decoration:underline;cursor:pointer;background:rgba(224,224,224,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">👁️ 预览</a>
                                <a href="javascript:void(0)" onclick="downloadScript('${msg.scriptUrl}'${encInfo2})" style="color:#4fc3f7;text-decoration:underline;cursor:pointer;background:rgba(79,195,247,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📥 下载</a>
                                <a href="javascript:void(0)" onclick="importBackupFromWall('${msg.scriptUrl}'${encInfo2})" style="color:#ff9800;text-decoration:underline;cursor:pointer;background:rgba(255,152,0,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📦 导入备份</a>
                            </div>`
                        );
                    } else {
                        const urlFileName2 = msg.scriptUrl.split('/').pop() || 'script.txt';
                        const encInfo = msg.isEncrypted ? `,true,'${(msg.passwordHash || '').replace(/'/g,"\\'")}'` : `,false,''`;
                        contentHtml = contentHtml.replace(
                            msg.scriptUrl,
                            `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                                <a href="javascript:void(0)" onclick="previewScriptFile('${msg.scriptUrl}'${encInfo})" style="color:#e0e0e0;text-decoration:underline;cursor:pointer;background:rgba(224,224,224,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">👁️ 预览</a>
                                <a href="javascript:void(0)" onclick="downloadScript('${msg.scriptUrl}'${encInfo})" style="color:#4fc3f7;text-decoration:underline;cursor:pointer;background:rgba(79,195,247,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📥 下载</a>
                                <a href="javascript:void(0)" onclick="importScriptToTxtFiles('${msg.scriptUrl}'${encInfo})" style="color:#4caf50;text-decoration:underline;cursor:pointer;background:rgba(76,175,80,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;">📄 智能导入</a>
                                <a href="javascript:void(0)" onclick="importToLaoMaFromWall('${msg.scriptUrl}','${urlFileName2.replace(/'/g,"\\'")}'${encInfo})" style="color:#ff9800;text-decoration:underline;cursor:pointer;background:rgba(255,152,0,0.1);padding:4px 10px;border-radius:5px;font-size:0.8rem;" id="laoLaoImportBtn_${index}">📁 导入到老马</a>
                            </div>`
                        );
                    }
                }
                
                const deleteBtn = canDelete ? `<a href="javascript:void(0)" onclick="deleteMessage(${index})" style="color:#ff6b6b;cursor:pointer;margin-left:10px;font-size:0.7rem;" title="${isOwner ? '删除我的消息' : '管理员删除'}">🗑️</a>` : '';
                
                return `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 12px;font-size:0.85rem;">
                    <div style="color:#fff;margin-bottom:6px;line-height:1.5;">${contentHtml}</div>
                    <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;">${escapeHtml(msg.author)} · ${timeAgo}${expireLabel}${encryptedLabel}${deleteBtn}</div>
                </div>`;
            }).join('');
            
            scroller.innerHTML = html;
            startMessageScroll();
        }

        // 预览需求墙分享的脚本文件
        // isEncrypted: 是否加密, passwordHash: v2 PBKDF2 哈希(或旧 SHA-256/fnv) 用于验证密码
        async function previewScriptFile(url, isEncrypted = false, passwordHash = '') {
            // 加密文件先提示输入密码
            let decryptPassword = '';
            if (isEncrypted) {
                decryptPassword = prompt('该文件已加密，请输入密码或恢复密钥：');
                if (!decryptPassword) return;
            }

            try {
                // 从URL提取文件名
                let fileName = 'preview.txt';
                try {
                    const urlObj = new URL(url);
                    const pathParts = urlObj.pathname.split('/');
                    const lastPart = pathParts[pathParts.length - 1];
                    if (lastPart && lastPart !== 'raw' && lastPart.length > 0) {
                        fileName = decodeURIComponent(lastPart);
                    }
                } catch (e) {
                    const lastPart = url.split('/').pop();
                    if (lastPart && lastPart !== 'raw' && lastPart.length > 0) {
                        fileName = decodeURIComponent(lastPart);
                    }
                }

                // 获取文件内容
                let content = null;
                // 先尝试直接fetch（公开Gist的raw_url可直接访问）
                try {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        content = await resp.text();
                    }
                } catch (e) {
                    // CORS或网络错误，尝试API方式
                }
                // 如果直接fetch失败，尝试通过Gist API获取（支持私有Gist）
                if (content === null) {
                    const token = getGistToken();
                    const gistMatch = url.match(/gist\.githubusercontent\.com\/[^/]+\/([a-f0-9]+)/i) || url.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
                    if (gistMatch && token) {
                        try {
                            const apiResp = await fetch(`https://api.github.com/gists/${gistMatch[1]}`, {
                                headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` }
                            });
                            if (apiResp.ok) {
                                const gistData = await apiResp.json();
                                // 找到匹配的文件
                                for (const f of Object.values(gistData.files)) {
                                    if (f.filename === fileName || url.includes(f.filename)) {
                                        content = f.content;
                                        break;
                                    }
                                }
                                // 如果没匹配到文件名，取第一个文件
                                if (content === null && gistData.files) {
                                    const firstFile = Object.values(gistData.files)[0];
                                    if (firstFile) content = firstFile.content;
                                }
                            }
                        } catch (e) {
                            console.warn('API方式获取Gist失败:', e);
                        }
                    }
                }
                if (content === null) {
                    throw new Error('获取文件失败，可能需要登录或文件不存在');
                }

                // 判断是否是JSON
                const isJson = fileName.toLowerCase().endsWith('.json');
                let displayContent = content;
                let lang = 'text';
                if (isJson) {
                    try {
                        displayContent = JSON.stringify(JSON.parse(content), null, 2);
                        lang = 'json';
                    } catch (e) {}
                }

                // 解密（如果文件被加密）
                if (isEncrypted && decryptPassword) {
                    const decrypted = await decryptContent(content, decryptPassword);
                    if (decrypted === null) {
                        alert('❌ 解密失败，可能是密码不正确或文件已损坏');
                        return;
                    }
                    content = decrypted;
                    displayContent = decrypted;
                    if (isJson) {
                        try {
                            displayContent = JSON.stringify(JSON.parse(decrypted), null, 2);
                        } catch (e) {}
                    }
                }

                // 复用统一脚本浮窗（可编辑，减伤栏与本地脚本完全一致；远程内容无本地 fileIndex，故不可保存/对比）
                openScriptNotebook({ name: fileName, content: displayContent, fileIndex: -1 });
            } catch (err) {
                console.error('预览文件失败:', err);
                alert('预览失败: ' + err.message);
            }
        }
        async function deleteMessage(index) {
            if (!confirm('确定要删除这条消息吗？')) return;

            const nicknameInput = document.getElementById('messageNickname');
            const currentNickname = nicknameInput?.value.trim() || localStorage.getItem('TFJL_UserName') || '';
            const adminNicknames = ['gyq', 'GYQ', '龙行'];
            const isAdmin = adminNicknames.some(nick => currentNickname.toLowerCase() === nick.toLowerCase());
            const msg = wallMessages[index];

            if (!msg) return;

            const isOwner = msg.author.toLowerCase() === currentNickname.toLowerCase();
            if (!isOwner && !isAdmin) {
                alert('你没有权限删除这条消息');
                return;
            }

            // 【关键安全】删除是强制保存（forceSave=true），会直接用本地数据覆盖远程
            // 所以删除前必须先从Gist加载完整消息，否则可能因本地消息不完整导致其他消息丢失
            if (wallMessages.length < 5) {
                try { await fetchMessages(); } catch (e) { console.warn('预加载消息失败:', e); }
            }

            // 删除关联的脚本Gist文件
            if (msg.scriptUrl) {
                try {
                    const token = getGistToken();
                    if (token) {
                        let gistId = null;
                        if (msg.scriptUrl.includes('gist.githubusercontent.com')) {
                            const match = msg.scriptUrl.match(/gist\.githubusercontent\.com\/[^\/]+\/([a-zA-Z0-9]+)/i);
                            if (match) gistId = match[1];
                        } else if (msg.scriptUrl.includes('gist.github.com') && !msg.scriptUrl.includes('api.github.com')) {
                            const match = msg.scriptUrl.match(/gist\.github\.com\/[^\/]+\/([a-zA-Z0-9]+)/i);
                            if (match) gistId = match[1];
                        } else if (msg.scriptUrl.includes('/gists/')) {
                            const match = msg.scriptUrl.match(/\/gists\/([a-zA-Z0-9]+)/i);
                            if (match) gistId = match[1];
                        }
                        if (gistId) {
                            const delResp = await fetch(`https://api.github.com/gists/${gistId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `token ${token}` }
                            });
                            if (!delResp.ok) {
                                console.warn(`删除脚本Gist失败 (${delResp.status}): ${gistId}`);
                            }
                        } else {
                            console.warn(`无法从URL提取Gist ID: ${msg.scriptUrl}`);
                        }
                    }
                } catch (e) {
                    console.warn('删除关联脚本失败:', e);
                }
            }

            wallMessages.splice(index, 1);
            renderMessages();

            try {
                await saveMessagesToGist(true); // 强制保存，跳过合并逻辑
            } catch (error) {
                console.error('删除消息失败:', error);
                alert('删除失败，请稍后重试');
            }
        }
        
        function formatMessageTime(timestamp) {
            const now = Date.now();
            const diff = now - timestamp;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            
            if (minutes < 1) return '刚刚';
            if (minutes < 60) return `${minutes}分钟前`;
            if (hours < 24) return `${hours}小时前`;
            return `${days}天前`;
        }
        
        function escapeHtml(text) {
            if (!text) return '';
            const s = String(text);
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        }
        
        function startMessageScroll() {
            if (messageScrollInterval) clearInterval(messageScrollInterval);
            
            const content = document.getElementById('messageWallContent');
            const scroller = document.getElementById('messageScroller');
            if (!content || !scroller) return;
            
            if (scroller.scrollHeight <= content.clientHeight) return;
            
            messageScrollInterval = setInterval(() => {
                content.scrollTop += 0.5;
                if (content.scrollTop >= scroller.scrollHeight - content.clientHeight) {
                    content.scrollTop = 0;
                }
            }, 50);
        }
        
        function pauseMessageScroll() {
            if (messageScrollInterval) {
                clearInterval(messageScrollInterval);
                messageScrollInterval = null;
            }
        }
        
        function resumeMessageScroll() {
            startMessageScroll();
        }
        
        async function downloadScript(url, isEncrypted = false, passwordHash = '') {
            // 加密文件先提示输入密码
            let decryptPassword = '';
            if (isEncrypted) {
                decryptPassword = prompt('该文件已加密，请输入密码或恢复密钥：');
                if (!decryptPassword) return;
            }

            let fileName = 'download.txt';
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/');
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart && lastPart !== 'raw' && lastPart.length > 0) {
                    fileName = decodeURIComponent(lastPart);
                }
            } catch (e) {
                const lastPart = url.split('/').pop();
                if (lastPart && lastPart !== 'raw' && lastPart.length > 0) {
                    fileName = decodeURIComponent(lastPart);
                }
            }

            try {
                // 加载提示
                showToast('📥 正在下载 ' + fileName);

                // 记录下载
                await recordDownload(fileName);

                // 获取文件内容
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`获取文件失败: ${response.status}`);
                }
                let content = await response.text();

                // 解密（如果加密）
                if (isEncrypted && decryptPassword) {
                    const decrypted = await decryptContent(content, decryptPassword);
                    if (decrypted === null) {
                        alert('❌ 解密失败，可能密码不正确');
                        return;
                    }
                    content = decrypted;
                }

                const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
                if (isTauri) {
                    await _downloadScriptTauri(fileName, content);
                    return;
                }

                // —— 网页版：原有流程 ——
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

                if (window.showSaveFilePicker) {
                    try {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: fileName,
                            types: [{
                                description: '文本文件',
                                accept: { 'text/plain': ['.txt', '.json', '.js', '.lua', '.py', '.sh'] }
                            }]
                        });
                        const writable = await handle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        showToast('✅ 已保存: ' + fileName);
                        return;
                    } catch (e) {
                        if (e.name === 'AbortError') { showToast('已取消下载'); return; }
                    }
                }

                // 传统浏览器下载
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
                showToast('✅ 已下载: ' + fileName);
            } catch (error) {
                console.warn('下载失败，尝试直接打开:', error);
                showToast('⚠️ 下载失败，在新窗口打开');
                window.open(url, '_blank');
            }
        }

        // Tauri APP 原生下载：精美弹窗 → 老马目录（一键）或 自定义文件夹（浏览）
        async function _downloadScriptTauri(fileName, content) {
            const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
            if (!invokeFn) { _downloadScriptBlob(fileName, content); return; }

            const fileSizeKB = (content.length / 1024).toFixed(1);
            const dirLabels = {
                coop:       { label: '合作脚本', icon: '🤝' },
                activity:   { label: '活动',     icon: '🎉' },
                battle:     { label: '对战JSON', icon: '⚔️' },
                battleMax:  { label: '对战MAX',  icon: '📊' },
                screenshot: { label: '截图',     icon: '📸' },
                logs:       { label: '日志',     icon: '📋' },
                temp:       { label: '临时脚本', icon: '📝' }
            };

            return new Promise((resolve) => {
                // —— 构建老马目录卡片 ——
                let dirCardsHtml = '';
                let hasAnyDir = false;
                const dirSavePaths = {};
                for (const [key, info] of Object.entries(dirLabels)) {
                    const dirPath = (window.maDirs && window.maDirs[key]) || '';
                    if (!dirPath) continue;
                    hasAnyDir = true;
                    const savePath = dirPath.replace(/[\\/]+$/, '') + '\\' + fileName;
                    const cardId = 'saveCard_' + key;
                    dirSavePaths[cardId] = savePath;
                    dirCardsHtml += `
                <div id="${cardId}" class="save-dir-card"
                     style="cursor:pointer;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px 16px;text-align:left;display:flex;align-items:center;gap:10px;transition:all 0.2s;">
                    <span style="font-size:1.3rem;">${info.icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="color:#fff;font-size:0.85rem;">${info.label}</div>
                        <div style="color:rgba(255,255,255,0.35);font-size:0.68rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(savePath)}</div>
                    </div>
                </div>`;
                }

                const maSection = hasAnyDir ? `
                <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-bottom:8px;">📁 保存到老马目录（点击即保存）：</div>
                <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">${dirCardsHtml}</div>` : `
                <div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;margin-bottom:12px;padding:12px;background:rgba(255,152,0,0.08);border-radius:8px;">⚠️ 未配置老马目录，请先在APP本地设置中配置</div>`;

                const modal = document.createElement('div');
                modal.id = 'downloadSaveModal';
                modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;';
                modal.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,152,0,0.5);border-radius:16px;padding:24px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-height:85vh;overflow-y:auto;">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;">
                    <div>
                        <span style="color:#ff9800;font-size:1.1rem;font-weight:bold;">📥 保存脚本</span>
                        <div style="color:#fff;font-size:0.9rem;margin-top:4px;word-break:break-all;">${escapeHtml(fileName)}</div>
                        <div style="color:rgba(255,255,255,0.35);font-size:0.7rem;">${fileSizeKB} KB</div>
                    </div>
                    <span id="_dlClose" style="cursor:pointer;color:rgba(255,255,255,0.4);font-size:1.5rem;line-height:1;transition:color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.4)'">×</span>
                </div>
${maSection}
                <div style="display:flex;align-items:center;gap:10px;margin:14px 0;color:rgba(255,255,255,0.3);font-size:0.75rem;">
                    <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
                    或者保存到自定义文件夹
                    <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
                </div>

                <div id="_customSaveArea" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.2rem;">📂</span>
                        <button id="_pickCustomFolderBtn" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;">浏览文件夹...</button>
                        <span id="_selectedFolderText" style="color:rgba(255,255,255,0.35);font-size:0.75rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">未选择</span>
                    </div>
                    <div id="_customPreview" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
                        <div style="color:#4caf50;font-size:0.75rem;margin-bottom:8px;word-break:break-all;" id="_customFullPath"></div>
                        <button id="_saveToCustomBtn" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:9px 20px;border-radius:8px;cursor:pointer;font-size:0.85rem;width:100%;">✅ 保存到此处</button>
                    </div>
                </div>

                <button id="_cancelDownloadBtn" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:10px;cursor:pointer;font-size:0.85rem;width:100%;margin-top:12px;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)';this.style.color='#fff'" onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.6)'">取消</button>
            </div>`;

                document.body.appendChild(modal);

                // 点击遮罩关闭
                modal.onclick = function(e) { if (e.target === modal) { modal.remove(); resolve(false); } };

                let selectedCustomFolder = '';

                // Close / Cancel
                document.getElementById('_dlClose').onclick = () => { modal.remove(); resolve(false); };
                document.getElementById('_cancelDownloadBtn').onclick = () => { modal.remove(); resolve(false); };

                // Save helpers
                async function doSave(savePath) {
                    modal.remove();
                    try {
                        await invokeFn('write_text_file', { filePath: savePath, content: content });
                        showToast('✅ 已保存: ' + fileName);
                        resolve(true);
                    } catch (e) {
                        console.warn('Tauri保存失败，降级到浏览器下载:', e);
                        _downloadScriptBlob(fileName, content);
                        resolve(true);
                    }
                }

                // 老马目录卡片：hover + click
                for (const [cardId, savePath] of Object.entries(dirSavePaths)) {
                    const card = document.getElementById(cardId);
                    if (!card) continue;
                    card.addEventListener('mouseover', () => { card.style.background = 'rgba(255,152,0,0.15)'; card.style.borderColor = 'rgba(255,152,0,0.5)'; });
                    card.addEventListener('mouseout',  () => { card.style.background = 'rgba(255,255,255,0.06)'; card.style.borderColor = 'rgba(255,255,255,0.15)'; });
                    card.addEventListener('click', () => doSave(savePath));
                }

                // 自定义文件夹 — 浏览
                document.getElementById('_pickCustomFolderBtn').onclick = async () => {
                    try {
                        const folder = await invokeFn('open_directory_dialog');
                        if (!folder) return;
                        selectedCustomFolder = folder;
                        document.getElementById('_selectedFolderText').textContent = folder;
                        document.getElementById('_selectedFolderText').style.color = 'rgba(255,255,255,0.8)';
                        const fullPath = folder.replace(/[\\/]+$/, '') + '\\' + fileName;
                        document.getElementById('_customFullPath').textContent = fullPath;
                        document.getElementById('_customPreview').style.display = 'block';
                    } catch (e) {
                        console.warn('目录选择失败:', e);
                    }
                };

                // 自定义文件夹 — 确认保存
                document.getElementById('_saveToCustomBtn').onclick = () => {
                    if (!selectedCustomFolder) return;
                    const savePath = selectedCustomFolder.replace(/[\\/]+$/, '') + '\\' + fileName;
                    doSave(savePath);
                };
            });
        }

        // 浏览器传统 Blob 下载（含 Toast 反馈）
        function _downloadScriptBlob(fileName, content) {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            showToast('✅ 已下载: ' + fileName);
        }

        // 显示TXT导入选项对话框
        function showTxtImportDialog(fileName, content) {
            return new Promise((resolve) => {
                // 预览内容（前200字符）
                const preview = content.substring(0, 200);
                const fileSize = (content.length / 1024).toFixed(1);
                
                // 从文件名提取项目名（去掉扩展名）
                const defaultProjectName = fileName.replace(/\.[^/.]+$/, '');
                
                const modal = document.createElement('div');
                modal.id = 'txtImportDialog';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10002;
                `;
                
                // 分类选项
                let categoryOptions = categories.map(cat => 
                    `<option value="${cat}">${cat}</option>`
                ).join('');
                
                modal.innerHTML = `
                    <div style="background:linear-gradient(135deg,rgba(40,40,70,0.98),rgba(30,30,60,0.98));border:2px solid rgba(255,215,0,0.3);border-radius:15px;padding:25px;min-width:400px;max-width:500px;">
                        <h3 style="margin:0 0 15px 0;color:#ffd700;text-align:center;">📄 导入脚本文件</h3>
                        
                        <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;margin-bottom:15px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                                <span style="color:#ffd700;font-weight:bold;">${escapeHtml(fileName)}</span>
                                <span style="color:rgba(255,255,255,0.5);font-size:0.85rem;">${fileSize} KB</span>
                            </div>
                            <div style="color:rgba(255,255,255,0.6);font-size:0.8rem;max-height:60px;overflow:hidden;font-family:monospace;white-space:pre-wrap;word-break:break-all;">
                                ${escapeHtml(preview)}${content.length > 200 ? '...' : ''}
                            </div>
                        </div>
                        
                        <div style="margin-bottom:20px;">
                            <p style="color:rgba(255,255,255,0.8);margin-bottom:12px;font-size:0.9rem;">选择导入方式：</p>
                            
                            <label style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.3);border-radius:8px;margin-bottom:10px;cursor:pointer;">
                                <input type="radio" name="importTarget" value="current" checked style="accent-color:#ffd700;">
                                <div>
                                    <div style="color:#4caf50;font-size:0.9rem;">📥 导入到当前项目</div>
                                    <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;">添加到"${escapeHtml(currentProjectName || '未选择')}"的脚本文件列表</div>
                                </div>
                            </label>
                            
                            <label style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(33,150,243,0.1);border:1px solid rgba(33,150,243,0.3);border-radius:8px;margin-bottom:10px;cursor:pointer;">
                                <input type="radio" name="importTarget" value="new" style="accent-color:#ffd700;">
                                <div style="flex:1;">
                                    <div style="color:#2196f3;font-size:0.9rem;">🆕 创建新项目</div>
                                    <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-top:4px;">
                                        项目名称：<input type="text" id="newProjectName" value="${escapeHtml(defaultProjectName)}" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:4px;padding:4px 8px;color:#fff;font-size:0.8rem;width:150px;" onclick="event.stopPropagation();">
                                    </div>
                                    <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-top:4px;">
                                        所属分类：<select id="newProjectCategory" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:4px;padding:4px 8px;color:#fff;font-size:0.8rem;width:160px;" onclick="event.stopPropagation();">
                                            ${categoryOptions}
                                            <option value="新分类">+ 新建分类</option>
                                        </select>
                                    </div>
                                </div>
                            </label>
                        </div>
                        
                        <div style="display:flex;gap:10px;justify-content:center;">
                            <button id="confirmTxtImportBtn" style="background:linear-gradient(135deg,#4CAF50,#45a049);color:white;border:none;padding:12px 30px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.9rem;">✅ 确认导入</button>
                            <button id="cancelTxtImportBtn" style="background:linear-gradient(135deg,#757575,#616161);color:white;border:none;padding:12px 30px;border-radius:8px;cursor:pointer;font-size:0.9rem;">取消</button>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // 监听新建分类选择
                document.getElementById('newProjectCategory').onchange = function() {
                    if (this.value === '新分类') {
                        const newCat = prompt('请输入新分类名称：');
                        if (newCat && newCat.trim()) {
                            const trimmed = newCat.trim();
                            if (!categories.includes(trimmed)) {
                                categories.push(trimmed);
                                saveCategories();
                            }
                            // 更新下拉框
                            const select = document.getElementById('newProjectCategory');
                            select.innerHTML = categories.map(cat => 
                                `<option value="${cat}" ${cat === trimmed ? 'selected' : ''}>${cat}</option>`
                            ).join('') + '<option value="新分类">+ 新建分类</option>';
                        } else {
                            this.value = categories[0] || '默认分类';
                        }
                    }
                };
                
                document.getElementById('confirmTxtImportBtn').onclick = function() {
                    const target = document.querySelector('input[name="importTarget"]:checked').value;
                    
                    if (target === 'current') {
                        modal.remove();
                        resolve({ action: 'current' });
                    } else {
                        const projectName = document.getElementById('newProjectName').value.trim();
                        const category = document.getElementById('newProjectCategory').value;
                        
                        if (!projectName) {
                            alert('请输入项目名称');
                            return;
                        }
                        
                        modal.remove();
                        resolve({ 
                            action: 'new',
                            projectName,
                            category: category === '新分类' ? '默认分类' : category
                        });
                    }
                };
                
                document.getElementById('cancelTxtImportBtn').onclick = function() {
                    modal.remove();
                    resolve({ action: 'cancel' });
                };
                
                modal.onclick = function(e) {
                    if (e.target === modal) {
                        modal.remove();
                        resolve({ action: 'cancel' });
                    }
                };
            });
        }

        // 显示备份导入选项对话框
        function showBackupImportDialog(importData, fileName) {
            return new Promise((resolve) => {
                const catCount = importData.categories ? importData.categories.length : 0;
                const projectCount = importData.projects.length;
                const existingNames = importData.existingNames || [];
                const hasExisting = existingNames.length > 0;
                
                const modal = document.createElement('div');
                modal.id = 'backupImportDialog';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10002;
                `;
                
                let existingWarning = '';
                if (hasExisting) {
                    existingWarning = `
                        <div style="background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);border-radius:8px;padding:12px;margin-bottom:15px;">
                            <p style="color:#ff9800;margin:0 0 8px 0;font-size:0.85rem;">
                                ⚠️ 发现 ${existingNames.length} 个同名项目：${existingNames.slice(0, 3).join('、')}${existingNames.length > 3 ? '...' : ''}
                            </p>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <label style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:0.8rem;">
                                    <input type="radio" name="importAction" value="rename" checked style="accent-color:#ffd700;">
                                    <span style="color:#fff;">📝 改名</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:0.8rem;">
                                    <input type="radio" name="importAction" value="overwrite" style="accent-color:#ffd700;">
                                    <span style="color:#fff;">🔄 覆盖</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;font-size:0.8rem;">
                                    <input type="radio" name="importAction" value="skip" style="accent-color:#ffd700;">
                                    <span style="color:#fff;">⏭️ 跳过</span>
                                </label>
                            </div>
                        </div>
                    `;
                }
                
                modal.innerHTML = `
                    <div style="background:linear-gradient(135deg,rgba(40,40,70,0.98),rgba(30,30,60,0.98));border:2px solid rgba(255,215,0,0.3);border-radius:15px;padding:25px;min-width:380px;max-width:450px;">
                        <h3 style="margin:0 0 15px 0;color:#ffd700;text-align:center;">📥 恢复项目备份</h3>
                        <p style="color:rgba(255,255,255,0.8);margin-bottom:10px;text-align:center;font-size:0.9rem;">
                            文件: <strong style="color:#ffd700;">${escapeHtml(fileName)}</strong>
                        </p>
                        <p style="color:rgba(255,255,255,0.7);margin-bottom:20px;text-align:center;font-size:0.85rem;">
                            包含 <strong style="color:#4caf50;">${projectCount}</strong> 个项目${catCount > 0 ? `，<strong style="color:#2196f3;">${catCount}</strong> 个分类` : ''}
                        </p>
                        
                        ${existingWarning}
                        
                        ${!hasExisting ? `
                        <div style="background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.3);border-radius:8px;padding:12px;margin-bottom:20px;">
                            <p style="color:#4caf50;margin:0;font-size:0.85rem;text-align:center;">
                                ✅ 无同名项目冲突
                            </p>
                        </div>
                        ` : ''}
                        
                        <div style="display:flex;gap:10px;justify-content:center;">
                            <button id="confirmImportBtn" style="background:linear-gradient(135deg,#4CAF50,#45a049);color:white;border:none;padding:12px 30px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:0.9rem;">✅ 确认恢复</button>
                            <button id="cancelImportBtn" style="background:linear-gradient(135deg,#757575,#616161);color:white;border:none;padding:12px 30px;border-radius:8px;cursor:pointer;font-size:0.9rem;">取消</button>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                document.getElementById('confirmImportBtn').onclick = function() {
                    const actionRadio = document.querySelector('input[name="importAction"]:checked');
                    const action = actionRadio ? actionRadio.value : 'overwrite';
                    modal.remove();
                    resolve({ action });
                };
                
                document.getElementById('cancelImportBtn').onclick = function() {
                    modal.remove();
                    resolve({ action: 'cancel' });
                };
                
                modal.onclick = function(e) {
                    if (e.target === modal) {
                        modal.remove();
                        resolve({ action: 'cancel' });
                    }
                };
            });
        }

        // 从需求墙导入脚本到脚本文件
        async function importScriptToTxtFiles(url, isEncrypted = false, passwordHash = '') {
            // 先核对密码，再弹任何界面：避免取消密码后"正在导入"提示卡死不消失
            let verifiedPwd = null;
            if (isEncrypted) {
                const decPwd = prompt('该文件已加密，请输入密码或恢复密钥：');
                if (!decPwd) return; // 用户取消，不显示任何提示，直接退出
                verifiedPwd = decPwd;
            }
            try {
                // 显示加载提示
                const toast = document.createElement('div');
                toast.id = 'importLoadingToast';
                toast.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(40,40,70,0.95);
                    color: #ffd700;
                    padding: 20px 30px;
                    border-radius: 10px;
                    z-index: 10001;
                    border: 2px solid rgba(255,215,0,0.3);
                `;
                toast.textContent = '⏳ 正在导入...';
                document.body.appendChild(toast);

                // 从URL获取Gist数据
                // URL可能是 raw_url 或 html_url，需要转换为API URL
                let apiUrl = url;
                let isRawUrl = url.includes('gist.githubusercontent.com');
                
                if (isRawUrl) {
                    // raw_url 格式: https://gist.githubusercontent.com/user/gist_id/raw/.../filename
                    // 提取 gist_id
                    const match = url.match(/gist\.githubusercontent\.com\/[^\/]+\/([a-zA-Z0-9]+)/i);
                    if (match && match[1]) {
                        apiUrl = `https://api.github.com/gists/${match[1]}`;
                    }
                } else if (url.includes('gist.github.com') && !url.includes('api.github.com')) {
                    // html_url 格式: https://gist.github.com/user/gist_id
                    const match = url.match(/gist\.github\.com\/[^\/]+\/([a-zA-Z0-9]+)/i);
                    if (match && match[1]) {
                        apiUrl = `https://api.github.com/gists/${match[1]}`;
                    }
                }
                
                // 获取Gist数据
                let response;
                try {
                    // 私有Gist需要认证
                    const token = getGistToken();
                    const headers = {
                        'Accept': 'application/vnd.github.v3+json'
                    };
                    if (token) {
                        headers['Authorization'] = `token ${token}`;
                    }
                    
                    response = await fetch(apiUrl, { headers });
                } catch (fetchError) {
                    console.error('Fetch错误:', fetchError);
                    throw new Error('网络请求失败，请检查网络连接');
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('响应错误:', errorText);
                    throw new Error(`获取内容失败 (${response.status})`);
                }
                
                let files;
                
                if (isRawUrl && apiUrl === url) {
                    // 如果无法转换为API URL，直接获取原始内容
                    const content = await response.text();
                    // 从URL提取文件名
                    const urlParts = url.split('/');
                    const fileName = urlParts[urlParts.length - 1] || 'imported_file.txt';
                    files = { [fileName]: { content: content } };
                } else {
                    // 使用API获取JSON数据
                    const data = await response.json();
                    files = data.files;
                }
                
                if (!files || Object.keys(files).length === 0) throw new Error('文件为空');
                
                const fileNames = Object.keys(files);
                let importedScripts = 0;
                let importedProjects = 0;
                
                for (const fileName of fileNames) {
                    let content = files[fileName].content;
                    if (!content) continue;
                    if (isEncrypted) {
                        // 密码已在进入函数前核对，直接使用已验证密码解密
                        const decrypted = await decryptContent(content, verifiedPwd);
                        if (decrypted === null) { toast.remove(); alert('❌ 解密失败，可能密码不正确或文件已损坏'); return; }
                        content = decrypted;
                    }
                    
                    // 判断文件类型
                    const isJsonFile = fileName.toLowerCase().endsWith('.json');
                    
                    if (isJsonFile) {
                        // 尝试作为备份JSON导入
                        try {
                            const importData = JSON.parse(content);
                            
                            // 支持两种备份格式
                            let projectsToImport = [];
                            let categoriesToImport = [];
                            
                            if (importData.projects && Array.isArray(importData.projects)) {
                                // 全部备份格式
                                projectsToImport = importData.projects;
                                categoriesToImport = importData.categories || [];
                            } else if (importData.project && importData.type === 'tower-defense-project') {
                                // 单个项目备份格式
                                projectsToImport = [importData.project];
                            }
                            
                            if (projectsToImport.length > 0) {
                                // 这是备份文件，显示导入选项对话框
                                toast.remove();
                                
                                // 检查同名项目
                                const existingNames = [];
                                for (const project of projectsToImport) {
                                    const existing = await new Promise((resolve) => {
                                        const tx = db.transaction(['projects'], 'readonly');
                                        const st = tx.objectStore('projects');
                                        const req = st.get(project.name);
                                        req.onsuccess = () => resolve(req.result);
                                        req.onerror = () => resolve(null);
                                    });
                                    if (existing) {
                                        existingNames.push(project.name);
                                    }
                                }
                                
                                const result = await showBackupImportDialog({ projects: projectsToImport, existingNames }, fileName);
                                
                                if (result && result.action !== 'cancel') {
                                    // 导入分类（包括项目自带的分类）
                                    if (categoriesToImport.length > 0) {
                                        categoriesToImport.forEach(cat => {
                                            if (!categories.includes(cat)) {
                                                categories.push(cat);
                                            }
                                        });
                                    }
                                    
                                    // 检查并添加项目自身的分类
                                    for (const project of projectsToImport) {
                                        if (project.category && !categories.includes(project.category)) {
                                            categories.push(project.category);
                                        }
                                    }
                                    
                                    // 保存分类
                                    saveCategories();
                                    
                                    // 处理项目导入
                                    let imported = 0;
                                    let renamed = 0;
                                    let skipped = 0;
                                    const transaction = db.transaction(['projects'], 'readwrite');
                                    const store = transaction.objectStore('projects');
                                    
                                    for (const project of projectsToImport) {
                                        // 检查是否存在同名项目
                                        const existing = await new Promise((resolve) => {
                                            const req = store.get(project.name);
                                            req.onsuccess = () => resolve(req.result);
                                            req.onerror = () => resolve(null);
                                        });
                                        
                                        if (existing) {
                                            if (result.action === 'rename') {
                                                // 自动改名
                                                let newName = project.name + '_副本';
                                                let counter = 1;
                                                while (await new Promise((resolve) => {
                                                    const req = store.get(newName);
                                                    req.onsuccess = () => resolve(!!req.result);
                                                    req.onerror = () => resolve(false);
                                                })) {
                                                    counter++;
                                                    newName = `${project.name}_副本${counter}`;
                                                }
                                                project.name = newName;
                                                renamed++;
                                            } else if (result.action === 'skip') {
                                                skipped++;
                                                continue;
                                            }
                                            // overwrite 直接覆盖
                                        }
                                        
                                        store.put(project);
                                        imported++;
                                    }
                                    
                                    transaction.oncomplete = async function() {
                                        await recordDownload();
                                        
                                        // 如果导入的项目有分类，切换到该分类
                                        if (projectsToImport[0] && projectsToImport[0].category) {
                                            currentProjectCategory = projectsToImport[0].category;
                                        }
                                        
                                        refreshProjectSelectors();
                                        updateProjectSelector();
                                        
                                        let msg = `✅ 成功恢复 ${imported} 个项目！`;
                                        if (renamed > 0) msg += `\n重命名 ${renamed} 个同名项目`;
                                        if (skipped > 0) msg += `\n跳过 ${skipped} 个同名项目`;
                                        
                                        const successToast = document.createElement('div');
                                        successToast.style.cssText = `
                                            position: fixed;
                                            top: 20px;
                                            right: 20px;
                                            background: linear-gradient(135deg, #4CAF50, #45a049);
                                            color: white;
                                            padding: 12px 24px;
                                            border-radius: 8px;
                                            z-index: 10000;
                                            white-space: pre-line;
                                        `;
                                        successToast.textContent = msg;
                                        document.body.appendChild(successToast);
                                        setTimeout(() => successToast.remove(), 4000);
                                    };
                                    
                                    transaction.onerror = function() {
                                        alert('❌ 恢复项目失败');
                                    };
                                    
                                    importedProjects += projectsToImport.length;
                                }
                                
                                // 重新显示加载提示（如果还有其他文件）
                                if (fileNames.indexOf(fileName) < fileNames.length - 1) {
                                    document.body.appendChild(toast);
                                }
                            } else {
                                // JSON但不是备份格式，作为普通脚本文件导入
                                toast.remove();
                                const result = await showTxtImportDialog(fileName, content);
                                
                                if (result && result.action === 'current') {
                                    const existsIndex = txtFiles.findIndex(f => f.name === fileName);
                                    if (existsIndex !== -1) {
                                        txtFiles[existsIndex].content = content;
                                    } else {
                                        txtFiles.push({ name: fileName, content: content });
                                    }
                                    updateTxtFilesList();
                                    autoSaveProject();
                                    await recordDownload();
                                    importedScripts++;
                                    
                                    const successToast = document.createElement('div');
                                    successToast.style.cssText = `position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#4CAF50,#45a049);color:white;padding:12px 24px;border-radius:8px;z-index:10000;`;
                                    successToast.textContent = `✅ 已导入到当前项目！`;
                                    document.body.appendChild(successToast);
                                    setTimeout(() => successToast.remove(), 3000);
                                } else if (result && result.action === 'new') {
                                    const newProject = {
                                        name: result.projectName,
                                        category: result.category,
                                        txtFiles: [{ name: fileName, content: content }],
                                        myHandCards: [], teammateHandCards: [],
                                        myPlacedCards: {}, teammatePlacedCards: {},
                                        createdAt: Date.now()
                                    };
                                    if (!categories.includes(result.category)) {
                                        categories.push(result.category);
                                        saveCategories();
                                    }
                                    const transaction = db.transaction(['projects'], 'readwrite');
                                    const store = transaction.objectStore('projects');
                                    store.put(newProject);
                                    transaction.oncomplete = async function() {
                                        await recordDownload();
                                        currentProjectCategory = result.category;
                                        currentProjectName = result.projectName;
                                        refreshProjectSelectors();
                                        loadProjectFromDB(result.projectName);
                                        const successToast = document.createElement('div');
                                        successToast.style.cssText = `position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#4CAF50,#45a049);color:white;padding:12px 24px;border-radius:8px;z-index:10000;`;
                                        successToast.textContent = `✅ 已创建新项目"${result.projectName}"！`;
                                        document.body.appendChild(successToast);
                                        setTimeout(() => successToast.remove(), 3000);
                                    };
                                    importedScripts++;
                                }
                                if (fileNames.indexOf(fileName) < fileNames.length - 1) {
                                    document.body.appendChild(toast);
                                }
                            }
                        } catch (parseError) {
                            // JSON解析失败，作为普通文本文件导入
                            toast.remove();
                            const result = await showTxtImportDialog(fileName, content);
                            
                            if (result && result.action === 'current') {
                                const existsIndex = txtFiles.findIndex(f => f.name === fileName);
                                if (existsIndex !== -1) {
                                    txtFiles[existsIndex].content = content;
                                } else {
                                    txtFiles.push({ name: fileName, content: content });
                                }
                                updateTxtFilesList();
                                autoSaveProject();
                                await recordDownload();
                                importedScripts++;
                                
                                const successToast = document.createElement('div');
                                successToast.style.cssText = `position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#4CAF50,#45a049);color:white;padding:12px 24px;border-radius:8px;z-index:10000;`;
                                successToast.textContent = `✅ 已导入到当前项目！`;
                                document.body.appendChild(successToast);
                                setTimeout(() => successToast.remove(), 3000);
                            } else if (result && result.action === 'new') {
                                const newProject = {
                                    name: result.projectName,
                                    category: result.category,
                                    txtFiles: [{ name: fileName, content: content }],
                                    myHandCards: [], teammateHandCards: [],
                                    myPlacedCards: {}, teammatePlacedCards: {},
                                    createdAt: Date.now()
                                };
                                if (!categories.includes(result.category)) {
                                    categories.push(result.category);
                                    saveCategories();
                                }
                                const transaction = db.transaction(['projects'], 'readwrite');
                                const store = transaction.objectStore('projects');
                                store.put(newProject);
                                transaction.oncomplete = async function() {
                                    await recordDownload();
                                    currentProjectCategory = result.category;
                                    currentProjectName = result.projectName;
                                    refreshProjectSelectors();
                                    loadProjectFromDB(result.projectName);
                                    const successToast = document.createElement('div');
                                    successToast.style.cssText = `position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#4CAF50,#45a049);color:white;padding:12px 24px;border-radius:8px;z-index:10000;`;
                                    successToast.textContent = `✅ 已创建新项目"${result.projectName}"！`;
                                    document.body.appendChild(successToast);
                                    setTimeout(() => successToast.remove(), 3000);
                                };
                                importedScripts++;
                            }
                            if (fileNames.indexOf(fileName) < fileNames.length - 1) {
                                document.body.appendChild(toast);
                            }
                        }
                    } else {
                        // 非JSON文件，作为脚本文件导入
                        toast.remove();
                        
                        // 显示导入选项对话框
                        const result = await showTxtImportDialog(fileName, content);
                        
                        if (result && result.action === 'current') {
                            // 导入到当前项目
                            const existsIndex = txtFiles.findIndex(f => f.name === fileName);
                            if (existsIndex !== -1) {
                                txtFiles[existsIndex].content = content;
                            } else {
                                txtFiles.push({ name: fileName, content: content });
                            }
                            updateTxtFilesList();
                            autoSaveProject();
                            await recordDownload();
                            importedScripts++;
                            
                            const successToast = document.createElement('div');
                            successToast.style.cssText = `
                                position: fixed;
                                top: 20px;
                                right: 20px;
                                background: linear-gradient(135deg, #4CAF50, #45a049);
                                color: white;
                                padding: 12px 24px;
                                border-radius: 8px;
                                z-index: 10000;
                            `;
                            successToast.textContent = `✅ 已导入到当前项目！`;
                            document.body.appendChild(successToast);
                            setTimeout(() => successToast.remove(), 3000);
                        } else if (result && result.action === 'new') {
                            // 创建新项目
                            const newProject = {
                                name: result.projectName,
                                category: result.category,
                                txtFiles: [{ name: fileName, content: content }],
                                myHandCards: [],
                                teammateHandCards: [],
                                myPlacedCards: {},
                                teammatePlacedCards: {},
                                createdAt: Date.now()
                            };
                            
                            // 确保分类存在
                            if (!categories.includes(result.category)) {
                                categories.push(result.category);
                                saveCategories();
                            }
                            
                            // 保存新项目
                            const transaction = db.transaction(['projects'], 'readwrite');
                            const store = transaction.objectStore('projects');
                            store.put(newProject);
                            
                            transaction.oncomplete = async function() {
                                await recordDownload();
                                currentProjectCategory = result.category;
                                currentProjectName = result.projectName;
                                refreshProjectSelectors();
                                
                                // 加载新项目
                                loadProjectFromDB(result.projectName);
                                
                                const successToast = document.createElement('div');
                                successToast.style.cssText = `
                                    position: fixed;
                                    top: 20px;
                                    right: 20px;
                                    background: linear-gradient(135deg, #4CAF50, #45a049);
                                    color: white;
                                    padding: 12px 24px;
                                    border-radius: 8px;
                                    z-index: 10000;
                                `;
                                successToast.textContent = `✅ 已创建新项目"${result.projectName}"！`;
                                document.body.appendChild(successToast);
                                setTimeout(() => successToast.remove(), 3000);
                            };
                            
                            importedScripts++;
                        }
                        
                        // 重新显示加载提示（如果还有其他文件）
                        if (fileNames.indexOf(fileName) < fileNames.length - 1) {
                            document.body.appendChild(toast);
                        }
                    }
                }

                // 移除加载提示
                const loadingToast = document.getElementById('importLoadingToast');
                if (loadingToast) loadingToast.remove();

                // 显示结果
                if (importedScripts > 0) {
                    updateTxtFilesList();
                    autoSaveProject();
                    await recordDownload();
                }
                
                if (importedScripts > 0 || importedProjects > 0) {
                    const successToast = document.createElement('div');
                    successToast.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: linear-gradient(135deg, #4CAF50, #45a049);
                        color: white;
                        padding: 12px 24px;
                        border-radius: 8px;
                        z-index: 10000;
                    `;
                    let msg = '✅ 导入成功！';
                    if (importedScripts > 0) msg += ` ${importedScripts} 个脚本文件`;
                    if (importedProjects > 0) msg += ` ${importedProjects} 个项目`;
                    successToast.textContent = msg;
                    document.body.appendChild(successToast);
                    setTimeout(() => successToast.remove(), 3000);
                } else {
                    alert('没有导入任何文件');
                }
            } catch (error) {
                const loadingToast = document.getElementById('importLoadingToast');
                if (loadingToast) loadingToast.remove();
                alert('❌ 导入失败: ' + error.message);
                console.error('导入失败:', error);
            }
        }

        // 从需求墙导入脚本到老马目录（App端）
        // 已核对过的导入密码（入口处校验后暂存，供 doImportToLaoMaDir 使用，避免把密码拼进 onclick HTML）
        let _laoMaVerifiedPwd = null;

        async function importToLaoMaFromWall(scriptUrl, scriptName, isEncrypted = false, passwordHash = '') {
            try {
                if (typeof window.__TAURI_INTERNALS__ === 'undefined') {
                    alert('此功能仅限桌面版 App 使用');
                    return;
                }
                // 先核对密码，再弹"选择保存位置"（导出设置信息）：
                // 避免取消密码后界面卡在"正在获取脚本"一直不消失
                if (isEncrypted) {
                    const decPwd = prompt('该文件已加密，请输入密码或恢复密钥：');
                    if (!decPwd) return; // 用户取消，不弹任何界面，直接退出
                    _laoMaVerifiedPwd = decPwd;
                } else {
                    _laoMaVerifiedPwd = null;
                }
                const dirKeys = ['coop', 'activity', 'battle', 'battleMax', 'screenshot', 'temp'];
                const hasConfig = dirKeys.some(k => {
                    try { return window.maDirs && window.maDirs[k]; } catch(e) { return false; }
                });
                if (!hasConfig) {
                    if (confirm('尚未配置老马目录，是否现在去配置？')) {
                        if (window.openAppLocalSettings) {
                            window.openAppLocalSettings();
                        } else {
                            alert('请在右上角 📁 APP本地设置 中配置老马目录');
                        }
                    }
                    return;
                }
                // 显示目录选择弹窗
                showLaoMaDirPicker(scriptUrl, scriptName, isEncrypted, passwordHash);
            } catch (e) {
                alert('操作失败: ' + e.message);
            }
        }

        // 显示老马目录选择弹窗
        function showLaoMaDirPicker(scriptUrl, scriptName, isEncrypted = false, passwordHash = '') {
            const dirLabels = {
                coop: { label: '合作脚本', icon: '🤝', desc: '寒冰/暗月/合作/漩涡/深海' },
                activity: { label: '活动', icon: '🎉', desc: '活动+隐藏榜' },
                battle: { label: '对战JSON', icon: '⚔️', desc: '对战目录(JSON)' },
                battleMax: { label: '对战MAX(TXT)', icon: '📊', desc: '对战MAX目录(TXT)' },
                screenshot: { label: '截图', icon: '📸', desc: '截图目录' },
                temp: { label: '临时脚本', icon: '📝', desc: '临时存放' }
            };

            let btnHtml = '';
            for (const [key, info] of Object.entries(dirLabels)) {
                const hasDir = (() => { try { return !!(window.maDirs && window.maDirs[key]); } catch(e) { return false; } })();
                const disabledStyle = hasDir ? '' : 'opacity:0.4;pointer-events:none;';
                const dirPath = hasDir ? (window.maDirs[key]) : '未配置';
                btnHtml += `
                    <div onclick="${hasDir ? `doImportToLaoMaDir('${key}','${scriptUrl}','${scriptName.replace(/'/g,"\\'")}',${isEncrypted ? 'true' : 'false'},'${(passwordHash||'').replace(/'/g,"\\'")}')` : ''}" 
                         style="cursor:${hasDir ? 'pointer' : 'not-allowed'};background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:14px 16px;text-align:left;transition:all 0.2s;${disabledStyle}"
                         onmouseover="if(${hasDir})this.style.background='rgba(255,152,0,0.15)';if(${hasDir})this.style.borderColor='rgba(255,152,0,0.5)'"
                         onmouseout="if(${hasDir})this.style.background='rgba(255,255,255,0.06)';if(${hasDir})this.style.borderColor='rgba(255,255,255,0.15)'">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="font-size:1.4rem;">${info.icon}</span>
                            <div>
                                <div style="color:#fff;font-size:0.9rem;font-weight:bold;">${info.label}</div>
                                <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:2px;">${info.desc}</div>
                                <div style="color:rgba(255,255,255,0.3);font-size:0.65rem;margin-top:2px;word-break:break-all;">${dirPath}</div>
                            </div>
                        </div>
                    </div>`;
            }

            const modal = document.createElement('div');
            modal.id = 'laoMaDirPickerModal';
            modal.style.cssText = `
                position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);
                display:flex;align-items:center;justify-content:center;z-index:99999;
            `;
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,152,0,0.5);border-radius:16px;padding:24px;max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <div>
                            <span style="color:#ff9800;font-size:1.1rem;font-weight:bold;">📁 选择保存位置</span>
                            <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-top:4px;">${scriptName}</div>
                        </div>
                        <span onclick="document.getElementById('laoMaDirPickerModal').remove()" style="cursor:pointer;color:rgba(255,255,255,0.4);font-size:1.5rem;">×</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">${btnHtml}</div>
                    <div style="color:rgba(255,255,255,0.3);font-size:0.7rem;text-align:center;margin-top:14px;">灰色选项表示该目录未在APP本地设置中配置</div>
                </div>`;
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);
        }

        // 执行导入到老马
        async function doImportToLaoMaDir(dirKey, scriptUrl, scriptName, isEncrypted = false, passwordHash = '') {
            const modal = document.getElementById('laoMaDirPickerModal');
            if (modal) modal.remove();

            // 自动解码 URL 编码的中文文件名（Gist 存储的中文文件名会被编码为 %XX%XX），
            // 并让用户确认/修改，解决导入老马后文件名乱码问题。
            let decodedName = scriptName;
            try { decodedName = decodeURIComponent(scriptName); } catch(e) {}
            const finalName = prompt('请输入脚本文件名（含扩展名）：', decodedName);
            if (!finalName) return; // 用户取消保存

            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 20px;border-radius:8px;z-index:100000;font-size:0.85rem;`;
            toast.textContent = '⏳ 正在获取脚本...';
            document.body.appendChild(toast);

            try {
                // 下载脚本内容
                const resp = await fetch(scriptUrl);
                if (!resp.ok) throw new Error('下载失败');
                let content = await resp.text();

                if (isEncrypted) {
                    // 密码已在入口（importToLaoMaFromWall）核对，直接使用已验证密码解密
                    const pwd = _laoMaVerifiedPwd;
                    if (!pwd) {
                        toast.remove();
                        alert('❌ 未提供密码，无法导入');
                        _laoMaVerifiedPwd = null;
                        return;
                    }
                    const decrypted = await decryptContent(content, pwd);
                    if (decrypted === null) {
                        toast.remove();
                        alert('❌ 解密失败，可能密码不正确或文件已损坏');
                        _laoMaVerifiedPwd = null;
                        return;
                    }
                    content = decrypted;
                    _laoMaVerifiedPwd = null;
                }

                recordDownload(finalName); // 导入到老马也算一次下载

                toast.textContent = '⏳ 正在保存到老马目录...';

                if (window.saveScriptToMaDir) {
                    const ok = await window.saveScriptToMaDir(dirKey, finalName, content, true);
                    if (ok) {
                        toast.textContent = '✅ 已保存到老马目录！';
                        toast.style.background = 'linear-gradient(135deg,#4CAF50,#45a049)';
                    } else {
                        toast.textContent = '❌ 保存失败';
                        toast.style.background = 'linear-gradient(135deg,#f44336,#d32f2f)';
                    }
                } else {
                    toast.textContent = '❌ 当前环境不支持此功能';
                    toast.style.background = 'linear-gradient(135deg,#f44336,#d32f2f)';
                }
            } catch (e) {
                toast.textContent = '❌ 操作失败: ' + e.message;
                toast.style.background = 'linear-gradient(135deg,#f44336,#d32f2f)';
            }
            setTimeout(() => toast.remove(), 3000);
        }

        // 打开本地文件选择器（选择扫描文件发布到需求墙）
        async function openLocalFilePublisher() {
            if (typeof window.__TAURI_INTERNALS__ === 'undefined') {
                alert('此功能仅限桌面版 App 使用');
                return;
            }
            if (!getGistToken()) {
                alert('离线版暂不支持发送，请检查网络连接');
                return;
            }

            // 扫描老马目录
            let files = [];
            try {
                if (window.silentScanFiles) {
                    await window.silentScanFiles();
                    files = window.scannedFiles || [];
                } else if (window.scanAllFiles) {
                    await window.scanAllFiles();
                    files = window.scannedFiles || [];
                }
            } catch (e) {
                console.warn('扫描失败:', e);
            }

            if (files.length === 0) {
                if (confirm('未找到可发布的脚本文件。\n\n请确保已在 APP本地设置 中配置了老马目录（合作、活动、对战等），且目录下有 .txt 或 .json 文件。\n\n是否去配置？')) {
                    if (window.openAppLocalSettings) {
                        window.openAppLocalSettings();
                    }
                }
                return;
            }

            // 按目录分组
            const grouped = {};
            files.forEach(f => {
                const label = f.dirLabel || '其他';
                if (!grouped[label]) grouped[label] = [];
                grouped[label].push(f);
            });

            // 构建文件列表HTML
            let fileListHtml = '';
            let totalFiles = 0;
            for (const [label, fileList] of Object.entries(grouped)) {
                totalFiles += fileList.length;
                fileListHtml += `<div style="color:#00bcd4;font-size:0.75rem;margin:8px 0 4px;font-weight:bold;">${label}（${fileList.length}个）</div>`;
                fileList.forEach((f, i) => {
                    const safePath = f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const safeName = f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    fileListHtml += `
                    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;border-radius:4px;"
                           onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                        <input type="checkbox" class="localFilePubCheckbox" data-path="${safePath.replace(/\\\\/g,'\\\\')}" data-name="${safeName.replace(/\\\\/g,'\\\\')}" 
                               style="accent-color:#ff9800;transform:scale(1.1);">
                        <span style="color:#fff;font-size:0.82rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
                    </label>`;
                });
            }

            const modal = document.createElement('div');
            modal.id = 'localFilePublisherModal';
            modal.style.cssText = `
                position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);
                display:flex;align-items:center;justify-content:center;z-index:99999;
            `;
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(255,152,0,0.5);border-radius:16px;padding:24px;max-width:500px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="color:#ff9800;font-size:1.1rem;font-weight:bold;">📂 选择要发布的脚本</span>
                        <span onclick="document.getElementById('localFilePublisherModal').remove()" style="cursor:pointer;color:rgba(255,255,255,0.4);font-size:1.5rem;">×</span>
                    </div>
                    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;">
                        <button onclick="toggleAllLocalPubCheckboxes(true)" style="background:rgba(255,152,0,0.2);color:#ff9800;border:1px solid rgba(255,152,0,0.3);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;">全选（${totalFiles}个）</button>
                        <button onclick="toggleAllLocalPubCheckboxes(false)" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;">取消全选</button>
                    </div>
                    <div style="flex:1;overflow-y:auto;max-height:50vh;">${fileListHtml}</div>
                    <div style="margin-top:12px;display:flex;gap:10px;">
                        <button onclick="executeLocalFilePublish()" id="localPubExecBtn" style="flex:1;background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:10px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:bold;">📢 发布选中文件</button>
                        <button onclick="document.getElementById('localFilePublisherModal').remove()" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.2);padding:10px 16px;border-radius:8px;cursor:pointer;font-size:0.85rem;">取消</button>
                    </div>
                </div>`;
            modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);
        }

        // 全选/取消全选本地文件发布复选框
        function toggleAllLocalPubCheckboxes(checked) {
            document.querySelectorAll('.localFilePubCheckbox').forEach(cb => { cb.checked = checked; });
        }

        // 执行本地文件批量发布到需求墙
        async function executeLocalFilePublish() {
            const checkboxes = document.querySelectorAll('.localFilePubCheckbox:checked');
            if (checkboxes.length === 0) {
                alert('请至少选择一个文件');
                return;
            }

            const modal = document.getElementById('localFilePublisherModal');
            if (modal) modal.remove();

            // 分享选项弹窗（时长 + 密码，批量统一）
            const opts = await new Promise(function(resolve) { showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); }); });
            if (opts === null || opts[0] === null) return;
            const expireMinutes = opts[0];
            const sharePassword = opts[1];
            const recoveryKey = opts[2] || '';
            let passwordHash = null;
            if (sharePassword || recoveryKey) passwordHash = await hashPassword(sharePassword || '');

            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 20px;border-radius:8px;z-index:100000;font-size:0.85rem;`;
            toast.textContent = '⏳ 正在读取文件...';
            document.body.appendChild(toast);

            let successCount = 0;
            let failCount = 0;

            for (const cb of checkboxes) {
                const filePath = cb.getAttribute('data-path').replace(/\\\\/g, '\\');
                const fileName = cb.getAttribute('data-name').replace(/\\\\/g, '\\');
                
                toast.textContent = `⏳ 正在发布 ${successCount + failCount + 1}/${checkboxes.length}: ${fileName}...`;

                try {
                    // 读取文件内容
                    let content = '';
                    if (window.readTextFile) {
                        content = await window.readTextFile(filePath);
                        if (content === null || content === undefined) throw new Error('读取失败');
                    } else {
                        throw new Error('环境不支持');
                    }

                    // 有密码则加密内容（含恢复密钥走方案B）
                    let uploadContent = content;
                    const willEncrypt = !!(sharePassword || recoveryKey);
                    if (willEncrypt) {
                        uploadContent = recoveryKey ? await encryptContentB(content, sharePassword, recoveryKey) : await encryptContent(content, sharePassword);
                    }

                    // 上传到 Gist
                    const token = getGistToken();
                    const response = await fetch('https://api.github.com/gists', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'Authorization': `token ${token}`
                        },
                        body: JSON.stringify({
                            description: '脚本分享: ' + fileName + (sharePassword ? ' [加密]' : ''),
                            public: true,
                            files: { [fileName]: { content: uploadContent } }
                        })
                    });

                    if (!response.ok) throw new Error('上传Gist失败');

                    const data = await response.json();
                    const scriptUrl = data.files[fileName]?.raw_url || 
                        `https://gist.githubusercontent.com/${data.id}/raw/${encodeURIComponent(fileName)}`;

                    // 发布到需求墙
                    if (wallMessages.length === 0) {
                        try { await fetchMessages(); } catch (e) {}
                    }

                    const nickname = localStorage.getItem('TFJL_UserName') || '匿名用户';
                    const msg = {
                        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        nickname: nickname,
                        text: `分享了脚本: ${fileName}`,
                        scriptUrl: scriptUrl,
                        timestamp: Date.now(),
                        expireAt: expireMinutes > 0 ? Date.now() + (expireMinutes * 60 * 1000) : null,
                        isSystem: false,
                        shareType: 'scanned',
                        isEncrypted: !!willEncrypt
                    };
                    if (passwordHash) msg.passwordHash = passwordHash;
                    if (recoveryKey) msg.encScheme = 'B';

                    wallMessages.push(msg);
                    await saveMessagesToGist();
                    successCount++;
                } catch (e) {
                    console.error('发布失败:', fileName, e);
                    failCount++;
                }
            }

            let resultMsg = '';
            if (successCount > 0) resultMsg += `✅ 成功发布 ${successCount} 个文件`;
            if (failCount > 0) resultMsg += (resultMsg ? '\n' : '') + `❌ ${failCount} 个发布失败`;
            if (resultMsg === '') resultMsg = '❌ 全部发布失败';

            toast.textContent = resultMsg;
            toast.style.whiteSpace = 'pre-line';
            toast.style.background = failCount > 0 ? 'rgba(255,152,0,0.9)' : 'linear-gradient(135deg,#4CAF50,#45a049)';
            setTimeout(() => toast.remove(), 4000);

            renderMessages();
        }

        // 从需求墙导入备份
        async function importBackupFromWall(url, isEncrypted = false, passwordHash = '') {
            try {
                // 显示加载提示
                const toast = document.createElement('div');
                toast.id = 'importLoadingToast';
                toast.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(40,40,70,0.95);
                    color: #ffd700;
                    padding: 20px 30px;
                    border-radius: 10px;
                    z-index: 10001;
                    border: 2px solid rgba(255,215,0,0.3);
                `;
                toast.textContent = '⏳ 正在导入备份...';
                document.body.appendChild(toast);

                // 从URL获取Gist数据
                let apiUrl = url;
                let isRawUrl = url.includes('gist.githubusercontent.com');
                
                if (isRawUrl) {
                    const match = url.match(/gist\.githubusercontent\.com\/[^\/]+\/([a-zA-Z0-9]+)/i);
                    if (match && match[1]) {
                        apiUrl = `https://api.github.com/gists/${match[1]}`;
                    }
                } else if (url.includes('gist.github.com') && !url.includes('api.github.com')) {
                    const match = url.match(/gist\.github\.com\/[^\/]+\/([a-zA-Z0-9]+)/i);
                    if (match && match[1]) {
                        apiUrl = `https://api.github.com/gists/${match[1]}`;
                    }
                }
                
                // 私有Gist需要认证
                const token = getGistToken();
                const headers = {
                    'Accept': 'application/vnd.github.v3+json'
                };
                if (token) {
                    headers['Authorization'] = `token ${token}`;
                }
                
                const response = await fetch(apiUrl, { headers });
                if (!response.ok) throw new Error('获取备份失败');
                
                let backupContent;
                
                if (isRawUrl && apiUrl === url) {
                    // 直接获取原始内容
                    backupContent = await response.text();
                } else {
                    // 使用API获取JSON数据
                    const data = await response.json();
                    const files = data.files;
                    const fileNames = Object.keys(files);
                    
                    if (!fileNames || fileNames.length === 0) throw new Error('备份文件为空');
                    
                    // 获取第一个文件的内容作为备份数据
                    const firstFile = files[fileNames[0]];
                    if (firstFile.truncated) {
                        // 大文件被截断，需要通过raw_url获取完整内容
                        let rawContent = null;
                        // 先不带认证请求（公开Gist可直接访问，避免CORS预检）
                        try {
                            const rawResp = await fetch(firstFile.raw_url);
                            if (rawResp.ok) {
                                rawContent = await rawResp.text();
                            }
                        } catch (e) {
                            // CORS或网络错误
                        }
                        // 如果直接fetch失败，通过API获取（私有Gist需要认证）
                        if (rawContent === null && token) {
                            try {
                                // 用Gist API获取完整内容（API支持CORS+认证）
                                const gistId = apiUrl.match(/gists\/([a-f0-9]+)/i)?.[1];
                                if (gistId) {
                                    const apiResp = await fetch(`https://api.github.com/gists/${gistId}`, {
                                        headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` }
                                    });
                                    if (apiResp.ok) {
                                        const fullData = await apiResp.json();
                                        const fullFile = fullData.files?.[fileNames[0]];
                                        if (fullFile && !fullFile.truncated) {
                                            rawContent = fullFile.content;
                                        } else if (fullFile?.raw_url) {
                                            // 仍然截断，尝试通过raw_url获取（带token参数）
                                            const rawResp2 = await fetch(fullFile.raw_url);
                                            if (rawResp2.ok) rawContent = await rawResp2.text();
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('API方式获取截断文件失败:', e);
                            }
                        }
                        if (rawContent !== null) {
                            backupContent = rawContent;
                        } else {
                            throw new Error('获取完整备份文件失败');
                        }
                    } else {
                        backupContent = firstFile.content;
                    }
                }
                
                if (isEncrypted) {
                    const decPwd = prompt('该备份已加密，请输入密码或恢复密钥：');
                    if (!decPwd) return;
                    const decrypted = await decryptContent(backupContent, decPwd);
                    if (decrypted === null) { alert('❌ 解密失败，可能密码/密钥不正确或文件已损坏'); return; }
                    backupContent = decrypted;
                }

                const importData = JSON.parse(backupContent);
                
                // 支持两种备份格式
                let projectsToImport = [];
                let categoriesToImport = [];
                
                if (importData.projects && Array.isArray(importData.projects)) {
                    // 全部备份格式
                    projectsToImport = importData.projects;
                    categoriesToImport = importData.categories || [];
                } else if (importData.project && importData.type === 'tower-defense-project') {
                    // 单个项目备份格式
                    projectsToImport = [importData.project];
                } else {
                    throw new Error('无效的备份文件格式');
                }
                
                if (projectsToImport.length === 0) {
                    throw new Error('备份文件中没有项目');
                }
                
                // 移除加载提示
                toast.remove();
                
                // 检查同名项目
                const existingNames = [];
                for (const project of projectsToImport) {
                    const existing = await new Promise((resolve) => {
                        const transaction = db.transaction(['projects'], 'readonly');
                        const store = transaction.objectStore('projects');
                        const req = store.get(project.name);
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => resolve(null);
                    });
                    if (existing) {
                        existingNames.push(project.name);
                    }
                }
                
                // 显示导入选项对话框
                const result = await showBackupImportDialog({ projects: projectsToImport, existingNames }, '备份文件');
                
                if (result && result.action !== 'cancel') {
                    // 导入分类（包括项目自带的分类）
                    if (categoriesToImport.length > 0) {
                        categoriesToImport.forEach(cat => {
                            if (!categories.includes(cat)) {
                                categories.push(cat);
                            }
                        });
                    }
                    
                    // 检查并添加项目自身的分类
                    for (const project of projectsToImport) {
                        if (project.category && !categories.includes(project.category)) {
                            categories.push(project.category);
                        }
                    }
                    
                    // 保存分类
                    saveCategories();
                    
                    // 处理项目导入
                    let imported = 0;
                    let renamed = 0;
                    let skipped = 0;
                    const transaction = db.transaction(['projects'], 'readwrite');
                    const store = transaction.objectStore('projects');
                    
                    for (const project of projectsToImport) {
                        // 检查是否存在同名项目
                        const existing = await new Promise((resolve) => {
                            const req = store.get(project.name);
                            req.onsuccess = () => resolve(req.result);
                            req.onerror = () => resolve(null);
                        });
                        
                        if (existing) {
                            if (result.action === 'rename') {
                                // 自动改名
                                let newName = project.name + '_副本';
                                let counter = 1;
                                while (await new Promise((resolve) => {
                                    const req = store.get(newName);
                                    req.onsuccess = () => resolve(!!req.result);
                                    req.onerror = () => resolve(false);
                                })) {
                                    counter++;
                                    newName = `${project.name}_副本${counter}`;
                                }
                                project.name = newName;
                                renamed++;
                            } else if (result.action === 'skip') {
                                skipped++;
                                continue;
                            }
                            // overwrite 直接覆盖
                        }
                        
                        store.put(project);
                        imported++;
                    }
                    
                    transaction.oncomplete = async function() {
                        await recordDownload();
                        
                        // 如果导入的项目有分类，切换到该分类
                        if (projectsToImport[0] && projectsToImport[0].category) {
                            currentProjectCategory = projectsToImport[0].category;
                        }
                        
                        refreshProjectSelectors();
                        updateProjectSelector();
                        
                        let msg = `✅ 成功恢复 ${imported} 个项目！`;
                        if (renamed > 0) msg += `\n重命名 ${renamed} 个同名项目`;
                        if (skipped > 0) msg += `\n跳过 ${skipped} 个同名项目`;
                        
                        const successToast = document.createElement('div');
                        successToast.style.cssText = `
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: linear-gradient(135deg, #4CAF50, #45a049);
                            color: white;
                            padding: 12px 24px;
                            border-radius: 8px;
                            z-index: 10000;
                            white-space: pre-line;
                        `;
                        successToast.textContent = msg;
                        document.body.appendChild(successToast);
                        setTimeout(() => successToast.remove(), 4000);
                    };
                    
                    transaction.onerror = function() {
                        alert('❌ 恢复项目失败');
                    };
                }
            } catch (error) {
                const loadingToast = document.getElementById('importLoadingToast');
                if (loadingToast) loadingToast.remove();
                alert('❌ 导入备份失败: ' + error.message);
                console.error('导入备份失败:', error);
            }
        }
        
        async function recordScriptUpload() {
            try {
                if (!counterData) return;
                counterData.total_downloads = (counterData.total_downloads || 0) + 1;
                counterData.last_updated = getCurrentTimeString();
                saveCounterToCache(counterData);
                updateStatsBar();
                if (isOnline()) {
                    syncCounterToGist();
                }
            } catch (error) {
                console.warn('记录上传失败:', error);
            }
        }
        
        function handleScriptUpload(input) {
            const file = input.files[0];
            if (!file) return;
            
            if (file.size > MAX_SCRIPT_SIZE) {
                alert(`文件过大！最大支持10MB\n当前文件: ${(file.size / 1024).toFixed(1)}KB`);
                input.value = '';
                return;
            }
            
            pendingScriptFile = file;
            document.getElementById('uploadStatus').style.display = 'inline';
            document.getElementById('uploadStatus').textContent = `✓ ${file.name}`;
        }
        
        async function postMessage() {
            const input = document.getElementById('messageInput');
            const nicknameInput = document.getElementById('messageNickname');
            const expireDaysSelect = document.getElementById('expireDays');
            let content = input.value.trim();

            if (!content && !pendingScriptFile) {
                alert('请输入内容或选择脚本文件');
                return;
            }

            // 强需求：发言前必须设置昵称（仅用于展示，全局唯一，取消则不发布）
            const nick = await ensureNickname();
            if (!nick) { alert('发布消息需要先设置昵称（昵称仅用于发言/分享脚本展示，设置后不可自行修改）'); return; }
            const nickname = nick;

            if (!getGistToken()) {
                // 需求墙发布走部署自动注入的 Gist Token（GitHub Actions 注入 app-core.js 占位符），普通用户无需手动设置。
                // 真离线用 navigator.onLine 判断；若网络正常仍无 Token，多为部署未注入成功（见 deploy.yml 注入逻辑）。
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    alert('当前网络已断开，恢复网络后再发布消息');
                    return;
                }
                alert('发布消息需要 GitHub Token。\n当前环境未注入 Token（部署异常）或网络异常。\n请确认部署已正确注入 Token，或恢复网络后再试。');
                return;
            }

            // 【关键安全】发布前先从Gist加载历史消息，确保本地wallMessages完整
            if (wallMessages.length === 0) {
                try { await fetchMessages(); } catch (e) { console.warn('预加载消息失败:', e); }
            }

            // 显示加载状态
            const btn = document.querySelector('[onclick="postMessage()"]');
            const originalText = btn ? btn.textContent : '发布';
            if (btn) { btn.disabled = true; btn.textContent = '⏳ 发布中...'; }

            let scriptUrl = null;
            let pendingScriptEnc = null;
            let scriptExpireMinutes = null;

            try {
                if (pendingScriptFile) {
                    // 弹出分享选项（加密方式 / 查看密码 / 有效期），与「分享到需求墙」一致
                    const shareOpts = await new Promise(function(resolve) {
                        showShareOptionsDialog(function(e, p, rk) { resolve([e, p, rk]); });
                    });
                    if (shareOpts === null || shareOpts[0] === null) {
                        // 用户取消 → 中止发布，保留已选文件供再次发布
                        if (btn) { btn.disabled = false; btn.textContent = originalText; }
                        return;
                    }
                    const scriptExpire = shareOpts[0];
                    const scriptPassword = shareOpts[1];
                    const scriptRecoveryKey = shareOpts[2] || '';
                    const fileContent = await readFileAsText(pendingScriptFile);
                    const willEncrypt = !!(scriptPassword || scriptRecoveryKey);
                    let uploadContent = fileContent;
                    let passwordHash = null;
                    if (willEncrypt) {
                        uploadContent = scriptRecoveryKey
                            ? await encryptContentB(fileContent, scriptPassword, scriptRecoveryKey)
                            : await encryptContent(fileContent, scriptPassword);
                        passwordHash = await hashPassword(scriptPassword || '');
                    }
                    scriptUrl = await uploadScriptToGist(pendingScriptFile, uploadContent);
                    recordScriptUpload();
                    if (!content) {
                        content = `分享脚本: ${pendingScriptFile.name}\n${scriptUrl}`;
                    } else {
                        content = `${content}\n${scriptUrl}`;
                    }
                    pendingScriptEnc = {
                        isEncrypted: willEncrypt,
                        passwordHash: passwordHash,
                        encScheme: scriptRecoveryKey ? 'B' : (willEncrypt ? 'A' : ''),
                        password: scriptPassword,
                        recoveryKey: scriptRecoveryKey,
                        fileName: pendingScriptFile.name
                    };
                    scriptExpireMinutes = scriptExpire;
                }

                let expireMinutesValue = parseInt(expireDaysSelect.value);
                if (pendingScriptEnc && scriptExpireMinutes !== null) {
                    expireMinutesValue = scriptExpireMinutes;
                }
                const newMsg = {
                    content: content,
                    author: nickname,
                    time: Date.now(),
                    scriptUrl: scriptUrl,
                    expireMinutes: expireMinutesValue > 0 ? expireMinutesValue : null
                };
                if (pendingScriptEnc) {
                    if (pendingScriptEnc.isEncrypted) newMsg.isEncrypted = true;
                    if (pendingScriptEnc.passwordHash) newMsg.passwordHash = pendingScriptEnc.passwordHash;
                    if (pendingScriptEnc.encScheme) newMsg.encScheme = pendingScriptEnc.encScheme;
                }

                wallMessages.unshift(newMsg);
                if (wallMessages.length > MAX_MESSAGES) {
                    wallMessages = wallMessages.slice(0, MAX_MESSAGES);
                }

                input.value = '';
                pendingScriptFile = null;
                document.getElementById('uploadStatus').style.display = 'none';
                document.getElementById('scriptFileInput').value = '';
                const expireCheckbox = document.getElementById('expireCheckbox');
                if (expireCheckbox) expireCheckbox.checked = false;

                nicknameInput.value = nickname;

                renderMessages();

                await saveMessagesToGist();

                // 若脚本已加密，弹出密码/恢复密钥提示（与「分享到需求墙」一致），方便分享者记住
                if (pendingScriptEnc && pendingScriptEnc.isEncrypted && typeof showPasswordReminder === 'function') {
                    showPasswordReminder(pendingScriptEnc.fileName, pendingScriptEnc.password || '', '脚本已上传', pendingScriptEnc.recoveryKey || '');
                }

                // 显示成功提示
                const _toast = document.createElement('div');
                _toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:10px 24px;border-radius:8px;z-index:99999;font-size:0.9rem;animation:fadeInOut 2s ease-in-out;background:rgba(74,222,128,0.9);color:#1a1a2e;';
                _toast.textContent = '✅ 发布成功！';
                document.body.appendChild(_toast);
                setTimeout(() => _toast.remove(), 2000);
            } catch (error) {
                console.error('发布失败:', error);
                alert('发布失败: ' + error.message);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = originalText; }
            }
        }
        
        async function uploadScriptToGist(file, contentOverride) {
            const token = getGistToken();
            if (!token) throw new Error('无Token');
            
            const content = (contentOverride !== undefined && contentOverride !== null) ? contentOverride : await readFileAsText(file);
            const filename = `scripts/${Date.now()}_${file.name}`;
            
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                },
                body: JSON.stringify({
                    description: `脚本分享: ${file.name}`,
                    public: true,
                    files: {
                        [file.name]: {
                            content: content
                        }
                    }
                })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || '上传失败');
            }
            
            const data = await response.json();
            const fileData = data.files[file.name];
            return fileData?.raw_url || data.html_url;
        }
        
        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(e);
                reader.readAsText(file);
            });
        }
        
        async function saveMessagesToGist(forceSave = false) {
            const token = getGistToken();
            if (!token) throw new Error('无Token');

            // ★ 权威指针：消息Gist ID 优先取索引 room_index.messages（免部署即可迁移Gist），其次硬编码常量
            const gistDeleted = localStorage.getItem('messages_gist_deleted') === 'true';
            let messagesGistId = (!gistDeleted && MESSAGES_GIST_ID) ? MESSAGES_GIST_ID : (localStorage.getItem('messages_gist_id') || '');
            // 若未确认删除，从索引拿最新 ID（防止硬编码的旧 Gist 被删后卡死、消息全空）
            if (!gistDeleted) {
                try {
                    const idxResp = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Accept': 'application/vnd.github.v3+json', ...(token && { 'Authorization': `token ${token}` }) } });
                    if (idxResp.ok) {
                        const idxData = await idxResp.json();
                        const ri = idxData.files && idxData.files['room_index.json'];
                        if (ri && ri.content) {
                            const idx = JSON.parse(ri.content);
                            if (idx.messages) { messagesGistId = idx.messages; localStorage.setItem('messages_gist_id', messagesGistId); }
                        }
                    }
                } catch (e) { console.warn('[消息] 索引解析失败，用硬编码兜底:', e); }
            }

            // 【关键安全标记】保存前先尝试获取远程消息
            // 注意：如果 messagesGistId 存在，就必须成功获取到远程消息
            // 否则视为"获取失败"，此时用本地数据覆盖会导致历史消息丢失
            // ★ 重要：Gist存在但为空（新创建的）不算"获取失败"，应允许写入
            let existingMessages = [];
            let remoteFetchAttempted = false;  // 是否尝试过获取远程
            let remoteFetchSucceeded = false;  // 获取是否成功（Gist存在且可访问，即使为空也算成功）
            let remoteGistDeleted = false;     // 远程Gist是否已删除(404)
            if (!forceSave && messagesGistId) {
                remoteFetchAttempted = true;
                try {
                    const existResp = await fetch(`https://api.github.com/gists/${messagesGistId}`, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            ...(token && { 'Authorization': `token ${token}` })
                        }
                    });
                    if (existResp.ok) {
                        // Gist存在且可访问，标记为成功（即使内容为空）
                        remoteFetchSucceeded = true;
                        const existData = await existResp.json();
                        if (existData.files && existData.files['messages.json']) {
                            const fileData = existData.files['messages.json'];
                            let content = fileData.content;

                            // 处理 truncated
                            if (fileData.truncated || !content) {
                                const rawResp = await fetch(fileData.raw_url, {
                                    headers: { ...(token && { 'Authorization': `token ${token}` }) }
                                });
                                if (rawResp.ok) content = await rawResp.text();
                            }

                            if (content) {
                                try {
                                    const parsed = JSON.parse(content);
                                    existingMessages = parsed.messages || [];
                                } catch (e) {
                                    console.warn('解析现有消息失败:', e);
                                }
                            }
                        }
                        // ★ 即使没有messages.json文件，Gist存在就算成功，允许写入
                    } else if (existResp.status === 404) {
                        // Gist已被删除，标记为已删除，允许后续重建
                        console.warn('[消息保存] 消息Gist已删除(404)，将重建');
                        remoteGistDeleted = true;
                        localStorage.setItem('messages_gist_deleted', 'true');
                        localStorage.removeItem('messages_gist_id');
                        messagesGistId = '';
                    }
                } catch (e) {
                    console.warn('获取现有消息失败:', e);
                }
            }

            // 防丢B：主Gist被删重建时，先从云端备份恢复历史，避免空白重建丢数据
            if (remoteGistDeleted) {
                try {
                    const bk = await restoreWallFromBackup();
                    if (bk && bk.length) { existingMessages = bk; console.log('[消息] 从备份恢复', bk.length, '条'); }
                } catch (e) {}
            }

            // 【第一层空数据保护】远程有数据但本地为空，阻止保存（如删除操作除外）
            if (!forceSave && !remoteGistDeleted && existingMessages.length > 0 && wallMessages.length === 0) {
                throw new Error('⚠️ 数据保护：检测到远程有 ' + existingMessages.length + ' 条消息，但本地数据为空。\n\n可能原因：网络问题导致数据加载失败。\n\n请刷新页面重新加载，或联系管理员从备份还原数据。');
            }

            // 【第二层关键保护】如果 messagesGistId 存在且尝试过获取远程消息，但获取失败
            // 区分情况：404（Gist已删除）→ 允许重建；403/网络错误 → 阻止保存防止数据丢失
            if (!forceSave && remoteFetchAttempted && !remoteFetchSucceeded && messagesGistId && !remoteGistDeleted) {
                throw new Error('⚠️ 数据保护：无法从远程获取历史消息（可能网络不稳定或GitHub限流）。\n\n为保护历史消息，已阻止本次保存。\n\n请刷新页面后重试发布，或稍后再试。');
            }

            // 【第三层保护】即使获取成功了，如果远程消息数明显多于本地，也要警告
            // （防止本地消息列表只加载了新消息，没有加载历史）
            if (!forceSave && remoteFetchSucceeded && existingMessages.length > wallMessages.length + 5) {
                console.warn('[消息保护] 远程 ' + existingMessages.length + ' 条，本地仅 ' + wallMessages.length + ' 条，已自动合并。');
            }
            
            // 生成消息唯一ID（防止重复合并）
            function getMessageId(msg) {
                const contentShort = (msg.content || '').substring(0, 30);
                return msg.time + '_' + msg.author + '_' + contentShort;
            }
            
            let finalMessages;
            if (forceSave) {
                // 强制保存（删除操作）：直接使用本地数据
                finalMessages = wallMessages.slice(0, MAX_MESSAGES);
                console.log('[消息保存] 删除操作：保存', finalMessages.length, '条');
            } else {
                // ★ 核心修复：添加消息时永远合并所有远程数据，防止数据丢失
                // 无论本地数据多少，都必须先获取远程数据，然后合并
                const localIds = new Set(wallMessages.map(m => getMessageId(m)));
                const mergedMap = new Map();
                
                // 先添加所有本地消息
                wallMessages.forEach(m => mergedMap.set(getMessageId(m), m));
                // 再添加所有远程消息（本地没有的才添加）
                existingMessages.forEach(m => {
                    const id = getMessageId(m);
                    if (!localIds.has(id)) mergedMap.set(id, m);
                });
                
                const merged = Array.from(mergedMap.values());
                merged.sort((a, b) => b.time - a.time);
                finalMessages = merged.slice(0, MAX_MESSAGES);
                console.log('[消息保存] 添加操作：本地', wallMessages.length, '条，远程', existingMessages.length, '条，合并后', finalMessages.length, '条');
            }
            
            if (messagesGistId) {
                try {
                    // 如果存在，使用 PATCH 更新现有 Gist
                    const response = await fetch(`https://api.github.com/gists/${messagesGistId}`, {
                        method: 'PATCH',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'Authorization': `token ${token}`
                        },
                        body: JSON.stringify({
                            files: {
                                'messages.json': {
                                    content: JSON.stringify({ messages: finalMessages }, null, 2)
                                }
                            }
                        })
                    });
                    
                    if (response.ok) {
                        // 更新本地 wallMessages
                        wallMessages = finalMessages;
                        // PATCH成功，清除删除标记
                        localStorage.removeItem('messages_gist_deleted');
                        await saveWallToDB(finalMessages);          // 防丢A：本地落盘
                        await backupWallMessages(finalMessages);  // 防丢B：云端备份
                        return;
                    }

                    // 如果 PATCH 失败（404 或 403），清除缓存重新创建
                    if (response.status === 404) {
                        localStorage.setItem('messages_gist_deleted', 'true');
                        localStorage.removeItem('messages_gist_id');
                        messagesGistId = null;
                    } else if (response.status === 403) {
                        localStorage.removeItem('messages_gist_id');
                        messagesGistId = null;
                    } else {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.message || '保存失败');
                    }
                } catch (e) {
                    if (e.message.includes('404')) {
                        localStorage.setItem('messages_gist_deleted', 'true');
                        localStorage.removeItem('messages_gist_id');
                        messagesGistId = null;
                    } else if (e.message.includes('403')) {
                        localStorage.removeItem('messages_gist_id');
                        messagesGistId = null;
                    } else {
                        throw e;
                    }
                }
            }
            
            // 如果不存在或 PATCH 失败，使用 POST 创建新的 Gist
            // 【双重检查】创建前先从索引文件确认是否已有messages
            if (!messagesGistId) {
                try {
                    const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                    const checkResp = await fetch(indexUrl, {
                        headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` }
                    });
                    if (checkResp.ok) {
                        const checkData = await checkResp.json();
                        if (checkData.files && checkData.files['room_index.json'] && checkData.files['room_index.json'].content) {
                            const checkIndex = JSON.parse(checkData.files['room_index.json'].content);
                            if (checkIndex['messages']) {
                                messagesGistId = checkIndex['messages'];
                                localStorage.setItem('messages_gist_id', messagesGistId);
                                const existResp = await fetch(`https://api.github.com/gists/${messagesGistId}`, {
                                    method: 'PATCH',
                                    headers: {
                                        'Accept': 'application/vnd.github.v3+json',
                                        'Content-Type': 'application/json',
                                        'Authorization': `token ${token}`
                                    },
                                    body: JSON.stringify({ files: { 'messages.json': { content: JSON.stringify({ messages: finalMessages }, null, 2) } } })
                                });
                                if (existResp.ok) {
                                    wallMessages = finalMessages;
                                    localStorage.removeItem('messages_gist_deleted');
                                    return;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('messages双重检查失败，继续创建:', e);
                }
            }
            
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                },
                body: JSON.stringify({
                    description: '需求墙消息',
                    public: true,
                    files: {
                        'messages.json': {
                            content: JSON.stringify({ messages: finalMessages }, null, 2)
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
            localStorage.setItem('messages_gist_id', data.id);
            // 重建成功，清除删除标记
            localStorage.removeItem('messages_gist_deleted');
            console.log('[消息保存] 消息Gist重建成功，新ID:', data.id);
            
            // 更新索引文件（含冲突检测）
            const conflictResult = await updateRoomIndex('messages', data.id);
            if (conflictResult && conflictResult.conflict && conflictResult.existingGistId) {
                try {
                    await fetch(`https://api.github.com/gists/${data.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `token ${token}` }
                    });
                } catch (delErr) { console.warn('删除重复messages Gist失败:', delErr); }
                localStorage.setItem('messages_gist_id', conflictResult.existingGistId);
                await fetch(`https://api.github.com/gists/${conflictResult.existingGistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({ files: { 'messages.json': { content: JSON.stringify({ messages: wallMessages }, null, 2) } } })
                });
            }
        }
        
        function initMessageWall() {
            const savedNickname = localStorage.getItem('TFJL_UserName');
            if (savedNickname) {
                const nicknameInput = document.getElementById('messageNickname');
                if (nicknameInput) nicknameInput.value = savedNickname;
            }
            
            const nicknameInput = document.getElementById('messageNickname');
            if (nicknameInput) {
                nicknameInput.addEventListener('input', () => {
                    renderMessages();
                });
            }
            
            if (messageFetchInterval) clearInterval(messageFetchInterval);
            // 使用1秒倒计时刷新（替代原来的30秒定时器）
            startMsgCountdown();
        }
        
        // 显示统计数据
        function showStatistics() {
            if (!counterData) {
                alert('暂无统计数据');
                return;
            }
            
            const today = getTodayString();
            const todayStats = counterData.daily_stats[today] || { visits: 0, downloads: 0 };
            const pendingCount = loadPendingSync().length;
            
            // 确保数据字段存在
            const totalUsers = counterData.total_users || 0;
            const activeToday = counterData.active_today || 0;
            
            // 计算在线用户数
            let onlineCount = 0;
            if (counterData.online_users) {
                const now = Date.now();
                const timeout = counterData.online_timeout || 3600000;
                for (const id in counterData.online_users) {
                    if (now - counterData.online_users[id] <= timeout) {
                        onlineCount++;
                    }
                }
            }
            const onlineTimeoutMinutes = Math.round((counterData.online_timeout || 3600000) / 60000);
            
            let statsHtml = `
                <div style="text-align:left;line-height:1.8;">
                    <h2 style="color:#ffd700;margin-top:0;">📊 访问统计</h2>
                    
                    ${pendingCount > 0 ? `<p style="color:#ff9800;">⚠️ 有 ${pendingCount} 条数据等待同步</p>` : ''}
                    
                    <h3 style="color:#4ecdc4;">📈 总计数据</h3>
                    <div style="padding-left:20px;">
                        <p>• 总访问次数：${counterData.total_visits}</p>
                        <p>• 总 APP 访问：${(counterData.sources && counterData.sources.app_visits) || 0}  |  总 网页 访问：${(counterData.sources && counterData.sources.web_visits) || 0}</p>
                        <p>• 总用户数：${totalUsers}</p>
                        <p>• 当前在线：${onlineCount} <span style="color:#888;font-size:0.8rem;">(${onlineTimeoutMinutes}分钟内活跃)</span></p>
                        <p>• 今日活跃：${activeToday} (APP: ${(counterData.active_today_app_users || []).length} / 网页: ${(counterData.active_today_web_users || []).length})</p>
                        <p>• 总下载次数：${counterData.total_downloads}</p>
                    </div>
                    
                    <h3 style="color:#4ecdc4;">📅 今日数据 (${today})</h3>
                    <div style="padding-left:20px;">
                        <p>• 今日访问：${todayStats.visits} (APP: ${todayStats.app_visits || 0} / 网页: ${todayStats.web_visits || 0})</p>
                        <p>• 今日下载：${todayStats.downloads}</p>
                    </div>
                    
                    <p style="color:#888;font-size:0.9rem;margin-top:20px;">最后更新：${counterData.last_updated}</p>
                </div>
            `;
            
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:2px solid rgba(255,215,0,0.5);border-radius:15px;padding:30px;max-width:500px;color:#fff;">
                    <button onclick="this.closest('div').parentElement.remove()" style="position:absolute;top:15px;right:20px;background:#ff6b6b;color:#fff;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:1.2rem;line-height:30px;">×</button>
                    ${statsHtml}
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        // 页面加载时记录访问
        async function recordVisit() {
            await updateCounter('visit');
        }
        
        // 生成唯一设备ID
        function getDeviceId() {
            let deviceId = localStorage.getItem('TFJL_Device_ID');
            if (!deviceId) {
                // 生成新的设备ID
                const timestamp = Date.now();
                const random = Math.random().toString(36).substring(2, 15);
                deviceId = `device_${timestamp}_${random}`;
                localStorage.setItem('TFJL_Device_ID', deviceId);
            }
            return deviceId;
        }
        
        // 检查是否是新设备首次登录
        function isNewDeviceLogin() {
            const hasLoggedInBefore = localStorage.getItem('TFJL_Has_Logged_In_Before');
            return !hasLoggedInBefore;
        }



        // 记录下载（可选脚本名参数，用于单独统计每个脚本的下载次数）
        function recordDownload(scriptName = null) {
            updateCounter('download', scriptName);
        }

        // ==================== 管理员面板 ====================
        const ADMIN_VERIFY_KEY = 'TFJL_Admin_Verified';
        const ADMIN_VERIFY_HASH = 'v2$jkYsjc997BlgafRUyLlagKL62W1iBYfvH2fq1cJBbDs=';
        let adminLongPressTimer = null;
        let adminLongPressTriggered = false;

        document.addEventListener('DOMContentLoaded', () => {
            // 管理员还原按钮：仅 URL ?admin=1 或已激活时才显示
            showAdminRestoreBtnIfAllowed();
            const header = document.getElementById('mainHeader');
            header.addEventListener('mousedown', (e) => {
                e.preventDefault();
                adminLongPressTriggered = false;
                adminLongPressTimer = setTimeout(() => {
                    adminLongPressTriggered = true;
                    openAdminPanel();
                }, 2000);
            });
            header.addEventListener('mouseup', () => {
                clearTimeout(adminLongPressTimer);
            });
            header.addEventListener('mouseleave', () => {
                clearTimeout(adminLongPressTimer);
            });
            header.addEventListener('touchstart', (e) => {
                adminLongPressTriggered = false;
                adminLongPressTimer = setTimeout(() => {
                    adminLongPressTriggered = true;
                    openAdminPanel();
                }, 2000);
            }, { passive: true });
            header.addEventListener('touchend', () => {
                clearTimeout(adminLongPressTimer);
            });
            header.addEventListener('touchcancel', () => {
                clearTimeout(adminLongPressTimer);
            });

            // 隐藏触发：三击标题强制清缓存+硬刷新（防缓存死循环）
            let titleClickCount = 0;
            let titleClickTimer = null;
            const titleEl = document.querySelector('h1');
            if (titleEl) {
                titleEl.addEventListener('click', () => {
                    titleClickCount++;
                    if (titleClickCount >= 3) {
                        titleClickCount = 0;
                        clearTimeout(titleClickTimer);
                        if (confirm('🔧 三击触发：强制清缓存+硬刷新？\n\n将清除全部缓存并用时间戳强刷，确保拉到最新代码。')) {
                            forceClearAndHardRefresh();
                        }
                    } else {
                        clearTimeout(titleClickTimer);
                        titleClickTimer = setTimeout(() => { titleClickCount = 0; }, 1500);
                    }
                });
            }

            document.getElementById('adminVerifyCode').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') verifyAdmin();
            });

            document.getElementById('adminPanelOverlay').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) closeAdminPanel();
            });

            const permCheckbox = document.getElementById('adminNewsPermanent');
            const expireInput = document.getElementById('adminNewsExpireTime');
            if (permCheckbox && expireInput) {
                permCheckbox.addEventListener('change', () => {
                    if (permCheckbox.checked) expireInput.value = '';
                });
                expireInput.addEventListener('input', () => {
                    if (expireInput.value) permCheckbox.checked = false;
                });
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('adminPanelOverlay');
                if (overlay && overlay.style.display === 'flex') closeAdminPanel();
            }
        });

        async function openAdminPanel() {
            const overlay = document.getElementById('adminPanelOverlay');
            overlay.style.display = 'flex';

            // 优先检查 session 级别验证（本次使用期间内）
            let isVerified = sessionStorage.getItem(ADMIN_VERIFY_KEY) === 'true';

            // 如果 session 没有，检查 localStorage 是否保存了验证码
            if (!isVerified) {
                const saved = localStorage.getItem('TFJL_Admin_SavedPwd');
                if (saved) {
                    try {
                        // 存的是管理员哈希的 base64，直接比对，不暴露明文
                        if (atob(saved) === ADMIN_VERIFY_HASH) {
                            sessionStorage.setItem(ADMIN_VERIFY_KEY, 'true');
                            isVerified = true;
                        } else {
                            localStorage.removeItem('TFJL_Admin_SavedPwd');
                        }
                    } catch (e) {
                        localStorage.removeItem('TFJL_Admin_SavedPwd');
                    }
                }
            }

            if (isVerified) {
                document.getElementById('adminVerifySection').style.display = 'none';
                adminShowMenu();
            } else {
                document.getElementById('adminVerifySection').style.display = 'block';
                document.getElementById('adminMenuSection').style.display = 'none';
                document.getElementById('adminPageTitle').style.display = 'none';
                document.getElementById('adminPageNews').style.display = 'none';
                document.getElementById('adminPageStats').style.display = 'none';
                document.getElementById('adminPageSettings').style.display = 'none';
                document.getElementById('adminPageNickManage').style.display = 'none';
                document.getElementById('adminPagePasswordManage').style.display = 'none';
                const scriptStatsPage = document.getElementById('adminPageScriptStats');
                if (scriptStatsPage) scriptStatsPage.style.display = 'none';
                const logStatsAdminPage = document.getElementById('adminPageLogStats');
                if (logStatsAdminPage) logStatsAdminPage.style.display = 'none';
                document.getElementById('adminVerifyCode').value = '';
                document.getElementById('adminVerifyCode').focus();
            }
        }

        function adminShowMenu() {
            document.getElementById('adminMenuSection').style.display = 'block';
            document.getElementById('adminPageTitle').style.display = 'none';
            document.getElementById('adminPageNews').style.display = 'none';
            document.getElementById('adminPageStats').style.display = 'none';
            document.getElementById('adminPageSettings').style.display = 'none';
            document.getElementById('adminPageNickManage').style.display = 'none';
            document.getElementById('adminPagePasswordManage').style.display = 'none';
            const helpPage = document.getElementById('adminPageHelp');
            if (helpPage) helpPage.style.display = 'none';
            const cachePage = document.getElementById('adminPageCacheManage');
            if (cachePage) cachePage.style.display = 'none';
            const scriptStatsPage = document.getElementById('adminPageScriptStats');
            if (scriptStatsPage) scriptStatsPage.style.display = 'none';
            const analyticsPage = document.getElementById('adminPageAnalytics');
            if (analyticsPage) analyticsPage.style.display = 'none';
            const logStatsAdminPage2 = document.getElementById('adminPageLogStats');
            if (logStatsAdminPage2) logStatsAdminPage2.style.display = 'none';
            updateBroadcastToggleStatus();
        }

        function adminShowPage(page) {
            document.getElementById('adminMenuSection').style.display = 'none';
            document.getElementById('adminPageTitle').style.display = 'none';
            document.getElementById('adminPageNews').style.display = 'none';
            document.getElementById('adminPageStats').style.display = 'none';
            document.getElementById('adminPageSettings').style.display = 'none';
            document.getElementById('adminPageNickManage').style.display = 'none';
            document.getElementById('adminPagePasswordManage').style.display = 'none';
            const helpPage = document.getElementById('adminPageHelp');
            if (helpPage) helpPage.style.display = 'none';
            const cachePage = document.getElementById('adminPageCacheManage');
            if (cachePage) cachePage.style.display = 'none';
            const scriptStatsPage = document.getElementById('adminPageScriptStats');
            if (scriptStatsPage) scriptStatsPage.style.display = 'none';
            const analyticsPage = document.getElementById('adminPageAnalytics');
            if (analyticsPage) analyticsPage.style.display = 'none';
            const logStatsAdminPage3 = document.getElementById('adminPageLogStats');
            if (logStatsAdminPage3) logStatsAdminPage3.style.display = 'none';

            if (page === 'help') {
                if (helpPage) helpPage.style.display = 'block';
            } else if (page === 'title') {
                document.getElementById('adminPageTitle').style.display = 'block';
                document.getElementById('adminTitleText').value = currentConfig.title || '';
            } else if (page === 'news') {
                document.getElementById('adminPageNews').style.display = 'block';
                adminRefreshNews();
            } else if (page === 'stats') {
                document.getElementById('adminPageStats').style.display = 'block';
                adminLoadStats();
            } else if (page === 'analytics') {
                if (analyticsPage) {
                    analyticsPage.style.display = 'block';
                    adminLoadAnalytics();
                }
            } else if (page === 'scriptStats') {
                if (scriptStatsPage) {
                    scriptStatsPage.style.display = 'block';
                    adminLoadScriptStats();
                }
            } else if (page === 'settings') {
                document.getElementById('adminPageSettings').style.display = 'block';
                // 填充当前的索引ID
                const indexInput = document.getElementById('adminIndexGistId');
                if (indexInput) {
                    indexInput.value = localStorage.getItem(INDEX_GIST_ID_KEY) || GIST_ID || '';
                }
                updateAdminTokenStatus();
            } else if (page === 'nickManage') {
                document.getElementById('adminPageNickManage').style.display = 'block';
                loadCurrentNick();
                renderNickRegistry();
            } else if (page === 'passwordManage') {
                document.getElementById('adminPagePasswordManage').style.display = 'block';
                loadPasswordList();
            } else if (page === 'cacheManage') {
                if (cachePage) {
                    cachePage.style.display = 'block';
                }
            } else if (page === 'logStats') {
                const pageEl = document.getElementById('adminPageLogStats');
                if (pageEl) {
                    pageEl.style.display = 'block';
                    adminRefreshDebugLog();
                    adminRefreshConsoleLog();
                }
            }
        }


        // ==================== 对战日志诊断（管理员菜单） ====================
        function adminRefreshDebugLog() {
            const panel = document.getElementById('logDebugPanel');
            if (!panel) return;
            const lines = window._lastLogDebugLines;
            if (!lines || lines.length === 0) {
                panel.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:30px;font-size:0.85rem;">暂无诊断数据<br><span style="font-size:0.7rem;">先去「本地设置→对战日志统计」点一次统计</span></div>';
                return;
            }
            const items = lines.map((l, i) => {
                const cls = l.includes('【失败】') ? 'color:#f44336' : l.includes('【异常】') ? 'color:#ff9800' : 'color:rgba(255,255,255,0.65)';
                return '<div style="' + cls + ';font-size:0.75rem;font-family:monospace;padding:2px 0;">[' + i + '] ' + l.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
            }).join('');
            panel.innerHTML = items;
        }

        function adminRefreshConsoleLog() {
            const panel = document.getElementById('consoleLogPanel');
            if (!panel) return;
            const logs = window.__consoleLogs;
            if (!logs || logs.length === 0) {
                panel.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:30px;font-size:0.85rem;">暂无日志输出</div>';
                return;
            }
            const levelColors = { error: '#f44336', warn: '#ff9800', info: '#00bcd4', log: 'rgba(255,255,255,0.75)' };
            const items = logs.map((l, i) => {
                const color = levelColors[l.level] || 'rgba(255,255,255,0.6)';
                return `<div style="color:${color};font-size:0.7rem;padding:2px 4px;border-bottom:1px solid rgba(255,255,255,0.03);line-height:1.4;">
                    <span style="color:rgba(255,255,255,0.3);margin-right:6px;">${i + 1}</span>
                    <span style="color:rgba(255,255,255,0.25);margin-right:6px;">${l.time}</span>
                    <span style="font-weight:500;margin-right:4px;">[${l.level.toUpperCase()}]</span>
                    ${l.msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>`;
            }).join('');
            panel.innerHTML = items;
            panel.scrollTop = 0;
        }

        // ==================== 浮动控制台窗口 ====================
        let floatConsoleVisible = false;
        let floatAutoScroll = true;
        let floatConsoleRefreshTimer = null;
        let floatDragState = null;
        let floatFilter = '';

        function setFloatConsoleFilter(v) {
            floatFilter = (v || '').trim();
            refreshFloatConsole();
        }
        function clearFloatConsoleFilter() {
            floatFilter = '';
            const inp = document.getElementById('floatConsoleFilter');
            if (inp) inp.value = '';
            refreshFloatConsole();
        }

        function toggleFloatConsole() {
            const con = document.getElementById('floatConsole');
            const toggle = document.getElementById('floatConsoleToggle');
            floatConsoleVisible = !floatConsoleVisible;
            con.style.display = floatConsoleVisible ? 'flex' : 'none';
            if (toggle) toggle.style.display = floatConsoleVisible ? 'none' : 'flex';
            if (floatConsoleVisible) {
                refreshFloatConsole();
                if (floatConsoleRefreshTimer) clearInterval(floatConsoleRefreshTimer);
                floatConsoleRefreshTimer = setInterval(refreshFloatConsole, 500);
            } else {
                clearInterval(floatConsoleRefreshTimer);
                floatConsoleRefreshTimer = null;
            }
        }

        // 页面加载即显示浮动控制台（默认展开在右下角，可拖动），方便调试（替代 F12）查看 [SKIN] 等日志
        (function initFloatConsoleOnLoad() {
            const con = document.getElementById('floatConsole');
            if (!con) return;
            const toggle = document.getElementById('floatConsoleToggle');
            floatConsoleVisible = true;
            con.style.display = 'flex';
            if (toggle) toggle.style.display = 'none';
            refreshFloatConsole();
            if (floatConsoleRefreshTimer) clearInterval(floatConsoleRefreshTimer);
            floatConsoleRefreshTimer = setInterval(refreshFloatConsole, 500);
        })();

        // 管理员开关：浮动控制台入口按钮显示/隐藏
        const CONSOLE_VISIBILITY_KEY = 'tdjl_consoleVisible';
        function toggleConsoleVisibility() {
            const current = localStorage.getItem(CONSOLE_VISIBILITY_KEY) === '1';
            const next = !current;
            localStorage.setItem(CONSOLE_VISIBILITY_KEY, next ? '1' : '0');
            applyConsoleVisibility(next);
            // 关闭面板，给用户反馈
            closeAdminPanel();
            console.log('[ADMIN] 浮动控制台已' + (next ? '开启' : '关闭'));
        }
        function applyConsoleVisibility(visible) {
            const btn = document.getElementById('floatConsoleToggle');
            const status = document.getElementById('consoleToggleStatus');
            // 开关控制浮窗显示/隐藏（可见性由 initFloatConsoleOnLoad 保证默认显示，此处负责开关真正生效）
            if (btn) btn.style.display = visible ? 'flex' : 'none';
            if (status) status.textContent = visible ? '已开启' : '已关闭';
            const con = document.getElementById('floatConsole');
            if (con) con.style.display = visible ? 'flex' : 'none';
            floatConsoleVisible = visible;
            if (visible) {
                refreshFloatConsole();
                if (floatConsoleRefreshTimer) clearInterval(floatConsoleRefreshTimer);
                floatConsoleRefreshTimer = setInterval(refreshFloatConsole, 500);
            } else {
                if (floatConsoleRefreshTimer) clearInterval(floatConsoleRefreshTimer);
                floatConsoleRefreshTimer = null;
            }
        }

        function floatConsoleClear() {
            window.__consoleLogs = [];
            refreshFloatConsole();
        }

        function floatConsoleCopy() {
            const logs = window.__consoleLogs || [];
            const text = logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg.replace(/\n/g,'\\n')}`).join('\n');
            if (!text) { alert('日志为空'); return; }
            navigator.clipboard.writeText(text).then(() => {
                console.log('[CONSOLE] 复制日志到剪贴板成功:', logs.length, '条');
            }).catch(e => {
                alert('复制失败: ' + e.message);
            });
        }

        function floatConsoleExport() {
            const logs = window.__consoleLogs || [];
            if (!logs.length) { alert('日志为空'); return; }
            const now = new Date();
            const pad = n => String(n).padStart(2,'0');
            const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            // 调用 app-local.js 中的导出函数（在 Tauri 环境写文件，浏览器环境弹出下载）
            if (typeof window.exportConsoleLogsToFile === 'function') {
                window.exportConsoleLogsToFile(logs, ts).then(r => {
                    console.log('[CONSOLE] 导出结果:', r);
                });
            } else {
                // 浏览器 fallback：下载为 .txt
                const text = logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg.replace(/\n/g,'\\n')}`).join('\n');
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `console-${ts}.log`;
                a.click();
                URL.revokeObjectURL(a.href);
            }
        }

        function toggleFloatAutoScroll() {
            floatAutoScroll = !floatAutoScroll;
            const btn = document.getElementById('floatAutoScrollBtn');
            const content = document.getElementById('floatConsoleContent');
            btn.textContent = floatAutoScroll ? '⬇' : '⏸';
            if (floatAutoScroll) { content.classList.add('auto-scroll'); }
            else { content.classList.remove('auto-scroll'); }
        }

        function refreshFloatConsole() {
            const content = document.getElementById('floatConsoleContent');
            if (!content) return;
            let logs = window.__consoleLogs || [];
            if (floatFilter) {
                const kw = floatFilter.toLowerCase();
                // 关键字同时匹配日志级别(error/warn/info)与内容，输入 error/err 即可过滤错误日志
                logs = logs.filter(l => (l.level && l.level.toLowerCase().indexOf(kw) !== -1) || (l.msg || '').toLowerCase().indexOf(kw) !== -1);
            }
            const badge = document.getElementById('floatConsoleBadge');
            const errCount = logs ? logs.filter(l => l.level === 'error').length : 0;
            if (badge) {
                if (errCount > 0) { badge.style.display = 'flex'; badge.textContent = errCount; badge.style.background = '#f44336'; }
                else if (logs && logs.length > 0) { badge.style.display = 'flex'; badge.textContent = logs.length; badge.style.background = '#00bcd4'; }
                else { badge.style.display = 'none'; }
            }
            if (!floatConsoleVisible) return;
            if (!logs || logs.length === 0) {
                content.innerHTML = '<div style="color:rgba(255,255,255,0.25);text-align:center;padding:20px;font-size:0.75rem;">暂无日志</div>';
                return;
            }
            const levelColors = { error: '#f44336', warn: '#ff9800', info: '#00bcd4', log: 'rgba(255,255,255,0.7)' };
            const prevScrollTop = content.scrollTop;
            const wasAtBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 50;
            // 最新日志在底部（logs 为时间顺序，直接顺序渲染），不再 reverse
            const items = logs.map((l, i) => {
                const color = levelColors[l.level] || 'rgba(255,255,255,0.6)';
                return '<div style="color:' + color + ';font-size:0.68rem;padding:1px 4px;border-bottom:1px solid rgba(255,255,255,0.02);line-height:1.35;">' +
                    '<span style="color:rgba(255,255,255,0.2);margin-right:5px;">' + (i + 1) + '</span>' +
                    '<span style="color:rgba(255,255,255,0.22);margin-right:5px;">' + l.time + '</span>' +
                    '<span style="font-weight:500;margin-right:3px;">[' + l.level.toUpperCase() + ']</span>' +
                    l.msg.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
            }).join('');
            content.innerHTML = items;
            if (floatAutoScroll && wasAtBottom) content.scrollTop = content.scrollHeight;
            else if (floatAutoScroll && prevScrollTop > 0) content.scrollTop = prevScrollTop;
        }

        // 拖拽（mouse/touch + setCapture/releaseCapture，WebView2 下最稳定）
        (function initFloatConsoleDrag() {
            const title = document.getElementById('floatConsoleTitle');
            const con = document.getElementById('floatConsole');
            if (!title || !con) return;
            const onStart = (cx, cy) => {
                const rect = con.getBoundingClientRect();
                floatDragState = { startX: cx, startY: cy, startLeft: rect.left, startTop: rect.top };
                title.style.cursor = 'grabbing';
            };
            const onMove = (cx, cy) => {
                if (!floatDragState) return;
                const dx = cx - floatDragState.startX;
                const dy = cy - floatDragState.startY;
                const newLeft = Math.max(0, Math.min(window.innerWidth - con.offsetWidth, floatDragState.startLeft + dx));
                const newTop = Math.max(0, Math.min(window.innerHeight - 30, floatDragState.startTop + dy));
                con.style.left = newLeft + 'px';
                con.style.right = 'auto';
                con.style.top = newTop + 'px';
                con.style.bottom = 'auto';
            };
            const onEnd = () => {
                if (!floatDragState) return;
                floatDragState = null;
                title.style.cursor = '';
                try { if (document.releaseCapture) document.releaseCapture(); } catch (_) {}
            };
            title.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                onStart(e.clientX, e.clientY);
                e.preventDefault();
                try { if (title.setCapture) title.setCapture(); } catch (_) {}
            });
            document.addEventListener('mousemove', (e) => { onMove(e.clientX, e.clientY); });
            document.addEventListener('mouseup', onEnd);
            title.addEventListener('touchstart', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                if (e.touches.length === 1) {
                    onStart(e.touches[0].clientX, e.touches[0].clientY);
                    e.preventDefault();
                }
            }, {passive: false});
            document.addEventListener('touchmove', (e) => {
                if (floatDragState && e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
            }, {passive: false});
            document.addEventListener('touchend', onEnd);
            document.addEventListener('touchcancel', onEnd);
        })();

        // 缩放（mouse/touch + setCapture/releaseCapture）
        (function initFloatConsoleResize() {
            const handle = document.getElementById('floatConsoleResize');
            const con = document.getElementById('floatConsole');
            if (!handle || !con) return;
            let resizeState = null;
            const onStart = (cx, cy) => {
                resizeState = { startX: cx, startY: cy, startW: con.offsetWidth, startH: con.offsetHeight };
                con.classList.add('resizing');
            };
            const onMove = (cx, cy) => {
                if (!resizeState) return;
                const dw = cx - resizeState.startX;
                const dh = cy - resizeState.startY;
                con.style.width = Math.max(320, Math.min(window.innerWidth - 20, resizeState.startW + dw)) + 'px';
                con.style.height = Math.max(200, Math.min(window.innerHeight - 30, resizeState.startH + dh)) + 'px';
            };
            const onEnd = () => {
                if (resizeState) {
                    resizeState = null;
                    con.classList.remove('resizing');
                    try { if (document.releaseCapture) document.releaseCapture(); } catch (_) {}
                }
            };
            handle.addEventListener('mousedown', (e) => {
                onStart(e.clientX, e.clientY);
                e.preventDefault();
                e.stopPropagation();
                try { if (handle.setCapture) handle.setCapture(); } catch (_) {}
            });
            document.addEventListener('mousemove', (e) => { onMove(e.clientX, e.clientY); });
            document.addEventListener('mouseup', onEnd);
            handle.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    onStart(e.touches[0].clientX, e.touches[0].clientY);
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, {passive: false});
            document.addEventListener('touchmove', (e) => {
                if (resizeState && e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
            }, {passive: false});
            document.addEventListener('touchend', onEnd);
            document.addEventListener('touchcancel', onEnd);
        })();

        // ==================== 缓存管理 ====================
        function viewCacheInfo() {
            const cacheInfo = [];
            let gistCacheCount = 0;
            let otherCacheCount = 0;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                
                if (key.toLowerCase().includes('gist') || key.includes('Index')) {
                    gistCacheCount++;
                    cacheInfo.push({
                        key: key,
                        value: value.length > 50 ? value.substring(0, 50) + '...' : value,
                        type: 'gist'
                    });
                } else if (key.startsWith('TFJL_')) {
                    otherCacheCount++;
                    cacheInfo.push({
                        key: key,
                        value: value.length > 50 ? value.substring(0, 50) + '...' : value,
                        type: 'other'
                    });
                }
            }
            
            let html = '';
            html += `<div style="color:#4ade80;margin-bottom:10px;">📊 Gist相关缓存: ${gistCacheCount} 项</div>`;
            html += `<div style="color:#60a5fa;margin-bottom:15px;">📊 其他TFJL缓存: ${otherCacheCount} 项</div>`;
            
            if (cacheInfo.length > 0) {
                html += '<div style="border-top:1px solid rgba(255,255,255,0.2);padding-top:10px;">';
                html += '<div style="color:rgba(255,255,255,0.7);margin-bottom:8px;">缓存详情：</div>';
                cacheInfo.forEach(item => {
                    const color = item.type === 'gist' ? '#4ade80' : '#60a5fa';
                    html += `<div style="margin-bottom:6px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;">`;
                    html += `<div style="color:${color};font-weight:500;">${item.key}</div>`;
                    html += `<div style="color:rgba(255,255,255,0.5);font-size:0.8rem;word-break:break-all;">${item.value}</div>`;
                    html += `</div>`;
                });
                html += '</div>';
            } else {
                html += '<div style="color:rgba(255,255,255,0.5);text-align:center;">暂无相关缓存</div>';
            }
            
            document.getElementById('cacheInfoList').innerHTML = html;
        }
        
        function clearGistCache() {
            if (!confirm('确定要清除所有 Gist 相关缓存吗？\n\n这将清除所有 Gist ID 缓存，系统会在下次访问时重新创建配置文件。')) {
                return;
            }
            
            let clearedCount = 0;
            const keysToRemove = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.toLowerCase().includes('gist') || key.includes('Index') || key.includes('gist_id')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                clearedCount++;
            });
            
            showCacheStatus(`✅ 已清除 ${clearedCount} 项 Gist 缓存`, 'success');
            viewCacheInfo();
            
            setTimeout(() => {
                if (confirm('缓存已清除！是否立即刷新页面？\n\n刷新后系统会重新创建配置文件。')) {
                    location.reload();
                }
            }, 500);
        }
        
        function clearAllCache() {
            if (!confirm('⚠️ 确定要清除所有本地缓存吗？\n\n这将清除所有本地存储的数据，包括：\n• Gist 配置缓存\n• 用户昵称\n• 统计数据缓存\n• 其他所有设置\n\n此操作不可恢复！')) {
                return;
            }

            const totalItems = localStorage.length;
            localStorage.clear();

            // 同时清空 CacheStorage（浏览器缓存 API）
            if (window.caches) {
                caches.keys().then(names => {
                    return Promise.all(names.map(n => caches.delete(n)));
                }).catch(() => {});
            }

            showCacheStatus(`✅ 已清除全部 ${totalItems} 项缓存`, 'success');
            document.getElementById('cacheInfoList').innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;">缓存已清空</div>';

            setTimeout(() => {
                if (confirm('所有缓存已清除！是否立即刷新页面？\n\n刷新后需要重新设置 Token。')) {
                    location.reload();
                }
            }, 500);
        }

        // 强制清除所有缓存（SW + CacheStorage + localStorage）+ 时间戳硬刷新
        // 用于测试：确保一定能拉到 GitHub Pages 最新代码
        async function forceClearAndHardRefresh() {
            if (!confirm('🔄 强制清除+硬刷新？\n\n将清除：\n• Service Worker 缓存\n• CacheStorage 全部缓存\n• localStorage 全部数据\n• 注销当前 SW\n\n然后带时间戳强刷，彻底绕过所有缓存。\n\n用于开发测试，普通用户请用「清除全部」即可。')) {
                return;
            }

            try {
                // 1. 通知 SW 清缓存
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage('CLEAR_CACHE');
                }
                // 2. 清空 CacheStorage
                if (window.caches) {
                    const names = await caches.keys();
                    await Promise.all(names.map(n => caches.delete(n)));
                }
                // 3. 清空 localStorage
                localStorage.clear();
                // 4. 注销 SW
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister()));
                }
            } catch (e) { console.warn('清除失败:', e); }

            showCacheStatus('✅ 全部清除完成，正在硬刷新...', 'success');
            setTimeout(() => {
                const url = new URL(location.href);
                url.searchParams.set('_t', Date.now());
                location.replace(url.toString());
            }, 800);
        }
        
        function showCacheStatus(message, type) {
            const statusDiv = document.getElementById('cacheManageStatus');
            const bgColor = type === 'success' ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)';
            const textColor = type === 'success' ? '#4ade80' : '#ef4444';
            statusDiv.innerHTML = `<div style="background:${bgColor};color:${textColor};padding:10px;border-radius:6px;text-align:center;">${message}</div>`;
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 5000);
        }

        function updateAdminTokenStatus() {
            const token = getGistToken();
            const tokenSection = document.getElementById('adminTokenSection');
            const tokenInput = document.getElementById('adminGistToken');
            const tokenStatus = document.getElementById('adminTokenStatus');

            if (token) {
                tokenInput.value = token;
                tokenStatus.innerHTML = '<span style="color:#4ade80;font-size:0.85rem;">✅ Token已配置（自动获取），可正常发布公告</span>';
            } else {
                tokenInput.value = '';
                tokenStatus.innerHTML = '<span style="color:#ef4444;font-size:0.85rem;">⚠️ 未检测到Token，请手动配置后才能发布公告</span>';
            }
        }
        // ==================== 房主管理功能 ====================
        async function openOwnerPanel() {
            const panel = document.getElementById('ownerPanel');
            const content = document.getElementById('ownerPanelContent');
            panel.style.display = 'flex';
            
            if (!currentChatRoom) {
                content.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">请先进入房间</div>';
                return;
            }
            
            content.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5);">验证权限中...</div>';
            
            try {
                const token = getGistToken();
                
                // 从索引文件获取房间信息
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const indexResponse = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
                    }
                });
                
                if (!indexResponse.ok) throw new Error('获取索引文件失败');
                
                const indexData = await indexResponse.json();
                const indexContent = indexData.files['room_index.json']?.content;
                if (!indexContent) throw new Error('索引文件内容为空');
                
                const index = JSON.parse(indexContent);
                const allowedRooms = index.allowedRooms || [];
                
                // 查找当前房间的房主
                const roomInfo = allowedRooms.find(r => {
                    const existingId = typeof r === 'string' ? r : r.id;
                    return existingId === currentChatRoom;
                });
                
                const owner = typeof roomInfo === 'object' ? (roomInfo.owner || '') : '';
                
                // 检查是否是房主
                if (!owner || currentChatNick !== owner) {
                    content.innerHTML = `
                        <div style="text-align:center;padding:20px;">
                            <div style="color:#ef4444;font-size:1.2rem;margin-bottom:10px;">❌ 权限不足</div>
                            <div style="color:rgba(255,255,255,0.6);font-size:0.85rem;">
                                当前房间: <strong style="color:#ffd700;">#${currentChatRoom}</strong><br>
                                房主: <strong style="color:#a78bfa;">${owner || '未设置'}</strong><br>
                                你的昵称: <strong style="color:#4ecdc4;">${currentChatNick}</strong>
                            </div>
                            <div style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin-top:15px;">
                                只有房主才能管理房间
                            </div>
                        </div>
                    `;
                    return;
                }
                
                // 显示房主管理界面
                content.innerHTML = `
                    <div style="background:rgba(167,139,250,0.1);border-radius:8px;padding:12px;margin-bottom:15px;">
                        <div style="color:#a78bfa;font-size:0.85rem;">
                            🏠 房间: <strong style="color:#ffd700;">#${currentChatRoom}</strong>
                            &nbsp;|&nbsp;
                            👤 房主: <strong style="color:#4ecdc4;">${currentChatNick}</strong>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <button onclick="ownerLoadProducts()" style="padding:12px;border-radius:8px;border:none;background:linear-gradient(135deg,#4ecdc4,#44a08d);color:white;cursor:pointer;font-size:0.9rem;font-weight:500;">
                            🏪 商品管理（下架商品）
                        </button>

                    </div>
                    <div id="ownerPanelSubContent" style="margin-top:15px;"></div>
                `;
                
            } catch (e) {
                content.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;">验证失败: ${e.message}</div>`;
            }
        }

        function closeOwnerPanel() {
            document.getElementById('ownerPanel').style.display = 'none';
        }

        async function ownerLoadProducts() {
            const container = document.getElementById('ownerPanelSubContent');
            container.innerHTML = '<div style="text-align:center;padding:15px;color:rgba(255,255,255,0.5);">加载商品中...</div>';
            
            try {
                const token = getGistToken();
                
                // 从索引文件获取房间的 Gist ID
                const indexUrl = `https://api.github.com/gists/${GIST_ID}`;
                const indexResponse = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
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
                        ...(token && { 'Authorization': `token ${token}` })
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
                } else if (allData.auctions) {
                    roomInfo = allData;
                }
                
                if (!roomInfo || !roomInfo.auctions || roomInfo.auctions.length === 0) {
                    container.innerHTML = '<div style="text-align:center;padding:15px;color:rgba(255,255,255,0.5);">暂无商品</div>';
                    return;
                }
                
                const now = Date.now();
                let html = '<div style="font-size:0.85rem;color:#ffd700;margin-bottom:10px;">商品列表：</div>';
                
                roomInfo.auctions.forEach((auction) => {
                    const isEnded = auction.status === 'ended' || now >= auction.endTime;
                    const qualityColor = getQualityColor(auction.quality);
                    
                    html += `
                        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div style="color:${qualityColor};font-weight:500;font-size:0.85rem;">#${auction.id} ${auction.quality || ''}·${auction.profession || ''}</div>
                                <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;">${auction.creator || '未知'} | ${isEnded ? '已结束' : '进行中'}</div>
                            </div>
                            <button onclick="ownerRemoveProduct('${auction.id}')" style="padding:6px 10px;border-radius:6px;border:none;background:#ef4444;color:white;cursor:pointer;font-size:0.75rem;">下架</button>
                        </div>
                    `;
                });
                
                container.innerHTML = html;
                
            } catch (e) {
                container.innerHTML = `<div style="text-align:center;padding:15px;color:#ef4444;">加载失败: ${e.message}</div>`;
            }
        }

        async function ownerRemoveProduct(auctionId) {
            if (!confirm(`确定要下架 #${auctionId} 吗？`)) return;
            
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
                } else if (allData.auctions) {
                    roomInfo = allData;
                }
                
                if (!roomInfo) throw new Error('房间数据格式错误');
                
                // 找到并移除商品
                const auctionIndex = roomInfo.auctions.findIndex(a => a.id === auctionId);
                if (auctionIndex === -1) throw new Error('商品不存在');
                
                // 删除商品图片
                const auction = roomInfo.auctions[auctionIndex];
                if (auction.imageGistId) {
                    try {
                        await fetch(`https://api.github.com/gists/${auction.imageGistId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `token ${token}` }
                        });
                    } catch (e) {}
                }
                
                roomInfo.auctions.splice(auctionIndex, 1);
                
                // 添加系统消息
                if (!roomInfo.messages) roomInfo.messages = [];
                roomInfo.messages.push({
                    id: 'msg_' + Date.now(),
                    author: '系统',
                    content: `⚠️ 房主下架了拍卖 #${auctionId}`,
                    time: Date.now()
                });
                
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
                
                alert(`✅ 商品 #${auctionId} 已下架！`);
                ownerLoadProducts();
                
            } catch (e) {
                alert('下架失败：' + e.message);
            }
        }



        function closeAdminPanel() {
            document.getElementById('adminPanelOverlay').style.display = 'none';
            // 清除 session 级别验证状态（关闭面板后下次进入需要重新验证）
            // 但如果 localStorage 有保存密码，openAdminPanel 会自动验证
            sessionStorage.removeItem(ADMIN_VERIFY_KEY);
            hideAdminStatus();
        }

        function logoutToLogin() {
            if (!confirm('确定要退出登录吗？')) return;
            
            // 清除所有登录相关状态（但保留记住的密码用于下次自动登录）
            localStorage.removeItem('TFJL_LoggedIn');
            localStorage.removeItem('TFJL_Mode');
            localStorage.removeItem('TFJL_AuctionOnlyMode');
            clearAuthOnDisk();   // 同步清磁盘登录标记，下次需重新输入密码
            
            // 隐藏主内容
            document.getElementById('mainContent').classList.remove('visible');
            
            // 显示登录界面
            document.getElementById('passwordOverlay').style.display = 'flex';
            
            // 完全重置登录界面
            document.getElementById('loginActions').style.display = 'none';
            document.getElementById('passwordInput').style.display = 'block';
            document.getElementById('passwordError').style.display = 'none';
            document.getElementById('passwordHint').textContent = '请输入访问密码';
            
            // 如果有记住的密码，自动填充
            const savedPwd = localStorage.getItem('TFJL_SavedPwd');
            if (savedPwd) {
                try {
                    const pwd = atob(savedPwd);
                    document.getElementById('passwordInput').value = pwd;
                    document.getElementById('passwordHint').textContent = '已记住密码，直接点击进入';
                } catch (e) {
                    localStorage.removeItem('TFJL_SavedPwd');
                }
            } else {
                document.getElementById('passwordInput').value = '';
            }
            
            // 确保记住密码复选框为勾选状态
            const rememberCb = document.getElementById('rememberPassword');
            if (rememberCb && savedPwd) rememberCb.checked = true;
            
            // 关闭所有其他面板
            closeAdminPanel();
            document.getElementById('chatRoomPanel').style.display = 'none';
            document.getElementById('chatRoomEntryModal').style.display = 'none';
            document.getElementById('referencePanel').style.display = 'none';
            document.getElementById('txtFilesPanel').style.display = 'none';
            document.getElementById('notepadPanel').style.display = 'none';
        }

        async function verifyAdmin() {
            const code = document.getElementById('adminVerifyCode').value.trim();
            if (await verifyPassword(code, ADMIN_VERIFY_HASH)) {
                sessionStorage.setItem(ADMIN_VERIFY_KEY, 'true');

                // 记住验证码：如果勾选了"记住验证码"，保存到 localStorage
                const rememberCb = document.getElementById('adminRememberCode');
                if (rememberCb && rememberCb.checked) {
                    try { localStorage.setItem('TFJL_Admin_SavedPwd', btoa(await hashPassword(code))); } catch (e) {}
                } else {
                    localStorage.removeItem('TFJL_Admin_SavedPwd');
                }

                document.getElementById('adminVerifySection').style.display = 'none';
                adminShowMenu();
                showAdminStatus('验证成功！', 'success');
            } else {
                showAdminStatus('验证码错误', 'error');
            }
        }

        function showAdminStatus(msg, type) {
            const el = document.getElementById('adminStatus');
            el.textContent = msg;
            el.className = 'admin-status ' + type;
            if (type === 'success') {
                setTimeout(() => { el.style.display = 'none'; el.className = 'admin-status'; }, 3000);
            }
        }

        function hideAdminStatus() {
            const el = document.getElementById('adminStatus');
            el.style.display = 'none';
            el.className = 'admin-status';
        }

        function loadCurrentNick() {
            const nick = localStorage.getItem('TFJL_UserName') || '未设置';
            const hasSet = localStorage.getItem('TFJL_HasSetNick') === 'true';
            document.getElementById('currentNickDisplay').value = nick + (hasSet ? ' (已锁定)' : '');
            document.getElementById('adminNewNickInput').value = nick !== '未设置' ? nick : '';
        }

        function resetCurrentNick() {
            const confirm = window.confirm('确定要重置当前设备的昵称设置吗？\n用户将可以重新设置一次昵称。');
            if (!confirm) return;
            
            localStorage.removeItem('TFJL_HasSetNick');
            persistNicknameToDisk(); // 同步更新磁盘记录
            showAdminStatus('昵称设置已重置！用户可以重新设置昵称了。', 'success');
            loadCurrentNick();
        }

        function setNickByAdmin() {
            const newNick = document.getElementById('adminNewNickInput').value.trim();
            if (!newNick) {
                showAdminStatus('请输入昵称！', 'error');
                return;
            }
            
            const confirm = window.confirm(`确定要将昵称修改为"${newNick}"吗？`);
            if (!confirm) return;
            
            localStorage.setItem('TFJL_UserName', newNick);
            localStorage.setItem('TFJL_HasSetNick', 'true');
            persistNicknameToDisk(); // 同步写入本地磁盘
            showAdminStatus(`昵称已修改为"${newNick}"！`, 'success');
            loadCurrentNick();
        }

        // ============== 全局用户注册表（增删改查） ==============
        // 缓存全量列表：搜索/改名/删除直接复用，避免每次按键都请求 gist
        async function renderNickRegistry() {
            const list = document.getElementById('nickRegistryList');
            if (!list) return;
            const q = (document.getElementById('nickSearchInput') ? document.getElementById('nickSearchInput').value.trim().toLowerCase() : '');
            if (!window._nickAllUsed) {
                list.innerHTML = '<div style="color:rgba(255,255,255,0.5);font-size:0.8rem;text-align:center;padding:10px;">加载中...</div>';
                window._nickAllUsed = await getUsedNicks();
            }
            const allUsed = window._nickAllUsed || [];
            if (!allUsed.length) {
                list.innerHTML = '<div style="color:rgba(255,255,255,0.5);font-size:0.8rem;text-align:center;padding:10px;">暂无注册用户</div>';
                return;
            }
            const used = allUsed.filter(function(n){ return !q || n.toLowerCase().indexOf(q) >= 0; });
            const cur = localStorage.getItem('TFJL_UserName');
            let html = '<div style="color:rgba(255,255,255,0.4);font-size:0.72rem;margin-bottom:6px;">共 ' + allUsed.length + ' 个用户' + (q ? '，匹配 ' + used.length + ' 个' : '') + '</div>';
            for (let i = 0; i < used.length; i++) {
                const n = used[i];
                const isCur = (n === cur);
                html += '<div style="display:flex;gap:8px;align-items:center;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;margin-bottom:6px;">'
                    + '<span style="flex:1;color:' + (isCur ? '#ffd700' : '#fff') + ';font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(n) + (isCur ? '（本机）' : '') + '</span>'
                    + '<button class="admin-btn admin-btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="adminRenameUser(' + i + ')">改</button>'
                    + '<button class="admin-btn" style="padding:4px 10px;font-size:0.75rem;background:linear-gradient(135deg,#f44336,#d32f2f);" onclick="adminDeleteUser(' + i + ')">删</button>'
                    + '</div>';
            }
            window._nickRegistryCache = used;
            list.innerHTML = html;
        }

        // 管理员新增用户（保留昵称，防止他人注册）
        async function adminAddUser() {
            const v = prompt('新增昵称（将保留该昵称，他人不可注册）：');
            if (!v) return;
            const name = v.trim();
            if (name.length < 2) { alert('昵称至少 2 个字'); return; }
            const used = await getUsedNicks();
            if (used.includes(name)) { alert('昵称 "' + name + '" 已存在'); return; }
            if (!confirm('确定新增昵称 "' + name + '"？')) return;
            used.push(name);
            const ok = await saveUsedNicks(used);
            if (!ok) { alert('保存失败，请确认是否已登录且有写入权限'); return; }
            window._nickAllUsed = used;
            renderNickRegistry();
            showAdminStatus('已新增昵称 "' + name + '"', 'success');
        }

        // 管理员重命名用户（同步需求墙署名）
        async function adminRenameUser(filteredIdx) {
            const used = window._nickRegistryCache || [];
            const oldName = used[filteredIdx];
            if (!oldName) return;
            const full = await getUsedNicks();
            const idx = full.indexOf(oldName);
            if (idx < 0) return;
            const newName = prompt('将昵称重命名为：', oldName);
            if (!newName) return;
            const v = newName.trim();
            if (v.length < 2) { alert('昵称至少 2 个字'); return; }
            if (full.includes(v)) { alert('昵称 "' + v + '" 已被使用'); return; }
            if (!confirm('确定将 "' + oldName + '" 重命名为 "' + v + '"？\n需求墙署名也会同步更新。')) return;
            full[idx] = v;
            wallMessages.forEach(function(m) { if (m.author === oldName) m.author = v; });
            await saveUsedNicks(full);
            await saveMessagesToGist();
            window._nickAllUsed = full;
            renderMessages();
            renderNickRegistry();
            showAdminStatus('已重命名为 "' + v + '"', 'success');
        }

        // 管理员删除用户（昵称释放可重注册；若为本机则清本地设置）
        async function adminDeleteUser(filteredIdx) {
            const used = window._nickRegistryCache || [];
            const name = used[filteredIdx];
            if (!name) return;
            if (!confirm('确定删除用户 "' + name + '"？\n删除后该昵称可被他人重新注册。')) return;
            const full = await getUsedNicks();
            const idx = full.indexOf(name);
            if (idx < 0) return;
            full.splice(idx, 1);
            await saveUsedNicks(full);
            if (localStorage.getItem('TFJL_UserName') === name) {
                localStorage.removeItem('TFJL_UserName');
                localStorage.removeItem('TFJL_HasSetNick');
                persistNicknameToDisk(); // 同步删除磁盘记录
                loadCurrentNick();
            }
            window._nickAllUsed = full;
            renderNickRegistry();
            showAdminStatus('已删除用户 "' + name + '"', 'success');
        }

        // ==================== 密码管理功能（管理员面板） ====================

        function loadPasswordList() {
            const passwords = getAdminPasswords();
            const listContainer = document.getElementById('passwordListDisplay');
            if (!listContainer) return;
            
            if (passwords.length === 0) {
                listContainer.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:10px;">暂无密码</div>';
                return;
            }
            
            let html = '';
            passwords.forEach((pwd, index) => {
                const isDefault = DEFAULT_PASSWORD_HASHES.includes(pwd);
                html += `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.1);">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="color:#ffd700;font-weight:bold;">${index + 1}.</span>
                            <span style="color:#fff;font-family:monospace;">${escapeHtml((pwd||'').length>10 ? pwd.substring(0,10)+'…' : pwd)}</span>
                            ${isDefault ? '<span style="background:#4caf50;color:#fff;font-size:0.7rem;padding:2px 6px;border-radius:4px;">初始</span>' : ''}
                        </div>
                        <div style="display:flex;gap:6px;">
                            <button onclick="editPassword(${index})" style="background:linear-gradient(135deg,#ff9800,#f57c00);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">✏️</button>
                            <button onclick="deletePassword(${index})" style="background:linear-gradient(135deg,#f44336,#d32f2f);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🗑️</button>
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = html;
        }

        async function editPassword(index) {
            const newPwd = prompt('请输入新密码：', '');
            if (!newPwd || newPwd.trim() === '') {
                showAdminStatus('密码不能为空！', 'error');
                return;
            }
            
            const trimmedPwd = newPwd.trim();
            if (trimmedPwd.length < 4) {
                showAdminStatus('密码长度至少4位！', 'error');
                return;
            }
            
            if (trimmedPwd === currentPwd) {
                showAdminStatus('新密码与原密码相同，无需修改！', 'error');
                return;
            }
            
            const passwords = getAdminPasswords();
            const newHash = await hashPassword(trimmedPwd);
            if (passwords.includes(newHash)) {
                showAdminStatus('该密码已存在！', 'error');
                return;
            }
            passwords[index] = newHash;
            localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(passwords));
            loadPasswordList();
            showAdminStatus('密码已修改！', 'success');
        }

        async function addPassword() {
            const newPwd = document.getElementById('newPasswordInput').value.trim();
            if (!newPwd) {
                showAdminStatus('请输入密码！', 'error');
                return;
            }
            
            if (newPwd.length < 4) {
                showAdminStatus('密码长度至少4位！', 'error');
                return;
            }
            
            const newHash = await hashPassword(newPwd);
            const passwords = getAdminPasswords();
            
            if (passwords.includes(newHash)) {
                showAdminStatus('该密码已存在！', 'error');
                return;
            }
            
            passwords.push(newHash);
            localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(passwords));
            document.getElementById('newPasswordInput').value = '';
            loadPasswordList();
            showAdminStatus('密码添加成功！', 'success');
        }

        function deletePassword(index) {
            const passwords = getAdminPasswords();
            const pwdToDelete = passwords[index];
            const _mask = (pwdToDelete||'').length>10 ? pwdToDelete.substring(0,10)+'…' : pwdToDelete;
            
            if (passwords.length <= 1) {
                showAdminStatus('至少需要保留一个密码！', 'error');
                return;
            }
            
            if (!confirm(`确定要删除密码"${_mask}"吗？`)) {
                return;
            }
            
            passwords.splice(index, 1);
            localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(passwords));
            loadPasswordList();
            showAdminStatus('密码已删除！', 'success');
        }

        // 获取公告Gist的URL（与用户端读取逻辑保持一致）
        async function getNewsGistUrl() {
            const token = getGistToken();

            // 1. 先从 localStorage 获取缓存的公告 Gist ID
            let newsGistId = localStorage.getItem('news_gist_id');

            // 2. 没有的话，从索引文件获取
            if (!newsGistId) {
                const indexUrl = await getIndexGistUrl();
                const indexResponse = await fetch(indexUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        ...(token && { 'Authorization': `token ${token}` })
                    }
                });

                if (indexResponse.ok) {
                    const indexData = await indexResponse.json();
                    if (indexData.files && indexData.files['room_index.json'] && indexData.files['room_index.json'].content) {
                        try {
                            const index = JSON.parse(indexData.files['room_index.json'].content);
                            if (index['news']) {
                                newsGistId = index['news'];
                                localStorage.setItem('news_gist_id', newsGistId);
                            }
                        } catch (e) {
                            console.warn('解析索引文件失败');
                        }
                    }
                }
            }

            // 3. 如果还是没有独立的公告 Gist，回退到索引 Gist
            const targetId = newsGistId || GIST_ID;
            return `https://api.github.com/gists/${targetId}`;
        }

        async function adminFetchNewsFromGist() {
            const token = getGistToken();
            const newsGistUrl = await getNewsGistUrl();
            const response = await fetch(newsGistUrl, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    ...(token && { 'Authorization': `token ${token}` })
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const content = data.files['news.json']?.content;
            if (content) {
                const parsed = JSON.parse(content);
                return parsed.data || [];
            }
            return [];
        }

        async function adminSaveNewsToGist(newsData) {
            const token = getGistToken();
            if (!token) throw new Error('未设置GitHub Token，请先在系统设置中配置');

            const fullData = {
                title: currentConfig.title || '',
                wechat: currentConfig.wechat || '',
                game: currentConfig.game || '',
                notice: currentConfig.notice || '',
                open: currentConfig.open !== undefined ? currentConfig.open : true,
                auctionNews: currentConfig.auctionNews !== undefined ? currentConfig.auctionNews : true,
                data: newsData
            };

            const newsGistUrl = await getNewsGistUrl();
            const response = await fetch(newsGistUrl, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                },
                body: JSON.stringify({
                    files: {
                        'news.json': {
                            content: JSON.stringify(fullData, null, 2)
                        }
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `保存失败 HTTP ${response.status}`);
            }
        }

        async function adminRefreshNews() {
            const listEl = document.getElementById('adminNewsList');
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">加载中...</div>';

            try {
                const newsData = await adminFetchNewsFromGist();
                newsItems = newsData;
                localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(newsItems));
                localStorage.setItem(NEWS_CACHE_TIME_KEY, new Date().toISOString());
                // 同时刷新拍卖快讯
                try {
                    const broadcasts = await fetchAuctionBroadcastsFromGist();
                    auctionBroadcastQueue = broadcasts;
                    updateMarqueeWithBroadcast();
                    renderAdminAuctionBroadcastList(broadcasts);
                } catch (e) {
                    console.warn('刷新拍卖快讯失败:', e);
                }
                initMarquee();
                renderAdminNewsList(newsData);
            } catch (error) {
                console.error('管理员获取公告失败:', error);
                const cachedNews = loadNewsFromCache();
                if (cachedNews && cachedNews.length > 0) {
                    newsItems = cachedNews;
                    renderAdminNewsList(cachedNews);
                    listEl.insertAdjacentHTML('afterbegin', '<div style="color:#f59e0b;text-align:center;padding:8px;font-size:0.8rem;">⚠️ 网络不可用，显示缓存数据</div>');
                } else {
                    newsItems = [...DEFAULT_NEWS];
                    renderAdminNewsList(newsItems);
                    listEl.insertAdjacentHTML('afterbegin', '<div style="color:#f59e0b;text-align:center;padding:8px;font-size:0.8rem;">⚠️ 网络不可用，显示默认公告</div>');
                }
            }
        }

        function renderAdminNewsList(newsData) {
            const listEl = document.getElementById('adminNewsList');

            if (!newsData || newsData.length === 0) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">暂无公告</div>';
                return;
            }

            listEl.innerHTML = newsData.map((item, index) => {
                const category = item.category || '未分类';
                const name = item.name || '无标题';
                const content = item.content || '';
                const author = item.author || '';
                const time = item.publish_time || '';
                const activeTime = item.active_time || '';
                const expireTime = item.expire_time || '';
                const isPermanent = item.permanent !== false;
                const now = new Date();
                const isExpired = expireTime && new Date(expireTime) <= now;
                const isPending = activeTime && new Date(activeTime) > now;
                let statusTag = '';
                if (isExpired) {
                    statusTag = '<span style="color:#ef4444;font-size:0.7rem;">⏰ 已过期</span>';
                } else if (isPending) {
                    statusTag = `<span style="color:#f59e0b;font-size:0.7rem;">⏳ ${activeTime.substring(0, 16)} 生效</span>`;
                } else if (isPermanent) {
                    statusTag = '<span style="color:#4ade80;font-size:0.7rem;">✅ 永久</span>';
                } else if (expireTime) {
                    statusTag = `<span style="color:#60a5fa;font-size:0.7rem;">✅ 至 ${expireTime.substring(0, 16)}</span>`;
                } else {
                    statusTag = '<span style="color:#4ade80;font-size:0.7rem;">✅ 已生效</span>';
                }

                return `
                    <div class="admin-news-item">
                        <div class="news-info">
                            <div class="news-title">[${category}] ${name}</div>
                            <div class="news-meta">${statusTag} ${author ? author + ' · ' : ''}${time ? time.substring(0, 16) : ''}</div>
                            <div class="news-content-preview">${content}</div>
                        </div>
                        <div class="news-actions">
                            <button class="admin-btn admin-btn-danger" onclick="adminDeleteNews(${index})" style="font-size:0.75rem;">删除</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function adminPublishNews() {
            const category = document.getElementById('adminNewsCategory').value;
            const name = document.getElementById('adminNewsName').value.trim();
            const content = document.getElementById('adminNewsContent').value.trim();
            const author = document.getElementById('adminNewsAuthor').value.trim() || '龙行';
            const activeTimeInput = document.getElementById('adminNewsActiveTime').value;
            const expireTimeInput = document.getElementById('adminNewsExpireTime').value;
            const isPermanent = document.getElementById('adminNewsPermanent').checked;

            if (!name) {
                showAdminStatus('请输入公告标题', 'error');
                return;
            }
            if (!content) {
                showAdminStatus('请输入公告内容', 'error');
                return;
            }

            try {
                const newsData = await adminFetchNewsFromGist();

                const now = new Date();
                const publishTime = now.getFullYear() + '-' +
                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                    String(now.getDate()).padStart(2, '0') + ' ' +
                    String(now.getHours()).padStart(2, '0') + ':' +
                    String(now.getMinutes()).padStart(2, '0') + ':' +
                    String(now.getSeconds()).padStart(2, '0');

                const newsItem = {
                    category: category,
                    name: name,
                    content: content,
                    author: author,
                    publish_time: publishTime,
                    permanent: isPermanent
                };

                if (activeTimeInput) {
                    newsItem.active_time = activeTimeInput.replace('T', ' ') + ':00';
                }
                if (expireTimeInput) {
                    newsItem.expire_time = expireTimeInput.replace('T', ' ') + ':00';
                }

                newsData.unshift(newsItem);

                await adminSaveNewsToGist(newsData);

                newsItems = newsData;
                localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(newsItems));
                localStorage.setItem(NEWS_CACHE_TIME_KEY, new Date().toISOString());
                initMarquee();

                document.getElementById('adminNewsName').value = '';
                document.getElementById('adminNewsContent').value = '';
                document.getElementById('adminNewsActiveTime').value = '';
                document.getElementById('adminNewsExpireTime').value = '';
                document.getElementById('adminNewsPermanent').checked = true;

                renderAdminNewsList(newsData);
                showAdminStatus('公告发布成功！', 'success');
            } catch (error) {
                console.error('发布公告失败:', error);
                showAdminStatus('发布失败: ' + error.message, 'error');
            }
        }

        async function adminDeleteNews(index) {
            if (!confirm('确定要删除这条公告吗？')) return;

            try {
                const newsData = await adminFetchNewsFromGist();

                if (index < 0 || index >= newsData.length) {
                    showAdminStatus('公告不存在', 'error');
                    return;
                }

                newsData.splice(index, 1);

                await adminSaveNewsToGist(newsData);

                newsItems = newsData;
                localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(newsItems));
                localStorage.setItem(NEWS_CACHE_TIME_KEY, new Date().toISOString());
                initMarquee();

                renderAdminNewsList(newsData);
                showAdminStatus('公告已删除', 'success');
            } catch (error) {
                console.error('删除公告失败:', error);
                showAdminStatus('删除失败: ' + error.message, 'error');
            }
        }

        // 管理员刷新拍卖快讯列表
        async function adminRefreshAuctionBroadcasts() {
            const listEl = document.getElementById('adminAuctionBroadcastList');
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">加载中...</div>';
            try {
                const broadcasts = await fetchAuctionBroadcastsFromGist();
                auctionBroadcastQueue = broadcasts;
                updateMarqueeWithBroadcast();
                renderAdminAuctionBroadcastList(broadcasts);
            } catch (error) {
                console.error('加载拍卖快讯失败:', error);
                listEl.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">加载失败: ' + error.message + '</div>';
            }
        }

        // 渲染管理员拍卖快讯列表
        function renderAdminAuctionBroadcastList(broadcasts) {
            const listEl = document.getElementById('adminAuctionBroadcastList');
            if (!broadcasts || broadcasts.length === 0) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">暂无拍卖快讯</div>';
                return;
            }
            listEl.innerHTML = broadcasts.map(item => {
                const dateStr = new Date(item.addedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                const timeAgo = Math.floor((Date.now() - item.addedAt) / 60000);
                const timeStr = timeAgo < 1 ? '刚刚' : timeAgo < 60 ? `${timeAgo}分钟前` : timeAgo < 1440 ? `${Math.floor(timeAgo / 60)}小时前` : `${Math.floor(timeAgo / 1440)}天前`;
                return `
                    <div class="admin-news-item" style="border-left:3px solid #ff6b6b;">
                        <div class="news-info">
                            <div class="news-title" style="color:#ff6b6b;">${item.text}</div>
                            <div class="news-meta">${timeStr} · ${dateStr}${item.roomId ? ' · 房间: ' + item.roomId : ''}</div>
                        </div>
                        <div class="news-actions">
                            <button class="admin-btn admin-btn-danger" onclick="adminDeleteAuctionBroadcast('${item.id}')" style="font-size:0.75rem;">删除</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 管理员清空所有拍卖快讯
        async function adminClearAllAuctionBroadcasts() {
            if (!confirm('确定要清空所有拍卖快讯吗？（不会影响拍卖行房间数据）')) return;
            try {
                auctionBroadcastQueue = [];
                updateMarqueeWithBroadcast();
                const token = getGistToken();
                if (!token) throw new Error('未设置GitHub Token');
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
                                content: '[]'
                            }
                        }
                    })
                });
                if (!response.ok) throw new Error('保存失败');
                showAdminStatus('所有拍卖快讯已清空', 'success');
                adminRefreshAuctionBroadcasts();
            } catch (error) {
                console.error('清空拍卖快讯失败:', error);
                showAdminStatus('清空失败: ' + error.message, 'error');
            }
        }

        function adminSaveGistToken() {
            const token = document.getElementById('adminGistToken').value.trim();
            if (!token) {
                showAdminStatus('请输入Token', 'error');
                return;
            }
            setGistToken(token);
            showAdminStatus('Token已保存', 'success');
        }

        async function adminTestGistToken() {
            const token = getGistToken();
            if (!token) {
                showAdminStatus('请先设置Token', 'error');
                return;
            }

            try {
                const response = await fetch(GIST_URL, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const hasNewsFile = !!data.files['news.json'];
                    const hasMessagesFile = !!data.files['messages.json'];
                    showAdminStatus(`连接成功！${hasNewsFile ? '✅ news.json' : '⚠️ 无news.json'} ${hasMessagesFile ? '✅ messages.json' : '⚠️ 无messages.json'}`, 'success');
                } else {
                    const errData = await response.json().catch(() => ({}));
                    showAdminStatus('连接失败: ' + (errData.message || `HTTP ${response.status}`), 'error');
                }
            } catch (error) {
                showAdminStatus('连接失败: ' + error.message, 'error');
            }
        }

        // 查看索引文件状态
        function adminGetIndexStatus() {
            const cachedId = localStorage.getItem(INDEX_GIST_ID_KEY);
            const hardcodedId = GIST_ID;
            const input = document.getElementById('adminIndexGistId');
            if (input) input.value = cachedId || '';
            
            let status = '';
            if (cachedId) {
                status += `✅ 缓存的索引ID: ${cachedId}\n`;
            } else {
                status += `⚠️ 无缓存的索引ID\n`;
            }
            status += `📄 代码中的索引ID: ${hardcodedId}\n`;
            
            if (cachedId && hardcodedId && cachedId !== hardcodedId) {
                status += `⚠️ 警告：缓存ID和代码ID不一致！`;
            }
            
            alert(status);
        }

        // 创建索引文件
        async function adminCreateIndexGist() {
            const token = getGistToken();
            if (!token) {
                showAdminStatus('请先设置Token', 'error');
                return;
            }

            if (!confirm('确定要创建新的索引文件吗？\n\n创建后需要将新ID更新到代码中，所有设备才能互通！')) {
                return;
            }

            try {
                showAdminStatus('正在创建索引文件...', 'info');
                
                const createResponse = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${token}`
                    },
                    body: JSON.stringify({
                        description: '房间索引文件（所有设备必须使用同一个！）',
                        public: false,
                        files: {
                            'room_index.json': {
                                content: JSON.stringify({}, null, 2)
                            }
                        }
                    })
                });

                if (createResponse.ok) {
                    const data = await createResponse.json();
                    const newId = data.id;
                    localStorage.setItem(INDEX_GIST_ID_KEY, newId);
                    
                    const input = document.getElementById('adminIndexGistId');
                    if (input) input.value = newId;
                    
                    showAdminStatus(`✅ 索引文件已创建！ID: ${newId}`, 'success');
                    alert(`✅ 索引文件创建成功！\n\n新索引ID: ${newId}\n\n⚠️ 重要：请将代码中的 GIST_ID 常量更新为这个新ID，\n确保所有设备使用同一个索引文件！`);
                } else {
                    const errData = await createResponse.json().catch(() => ({}));
                    throw new Error(errData.message || `HTTP ${createResponse.status}`);
                }
            } catch (error) {
                showAdminStatus('创建失败: ' + error.message, 'error');
            }
        }

        // 保存索引文件ID
        function adminSaveIndexGistId() {
            const input = document.getElementById('adminIndexGistId');
            if (!input) return;
            
            const newId = input.value.trim();
            if (!newId) {
                showAdminStatus('请输入索引文件ID', 'error');
                return;
            }
            
            localStorage.setItem(INDEX_GIST_ID_KEY, newId);
            showAdminStatus('✅ 索引ID已保存', 'success');
            alert(`✅ 索引ID已保存！\n\n请确保其他设备也使用这个ID: ${newId}`);
        }

        async function adminSaveTitle() {
            const newTitle = document.getElementById('adminTitleText').value.trim();
            if (!newTitle) {
                showAdminStatus('标题不能为空', 'error');
                return;
            }

            const btn = document.querySelector('.admin-btn-primary[onclick="adminSaveTitle()"]');
            const originalText = btn ? btn.textContent : '保存标题';
            if (btn) btn.textContent = '保存中...';

            try {
                const newsData = await adminFetchNewsFromGist();
                currentConfig.title = newTitle;

                const fullData = {
                    title: newTitle,
                    wechat: currentConfig.wechat || '',
                    game: currentConfig.game || '',
                    notice: currentConfig.notice || '',
                    open: currentConfig.open !== undefined ? currentConfig.open : true,
                    auctionNews: currentConfig.auctionNews !== undefined ? currentConfig.auctionNews : true,
                    data: newsData
                };

                const token = getGistToken();
                if (!token) throw new Error('未设置GitHub Token');

                const patchBody = JSON.stringify({
                    files: {
                        'news.json': {
                            content: JSON.stringify(fullData, null, 2)
                        }
                    }
                });
                const patchHeaders = {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${token}`
                };

                // 🔴 必须写「公告 Gist」——前台 fetchNewsFromGitHub() 读的就是它。
                // 旧代码错写成索引 GIST_URL，导致 Gist 里能看到新标题、但页面刷新后被公告 Gist 的旧值顶回去。
                const newsGistUrl = await getNewsGistUrl();
                const response = await fetch(newsGistUrl, {
                    method: 'PATCH',
                    headers: patchHeaders,
                    body: patchBody
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || `保存失败 HTTP ${response.status}`);
                }

                // 兜底：公告 Gist 与索引 Gist 不是同一个时，把索引 Gist 的 news.json 也刷成同一份，
                // 避免某些设备没拿到 news_gist_id 而回退读索引 Gist 时又看到旧标题。失败不影响主流程。
                if (newsGistUrl !== GIST_URL) {
                    try {
                        await fetch(GIST_URL, { method: 'PATCH', headers: patchHeaders, body: patchBody });
                    } catch (e) {
                        console.warn('同步索引Gist标题失败(不影响主流程):', e);
                    }
                }

                saveConfigToCache(currentConfig);

                const titleEl = document.getElementById('mainTitle');
                if (titleEl) titleEl.textContent = ' ' + newTitle + ' ';

                showAdminStatus('标题保存成功！', 'success');
                alert('✅ 标题保存成功！\n\n其他用户刷新页面即可看到新标题。');
            } catch (error) {
                console.error('保存标题失败:', error);
                showAdminStatus('保存失败: ' + error.message, 'error');
                alert('❌ 标题保存失败！\n\n错误信息：' + error.message + '\n\n请检查网络和Token是否正常。');
            } finally {
                if (btn) btn.textContent = originalText;
            }
        }

        function adminOpenChatRoom() {
            closeAdminPanel();
            openChatRoomEntry();
        }

        // ==================== 数据分析 ====================
        async function adminLoadAnalytics() {
            const content = document.getElementById('adminAnalyticsContent');
            content.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">📊 加载中...</div>';

            // 从 Gist 获取最新数据
            let data = null;
            try {
                data = await fetchCounterFromGist();
            } catch (e) {
                console.warn('获取统计数据失败:', e);
            }
            if (!data) data = counterData || getDefaultCounter();

            const today = getTodayString();
            const dailyStats = data.daily_stats || {};
            const sortedDates = Object.keys(dailyStats).sort();

            // 取最近30天，反转使"今天→以前"从左到右显示
            const recentDates = sortedDates.slice(-30).reverse();

            // 统计数据
            const totalVisits = data.total_visits || 0;
            const totalUsers = (data.unique_users || []).length;
            const todayStats = dailyStats[today] || { visits: 0, downloads: 0, new_users: 0, hourly_visits: new Array(24).fill(0) };
            const activeToday = (data.active_today_users || []).length;
            const onlineCount = Object.keys(data.online_users || {}).length;

            // 计算最近7天和30天的访问量、新用户数
            let last7Visits = 0, last7NewUsers = 0;
            let last30Visits = 0, last30NewUsers = 0;
            const last7Dates = sortedDates.slice(-7);
            recentDates.forEach(d => {
                const s = dailyStats[d];
                if (s) {
                    last30Visits += (s.visits || 0);
                    last30NewUsers += (s.new_users || 0);
                }
            });
            last7Dates.forEach(d => {
                const s = dailyStats[d];
                if (s) {
                    last7Visits += (s.visits || 0);
                    last7NewUsers += (s.new_users || 0);
                }
            });

            // 计算昨天和前天的访问量用于趋势
            const yesterdayIdx = sortedDates.length - 2;
            const yesterday = yesterdayIdx >= 0 ? sortedDates[yesterdayIdx] : null;
            const yesterdayVisits = yesterday ? (dailyStats[yesterday].visits || 0) : 0;
            const todayVisits = todayStats.visits || 0;
            const visitTrend = yesterdayVisits > 0 ? ((todayVisits - yesterdayVisits) / yesterdayVisits * 100) : 0;

            // 时段统计（汇总所有有数据的天数）
            const hourlyAgg = new Array(24).fill(0);
            recentDates.forEach(d => {
                const s = dailyStats[d];
                if (s && s.hourly_visits) {
                    for (let h = 0; h < 24; h++) {
                        hourlyAgg[h] += (s.hourly_visits[h] || 0);
                    }
                }
            });

            // 找出访问高峰时段
            let peakHour = 0, peakHourVal = 0;
            for (let h = 0; h < 24; h++) {
                if (hourlyAgg[h] > peakHourVal) { peakHourVal = hourlyAgg[h]; peakHour = h; }
            }

            // 构建 HTML
            let html = '';

            // 概览卡片
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px;">`;
            html += analyticsCard('累计访问次数', totalVisits, '🔵');
            html += analyticsCard('累计用户数', totalUsers, '🟢');
            html += analyticsCard('APP 注册用户', (counterData.sources && counterData.sources.app_users) || 0, '📱', '#1976d2');
            html += analyticsCard('网页 注册用户', (counterData.sources && counterData.sources.web_users) || 0, '🌐', '#00bcd4');
            html += analyticsCard('今日访问次数', todayVisits, `📈 ${visitTrend >= 0 ? '↑' : '↓'}${Math.abs(visitTrend).toFixed(0)}%`, visitTrend >= 0 ? '#4caf50' : '#ef4444');
            html += analyticsCard('今日新增用户', todayStats.new_users || 0, '🆕');
            html += analyticsCard('今日活跃用户', activeToday, '🔥');
            html += analyticsCard('当前在线用户', onlineCount, '⚡');
            html += `</div>`;

            // APP/网页 来源概览
            const totalAppVisits = (data.sources && data.sources.app_visits) || 0;
            const totalWebVisits = (data.sources && data.sources.web_visits) || 0;
            const todayAppVisits = todayStats.app_visits || 0;
            const todayWebVisits = todayStats.web_visits || 0;
            const activeApp = (data.active_today_app_users || []).length;
            const activeWeb = (data.active_today_web_users || []).length;
            html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px;">`;
            html += analyticsCard('累计 APP 访问', totalAppVisits, '📱', '#1976d2');
            html += analyticsCard('累计 网页 访问', totalWebVisits, '🌐', '#00bcd4');
            html += analyticsCard('今日 APP 访问', todayAppVisits, '📱', activeApp > 0 ? '#4ade80' : 'rgba(255,255,255,0.5)');
            html += analyticsCard('今日 网页 访问', todayWebVisits, '🌐', activeWeb > 0 ? '#4ade80' : 'rgba(255,255,255,0.5)');
            html += `</div>`;

            // 最近7天摘要
            let last7AppVisits = 0, last7WebVisits = 0;
            last7Dates.forEach(d => {
                const s = dailyStats[d];
                if (s) {
                    last7AppVisits += (s.app_visits || 0);
                    last7WebVisits += (s.web_visits || 0);
                }
            });
            html += `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:15px;margin-bottom:20px;">`;
            html += `<div style="color:#4ecdc4;font-size:0.9rem;margin-bottom:8px;">📋 近期摘要</div>`;
            html += `<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:0.85rem;">`;
            html += `<span>最近7天访问次数：<b style="color:#ffd700;">${last7Visits}</b> (APP: <span style="color:#1976d2;">${last7AppVisits}</span> / 网页: <span style="color:#00bcd4;">${last7WebVisits}</span>)</span>`;
            html += `<span>最近7天新增用户：<b style="color:#4caf50;">${last7NewUsers}</b></span>`;
            html += `<span>最近30天访问次数：<b style="color:#ffd700;">${last30Visits}</b></span>`;
            html += `<span>最近30天新增用户：<b style="color:#4caf50;">${last30NewUsers}</b></span>`;
            html += `</div></div>`;

            // 日访问趋势图（柱状图，含活跃用户折线，APP/网页 堆叠）
            if (recentDates.length > 0) {
                const maxVisits = Math.max(...recentDates.map(d => (dailyStats[d].visits || 0)), 1);
                const maxActive = Math.max(...recentDates.map(d => (dailyStats[d].active_users || 0)), 1);
                html += `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:15px;margin-bottom:20px;">`;
                html += `<div style="color:#4ecdc4;font-size:0.9rem;margin-bottom:15px;">📊 日访问趋势（最近${recentDates.length}天）【APP/网页】</div>`;
                html += `<div style="display:flex;align-items:flex-end;gap:2px;height:180px;overflow-x:auto;padding-bottom:25px;position:relative;border-bottom:1px solid rgba(255,255,255,0.1);">`;
                recentDates.forEach((d, idx) => {
                    const s = dailyStats[d];
                    const v = s.visits || 0;
                    const appV = s.app_visits || 0;
                    const webV = s.web_visits || 0;
                    const newU = s.new_users || 0;
                    const actU = s.active_users || 0;
                    const barH = Math.max((v / maxVisits) * 150, v > 0 ? 2 : 0);
                    const appBarH = barH > 0 ? Math.max((appV / Math.max(v,1)) * barH, 0) : 0;
                    const webBarH = barH - appBarH;
                    const actDotTop = 150 - Math.max((actU / maxActive) * 150, 0);
                    const dateLabel = d.substring(5);
                    const isToday = d === today;
                    html += `<div style="flex:0 0 24px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;" title="${d}\nAPP访问: ${appV}\n网页访问: ${webV}\n总访问: ${v}\n活跃用户: ${actU}">`;
                    html += `<div style="position:absolute;top:-16px;font-size:0.65rem;color:#ffd700;white-space:nowrap;">${v > 0 ? v : ''}</div>`;
                    html += `<div style="width:18px;border-radius:3px 3px 0 0;height:${barH}px;position:relative;overflow:hidden;">`;
                    // APP 部分（蓝色）
                    if (appBarH > 0) {
                        html += `<div style="position:absolute;bottom:${webBarH > 0 ? webBarH : 0}px;width:100%;background:linear-gradient(180deg,#1976d2,#0d47a1);height:${appBarH}px;border-radius:${webBarH > 0 ? '0' : '3px 3px 0 0'};"></div>`;
                    }
                    // 网页部分（青色）
                    if (webBarH > 0) {
                        html += `<div style="position:absolute;bottom:0;width:100%;background:linear-gradient(180deg,#00bcd4,#00838f);height:${webBarH}px;border-radius:${appBarH > 0 ? '0' : '3px 3px 0 0'};"></div>`;
                    }
                    html += `</div>`;
                    // 活跃用户折线点
                    if (actU > 0) {
                        html += `<div style="position:absolute;top:${actDotTop}px;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#ff9800;border-radius:50%;border:1px solid #fff;z-index:2;"></div>`;
                    }
                    html += `<div style="position:absolute;bottom:-20px;font-size:0.6rem;color:${isToday ? '#ffd700' : 'rgba(255,255,255,0.4)'};white-space:nowrap;">${dateLabel}</div>`;
                    html += `</div>`;
                });
                html += `</div>`;
                html += `<div style="display:flex;gap:15px;margin-top:10px;font-size:0.75rem;">`;
                html += `<span><span style="display:inline-block;width:12px;height:12px;background:#1976d2;border-radius:2px;vertical-align:middle;"></span> APP</span>`;
                html += `<span><span style="display:inline-block;width:12px;height:12px;background:#00bcd4;border-radius:2px;vertical-align:middle;"></span> 网页</span>`;
                html += `<span><span style="display:inline-block;width:8px;height:8px;background:#ff9800;border-radius:50%;vertical-align:middle;border:1px solid #fff;"></span> 活跃用户</span>`;
                html += `</div></div>`;
            }

            // 时段分布图
            const maxHourly = Math.max(...hourlyAgg, 1);
            html += `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:15px;margin-bottom:20px;">`;
            html += `<div style="color:#4ecdc4;font-size:0.9rem;margin-bottom:8px;">🕐 访问时段分布（最近${recentDates.length}天累计）</div>`;
            html += `<div style="color:rgba(255,255,255,0.5);font-size:0.8rem;margin-bottom:15px;">高峰时段: <b style="color:#ffd700;">${peakHour}:00-${peakHour + 1}:00</b> (共${peakHourVal}次访问)</div>`;
            html += `<div style="display:flex;align-items:flex-end;gap:1px;height:150px;padding-bottom:25px;position:relative;border-bottom:1px solid rgba(255,255,255,0.1);">`;
            for (let h = 0; h < 24; h++) {
                const v = hourlyAgg[h];
                const barH = Math.max((v / maxHourly) * 120, 1);
                const isPeak = h === peakHour;
                html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;" title="${h}:00 - ${h+1}:00\n访问: ${v}次">`;
                if (v > 0) {
                    html += `<div style="position:absolute;top:-14px;font-size:0.6rem;color:${isPeak ? '#ffd700' : 'rgba(255,255,255,0.4)'};white-space:nowrap;">${v}</div>`;
                }
                html += `<div style="width:80%;background:${isPeak ? 'linear-gradient(180deg,#ffd700,#ff9800)' : 'linear-gradient(180deg,#7c4dff,#512da8)'};border-radius:2px 2px 0 0;height:${barH}px;"></div>`;
                html += `<div style="position:absolute;bottom:-18px;font-size:0.55rem;color:rgba(255,255,255,0.4);">${h}</div>`;
                html += `</div>`;
            }
            html += `</div></div>`;

            // 今日时段分布图（仅当天）
            const todayHourly = todayStats.hourly_visits || new Array(24).fill(0);
            const todayHourlyTotal = todayHourly.reduce((a, b) => a + b, 0);
            const todayMaxHourly = Math.max(...todayHourly, 1);
            let todayPeakHour = 0, todayPeakVal = 0;
            for (let h = 0; h < 24; h++) {
                if (todayHourly[h] > todayPeakVal) { todayPeakVal = todayHourly[h]; todayPeakHour = h; }
            }
            html += `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:15px;margin-bottom:20px;">`;
            html += `<div style="display:flex;flex-direction:column;gap:8px;">`;
            html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
            html += `<span style="color:#ffd700;font-size:0.9rem;">📊 今日访问时段分布（${today}）</span>`;
            html += `<span style="color:rgba(255,255,255,0.5);font-size:0.75rem;">共 ${todayHourlyTotal} 次访问</span>`;
            html += `</div>`;
            if (todayHourlyTotal > 0) {
                html += `<div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">今日高峰: <b style="color:#ffd700;">${todayPeakHour}:00-${todayPeakHour + 1}:00</b> (${todayPeakVal}次)</div>`;
            }
            html += `</div>`;
            html += `<div style="display:flex;align-items:flex-end;gap:1px;height:120px;padding-bottom:22px;margin-top:12px;position:relative;border-bottom:1px solid rgba(255,255,255,0.1);">`;
            for (let h = 0; h < 24; h++) {
                const v = todayHourly[h];
                const barH = Math.max((v / todayMaxHourly) * 95, todayHourlyTotal > 0 ? 2 : 0);
                const isPeak = h === todayPeakHour && v > 0;
                html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;" title="${h}:00 - ${h+1}:00\n今日访问: ${v}次">`;
                if (v > 0) {
                    html += `<div style="position:absolute;top:-12px;font-size:0.6rem;color:${isPeak ? '#ffd700' : 'rgba(255,255,255,0.5)'};white-space:nowrap;">${v}</div>`;
                }
                html += `<div style="width:80%;background:${isPeak ? 'linear-gradient(180deg,#ffd700,#ff9800)' : 'linear-gradient(180deg,#4ecdc4,#26a69a)'};border-radius:2px 2px 0 0;height:${barH}px;"></div>`;
                html += `<div style="position:absolute;bottom:-16px;font-size:0.5rem;color:rgba(255,255,255,0.35);">${h}</div>`;
                html += `</div>`;
            }
            html += `</div>`;
            if (todayHourlyTotal === 0) {
                html += `<div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;padding:10px;">暂无今日时段数据，访问数据将逐步收集</div>`;
            }
            html += `</div>`;

            // 新用户日趋势图（柱状图，APP/网页 堆叠，最近→最旧）
            if (recentDates.length > 0) {
                const maxNewUsers = Math.max(...recentDates.map(d => (dailyStats[d].new_users || 0)), 1);
                html += `<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:15px;margin-bottom:20px;">`;
                html += `<div style="color:#4ecdc4;font-size:0.9rem;margin-bottom:15px;">🆕 新增用户趋势（最近${recentDates.length}天）【APP/网页】</div>`;
                html += `<div style="display:flex;align-items:flex-end;gap:2px;height:150px;overflow-x:auto;padding-bottom:25px;position:relative;border-bottom:1px solid rgba(255,255,255,0.1);">`;
                recentDates.forEach((d, idx) => {
                    const s = dailyStats[d];
                    const newU = s.new_users || 0;
                    const newApp = s.new_app_users || 0;
                    const newWeb = s.new_web_users || 0;
                    const barH = Math.max((newU / maxNewUsers) * 120, newU > 0 ? 2 : 0);
                    const appBarH = barH > 0 ? Math.max((newApp / Math.max(newU, 1)) * barH, 0) : 0;
                    const webBarH = barH - appBarH;
                    const dateLabel = d.substring(5);
                    const isToday = d === today;
                    html += `<div style="flex:0 0 24px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;" title="${d}\nAPP新增: ${newApp}\n网页新增: ${newWeb}\n总新增: ${newU}">`;
                    html += `<div style="position:absolute;top:-16px;font-size:0.65rem;color:#ffd700;white-space:nowrap;">${newU > 0 ? newU : ''}</div>`;
                    html += `<div style="width:18px;border-radius:3px 3px 0 0;height:${barH}px;position:relative;overflow:hidden;">`;
                    // APP 部分（蓝色）
                    if (appBarH > 0) {
                        html += `<div style="position:absolute;bottom:${webBarH > 0 ? webBarH : 0}px;width:100%;background:linear-gradient(180deg,#1976d2,#0d47a1);height:${appBarH}px;border-radius:${webBarH > 0 ? '0' : '3px 3px 0 0'};"></div>`;
                    }
                    // 网页部分（青色）
                    if (webBarH > 0) {
                        html += `<div style="position:absolute;bottom:0;width:100%;background:linear-gradient(180deg,#4caf50,#2e7d32);height:${webBarH}px;border-radius:${appBarH > 0 ? '0' : '3px 3px 0 0'};"></div>`;
                    }
                    html += `</div>`;
                    html += `<div style="position:absolute;bottom:-20px;font-size:0.6rem;color:${isToday ? '#ffd700' : 'rgba(255,255,255,0.4)'};white-space:nowrap;">${dateLabel}</div>`;
                    html += `</div>`;
                });
                html += `</div>`;
                html += `<div style="display:flex;gap:15px;margin-top:10px;font-size:0.75rem;">`;
                html += `<span><span style="display:inline-block;width:12px;height:12px;background:#1976d2;border-radius:2px;vertical-align:middle;"></span> APP 新增</span>`;
                html += `<span><span style="display:inline-block;width:12px;height:12px;background:#4caf50;border-radius:2px;vertical-align:middle;"></span> 网页 新增</span>`;
                html += `</div></div>`;
            }

            // 数据更新时间
            html += `<div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;padding:10px;">最后更新: ${data.last_updated || '未知'}</div>`;

            content.innerHTML = html;
        }

        function analyticsCard(label, value, icon, trendColor) {
            const color = trendColor || '#ffd700';
            return `<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:12px;text-align:center;">
                <div style="font-size:1.2rem;">${typeof icon === 'string' && icon.length > 2 ? icon : '📊'}</div>
                <div style="color:${color};font-size:1.3rem;font-weight:bold;margin:4px 0;">${value}</div>
                <div style="color:rgba(255,255,255,0.5);font-size:0.75rem;">${label}</div>
            </div>`;
        }

        function adminLoadStats() {
            const content = document.getElementById('adminStatsContent');

            if (!counterData) {
                content.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:30px;">暂无统计数据，请稍后再试</div>';
                return;
            }

            const today = getTodayString();
            const todayStats = counterData.daily_stats[today] || { visits: 0, downloads: 0, new_users: 0 };
            const pendingCount = loadPendingSync().length;
            const totalUsers = counterData.total_users || 0;
            const activeToday = counterData.active_today || 0;

            let onlineCount = 0;
            if (counterData.online_users) {
                const now = Date.now();
                const timeout = counterData.online_timeout || 3600000;
                for (const id in counterData.online_users) {
                    if (now - counterData.online_users[id] <= timeout) {
                        onlineCount++;
                    }
                }
            }
            const onlineTimeoutMinutes = Math.round((counterData.online_timeout || 3600000) / 60000);

            // 计算本周/本月新增用户
            const now = new Date();
            const todayNew = todayStats.new_users || 0;
            let weekNew = 0;
            let monthNew = 0;
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            const monthAgo = new Date(now);
            monthAgo.setDate(monthAgo.getDate() - 30);
            if (counterData.daily_stats) {
                for (const date in counterData.daily_stats) {
                    const d = new Date(date);
                    const nu = counterData.daily_stats[date].new_users || 0;
                    if (d >= weekAgo) weekNew += nu;
                    if (d >= monthAgo) monthNew += nu;
                }
            }

            content.innerHTML = `
                <div class="admin-section">
                    ${pendingCount > 0 ? `<div style="color:#ff9800;margin-bottom:10px;">⚠️ 有 ${pendingCount} 条数据等待同步</div>` : ''}
                    <h3 style="color:#4ecdc4;">📈 总计数据</h3>
                    <div style="padding-left:20px;line-height:2;">
                        <div>• 累计访问次数：<span style="color:#ffd700;">${counterData.total_visits}</span></div>
                        <div>• 累计 APP 访问次数：<span style="color:#1976d2;">${(counterData.sources && counterData.sources.app_visits) || 0}</span>  |  累计 网页 访问次数：<span style="color:#00bcd4;">${(counterData.sources && counterData.sources.web_visits) || 0}</span></div>
                        <div>• 累计用户数：<span style="color:#ffd700;">${totalUsers}</span></div>
                        <div>• APP 注册用户：<span style="color:#1976d2;">${(counterData.sources && counterData.sources.app_users) || 0}</span>  |  网页 注册用户：<span style="color:#00bcd4;">${(counterData.sources && counterData.sources.web_users) || 0}</span> <span style="color:rgba(255,255,255,0.3);font-size:0.8rem;">(首次访问时所在的平台)</span></div>
                        <div>• 当前在线用户：<span style="color:#4ade80;">${onlineCount}</span> <span style="color:rgba(255,255,255,0.35);font-size:0.8rem;">(${onlineTimeoutMinutes}分钟内活跃)</span></div>
                        <div>• 今日活跃用户：<span style="color:#4ade80;">${activeToday}</span> <span style="font-size:0.8rem;">(APP: <span style="color:#1976d2;">${(counterData.active_today_app_users || []).length}</span> / 网页: <span style="color:#00bcd4;">${(counterData.active_today_web_users || []).length}</span>)</div>
                        <div>• 累计下载次数：<span style="color:#ffd700;">${counterData.total_downloads}</span></div>
                    </div>
                </div>
                <div class="admin-section">
                    <h3 style="color:#4ade80;">🆕 新增用户</h3>
                    <div style="padding-left:20px;line-height:2;">
                        <div>• 今日新增用户：<span style="color:#4ade80;">${todayNew}</span> <span style="font-size:0.8rem;">(APP: <span style="color:#1976d2;">${todayStats.new_app_users || 0}</span> / 网页: <span style="color:#00bcd4;">${todayStats.new_web_users || 0}</span>)</span></div>
                        <div>• 本周新增用户：<span style="color:#60a5fa;">${weekNew}</span></div>
                        <div>• 本月新增用户：<span style="color:#a78bfa;">${monthNew}</span></div>
                    </div>
                </div>
                <div class="admin-section">
                    <h3 style="color:#4ecdc4;">📅 今日数据 (${today})</h3>
                    <div style="padding-left:20px;line-height:2;">
                        <div>• 今日访问次数：<span style="color:#ffd700;">${todayStats.visits}</span> (APP: <span style="color:#1976d2;">${todayStats.app_visits || 0}</span> / 网页: <span style="color:#00bcd4;">${todayStats.web_visits || 0}</span>)</div>
                        <div>• 今日下载次数：<span style="color:#ffd700;">${todayStats.downloads}</span></div>
                    </div>
                </div>
                <div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;margin-top:10px;">最后更新：${counterData.last_updated || '未知'}</div>
            `;
        }

        // 加载脚本下载统计
        async function adminLoadScriptStats() {
            const content = document.getElementById('adminScriptStatsContent');
            content.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:20px;">加载中...</div>';

            // 先从Gist获取最新统计数据
            try {
            const fresh = await fetchCounterFromGist();
            if (fresh) {
                counterData = fresh;
                saveCounterToCache(counterData);
            } else if (!counterData) {
                // Gist 获取失败时回退本地缓存，避免瞬时网络问题把统计显示成"全都没有了"
                counterData = loadCounterFromCache();
            }
            } catch (e) {
                console.warn('获取最新统计失败，使用本地缓存:', e);
            }

            if (!counterData) {
                content.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:30px;">暂无统计数据</div>';
                return;
            }

            const scriptDownloads = counterData.script_downloads || {};
            const scriptNames = Object.keys(scriptDownloads);

            if (scriptNames.length === 0) {
                content.innerHTML = `
                    <div style="color:rgba(255,255,255,0.4);text-align:center;padding:30px;">
                        暂无脚本下载记录<br>
                        <span style="font-size:0.8rem;">（用户下载脚本后会自动统计）</span>
                    </div>
                `;
                return;
            }

            // 按下载次数排序
            const sortedScripts = scriptNames.sort((a, b) => scriptDownloads[b] - scriptDownloads[a]);

            // 计算总下载次数（用于验证）
            const totalFromScripts = sortedScripts.reduce((sum, name) => sum + scriptDownloads[name], 0);

            let html = `
                <div style="background:rgba(255,215,0,0.1);border-radius:8px;padding:12px;margin-bottom:15px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:#ffd700;font-weight:500;">📊 统计概览</span>
                        <span style="color:#4ade80;">共 ${sortedScripts.length} 个脚本 | 总下载 ${totalFromScripts} 次</span>
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                    <thead>
                        <tr style="background:rgba(79,195,247,0.15);">
                            <th style="padding:8px;text-align:left;color:#4fc3f7;border-bottom:1px solid rgba(79,195,247,0.3);">排名</th>
                            <th style="padding:8px;text-align:left;color:#4fc3f7;border-bottom:1px solid rgba(79,195,247,0.3);">脚本名称</th>
                            <th style="padding:8px;text-align:right;color:#4fc3f7;border-bottom:1px solid rgba(79,195,247,0.3);">下载次数</th>
                            <th style="padding:8px;text-align:right;color:#4fc3f7;border-bottom:1px solid rgba(79,195,247,0.3);">占比</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            sortedScripts.forEach((name, index) => {
                const count = scriptDownloads[name];
                const percent = totalFromScripts > 0 ? ((count / totalFromScripts) * 100).toFixed(1) : 0;
                const rankColor = index === 0 ? '#ffd700' : (index < 3 ? '#4ade80' : 'rgba(255,255,255,0.7)');
                const barWidth = Math.min(100, (count / (sortedScripts[0] ? scriptDownloads[sortedScripts[0]] : 1)) * 100);

                html += `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                        <td style="padding:8px;color:${rankColor};font-weight:${index < 3 ? 'bold' : 'normal'};">${index + 1}</td>
                        <td style="padding:8px;color:rgba(255,255,255,0.85);max-width:200px;overflow:hidden;text-overflow:ellipsis;">
                            ${name}
                            <div style="height:4px;background:rgba(79,195,247,0.2);border-radius:2px;margin-top:4px;overflow:hidden;">
                                <div style="height:100%;width:${barWidth}%;background:linear-gradient(90deg,#4fc3f7,#4ade80);border-radius:2px;"></div>
                            </div>
                        </td>
                        <td style="padding:8px;text-align:right;color:#ffd700;font-weight:500;">${count}</td>
                        <td style="padding:8px;text-align:right;color:rgba(255,255,255,0.5);">${percent}%</td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
                <div style="color:rgba(255,255,255,0.3);font-size:0.75rem;text-align:center;margin-top:15px;">
                    最后更新：${counterData.last_updated || '未知'}
                </div>
            `;

            content.innerHTML = html;
        }

        // ==================== 启动加载动画控制 ====================
        // 进度条模拟（0→85%随机推进），window.onload完成后跳到100%并淡出
        // 3秒硬限制：不管加载是否完成，3秒后强制结束动画
        (function() {
            var bar = document.getElementById('loadingProgressBar');
            var progress = 0;
            var done = false;
            var timer = setInterval(function() {
                if (progress < 85) {
                    progress += Math.random() * 12 + 3;
                    if (progress > 85) progress = 85;
                    bar.style.width = progress + '%';
                }
            }, 300);
            window._hideLoadingScreen = function() {
                if (done) return; done = true;
                clearInterval(timer);
                clearTimeout(hardLimit);
                bar.style.width = '100%';
                // 标记非首次启动，后续跳过动画
                try { localStorage['TFJL_NotFirst'] = '1'; } catch(e) {}
                var screen = document.getElementById('appLoadingScreen');
                if (screen) {
                    screen.style.opacity = '0';
                    setTimeout(function() {
                        screen.style.display = 'none';
                        screen.remove();
                    }, 600);
                }
            };
            // 3秒硬限制：避免网络慢/代理慢导致动画一直转圈
            var hardLimit = setTimeout(function() {
                if (!done) window._hideLoadingScreen();
            }, 3000);
            // 页面加载完成后触发隐藏
            window.addEventListener('load', function() {
                window._hideLoadingScreen();
            });
        })();
    