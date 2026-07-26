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
    // 老马6个固定目录配置（默认值，用户可在设置面板修改）
    const DEFAULT_MA_DIRS = {
        coop:       'D:\\withfriends\\塔防老马助手\\合作脚本存档',   // 合作脚本目录
        activity:   'D:\\withfriends\\塔防老马助手\\活动脚本存档',   // 活动脚本目录
        battle:     'D:\\withfriends\\塔防老马助手\\对战脚本存档',   // 对战目录（JSON）
        battleMax:  'D:\\withfriends\\塔防老马助手\\对战Max',        // 对战MAX目录（TXT）
        screenshot: 'D:\\withfriends\\塔防老马助手\\截图',           // 截图目录（统计每天打多少局）
        logs:       'D:\\withfriends\\塔防老马助手\\Log',            // 对战日志目录（统计胜负等）
        temp:       'D:\\withfriends\\Downloads'                      // 临时脚本目录
    };
    const DEFAULT_SOFTWARE_DATA_DIR = 'D:\\withfriends\\塔防精灵助手数据';

    let maDirs = { ...DEFAULT_MA_DIRS };
    let softwareDataDir = DEFAULT_SOFTWARE_DATA_DIR;
    let scannedFiles = [];

    // 扫描文件区域分享/筛选状态
    let _shareModeScanned = false;
    let _scannedFilterKeyword = '';
    let _scannedFilterCategory = '全部';
    let _selScannedSharePaths = new Set();

    // ==================== 扫描缓存（本地设置秒开） ====================
    const SCAN_CACHE_KEY = 'TFJL_ScannedFilesCache';

    function getScanCacheKey() {
        // 根据当前配置的目录拼 key，目录变了缓存自动失效
        const dirStr = Object.entries(maDirs)
            .filter(([, v]) => v)
            .map(([k, v]) => k + '=' + v)
            .join('|');
        return SCAN_CACHE_KEY + '_' + (dirStr ? btoa(unescape(encodeURIComponent(dirStr))).slice(0, 32) : 'empty');
    }

    function getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // 内存缓存：避免反复 JSON.parse 同一个大缓存
    let _memScanCache = null;
    let _memScanCacheRaw = null;

    function loadScanCache() {
        try {
            const raw = localStorage.getItem(getScanCacheKey());
            if (!raw) return null;
            // 如果 localStorage 原始字符串没变，直接返回内存中的解析结果（避免反复 JSON.parse 2000+ 条记录）
            if (_memScanCache && _memScanCacheRaw === raw) return _memScanCache;
            const cache = JSON.parse(raw);
            if (cache.date !== getTodayStr()) return null;
            _memScanCache = cache;
            _memScanCacheRaw = raw;
            return cache;
        } catch (e) {
            return null;
        }
    }

    // 延迟写入：避免同步 JSON.stringify + localStorage.setItem 阻塞主线程
    // 所有缓存写入统一走防抖队列（500ms 内多次调用只写最后一次）
    const _deferredSaves = {};
    function _deferredSetItem(key, data) {
        if (_deferredSaves[key] !== undefined) clearTimeout(_deferredSaves[key]);
        _deferredSaves[key] = setTimeout(() => {
            try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
            delete _deferredSaves[key];
        }, 500);
    }

    // ==================== 数据统一存储到单一文件（不再散落一堆 tfjl_*.json） ====================
    // 原理：拦截 localStorage.setItem/removeItem，把变更汇总进内存 Map，
    //       防抖后整包写入 {softwareDataDir}/tfjl.dat（base64 打包的二进制，肉眼不可读、不易误改）
    // 好处：数据目录只剩一个 tfjl.dat（外加 data/skin 等物理资源），清爽；重装/清缓存不丢；
    //       需要查看/备份时用「导出备份」功能（可读 JSON），无需直接翻 tfjl.dat。

    const DATA_FILE_NAME = 'tfjl.dat';
    const STORE_MAGIC = [0x54, 0x46, 0x4A, 0x4C, 0x44, 0x31]; // "TFJLD1"
    const STORE_VERSION = 1;
    const PROJECTS_KEY = '__tfjl_projects__';          // 项目数据在统一存储里的保留键
    const RESERVED_KEYS = new Set([PROJECTS_KEY]);

    let _syncDir = '';            // 存储目标目录
    let _syncOk = false;          // 存储是否可用
    let _storeMap = new Map();    // 磁盘上的全部键值（localStorage 镜像 + 项目）
    let _projectsCache = null;    // 当前项目数组（null=尚未写入过）
    let _storeLoaded = false;     // 是否已从磁盘加载过
    let _flushTimer = null;       // 防抖定时器

    function _getSyncDir() {
        if (!softwareDataDir) return '';
        return softwareDataDir.replace(/[\\/]+$/, '');
    }
    function _getDatPath(dir) {
        return (dir || _getSyncDir()).replace(/[\\/]+$/, '') + '\\' + DATA_FILE_NAME;
    }

    // ---- 二进制打包 / base64 ----
    function _u32le(n) {
        return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    }
    function _bytesToBase64(bytes) {
        let s = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(s);
    }
    function _base64ToBytes(b64) {
        const s = atob(b64);
        const bytes = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
        return bytes;
    }
    function _packStore(map) {
        const enc = new TextEncoder();
        const parts = [];
        for (const b of STORE_MAGIC) parts.push(b);
        parts.push(..._u32le(STORE_VERSION));
        parts.push(..._u32le(map.size));
        for (const [k, v] of map.entries()) {
            const kb = enc.encode(String(k));
            const vb = enc.encode(String(v));
            parts.push(..._u32le(kb.length), ...kb, ..._u32le(vb.length), ...vb);
        }
        return new Uint8Array(parts);
    }
    function _unpackStore(bytes) {
        const map = new Map();
        if (!bytes || bytes.length < 14) return map;
        for (let i = 0; i < STORE_MAGIC.length; i++) {
            if (bytes[i] !== STORE_MAGIC[i]) throw new Error('magic mismatch');
        }
        let p = STORE_MAGIC.length;
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const version = dv.getUint32(p, true); p += 4;
        const count = dv.getUint32(p, true); p += 4;
        const dec = new TextDecoder();
        for (let i = 0; i < count; i++) {
            const kl = dv.getUint32(p, true); p += 4;
            const kb = bytes.subarray(p, p + kl); p += kl;
            const vl = dv.getUint32(p, true); p += 4;
            const vb = bytes.subarray(p, p + vl); p += vl;
            map.set(dec.decode(kb), dec.decode(vb));
        }
        return map;
    }

    // ---- 加载 / 迁移 ----
    async function _ensureStoreLoaded(dir) {
        if (_storeLoaded) return;
        _storeLoaded = true;
        const path = _getDatPath(dir);
        const raw = await readTextFile(path);
        if (raw) {
            try {
                _storeMap = _unpackStore(_base64ToBytes(raw.trim()));
                console.log('[数据存储] 已加载统一存储: ' + path + ' (' + _storeMap.size + ' 项)');
                return;
            } catch (e) {
                console.warn('[数据存储] tfjl.dat 解析失败，尝试旧文件迁移:', e);
            }
        }
        // 无 tfjl.dat → 迁移旧的 tfjl_*.json + projects/projects.json
        _storeMap = await _importLegacyFiles(dir);
        // 迁移后立刻写一份新的统一存储
        await _writeStoreFile(dir, _storeMap);
    }

    async function _importLegacyFiles(dir) {
        const map = new Map();
        let migrated = 0;
        try {
            const files = await readDir(dir);
            const KEEP = new Set(['tfjl_datadir.json', 'tfjl_maDirsConfig.json']);
            for (const f of files) {
                if (!f.name || !f.name.startsWith('tfjl_') || !f.name.endsWith('.json')) continue;
                if (KEEP.has(f.name)) continue;
                try {
                    const parsed = JSON.parse(await readTextFile(dir + '\\' + f.name));
                    const key = f.name.slice(5, -5);
                    if (parsed && parsed.value !== null && parsed.value !== undefined) {
                        map.set(key, parsed.value);
                        migrated++;
                    }
                    await deleteFile(dir + '\\' + f.name);
                } catch (e) {}
            }
        } catch (e) {}
        // 迁移 projects/projects.json
        try {
            const praw = await readTextFile(dir + '\\projects\\projects.json');
            if (praw) {
                const pdata = JSON.parse(praw);
                if (Array.isArray(pdata.projects)) {
                    map.set(PROJECTS_KEY, JSON.stringify(pdata.projects));
                    await deleteFile(dir + '\\projects\\projects.json');
                }
            }
        } catch (e) {}
        if (migrated > 0) console.log('[数据存储] 已迁移 ' + migrated + ' 个旧配置文件 → tfjl.dat');
        return map;
    }

    async function _writeStoreFile(dir, map) {
        const path = _getDatPath(dir);
        const bytes = _packStore(map);
        return await writeTextFile(path, _bytesToBase64(bytes));
    }

    // 构建当前最新存储内容（localStorage 全量 + 项目缓存），写盘
    async function _flushStore() {
        if (!_syncOk) return;
        const map = new Map();
        // 项目（优先用内存缓存，避免回退到旧值）
        if (_projectsCache !== null) map.set(PROJECTS_KEY, JSON.stringify(_projectsCache));
        else if (_storeMap.has(PROJECTS_KEY)) map.set(PROJECTS_KEY, _storeMap.get(PROJECTS_KEY));
        // localStorage 当前全部键值（已删除的键自然不会出现在 localStorage 里，故不再保留）
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (RESERVED_KEYS.has(k)) continue;
            map.set(k, localStorage.getItem(k));
        }
        _storeMap = map;
        const ok = await _writeStoreFile(_syncDir, map);
        if (ok) console.log('[数据存储] 已写入统一存储 tfjl.dat (' + map.size + ' 项)');
    }

    function _scheduleFlush() {
        if (!_syncOk) return;
        if (_flushTimer) clearTimeout(_flushTimer);
        _flushTimer = setTimeout(() => _flushStore().catch(() => {}), 1000);
    }

    // 拦截全局 Storage 写入——所有 localStorage 变更都触发统一存储刷新
    const _nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        _nativeSetItem.call(this, key, value);
        _scheduleFlush();
    };
    const _nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
        _nativeRemoveItem.call(this, key);
        _scheduleFlush();
    };

    // 立即全量落盘（用户主动保存 / 目录变更时调用，不等防抖）
    async function syncAllNow() {
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        await _flushStore();
    }

    // 页面关闭前尽量刷盘（避免异步写入丢失）
    window.addEventListener('pagehide', () => {
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        _flushStore().catch(() => {});
    });

    async function initDataSync() {
        const dir = _getSyncDir();
        if (!dir) {
            _syncOk = false;
            console.log('[数据存储] ⚠️ 未设置软件数据目录，存储未启用');
            return;
        }
        // 目录发生变化（用户在设置里改过）→ 重新从新目录加载存储
        if (dir !== _syncDir) { _storeLoaded = false; _storeMap = new Map(); _projectsCache = null; }
        _syncDir = dir;
        try {
            await _ensureStoreLoaded(dir);   // 加载现有 tfjl.dat 或迁移旧文件
            _syncOk = true;
            await _flushStore();             // 立即写一次，验证目录可写
            console.log('[数据存储] ✅ 已启用单一文件存储: ' + _getDatPath(dir));
        } catch (e) {
            _syncOk = false;
            console.error('[数据存储] ❌ 初始化失败: ' + dir, e);
        }
    }

    function saveScanCache(files) {
        const cache = { date: getTodayStr(), files: files, savedAt: Date.now() };
        _deferredSetItem(getScanCacheKey(), cache);
    }

    // ==================== 截图统计缓存（与扫描缓存同模式，日缓存） ====================
    const STATS_CACHE_KEY = 'TFJL_ScreenshotStatsCache';

    function getStatsCacheKey() {
        const ssDir = maDirs.screenshot || '';
        return STATS_CACHE_KEY + '_' + (ssDir ? btoa(unescape(encodeURIComponent(ssDir))).slice(0, 32) : 'empty');
    }

    function loadStatsCache() {
        try {
            const raw = localStorage.getItem(getStatsCacheKey());
            if (!raw) return null;
            const cache = JSON.parse(raw);
            if (cache.date !== getTodayStr()) return null;
            return cache;
        } catch (e) { return null; }
    }

    function saveStatsCache(statsData) {
        const cache = { date: getTodayStr(), stats: statsData, savedAt: Date.now() };
        _deferredSetItem(getStatsCacheKey(), cache);
    }

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
        // 目录可能不存在，直接调用避免 tauriInvoke 弹调试 alert
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return [];
        try {
            const result = await invokeFn('read_directory', { dirPath });
            return result || [];
        } catch (e) {
            console.warn('[APP] read_directory 失败:', dirPath, e.message || e);
            return [];
        }
    }

    async function readTextFile(filePath) {
        // 直接调用 invoke，避免 tauriInvoke 的 debug alert 弹窗打扰
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return null;
        try {
            return await invokeFn('read_text_file_auto', { filePath });
        } catch (e) {
            console.error('[APP] read_text_file_auto 失败:', filePath, e);
            return null;
        }
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

    async function writeTextFileWithError(filePath, content) {
        // 返回 {success, error}，方便调用方显示具体错误
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return { success: false, error: '未找到 Tauri invoke 函数' };
        try {
            await invokeFn('write_text_file', { filePath, content });
            return { success: true };
        } catch (e) {
            console.error('写入文件失败:', filePath, e);
            return { success: false, error: e?.message || String(e) };
        }
    }

    async function pathExists(path) {
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return false;
        try {
            return await invokeFn('path_exists', { path }) === true;
        } catch (e) {
            console.error('检查路径失败:', path, e);
            return false;
        }
    }

    async function createDir(dirPath) {
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return { success: false, error: '未找到 Tauri invoke 函数' };
        try {
            await invokeFn('create_dir', { dirPath });
            return { success: true };
        } catch (e) {
            console.error('创建目录失败:', dirPath, e);
            return { success: false, error: e?.message || String(e) };
        }
    }

    async function deleteFile(filePath) {
        let invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return { success: false, error: '未找到 Tauri invoke 函数' };
        try {
            await invokeFn('delete_file', { filePath });
            return { success: true };
        } catch (e) {
            console.error('删除文件失败:', filePath, e);
            return { success: false, error: e?.message || String(e) };
        }
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

    // 自动加载开关：默认全部开启，用户卡顿可关闭
    const settingsConfig = { autoLoadScreenshotStats: true, autoLoadBattleStats: true };

    function loadConfig() {
        try {
            const saved = localStorage.getItem('maDirsConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                // 保存的值覆盖默认值，但空值不覆盖（保留默认值）
                if (parsed.maDirs) {
                    for (const [k, v] of Object.entries(parsed.maDirs)) {
                        if (v && v.trim()) maDirs[k] = v;
                    }
                }
                softwareDataDir = parsed.softwareDataDir || '';
                // 恢复开关状态
                if (typeof parsed.autoLoadScreenshotStats === 'boolean') settingsConfig.autoLoadScreenshotStats = parsed.autoLoadScreenshotStats;
                if (typeof parsed.autoLoadBattleStats === 'boolean') settingsConfig.autoLoadBattleStats = parsed.autoLoadBattleStats;
            }
        } catch (e) {}
        // 确保 window.maDirs 总是有值（包括默认值）
        window.maDirs = maDirs;
        // 如果软件数据目录未设置，使用默认值
        if (!softwareDataDir) {
            softwareDataDir = DEFAULT_SOFTWARE_DATA_DIR;
            try { saveConfig(); } catch(e) {}
        }
    }

    function saveConfig() {
        localStorage.setItem('maDirsConfig', JSON.stringify({
            maDirs,
            softwareDataDir,
            autoLoadScreenshotStats: settingsConfig.autoLoadScreenshotStats,
            autoLoadBattleStats: settingsConfig.autoLoadBattleStats
        }));
        // 保存配置时全量同步所有数据到本地目录（不等防抖，立即写入）
        syncAllNow().catch(() => {});
    }

    // ==================== 初始化 ====================

    // ==================== 磁盘配置恢复（重装/清缓存后复原） ====================
    // 解析真正的软件数据目录：优先读默认目录下的引导标记，避免用户改过目录后重装找不到数据
    async function _resolveRealDataDir() {
        const def = DEFAULT_SOFTWARE_DATA_DIR.replace(/[\\/]+$/, '');
        try {
            const raw = await readTextFile(def + '\\tfjl_datadir.json');
            if (raw) { const d = JSON.parse(raw); if (d && d.dir) return d.dir.replace(/[\\/]+$/, ''); }
        } catch (e) {}
        try {
            const raw = await readTextFile(def + '\\tfjl_maDirsConfig.json');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.value) {
                    const c = JSON.parse(parsed.value);
                    if (c && c.softwareDataDir) return c.softwareDataDir.replace(/[\\/]+$/, '');
                }
            }
        } catch (e) {}
        return def;
    }

    // 启动时从统一存储(tfjl.dat)恢复配置到 localStorage（仅补空 key，不打扰正常会话）
    async function restoreLocalFromDisk() {
        if (!isTauriApp) return;
        const dir = await _resolveRealDataDir();
        await _ensureStoreLoaded(dir);
        let restored = 0;
        for (const [key, val] of _storeMap.entries()) {
            if (RESERVED_KEYS.has(key)) continue;
            if (localStorage.getItem(key) === null && val !== null && val !== undefined) {
                localStorage.setItem(key, val);
                restored++;
            }
        }
        // 恢复项目缓存
        const pj = _storeMap.get(PROJECTS_KEY);
        if (pj) { try { _projectsCache = JSON.parse(pj); } catch (e) {} }
        if (restored > 0) console.log('[数据存储] 已从 tfjl.dat 恢复 ' + restored + ' 项配置');
    }

    // 项目整体落盘：统一写进 tfjl.dat（不再单独 projects/projects.json）
    async function tfjlSaveAllProjects(projectsArray) {
        if (!isTauriApp) return false;
        _projectsCache = projectsArray || [];
        // 立即落盘：项目是重要数据，不能仅依赖防抖/pagehide（APP 关闭时异步写常丢失，导致重启后项目与默认项目丢失）
        if (_syncOk) { syncAllNow().catch(() => {}); }
        else { _scheduleFlush(); }
        return true;
    }

    async function tfjlRestoreAllProjects() {
        if (!isTauriApp) return [];
        if (_projectsCache !== null) return _projectsCache;
        // 兜底：store 尚未加载则现加载
        const dir = await _resolveRealDataDir();
        await _ensureStoreLoaded(dir);
        const pj = _storeMap.get(PROJECTS_KEY);
        if (pj) { try { _projectsCache = JSON.parse(pj); } catch (e) {} }
        return _projectsCache || [];
    }

    async function initAppLocal() {
        const btn = document.getElementById('appLocalSettingsBtn');
        if (btn) btn.style.display = 'flex';
        await restoreLocalFromDisk();  // 先恢复磁盘配置（重装/清缓存后复原）
        loadConfig();
        initDataSync();  // 启动 localStorage → 用户数据目录自动同步
        loadSkinSelections();  // 恢复皮肤选择记录
        // 先扫描本地，再同步远程；如果并行会导致 scanSkins 清空 registry 把远程条目冲掉
        scanSkins().then(() => syncRemoteSkins());
        console.log('[APP] APP本地功能已初始化, isTauriApp:', isTauriApp);
    }

    // ==================== 设置面板 ====================

    function openAppLocalSettings() {
        if (!isTauriApp) return;
        showSettingsModal();
        fillSettingsForm();
        // 扫描文件列表总是执行（轻量）
        scanAllFiles();
        // 自动加载统计：根据开关决定
        if (settingsConfig.autoLoadScreenshotStats) calcScreenshotStats();
        if (settingsConfig.autoLoadBattleStats) calcLogBattleStats();
    }

    // Toggle 开关切换
    function toggleAutoLoadSetting(type) {
        if (type === 'screenshot') {
            settingsConfig.autoLoadScreenshotStats = !settingsConfig.autoLoadScreenshotStats;
            updateToggleUI('screenshot', settingsConfig.autoLoadScreenshotStats);
        } else if (type === 'battle') {
            settingsConfig.autoLoadBattleStats = !settingsConfig.autoLoadBattleStats;
            updateToggleUI('battle', settingsConfig.autoLoadBattleStats);
        }
        saveConfig();
    }

    function updateToggleUI(type, on) {
        const tgl = document.getElementById('tglAuto' + (type === 'screenshot' ? 'Screenshot' : 'Battle'));
        if (!tgl) return;
        tgl.style.background = on ? '#4caf50' : 'rgba(255,255,255,0.15)';
        const knob = tgl.querySelector('span');
        if (knob) knob.style.left = on ? '18px' : '2px';
    }

    function closeAppLocalSettings() {
        const modal = document.getElementById('appLocalSettingsModal');
        if (modal) modal.remove();
    }

    window.toggleMaDirConfig = function() {
        const body = document.getElementById('maDirConfigBody');
        const icon = document.getElementById('maDirToggleIcon');
        const hint = document.getElementById('maDirCollapsedHint');
        if (!body || !icon) return;
        if (body.style.display === 'none') {
            body.style.display = 'block';
            icon.textContent = '▼';
            if (hint) hint.style.display = 'none';
        } else {
            body.style.display = 'none';
            icon.textContent = '▶';
            if (hint) hint.style.display = '';
        }
    };

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

                <div style="background:rgba(0,188,212,0.06);border:1px solid rgba(0,188,212,0.15);border-radius:10px;padding:12px 14px;margin-bottom:12px;">
                    <div onclick="toggleMaDirConfig()" style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
                        <span id="maDirToggleIcon" style="color:#00bcd4;font-size:0.75rem;transition:transform 0.2s;">▶</span>
                        <span style="color:#00bcd4;font-size:0.9rem;font-weight:600;">📂 老马脚本目录配置</span>
                        <span id="maDirCollapsedHint" style="color:rgba(255,255,255,0.35);font-size:0.72rem;">— 点击展开，设置老马电脑上的脚本/对战/截图等目录路径</span>
                    </div>
                    <div id="maDirConfigBody" style="display:none;margin-top:10px;">

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

                <div style="margin-bottom:12px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">截图目录（按日期子文件夹，统计每天打多少局）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_screenshot" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('screenshot')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div>
                    <label style="color:#ff9800;font-size:0.8rem;display:block;margin-bottom:4px;">🔍 对战日志目录（统计胜负等关键词检索）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_logs" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,152,0,0.3);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('logs')" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                    </div>
                </div>

                <div style="margin-bottom:12px;">
                    <label style="color:rgba(255,255,255,0.7);font-size:0.8rem;display:block;margin-bottom:4px;">📝 临时脚本目录（临时存放的文件）</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="maDir_temp" readonly placeholder="未设置" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectMaDir('temp')" style="background:linear-gradient(135deg,#00bcd4,#00838f);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                </div>

                <div style="color:#4caf50;font-size:0.9rem;margin-bottom:12px;">💾 软件数据目录（项目存储位置）</div>
                <div style="margin-bottom:12px;">
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="softwareDataDirInput" readonly placeholder="未设置，默认使用APP安装目录" style="flex:1;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:6px;font-size:0.85rem;">
                        <button onclick="selectSoftwareDataDir()" style="background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">浏览...</button>
                    </div>
                    <div style="color:rgba(255,255,255,0.35);font-size:0.68rem;margin-top:4px;line-height:1.4;">📌 设置后所有APP数据自动以 <b>tfjl_*.json</b> 文件存到此目录，可直接备份、迁移、查看。</div>
                </div>

                <div style="color:#ff9800;font-size:0.9rem;margin-bottom:12px;margin-top:16px;">📦 备份与还原</div>
                <div style="margin-bottom:12px;background:rgba(255,152,0,0.06);border:1px solid rgba(255,152,0,0.2);border-radius:10px;padding:14px;">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button onclick="backupAllData()" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:0.85rem;white-space:nowrap;">📤 一键备份</button>
                        <span style="color:rgba(255,255,255,0.4);font-size:0.72rem;line-height:1.3;">打包所有配置、项目、统计到一个文件</span>
                    </div>
                    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;">
                        <button onclick="loadBackupList()" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.75rem;white-space:nowrap;">📋 查看备份</button>
                        <span style="color:rgba(255,255,255,0.3);font-size:0.68rem;">选择一个备份 → 点「还原」即可一键恢复全部数据</span>
                    </div>
                    <div id="backupFileList" style="margin-top:8px;max-height:180px;overflow:auto;display:none;"></div>
                </div>

                <div style="margin-bottom:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 14px;">
                    <div style="color:rgba(255,255,255,0.5);font-size:0.7rem;margin-bottom:8px;">💡 提示：如果打开设置面板或加载统计时感觉很卡，可尝试关闭以下自动加载功能</div>
                    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                        <label id="lblAutoScreenshot" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;" onclick="toggleAutoLoadSetting('screenshot')">
                            <span id="tglAutoScreenshot" style="display:inline-block;width:36px;height:20px;border-radius:10px;background:#4caf50;position:relative;transition:background 0.2s;">
                                <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:18px;transition:left 0.2s;"></span>
                            </span>
                            <span style="color:rgba(255,255,255,0.7);font-size:0.78rem;">🚗 车主副本统计</span>
                        </label>
                        <label id="lblAutoBattle" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;" onclick="toggleAutoLoadSetting('battle')">
                            <span id="tglAutoBattle" style="display:inline-block;width:36px;height:20px;border-radius:10px;background:#4caf50;position:relative;transition:background 0.2s;">
                                <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:18px;transition:left 0.2s;"></span>
                            </span>
                            <span style="color:rgba(255,255,255,0.7);font-size:0.78rem;">🏆 对战统计</span>
                        </label>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="color:#ffd700;font-size:0.9rem;">📋 扫描到的脚本文件</label>
                        <button onclick="scanAllFiles(true)" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔄 刷新扫描</button>
                    </div>
                    <div id="scannedFileList" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;min-height:60px;max-height:250px;overflow:auto;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">扫描中...</div>
                    </div>
                    <div id="fuzzyStatsArea" style="margin-top:8px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px;min-height:24px;"></div>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <label style="color:#e040fb;font-size:0.9rem;">🚗 车主副本开车统计（按截图数统计每天打多少局）</label>
                        <button onclick="calcScreenshotStats(true)" style="background:linear-gradient(135deg,#9c27b0,#6a1b9a);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📊 强制刷新</button>
                    </div>
                    <div id="screenshotStats" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;min-height:60px;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">配置截图目录后点击统计</div>
                    </div>
                </div>


                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label style="color:#ff9800;font-size:0.9rem;">🏆 对战统计（只支持单开，无法区分多个账号的单独统计）</label>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <button onclick="clearLogBattleCache()" title="清除缓存后下次会重新扫描所有文件" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);border:1px solid rgba(255,255,255,0.1);padding:5px 8px;border-radius:6px;cursor:pointer;font-size:0.7rem;">🗑️ 清除缓存</button>
                            <button onclick="calcLogBattleStats(true)" style="background:linear-gradient(135deg,#ff9800,#e65100);color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">📊 强制刷新</button>
                        </div>
                    </div>
                    <div style="color:rgba(255,255,255,0.25);font-size:0.65rem;margin-bottom:6px;">⚠️ 第一次加载非常慢，建议日志目录只保留1天的文件，其他的移走/删除</div>
                    <div id="logBattleStats" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;min-height:60px;">
                        <div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">配置日志目录后自动统计</div>
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
        document.getElementById('maDir_logs').value = maDirs.logs || '';
        document.getElementById('maDir_temp').value = maDirs.temp || '';
        document.getElementById('softwareDataDirInput').value = softwareDataDir || '';
        // 恢复自动加载开关 UI 状态
        updateToggleUI('screenshot', settingsConfig.autoLoadScreenshotStats);
        updateToggleUI('battle', settingsConfig.autoLoadBattleStats);
    }

    async function selectMaDir(key) {
        const selected = await openFileDialog();
        if (selected) {
            maDirs[key] = selected;
            document.getElementById('maDir_' + key).value = selected;
            scanAllFiles(true); // 目录变化强制重新扫描
        }
    }

    async function selectSoftwareDataDir() {
        const selected = await openFileDialog();
        if (selected) {
            softwareDataDir = selected;
            document.getElementById('softwareDataDirInput').value = selected;
            // 在默认目录写引导标记，确保重装/清缓存后仍能定位到真实数据目录里的 tfjl.dat
            try {
                const guideDir = DEFAULT_SOFTWARE_DATA_DIR.replace(/[\\/]+$/, '');
                await writeTextFile(guideDir + '\\tfjl_datadir.json', JSON.stringify({ dir: selected, savedAt: Date.now() }));
            } catch (e) {}
            initDataSync();  // 目录变了，重新加载统一存储
            saveConfig();    // 保存新目录并全量同步到新位置
        }
    }

    // ==================== 文件扫描 ====================

    // 递归扫描目录（最大深度3层），收集所有 txt/json 文件
    async function collectFilesRecursive(dirPath, dirKey, dirLabel, maxDepth, allowedExts) {
        if (maxDepth === undefined) maxDepth = 3;
        if (allowedExts === undefined) allowedExts = ['txt', 'json'];
        const files = [];
        if (maxDepth <= 0) return files;
        try {
            const entries = await readDir(dirPath);
            for (const entry of entries) {
                if (entry.is_file) {
                    const parts = entry.name.split('.');
                    const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
                    if (allowedExts.includes(ext)) {
                        files.push({
                            name: entry.name,
                            path: entry.path,
                            dir: dirPath,
                            dirKey,
                            dirLabel,
                            ext,
                            category: classifyFile(entry.name, dirKey),
                            modified: entry.modified || ''
                        });
                    }
                } else {
                    // 递归扫描子文件夹
                    const subFiles = await collectFilesRecursive(entry.path, dirKey, dirLabel, maxDepth - 1, allowedExts);
                    files.push(...subFiles);
                }
            }
        } catch (e) {
            console.warn('扫描目录失败:', dirPath, e);
        }
        return files;
    }

    // 计算脚本模糊分类统计（直接复用每个文件的 category 字段）
    function calcFuzzyStats(files) {
        const stats = {};
        for (const f of files) {
            const cat = f.category || '其他';
            stats[cat] = (stats[cat] || 0) + 1;
        }
        // 移除计数为0的分类
        Object.keys(stats).forEach(k => { if (stats[k] === 0) delete stats[k]; });
        return stats;
    }

    // 单文件分类（用于给扫描文件打 category 标签）
    function classifyFile(fileName, dirKey) {
        // 日志目录下的文件统一归为"日志"类
        if (dirKey === 'logs') return '日志';
        // 临时脚本目录下的文件统一归为"临时"类
        if (dirKey === 'temp') return '临时';
        const nameLower = fileName.toLowerCase();
        if (nameLower.includes('寒冰')) return '寒冰';
        if (nameLower.includes('暗月')) return '暗月';
        if (nameLower.includes('漩涡')) return '漩涡';
        if (nameLower.includes('合作')) return '合作';
        if (nameLower.includes('深海')) return '深海';
        if (nameLower.includes('活动')) return '活动';
        return '其他';
    }

    async function scanAllFiles(force = false) {
        const listEl = document.getElementById('scannedFileList');
        const statsEl = document.getElementById('fuzzyStatsArea');
        if (!listEl) return;

        const dirLabels = { coop: '合作', activity: '活动', battle: '对战', battleMax: '对战MAX', screenshot: '截图', logs: '日志', temp: '临时' };
        const allDirs = Object.entries(maDirs).filter(([k, v]) => v && k !== 'screenshot');

        if (allDirs.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">请先配置老马目录</div>';
            if (statsEl) statsEl.innerHTML = '';
            return;
        }

        // 优先使用今日缓存（非强制刷新）
        if (!force) {
            const cache = loadScanCache();
            if (cache && cache.files && cache.files.length > 0) {
                scannedFiles = cache.files;
                renderScannedFiles();
                return;
            }
        }

        listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">扫描中...</div>';
        scannedFiles = [];

        // 递归扫描所有目录（含子文件夹），目录不存在则自动创建
        for (const [key, dir] of allDirs) {
            await createDir(dir);
            const subFiles = await collectFilesRecursive(dir, key, dirLabels[key]);
            scannedFiles.push(...subFiles);
        }

        if (scannedFiles.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到 txt/json 文件</div>';
            if (statsEl) statsEl.innerHTML = '';
            return;
        }

        saveScanCache(scannedFiles);
        renderScannedFiles();
    }

    function renderScannedFiles() {
        const listEl = document.getElementById('scannedFileList');
        const statsEl = document.getElementById('fuzzyStatsArea');
        if (!listEl) return;

        // 筛选处理
        let displayFiles = scannedFiles;
        if (_scannedFilterCategory && _scannedFilterCategory !== '全部') {
            displayFiles = displayFiles.filter(f => (f.category || '其他') === _scannedFilterCategory);
        }
        if (_scannedFilterKeyword) {
            const kw = _scannedFilterKeyword.toLowerCase();
            displayFiles = displayFiles.filter(f => f.name.toLowerCase().includes(kw));
        }

        if (displayFiles.length === 0) {
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到 txt/json 文件</div>';
            if (statsEl) statsEl.innerHTML = '';
            window.scannedFiles = scannedFiles;
            return;
        }

        const cats = ['全部', '寒冰', '暗月', '漩涡', '合作', '深海', '活动', '日志', '临时', '其他'];
        const colorMap = {
            '全部': '#ffffff', '寒冰': '#64b5f6', '暗月': '#ce93d8', '漩涡': '#4fc3f7',
            '合作': '#ffd54f', '深海': '#4db6ac', '活动': '#ff8a65', '日志': '#ef5350', '临时': '#a5d6a7', '其他': '#bdbdbd'
        };

        // 顶部工具栏
        let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);">';
        html += '<input type="text" id="scannedFileSearchInput" value="' + _scannedFilterKeyword.replace(/"/g, '&quot;') + '" placeholder="🔍 搜索文件名…" oninput="setScannedFilterKeyword(this.value)" style="flex:1;min-width:120px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:0.8rem;box-sizing:border-box;">';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
        cats.forEach(cat => {
            const active = _scannedFilterCategory === cat;
            const color = colorMap[cat] || '#bdbdbd';
            const count = cat === '全部' ? scannedFiles.length : scannedFiles.filter(f => (f.category || '其他') === cat).length;
            html += `<button onclick="setScannedFilterCategory('${cat}')" style="background:${active ? color : 'rgba(255,255,255,0.06)'};color:${active ? '#000' : color};border:1px solid ${active ? color : 'rgba(255,255,255,0.12)'};padding:3px 10px;border-radius:14px;cursor:pointer;font-size:0.7rem;transition:all 0.15s;" title="${cat} ${count}个">${cat}${cat !== '全部' && count > 0 ? ' (' + count + ')' : ''}</button>`;
        });
        html += '</div>';
        html += `<button id="scannedShareModeBtn" onclick="toggleScannedShareMode()" title="${_shareModeScanned ? '退出分享模式' : '分享模式：快速分享到需求墙'}" style="background:${_shareModeScanned ? 'linear-gradient(135deg,#ff6b6b,#ff9e80)' : 'linear-gradient(135deg,#7c4dff,#b388ff)'};color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:bold;white-space:nowrap;">${_shareModeScanned ? '📢 退出分享' : '📢 分享模式'}</button>`;
        if (_shareModeScanned) {
            html += '<button id="batchScannedShareFromMainBtn" onclick="doBatchShareScannedFromMain()" style="background:linear-gradient(135deg,#ff6b6b,#ff9e80);color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:bold;opacity:0.5;white-space:nowrap;">📢 批量分享</button>';
        }
        html += '</div>';

        if (_shareModeScanned) {
            // 分享模式：扁平列表，文件名点击直接分享，勾选批量分享
            html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0;color:rgba(255,255,255,0.6);font-size:0.75rem;">
                <span>📢 分享模式：点击文件名直接分享，或勾选批量分享</span>
                <label style="cursor:pointer;font-size:0.7rem;"><input type="checkbox" onchange="toggleAllScannedShareSelectsFromMain(this.checked)" style="cursor:pointer;vertical-align:middle;"> 全选</label>
            </div>`;
            html += '<div style="display:flex;flex-direction:column;gap:5px;">';
            displayFiles.forEach(f => {
                const cat = f.category || '其他';
                const color = colorMap[cat] || '#bdbdbd';
                const escPath = escapeHtml(f.path);
                const escName = escapeHtml(f.name);
                html += `<div class="scanned-share-row" style="display:flex;align-items:center;gap:8px;background:${color}15;border:1px solid ${color}40;border-left:3px solid ${color};border-radius:6px;padding:8px 10px;">
                    <input type="checkbox" class="scanned-share-checkbox" data-scanned-path="${escPath}" onchange="toggleScannedShareSelectFromMain(this.getAttribute('data-scanned-path'), this.checked)" style="flex-shrink:0;cursor:pointer;accent-color:${color};">
                    <div style="flex:1;overflow:hidden;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:${color};font-size:0.65rem;padding:1px 6px;border-radius:8px;background:${color}25;flex-shrink:0;">${cat}</span>
                            <span data-scanned-path="${escPath}" data-scanned-name="${escName}" onclick="shareScannedFileFromMain(this.getAttribute('data-scanned-path'), this.getAttribute('data-scanned-name'))" style="color:#fff;font-weight:bold;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" title="点击分享到需求墙">${f.name}</span>
                        </div>
                        <div style="color:rgba(255,255,255,0.35);font-size:0.7rem;">${f.dirLabel}</div>
                    </div>
                    <button data-scanned-path="${escPath}" data-scanned-name="${escName}" onclick="shareScannedFileFromMain(this.getAttribute('data-scanned-path'), this.getAttribute('data-scanned-name'))" title="分享到需求墙" style="background:linear-gradient(135deg,#ff6b6b,#ff9e80);color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:bold;white-space:nowrap;flex-shrink:0;">📢 分享</button>
                </div>`;
            });
            html += '</div>';
        } else {
            // 普通模式：按目录分组
            const grouped = {};
            displayFiles.forEach(f => {
                if (!grouped[f.dirLabel]) grouped[f.dirLabel] = [];
                grouped[f.dirLabel].push(f);
            });
            let drGlobalIdx = 0;
            for (const [label, files] of Object.entries(grouped)) {
                html += `<div style="color:#00bcd4;font-size:0.75rem;margin:8px 0 4px;font-weight:bold;">${label}（${files.length}个）</div>`;
                files.forEach((f, fi) => {
                    const icon = f.ext === 'json' ? '🔵' : '📄';
                    const safePath = f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    const drBtnId = 'drbtn_' + (drGlobalIdx++);
                    html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span>${icon}</span>
                        <span style="color:#fff;font-size:0.8rem;flex:1;word-break:break-all;">${f.name}</span>
                        <button id="${drBtnId}" onclick="computeFileDr('${safePath}','${drBtnId}')" title="计算减伤" style="background:rgba(255,152,0,0.2);color:#ff9800;border:1px solid rgba(255,152,0,0.3);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">🛡️</button>
                        <button onclick="detectFileEncoding('${safePath}')" style="background:rgba(156,39,176,0.3);color:#ce93d8;border:1px solid rgba(156,39,176,0.3);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">编码</button>
                        <button onclick="viewFile('${safePath}')" style="background:rgba(0,188,212,0.3);color:#00bcd4;border:1px solid rgba(0,188,212,0.3);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">查看</button>
                        <button onclick="loadFileToHand('${safePath}')" style="background:rgba(76,175,80,0.3);color:#4caf50;border:1px solid rgba(76,175,80,0.3);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">加载</button>
                    </div>`;
                });
            }
        }
        listEl.innerHTML = html;
        window.scannedFiles = scannedFiles;
        refreshBatchScannedShareBtnFromMain();

        // 显示模糊分类统计
        if (statsEl) {
            const fuzzyStats = calcFuzzyStats(scannedFiles);
            const entries = Object.entries(fuzzyStats);
            if (entries.length > 0) {
                const total = entries.reduce((sum, [, c]) => sum + c, 0);
                let statsHtml = '<div style="color:#ffd700;font-size:0.75rem;margin-bottom:6px;">🏷️ 脚本分类模糊统计（共<span style="color:#fff;font-weight:bold;">' + total + '</span>个）：</div>';
                statsHtml += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
                for (const [kw, count] of entries) {
                    const pct = Math.round(count / total * 100);
                    const color = colorMap[kw] || '#bdbdbd';
                    const active = _scannedFilterCategory === kw;
                    statsHtml += `<button onclick="setScannedFilterCategory('${kw}')" style="background:${active ? color : 'rgba(255,255,255,0.06)'};color:${active ? '#000' : '#fff'};border:1px solid ${active ? color : 'rgba(255,255,255,0.12)'};border-radius:6px;padding:4px 10px;font-size:0.8rem;cursor:pointer;transition:all 0.15s;">
                        <span style="color:${active ? '#000' : color};font-weight:bold;">${kw}</span>
                        <span style="color:${active ? '#000' : '#fff'};margin-left:4px;">${count}个</span>
                        <span style="color:${active ? '#000' : 'rgba(255,255,255,0.4)'};font-size:0.7rem;margin-left:2px;">(${pct}%)</span>
                    </button>`;
                }
                statsHtml += '</div>';
                statsEl.innerHTML = statsHtml;
            } else {
                statsEl.innerHTML = '';
            }
        }
    }

    function getScannedCategoryColor(cat) {
        const map = {
            '全部': '#ffffff', '寒冰': '#64b5f6', '暗月': '#ce93d8', '漩涡': '#4fc3f7',
            '合作': '#ffd54f', '深海': '#4db6ac', '活动': '#ff8a65', '日志': '#ef5350', '临时': '#a5d6a7', '其他': '#bdbdbd'
        };
        return map[cat] || '#bdbdbd';
    }

    function toggleScannedShareMode() {
        _shareModeScanned = !_shareModeScanned;
        _selScannedSharePaths.clear();
        renderScannedFiles();
    }

    function setScannedFilterKeyword(val) {
        _scannedFilterKeyword = (val || '').trim();
        _selScannedSharePaths.clear();
        renderScannedFiles();
    }

    function setScannedFilterCategory(cat) {
        _scannedFilterCategory = cat || '全部';
        _selScannedSharePaths.clear();
        renderScannedFiles();
    }

    function toggleScannedShareSelectFromMain(path, checked) {
        if (checked) _selScannedSharePaths.add(path);
        else _selScannedSharePaths.delete(path);
        refreshBatchScannedShareBtnFromMain();
    }

    function toggleAllScannedShareSelectsFromMain(checked) {
        _selScannedSharePaths.clear();
        if (checked) {
            document.querySelectorAll('.scanned-share-checkbox').forEach(cb => { cb.checked = true; _selScannedSharePaths.add(cb.getAttribute('data-scanned-path')); });
        } else {
            document.querySelectorAll('.scanned-share-checkbox').forEach(cb => { cb.checked = false; });
        }
        refreshBatchScannedShareBtnFromMain();
    }

    function refreshBatchScannedShareBtnFromMain() {
        const btn = document.getElementById('batchScannedShareFromMainBtn');
        if (!btn) return;
        const n = _selScannedSharePaths.size;
        btn.textContent = n > 0 ? `📢 批量分享 (${n})` : '📢 批量分享';
        btn.style.opacity = n > 0 ? '1' : '0.5';
    }

    async function doBatchShareScannedFromMain() {
        const paths = Array.from(_selScannedSharePaths);
        if (paths.length === 0) { alert('请先勾选要分享的扫描文件'); return; }
        if (!window.batchShareScannedFilesToWall) { alert('批量分享功能未加载，请刷新页面'); return; }
        const fileList = paths.map(p => {
            const f = scannedFiles.find(sf => sf.path === p);
            return f ? { path: f.path, name: f.name } : null;
        }).filter(Boolean);
        window.batchShareScannedFilesToWall(fileList);
    }

    function shareScannedFileFromMain(path, name) {
        if (window.shareScannedFileToWall) {
            window.shareScannedFileToWall(path, name);
        } else {
            alert('分享功能未加载，请刷新页面');
        }
    }


    // 扫描列表中点击 🛡️ 按钮：读取文件内容并计算减伤
    async function computeFileDr(filePath, btnId) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.textContent = '...';
        btn.disabled = true;

        try {
            const content = await readTextFile(filePath);
            if (!content) {
                btn.textContent = '❌';
                btn.title = '文件读取失败';
                btn.disabled = false;
                return;
            }
            // 调用 index.html 暴露的 computeScriptDr
            const drInfo = window.computeScriptDr ? window.computeScriptDr(content) : null;
            if (!drInfo) {
                btn.textContent = '—';
                btn.title = '未找到上阵信息';
                btn.style.background = 'rgba(255,255,255,0.06)';
                btn.style.color = 'rgba(255,255,255,0.3)';
                btn.style.border = '1px solid rgba(255,255,255,0.1)';
                btn.disabled = false;
                return;
            }

            // 颜色：<100红 <130金 >=130青
            let drColor = '#4ecdc4';
            if (drInfo.first7 < 100) drColor = '#ff6b6b';
            else if (drInfo.first7 < 130) drColor = '#ffd700';

            btn.innerHTML = '<b style="color:' + drColor + '">' + drInfo.first7 + '%</b>';
            btn.title = '前7减伤：' + drInfo.first7 + '% | 全部减伤：' + drInfo.all + '%';
            btn.style.background = 'rgba(255,152,0,0.2)';
            btn.style.color = drColor;
            btn.style.border = '1px solid rgba(255,152,0,0.4)';
        } catch (e) {
            btn.textContent = '❌';
            btn.title = '读取异常: ' + (e.message || e);
        }
        btn.disabled = false;
    }

    // 静默扫描（不上报UI，专门给脚本文件tab搜索用）
    async function silentScanFiles() {
        if (!maDirs) return;
        const dirLabels = { coop: '合作', activity: '活动', battle: '对战', battleMax: '对战MAX', screenshot: '截图', logs: '日志', temp: '临时' };
        const allDirs = Object.entries(maDirs).filter(([k, v]) => v && k !== 'screenshot');
        if (allDirs.length === 0) return;

        // 优先使用今日缓存（与 scanAllFiles 共享同一缓存 key）
        // 避免每次切"脚本文件"标签都做全量 IPC 扫描导致卡顿
        const cache = loadScanCache();
        if (cache && cache.files && cache.files.length > 0) {
            scannedFiles = cache.files;
            window.scannedFiles = scannedFiles;
            return;
        }
        // 兜底：缓存还没写完时（延迟写入 500ms），用内存中的 scannedFiles
        if (scannedFiles && scannedFiles.length > 0) {
            window.scannedFiles = scannedFiles;
            return;
        }

        scannedFiles = [];
        for (const [key, dir] of allDirs) {
            await createDir(dir);
            const subFiles = await collectFilesRecursive(dir, key, dirLabels[key]);
            scannedFiles.push(...subFiles);
        }
        window.scannedFiles = scannedFiles;
        // 保存缓存，后续切标签或打开设置无需重新扫描
        if (scannedFiles.length > 0) saveScanCache(scannedFiles);
    }

    // ==================== 全局备份与还原 ====================

    async function backupAllData() {
        if (!softwareDataDir) { alert('请先设置 💾 软件数据目录'); return; }

        // 收集所有 localStorage 数据
        const localStorageData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) localStorageData[k] = localStorage.getItem(k);
        }

        // 收集 IndexedDB 数据
        let projects = [], dbCategories = [];
        try {
            if (window.db) {
                projects = await new Promise((res, rej) => {
                    const tx = window.db.transaction(['projects'], 'readonly');
                    const store = tx.objectStore('projects');
                    const req = store.getAll();
                    req.onsuccess = () => res(req.result || []);
                    req.onerror = () => rej(req.error);
                });
            }
            dbCategories = window.categories || [];
        } catch (e) {
            console.error('[备份] IndexedDB读取失败:', e);
        }

        const backup = {
            type: 'tfjl-full-backup',
            version: '1.0',
            backupDate: new Date().toISOString(),
            localStorage: localStorageData,
            indexedDB: { projects, categories: dbCategories }
        };

        const d = new Date();
        const ts = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0') + '_' +
            String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
        const fileName = 'tfjl-full-backup-' + ts + '.json';
        const filePath = softwareDataDir.replace(/[\\/]+$/, '') + '\\' + fileName;

        // 自动创建目录（目录被删除或从旧版本升级时常见）
        const dirExists = await pathExists(softwareDataDir);
        if (!dirExists) {
            const createResult = await createDir(softwareDataDir);
            if (!createResult.success) {
                alert('❌ 备份失败：无法创建数据目录\n\n目录：' + softwareDataDir + '\n错误：' + createResult.error);
                return;
            }
        }

        const result = await writeTextFileWithError(filePath, JSON.stringify(backup, null, 2));
        if (result.success) {
            alert('✅ 备份成功！\n\n文件：' + fileName + '\n配置项：' + Object.keys(localStorageData).length +
                ' 个\n项目：' + projects.length + ' 个\n\n存放位置：\n' + softwareDataDir);
            loadBackupList(); // 刷新备份列表
        } else {
            alert('❌ 备份失败：' + result.error + '\n\n请检查目录是否有写入权限，或尝试换一个数据目录。');
        }
    }

    async function loadBackupList() {
        if (!softwareDataDir) { alert('请先设置 💾 软件数据目录'); return; }
        const dir = softwareDataDir.replace(/[\\/]+$/, '');
        let entries;
        try { entries = await readDir(dir); }
        catch (e) { alert('无法读取数据目录'); return; }

        const backupFiles = entries
            .filter(e => e.is_file && e.name.startsWith('tfjl-full-backup-') && e.name.endsWith('.json'))
            .sort((a, b) => b.name.localeCompare(a.name)); // 最新在前

        const listDiv = document.getElementById('backupFileList');
        if (!listDiv) return;
        listDiv.style.display = 'block';

        if (backupFiles.length === 0) {
            listDiv.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:10px;font-size:0.75rem;">暂无备份文件，点击上方「📤 一键备份」创建</div>';
            return;
        }

        listDiv.innerHTML = backupFiles.map(f => {
            const displayTs = f.name.replace('tfjl-full-backup-', '').replace('.json', '');
            const parts = displayTs.split('_');
            const displayName = parts[0] + ' ' + (parts[1] ? parts[1].slice(0, 2) + ':' + parts[1].slice(2) : '');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:6px;">' +
                '<span style="color:#fff;font-size:0.78rem;">📦 ' + displayName + '</span>' +
                '<div style="display:flex;gap:6px;">' +
                '<button class="_restoreBackupBtn" data-filename="' + f.name + '" style="background:linear-gradient(135deg,#2196f3,#1565c0);color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.7rem;">还原</button>' +
                '<button class="_deleteBackupBtn" data-filename="' + f.name + '" style="background:rgba(244,67,54,0.3);color:#ef5350;border:1px solid rgba(244,67,54,0.3);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.7rem;">删除</button>' +
                '</div>' +
                '</div>';
        }).join('');

        listDiv.querySelectorAll('._restoreBackupBtn').forEach(btn => {
            btn.addEventListener('click', () => restoreFromBackup(btn.dataset.filename));
        });
        listDiv.querySelectorAll('._deleteBackupBtn').forEach(btn => {
            btn.addEventListener('click', () => deleteBackup(btn.dataset.filename));
        });
    }

    async function deleteBackup(fileName) {
        if (!softwareDataDir) return;
        if (!confirm('确定要删除备份「' + fileName + '」吗？\n此操作不可撤销。')) return;
        const filePath = softwareDataDir.replace(/[\\/]+$/, '') + '\\' + fileName;
        const result = await deleteFile(filePath);
        if (result.success) {
            alert('✅ 备份已删除：' + fileName);
            loadBackupList();
        } else {
            alert('❌ 删除失败：' + result.error);
        }
    }

    async function restoreFromBackup(fileName) {
        if (!softwareDataDir) return;
        const filePath = softwareDataDir.replace(/[\\/]+$/, '') + '\\' + fileName;
        const raw = await readTextFile(filePath);
        if (!raw) { alert('❌ 无法读取备份文件'); return; }

        let backup;
        try { backup = JSON.parse(raw); } catch (e) { alert('❌ 备份文件格式错误'); return; }
        if (backup.type !== 'tfjl-full-backup') { alert('❌ 不是有效的备份文件'); return; }

        const lsKeys = Object.keys(backup.localStorage || {}).length;
        const projCount = (backup.indexedDB && backup.indexedDB.projects || []).length;
        const catCount = (backup.indexedDB && backup.indexedDB.categories || []).length;

        if (!confirm('确定要还原此备份吗？\n\n📋 备份日期：' + (backup.backupDate || '未知') +
            '\n🔑 配置项：' + lsKeys + ' 个' +
            '\n📁 项目：' + projCount + ' 个' +
            '\n📂 分类：' + catCount + ' 个' +
            '\n\n⚠️ 当前所有数据将被覆盖！\n建议先点击「一键备份」保存当前数据。')) {
            return;
        }

        // 还原 localStorage
        if (backup.localStorage) {
            for (const [key, value] of Object.entries(backup.localStorage)) {
                try { localStorage.setItem(key, value); }
                catch (e) { console.error('[还原] localStorage写入失败:', key, e); }
            }
        }

        // 还原 IndexedDB
        if (backup.indexedDB && window.db) {
            try {
                if (backup.indexedDB.projects && backup.indexedDB.projects.length > 0) {
                    await new Promise((res, rej) => {
                        const tx = window.db.transaction(['projects'], 'readwrite');
                        const store = tx.objectStore('projects');
                        for (const p of backup.indexedDB.projects) store.put(p);
                        tx.oncomplete = res;
                        tx.onerror = rej;
                    });
                }
                if (backup.indexedDB.categories && backup.indexedDB.categories.length > 0) {
                    window.categories = backup.indexedDB.categories;
                    if (typeof window.saveCategories === 'function') window.saveCategories();
                }
            } catch (e) { console.error('[还原] IndexedDB恢复失败:', e); }
        }

        alert('✅ 还原完成！建议刷新页面以应用所有配置。');
        if (confirm('立即刷新页面？')) { location.reload(); }
    }

    function saveSettingsAndClose() {
        saveConfig();
        closeAppLocalSettings();
    }

    // ==================== 文件查看/编辑器 ====================

    async function detectFileEncoding(filePath) {
        try {
            // 优先调用 Rust 后端专用检测命令
            if (typeof window.__TAURI_INTERNALS__ !== 'undefined' && window.__TAURI_INTERNALS__.invoke) {
                const encoding = await window.__TAURI_INTERNALS__.invoke('detect_file_encoding', { filePath });
                alert(`文件编码：${encoding}\n路径：${filePath}`);
                return;
            }
        } catch (e) {
            // 老版本 APP 没有该命令，回退：读出来看是否成功
            console.warn('[detectFileEncoding] 后端检测失败:', e);
        }
        try {
            const content = await readTextFile(filePath);
            if (content === null) {
                alert('无法读取文件');
                return;
            }
            // 简单启发：出现大量 � 或乱码字符，多半是 GBK/ANSI
            const hasReplacement = content.includes('\uFFFD');
            const hasGarbled = /[\u0080-\u00FF]{3,}/.test(content) && !/[\u4e00-\u9fa5]/.test(content);
            alert(`简易检测：\n路径：${filePath}\n是否含替换符：${hasReplacement ? '是（可能为 GBK/ANSI）' : '否'}\n疑似乱码：${hasGarbled ? '是' : '否'}`);
        } catch (e) {
            alert('检测失败：' + e.message);
        }
    }

    async function viewFile(filePath) {
        try {
            const content = await readTextFile(filePath);
            if (content === null) {
                alert('读取文件失败');
                return;
            }
            // 计算减伤信息
            let drInfo = null;
            try {
                drInfo = window.computeScriptDr ? window.computeScriptDr(content) : null;
            } catch (e) {}
            showFileEditor(filePath, content, null, null, drInfo);
        } catch (e) {
            alert('读取文件失败：' + e.message);
        }
    }

    function showFileEditor(filePath, content, secondFilePath, secondContent, drInfo) {
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
            // 计算减伤标题
            let drBadgeHtml = '';
            if (drInfo && typeof drInfo.first7 === 'number') {
                let drColor = '#4ecdc4';
                if (drInfo.first7 < 100) drColor = '#ff6b6b';
                else if (drInfo.first7 < 130) drColor = '#ffd700';
                const drLabel = drInfo.first7 > 0 ? `🛡️ 减伤 ${drInfo.first7}%` : `🛡️ 未配置减伤`;
                drBadgeHtml = `<span style="color:${drColor};font-size:0.9rem;font-weight:bold;margin-left:10px;">${drLabel}</span>`;
            }
            modal.innerHTML = `
                <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid rgba(0,188,212,0.5);border-radius:12px;padding:20px;width:700px;max-width:95vw;height:85vh;display:flex;flex-direction:column;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <div>
                            <h3 style="color:#fff;margin:0;font-size:1.1rem;">📄 ${fileName}${drBadgeHtml}</h3>
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
        if (ok.success) {
            alert('✅ 文件已删除');
            scanAllFiles();
        } else {
            alert('删除失败：' + (ok.error || '未知错误'));
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

    async function calcScreenshotStats(force = false) {
        const statsEl = document.getElementById('screenshotStats');
        if (!statsEl) return;

        const screenshotDir = maDirs.screenshot;
        if (!screenshotDir) {
            statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">请先配置截图目录</div>';
            return;
        }

        // 老马电脑的日期目录是 MM-DD，统一补齐为 YYYY-MM-DD 再参与统计
        const normalizeDirDate = (dirName) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dirName)) return dirName;
            const m = dirName.match(/^(\d{2})-(\d{2})$/);
            if (!m) return dirName;
            const now = new Date();
            let year = now.getFullYear();
            const candidate = new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
            // 未来日期视为去年（跨年目录）
            if (candidate > new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
                year--;
            }
            return `${year}-${m[1]}-${m[2]}`;
        };

        // 优先使用今日缓存（非强制刷新，且缓存中有实际数据）
        if (!force) {
            const cache = loadStatsCache();
            if (cache && cache.stats && cache.stats.length > 0) {
                // 兼容旧缓存中的 MM-DD 日期（归一化为 YYYY-MM-DD，确保周一~周日统计匹配）
                cache.stats = cache.stats.map(s => ({ ...s, date: normalizeDirDate(s.date) }));
                await saveScreenshotPersistStore(cache.stats); // 确保持久化包含今日数据
                const merged = await mergeScreenshotPersist(cache.stats);
                if (merged.length > 0) {
                    renderScreenshotStats(merged);
                    return;
                }
            }
        }

        statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">统计中...</div>';

        try {
            const entries = await readDir(screenshotDir);
            const allDateDirs = entries.filter(e => !e.is_file);
            const todayStr = getTodayStr();
            const imageExts = ['png', 'jpg', 'jpeg', 'bmp', 'webp'];

            // 始终扫描磁盘上实际存在的日期目录（游戏仅保留约7天，目录数极少、开销可忽略）。
            // 这能修复「某天在首次全量扫描时缺失后永远补不回来」的问题：
            // 只要该天的目录还在磁盘上，重新统计时就会被重新计入，周一~周日图表即可显示。
            let stats = [];
            const scannedDates = new Set();
            for (const dir of allDateDirs) {
                const dname = normalizeDirDate(dir.name);
                if (scannedDates.has(dname)) continue; // 跳过重复目录名
                scannedDates.add(dname);
                try {
                    const files = await readDir(dir.path);
                    let count = 0;
                    for (const f of files) {
                        if (f.is_file) {
                            const ext = f.name.split('.').pop().toLowerCase();
                            if (imageExts.includes(ext)) count++;
                        }
                    }
                    stats.push({ date: dname, count, path: dir.path });
                } catch (e) {
                    console.warn('统计目录失败:', dir.path, e);
                }
            }
            stats.sort((a, b) => b.date.localeCompare(a.date));

            // 扫描结果缓存 + 持久化累积（Math.max 累加，长期保留历史）
            saveStatsCache(stats);
            await saveScreenshotPersistStore(stats);
            const merged = await mergeScreenshotPersist(stats);  // 合并长期历史数据（超磁盘保留期的天数）

            if (merged.length === 0) {
                statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到截图文件</div>';
                return;
            }

            renderScreenshotStats(merged);
        } catch (e) {
            statsEl.innerHTML = '<div style="color:#f44336;text-align:center;padding:20px;font-size:0.85rem;">统计失败：' + e.message + '</div>';
        }
    }

    // 渲染截图统计（纯 UI，由 calcScreenshotStats 或缓存加载后调用）
    function renderScreenshotStats(stats) {
        const statsEl = document.getElementById('screenshotStats');
        if (!statsEl) return;

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

        const barWidth = Math.min(28, Math.max(14, Math.floor(420 / stats.length)));
        const chartHeight = 120;
        html += `<div style="display:flex;align-items:flex-end;gap:6px;height:${chartHeight}px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);overflow-x:auto;">`;
        for (const s of stats) {
            const h = Math.max(4, Math.round((s.count / maxCount) * (chartHeight - 20)));
            const color = s.count >= avgCount ? '#e040fb' : '#7c4dff';
            html += `<div style="display:flex;flex-direction:column;align-items:center;min-width:${barWidth}px;">
                <div style="color:#fff;font-size:0.65rem;margin-bottom:2px;">${s.count}</div>
                <div style="width:${Math.max(8, barWidth - 6)}px;height:${h}px;background:linear-gradient(180deg,${color},rgba(156,39,176,0.3));border-radius:3px 3px 0 0;" title="${s.date}: ${s.count}局"></div>
                <div style="color:rgba(255,255,255,0.5);font-size:0.6rem;margin-top:2px;">${s.date}</div>
            </div>`;
        }
        html += `</div>`;

        // 最近7天 · 周一~周日（每天独立一柱，不是聚合！今天数据→对应星期几）
        const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const weekDayDow = [1, 2, 3, 4, 5, 6, 0]; // getDay() 值
        const today = new Date();
        const todayDow = today.getDay();
        const formatLocalDate = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        // 建立日期→计数映射（同时兼容 MM-DD 旧格式，避免周X图表查不到）
        const dateMap = {};
        stats.forEach(s => {
            dateMap[s.date] = s.count || 0;
            if (/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
                dateMap[s.date.slice(5)] = s.count || 0; // "07-21" 兜底
            }
        });
        // 计算每列对应的日期和计数
        const wdData = weekDayDow.map((dow, i) => {
            let daysBack = todayDow - dow;
            if (daysBack < 0) daysBack += 7;
            const d = new Date(today);
            d.setDate(d.getDate() - daysBack);
            const ds = formatLocalDate(d);
            return { label: weekDayLabels[i], dow, count: dateMap[ds] || 0, date: ds };
        });
        const recent = stats.slice(0, 30);
        const wdMax = Math.max(1, ...wdData.map(d => d.count));
        html += `<div style="margin-top:12px;"><div style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin-bottom:6px;">周一~周日</div>`;
        for (let i = 0; i < 7; i++) {
            const d = wdData[i];
            const bar = '█'.repeat(Math.min(20, Math.round(d.count / wdMax * 20)));
            const todayMark = (d.date === formatLocalDate(new Date())) ? ' · 今天' : '';
            html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.78rem;">
                <span style="color:rgba(255,255,255,0.7);width:42px;">${d.label}</span>
                <span title="${d.date}" style="color:#e040fb;font-family:monospace;">${bar}</span>
                <span style="color:#fff;font-weight:bold;width:30px;">${d.count}局</span>
                <span style="color:rgba(255,255,255,0.4);font-size:0.65rem;">${d.date.slice(5)}</span>
            </div>`;
        }
        html += `</div>`;

        // 最近30天趋势图（SVG柱状图 + 折线，近→远）
        if (recent.length > 0) {
            const chartW = Math.max(380, recent.length * 20 + 40);
            const padL = 30, padR = 10, padT = 16, padB = 16;
            const hMax = Math.max(1, Math.max(...recent.map(s => s.count)));
            const chartH = padT + 100 + padB;
            const plotW = chartW - padL - padR;
            const plotH = 100;
            const barGap = 6;
            const barW = Math.min(16, Math.max(14, Math.floor((plotW - (recent.length - 1) * barGap) / recent.length)));

            const gridLines = [0.25, 0.5, 0.75, 1.0];
            let gridHtml = gridLines.map(r => {
                const gy = padT + plotH * (1 - r);
                return `<line x1="${padL}" y1="${gy}" x2="${padL + plotW}" y2="${gy}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><text x="${padL - 4}" y="${gy + 3}" fill="rgba(255,255,255,0.25)" font-size="8" text-anchor="end">${Math.round(hMax * r)}</text>`;
            }).join('');

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
                barsHtml += `<defs><linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${light}" stop-opacity="0.95"/><stop offset="100%" stop-color="${c}" stop-opacity="0.85"/></linearGradient></defs>`;
                barsHtml += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="url(#grad${i})"/>`;
                barsHtml += `<text x="${cx}" y="${by - 4}" fill="rgba(255,255,255,0.7)" font-size="9" font-weight="bold" text-anchor="middle">${s.count}</text>`;
                barsHtml += `<text x="${cx}" y="${padT + plotH + 13}" fill="rgba(255,255,255,0.45)" font-size="9" text-anchor="middle">${s.date.slice(5)}</text>`;
                points += `${cx},${cy} `;
            });

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
    }

    // ==================== 日志胜负统计（缓存优化：仅扫描今日，历史数据走 localStorage） ====================
    // ===== 日志文件模式学习引擎 =====
    // 从已缓存的文件中学习：哪些目录/扩展名/命名关键词的文件才包含「对战胜利/失败确定」
    // 学习期策略：必须积累足够多、跨越足够多天的样本后才启用过滤，避免早期样本偏差导致永久漏文件
    function learnLogPatterns(cache) {
        if (cache._patterns) return cache._patterns; // 已学习过，直接返回
        if (!cache._files) return null;

        const entries = Object.entries(cache._files);

        // 正面样本：有对战数据的文件（win > 0）
        const matched = entries.filter(([, d]) => typeof d.win === 'number' && d.win > 0);
        // 负面样本：扫描过但确认无对战数据的文件（win === -1）
        const negative = entries.filter(([, d]) => d.win === -1);

        // === 学习期门槛：≥20 个有效文件 且 覆盖 ≥5 个不同日期 ===
        // 太少的样本偏差大（比如只扫了3天的.txt就漏掉.log），等数据够多了再启用过滤
        const MIN_POSITIVE_FILES = 20;
        const MIN_UNIQUE_DATES = 5;

        if (matched.length < MIN_POSITIVE_FILES) {
            console.log('[学习] 正面样本不足（' + matched.length + '/' + MIN_POSITIVE_FILES + '），暂不启用学习过滤，所有文件都扫描');
            return null;
        }

        // 统计覆盖的不同日期数（用缓存中已提取的 date 字段）
        const uniqueDates = new Set();
        for (const [, d] of matched) {
            if (d.date && d.date.length >= 8) uniqueDates.add(d.date.substring(0, 8)); // YYYYMMDD
        }
        if (uniqueDates.size < MIN_UNIQUE_DATES) {
            console.log('[学习] 覆盖天数不足（' + uniqueDates.size + '/' + MIN_UNIQUE_DATES + '），暂不启用学习过滤');
            return null;
        }

        const total = matched.length;

        // === 正面学习：统计扩展名/目录/文件名关键词分布 ===
        const extCount = {};
        const dirCount = {};
        const tokenCount = {};

        for (const [path] of matched) {
            const norm = path.replace(/\\/g, '/');
            const filename = norm.split('/').pop() || '';

            // 扩展名
            const ext = (filename.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
            extCount[ext] = (extCount[ext] || 0) + 1;

            // 目录：保留完整父目录路径
            const parts = norm.split('/');
            parts.pop();
            if (parts.length > 0) {
                const dir = parts.join('/');
                dirCount[dir] = (dirCount[dir] || 0) + 1;
            }

            // 文件名 token：按非字母数字/中文分割，保留 ≥2 字符的片段
            const baseName = filename.replace(/\.[^.]+$/, '');
            const tokens = baseName.split(/[^\u4e00-\u9fff\w]+/).filter(t => t.length >= 2);
            for (const t of tokens) {
                const lower = t.toLowerCase();
                tokenCount[lower] = (tokenCount[lower] || 0) + 1;
            }
        }

        // === 负面学习：统计"已确认无数据"的文件所在目录 ===
        const skipDirCount = {};
        const positiveDirSet = new Set(Object.keys(dirCount));
        for (const [path] of negative) {
            const norm = path.replace(/\\/g, '/');
            const parts = norm.split('/');
            parts.pop();
            if (parts.length > 0) {
                const dir = parts.join('/');
                if (!positiveDirSet.has(dir) && ![...positiveDirSet].some(pd => dir.startsWith(pd))) {
                    skipDirCount[dir] = (skipDirCount[dir] || 0) + 1;
                }
            }
        }

        // === 特征筛选：绝对数量 OR 比例 双门槛，防止小众但真实有用的特征被漏掉 ===
        // 扩展名：出现 ≥5 次 或 比例 ≥20%
        const HIGH_PATTERN_ABS_MIN = 5;
        const exts = Object.entries(extCount)
            .filter(([, c]) => c >= HIGH_PATTERN_ABS_MIN || c / total >= 0.2)
            .map(([e]) => e);
        // 目录：出现 ≥5 次 或 比例 ≥20%
        const dirs = Object.entries(dirCount)
            .filter(([, c]) => c >= HIGH_PATTERN_ABS_MIN || c / total >= 0.2)
            .map(([d]) => d);
        // token：出现 ≥5 次 或 比例 ≥20%
        const tokens = Object.entries(tokenCount)
            .filter(([, c]) => c >= HIGH_PATTERN_ABS_MIN || c / total >= 0.2)
            .map(([t]) => t);
        // skipDirs：≥3个文件确认无数据（不参与过滤决策，仅统计展示）
        const skipDirs = Object.entries(skipDirCount)
            .filter(([, c]) => c >= 3)
            .map(([d]) => d);

        const patterns = {
            exts,
            dirs,
            tokens,
            skipDirs,
            _sampleCount: total,
            _uniqueDates: uniqueDates.size,
            _negativeCount: negative.length,
            _totalCached: entries.length,
            _learnedAt: Date.now()
        };

        // 清理膨胀的 _files：删除 win=-1 的旧条目（>60天）
        const now = Date.now();
        const cutoff = 60 * 24 * 3600 * 1000; // 60天
        let pruned = 0;
        for (const [p, d] of entries) {
            if (d.win === -1 && d._scannedAt && (now - d._scannedAt) > cutoff) {
                delete cache._files[p];
                pruned++;
            }
        }
        if (pruned > 0) console.log('[学习] 清理了 ' + pruned + ' 条旧的负面缓存（>60天），当前缓存 ' + Object.keys(cache._files).length + ' 条');

        console.log('[学习] 学习完成：' + total + ' 个有效文件（' + uniqueDates.size + ' 天）→ 扩展名 ' + exts.join(',') + ' · ' + dirs.length + ' 目录 · ' + tokens.length + ' 关键词 · 排除 ' + skipDirs.length + ' 目录');
        return (exts.length > 0 || dirs.length > 0) ? patterns : null;
    }

    // 用学习到的模式判断新文件是否像对战日志
    // 只用正面规则（安全，不会漏文件）：
    //   - 扩展名必须在高频扩展名列表中
    //   - 目录必须是高频目录本身或其父/子目录
    //   - 文件名至少包含一个高频 token
    // 注意：不用 skipDirs 做硬排除（否则今天无用的目录明天新出日志会被漏掉）
    //   skipDirs 仅用于统计展示 + 缓存清理，不参与过滤决策
    function matchesLogPattern(filePath, patterns) {
        if (!patterns) return null; // null = 未学习，无法判断

        const norm = filePath.replace(/\\/g, '/');
        const filename = norm.split('/').pop() || '';
        const ext = (filename.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
        const dir = norm.split('/').slice(0, -1).join('/');

        // 规则1：扩展名必须在命中文件的高频扩展名中
        if (patterns.exts.length > 0 && !patterns.exts.includes(ext)) return false;

        // 规则2：目录必须是命中文件所在目录或其父/子目录（父目录包容：logs/ 下的新子目录也能过）
        if (patterns.dirs.length > 0) {
            const dirOk = patterns.dirs.some(d => dir.startsWith(d) || d.startsWith(dir));
            if (!dirOk) return false;
        }

        // 规则3：文件名至少包含一个命中文件的高频 token（如 "log"、"对战"等）
        if (patterns.tokens.length > 0) {
            const baseName = filename.replace(/\.[^.]+$/, '');
            const nameTokens = baseName.split(/[^\u4e00-\u9fff\w]+/).filter(t => t.length >= 2).map(t => t.toLowerCase());
            if (nameTokens.length > 0 && !nameTokens.some(t => patterns.tokens.includes(t))) return false;
        }

        return true;
    }

    // 兜底：文件名硬编码规则（学习阶段或无样本时使用，较宽松避免漏文件）
    function isLikelyLogFileFallback(filename) {
        const lower = filename.toLowerCase();
        if (/\d{4}-\d{2}-\d{2}/.test(filename)) return true;
        if (/\d{8}/.test(filename)) return true;
        if (/\d{2}-\d{2}/.test(filename)) return true;
        if (/对战|战斗|battle|战报|胜负|胜利|失败/.test(lower)) return true;
        if (/log|日志/.test(lower)) return true;
        return false;
    }

    function getTodayStr() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function clearLogBattleCache() {
        try {
            localStorage.removeItem('TFJL_LogBattleV2');
            // 同时清除所有结果缓存（跳过扫描的日缓存）
            const keys = Object.keys(localStorage);
            for (const k of keys) {
                if (k.startsWith('TFJL_LogBattleResult_')) localStorage.removeItem(k);
            }
        } catch (e) { /* ignore */ }
        const statsEl = document.getElementById('logBattleStats');
        if (statsEl) {
            statsEl.innerHTML = '<div style="color:rgba(255,152,0,0.7);text-align:center;padding:20px;font-size:0.85rem;">✅ 缓存已清除，下次统计将重新扫描所有文件</div>';
        }
    }

    // 对战统计日结果缓存（跳过扫描，直接渲染，与截图统计同模式）
    function loadLogBattleResultCache() {
        if (!maDirs.logs) return null;
        const key = 'TFJL_LogBattleResult_' + btoa(unescape(encodeURIComponent(maDirs.logs))).slice(0, 32);
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const cache = JSON.parse(raw);
            if (cache.date !== getTodayStr()) return null;
            return cache;
        } catch (e) { return null; }
    }

    function saveLogBattleResultCache(dailyMap, patterns) {
        if (!maDirs.logs) return;
        const key = 'TFJL_LogBattleResult_' + btoa(unescape(encodeURIComponent(maDirs.logs))).slice(0, 32);
        const entry = { date: getTodayStr(), dailyMap, savedAt: Date.now() };
        if (patterns) entry._stats = {
            positiveCount: patterns._sampleCount || 0,
            uniqueDates: patterns._uniqueDates || 0,
            negativeCount: patterns._negativeCount || 0,
            totalCached: patterns._totalCached || 0,
            skipDirs: patterns.skipDirs ? patterns.skipDirs.length : 0,
            exts: patterns.exts || [],
            dirs: patterns.dirs ? patterns.dirs.length : 0,
            tokens: patterns.tokens ? patterns.tokens.length : 0
        };
        _deferredSetItem(key, entry);
    }

    // ==================== 统计持久化存储（磁盘优先，不依赖浏览器） ====================
    // 写入 {softwareDataDir}/stats/tfjl_ScreenshotStats.json 和 tfjl_BattleStats.json
    // 刷新/清缓存不丢数据；网页版回退 localStorage

    function _statsFileDir() {
        if (!softwareDataDir) return '';
        return softwareDataDir.replace(/[\\/]+$/, '') + '\\stats';
    }

    let _statsDirEnsured = false;
    async function _ensureStatsDir() {
        if (_statsDirEnsured || !isTauriApp) return;
        const dir = _statsFileDir();
        if (!dir) return;
        try { await createDir(dir); _statsDirEnsured = true; }
        catch (e) { console.warn('[统计] 创建 stats 目录失败:', e); }
    }

    async function _readStatsFile(filename) {
        if (!isTauriApp) return null;
        const dir = _statsFileDir();
        if (!dir) return null;
        const filePath = dir + '\\' + filename;
        try {
            const raw = await readTextFile(filePath);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[统计磁盘读] 失败:', filePath, e.message || e);
            return null;
        }
    }

    async function _writeStatsFile(filename, data) {
        if (!isTauriApp) return false;
        await _ensureStatsDir();
        const dir = _statsFileDir();
        if (!dir) return false;
        const filePath = dir + '\\' + filename;
        try {
            const json = JSON.stringify(data);
            const ok = await writeTextFile(filePath, json);
            return ok === true;
        } catch (e) {
            console.error('[统计磁盘写] 失败:', filePath, e.message || e);
            return false;
        }
    }

    // ==================== 截图统计持久化存储 ====================
    // 游戏只保留7天截图，APP独立累积历史数据永久保留
    const SCR_PERSIST_KEY = 'TFJL_ScreenshotPersist';
    const SCR_PERSIST_FILE = 'tfjl_ScreenshotStats.json';

    async function loadScreenshotPersistStore() {
        // Tauri APP：优先读磁盘文件（刷新不丢）
        let dailyMap = {};
        if (isTauriApp) {
            const diskData = await _readStatsFile(SCR_PERSIST_FILE);
            if (diskData && diskData.dailyMap) dailyMap = diskData.dailyMap;
        }
        // 回退 localStorage（网页版 / 首次迁移前数据）
        if (Object.keys(dailyMap).length === 0) {
            try {
                const raw = localStorage.getItem(SCR_PERSIST_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    dailyMap = data.dailyMap || {};
                }
            } catch (e) {}
        }

        // 兼容旧数据：把 MM-DD 键统一补齐为 YYYY-MM-DD
        const normalizeDateKey = (k) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
            const m = k.match(/^(\d{2})-(\d{2})$/);
            if (!m) return k;
            const now = new Date();
            let year = now.getFullYear();
            const candidate = new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
            if (candidate > new Date(now.getFullYear(), now.getMonth(), now.getDate())) year--;
            return `${year}-${m[1]}-${m[2]}`;
        };
        const normalizedMap = {};
        for (const [k, v] of Object.entries(dailyMap)) {
            normalizedMap[normalizeDateKey(k)] = v;
        }

        // 迁移：localStorage 有数据但磁盘无文件 → 写入磁盘（并带上规范化后的键）
        if (isTauriApp && Object.keys(normalizedMap).length > 0) {
            _writeStatsFile(SCR_PERSIST_FILE, { dailyMap: normalizedMap, savedAt: Date.now() }).catch(() => {});
        }
        return normalizedMap;
    }

    async function saveScreenshotPersistStore(stats) {
        const oldMap = await loadScreenshotPersistStore();
        for (const s of stats) {
            oldMap[s.date] = Math.max(oldMap[s.date] || 0, s.count);
        }
        const data = { dailyMap: oldMap, savedAt: Date.now() };
        // 优先写磁盘（Tauri），同时写 localStorage（网页版/双保险）
        if (isTauriApp) { await _writeStatsFile(SCR_PERSIST_FILE, data); }
        try { localStorage.setItem(SCR_PERSIST_KEY, JSON.stringify(data)); } catch (e) {}
    }

    async function mergeScreenshotPersist(stats) {
        const persistMap = await loadScreenshotPersistStore();
        const merged = [];
        const seen = new Set();
        for (const s of stats) { merged.push(s); seen.add(s.date); }
        for (const [date, count] of Object.entries(persistMap)) {
            if (!seen.has(date) && count > 0) {
                merged.push({ date, count, path: '' });
            }
        }
        merged.sort((a, b) => b.date.localeCompare(a.date));
        return merged;
    }

    // 对战统计持久化存储：独立于日志文件生命周期
    // 即使游戏自动删除7天前的日志，已统计的历史数据也永久保留
    const PERSIST_KEY = 'TFJL_LogBattlePersist';
    const BATTLE_PERSIST_FILE = 'tfjl_BattleStats.json';

    async function loadBattlePersistStore() {
        if (isTauriApp) {
            const diskData = await _readStatsFile(BATTLE_PERSIST_FILE);
            if (diskData && diskData.dailyMap) return diskData.dailyMap;
        }
        try {
            const raw = localStorage.getItem(PERSIST_KEY);
            if (!raw) return {};
            const data = JSON.parse(raw);
            const dailyMap = data.dailyMap || {};
            if (isTauriApp && Object.keys(dailyMap).length > 0) {
                _writeStatsFile(BATTLE_PERSIST_FILE, data).catch(() => {});
            }
            return dailyMap;
        } catch (e) { return {}; }
    }

    async function saveBattlePersistStore(dailyMap) {
        const oldMap = await loadBattlePersistStore();
        const merged = { ...oldMap, ...dailyMap };
        const data = { dailyMap: merged, savedAt: Date.now() };
        if (isTauriApp) { await _writeStatsFile(BATTLE_PERSIST_FILE, data); }
        try { localStorage.setItem(PERSIST_KEY, JSON.stringify(data)); } catch (e) {}
    }

    async function mergePersistToDailyMap(dailyMap) {
        const persistMap = await loadBattlePersistStore();
        return { ...persistMap, ...dailyMap };
    }

    // 渲染对战统计图表（由 calcLogBattleStats 或缓存命中后调用）
    function renderLogBattleStats(dailyMap, statsEl, opts) {
        const fromCache = opts && opts.fromCache;
        const sortedAllDates = Object.keys(dailyMap).sort((a, b) => b.localeCompare(a));
        const sortedDates = sortedAllDates;  // 显示全部天数，无限制

        if (sortedDates.length === 0) {
            if (!fromCache) {
                const hasEncodingError = opts && opts.hasEncodingError;
                const readErr = opts ? opts.readErr : 0;
                const allFiles = opts ? opts.allFiles : [];
                const logFiles = opts ? opts.logFiles : [];
                const todayFiles = opts ? opts.todayFiles : [];
                const histFiles = opts ? opts.histFiles : [];
                const skippedFiles = opts ? opts.skippedFiles : 0;
                const encodingHint = hasEncodingError
                    ? '<span style="font-size:0.7rem;color:#f44336;">检测到 ' + readErr + ' 个文件因非 UTF-8 编码读取失败，请升级到 1.1.8（支持 BOM/GB18030/BIG5 多编码自动检测）</span>'
                    : '<span style="font-size:0.7rem;color:#ff9800;">提示：内容可能是 GBK/BIG5 等非 UTF-8 编码 → 升级到 1.1.8 即可自动兼容</span>';
                const errHtml = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">日志文件中未找到「对战胜利确定」或「对战失败确定」关键词<br><span style="font-size:0.7rem;">共 ' + allFiles.length + ' 个文件，过滤后 ' + logFiles.length + ' 个（今日 ' + todayFiles.length + '，历史 ' + histFiles.length + '），跳过 ' + skippedFiles + ' 个非日志，读取出错 ' + readErr + ' 个</span><br>' + encodingHint + '</div>';
                statsEl.innerHTML = errHtml;
            }
            return;
        }

        // 摘要
        let html = '';
        const totalWin = Object.values(dailyMap).reduce((s, d) => s + d.win, 0);
        const totalLose = Object.values(dailyMap).reduce((s, d) => s + d.lose, 0);
        const totalDays = sortedDates.length;
        const totalBattles = totalWin + totalLose;
        const winRate = totalBattles > 0 ? (totalWin / totalBattles * 100).toFixed(1) : '0';

        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;">';
        html += '<span style="color:#4ecdc4;">✅ 胜利 <b>' + totalWin + '</b></span>';
        html += '<span style="color:#f44336;">❌ 失败 <b>' + totalLose + '</b></span>';
        html += '<span style="color:#ffd700;">📊 总场次 <b>' + totalBattles + '</b></span>';
        html += '<span style="color:#4fc3f7;">📈 胜率 <b>' + winRate + '%</b></span>';
        html += '<span style="color:rgba(255,255,255,0.4);">（' + totalDays + ' 天）</span>';
        html += '</div>';

        // 柱状图
        const chartW = 390;
        const padL = 30, padR = 10, padT = 16, padB = 18;
        const hMax = Math.max(1, ...Object.values(dailyMap).map(d => Math.max(d.win, d.lose)));
        const chartH = padT + 120 + padB;
        const plotW = chartW - padL - padR;
        const plotH = 120;
        const groupGap = 6;
        const n = sortedDates.length;
        const slots = n * 2;
        const slotW = Math.min(16, Math.max(6, Math.floor((plotW - (n - 1) * groupGap) / slots)));

        const gridLines = [0.25, 0.5, 0.75, 1.0];
        let gridHtml = gridLines.map(r => {
            const gy = padT + plotH * (1 - r);
            return '<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + plotW) + '" y2="' + gy + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><text x="' + (padL - 4) + '" y="' + (gy + 3) + '" fill="rgba(255,255,255,0.25)" font-size="8" text-anchor="end">' + Math.round(hMax * r) + '</text>';
        }).join('');

        let barsHtml = '';
        sortedDates.forEach((date, i) => {
            const data = dailyMap[date];
            const groupX = padL + i * (slotW * 2 + groupGap);
            const winBH = Math.max(3, (data.win / hMax) * plotH);
            const winBY = padT + plotH - winBH;
            barsHtml += '<rect x="' + groupX + '" y="' + winBY + '" width="' + slotW + '" height="' + winBH + '" rx="2" fill="#4ecdc4" opacity="0.85"><title>' + date + ' 胜利: ' + data.win + '</title></rect>';
            if (data.win > 0) {
                barsHtml += '<text x="' + (groupX + slotW / 2) + '" y="' + (winBY - 3) + '" fill="#4ecdc4" font-size="8" font-weight="bold" text-anchor="middle">' + data.win + '</text>';
            }
            const loseBH = Math.max(3, (data.lose / hMax) * plotH);
            const loseBY = padT + plotH - loseBH;
            const loseX = groupX + slotW;
            barsHtml += '<rect x="' + loseX + '" y="' + loseBY + '" width="' + slotW + '" height="' + loseBH + '" rx="2" fill="#f44336" opacity="0.85"><title>' + date + ' 失败: ' + data.lose + '</title></rect>';
            if (data.lose > 0) {
                barsHtml += '<text x="' + (loseX + slotW / 2) + '" y="' + (loseBY - 3) + '" fill="#f44336" font-size="8" font-weight="bold" text-anchor="middle">' + data.lose + '</text>';
            }
            barsHtml += '<text x="' + (groupX + slotW) + '" y="' + (padT + plotH + 13) + '" fill="rgba(255,255,255,0.45)" font-size="9" text-anchor="middle">' + date.slice(5) + '</text>';
        });

        html += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:4px;font-size:0.7rem;">';
        html += '<span style="display:inline-block;width:10px;height:10px;background:#4ecdc4;border-radius:2px;"></span> 胜利';
        html += '<span style="display:inline-block;width:10px;height:10px;background:#f44336;border-radius:2px;"></span> 失败';
        html += '</div>';

        html += '<svg width="' + chartW + '" height="' + chartH + '" style="display:block;">' + gridHtml + barsHtml + '</svg>';

        // 底部状态提示
        html += '<div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:6px;text-align:right;">';
        if (fromCache) {
            html += '📦 今日缓存，秒开展示';
            // 缓存命中时也从 resultCache._stats 显示学习信息
            if (opts._stats) {
                const s = opts._stats;
                html += ' · 🧠 已学习 ' + s.positiveCount + ' 个有效文件（' + (s.uniqueDates || '?') + ' 天）';
                if (s.negativeCount > 0) html += ' + ' + s.negativeCount + ' 个确认无用';
                if (s.skipDirs > 0) html += ' · 🚫 排除 ' + s.skipDirs + ' 个目录';
                html += ' · 缓存共 ' + s.totalCached + ' 条';
            }
        } else if (opts) {
            const cacheHits = opts.cacheHits || 0;
            const todayFiles = opts.todayFiles || [];
            const skippedFiles = opts.skippedFiles || 0;
            const toReadFiles = opts.toReadFiles || [];
            html += '📦 缓存 ' + cacheHits + ' 天历史 · 今日扫描 ' + todayFiles.length + ' 文件 · 已跳过 ' + skippedFiles + ' 非日志';
            if (toReadFiles.length > todayFiles.length) {
                html += ' · ' + (toReadFiles.length - todayFiles.length) + ' 个历史文件已变化重新读取';
            }

            // 学习效果详细摘要
            if (opts.usingLearned && opts.learnedPatterns) {
                const p = opts.learnedPatterns;
                const parts = [];
                if (p.exts.length > 0) parts.push('扩展名: ' + p.exts.join(','));
                if (p.dirs.length > 0) parts.push(p.dirs.length + ' 个目录');
                if (p.tokens.length > 0) parts.push(p.tokens.length + ' 个关键词');
                if (p.skipDirs && p.skipDirs.length > 0) parts.push('🚫排除' + p.skipDirs.length + '个目录');
                html += '<br>🧠 学习总结：' + parts.join(' · ') + '（基于 ' + p._sampleCount + ' 个有效文件';
                if (p._uniqueDates) html += '，' + p._uniqueDates + ' 天数据';
                if (p._negativeCount > 0) html += ' + ' + p._negativeCount + ' 个确认无用';
                if (p._totalCached) html += '，缓存共 ' + p._totalCached + ' 条';
                html += '）';
            } else if (!opts.usingLearned && opts.learnedPatterns === null) {
                // 学习期：样本不足还不敢过滤
                html += '<br>🔬 学习期：样本不足，全部文件扫描中（需 ≥20 文件 + 5 天数据才启用智能过滤）';
            }
        }
        html += '</div>';
        if (opts && !fromCache && opts.hasEncodingError) {
            html += '<div style="font-size:0.65rem;color:#f44336;margin-top:2px;text-align:right;">⚠️ ' + opts.readErr + ' 个文件因 UTF-8 解码失败，请 cargo tauri build 重编译 APP</div>';
        }

        statsEl.innerHTML = html;
    }

    // 快速路径：有历史缓存时，只扫描今日可能新增的文件
    // 避免每次新的一天都全量递归遍历整个日志目录树（几百次 readDir IPC）
    async function scanTodayOnly(logsDir, learnedPatterns) {
        const todayStr = getTodayStr();
        const allowedExts = ['txt', 'json', 'log', ''];
        const files = [];
        try {
            const rootEntries = await readDir(logsDir);
            for (const entry of rootEntries) {
                if (entry.is_file) {
                    // 顶层文件：文件名含今日日期 或 修改时间是今天
                    const fileDate = extractDateFromFilename(entry.name);
                    if (fileDate !== todayStr && !(entry.modified && entry.modified.startsWith(todayStr))) continue;
                    const ext = (entry.name.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
                    if (!allowedExts.includes(ext)) continue;
                    const isLog = learnedPatterns ? matchesLogPattern(entry.path, learnedPatterns) : isLikelyLogFileFallback(entry.name);
                    if (!isLog) continue;
                    files.push({ name: entry.name, path: entry.path, dir: logsDir, dirKey: 'logs', dirLabel: '日志', ext, category: '对战', modified: entry.modified || '' });
                } else {
                    // 子目录：目录名匹配今日日期才进入（如 2026-07-23/）
                    const dirDate = extractDateFromFilename(entry.name);
                    if (dirDate !== todayStr) continue;
                    const subFiles = await collectFilesRecursive(entry.path, 'logs', '日志', 2, allowedExts);
                    for (const f of subFiles) {
                        const isLog = learnedPatterns ? matchesLogPattern(f.path, learnedPatterns) : isLikelyLogFileFallback(f.name);
                        if (isLog) files.push(f);
                    }
                }
            }
        } catch (e) { console.warn('[快速扫描] 今日文件扫描异常:', e); }
        return files;
    }

    async function calcLogBattleStats(targetId, forceParam) {
        // forceParam: true=强制重新扫描（忽略缓存做全新扫描），false/undefined=正常流程（优先用缓存）
        // 兼容 onclick="calcLogBattleStats(true)" 写法：targetId 为布尔值时修正为 force 标志
        if (typeof targetId === 'boolean') { forceParam = targetId; targetId = null; }
        const force = forceParam === true;
        const id = targetId || 'logBattleStats';
        const statsEl = document.getElementById(id);
        if (!statsEl) return;

        if (!maDirs.logs) {
            statsEl.innerHTML = '<div style="color:#ff9800;text-align:center;padding:20px;font-size:0.85rem;">请先在本地设置中配置「对战日志目录」</div>';
            return;
        }

        const debugLines = [];
        function dlog(msg) { debugLines.push(msg); console.log('[日志统计]', msg); }

        // 日结果缓存：今天扫过就直接渲染，跳过目录扫描（最耗时，几千文件递归扫描可能要10分钟）
        if (!force) {
            const resultCache = loadLogBattleResultCache();
            if (resultCache && resultCache.dailyMap && Object.keys(resultCache.dailyMap).length > 0) {
                dlog('✅ 使用今日结果缓存，跳过全部扫描');
                // 合并持久化数据（补回已被游戏删除的旧日志日期的统计）
                const mergedDaily = await mergePersistToDailyMap(resultCache.dailyMap);
                renderLogBattleStats(mergedDaily, statsEl, { fromCache: true, _stats: resultCache._stats || null });
                window._lastLogDebugLines = debugLines;
                return;
            }
        }

        // === 快速路径：有历史文件缓存 → 只扫描今日（跳过全量递归目录遍历） ===
        // 每次新的一天首次打开，无需遍历整个日志目录树
        // force=true 时仍然走快速路径，但强制重读今天所有文件（不跳过 mtime 相同的）
        {
            let fastCache = null;
            try {
                const raw = localStorage.getItem('TFJL_LogBattleV2');
                if (raw) { fastCache = JSON.parse(raw); if (fastCache._dir !== maDirs.logs) fastCache = null; }
            } catch (e) { fastCache = null; }

            if (fastCache && fastCache._files && Object.keys(fastCache._files).length > 0) {
                dlog('🚀 快速路径：缓存 ' + Object.keys(fastCache._files).length + ' 个文件，' + (force ? '强制重读今日所有文件' : '只扫描今日新增'));

                // 从缓存构建历史 dailyMap（force时跳过今天，避免叠加翻倍）
                const todayStr = getTodayStr();
                let dailyMap = {};
                for (const [, info] of Object.entries(fastCache._files)) {
                    if (info.win === -1 || !info.date || info.date === '未知') continue;
                    if (force && info.date === todayStr) continue; // 强制刷新：今天从零开始，只用新读的结果
                    if (!dailyMap[info.date]) dailyMap[info.date] = { win: 0, lose: 0 };
                    dailyMap[info.date].win += (info.win || 0);
                    dailyMap[info.date].lose += (info.lose || 0);
                }
                dlog('从缓存恢复 ' + Object.keys(dailyMap).length + ' 天历史数据');

                statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:20px;font-size:0.85rem;">⏳ 正在快速扫描今日日志…</div>';

                const learnedPatterns = learnLogPatterns(fastCache);
                const todayFiles = await scanTodayOnly(maDirs.logs, learnedPatterns);
                dlog('今日新增日志文件: ' + todayFiles.length + ' 个');

                let readOk = 0, readErr = 0;
                const readErrs = [];
                let hasEncodingError = false;

                if (todayFiles.length > 0) {
                    // 跳过已缓存的（同路径+mtime一致=内容没变）
                    // force=true 时不跳过，强制重读今天所有文件
                    const toRead = force
                        ? todayFiles
                        : todayFiles.filter(f => {
                            const c = fastCache._files[f.path];
                            return !c || c.mtime !== f.modified;
                        });
                    const cachedSkip = force ? 0 : (todayFiles.length - toRead.length);
                    if (cachedSkip > 0) dlog('今日文件中已缓存跳过: ' + cachedSkip + ' 个（未修改）');

                    if (toRead.length > 0) {
                        dlog('需读取今日文件: ' + toRead.length + ' 个');
                        const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
                        const readResults = await Promise.all(toRead.map(async (f) => {
                            try {
                                const content = await invokeFn('read_text_file_auto', { filePath: f.path });
                                if (!content) { readOk++; return { date: '', win: -1, lose: 0, path: f.path, mtime: f.modified }; }
                                const w = (content.match(/对战胜利确定/g) || []).length;
                                const l = (content.match(/对战失败确定/g) || []).length;
                                if (w === 0 && l === 0) { readOk++; return { date: '', win: -1, lose: 0, path: f.path, mtime: f.modified }; }
                                readOk++;
                                let d = extractDateFromFilename(f.name);
                                if (!d && f.modified) d = f.modified.substring(0, 10);
                                if (!d) d = todayStr;
                                return { date: d, win: w, lose: l, path: f.path, mtime: f.modified };
                            } catch (e) {
                                readErr++;
                                const msg = e.message || e;
                                if (readErrs.length < 3) readErrs.push(f.name + ': ' + msg);
                                if (typeof msg === 'string' && (msg.includes('UTF-8') || msg.includes('valid utf-8') || msg.includes('stream did not contain'))) hasEncodingError = true;
                                return null;
                            }
                        }));

                        for (const r of readResults) {
                            if (!r) continue;
                            if (r.win === -1) {
                                fastCache._files[r.path] = { mtime: r.mtime, date: '', win: -1, lose: 0, _scannedAt: Date.now() };
                                continue;
                            }
                            const d = r.date || todayStr;
                            if (!dailyMap[d]) dailyMap[d] = { win: 0, lose: 0 };
                            dailyMap[d].win += r.win;
                            dailyMap[d].lose += r.lose;
                            fastCache._files[r.path] = { mtime: r.mtime, date: d, win: r.win, lose: r.lose };
                        }
                    }
                }

                // 保存缓存 & 结果
                fastCache._patterns = learnLogPatterns(fastCache);
                _deferredSetItem('TFJL_LogBattleV2', fastCache);

                // 合并持久化数据 + 保存（补回已被删除的旧日志日期）
                const mergedDaily = await mergePersistToDailyMap(dailyMap);
                await saveBattlePersistStore(mergedDaily);
                saveLogBattleResultCache(dailyMap, fastCache._patterns);

                const totalCached = Object.keys(fastCache._files).length;
                renderLogBattleStats(mergedDaily, statsEl, {
                    allFiles: totalCached, logFiles: totalCached, todayFiles: todayFiles.length, histFiles: 0,
                    skippedFiles: 0, cacheHits: totalCached - todayFiles.length, toReadFiles: todayFiles.length,
                    usingLearned: !!learnedPatterns, learnedPatterns,
                    hasEncodingError, readErr
                });
                window._lastLogDebugLines = debugLines;
                return;
            }
        }

        // force=true 但无缓存，或完全无缓存 → 回退全量扫描
        dlog('开始全量扫描: ' + maDirs.logs);
        statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:20px;font-size:0.85rem;">⏳ 正在扫描日志文件并统计…</div>';

        try {
            // 1. 递归扫描目录（不读文件内容，只列文件名 + modified）
            const allowedExts = ['txt', 'json', 'log', ''];

            let allFiles;
            try {
                allFiles = await collectFilesRecursive(maDirs.logs, 'logs', '日志', 3, allowedExts);
                dlog('扫描到文件: ' + allFiles.length + ' 个');
                if (allFiles.length > 0) {
                    dlog('前10个: ' + allFiles.slice(0, 10).map(f => f.name + '(' + f.ext + ')').join(', '));
                }
            } catch (scanErr) {
                dlog('【失败】目录扫描异常: ' + (scanErr.message || scanErr));
                window._lastLogDebugLines = debugLines;
                statsEl.innerHTML = '<div style="color:#f44336;text-align:center;padding:20px;font-size:0.85rem;">目录扫描失败<br><span style="font-size:0.7rem;">错误: ' + (scanErr.message || scanErr) + '</span></div>';
                return;
            }

            if (allFiles.length === 0) {
                dlog('【失败】目录下未找到任何可读文件（支持: txt/json/log/无后缀）');
                window._lastLogDebugLines = debugLines;
                statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">日志目录下未找到任何可读文件<br><span style="font-size:0.7rem;color:#ff9800;">支持: .txt / .log / .json / 无后缀</span></div>';
                return;
            }

            // 2. 加载缓存（key 由目录路径决定，目录变了自动失效）
            const CACHE_KEY = 'TFJL_LogBattleV2';
            let cache = {};
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                if (raw) cache = JSON.parse(raw);
            } catch (e) { cache = {}; }
            if (cache._dir !== maDirs.logs) {
                dlog('日志目录已变更，缓存失效（旧: ' + (cache._dir || '无') + ' → 新: ' + maDirs.logs + '）');
                cache = { _dir: maDirs.logs, _files: {} };
            }
            if (force) {
                dlog('强制刷新：忽略文件缓存，重新扫描所有文件');
                cache._files = {};
            }
            cache._files = cache._files || {};

            // 2.5 智能预过滤：优先用学习到的模式，无模式则兜底硬编码规则
            const learnedPatterns = learnLogPatterns(cache);
            const usingLearned = !!learnedPatterns;
            if (usingLearned) {
                dlog('🧠 已学习日志文件模式: ' + learnedPatterns.exts.length + ' 扩展名, ' + learnedPatterns.dirs.length + ' 目录, ' + learnedPatterns.tokens.length + ' 关键词（基于 ' + learnedPatterns._sampleCount + ' 个命中文件）');
            }

            const logFiles = allFiles.filter(f => {
                // 已缓存的文件直接通过（不管结果怎样,缓存已经记录了）
                if (cache._files[f.path] !== undefined) return true;
                // 新文件：优先用学习模式，无模式则兜底硬编码
                if (usingLearned) return matchesLogPattern(f.path, learnedPatterns);
                return isLikelyLogFileFallback(f.name);
            });
            const skippedFiles = allFiles.length - logFiles.length;
            if (skippedFiles > 0) {
                const reason = usingLearned ? '（学习模式：不匹配已命中文件的目录/扩展名/关键词特征）' : '（文件名不含日期或对战关键词）';
                dlog('跳过 ' + skippedFiles + ' 个非日志文件' + reason + '，剩余 ' + logFiles.length + ' 个');
            }

            if (logFiles.length === 0) {
                dlog('【失败】目录下 ' + allFiles.length + ' 个文件全部不像对战日志');
                window._lastLogDebugLines = debugLines;
                statsEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">目录下 ' + allFiles.length + ' 个文件都不像是对战日志<br><span style="font-size:0.7rem;color:#ff9800;">如需扫描全部文件请先「清除缓存」后重试</span></div>';
                return;
            }

            // 3. 分离今日/历史文件（按文件名日期或 modified 判断）
            const todayStr = getTodayStr();
            const todayFiles = [], histFiles = [];
            for (const f of logFiles) {
                const fileDate = extractDateFromFilename(f.name);
                if (fileDate === todayStr || (f.modified && f.modified.startsWith(todayStr))) {
                    todayFiles.push(f);
                } else {
                    histFiles.push(f);
                }
            }

            // 4. 历史文件查缓存：路径 + modified 一致则直接复用
            const toReadFiles = [...todayFiles]; // 今日文件全部读取
            let dailyMap = {};
            let cacheHits = 0;

            for (const f of histFiles) {
                const cached = cache._files[f.path];
                if (cached && cached.mtime === f.modified && typeof cached.win === 'number') {
                    if (cached.win === -1) {
                        // 之前已确认无对战关键词，直接跳过
                        cacheHits++;
                        continue;
                    }
                    cacheHits++;
                    if (!dailyMap[cached.date]) dailyMap[cached.date] = { win: 0, lose: 0 };
                    dailyMap[cached.date].win += cached.win;
                    dailyMap[cached.date].lose += (cached.lose || 0);
                } else {
                    toReadFiles.push(f);
                }
            }

            dlog('总文件: ' + allFiles.length + ' | 日志文件: ' + logFiles.length + ' | 今日: ' + todayFiles.length + ' | 历史: ' + histFiles.length + ' | 缓存命中: ' + cacheHits + ' | 需读取: ' + toReadFiles.length);

            // 5. 只读取需要读的文件（今日 + 缓存未命中）
            let readOk = 0, readErr = 0, noKeyword = 0;
            let hasEncodingError = false;
            const readErrs = [];

            if (toReadFiles.length > 0) {
                // calcLogBattleStats 里直接用 invoke，以便捕获 GBK/ANSI 编码错误并统计
                const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
                const readResults = await Promise.all(
                    toReadFiles.map(async (f) => {
                        try {
                            const content = await invokeFn('read_text_file_auto', { filePath: f.path });
                            if (!content) { readOk++; noKeyword++; return { date: '', win: -1, lose: 0, path: f.path, mtime: f.modified }; }
                            const winCount = (content.match(/对战胜利确定/g) || []).length;
                            const loseCount = (content.match(/对战失败确定/g) || []).length;
                            if (winCount === 0 && loseCount === 0) { readOk++; noKeyword++; return { date: '', win: -1, lose: 0, path: f.path, mtime: f.modified }; }
                            readOk++;
                            let date = extractDateFromFilename(f.name);
                            if (!date && f.modified) date = f.modified;
                            if (!date) date = '未知';
                            return { date, win: winCount, lose: loseCount, path: f.path, mtime: f.modified };
                        } catch (e) {
                            readErr++;
                            const msg = e.message || e;
                            if (readErrs.length < 5) readErrs.push(f.name + ': ' + msg);
                            // 编码错误标记
                            if (typeof msg === 'string' && (msg.includes('UTF-8') || msg.includes('valid utf-8') || msg.includes('stream did not contain'))) {
                                hasEncodingError = true;
                            }
                            return null;
                        }
                    })
                );

                dlog('读取完毕 — 成功: ' + readOk + ' | 无关键词: ' + noKeyword + ' | 读取出错: ' + readErr);
                if (readErrs.length > 0) dlog('读取错误示例: ' + readErrs.join('; '));

                // 汇总新鲜结果 + 写入缓存（包括无关键词的文件，标记 win=-1）
                for (let i = 0; i < toReadFiles.length; i++) {
                    const r = readResults[i];
                    if (!r) continue;
                    if (r.win === -1) {
                        // 已确认无关键词：缓存标记（带时间戳供60天过期清理），不加入统计
                        cache._files[r.path] = { mtime: r.mtime, date: '', win: -1, lose: 0, _scannedAt: Date.now() };
                        continue;
                    }
                    if (!dailyMap[r.date]) dailyMap[r.date] = { win: 0, lose: 0 };
                    dailyMap[r.date].win += r.win;
                    dailyMap[r.date].lose += r.lose;
                    cache._files[r.path] = { mtime: r.mtime, date: r.date, win: r.win, lose: r.lose };
                }
            }

            // 保存缓存（附带学习到的文件模式）
            cache._patterns = learnLogPatterns(cache);
            if (cache._patterns) {
                dlog('🧠 已保存学习模式: ' + cache._patterns.exts.length + ' 扩展名, ' + cache._patterns.dirs.length + ' 目录, ' + cache._patterns.tokens.length + ' 关键词');
            }
            _deferredSetItem(CACHE_KEY, cache);

            // 保存日结果缓存（下次打开直接渲染，跳过全部扫描）
            saveLogBattleResultCache(dailyMap, cache._patterns);

            // 合并持久化数据 + 保存（补回已被删除的旧日志日期）
            const mergedDaily = await mergePersistToDailyMap(dailyMap);
            await saveBattlePersistStore(mergedDaily);

            // 6. 渲染（最近30天）
            renderLogBattleStats(mergedDaily, statsEl, {
                allFiles, logFiles, todayFiles, histFiles, skippedFiles,
                cacheHits, toReadFiles, usingLearned, learnedPatterns,
                hasEncodingError, readErr
            });
            window._lastLogDebugLines = debugLines;
        } catch (e) {
            window._lastLogDebugLines = debugLines;
            statsEl.innerHTML = '<div style="color:#f44336;text-align:center;padding:20px;font-size:0.85rem;">统计失败：' + e.message + '</div>';
        }
    }

    // 从文件名中提取日期（如 2026-07-23.txt → "2026-07-23"）
    function extractDateFromFilename(filename) {
        // 匹配 YYYY-MM-DD
        let m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        // 匹配 YYYYMMDD
        m = filename.match(/(\d{4})(\d{2})(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        // 匹配 MM-DD（无年份 — 补当前年份）
        m = filename.match(/(\d{2})-(\d{2})/);
        if (m) {
            const now = new Date();
            const year = now.getFullYear();
            return `${year}-${m[1]}-${m[2]}`;
        }
        return null;
    }

    function buildDebugPanel(lines) {
        if (!lines || lines.length === 0) return '';
        const items = lines.map((l, i) => {
            const cls = l.includes('【失败】') ? 'color:#f44336' : l.includes('【异常】') ? 'color:#ff9800' : 'color:rgba(255,255,255,0.5)';
            return '<div style="' + cls + ';font-size:0.7rem;font-family:monospace;padding:1px 0;">[' + i + '] ' + l.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        }).join('');
        return '<details style="margin-top:8px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 10px;"><summary style="color:rgba(255,255,255,0.45);font-size:0.75rem;cursor:pointer;">🔍 诊断日志（点击展开）</summary><div style="max-height:200px;overflow-y:auto;margin-top:4px;">' + items + '</div></details>';
    }

    // ==================== 英雄皮肤系统 ====================

    // 远程皮肤注册表（GitHub Pages 托管，所有设备打开即自动同步）
    const REMOTE_SKIN_BASE = 'https://gyq-svip.github.io/tfjl-web/skins';
    const REMOTE_SKIN_REGISTRY_URL = REMOTE_SKIN_BASE + '/registry.json';

    function getSkinRootDir() {
        return (softwareDataDir || '').replace(/[\\/]+$/, '') + '\\data\\skin';
    }

    // Tauri v2 本地文件路径转可加载 URL（优先 asset://，回退 base64）
    function convertFileSrc(filePath) {
        try {
            if (window.__TAURI__?.core?.convertFileSrc) {
                return window.__TAURI__.core.convertFileSrc(filePath);
            }
        } catch(e) { /* fallback */ }
        return null;
    }
    // 皮肤图片 URL 缓存（blob: URL，比 data: URL 更可靠，不会被 ?t= 参数污染）
    const skinImageUrlCache = {};
    async function getSkinImageUrl(filePath) {
        if (skinImageUrlCache[filePath]) return skinImageUrlCache[filePath];
        const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return null;

        // 方案A：优先用 read_image_base64 自定义命令（rebuild exe 后可用）
        try {
            const dataUrl = await invokeFn('read_image_base64', { filePath });
            if (dataUrl) {
                skinImageUrlCache[filePath] = dataUrl;
                return dataUrl;
            }
        } catch(e) {
            console.log('[SKIN] read_image_base64 ACL blocked, trying fs plugin...', String(e).slice(0,80));
        }

        // 方案B：用 Tauri 内置 fs 插件读二进制 → blob: URL
        // （read_image_base64 的 ACL 需 rebuild exe 才能解锁，fs:default 在旧 exe 中已编译）
        try {
            const bytes = await invokeFn('plugin:fs|read_file', { path: filePath, options: undefined });
            console.log('[SKIN] read_file raw type:', filePath, bytes?.constructor?.name, 'len:', bytes?.byteLength ?? bytes?.length);
            const blobUrl = bytesToBlobUrl(bytes, filePath);
            if (blobUrl) {
                skinImageUrlCache[filePath] = blobUrl;
                console.log('[SKIN] blob URL via fs plugin OK:', filePath);
                return blobUrl;
            }
        } catch(e) {
            console.warn('[SKIN] read_file also failed:', filePath, String(e).slice(0,160));
        }
        return null;
    }

    /// 将 ArrayBuffer/Uint8Array 转为 blob: URL（比 data: URL 更可靠，浏览器原生支持）
    function bytesToBlobUrl(bytes, filePath) {
        if (!bytes) { console.warn('[SKIN] bytesToBlobUrl: empty bytes', filePath); return null; }
        let arr;
        if (bytes instanceof Uint8Array) {
            arr = bytes;
        } else if (bytes instanceof ArrayBuffer) {
            arr = new Uint8Array(bytes);
        } else if (Array.isArray(bytes)) {
            arr = new Uint8Array(bytes);
        } else if (bytes.bytes && Array.isArray(bytes.bytes)) {
            arr = new Uint8Array(bytes.bytes);
        } else if (bytes.data && Array.isArray(bytes.data)) {
            arr = new Uint8Array(bytes.data);
        } else if (typeof bytes === 'object' && bytes.length !== undefined) {
            arr = new Uint8Array(Object.values(bytes));
        } else {
            console.warn('[SKIN] bytesToBlobUrl: unknown type', filePath, bytes?.constructor?.name);
            return null;
        }
        if (arr.length === 0) { console.warn('[SKIN] bytesToBlobUrl: 0 length', filePath); return null; }
        const ext = (filePath.split('.').pop() || 'png').toLowerCase();
        const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
        const mime = mimeMap[ext] || 'image/png';
        const blob = new Blob([arr], { type: mime });
        return URL.createObjectURL(blob);
    }

    window.skinRegistry = {};       // { 英雄名: [{ name, url, path }] }
    window.heroSkinSelections = {};  // { 英雄名: 皮肤名 }

    // 解析 "皮肤名·英雄名" 格式，返回基础英雄名
    // 如 "牛魔王·魇" → { heroName: "魇", skinName: "牛魔王" }
    // "海妖" → { heroName: "海妖", skinName: null }
    function getBaseHeroName(fullName) {
        if (!fullName) return { heroName: '', skinName: null };
        const idx = fullName.indexOf('·');
        if (idx > 0) {
            return { heroName: fullName.substring(idx + 1), skinName: fullName.substring(0, idx) };
        }
        return { heroName: fullName, skinName: null };
    }

    async function scanSkins() {
        console.log('[SKIN] scanSkins() START');
        // 保留已有的远程皮肤条目，避免和 syncRemoteSkins 并行/重复调用时把远程条目冲掉
        const existingRemote = {};
        for (const [heroName, skins] of Object.entries(window.skinRegistry || {})) {
            existingRemote[heroName] = (skins || []).filter(s => s.remote && s.url);
        }
        window.skinRegistry = {};
        console.log('[SKIN] softwareDataDir:', softwareDataDir);
        if (!softwareDataDir) { console.warn('[SKIN] No softwareDataDir, aborting scanSkins'); return window.skinRegistry; }
        const skinRoot = getSkinRootDir();
        console.log('[SKIN] skinRoot:', skinRoot);
        const exists = await pathExists(skinRoot);
        console.log('[SKIN] skinRoot exists:', exists);
        if (!exists) { console.warn('[SKIN] Skin root dir does not exist'); return window.skinRegistry; }

        const entries = await readDir(skinRoot);
        console.log('[SKIN] entries count:', entries ? entries.length : 0);
        if (!entries || !entries.length) { console.warn('[SKIN] No entries in skin root'); return window.skinRegistry; }

        for (const heroEntry of entries) {
            // readDir 返回对象 {name, is_file, ...}，取 .name
            const heroName = (typeof heroEntry === 'string') ? heroEntry : (heroEntry.name || '');
            if (!heroName) continue;
            if (heroEntry.is_file) continue; // 跳过根目录中的文件
            const heroDir = skinRoot + '\\' + heroName;
            try {
                const fileEntries = await readDir(heroDir);
                if (!fileEntries || !fileEntries.length) continue;
                const skins = [];
                for (const fileEntry of fileEntries) {
                    const fileName = (typeof fileEntry === 'string') ? fileEntry : (fileEntry.name || '');
                    const m = fileName.match(/^(.+)\.(png|jpg|jpeg|gif|webp)$/i);
                    if (!m) continue;
                    const skinName = m[1];
                    const filePath = heroDir + '\\' + fileName;
                    // 统一存 raw path，由 resolveHeroSkinUrl 异步转 base64（convertFileSrc 对 Windows 含盘符路径无效）
                    skins.push({ name: skinName, url: null, path: filePath, loaded: false });
                }
                if (skins.length > 0) { window.skinRegistry[heroName] = skins; console.log('[SKIN] Hero:', heroName, 'skins:', skins.map(s => s.name).join(',')); }
            } catch(e) { console.warn('[SKIN] Error reading hero dir:', heroDir, e); }
        }
        // 把之前保留的远程皮肤条目合并回来（本地没有的才加）
        for (const [heroName, remoteSkins] of Object.entries(existingRemote)) {
            if (!remoteSkins.length) continue;
            const localSkins = window.skinRegistry[heroName] || [];
            const localNames = new Set(localSkins.map(s => s.name));
            for (const r of remoteSkins) {
                if (!localNames.has(r.name)) {
                    localSkins.push(r);
                }
            }
            if (localSkins.length > 0) window.skinRegistry[heroName] = localSkins;
        }
        console.log('[SKIN] scanSkins() DONE, registry keys:', Object.keys(window.skinRegistry).join(',') || '(empty)');
        return window.skinRegistry;
    }

    // 从 GitHub Pages 拉取远程皮肤注册表，与本地 skinRegistry 合并
    // 这样任何设备打开 APP/网页即可自动获取皮肤，无需手动创建本地文件夹
    let _remoteSkinSynced = false;
    async function syncRemoteSkins() {
        if (_remoteSkinSynced) return;
        _remoteSkinSynced = true;
        console.log('[SKIN] syncRemoteSkins() fetching registry from:', REMOTE_SKIN_REGISTRY_URL);
        try {
            const resp = await fetch(REMOTE_SKIN_REGISTRY_URL, { cache: 'no-cache' });
            if (!resp.ok) {
                console.warn('[SKIN] Remote registry not found (HTTP ' + resp.status + '), using local only');
                return;
            }
            const registry = await resp.json();
            console.log('[SKIN] Remote registry loaded, version:', registry.version, 'heroes:', Object.keys(registry.heroes || {}).length);
            if (!registry.heroes) return;

            let addedCount = 0;
            for (const [heroName, skinList] of Object.entries(registry.heroes)) {
                if (!Array.isArray(skinList)) continue;
                // 确保该英雄在 registry 中存在条目（至少是空数组）
                if (!window.skinRegistry[heroName]) {
                    window.skinRegistry[heroName] = [];
                }
                const localSkins = window.skinRegistry[heroName];
                const localNames = new Set(localSkins.map(s => s.name));

                for (const remoteSkin of skinList) {
                    const skinName = remoteSkin.name;
                    if (!skinName) continue;
                    const remoteUrl = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(remoteSkin.file || (skinName + '.png'));
                    if (localNames.has(skinName)) {
                        // 本地已有：如果本地还没加载 url，补上远程 url 作为回退
                        const local = localSkins.find(s => s.name === skinName);
                        if (local && !local.url && !local.path) {
                            local.url = remoteUrl;
                        }
                    } else {
                        // 本地没有：添加远程皮肤条目（直接使用远程 HTTPS URL）
                        localSkins.push({ name: skinName, url: remoteUrl, path: null, loaded: true, remote: true });
                        addedCount++;
                        console.log('[SKIN] Remote skin added:', heroName + '/' + skinName, '→', remoteUrl);
                    }
                }
            }
            if (addedCount > 0) {
                console.log('[SKIN] syncRemoteSkins() added', addedCount, 'remote skins');
            }

            // 后台尝试下载远程皮肤到本地 data/skin 目录（仅 Tauri 环境）
            _downloadRemoteSkinsToLocal(registry.heroes);
            // IndexedDB 预热（APP/网页通用，无需 Tauri 文件系统）
            _preheatSkins(registry.heroes);

            // 远程皮肤注册表就绪后，自动刷新已渲染的英雄皮肤（解决首次打开项目皮肤不显示）
            try {
                if (typeof window.reapplyAllSkins === 'function') {
                    window.reapplyAllSkins();
                    console.log('[SKIN] syncRemoteSkins() 触发皮肤重刷');
                }
            } catch(e) {
                console.warn('[SKIN] 皮肤重刷失败:', e);
            }
        } catch(e) {
            console.warn('[SKIN] syncRemoteSkins() failed:', String(e).slice(0, 200));
        }
    }

    // ==================== 皮肤磁盘缓存（APP 优先本地磁盘，网页版走 IndexedDB） ====================
    // - APP: 下载 PNG → base64 文本写 {softwareDataDir}/data/skin/{英雄}/{皮肤}.png.b64
    // - APP 读取: readTextFile → atob → Uint8Array → blob: URL（毫秒级）
    // - 网页版: 走 IndexedDB（浏览器缓存）
    // - 刷新/清缓存不丢；完全脱离浏览器缓存

    function _skinDiskBase() {
        if (!softwareDataDir) return '';
        return softwareDataDir.replace(/[\\/]+$/, '') + '\\data\\skin';
    }

    // 已创建过目录的英雄集合（避免重复 createDir）
    const _skinDiskDirsEnsured = new Set();
    let _skinDiskBaseEnsured = false;
    async function _ensureSkinDiskDir(heroName) {
        if (!isTauriApp || !heroName) return;
        // 先确保 data/skin 基础目录存在
        if (!_skinDiskBaseEnsured) {
            const base = _skinDiskBase();
            try { await createDir(base); _skinDiskBaseEnsured = true; }
            catch (e) { console.warn('[SKIN] 创建基础目录失败:', base, e); return; }
        }
        if (_skinDiskDirsEnsured.has(heroName)) return;
        const dir = _skinDiskBase() + '\\' + heroName;
        try { await createDir(dir); _skinDiskDirsEnsured.add(heroName); }
        catch (e) { console.warn('[SKIN] 创建英雄目录失败:', dir, e); }
    }

    // blob / ArrayBuffer → base64 字符串（用于写磁盘文本文件）
    function _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result; // "data:image/png;base64,xxxxx"
                const b64 = dataUrl.split(',')[1];
                resolve(b64 || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // base64 字符串 → Uint8Array（用于创建 Blob URL）
    function _base64ToBytes(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // 从远程 URL 解析英雄名和皮肤文件名
    function _parseSkinUrl(remoteUrl) {
        const m = remoteUrl.match(/\/skins\/([^/]+)\/([^/]+)$/);
        if (!m) return null;
        return { hero: decodeURIComponent(m[1]), file: decodeURIComponent(m[2]) };
    }

    // 后台下载远程皮肤到本地磁盘（Tauri 环境下，写入 .png.b64 文本文件）
    let _remoteSkinDownloadStarted = false;
    async function _downloadRemoteSkinsToLocal(heroes) {
        if (!isTauriApp || _remoteSkinDownloadStarted) return;
        _remoteSkinDownloadStarted = true;
        const base = _skinDiskBase();
        if (!base) return;
        let downloaded = 0, skipped = 0;
        for (const [heroName, skinList] of Object.entries(heroes || {})) {
            if (!Array.isArray(skinList) || !skinList.length) continue;
            await _ensureSkinDiskDir(heroName);
            for (const s of skinList) {
                const file = s.file || (s.name + '.png');
                const b64Path = base + '\\' + heroName + '\\' + file + '.b64';
                // 已存在则跳过
                try {
                    const exists = await readTextFile(b64Path);
                    if (exists && exists.length > 100) { skipped++; continue; }
                } catch(e) { /* 不存在，继续下载 */ }
                try {
                    const url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(file);
                    const resp = await fetch(url);
                    if (!resp.ok) continue;
                    const blob = await resp.blob();
                    const b64 = await _blobToBase64(blob);
                    if (!b64) continue;
                    await writeTextFile(b64Path, b64);
                    downloaded++;
                } catch(e) {
                    console.warn('[SKIN] 下载皮肤失败:', heroName, file, e.message || e);
                }
                if (downloaded % 10 === 0) await new Promise(r => setTimeout(r, 10));
            }
        }
        if (downloaded > 0 || skipped > 0) {
            console.log('[SKIN] 磁盘缓存: 新下载', downloaded, '跳过', skipped);
        }
    }

    // ============================================================
    // IndexedDB 皮肤缓存（网页版使用；APP 优先磁盘缓存）
    // ============================================================
    const SKIN_DB_NAME = 'tfjl-skin-cache';
    const SKIN_DB_VERSION = 1;
    const SKIN_STORE = 'skins';
    let _skinDbPromise = null;
    function _openSkinDb() {
        if (_skinDbPromise) return _skinDbPromise;
        _skinDbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject('indexeddb unavailable'); return; }
            const req = indexedDB.open(SKIN_DB_NAME, SKIN_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(SKIN_STORE)) {
                    db.createObjectStore(SKIN_STORE, { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return _skinDbPromise;
    }
    async function _idbGet(key) {
        try {
            const db = await _openSkinDb();
            return await new Promise((resolve) => {
                const tx = db.transaction(SKIN_STORE, 'readonly');
                const req = tx.objectStore(SKIN_STORE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    }
    async function _idbPut(key, blob) {
        try {
            const db = await _openSkinDb();
            return await new Promise((resolve) => {
                const tx = db.transaction(SKIN_STORE, 'readwrite');
                tx.objectStore(SKIN_STORE).put({ key, blob, time: Date.now() });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (e) { return false; }
    }

    // 获取皮肤 blob URL
    // APP（Tauri）：优先读磁盘 .png.b64 文件（刷新不丢）；未命中则网络下载 → 写磁盘
    // 网页版：优先 IndexedDB；未命中则网络下载 → 写 IndexedDB
    async function _getCachedSkinUrl(remoteUrl) {
        if (!remoteUrl) return null;
        if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;

        // === Tauri APP：磁盘优先 ===
        if (isTauriApp) {
            const parsed = _parseSkinUrl(remoteUrl);
            if (parsed) {
                const b64Path = _skinDiskBase() + '\\' + parsed.hero + '\\' + parsed.file + '.b64';
                // 1. 尝试读磁盘缓存
                try {
                    const b64 = await readTextFile(b64Path);
                    if (b64 && b64.length > 100) {
                        const bytes = _base64ToBytes(b64);
                        return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
                    }
                } catch(e) { /* 磁盘无缓存 */ }
                // 2. 网络下载 → 写磁盘
                try {
                    await _ensureSkinDiskDir(parsed.hero);
                    const resp = await fetch(remoteUrl);
                    if (!resp.ok) return remoteUrl;
                    const blob = await resp.blob();
                    const b64 = await _blobToBase64(blob);
                    if (b64) { writeTextFile(b64Path, b64).catch(() => {}); /* 异步写，不等 */ }
                    return URL.createObjectURL(blob);
                } catch(e) {
                    console.warn('[SKIN] 网络兜底失败:', remoteUrl, e.message || e);
                    return remoteUrl;
                }
            }
            // URL 解析失败，回退网络
            try {
                const resp = await fetch(remoteUrl);
                if (!resp.ok) return remoteUrl;
                return URL.createObjectURL(await resp.blob());
            } catch(e) { return remoteUrl; }
        }

        // === 网页版：IndexedDB 优先 ===
        const key = 'skin:' + remoteUrl;
        const cached = await _idbGet(key);
        if (cached && cached.blob) {
            try { return URL.createObjectURL(cached.blob); }
            catch (e) { console.warn('[SKIN] createObjectURL failed:', e); }
        }
        try {
            const resp = await fetch(remoteUrl, { cache: 'force-cache' });
            if (!resp.ok) return remoteUrl;
            const blob = await resp.blob();
            _idbPut(key, blob);
            return URL.createObjectURL(blob);
        } catch (e) {
            console.warn('[SKIN] fetch skin failed:', remoteUrl, e);
            return remoteUrl;
        }
    }

    // 后台批量预热所有皮肤
    // APP（Tauri）：下载到本地磁盘 .b64（持久化，刷新不丢）
    // 网页版：下载到 IndexedDB
    let _preheatStarted = false;
    async function _preheatSkins(heroes) {
        if (_preheatStarted) return;
        _preheatStarted = true;
        if (isTauriApp) {
            // Tauri: 磁盘缓存（一次性全量下载，后续秒开）
            _downloadRemoteSkinsToLocal(heroes).catch(() => {});
            return;
        }
        // 网页版: IndexedDB 预热
        let count = 0;
        for (const [heroName, skinList] of Object.entries(heroes || {})) {
            if (!Array.isArray(skinList)) continue;
            for (const s of skinList) {
                const url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(s.file || (s.name + '.png'));
                _getCachedSkinUrl(url).catch(() => {});
                count++;
                if (count % 20 === 0) await new Promise(r => setTimeout(r, 30));
            }
        }
        console.log('[SKIN] Preheat queued:', count, 'skins');
    }

    function getHeroSkinUrl(heroName, skinName) {
        const parsed = getBaseHeroName(heroName);
        const baseHero = parsed.heroName;
        const skins = window.skinRegistry[baseHero];
        if (!skins || !skins.length) return null;
        const userSel = window.heroSkinSelections[baseHero];
        // 显式传入 skinName 时优先；空字符串表示默认无皮肤
        if (skinName !== undefined && skinName !== null) {
            if (skinName === '') return null;
            const skin = skins.find(s => s.name === skinName);
            return skin ? (skin.url || null) : null;
        }
        if (userSel === '') return null; // 用户明确选择默认
        const target = userSel || parsed.skinName;
        const skin = target ? skins.find(s => s.name === target) : null;
        return skin ? (skin.url || null) : (skins[0].url || null);
    }

    // 获取皮肤信息（dataUrl + 名字），支持延迟 base64 加载
    async function resolveHeroSkinInfo(heroName, skinName) {
        const parsed = getBaseHeroName(heroName);
        const baseHero = parsed.heroName;
        const skins = window.skinRegistry[baseHero];
        if (!skins || !skins.length) return null;
        // 如果名称中指定了皮肤且没有用户手动选择，自动使用名称中指定的皮肤
        if (parsed.skinName && window.heroSkinSelections[baseHero] === undefined) {
            window.heroSkinSelections[baseHero] = parsed.skinName;
        }
        // 优先级：显式传入 skinName > 用户手动选择 > 名称中嵌入的皮肤 > 默认皮肤（与英雄同名）
        const userSel = window.heroSkinSelections[baseHero];
        let target = skinName || (userSel !== undefined && userSel !== '' ? userSel : null) || parsed.skinName;
        // 如果用户没设置皮肤且名称中也没指定，使用默认皮肤（即皮肤名 = 英雄名的那个）
        if (target === null || target === undefined || target === '') {
            const defaultSkin = skins.find(s => s.name === baseHero) || skins.find(s => s.name === heroName);
            if (defaultSkin) target = defaultSkin.name;
            // 如果用户显式选了 ''（默认皮肤），仍然展示默认皮肤
            if (userSel === '') target = (defaultSkin ? defaultSkin.name : (skins[0] ? skins[0].name : null));
        }
        if (target === null || target === undefined || target === '') {
            return null;
        }
        const skin = skins.find(s => s.name === target);
        const entry = skin || skins.find(s => s.name === baseHero) || skins[0];
        if (!entry) return null;
        // 优先用 IndexedDB 缓存（毫秒级返回），否则走网络并回写
        if (entry.url) {
            const cachedUrl = await _getCachedSkinUrl(entry.url);
            return { url: cachedUrl, name: entry.name, path: entry.path };
        }
        const dataUrl = await getSkinImageUrl(entry.path);
        if (dataUrl) {
            entry.url = dataUrl; entry.loaded = true;
            const cachedUrl = await _getCachedSkinUrl(dataUrl);
            return { url: cachedUrl, name: entry.name, path: entry.path };
        }
        return null;
    }

    async function resolveHeroSkinUrl(heroName, skinName) {
        const info = await resolveHeroSkinInfo(heroName, skinName);
        return info ? info.url : null;
    }

    function getHeroSkins(heroName) {
        const baseHero = getBaseHeroName(heroName).heroName;
        return window.skinRegistry[baseHero] || [];
    }

    function selectHeroSkin(heroName, skinName) {
        const baseHero = getBaseHeroName(heroName).heroName;
        window.heroSkinSelections[baseHero] = skinName;
        try {
            const all = JSON.parse(localStorage.getItem('tdjl_heroSkinSelections') || '{}');
            if (skinName === null || skinName === undefined) delete all[baseHero];
            else all[baseHero] = skinName;
            localStorage.setItem('tdjl_heroSkinSelections', JSON.stringify(all));
        } catch(e) {}
    }

    function loadSkinSelections() {
        try {
            window.heroSkinSelections = JSON.parse(localStorage.getItem('tdjl_heroSkinSelections') || '{}');
        } catch(e) {
            window.heroSkinSelections = {};
        }
    }

    // ==================== 控制台日志导出到本地文件（便于 AI 助手诊断） ====================
    async function exportConsoleLogsToFile(logs, timestamp) {
        if (!softwareDataDir) return 'ERR: no softwareDataDir';
        const logsDir = softwareDataDir.replace(/[\\/]+$/, '') + '\\logs';
        // 确保 logs 目录存在
        const dirExists = await pathExists(logsDir);
        if (!dirExists) {
            const r = await createDir(logsDir);
            if (!r.success) return 'ERR: cannot create logs dir: ' + r.error;
        }
        const fileName = 'console-' + timestamp + '.log';
        const filePath = logsDir + '\\' + fileName;
        // 生成带时间戳的可读日志文本
        const text = logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.msg}`).join('\n');
        const result = await writeTextFileWithError(filePath, text);
        if (result.success) {
            return 'OK: ' + filePath;
        } else {
            return 'ERR: ' + result.error;
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
    window.computeFileDr = computeFileDr;       // 扫描列表减伤按钮
    window.detectFileEncoding = detectFileEncoding; // 文件编码检测
    // 扫描文件分享模式与筛选
    window.toggleScannedShareMode = toggleScannedShareMode;
    window.setScannedFilterKeyword = setScannedFilterKeyword;
    window.setScannedFilterCategory = setScannedFilterCategory;
    window.toggleScannedShareSelectFromMain = toggleScannedShareSelectFromMain;
    window.toggleAllScannedShareSelectsFromMain = toggleAllScannedShareSelectsFromMain;
    window.doBatchShareScannedFromMain = doBatchShareScannedFromMain;
    window.shareScannedFileFromMain = shareScannedFileFromMain;
    window.saveSettingsAndClose = saveSettingsAndClose;
    window.toggleAutoLoadSetting = toggleAutoLoadSetting;
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
    window.backupAllData = backupAllData;       // 全局备份
    window.loadBackupList = loadBackupList;       // 加载备份文件列表
    window.restoreFromBackup = restoreFromBackup; // 从备份还原
    window.deleteBackup = deleteBackup;           // 删除备份文件
    window.syncAllNow = syncAllNow;            // 手动触发全量数据同步到本地目录
    window.initDataSync = initDataSync;        // 重新初始化同步路径
        window.calcScreenshotStats = calcScreenshotStats;
        window.calcLogBattleStats = calcLogBattleStats;
        window.__tfjlSaveAllProjects = tfjlSaveAllProjects;
        window.__tfjlRestoreAllProjects = tfjlRestoreAllProjects;
    window.clearLogBattleCache = clearLogBattleCache;
    window.importFileToProject = importFileToProject;
    window.batchImportFilesToProject = batchImportFilesToProject;
    // 英雄皮肤系统
    window.scanSkins = scanSkins;
    window.syncRemoteSkins = syncRemoteSkins;
    window.getBaseHeroName = getBaseHeroName;
    window.getHeroSkinUrl = getHeroSkinUrl;
    window.resolveHeroSkinUrl = resolveHeroSkinUrl;
    window.resolveHeroSkinInfo = resolveHeroSkinInfo;
    window.getHeroSkins = getHeroSkins;
    window.selectHeroSkin = selectHeroSkin;
    window.getSkinRootDir = getSkinRootDir;
    window.convertFileSrc = convertFileSrc;
    window.loadSkinSelections = loadSkinSelections;
    window.exportConsoleLogsToFile = exportConsoleLogsToFile;

    // 确保 DOMContentLoaded 后初始化（处理竞态：script 加载时事件可能已触发）
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initAppLocal);
    } else {
        initAppLocal();
    }
    console.log('[APP] app-local.js 已加载 (IPC模式)');
}
