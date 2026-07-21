// ============================================================
// APP本地存储功能（仅Tauri APP可用，网页版不加载此文件）
// 通过 Tauri IPC invoke 调用 Rust 命令（支持远程URL）
// ============================================================

// 检测是否在Tauri APP中运行
// Tauri注入了 window.__TAURI_INTERNALS__（含invoke），以及我们注入的 __TAURI_APP__ 标记
const isTauriApp = (typeof window.__TAURI_INTERNALS__ !== 'undefined') ||
                    (typeof window.__TAURI__ !== 'undefined') ||
                    navigator.userAgent.includes('Tauri');

if (isTauriApp) {
    // 老马5个固定目录配置
    let maDirs = {
        coop:       '',  // 合作脚本目录
        activity:   '',  // 活动脚本目录
        battle:     '',  // 对战目录（JSON）
        battleMax:  '',  // 对战MAX目录（TXT）
        screenshot: ''   // 截图目录（统计每天打多少局）
    };

    let softwareDataDir = '';
    let scannedFiles = [];

    // ==================== IPC 调用封装 ====================
    // 通过 window.__TAURI_INTERNALS__.invoke 调用Rust命令

    async function tauriInvoke(cmd, args = {}) {
        try {
            // Tauri v2 的 invoke 在 __TAURI_INTERNALS__ 中
            let invokeFn = null;
            if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
                invokeFn = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
            } else if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                invokeFn = window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
            }
            if (!invokeFn) {
                console.error('[APP] 未找到 invoke 函数。__TAURI_INTERNALS__:', !!window.__TAURI_INTERNALS__, 
                    'keys:', window.__TAURI_INTERNALS__ ? Object.keys(window.__TAURI_INTERNALS__) : 'N/A');
                alert('[调试] 未找到Tauri invoke函数\n__TAURI_INTERNALS__存在: ' + !!window.__TAURI_INTERNALS__ + 
                    '\nkeys: ' + (window.__TAURI_INTERNALS__ ? Object.keys(window.__TAURI_INTERNALS__).join(', ') : 'N/A'));
                return null;
            }
            return await invokeFn(cmd, args);
        } catch (e) {
            console.error('[APP] invoke 失败:', cmd, e);
            alert('[调试] invoke调用失败: ' + cmd + '\n错误: ' + (e.message || e));
            return null;
        }
    }

    // ==================== 文件操作封装 ====================
    // 命令名和 Rust 函数名一致（snake_case，Tauri v2 不会自动转换）

    async function openFileDialog() {
        const result = await tauriInvoke('open_directory_dialog');
        return result;
    }

    async function readDir(dirPath) {
        const result = await tauriInvoke('read_directory', { dirPath });
        return result || [];
    }

    async function readTextFile(filePath) {
        const result = await tauriInvoke('read_text_file', { filePath });
        return result;
    }

    async function writeTextFile(filePath, content) {
        // Tauri v2 中 Result<(), String> 的 Ok(()) 序列化为 null
        // tauriInvoke 在成功时返回 null，失败时 catch 也返回 null（但会弹 debug alert）
        // 因此通过 try/catch 直接判断，不依赖返回值
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return false;
        try {
            await invokeFn('write_text_file', { filePath, content });
            return true;
        } catch (e) {
            console.error('写入文件失败:', filePath, e);
            return false;
        }
    }

    async function deleteFile(filePath) {
        const result = await tauriInvoke('delete_file', { filePath });
        return result === null ? false : true;
    }

    async function renameLocalFile(oldPath, newPath) {
        try {
            await tauriInvoke('rename_file', { oldPath, newPath });
            return true;
        } catch (e) {
            console.error('重命名失败:', e);
            return false;
        }
    }

    async function getAppVersion() {
        try {
            return await tauriInvoke('get_app_version', {});
        } catch (e) {
            console.error('获取版本失败:', e);
            return null;
        }
    }

    // ==================== 配置管理 ====================

    function loadConfig() {
        try {
            const saved = localStorage.getItem('maDirsConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                maDirs = { ...maDirs, ...parsed.maDirs };
                softwareDataDir = parsed.softwareDataDir || '';
            }
        } catch (e) {}
    }

    function saveConfig() {
        localStorage.setItem('maDirsConfig', JSON.stringify({ maDirs, softwareDataDir }));
    }

    // ==================== 初始化 ====================

    async function initAppLocal() {
        const btn = document.getElementById('appLocalSettingsBtn');
        if (btn) btn.style.display = 'flex';
        loadConfig();
        console.log('[APP] APP本地功能已初始化, isTauriApp:', isTauriApp);
    }

    // ==================== 设置面板 ====================

    function openAppLocalSettings() {
        if (!isTauriApp) return;
        showSettingsModal();
        fillSettingsForm();
        scanAllFiles();
    }

    function closeAppLocalSettings() {
        const modal = document.getElementById('appLocalSettingsModal');
        if (modal) modal.remove();
    }

    function showSettingsModal() {
        let modal = document.getElementById('appLocalSettingsModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'appLocalSettingsModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(156,39,176,0.5);border-radius:12px;padding:24px;width:650px;max-width:90vw;max-height:85vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="color:#fff;margin:0;font-size:1.2rem;">📁 APP本地设置</h3>
                    <button onclick="closeAppLocalSettings()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:1.2rem;">×</button>
                </div>

                <div style="color:#00bcd4;font-size:0.9rem;margin-bottom:12px;">📂 老马脚本目录配置</div>

                <div style="margin-bottom:12px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">合作脚本目录（寒冰/暗月/合作/漩涡/深海）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_coop" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('coop')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">活动脚本目录（活动+隐藏榜）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_activity" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('activity')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">对战目录（JSON）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_battle" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('battle')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">对战MAX目录（TXT）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_battleMax" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('battleMax')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">截图目录（按日期子文件夹，统计每天打多少局）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_screenshot" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('screenshot')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="color:#4caf50;font-size:0.9rem;margin-bottom:12px;">💾 软件数据目录（项目存储位置）</div>
                <div style="margin-bottom:20px;">
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="softwareDataDirInput" readonly placeholder="未设置，默认使用APP安装目录" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectSoftwareDataDir()" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="color:#ffd700;font-size:0.9rem;">📋 扫描到的脚本文件</label>
                        <button onclick="scanAllFiles()" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔄 刷新扫描</button>
                    </div>
                    <div id="scannedFileList" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;min-height:60px;max-height:250px;overflow:auto;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">扫描中...</div>
                    </div>
                    <div id="fuzzyStatsArea" style="margin-top:8px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px;min-height:24px;"></div>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="color:#e040fb;font-size:0.9rem;">🚗 车主副本开车统计（按截图数统计每天打多少局）</label>
                        <button onclick="calcScreenshotStats()" style="background:linear-gradient(135deg,#9c27b0,#6a1b9a);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📊 统计</button>
                    </div>
                    <div id="screenshotStats" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;min-height:60px;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">配置截图目录后点击统计</div>
                    </div>
                </div>

                <div style="background:rgba(33,150,243,0.08);border:1px solid rgba(33,150,243,0.2);border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="color:#4fc3f7;font-size:0.9rem;font-weight:bold;">ℹ️ 当前版本: v<span id="appSettingsVersion">1.1.5</span></div>
                        <div style="color:rgba(255,255,255,0.4);font-size:0.72rem;margin-top:2px;">需要更新时，请下载新安装包重新安装</div>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button onclick="window.openDownloadModal()" style="background:rgba(33,150,243,0.15);color:#4fc3f7;border:1px solid rgba(33,150,243,0.3);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;">📥 下载</button>
                        <button onclick="window.checkForUpdates()" style="background:rgba(76,175,80,0.15);color:#81c784;border:1px solid rgba(76,175,80,0.3);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;white-space:nowrap;">🔄 检查更新</button>
                    </div>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="saveSettingsAndClose()" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:0.9rem;">💾 保存设置</button>
                    <button onclick="closeAppLocalSettings()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:0.9rem;">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function fillSettingsForm() {
        document.getElementById('maDir_coop').value = maDirs.coop || '';
        document.getElementById('maDir_activity').value = maDirs.activity || '';
        document.getElementById('maDir_battle').value = maDirs.battle || '';
        document.getElementById('maDir_battleMax').value = maDirs.battleMax || '';
        document.getElementById('maDir_screenshot').value = maDirs.screenshot || '';
        document.getElementById('softwareDataDirInput').value = softwareDataDir || '';
    }

    async function selectMaDir(key) {
        const selected = await openFileDialog();
        if (selected) {
            maDirs[key] = selected;
            document.getElementById('maDir_' + key).value = selected;
            scanAllFiles();
        }
    }

    async function selectSoftwareDataDir() {
        const selected = await openFileDialog();
        if (selected) {
            softwareDataDir = selected;
            document.getElementById('softwareDataDirInput').value = selected;
        }
    }

    // ==================== 文件扫描 ====================

    // 递归扫描目录（最大深度3层），收集所有 txt/json 文件
    async function collectFilesRecursive(dirPath, dirKey, dirLabel, maxDepth) {
        if (maxDepth === undefined) maxDepth = 3;
        const files = [];
        if (maxDepth <= 0) return files;
        try {
            const entries = await readDir(dirPath);
            for (const entry of entries) {
                if (entry.is_file) {
                    const ext = entry.name.split('.').pop().toLowerCase();
                    if (ext === 'txt' || ext === 'json') {
                        files.push({
                            name: entry.name,
                            path: entry.path,
                            dir: dirPath,
                            dirKey,
                            dirLabel,
                            ext,
                            category: classifyFile(entry.name)
                        });
                    }
                } else {
                    // 递归扫描子文件夹
                    const subFiles = await collectFilesRecursive(entry.path, dirKey, dirLabel, maxDepth - 1);
                    files.push(...subFiles);
                }
            }
        } catch (e) {
            console.warn('扫描目录失败:', dirPath, e);
        }
        return files;
    }

    // 计算脚本模糊分类统计
    function calcFuzzyStats(files) {
        const keywords = ['寒冰', '暗月', '漩涡', '合作', '深海', '活动'];
        const stats = {};
        keywords.forEach(k => { stats[k] = 0; });
        stats['其他'] = 0;

        for (const f of files) {
            let matched = false;
            for (const kw of keywords) {
                if (f.name.includes(kw)) {
                    stats[kw]++;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                stats['其他']++;
            }
        }
        // 如果"其他"为0则不显示
        if (stats['其他'] === 0) delete stats['其他'];
        // 移除计数为0的关键词
        keywords.forEach(k => { if (stats[k] === 0) delete stats[k]; });
        return stats;
    }

    // 单文件分类（用于给扫描文件打 category 标签）
    function classifyFile(fileName) {
        const nameLower = fileName.toLowerCase();
        if (nameLower.includes('寒冰')) return '寒冰';
        if (nameLower.includes('暗月')) return '暗月';
        if (nameLower.includes('漩涡')) return '漩涡';
        if (nameLower.includes('合作')) return '合作';
        if (nameLower.includes('深海')) return '深海';
        if (nameLower.includes('活动')) return '活动';
        return '其他';
    }

    async function scanAllFiles() {
        const listEl = document.getElementById('scannedFileList');
        const statsEl = document.getElementById('fuzzyStatsArea');
        if (!listEl) return;

        const dirLabels = { coop: '合作', activity: '活动', battle: '对战', battleMax: '对战MAX', screenshot: '截图' };
        const allDirs = Object.entries(maDirs).filter(([k, v]) => v && k !== 'screenshot');

        if (allDirs.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">请先配置老马目录</div>';
            if (statsEl) statsEl.innerHTML = '';
            return;
        }

        listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">扫描中...</div>';
        scannedFiles = [];

        // 递归扫描所有目录（含子文件夹）
        for (const [key, dir] of allDirs) {
            const subFiles = await collectFilesRecursive(dir, key, dirLabels[key]);
            scannedFiles.push(...subFiles);
        }

        if (scannedFiles.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到 txt/json 文件</div>';
            if (statsEl) statsEl.innerHTML = '';
            return;
        }

        // 按目录分组显示
        const grouped = {};
        scannedFiles.forEach(f => {
            if (!grouped[f.dirLabel]) grouped[f.dirLabel] = [];
            grouped[f.dirLabel].push(f);
        });

        let html = '';
        for (const [label, files] of Object.entries(grouped)) {
            html += `<div style="color:#00bcd4;font-size:0.75rem;margin:8px 0 4px;font-weight:bold;">${label}（${files.length}个）</div>`;
            files.forEach(f => {
                const icon = f.ext === 'json' ? '🔵' : '📄';
                const safePath = f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span>${icon}</span>
                    <span style="color:#fff;font-size:0.8rem;flex:1;word-break:break-all;">${f.name}</span>
                    <button onclick="viewFile('${safePath}')" style="background:rgba(0,188,212,0.3);color:#00bcd4;border:1px solid rgba(0,188,212,0.3);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">查看</button>
                    <button onclick="loadFileToHand('${safePath}')" style="background:rgba(76,175,80,0.3);color:#4caf50;border:1px solid rgba(76,175,80,0.3);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">加载</button>
                </div>`;
            });
        }
        listEl.innerHTML = html;
        window.scannedFiles = scannedFiles;

        // 显示模糊分类统计
        if (statsEl) {
            const fuzzyStats = calcFuzzyStats(scannedFiles);
            const entries = Object.entries(fuzzyStats);
            if (entries.length > 0) {
                const total = entries.reduce((sum, [, c]) => sum + c, 0);
                const colorMap = {
                    '寒冰': '#64b5f6', '暗月': '#ce93d8', '漩涡': '#4fc3f7',
                    '合作': '#ffd54f', '深海': '#4db6ac', '活动': '#ff8a65', '其他': '#bdbdbd'
                };
                let statsHtml = '<div style="color:#ffd700;font-size:0.75rem;margin-bottom:6px;">🏷️ 脚本分类模糊统计（共<span style="color:#fff;font-weight:bold;">' + total + '</span>个）：</div>';
                statsHtml += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
                for (const [kw, count] of entries) {
                    const pct = Math.round(count / total * 100);
                    const color = colorMap[kw] || '#bdbdbd';
                    statsHtml += `<span style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 10px;font-size:0.8rem;">
                        <span style="color:${color};font-weight:bold;">${kw}</span>
                        <span style="color:#fff;margin-left:4px;">${count}个</span>
                        <span style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-left:2px;">(${pct}%)</span>
                    </span>`;
                }
                statsHtml += '</div>';
                statsEl.innerHTML = statsHtml;
            } else {
                statsEl.innerHTML = '';
            }
        }
    }

    // 静默扫描（不上报UI，专门给脚本文件tab搜索用）
    async function silentScanFiles() {
        if (!maDirs) return;
        const dirLabels = { coop: '合作', activity: '活动', battle: '对战', battleMax: '对战MAX', screenshot: '截图' };
        const allDirs = Object.entries(maDirs).filter(([k, v]) => v && k !== 'screenshot');
        if (allDirs.length === 0) return;

        scannedFiles = [];
        for (const [key, dir] of allDirs) {
            const subFiles = await collectFilesRecursive(dir, key, dirLabels[key]);
            scannedFiles.push(...subFiles);
        }
        window.scannedFiles = scannedFiles;
    }

    function saveSettingsAndClose() {
        saveConfig();
        closeAppLocalSettings();
    }

    // ==================== 文件查看/编辑器 ====================

    async function viewFile(filePath) {
        try {
            const content = await readTextFile(filePath);
            if (content === null) {
                alert('读取文件失败');
                return;
            }
            showFileEditor(filePath, content);
        } catch (e) {
            alert('读取文件失败：' + e.message);
        }
    }

    function showFileEditor(filePath, content, secondFilePath, secondContent) {
        let modal = document.getElementById('fileEditorModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'fileEditorModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;justify-content:center;align-items:center;';

        const isCompare = !!(secondFilePath && secondContent !== undefined);
        const fileName = filePath.split(/[\\/]/).pop();
        const safePath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const escapedContent = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // 存储对比模式用的原始文本
        window._editorContent1 = content;
        window._editorPath1 = filePath;

        if (isCompare) {
            const fileName2 = secondFilePath.split(/[\\/]/).pop();
            const safePath2 = secondFilePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const escapedContent2 = secondContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            window._editorContent2 = secondContent;
            window._editorPath2 = secondFilePath;

            // 计算差异
            const lines1 = content.split('\n');
            const lines2 = secondContent.split('\n');
            const diff = computeLineDiff(lines1, lines2);
            const diffLeft = [], diffRight = [], diffClasses = [];
            for (const d of diff) {
                diffLeft.push(d.left !== null ? d.left.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '');
                diffRight.push(d.right !== null ? d.right.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '');
                diffClasses.push(d.type);
            }

            const sameCount = diff.filter(d => d.type === 'same').length;
            const diffCount = diff.filter(d => d.type !== 'same').length;

            window._diffData = { diff, diffLeft, diffRight, diffClasses };

            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(233,30,99,0.5);border-radius:12px;padding:20px;width:95vw;max-width:1100px;height:85vh;display:flex;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <div style="display:flex;gap:20px;align-items:center;">
                            <div>
                                <span style="color:#4caf50;font-size:1rem;">📄 ${fileName}</span>
                                <div style="color:rgba(255,255,255,0.4);font-size:0.65rem;">${filePath}</div>
                            </div>
                            <span style="color:#e91e63;font-weight:bold;">⇄</span>
                            <div>
                                <span style="color:#ff9800;font-size:1rem;">📄 ${fileName2}</span>
                                <div style="color:rgba(255,255,255,0.4);font-size:0.65rem;">${secondFilePath}</div>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <span style="color:rgba(255,255,255,0.5);font-size:0.75rem;">相同<span style="color:#4caf50;font-weight:bold;">${sameCount}</span>行 · 差异<span style="color:#e91e63;font-weight:bold;">${diffCount}</span>行</span>
                            <button onclick="toggleCompareView()" style="background:rgba(156,39,176,0.4);color:#ce93d8;border:1px solid rgba(156,39,176,0.5);padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;">📊 差异视图</button>
                            <button onclick="document.getElementById('fileEditorModal').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:1.2rem;">×</button>
                        </div>
                    </div>
                    <!-- 并排编辑视图 -->
                    <div id="compareSplitView" style="display:flex;gap:8px;flex:1;min-height:0;">
                        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                            <textarea id="fileEditorTextarea" data-editor="left" style="flex:1;width:100%;background:rgba(0,0,0,0.4);color:#0f0;border:1px solid rgba(76,175,80,0.3);border-radius:8px;padding:10px;font-family:'Consolas','Courier New',monospace;font-size:0.8rem;resize:none;box-sizing:border-box;line-height:1.5;overflow:auto;" onscroll="syncCompareScroll(this,'right')">${escapedContent}</textarea>
                        </div>
                        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                            <textarea id="fileEditorTextarea2" data-editor="right" style="flex:1;width:100%;background:rgba(0,0,0,0.4);color:#0f0;border:1px solid rgba(255,152,0,0.3);border-radius:8px;padding:10px;font-family:'Consolas','Courier New',monospace;font-size:0.8rem;resize:none;box-sizing:border-box;line-height:1.5;overflow:auto;" onscroll="syncCompareScroll(this,'left')">${escapedContent2}</textarea>
                        </div>
                    </div>
                    <!-- 差异高亮视图（默认隐藏） -->
                    <div id="compareDiffView" style="display:none;flex:1;overflow:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:rgba(0,0,0,0.4);">
                        <div style="display:flex;font-family:'Consolas','Courier New',monospace;font-size:0.75rem;line-height:1.6;">${renderDiffView(diff)}</div>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                        <button onclick="copyFileContent('fileEditorTextarea')" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📋 复制左侧</button>
                        <button onclick="copyFileContent('fileEditorTextarea2')" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📋 复制右侧</button>
                        <button onclick="saveCompareBoth()" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">💾 保存两侧</button>
                    </div>
                </div>
            `;
        } else {
            // 单文件编辑模式（含查找替换栏）
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(0,188,212,0.5);border-radius:12px;padding:20px;width:700px;max-width:95vw;height:85vh;display:flex;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <div>
                            <h3 style="color:#fff;margin:0;font-size:1.1rem;">📄 ${fileName}</h3>
                            <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:2px;">${filePath}</div>
                        </div>
                        <button onclick="document.getElementById('fileEditorModal').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:1.2rem;">×</button>
                    </div>
                    <!-- 查找替换栏 -->
                    <div id="editorFindReplaceBar" style="display:none;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
                        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                            <input id="editorFindInput" placeholder="查找..." oninput="editorFind('count')" onkeydown="if(event.key==='Enter')editorFind('next')" style="width:150px;flex-shrink:0;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:0.78rem;">
                            <span id="editorFindCount" style="color:rgba(255,255,255,0.55);font-size:0.72rem;min-width:80px;text-align:center;white-space:nowrap;">0个匹配</span>
                            <button onclick="editorFind('prev')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.82rem;white-space:nowrap;" title="上一个 (Shift+Enter)">◀ 上一个</button>
                            <button onclick="editorFind('next')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.82rem;white-space:nowrap;" title="下一个 (Enter)">下一个 ▶</button>
                            <span id="editorCycleHint" style="display:none;color:#ffeb3b;font-size:0.65rem;white-space:nowrap;animation:fadeOut 2s forwards;">↻ 已循环</span>
                            <label style="color:rgba(255,255,255,0.5);font-size:0.72rem;cursor:pointer;white-space:nowrap;margin-left:4px;"><input type="checkbox" id="editorFindCaseSensitive" style="vertical-align:middle;"> Aa</label>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <input id="editorReplaceInput" placeholder="替换为..." style="width:150px;flex-shrink:0;background:rgba(0,0,0,0.4);color:#ffeb3b;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:0.78rem;">
                            <button onclick="editorReplace()" style="background:rgba(255,152,0,0.25);color:#ff9800;border:1px solid rgba(255,152,0,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">替换</button>
                            <button onclick="editorReplaceAll()" style="background:rgba(244,67,54,0.25);color:#f44336;border:1px solid rgba(244,67,54,0.3);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;">全部替换</button>
                        </div>
                    </div>
                    <textarea id="fileEditorTextarea" style="flex:1;width:100%;background:rgba(0,0,0,0.4);color:#0f0;border:1px solid rgba(0,188,212,0.3);border-radius:8px;padding:12px;font-family:'Consolas','Courier New',monospace;font-size:0.85rem;resize:none;box-sizing:border-box;line-height:1.5;overflow:auto;" data-editor="main">${escapedContent}</textarea>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                        <button onclick="toggleEditorFindReplace()" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔍 查找替换</button>
                        <button onclick="startCompareMode('${safePath}')" style="background:rgba(233,30,99,0.3);color:#e91e63;border:1px solid rgba(233,30,99,0.3);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📊 对比文件</button>
                        <button onclick="copyFileContent('fileEditorTextarea')" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📋 复制</button>
                        <button onclick="saveFileContent('${safePath}')" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;">💾 保存</button>
                    </div>
                </div>
            `;
        }
        document.body.appendChild(modal);

        // 键盘快捷键：Ctrl+F 打开查找/替换，Esc 关闭
        if (!isCompare) {
            const ta = document.getElementById('fileEditorTextarea');
            if (ta) {
                ta.addEventListener('keydown', function(e) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                        e.preventDefault();
                        toggleEditorFindReplace(true);
                    }
                    if (e.key === 'Escape') {
                        const bar = document.getElementById('editorFindReplaceBar');
                        if (bar && bar.style.display !== 'none') {
                            bar.style.display = 'none';
                            e.preventDefault();
                        }
                    }
                });
            }
        }
    }

    async function saveFileContent(filePath) {
        const textarea = document.getElementById('fileEditorTextarea');
        const content = textarea.value;
        const ok = await writeTextFile(filePath, content);
        if (ok) {
            alert('✅ 文件已保存到：\n' + filePath);
        } else {
            alert('保存失败');
        }
    }

    function copyFileContent(textareaId) {
        const textarea = document.getElementById(textareaId || 'fileEditorTextarea');
        if (!textarea) return;
        textarea.select();
        document.execCommand('copy');
        alert('已复制到剪贴板');
    }

    async function loadFileContentToHand(filePath) {
        try {
            const content = await readTextFile(filePath);
            if (content === null) { alert('读取失败'); return; }
            const input = document.getElementById('parserInput');
            if (input) {
                input.value = content;
                document.getElementById('fileEditorModal')?.remove();
                closeAppLocalSettings();
                input.scrollIntoView({ behavior: 'smooth' });
                input.style.borderColor = '#00bcd4';
                setTimeout(() => { input.style.borderColor = ''; }, 2000);
            } else {
                alert('未找到解析输入框');
            }
        } catch (e) {
            alert('读取失败：' + e.message);
        }
    }

    async function loadFileToHand(filePath) {
        await loadFileContentToHand(filePath);
    }

    // ==================== 查找替换 ====================

    function toggleEditorFindReplace(forceOpen) {
        const bar = document.getElementById('editorFindReplaceBar');
        if (!bar) return;
        if (forceOpen === true) {
            bar.style.display = 'block';
            document.getElementById('editorFindInput')?.focus();
            // 预填选中文本
            const ta = document.getElementById('fileEditorTextarea');
            if (ta) {
                const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                if (sel) document.getElementById('editorFindInput').value = sel;
                editorFind('count'); // 更新计数
            }
            return;
        }
        bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
        if (bar.style.display !== 'none') {
            document.getElementById('editorFindInput')?.focus();
            const ta = document.getElementById('fileEditorTextarea');
            if (ta) {
                const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
                if (sel) document.getElementById('editorFindInput').value = sel;
                editorFind('count');
            }
        }
    }

    function editorFind(direction) {
        const ta = document.getElementById('fileEditorTextarea') || document.getElementById('fileEditorTextarea2');
        const input = document.getElementById('editorFindInput');
        const countEl = document.getElementById('editorFindCount');
        const cycleHint = document.getElementById('editorCycleHint');
        if (!ta || !input || !input.value) {
            if (countEl) countEl.textContent = '就绪';
            return;
        }
        const query = input.value;
        const caseSensitive = document.getElementById('editorFindCaseSensitive')?.checked || false;
        const text = ta.value;
        const flags = caseSensitive ? 'g' : 'gi';

        // 计算所有匹配位置
        const matches = [];
        let m;
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        while ((m = regex.exec(text)) !== null) {
            matches.push(m.index);
            if (m[0].length === 0) regex.lastIndex++; // 防止死循环
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
        } // 只计数不跳转

        const step = direction === 'prev' ? -1 : 1;
        let currentIdx = -1;
        let wrapped = false;
        if (direction === 'prev') {
            // 找当前位置之前最近的匹配
            for (let i = matches.length - 1; i >= 0; i--) {
                if (matches[i] < ta.selectionStart) { currentIdx = i; break; }
            }
            if (currentIdx === -1) { currentIdx = matches.length - 1; wrapped = true; }
        } else {
            // 找当前位置之后最近的匹配
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
        // 滚动到可见区域
        const lineHeight = 20;
        const before = text.substring(0, pos);
        const lineNum = before.split('\n').length;
        ta.scrollTop = Math.max(0, (lineNum - 3) * lineHeight);

        if (countEl) countEl.textContent = '第' + (currentIdx + 1) + '/' + matches.length + '个';

        // 循环提示
        if (wrapped && cycleHint) {
            cycleHint.style.display = 'inline';
            cycleHint.style.animation = 'none';
            void cycleHint.offsetWidth;
            cycleHint.style.animation = 'fadeOut 2s forwards';
        }
    }

    function editorReplace() {
        const ta = document.getElementById('fileEditorTextarea') || document.getElementById('fileEditorTextarea2');
        const findInput = document.getElementById('editorFindInput');
        const replaceInput = document.getElementById('editorReplaceInput');
        if (!ta || !findInput || !findInput.value) return;
        const query = findInput.value;
        const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
        const caseSensitive = document.getElementById('editorFindCaseSensitive')?.checked || false;
        const compare = caseSensitive ? sel === query : sel.toLowerCase() === query.toLowerCase();
        if (!compare) { editorFind('next'); return; }
        ta.setRangeText(replaceInput.value, ta.selectionStart, ta.selectionEnd, 'select');
        editorFind('next');
    }

    function editorReplaceAll() {
        const ta = document.getElementById('fileEditorTextarea') || document.getElementById('fileEditorTextarea2');
        const findInput = document.getElementById('editorFindInput');
        const replaceInput = document.getElementById('editorReplaceInput');
        if (!ta || !findInput || !findInput.value) return;
        const query = findInput.value;
        const caseSensitive = document.getElementById('editorFindCaseSensitive')?.checked || false;
        const flags = caseSensitive ? 'g' : 'gi';
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const count = (ta.value.match(new RegExp(escaped, flags)) || []).length;
        if (count === 0) { alert('未找到匹配项'); return; }
        if (!confirm(`找到 ${count} 处匹配，确认全部替换？`)) return;
        ta.value = ta.value.replace(new RegExp(escaped, flags), replaceInput.value);
        const countEl = document.getElementById('editorFindCount');
        if (countEl) countEl.textContent = '0/0';
        alert(`已替换 ${count} 处`);
    }

    // ==================== 双文件对比 ====================

    async function startCompareMode(currentPath) {
        // 让用户输入第二个文件路径 or 从已扫描文件中选择
        const allFiles = window.scannedFiles || [];
        if (allFiles.length === 0) {
            const path = prompt('请输入第二个文件的完整路径：');
            if (!path) return;
            try {
                const content = await readTextFile(path);
                if (content === null) { alert('读取文件失败'); return; }
                const currentContent = window._editorContent1 || document.getElementById('fileEditorTextarea')?.value || '';
                const currentPath2 = window._editorPath1 || currentPath.replace(/\\\\/g, '\\').replace(/\\'/g, "'");
                showFileEditor(currentPath2, currentContent, path, content);
            } catch (e) { alert('读取失败：' + e.message); }
            return;
        }

        // 弹窗让用户选择文件
        let modal = document.getElementById('compareFileSelectModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'compareFileSelectModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:100000;display:flex;justify-content:center;align-items:center;';
        modal.innerHTML = `<div style="background:#1a1a2e;border:2px solid rgba(233,30,99,0.5);border-radius:12px;padding:20px;width:500px;max-width:95vw;height:70vh;display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h3 style="color:#fff;margin:0;">📊 选择对比文件</h3>
                <button onclick="document.getElementById('compareFileSelectModal').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:30px;height:30px;border-radius:5px;cursor:pointer;">×</button>
            </div>
            <input id="compareFileSearch" placeholder="搜索文件名..." oninput="filterCompareList()" style="background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;font-size:0.85rem;margin-bottom:8px;">
            <div id="compareFileList" style="flex:1;overflow:auto;">${allFiles.map((f,i) => {
                const safePath = f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<div class="compare-file-item" data-index="${i}" data-path="${safePath}" style="color:#fff;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;font-size:0.8rem;" onclick="selectCompareFile('${safePath}')">${f.dirLabel} / ${f.name}</div>`;
            }).join('')}</div>
        </div>`;
        document.body.appendChild(modal);

        // 存储当前路径供回调使用
        window._pendingComparePath = currentPath;
    }

    async function selectCompareFile(secondPath) {
        document.getElementById('compareFileSelectModal')?.remove();
        const currentPath = window._pendingComparePath?.replace(/\\\\/g, '\\').replace(/\\'/g, "'") || '';
        const currentContent = window._editorContent1 || document.getElementById('fileEditorTextarea')?.value || '';
        try {
            const content2 = await readTextFile(secondPath);
            if (content2 === null) { alert('读取文件失败'); return; }
            showFileEditor(currentPath, currentContent, secondPath, content2);
        } catch (e) { alert('读取失败：' + e.message); }
    }

    function filterCompareList() {
        const query = (document.getElementById('compareFileSearch')?.value || '').toLowerCase();
        document.querySelectorAll('.compare-file-item').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
    }

    // 简单的 LCS 行差异算法
    function computeLineDiff(lines1, lines2) {
        const m = lines1.length, n = lines2.length;
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

        for (let idx = 0; idx < diff.length; idx++) {
            const d = diff[idx];
            if (d.type === 'same') {
                leftHtml += '<div style="padding:1px 8px;color:rgba(255,255,255,0.7);font-size:0.7rem;">' + escapeHtml(d.left || ' ') + '</div>';
                rightHtml += '<div style="padding:1px 8px;color:rgba(255,255,255,0.7);font-size:0.7rem;">' + escapeHtml(d.right || ' ') + '</div>';
            } else if (d.type === 'deleted') {
                leftHtml += '<div style="padding:1px 8px;background:rgba(244,67,54,0.25);color:#ef9a9a;font-size:0.7rem;">− ' + escapeHtml(d.left || ' ') + '</div>';
                rightHtml += '<div style="padding:1px 8px;background:rgba(244,67,54,0.08);">&nbsp;</div>';
            } else if (d.type === 'added') {
                leftHtml += '<div style="padding:1px 8px;background:rgba(76,175,80,0.08);">&nbsp;</div>';
                rightHtml += '<div style="padding:1px 8px;background:rgba(76,175,80,0.25);color:#a5d6a7;font-size:0.7rem;">+ ' + escapeHtml(d.right || ' ') + '</div>';
            }
        }
        leftHtml += '</div>';
        rightHtml += '</div>';
        return leftHtml + rightHtml;
    }

    function toggleCompareView() {
        const splitView = document.getElementById('compareSplitView');
        const diffView = document.getElementById('compareDiffView');
        const btn = document.querySelector('#fileEditorModal button[onclick="toggleCompareView()"]');
        if (!splitView || !diffView) return;
        if (splitView.style.display !== 'none') {
            splitView.style.display = 'none';
            diffView.style.display = 'block';
            if (btn) btn.textContent = '✏️ 编辑视图';
        } else {
            splitView.style.display = 'flex';
            diffView.style.display = 'none';
            if (btn) btn.textContent = '📊 差异视图';
        }
    }

    function syncCompareScroll(source, targetSide) {
        const target = document.getElementById(targetSide === 'right' ? 'fileEditorTextarea2' : 'fileEditorTextarea');
        if (target && !target.dataset.scrolling) {
            target.dataset.scrolling = '1';
            target.scrollTop = source.scrollTop;
            setTimeout(() => { delete target.dataset.scrolling; }, 50);
        }
    }

    async function saveCompareBoth() {
        const leftPath = window._editorPath1;
        const rightPath = window._editorPath2;
        const leftContent = document.getElementById('fileEditorTextarea')?.value;
        const rightContent = document.getElementById('fileEditorTextarea2')?.value;
        let ok1 = true, ok2 = true;
        if (leftContent !== undefined && leftPath) ok1 = await writeTextFile(leftPath, leftContent);
        if (rightContent !== undefined && rightPath) ok2 = await writeTextFile(rightPath, rightContent);
        if (ok1 && ok2) alert('✅ 两侧文件已保存');
        else if (ok1) alert('⚠️ 左侧已保存，右侧保存失败');
        else if (ok2) alert('⚠️ 右侧已保存，左侧保存失败');
        else alert('❌ 保存失败');
    }

    // ==================== 导入文件到项目脚本列表 ====================

    async function importFileToProject(filePath) {
        try {
            // 检查项目是否已选择
            if (typeof currentProjectName === 'undefined' || !currentProjectName || currentProjectName === '默认项目') {
                alert('请先在左侧选择一个项目或新建项目！\n文件内容无法导入到"默认项目"。');
                return;
            }
            const content = await readTextFile(filePath);
            if (content === null) { alert('读取文件失败'); return; }
            const fileName = filePath.split(/[\\/]/).pop();

            // 获取 txtFiles 引用（兼容 let/var 声明）
            const _txtFiles = (typeof txtFiles !== 'undefined') ? txtFiles : (typeof window !== 'undefined' && window.txtFiles ? window.txtFiles : null);
            if (!_txtFiles || !Array.isArray(_txtFiles)) {
                alert('脚本文件列表不可用，请先打开"脚本生成"面板');
                return;
            }

            // 避免重名
            let finalName = fileName;
            let counter = 1;
            while (_txtFiles.some(f => f.name === finalName)) {
                const dotIdx = fileName.lastIndexOf('.');
                finalName = dotIdx > 0 ? fileName.substring(0, dotIdx) + `(${counter})` + fileName.substring(dotIdx) : fileName + `(${counter})`;
                counter++;
            }
            _txtFiles.push({ name: finalName, content: content });
            if (typeof updateTxtFilesList === 'function') updateTxtFilesList();
            if (typeof autoSaveProject === 'function') autoSaveProject();
            alert('✅ 已导入脚本：' + finalName);
        } catch (e) {
            alert('导入失败：' + e.message);
        }
    }

    // ==================== 批量导入文件到项目脚本列表 ====================

    async function batchImportFilesToProject(paths) {
        if (!paths || paths.length === 0) { alert('请先选择要导入的文件'); return; }
        const validPaths = paths.map(p => String(p).trim()).filter(p => p.length > 0);
        if (validPaths.length === 0) { alert('请先选择要导入的文件'); return; }

        // 检查项目
        if (typeof currentProjectName === 'undefined' || !currentProjectName || currentProjectName === '默认项目') {
            alert('请先在左侧选择一个项目或新建项目！\n文件内容无法导入到"默认项目"。');
            return;
        }

        const _txtFiles = (typeof txtFiles !== 'undefined') ? txtFiles : (typeof window !== 'undefined' && window.txtFiles ? window.txtFiles : null);
        if (!_txtFiles || !Array.isArray(_txtFiles)) {
            alert('脚本文件列表不可用，请先打开"脚本生成"面板');
            return;
        }

        let success = 0, failed = 0;
        for (const fp of validPaths) {
            try {
                const content = await readTextFile(fp);
                if (content === null) { failed++; continue; }
                let fileName = fp.split(/[\\/]/).pop();
                let finalName = fileName, counter = 1;
                while (_txtFiles.some(f => f.name === finalName)) {
                    const dotIdx = fileName.lastIndexOf('.');
                    finalName = dotIdx > 0 ? fileName.substring(0, dotIdx) + `(${counter})` + fileName.substring(dotIdx) : fileName + `(${counter})`;
                    counter++;
                }
                _txtFiles.push({ name: finalName, content: content });
                success++;
            } catch (e) { failed++; }
        }

        if (typeof updateTxtFilesList === 'function') updateTxtFilesList();
        if (typeof autoSaveProject === 'function') autoSaveProject();
        if (typeof filterTxtFilesList === 'function') filterTxtFilesList();

        if (success > 0 && failed === 0) {
            alert(`✅ 成功导入 ${success} 个脚本文件`);
        } else if (success > 0) {
            alert(`⚠️ 成功导入 ${success} 个，${failed} 个失败`);
        } else {
            alert(`❌ 全部导入失败，请检查文件是否存在`);
        }
    }

    // ==================== 删除文件（二次确认） ====================

    async function deleteFileWithConfirm(filePath, fileName) {
        if (!confirm(`确定要删除文件吗？\n\n文件名：${fileName}\n路径：${filePath}\n\n此操作将永久删除老马目录中的原文件！`)) return;
        if (!confirm(`⚠️ 再次确认！\n\n即将删除：${fileName}\n\n这个文件会从老马目录中永久消失，老马软件将无法使用此脚本！\n\n确定删除？`)) return;
        const ok = await deleteFile(filePath);
        if (ok) {
            alert('✅ 文件已删除');
            scanAllFiles();
        } else {
            alert('删除失败');
        }
    }

    // ==================== 生成脚本保存到老马目录 ====================

    async function saveScriptToMaDir(dirKey, fileName, content, silent) {
        const dir = maDirs[dirKey];
        if (!dir) { if (!silent) alert('未配置该目录'); return false; }
        const sep = dir.endsWith('\\') || dir.endsWith('/') ? '' : '\\';
        const filePath = dir + sep + fileName;
        const ok = await writeTextFile(filePath, content);
        if (ok) {
            if (!silent) alert('✅ 脚本已保存到：\n' + filePath);
            scanAllFiles();
            return true;
        } else {
            if (!silent) alert('保存失败');
            return false;
        }
    }

    // ==================== 截图统计 ====================

    async function calcScreenshotStats() {
        const statsEl = document.getElementById('screenshotStats');
        if (!statsEl) return;

        const screenshotDir = maDirs.screenshot;
        if (!screenshotDir) {
            statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">请先配置截图目录</div>';
            return;
        }

        statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">统计中...</div>';

        try {
            const entries = await readDir(screenshotDir);
            const dateDirs = entries.filter(e => !e.is_file);

            if (dateDirs.length === 0) {
                statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到日期子文件夹</div>';
                return;
            }

            const stats = [];
            const imageExts = ['png', 'jpg', 'jpeg', 'bmp', 'webp'];
            for (const dir of dateDirs) {
                try {
                    const files = await readDir(dir.path);
                    let count = 0;
                    for (const f of files) {
                        if (f.is_file) {
                            const ext = f.name.split('.').pop().toLowerCase();
                            if (imageExts.includes(ext)) count++;
                        }
                    }
                    stats.push({ date: dir.name, count, path: dir.path });
                } catch (e) {
                    console.warn('统计目录失败:', dir.path, e);
                }
            }

            stats.sort((a, b) => b.date.localeCompare(a.date));

            if (stats.length === 0) {
                statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到截图文件</div>';
                return;
            }

            const totalGames = stats.reduce((sum, s) => sum + s.count, 0);
            const maxCount = Math.max(...stats.map(s => s.count));
            const avgCount = (totalGames / stats.length).toFixed(1);

            let html = '';
            html += `<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;">`;
            html += `<div style="background:rgba(156,39,176,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#e040fb;font-size:1.4rem;font-weight:bold;">${totalGames}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">总局数</div></div>`;
            html += `<div style="background:rgba(0,188,212,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#00bcd4;font-size:1.4rem;font-weight:bold;">${stats.length}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">天数</div></div>`;
            html += `<div style="background:rgba(255,152,0,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#ff9800;font-size:1.4rem;font-weight:bold;">${avgCount}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">日均</div></div>`;
            html += `<div style="background:rgba(244,67,54,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#f44336;font-size:1.4rem;font-weight:bold;">${maxCount}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">最高</div></div>`;
            html += `</div>`;

            const barWidth = Math.max(30, Math.floor(600 / stats.length));
            const chartHeight = 120;
            html += `<div style="display:flex;align-items:flex-end;gap:2px;height:${chartHeight}px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);overflow-x:auto;">`;
            for (const s of stats) {
                const h = Math.max(4, Math.round((s.count / maxCount) * (chartHeight - 20)));
                const color = s.count >= avgCount ? '#e040fb' : '#7c4dff';
                html += `<div style="display:flex;flex-direction:column;align-items:center;min-width:${barWidth}px;">
                    <div style="color:#fff;font-size:0.65rem;margin-bottom:2px;">${s.count}</div>
                    <div style="width:${Math.max(12, barWidth - 6)}px;height:${h}px;background:linear-gradient(180deg,${color},rgba(156,39,176,0.3));border-radius:3px 3px 0 0;" title="${s.date}: ${s.count}局"></div>
                    <div style="color:rgba(255,255,255,0.5);font-size:0.6rem;margin-top:2px;">${s.date}</div>
                </div>`;
            }
            html += `</div>`;

            const recent = stats.slice(0, 7);
            html += `<div style="margin-top:12px;"><div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-bottom:6px;">最近7天明细</div>`;
            for (const s of recent) {
                const bar = '█'.repeat(Math.min(20, Math.round(s.count / maxCount * 20)));
                html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.78rem;">
                    <span style="color:rgba(255,255,255,0.7);width:60px;">${s.date}</span>
                    <span style="color:#e040fb;font-family:monospace;">${bar}</span>
                    <span style="color:#fff;font-weight:bold;width:30px;">${s.count}局</span>
                </div>`;
            }
            html += `</div>`;

            // 最近7天趋势图（SVG柱状图 + 折线，近→远）
            if (recent.length > 0) {
                const chartW = 380;
                const padL = 30, padR = 10, padT = 16, padB = 16;
                const hMax = Math.max(1, Math.max(...recent.map(s => s.count)));
                const chartH = padT + 100 + padB;
                const plotW = chartW - padL - padR;
                const plotH = 100;
                const barGap = 6;
                const barW = Math.max(14, Math.floor((plotW - (recent.length - 1) * barGap) / recent.length));

                // 网格线
                const gridLines = [0.25, 0.5, 0.75, 1.0];
                let gridHtml = gridLines.map(r => {
                    const gy = padT + plotH * (1 - r);
                    return `<line x1="${padL}" y1="${gy}" x2="${padL + plotW}" y2="${gy}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><text x="${padL - 4}" y="${gy + 3}" fill="rgba(255,255,255,0.25)" font-size="8" text-anchor="end">${Math.round(hMax * r)}</text>`;
                }).join('');

                // 柱子和折线点数据
                let points = '';
                let barsHtml = '';
                recent.forEach((s, i) => {
                    const bh = Math.max(4, (s.count / hMax) * plotH);
                    const bx = padL + i * (barW + barGap);
                    const by = padT + plotH - bh;
                    const cx = bx + barW / 2;
                    const cy = padT + plotH - (s.count / hMax) * plotH;
                    const c = s.count >= avgCount ? '#e040fb' : '#7c4dff';
                    const light = s.count >= avgCount ? '#f48fb1' : '#b39ddb';
                    // 渐变柱 + 数值
                    barsHtml += `<defs><linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${light}" stop-opacity="0.95"/><stop offset="100%" stop-color="${c}" stop-opacity="0.85"/></linearGradient></defs>`;
                    barsHtml += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="url(#grad${i})"/>`;
                    barsHtml += `<text x="${cx}" y="${by - 4}" fill="rgba(255,255,255,0.7)" font-size="9" font-weight="bold" text-anchor="middle">${s.count}</text>`;
                    barsHtml += `<text x="${cx}" y="${padT + plotH + 13}" fill="rgba(255,255,255,0.45)" font-size="9" text-anchor="middle">${s.date.slice(5)}</text>`;
                    points += `${cx},${cy} `;
                });

                // 折线
                const polyline = recent.length > 1 ? `<polyline points="${points.trim()}" fill="none" stroke="#ff9800" stroke-width="1.5" stroke-dasharray="4,2" opacity="0.7"/>` : '';
                const dots = recent.map((s, i) => {
                    const cx = padL + i * (barW + barGap) + barW / 2;
                    const cy = padT + plotH - (s.count / hMax) * plotH;
                    return `<circle cx="${cx}" cy="${cy}" r="3" fill="#ff9800" opacity="0.9"><title>${s.date}: ${s.count}局</title></circle>`;
                }).join('');

                html += `<div style="margin-top:10px;"><div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-bottom:4px;">📈 趋势图</div>`;
                html += `<svg width="${chartW}" height="${chartH}" style="display:block;">${gridHtml}${barsHtml}${polyline}${dots}</svg></div>`;
            }

            statsEl.innerHTML = html;
        } catch (e) {
            statsEl.innerHTML = '<div style="color:#f44336;text-align:center;padding:20px;font-size:0.85rem;">统计失败：' + e.message + '</div>';
        }
    }

    // ==================== 导出函数到全局 ====================
    window.maDirs = maDirs;
    window.openAppLocalSettings = openAppLocalSettings;
    window.closeAppLocalSettings = closeAppLocalSettings;
    window.selectMaDir = selectMaDir;
    window.selectSoftwareDataDir = selectSoftwareDataDir;
    window.scanAllFiles = scanAllFiles;
    window.silentScanFiles = silentScanFiles;
    window.collectFilesRecursive = collectFilesRecursive;
    window.classifyFile = classifyFile;
    window.saveSettingsAndClose = saveSettingsAndClose;
    window.viewFile = viewFile;
    window.loadFileToHand = loadFileToHand;
    window.saveFileContent = saveFileContent;
    window.readTextFile = readTextFile;
    window.writeTextFile = writeTextFile;
    window.renameLocalFile = renameLocalFile;
    window.getAppVersion = getAppVersion;
    window.copyFileContent = copyFileContent;
    // 查找替换
    window.toggleEditorFindReplace = toggleEditorFindReplace;
    window.editorFind = editorFind;
    window.editorReplace = editorReplace;
    window.editorReplaceAll = editorReplaceAll;
    // 双文件对比
    window.startCompareMode = startCompareMode;
    window.selectCompareFile = selectCompareFile;
    window.filterCompareList = filterCompareList;
    window.computeLineDiff = computeLineDiff;
    window.renderDiffView = renderDiffView;
    window.toggleCompareView = toggleCompareView;
    window.syncCompareScroll = syncCompareScroll;
    window.saveCompareBoth = saveCompareBoth;
    window.loadFileContentToHand = loadFileContentToHand;
    window.deleteFileWithConfirm = deleteFileWithConfirm;
    window.saveScriptToMaDir = saveScriptToMaDir;
    window.calcScreenshotStats = calcScreenshotStats;
    window.importFileToProject = importFileToProject;
    window.batchImportFilesToProject = batchImportFilesToProject;

    window.addEventListener('DOMContentLoaded', initAppLocal);
    console.log('[APP] app-local.js 已加载 (IPC模式)');
}
