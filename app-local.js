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
        const result = await tauriInvoke('write_text_file', { filePath, content });
        return result === null ? false : true;
    }

    async function deleteFile(filePath) {
        const result = await tauriInvoke('delete_file', { filePath });
        return result === null ? false : true;
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
                </div>

                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="color:#e040fb;font-size:0.9rem;">📊 对战统计（按截图数统计每天打多少局）</label>
                        <button onclick="calcScreenshotStats()" style="background:linear-gradient(135deg,#9c27b0,#6a1b9a);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📊 统计</button>
                    </div>
                    <div id="screenshotStats" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;min-height:60px;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">配置截图目录后点击统计</div>
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

    async function scanAllFiles() {
        const listEl = document.getElementById('scannedFileList');
        if (!listEl) return;

        const dirLabels = { coop: '合作', activity: '活动', battle: '对战', battleMax: '对战MAX', screenshot: '截图' };
        const allDirs = Object.entries(maDirs).filter(([k, v]) => v && k !== 'screenshot');

        if (allDirs.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">请先配置老马目录</div>';
            return;
        }

        listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">扫描中...</div>';
        scannedFiles = [];

        for (const [key, dir] of allDirs) {
            try {
                const entries = await readDir(dir);
                for (const entry of entries) {
                    if (entry.is_file) {
                        const ext = entry.name.split('.').pop().toLowerCase();
                        if (ext === 'txt' || ext === 'json') {
                            scannedFiles.push({
                                name: entry.name,
                                path: entry.path,
                                dir,
                                dirKey: key,
                                dirLabel: dirLabels[key],
                                ext
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('扫描目录失败:', dir, e);
            }
        }

        if (scannedFiles.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到 txt/json 文件</div>';
            return;
        }

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

    function showFileEditor(filePath, content) {
        let modal = document.getElementById('fileEditorModal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'fileEditorModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;';
        const fileName = filePath.split(/[\\/]/).pop();
        const safePath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        modal.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(0,188,212,0.5);border-radius:12px;padding:20px;width:700px;max-width:95vw;height:80vh;display:flex;flex-direction:column;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div>
                        <h3 style="color:#fff;margin:0;font-size:1.1rem;">📄 ${fileName}</h3>
                        <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:2px;">${filePath}</div>
                    </div>
                    <button onclick="document.getElementById('fileEditorModal').remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:1.2rem;">×</button>
                </div>
                <textarea id="fileEditorTextarea" style="flex:1;width:100%;background:rgba(0,0,0,0.4);color:#0f0;border:1px solid rgba(0,188,212,0.3);border-radius:8px;padding:12px;font-family:'Consolas','Courier New',monospace;font-size:0.85rem;resize:none;box-sizing:border-box;line-height:1.5;">${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                    <button onclick="copyFileContent()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;">📋 复制</button>
                    <button onclick="saveFileContent('${safePath}')" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;">💾 保存到原文件</button>
                    <button onclick="loadFileContentToHand('${safePath}')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;">🃏 加载到手牌</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
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

    function copyFileContent() {
        const textarea = document.getElementById('fileEditorTextarea');
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

    async function saveScriptToMaDir(dirKey, fileName, content) {
        const dir = maDirs[dirKey];
        if (!dir) { alert('未配置该目录'); return false; }
        const sep = dir.endsWith('\\') || dir.endsWith('/') ? '' : '\\';
        const filePath = dir + sep + fileName;
        const ok = await writeTextFile(filePath, content);
        if (ok) {
            alert('✅ 脚本已保存到：\n' + filePath);
            scanAllFiles();
            return true;
        } else {
            alert('保存失败');
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

            statsEl.innerHTML = html;
        } catch (e) {
            statsEl.innerHTML = '<div style="color:#f44336;text-align:center;padding:20px;font-size:0.85rem;">统计失败：' + e.message + '</div>';
        }
    }

    // ==================== 导出函数到全局 ====================
    window.openAppLocalSettings = openAppLocalSettings;
    window.closeAppLocalSettings = closeAppLocalSettings;
    window.selectMaDir = selectMaDir;
    window.selectSoftwareDataDir = selectSoftwareDataDir;
    window.scanAllFiles = scanAllFiles;
    window.saveSettingsAndClose = saveSettingsAndClose;
    window.viewFile = viewFile;
    window.loadFileToHand = loadFileToHand;
    window.saveFileContent = saveFileContent;
    window.copyFileContent = copyFileContent;
    window.loadFileContentToHand = loadFileContentToHand;
    window.deleteFileWithConfirm = deleteFileWithConfirm;
    window.saveScriptToMaDir = saveScriptToMaDir;
    window.calcScreenshotStats = calcScreenshotStats;
    window.importFileToProject = importFileToProject;

    window.addEventListener('DOMContentLoaded', initAppLocal);
    console.log('[APP] app-local.js 已加载 (IPC模式)');
}
