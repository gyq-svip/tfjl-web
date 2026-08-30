// ============================================================
// APP本地存储功能（仅Tauri APP可用，网页版不加载此文件）
// 通过 Tauri IPC invoke 调用 Rust 命令（支持远程URL）
// [deploy 2026-08-28] 重新部署完整版，修复线上 app-local.js 残缺导致 APP设置按钮不显示
// ============================================================

// 检测是否在Tauri APP中运行（运行时判定，避免 defer 脚本执行早于 Tauri 全局注入导致误判）
// Tauri注入了 window.__TAURI_INTERNALS__（含invoke），以及我们注入的 __TAURI_APP__ 标记
function _isTauriRuntime() {
    return (typeof window.__TAURI_INTERNALS__ !== 'undefined') ||
           (typeof window.__TAURI__ !== 'undefined') ||
           navigator.userAgent.includes('Tauri');
}
var isTauriApp = _isTauriRuntime();

// 始终进入块（函数定义/全局导出无条件执行）；App 与网页的行为差异用 _isTauriRuntime() 在运行时区分
if (true) {
    // 老马6个固定目录配置（默认值，用户可在设置面板修改）
    const DEFAULT_MA_DIRS = {
        coop:       'D:\\withfriends\\塔防老马助手\\合作脚本存档',   // 合作脚本目录
        activity:   'D:\\withfriends\\塔防老马助手\\活动脚本存档',   // 活动脚本目录
        battle:     'D:\\withfriends\\塔防老马助手\\对战脚本存档',   // 对战目录（JSON）
        battleMax:  'D:\\withfriends\\塔防老马助手\\对战Max',        // 对战MAX目录（TXT）
        screenshot: 'D:\\withfriends\\塔防老马助手\\截图',           // 截图目录（统计每天打多少局）
        logs:       'D:\\withfriends\\塔防老马助手\\Log',            // 对战日志目录（统计胜负等）
        temp:       'D:\\withfriends\\塔防精灵助手数据\\tfjl_temp'      // 临时脚本目录（统一收进英文临时文件夹，便于清理）
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
    // 🔴 2026-08-30 最近一次【成功落盘】的内容快照：_flushStore 据此判断「无变化则跳过写盘」。
    //    只在写盘成功后推进——写盘失败（目录被杀软短暂锁定/磁盘满等）不推进，
    //    保证下次 flush 会重试，而不是被「跳过逻辑」吞掉（比旧版每 30s 盲目重写更安全）。
    let _lastFlushedMap = new Map();
    let _projectsCache = null;    // 当前项目数组（null=尚未写入过）
    // 🔴 2026-08-30 内存优化：项目整包 JSON 字符串（~25MB）按「缓存对象引用」复用。
    //    _projectsCache 每次落盘都被整体替换（tfjlSaveAllProjects / tfjlRestoreAllProjects 均
    //    赋新数组，无原地突变），引用没变就说明内容没变 → 直接复用上次的序列化字符串，
    //    不再每次 flush 都 JSON.stringify 25MB（省 CPU + 避免「新旧两份 25MB 字符串同时常驻」）。
    let _projectsJsonStr = null;
    let _projectsJsonRef = null;
    let _storeLoaded = false;     // 是否已从磁盘加载过
    // 🔴 2026-08-30 内存优化（配合「保存/最小化/关闭时写盘」策略）：
    //    自动保存（记事本防抖/切皮等）不再走「getAll 全部项目(25MB对象图) + 全量落盘」，
    //    只把此脏标志置 true。真正写盘（手动保存/切后台/关闭/5分钟安全网）时才从 IndexedDB 拉一次最新项目。
    //    消除「记事本每打一个字停顿1秒 → 全量序列化34MB → GC回收」的每秒内存锯齿。
    let _projectsCacheDirty = false;
    let _restoreLock = false;     // 恢复进行中锁（避免恢复期间 setItem 触发的 flush 覆盖未恢复完的数据）
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
        // 注意：不能用一次性的 String.fromCharCode.apply(null, 全部字节)，参数个数超栈会彻底写盘失败。
        // 🔴 2026-08-30 卡顿根治：旧版「块内逐字节 += 拼接」对 34MB 的 tfjl.dat 是 3400 万次字符串
        //    连接 ≈ 2 秒主线程阻塞（界面冻结、按钮失效）。改为 0x8000 块 apply（原生解码，快 10-30 倍），
        //    块内万一抛栈溢出再退回逐字节拼接兜底。
        let s = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
            try { s += String.fromCharCode.apply(null, sub); }
            catch (e) {
                let part = '';
                for (let j = 0; j < sub.length; j++) part += String.fromCharCode(sub[j]);
                s += part;
            }
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
        // 先算总字节数，再预分配一次性填充，避免 parts.push(...大数组) 展开触发 Maximum call stack
        let total = STORE_MAGIC.length + 4 + 4; // magic + version + count
        const entries = [];
        for (const [k, v] of map.entries()) {
            const kb = enc.encode(String(k));
            const vb = enc.encode(String(v));
            entries.push(kb, vb);
            total += 4 + kb.length + 4 + vb.length;
        }
        const out = new Uint8Array(total);
        let off = 0;
        for (const b of STORE_MAGIC) out[off++] = b;
        const ver = _u32le(STORE_VERSION); out[off++] = ver[0]; out[off++] = ver[1]; out[off++] = ver[2]; out[off++] = ver[3];
        const cnt = _u32le(map.size); out[off++] = cnt[0]; out[off++] = cnt[1]; out[off++] = cnt[2]; out[off++] = cnt[3];
        for (let i = 0; i < entries.length; i += 2) {
            const kb = entries[i], vb = entries[i + 1];
            const kl = _u32le(kb.length); out[off++] = kl[0]; out[off++] = kl[1]; out[off++] = kl[2]; out[off++] = kl[3];
            out.set(kb, off); off += kb.length;
            const vl = _u32le(vb.length); out[off++] = vl[0]; out[off++] = vl[1]; out[off++] = vl[2]; out[off++] = vl[3];
            out.set(vb, off); off += vb.length;
        }
        return out;
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
        const path = _getDatPath(dir);
        const raw = await readTextFile(path);
        if (raw) {
            try {
                _storeMap = _unpackStore(_base64ToBytes(raw.trim()));
                _lastFlushedMap = new Map(_storeMap);   // 磁盘真实内容 = 跳过比对的基准
                _storeLoaded = true;   // 加载成功后才置位
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
        _lastFlushedMap = new Map(_storeMap);
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
        // 写盘前确保目录存在（目录被删/首装/升级时常见"无此目录"导致写失败）
        try { if (dir) await createDir(dir); } catch (e) { console.warn('[数据存储] 创建目录失败:', dir, e); }
        const path = _getDatPath(dir);
        const bytes = _packStore(map);
        return await writeTextFile(path, _bytesToBase64(bytes));
    }

    // 构建当前最新存储内容（localStorage 全量 + 项目缓存），写盘
    async function _flushStore() {
        if (!_syncOk) return;
        // 脏标记：写盘前才从 IndexedDB 拉一次最新项目（自动保存期间零 IO 零序列化的关键）
        if (_projectsCacheDirty) {
            _projectsCacheDirty = false;
            if (typeof window.__tfjlLoadProjectList === 'function') {
                try { _projectsCache = await window.__tfjlLoadProjectList(); } catch (e) {}
            }
        }
        const map = new Map();
        // 项目（优先用内存缓存，避免回退到旧值）。
        // 🔴 2026-08-30 内存优化：不再常驻缓存序列化结果（25MB 字符串白占内存）——
        //    写盘现在只在「保存/切后台/关闭 + 5 分钟安全网」时发生，每次现序列化的成本可以接受。
        if (_projectsCache !== null) {
            if (_projectsJsonRef !== _projectsCache || _projectsJsonStr === null) {
                _projectsJsonStr = JSON.stringify(_projectsCache);
                _projectsJsonRef = _projectsCache;
            }
            map.set(PROJECTS_KEY, _projectsJsonStr);   // 引用未变 → 复用同一字符串（零拷贝零序列化）
        }
        else if (_storeMap.has(PROJECTS_KEY)) map.set(PROJECTS_KEY, _storeMap.get(PROJECTS_KEY));
        // localStorage 当前全部键值（已删除的键自然不会出现在 localStorage 里，故不再保留）
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (RESERVED_KEYS.has(k)) continue;
            map.set(k, localStorage.getItem(k));
        }
        // 🔴 2026-08-30 卡顿根治·兜底：与上次【成功落盘】的内容逐键比对，完全一致则直接跳过写盘
        //    （省掉 34MB 整包「序列化 + 打包 + base64 + IPC」的全部成本）。磁盘文件保持不动。
        if (map.size === _lastFlushedMap.size) {
            let _same = true;
            for (const [k, v] of map) {
                if (_lastFlushedMap.get(k) !== v) { _same = false; break; }
            }
            // 内容与上次成功落盘完全一致：推进 _lastFlushedMap 到新 map（内容相同，引用互换无副作用），
            // 让旧 map 及其中的字符串尽早变成垃圾 —— 否则新旧两份 25MB 项目字符串同时常驻。
            if (_same) { _storeMap = map; _lastFlushedMap = map; return; }
        }
        _storeMap = map;
        const ok = await _writeStoreFile(_syncDir, map);
        if (ok) {
            _lastFlushedMap = map;   // 写盘成功才推进快照（失败则下次重试）
            console.log('[数据存储] 已写入统一存储 tfjl.dat (' + map.size + ' 项)');
            // 数据落盘后置自动备份脏标记（_scheduleAutoBackup 仅置标、不返回 Promise，
            // 由 6 小时定时整备 / 关窗兜底消费，避免"写盘→备份→再写盘"死循环）。
            // 🔴 注意：绝不能写 .catch()，否则 undefined.catch 抛 TypeError 导致 _flushStore 失败、
            //       initDataSync 的 await _flushStore() 被 catch 捕获 → 误报"初始化失败"且 _syncOk=false。
            _scheduleAutoBackup(_syncDir);
        } else console.error('[数据存储] ❌ tfjl.dat 写入失败（目录可能不可写/权限不足）: ' + _getDatPath(_syncDir));
    }

    let _lastFlushTs = 0;                       // 上次实际落盘时间（用于最短间隔节流）
    // 🔴 2026-08-30 落盘策略调整（用户明确要求）：tfjl.dat 只在「保存 / 最小化切后台 / 关闭窗口」时写，
    //    外加一个 5 分钟的脏数据安全网——期间有 localStorage 小改动（记事本草稿、设置等）最多每 5 分钟补写一次，
    //    防止进程被强杀时丢失超过 5 分钟的小改动。项目数据不在此列：每次保存项目都走 syncAllNow 立即落盘。
    //    （此前的 30s 是"变更驱动的节流间隔"而非定时器；配合"内容未变整包跳过"，闲置时本来就零写盘。）
    const MIN_FLUSH_GAP_MS = 5 * 60 * 1000;

    function _scheduleFlush() {
        if (!_syncOk) return;
        // 恢复进行中：跳过本次排程，避免 flush 用"未恢复完的 _storeMap"覆盖磁盘真实数据；
        // 恢复结束后会主动补一次全量 flush，不会丢。
        if (_restoreLock) return;
        if (_flushTimer) clearTimeout(_flushTimer);
        const now = Date.now();
        const delay = Math.max(1000, MIN_FLUSH_GAP_MS - (now - _lastFlushTs));
        _flushTimer = setTimeout(() => { _lastFlushTs = Date.now(); _flushStore().catch(() => {}); }, delay);
    }

    // 拦截全局 Storage 写入——所有 localStorage 变更都触发统一存储刷新
    // 🔴 2026-08-30 30秒规律卡顿根治：旧版任何 setItem（哪怕写入完全相同的值，例如每 30s 一次的
    //    tfjl_my_rep_last / tdjl_auctionNews_cfg）都会调度落盘 → 每 30 秒把 ~34MB 的 tfjl.dat
    //    整包「序列化+打包+base64+IPC」重写一遍，主线程阻塞 2-3 秒（界面冻结、按钮失效、
    //    hover 高亮不跟手）。现改为：写入前先取旧值，值相同则照常写入但【不触发落盘调度】，
    //    从源头做到「有变化才写盘」。
    const _nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        let _prev = null, _has = false;
        try { _prev = this.getItem(key); _has = true; } catch (e) {}
        _nativeSetItem.call(this, key, value);
        if (_has && _prev === value) return;   // 值没变：只写不调度
        _scheduleFlush();
    };
    const _nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
        let _exists = true;
        try { _exists = this.getItem(key) !== null; } catch (e) {}
        _nativeRemoveItem.call(this, key);
        if (!_exists) return;                  // 键本来就不存在：不调度
        _scheduleFlush();
    };

    // 立即全量落盘（用户主动保存 / 目录变更时调用，不等防抖）
    async function syncAllNow() {
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        await _flushStore();
    }

    // 页面隐藏/关闭前尽量刷盘（避免异步写入丢失）
    // 1) visibilitychange：切到后台/最小化时立即同步刷盘（此时进程还在，写入可靠）
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
            _flushStore().catch((e) => console.error('[数据存储] 隐藏时刷盘失败:', e));
            // App 端：最小化/进托盘后延迟 15 秒静默刷新，从线上拉取最新前端资源
            // （Tauri 无 Service Worker，隐藏态 reload 用户无感，下次点开窗口即最新版；
            //  reload 前已先 _flushStore 落盘，且 reload 本身还会触发 pagehide 再刷一次）
            if (isTauriApp) {
                setTimeout(() => {
                    // 二次确认仍在隐藏态才刷新，避免用户已切回前台时误 reload 打断操作
                    if (document.visibilityState === 'hidden') {
                        _flushStore().catch(() => {});  // 更新前再保存一次当前页面数据
                        console.log('[更新] 隐藏态延迟刷新，拉取最新前端资源');
                        location.reload(true);
                    }
                }, 15000);
            }
        }
    });
    // 2) pagehide：窗口关闭/卸载时最后再尝试一次（进程可能随时终止，尽力而为）
    window.addEventListener('pagehide', () => {
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        _flushStore().catch((e) => console.error('[数据存储] 卸载时刷盘失败:', e));
        // 关闭前立即补一份自动备份（防"连续保存后马上关窗"丢窗口内的变更）；绕过节流，确保一定留一份
        _autoBackupForceNow(_syncDir).catch(() => {});
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
            _migrateOldBackups(dir);         // 清理旧版散落在根目录的自动备份（死循环产生的垃圾）
            _startAutoBackupTimer();         // 启动定时整备（每 6 小时兜底快照）
            console.log('[数据存储] ✅ 已启用单一文件存储: ' + _getDatPath(dir));
        } catch (e) {
            _syncOk = false;
            console.error('[数据存储] ❌ 初始化失败: ' + dir, e);
        }
    }

    // 强制从磁盘重读 tfjl.dat（重置内部缓存状态后再次加载），用于诊断写盘验证等需要真实比对磁盘的场景
    async function _forceReloadStore() {
        _storeLoaded = false;
        _storeMap = new Map();
        _projectsCache = null;
        const dir = _getSyncDir();
        if (!dir) return;
        await _ensureStoreLoaded(dir);
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
                // 网页版无 Tauri 是预期行为，静默降级；桌面端若也找不到，看控制台排查
                console.warn('[APP] 未找到 Tauri invoke 函数（网页版正常，桌面端异常）。__TAURI_INTERNALS__:', !!window.__TAURI_INTERNALS__);
                return null;
            }
            return await invokeFn(cmd, args);
        } catch (e) {
            console.error('[APP] invoke 失败:', cmd, e);
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
            // 超时保护：避免 read_directory 命令因异常目录(超大/符号链接/网络盘)一直 pending 导致前端“扫描中”卡死
            const timeoutMs = 8000;
            const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('read_directory 超时 ' + timeoutMs + 'ms')), timeoutMs));
            const result = await Promise.race([
                invokeFn('read_directory', { dirPath }),
                timeoutP
            ]);
            return result || [];
        } catch (e) {
            console.warn('[APP] read_directory 失败/超时:', dirPath, e.message || e);
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
            // 文件不存在(os error 2 / No such file)属预期情况（如首次启动/未设过数据目录的 tfjl_datadir.json），
            // 静默降级为 debug，避免误导用户以为是错误（调用方均有默认路径兜底）。
            var em = (e && (e.message || e)) + '';
            var notFound = /os error 2|No such file|not found|ENOENT/i.test(em);
            if (notFound) console.debug('[APP] read_text_file_auto 跳过(文件不存在，走默认):', filePath);
            else console.error('[APP] read_text_file_auto 失败:', filePath, e);
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
            // 降级为 warn（之前 console.error 在 ACL 拦截时会让 Tauri runtime 同时弹系统级错误对话框污染体验）。
            // 若 capability 缺授权，错误信息会带 "not allowed by ACL"，便于定位是哪个命令未授权。
            console.warn('[APP] 获取版本失败 get_app_version:', (e && e.message) || e);
            return null;
        }
    }

    // ==================== 配置管理 ====================

    // 自动增量备份：每次数据变更（tfjl.dat 内容真正变化）后，自动写一份带时间戳的备份，
    // 并只保留最近 N 份（N 用户可配），避免忘记手动备份时数据全丢。
    // 🔴 这些 const 必须声明在使用它们的 settingsConfig（下方）之前，
    // 否则 529 行访问 AUTO_BACKUP_DEFAULT_KEEP 会触发 TDZ ReferenceError，
    // 导致整个 app-local2.js 执行中断、所有 window.* 导出失效（APP设置按钮不显示）。
    const AUTO_BACKUP_KEY = 'tfjl_auto_backup';                 // 配置开关（也镜像进 settingsConfig）
    const AUTO_BACKUP_KEEP_KEY = 'tfjl_auto_backup_keep';       // 保留份数
    const AUTO_BACKUP_HASH_KEY = 'tfjl_auto_backup_last_hash';  // 上次已备份的内容 hash（增量判定）
    const AUTO_BACKUP_PREFIX = 'tfjl-auto-backup-';             // 自动备份文件前缀（区别于手动 tfjl-full-backup-）
    const AUTO_BACKUP_DEFAULT_KEEP = 20;

    // 自动加载开关：默认全部开启，用户卡顿可关闭
    const settingsConfig = { autoLoadScreenshotStats: true, autoLoadBattleStats: true, autoBackup: true, autoBackupKeep: AUTO_BACKUP_DEFAULT_KEEP, autoBackupTimer: true, autoBackupIntervalMin: 360 };

    // 自动备份配置也镜像进 localStorage（设置面板与 _autoBackupEnabled/_autoBackupKeep 共用）
    function _syncAutoBackupConfig() {
        localStorage.setItem(AUTO_BACKUP_KEY, settingsConfig.autoBackup ? '1' : '0');
        localStorage.setItem(AUTO_BACKUP_KEEP_KEY, String(settingsConfig.autoBackupKeep || AUTO_BACKUP_DEFAULT_KEEP));
    }

    function _autoBackupEnabled() {
        // 优先用 settingsConfig（与设置面板一致），并实时同步 localStorage 镜像
        if (typeof settingsConfig.autoBackup === 'boolean') return settingsConfig.autoBackup;
        const v = localStorage.getItem(AUTO_BACKUP_KEY);
        return v === null ? true : v === '1'; // 默认开启
    }
    function _autoBackupKeep() {
        const v = parseInt(localStorage.getItem(AUTO_BACKUP_KEEP_KEY), 10);
        return (v >= 1 && v <= 999) ? v : AUTO_BACKUP_DEFAULT_KEEP;
    }
    // 轻量 hash（仅用于增量判定，无需加密强度）：FNV-1a，字符串输入
    function _fnv1a(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16);
    }

    let _autoBackupTimer = null;          // 预留（保留接口兼容，目前不再由 flush 驱动）
    let _autoBackupPending = false;       // 数据已变更、待整备消费标志（消费后清除）
    let _autoBackupRunning = false;       // 正在写盘标志（防并发叠加）
    let _autoBackupInterval = null;       // 定时整备定时器（每 30 分钟兜底）
    let _lastRealBackupTs = 0;            // 上次"实际写盘"备份的时间戳（用于最小间隔节流）
    const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 小时（定时整备默认间隔，用户可配）
    const AUTO_BACKUP_MIN_GAP_MS = 60 * 60 * 1000;   // 🔴 最小备份间隔 1 小时：杜绝"持续备份/打开即备"卡死循环

    // 由每次 tfjl.dat 落盘调用（第 268 行）。仅置"脏标记"，不直接触发备份，
    // 避免"写盘→8秒后备份→又写盘→又备份"的永续循环（实测日志每 6~14s 一次，主线程 I/O 卡死）。
    // 真正的备份由 30 分钟定时整备（_startAutoBackupTimer）或关窗兜底（pagehide）消费。
    function _scheduleAutoBackup(dir) {
        if (!_autoBackupEnabled() || !dir) return;
        _autoBackupPending = true;
    }

    // 关窗兜底 调用：绕过最小间隔节流，确保关闭前一定留一份（pagehide 已先落盘 tfjl.dat，此处仅冗余备份）
    async function _autoBackupForceNow(dir) {
        if (!_autoBackupEnabled() || !dir) return;
        _autoBackupPending = false;
        await _doAutoBackup(dir).catch(e => console.error('[自动备份] 关窗兜底失败:', e));
    }

    // 立即备份（跳过防抖，供关窗/隐藏/定时整备调用）；仍走 hash 增量判定，避免无变更时重复写
    async function _autoBackupNow(dir) {
        if (!_autoBackupEnabled() || !dir) return;
        _autoBackupPending = false;
        const now = Date.now();
        if (now - _lastRealBackupTs < AUTO_BACKUP_MIN_GAP_MS) return; // 节流：距上次实备不足最小间隔直接跳过
        await _doAutoBackup(dir).catch(e => console.error('[自动备份] 兜底失败:', e));
    }

    async function _doAutoBackup(dir) {
        if (!dir) return;
        const syncDir = dir.replace(/[\\/]+$/, '');
        // 🔴 备份统一存放到 syncDir/backups/ 子目录，避免几十份散落在数据根目录里
        const backupDir = syncDir + '\\backups';
        // 1) 取当前 tfjl.dat 内容（与落盘一致），算 hash（锁外做，无变更直接跳过，不加锁）
        let rawDat = '';
        try { rawDat = await readTextFile(_getDatPath(syncDir)) || ''; } catch (e) { return; }
        if (!rawDat) return;
        const hash = _fnv1a(rawDat);
        const lastHash = localStorage.getItem(AUTO_BACKUP_HASH_KEY);
        if (lastHash === hash) return; // 内容没变，跳过（增量核心）

        // 2) 真正写盘前再加锁，正在写则放弃本次（防并发叠加，避免"一直很忙"）
        if (_autoBackupRunning) return;
        _autoBackupRunning = true;
        try {
            // 组装与手动备份同格式的备份对象（保证能被 restoreFromBackup 还原）
            const localStorageData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k) localStorageData[k] = localStorage.getItem(k);
            }
            let projects = [], dbCategories = [];
            try {
                if (window.db) {
                    projects = await new Promise((res, rej) => {
                        const tx = window.db.transaction(['projects'], 'readonly');
                        const req = tx.objectStore('projects').getAll();
                        req.onsuccess = () => res(req.result || []);
                        req.onerror = () => rej(req.error);
                    });
                }
                dbCategories = window.categories || [];
            } catch (e) {}
            const backup = {
                type: 'tfjl-full-backup',
                auto: true,                              // 标记为自动备份
                version: '1.0',
                backupDate: new Date().toISOString(),
                localStorage: localStorageData,
                indexedDB: { projects, categories: dbCategories }
            };

            // 写盘前确保 backups/ 子目录存在
            try { await createDir(backupDir); } catch (e) { console.warn('[自动备份] 创建子目录失败:', backupDir, e); }

            const d = new Date();
            const ts = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0') + '_' +
                String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') +
                String(d.getSeconds()).padStart(2, '0');
            const fileName = AUTO_BACKUP_PREFIX + ts + '.json';
            const filePath = backupDir + '\\' + fileName;
            const result = await writeTextFileWithError(filePath, JSON.stringify(backup, null, 2));
            if (!result.success) { console.error('[自动备份] 写文件失败:', result.error); return; }

            localStorage.setItem(AUTO_BACKUP_HASH_KEY, hash); // 记录已备份内容，下次变更才再备
            _lastRealBackupTs = Date.now();                  // 🔴 更新最小间隔基准，杜绝连续狂备
            console.log('[自动备份] ✅ 已生成: ' + fileName + '（项目 ' + projects.length + ' 个，位于 backups/）');

            // 3) 清理超出保留数量的旧自动备份（仅扫描 backups/ 子目录）
            try {
                const entries = await readDir(backupDir);
                const autos = entries
                    .filter(e => e.is_file && e.name.startsWith(AUTO_BACKUP_PREFIX) && e.name.endsWith('.json'))
                    .sort((a, b) => b.name.localeCompare(a)); // 最新在前
                const keep = _autoBackupKeep();
                const excess = autos.slice(keep);
                for (const f of excess) {
                    try { await deleteFile(backupDir + '\\' + f.name); } catch (e) {}
                }
                if (excess.length) console.log('[自动备份] 已清理 ' + excess.length + ' 份过期备份，保留最新 ' + keep + ' 份');
            } catch (e) {}
        } finally {
            _autoBackupRunning = false; // 无论如何释放锁
        }
    }

    // 定时整备：按用户设定间隔（默认 30 分钟，可配）扫一次，若期间数据变过（hash 不同）则补一份快照
    // （兜底网，防全天高频打断导致一份都没生成）。开关 autoBackupTimer 关则不启动。
    function _startAutoBackupTimer() {
        _stopAutoBackupTimer(); // 先清旧的，避免重复 interval
        if (!_autoBackupEnabled() || !settingsConfig.autoBackupTimer) return;
        const min = (settingsConfig.autoBackupIntervalMin >= 1 && settingsConfig.autoBackupIntervalMin <= 1440)
            ? settingsConfig.autoBackupIntervalMin : 30;
        const ms = min * 60 * 1000;
        _autoBackupInterval = setInterval(() => {
            _autoBackupNow(_syncDir).catch(() => {});
        }, ms);
    }
    function _stopAutoBackupTimer() {
        if (_autoBackupInterval) { clearInterval(_autoBackupInterval); _autoBackupInterval = null; }
    }

    // 🔴 清理旧版散落在数据根目录的自动备份（s1.0.480 之前死循环产生的几十份垃圾文件）。
    // 新版备份已全部写入 backups/ 子目录，仅在首次启用时跑一次，把根目录残留的旧文件迁移进 backups/。
    async function _migrateOldBackups(dir) {
        const syncDir = (dir || _syncDir || '').replace(/[\\/]+$/, '');
        if (!syncDir) return;
        try {
            const entries = await readDir(syncDir);
            const olds = entries.filter(e => e.is_file && e.name.startsWith(AUTO_BACKUP_PREFIX) && e.name.endsWith('.json'));
            if (!olds.length) return;
            const backupDir = syncDir + '\\backups';
            try { await createDir(backupDir); } catch (e) {}
            let moved = 0;
            for (const f of olds) {
                try { if (await renameLocalFile(syncDir + '\\' + f.name, backupDir + '\\' + f.name)) moved++; } catch (e) {}
            }
            if (moved) console.log('[自动备份] 已迁移 ' + moved + ' 份旧备份到 backups/ 子目录（新备份将统一存放于此）');
        } catch (e) {}
    }

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
                // 恢复自动备份配置
                if (typeof parsed.autoBackup === 'boolean') settingsConfig.autoBackup = parsed.autoBackup;
                if (parsed.autoBackupKeep) { const k = parseInt(parsed.autoBackupKeep, 10); if (k >= 1 && k <= 999) settingsConfig.autoBackupKeep = k; }
                if (typeof parsed.autoBackupTimer === 'boolean') settingsConfig.autoBackupTimer = parsed.autoBackupTimer;
                if (parsed.autoBackupIntervalMin) { const m = parseInt(parsed.autoBackupIntervalMin, 10); if (m >= 1 && m <= 1440) settingsConfig.autoBackupIntervalMin = m; }
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
            autoLoadBattleStats: settingsConfig.autoLoadBattleStats,
            autoBackup: settingsConfig.autoBackup,
            autoBackupKeep: settingsConfig.autoBackupKeep,
            autoBackupTimer: settingsConfig.autoBackupTimer,
            autoBackupIntervalMin: settingsConfig.autoBackupIntervalMin
        }));
        _syncAutoBackupConfig();
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

    // 启动时从统一存储(tfjl.dat)恢复配置到 localStorage
    // 【磁盘优先】App 端一律用磁盘值覆盖 webview 缓存（彻底分离 App 与网页，避免清缓存丢设置/项目）；
    // 仅当磁盘也无该 key 时，把 webview 现有值反写回磁盘，保证不丢。
    async function restoreLocalFromDisk() {
        if (!_isTauriRuntime()) return;
        _restoreLock = true;   // 加锁：恢复期间禁止 flush 覆盖
        try {
            const dir = await _resolveRealDataDir();
            await _ensureStoreLoaded(dir);
            let restored = 0, overwritten = 0, backfilled = 0;
            // 先以磁盘为准，覆盖 webview（磁盘优先）
            for (const [key, val] of _storeMap.entries()) {
                if (RESERVED_KEYS.has(key)) continue;
                if (val === null || val === undefined) continue;
                if (localStorage.getItem(key) !== val) {
                    localStorage.setItem(key, val);
                    overwritten++;
                }
                restored++;
            }
            // 再把 webview 里、磁盘没有的重要键反写回磁盘（防 webview 有而磁盘无的情况丢数据）
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (RESERVED_KEYS.has(k)) continue;
                if (!_storeMap.has(k)) {
                    _storeMap.set(k, localStorage.getItem(k));
                    backfilled++;
                }
            }
            // 恢复项目缓存（磁盘优先）
            const pj = _storeMap.get(PROJECTS_KEY);
            if (pj) { try { _projectsCache = JSON.parse(pj); } catch (e) {} }
            if (restored > 0 || backfilled > 0) console.log('[数据存储] 已从 tfjl.dat 恢复 ' + restored + ' 项(覆盖 ' + overwritten + ') / 反写 ' + backfilled + ' 项');
            // 恢复结束后，把可能已经变化的最新值落盘一次，确保磁盘与内存一致
            if (_syncOk) { try { await _flushStore(); } catch (e) {} }
        } finally {
            _restoreLock = false;  // 解锁
        }
    }

    // 项目整体落盘：统一写进 tfjl.dat（不再单独 projects/projects.json）
    // 仅「手动保存/新建/删除/重命名」等用户主动动作走这里（立即全量落盘）。
    // 自动保存（记事本/切皮等）请走 _markProjectsDirty()——零 IO，写盘时自动拉最新。
    async function tfjlSaveAllProjects(projectsArray) {
        if (!isTauriApp) return false;
        _projectsCache = projectsArray || [];
        _projectsCacheDirty = false;
        // 立即落盘：项目是重要数据，不能仅依赖防抖/pagehide（APP 关闭时异步写常丢失，导致重启后项目与默认项目丢失）
        if (_syncOk) { syncAllNow().catch(() => {}); }
        else { _scheduleFlush(); }
        return true;
    }

    // 零成本脏标记：自动保存（记事本/切皮/融合等）调用，不读 IndexedDB 不写盘。
    // 下一次真正落盘（手动保存/切后台/关闭/5分钟安全网）时 _flushStore 会自动拉最新项目。
    function _markProjectsDirty() {
        _projectsCacheDirty = true;
    }

    async function tfjlRestoreAllProjects() {
        if (!isTauriApp) return [];
        // 🔴 修复：不再用 `_projectsCache !== null` 短路——空数组 [] 也 !== null，会屏蔽"现读 tfjl.dat"，
        // 导致重装/清缓存后即使 D 盘 tfjl.dat 有项目也恢复失败（项目栏空白）。
        // 改为：内存缓存、tfjl.dat 两来源合并去重，任一有数据都返回，确保 D 盘权威源始终被读取。
        let fromCache = (_projectsCache && Array.isArray(_projectsCache)) ? _projectsCache : null;
        // 兜底：store 尚未加载则现加载（确保 _storeMap 反映 tfjl.dat 最新内容）
        if (!_storeLoaded) {
            try { const dir = await _resolveRealDataDir(); await _ensureStoreLoaded(dir); } catch (e) {}
        }
        let fromDisk = null;
        const pj = _storeMap.get(PROJECTS_KEY);
        if (pj) { try { fromDisk = JSON.parse(pj); } catch (e) {} }
        if (!Array.isArray(fromDisk)) fromDisk = null;
        // 合并：以 tfjl.dat(D盘) 为权威，内存缓存补充（去重按 name+category）
        const merged = new Map();
        const pushAll = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach(p => { if (p && p.name) merged.set(p.name + '\u0000' + (p.category || '默认分类'), p); });
        };
        pushAll(fromDisk);   // D盘优先
        pushAll(fromCache);  // 内存补充
        const result = Array.from(merged.values());
        if (result.length > 0) _projectsCache = result;  // 有数据才回填，避免用 [] 污染
        return result;
    }

    async function initAppLocal() {
        // 🔴 2026-08-30 性能模式菜单修复：删除「启动一律强制锁 optimized」。
        //    旧逻辑让菜单里的三档切换变成摆设——用户选了高性能/极速，下次启动又被强制改回优化。
        //    现在恢复为「记住用户选择」：默认档 optimized（getPerfMode 未设置时的默认值），
        //    内存安全性由皮肤 256px 缩放 + URL 缓存上限保障，不再需要硬锁。
        // 把诊断日志目录指向 D:\withfriends\塔防精灵助手数据\tfjl_temp\logs（用户指定，Tauri 已确认可正常读写）。
        // 不再依赖 get_diag_log_dir 命令（旧 exe 可能未打包该命令）。
        try {
            if (typeof window.__setDiagLogDir === 'function') {
                window.__setDiagLogDir(softwareDataDir.replace(/[\\/]+$/, '') + '\\tfjl_temp\\logs');
            }
        } catch (e) {}
        const btn = document.getElementById('appLocalSettingsBtn');
        // 按钮无条件显示（网页端/App端都显示）；真正的 Tauri 环境判断放在点击时（openAppLocalSettings 内）进行，
        // 避免 Tauri 全局注入晚于本函数执行导致误判为 false 而不显示按钮
        if (btn) btn.style.display = 'flex';
        await restoreLocalFromDisk();  // 先恢复磁盘配置（重装/清缓存后复原）
        loadConfig();
        initDataSync();  // 启动 localStorage → 用户数据目录自动同步
        loadSkinSelections();  // 恢复皮肤选择记录
        // 先扫描本地，再同步远程；如果并行会导致 scanSkins 清空 registry 把远程条目冲掉
        // 🔴 链路兜底置位 _skinRegistryReady（syncRemoteSkins 内部 finally 也置一次，双保险）：
        //    保证任何异常路径下注册表就绪标志最终都会置上，不会永久静默告警。
        scanSkins().then(() => syncRemoteSkins())
            .catch(e => console.warn('[SKIN] 启动皮肤链异常:', e))
            .finally(() => { try { window._skinRegistryReady = true; } catch (_) {} });
        // 🔴 性能模式记忆保险：首屏加载后按 localStorage 里记录的档位主动重渲一次，
        // 确保「刷新后保持上次设置的性能模式」（极速/优化/高性能）严格生效，不被默认 high 覆盖。
        setTimeout(() => {
            try {
                const m = (typeof window.getPerfMode === 'function') ? window.getPerfMode() : 'high';
                if (m !== 'high') {
                    if (typeof window.updateCardPoolSkins === 'function') window.updateCardPoolSkins().catch(() => {});
                    if (typeof window.reapplyAllSkins === 'function') window.reapplyAllSkins().catch(() => {});
                }
            } catch (e) {}
        }, 1800);
        // 兜底：启动 1.5s 后再重刷一次皮肤，确保即使首屏渲染早于皮肤索引就绪也能补上（修复概率性卡住不显示）
        setTimeout(() => { try { if (typeof window.reapplyAllSkins === 'function') window.reapplyAllSkins(); } catch (e) {} }, 1500);
        // 🔴 强制飘屏公告：打开软件后检查是否有未读公告，有则弹一次（点「我已阅读」关闭，本机记已读）
        setTimeout(() => { try { if (typeof window.checkForceBroadcast === 'function') window.checkForceBroadcast(); } catch (e) {} }, 2500);
        // APP 端版本号回填：Tauri 无 Service Worker，#versionTag 不会被 SW_VERSION 消息更新，
        // 否则永远显示 index.html 写死的 fallback "s1.0.225"。这里用真实 APP 版本回填。
        try {
            const tag = document.getElementById('versionTag');
            if (tag) {
                // 🔴 2026-08-29 修复：优先用 __TAURI__.app.getVersion()（=tauri.conf.json 正确版本），回退 getAppVersion() 命令
                let av = '?';
                try {
                    if (window.__TAURI__ && window.__TAURI__.app && typeof window.__TAURI__.app.getVersion === 'function') {
                        av = await window.__TAURI__.app.getVersion();
                    }
                } catch (e) {}
                if ((!av || av === '?') && typeof getAppVersion === 'function') { try { av = await getAppVersion(); } catch (e) {} }
                const base = (typeof window.__DEPLOY_TAG === 'string' && window.__DEPLOY_TAG) ? window.__DEPLOY_TAG
                         : ((tag.textContent.split(' · ')[0] || '').trim() || 'App');
                tag.textContent = base + ' · App v' + (av || '?');
            }
        } catch (e) {}
        console.log('[APP] APP本地功能已初始化, isTauriApp:', _isTauriRuntime());
    }

    // ==================== 设置面板 ====================

    function openAppLocalSettings() {
        if (!_isTauriRuntime()) return;
        showSettingsModal();
        fillSettingsForm();
        // 扫描文件列表总是执行（轻量）
        scanAllFiles();
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('打开APP设置');
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP设置开关:' + type);
    }

    function toggleAutoBackup() {
        settingsConfig.autoBackup = !settingsConfig.autoBackup;
        updateToggleUI('autoBackup', settingsConfig.autoBackup);
        _syncAutoBackupConfig();
        if (settingsConfig.autoBackup && typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP设置开关:autoBackup');
    }

    function onAutoBackupKeepInput(val) {
        const n = parseInt(val, 10);
        settingsConfig.autoBackupKeep = (n >= 1 && n <= 999) ? n : AUTO_BACKUP_DEFAULT_KEEP;
        localStorage.setItem(AUTO_BACKUP_KEEP_KEY, String(settingsConfig.autoBackupKeep));
    }

    function toggleAutoBackupTimer() {
        settingsConfig.autoBackupTimer = !settingsConfig.autoBackupTimer;
        updateToggleUI('autoBackupTimer', settingsConfig.autoBackupTimer);
        if (settingsConfig.autoBackupTimer) _startAutoBackupTimer(); // 开了就立即按新间隔启动
        else _stopAutoBackupTimer();                                 // 关了就停掉定时
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP设置开关:autoBackupTimer');
    }

    function onAutoBackupIntervalInput(val) {
        const m = parseInt(val, 10);
        settingsConfig.autoBackupIntervalMin = (m >= 1 && m <= 1440) ? m : 30;
        localStorage.setItem(AUTO_BACKUP_KEEP_KEY, String(settingsConfig.autoBackupKeep)); // 仅占位，主存 maDirsConfig
        // 若定时开关开着，按新间隔重启
        if (settingsConfig.autoBackupTimer) _startAutoBackupTimer();
    }

    function updateToggleUI(type, on) {
        const suffix = (type === 'screenshot') ? 'Screenshot' : (type === 'battle') ? 'Battle' : (type === 'autoBackup' ? 'Backup' : 'BackupTimer');
        const tgl = document.getElementById('tglAuto' + suffix);
        if (!tgl) return;
        tgl.style.background = on ? '#4caf50' : 'rgba(255,255,255,0.15)';
        const knob = tgl.querySelector('span');
        if (knob) knob.style.left = on ? '18px' : '2px';
    }

    function closeAppLocalSettings() {
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP设置关闭');
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
                        <button onclick="event.stopPropagation();restoreDefaultMaDirs()" title="把6个目录恢复为默认路径（解决改错路径导致扫描卡死）" style="margin-left:auto;background:rgba(255,255,255,0.1);color:#ffd700;border:1px solid rgba(255,215,0,0.3);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;white-space:nowrap;">↺ 恢复默认目录</button>
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

                    <div style="margin-top:12px;padding:10px 12px;background:rgba(76,175,80,0.06);border:1px solid rgba(76,175,80,0.2);border-radius:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div style="color:rgba(255,255,255,0.8);font-size:0.8rem;font-weight:bold;">🤖 自动增量备份</div>
                            <label id="lblAutoBackup" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;" onclick="toggleAutoBackup()">
                                <span id="tglAutoBackup" style="display:inline-block;width:36px;height:20px;border-radius:10px;background:#4caf50;position:relative;transition:background 0.2s;">
                                    <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:18px;transition:left 0.2s;"></span>
                                </span>
                            </label>
                        </div>
                        <div style="color:rgba(255,255,255,0.4);font-size:0.68rem;margin:6px 0 8px;line-height:1.4;">每次数据变动后自动存一份备份（内容不变不备份），最多保留最近 N 份，旧自动覆盖删除。可随时在上方列表「还原」。</div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="color:rgba(255,255,255,0.6);font-size:0.75rem;white-space:nowrap;">保留份数：</span>
                            <input type="number" id="autoBackupKeepInput" min="1" max="999" value="20" oninput="onAutoBackupKeepInput(this.value)" style="width:70px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:0.8rem;box-sizing:border-box;">
                            <span style="color:rgba(255,255,255,0.35);font-size:0.68rem;">份（默认 20）</span>
                        </div>
                        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div style="color:rgba(255,255,255,0.75);font-size:0.76rem;font-weight:bold;">⏰ 定时整备备份</div>
                                <label id="lblAutoBackupTimer" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;" onclick="toggleAutoBackupTimer()">
                                    <span id="tglAutoBackupTimer" style="display:inline-block;width:36px;height:20px;border-radius:10px;background:#4caf50;position:relative;transition:background 0.2s;">
                                        <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:18px;transition:left 0.2s;"></span>
                                    </span>
                                </label>
                            </div>
                            <div style="color:rgba(255,255,255,0.4);font-size:0.66rem;margin:6px 0 8px;line-height:1.4;">兜底网：即使一直高频操作没停过 8 秒，也按下面间隔自动留一份快照，防全天一份都没生成。关窗时也会立即补一份。</div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="color:rgba(255,255,255,0.6);font-size:0.75rem;white-space:nowrap;">间隔：</span>
                                <input type="number" id="autoBackupIntervalInput" min="1" max="1440" value="30" oninput="onAutoBackupIntervalInput(this.value)" style="width:70px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:0.8rem;box-sizing:border-box;">
                                <span style="color:rgba(255,255,255,0.35);font-size:0.68rem;">分钟（1~1440，默认 30）</span>
                            </div>
                        </div>
                    </div>
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
                    <!-- 工具栏（搜索框+分类）独立容器，不参与每次重绘，避免中文输入法 composition 被打断打不出中文 -->
                    <div id="scannedFileToolbar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);">
                        <input type="text" id="scannedFileSearchInput" value="" placeholder="🔍 搜索文件名…" oninput="setScannedFilterKeyword(this.value)" style="flex:1;min-width:120px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:0.8rem;box-sizing:border-box;">
                        <div id="scannedFileCats" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"></div>
                        <button id="scannedShareModeBtn" onclick="toggleScannedShareMode()" title="分享模式：快速分享到需求墙" style="background:linear-gradient(135deg,#7c4dff,#b388ff);color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:bold;white-space:nowrap;">📢 分享模式</button>
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
        // 恢复自动备份开关与保留份数
        updateToggleUI('autoBackup', settingsConfig.autoBackup);
        const keepInput = document.getElementById('autoBackupKeepInput');
        if (keepInput) keepInput.value = settingsConfig.autoBackupKeep || AUTO_BACKUP_DEFAULT_KEEP;
        // 恢复定时整备开关与间隔
        updateToggleUI('autoBackupTimer', settingsConfig.autoBackupTimer);
        const intervalInput = document.getElementById('autoBackupIntervalInput');
        if (intervalInput) intervalInput.value = settingsConfig.autoBackupIntervalMin || 30;
    }

    async function selectMaDir(key) {
        const selected = await openFileDialog();
        if (selected) {
            maDirs[key] = selected;
            document.getElementById('maDir_' + key).value = selected;
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('配置老马目录:' + key);
            scanAllFiles(true); // 目录变化强制重新扫描
        }
    }

    async function selectSoftwareDataDir() {
        const selected = await openFileDialog();
        if (selected) {
            if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP设置数据目录');
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

    // 单目录条目上限：超过则只收集文件、不再递归子目录（防超大目录卡死）
    const SCAN_MAX_DIR_ENTRIES = 5000;
    // 全局文件软上限：超过则停止扫描（防整盘误扫）
    const SCAN_MAX_TOTAL_FILES = 40000;

    // 递归扫描目录（最大深度3层），收集所有 txt/json 文件
    // shared: { total, skipped } 跨递归共享的计数器；allowedExts/scanned 透传
    async function collectFilesRecursive(dirPath, dirKey, dirLabel, maxDepth, allowedExts, shared) {
        if (maxDepth === undefined) maxDepth = 3;
        if (allowedExts === undefined) allowedExts = ['txt', 'json'];
        const files = [];
        if (maxDepth <= 0) return files;
        if (shared && shared.total >= SCAN_MAX_TOTAL_FILES) { if (shared.skipped) shared.skipped.push(dirPath + '（已达总文件上限）'); return files; }
        try {
            const entries = await readDir(dirPath);
            // 单目录过大保护：条目数超过阈值则不再递归子目录，仅收集本层文件并标记跳过
            const tooBig = entries.length > SCAN_MAX_DIR_ENTRIES;
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
                        if (shared) shared.total++;
                    }
                } else if (!tooBig) {
                    // 递归扫描子文件夹
                    const subFiles = await collectFilesRecursive(entry.path, dirKey, dirLabel, maxDepth - 1, allowedExts, shared);
                    files.push(...subFiles);
                }
            }
            if (tooBig && shared && shared.skipped) shared.skipped.push(dirPath + '（单目录条目 ' + entries.length + ' 超过上限 ' + SCAN_MAX_DIR_ENTRIES + '，已跳过子目录）');
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
        if (force === true && typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP刷新扫描');
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

        // 跨目录共享计数器（单目录/总文件上限保护 + 跳过记录）
        const shared = { total: 0, skipped: [] };
        const SCAN_TOTAL_CAP = 40000;
        let hitCap = false;
        try {
            // 递归扫描所有目录（含子文件夹），目录不存在则自动创建
            for (const [key, dir] of allDirs) {
                if (shared.total >= SCAN_TOTAL_CAP) { hitCap = true; break; }
                // 显示当前正在扫描的目录，便于发现卡在哪个（之前只显示“扫描中”无进度）
                const label = dirLabels[key] || key;
                listEl.innerHTML = '<div style="color:rgba(255,255,255,0.5);text-align:center;padding:20px;font-size:0.85rem;">扫描中...（正在扫描：' + label + '<br><span style="font-size:0.75rem;opacity:0.7;">' + dir + '</span>）</div>';
                await createDir(dir);
                const subFiles = await collectFilesRecursive(dir, key, dirLabels[key], 3, ['txt', 'json'], shared);
                scannedFiles.push(...subFiles);
            }
        } catch (e) {
            console.error('[APP] 扫描过程异常:', e);
        }

        // 异常/超时兜底：即使中途出错也不永久停在“扫描中”，已收集的部分照常渲染
        if (scannedFiles.length === 0) {
            let msg = '未找到 txt/json 文件';
            if (shared.skipped && shared.skipped.length > 0) {
                msg += '<br><span style="color:#ff9800;font-size:0.75rem;">以下目录过大已跳过：<br>' + shared.skipped.slice(0, 5).join('<br>') + '</span>';
            }
            listEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">' + msg + '</div>';
            if (statsEl) statsEl.innerHTML = '';
            return;
        }

        saveScanCache(scannedFiles);
        if (hitCap || (shared.skipped && shared.skipped.length > 0)) {
            const skipMsg = (hitCap ? '已达总文件上限，扫描中止。' : '') + (shared.skipped && shared.skipped.length ? '部分过大目录已跳过：' + shared.skipped.slice(0, 3).join('；') : '');
            console.warn('[APP] 扫描受限:', skipMsg);
        }
        renderScannedFiles();
    }

    // 渲染工具栏（搜索框除外，搜索框在独立稳定容器 scannedFileToolbar，不参与重绘，
    // 否则每次输入重绘会打断中文输入法 composition，导致中文打不出来/只能复制粘贴）
    function renderScannedToolbar() {
        const catsEl = document.getElementById('scannedFileCats');
        if (!catsEl) return;
        const cats = ['全部', '寒冰', '暗月', '漩涡', '合作', '深海', '活动', '日志', '临时', '其他'];
        const colorMap = getScannedCategoryColor ? null : null; // 占位，避免未定义告警
        const cmap = {
            '全部': '#ffffff', '寒冰': '#64b5f6', '暗月': '#ce93d8', '漩涡': '#4fc3f7',
            '合作': '#ffd54f', '深海': '#4db6ac', '活动': '#ff8a65', '日志': '#ef5350', '临时': '#a5d6a7', '其他': '#bdbdbd'
        };
        let h = '';
        cats.forEach(cat => {
            const active = _scannedFilterCategory === cat;
            const color = cmap[cat] || '#bdbdbd';
            const count = cat === '全部' ? scannedFiles.length : scannedFiles.filter(f => (f.category || '其他') === cat).length;
            h += `<button onclick="setScannedFilterCategory('${cat}')" style="background:${active ? color : 'rgba(255,255,255,0.06)'};color:${active ? '#000' : color};border:1px solid ${active ? color : 'rgba(255,255,255,0.12)'};padding:3px 10px;border-radius:14px;cursor:pointer;font-size:0.7rem;transition:all 0.15s;" title="${cat} ${count}个">${cat}${cat !== '全部' && count > 0 ? ' (' + count + ')' : ''}</button>`;
        });
        catsEl.innerHTML = h;
        const shareBtn = document.getElementById('scannedShareModeBtn');
        if (shareBtn) {
            shareBtn.textContent = _shareModeScanned ? '📢 退出分享' : '📢 分享模式';
            shareBtn.style.background = _shareModeScanned ? 'linear-gradient(135deg,#ff6b6b,#ff9e80)' : 'linear-gradient(135deg,#7c4dff,#b388ff)';
            shareBtn.title = _shareModeScanned ? '退出分享模式' : '分享模式：快速分享到需求墙';
        }
    }

    function renderScannedFiles() {
        const listEl = document.getElementById('scannedFileList');
        const statsEl = document.getElementById('fuzzyStatsArea');
        if (!listEl) return;

        // 工具栏（搜索框/分类/分享）只在有必要时重渲染，且搜索框本身在稳定容器不被重建
        renderScannedToolbar();

        // 筛选处理
        let displayFiles = scannedFiles;
        if (_scannedFilterCategory && _scannedFilterCategory !== '全部') {
            displayFiles = displayFiles.filter(f => (f.category || '其他') === _scannedFilterCategory);
        }
        if (_scannedFilterKeyword) {
            const kw = _scannedFilterKeyword.toLowerCase();
            displayFiles = displayFiles.filter(f => f.name.toLowerCase().includes(kw));
        }

        const isEmpty = displayFiles.length === 0;

        const colorMap = {
            '全部': '#ffffff', '寒冰': '#64b5f6', '暗月': '#ce93d8', '漩涡': '#4fc3f7',
            '合作': '#ffd54f', '深海': '#4db6ac', '活动': '#ff8a65', '日志': '#ef5350', '临时': '#a5d6a7', '其他': '#bdbdbd'
        };

        let html = '';
        if (isEmpty) {
            html += '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;font-size:0.85rem;">未找到 txt/json 文件</div>';
        } else if (_shareModeScanned) {
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
                        <button onclick="shareScannedFileFromMain('${safePath}','${f.name.replace(/'/g, "\\'")}')" title="分享到需求墙" style="background:rgba(156,39,176,0.25);color:#ce93d8;border:1px solid rgba(156,39,176,0.35);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">📢</button>
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描分享模式');
        _selScannedSharePaths.clear();
        renderScannedFiles();
    }

    function setScannedFilterKeyword(val) {
        _scannedFilterKeyword = (val || '').trim();
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描搜索文件');
        _selScannedSharePaths.clear();
        renderScannedFiles();
    }

    function setScannedFilterCategory(cat) {
        _scannedFilterCategory = cat || '全部';
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描分类筛选');
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描文件分享');
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描减伤计算');
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP数据备份');

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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP查看备份');
        const dir = softwareDataDir.replace(/[\\/]+$/, '');
        let entries;
        try { entries = await readDir(dir); }
        catch (e) { alert('无法读取数据目录'); return; }

        const backupFiles = entries
            .filter(e => e.is_file && e.name.endsWith('.json') &&
                (e.name.startsWith('tfjl-full-backup-') || e.name.startsWith(AUTO_BACKUP_PREFIX)))
            .sort((a, b) => b.name.localeCompare(a.name)); // 最新在前

        const listDiv = document.getElementById('backupFileList');
        if (!listDiv) return;
        listDiv.style.display = 'block';

        if (backupFiles.length === 0) {
            listDiv.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:10px;font-size:0.75rem;">暂无备份文件，点击上方「📤 一键备份」创建</div>';
            return;
        }

        listDiv.innerHTML = backupFiles.map(f => {
            const isAuto = f.name.startsWith(AUTO_BACKUP_PREFIX);
            const displayTs = f.name.replace(isAuto ? AUTO_BACKUP_PREFIX : 'tfjl-full-backup-', '').replace('.json', '');
            const parts = displayTs.split('_');
            const displayName = parts[0] + ' ' + (parts[1] ? parts[1].slice(0, 2) + ':' + parts[1].slice(2) + ':' + parts[1].slice(4, 6) : '');
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:6px;">' +
                '<span style="color:#fff;font-size:0.78rem;">' + (isAuto ? '🤖 ' : '📦 ') + displayName + (isAuto ? ' <span style="color:#4caf50;font-size:0.65rem;">[自动]</span>' : '') + '</span>' +
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP设置保存');
        saveConfig();
        closeAppLocalSettings();
    }

    // 恢复默认老马目录（解决用户改错路径导致“扫描中”卡死）
    function restoreDefaultMaDirs() {
        if (!confirm('确定把6个老马目录恢复为默认路径？\n（用于修复目录改错导致扫描卡死）\n当前自定义路径将被覆盖。')) return;
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP恢复默认老马目录');
        maDirs = Object.assign({}, DEFAULT_MA_DIRS);
        saveConfig();
        if (typeof fillSettingsForm === 'function') fillSettingsForm();
        alert('✅ 已恢复默认目录。\n请点「🔄 刷新扫描」重新扫描（现在已加超时与过大目录保护，不会再卡死）。');
    }

    // ==================== 文件查看/编辑器 ====================

    async function detectFileEncoding(filePath) {
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描编码检测');
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
        // 套用统一新记事本框架 openScriptNotebook（与 txtFilesPanel 扫描文件一致：减伤栏/解析/查找替换/写回原文件/存项目）
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描文件查看');
        const fileName = filePath.split(/[\\/]/).pop();
        if (typeof openScannedInNotebook === 'function') {
            await openScannedInNotebook(filePath, fileName, false, true);  // zAboveSettings=true：浮窗层级高于设置面板(99999)，设置面板保留、可多开
        } else {
            // 兜底（理论上不会到这）
            const content = await readTextFile(filePath);
            if (content === null) { alert('读取文件失败'); return; }
            showFileEditor(filePath, content, null, null, null);
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
                            <button onclick="editorSwapFindReplace()" title="互换查找与替换内容" style="background:rgba(79,195,247,0.2);color:#4fc3f7;border:1px solid rgba(79,195,247,0.35);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem;white-space:nowrap;">⇄ 互换</button>
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP扫描文件加载手牌');
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

    // 互换查找与替换内容：查找↔替换为
    function editorSwapFindReplace() {
        const findInput = document.getElementById('editorFindInput');
        const replaceInput = document.getElementById('editorReplaceInput');
        if (!findInput || !replaceInput) return;
        const tmp = findInput.value;
        findInput.value = replaceInput.value;
        replaceInput.value = tmp;
        editorFind('count'); // 互换后重新统计新查找词的匹配数
    }

    // ==================== 双文件对比 ====================

    async function startCompareMode(currentPath) {
        // 让用户输入第二个文件路径 or 从已扫描文件中选择
        const allFiles = window.scannedFiles || [];
        if (allFiles.length === 0) {
            const path = await askTextInputAsync({ title: '双文件对比', label: '请输入第二个文件的完整路径：' });
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
        if (force === true && typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP车主副本统计(刷新)');
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

        // === 本周（周一~周日）合计计算（提前，供顶部卡片与周X区共用）===
        // 注意：只有「按周统计」这块每周一重置——它只累加「本周一~今天」的每日数据，
        // 其它卡片（总局数/天数/日均/最高/历史趋势）均为永久累计，不受周一影响。
        const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const weekDayDow = [1, 2, 3, 4, 5, 6, 0]; // getDay() 值
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 归一化到当天 0 点，避免时分秒影响“未来日期”判定
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
        // 计算每列对应的日期和计数：以“本周一”为锚点，依次 +0~+6 天得到周一~周日。
        // 用“日期 > 今天”判定未来（而不是 daysBack 正负），避免周日(dow=0)被误判为已过去、
        // 从而把“上周日”显示成本周周日（上一版 bug：周一当天仍显示上周日数据）。
        const monday = new Date(today);
        // 周日(dow=0)属于上一周末尾，本周一应回退 6 天；其余回退 (dow-1) 天
        monday.setDate(today.getDate() - (todayDow === 0 ? 6 : todayDow - 1));
        const wdData = weekDayDow.map((dow, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i); // i=0 周一 ... i=6 周日
            const ds = formatLocalDate(d);
            const isFuture = d > today; // 本周尚未到来的日期一律记 0（每周一清零、按天累加、每周循环）
            return {
                label: weekDayLabels[i],
                dow,
                count: isFuture ? 0 : (dateMap[ds] || 0),
                date: ds
            };
        });
        // 本周总局数（周一~周日 合计）—— 仅取本周一至今的每日数据，故每周一自然归零
        const weekTotal = wdData.reduce((sum, d) => sum + d.count, 0);
        const mondayDate = wdData[0].date; // wdData[0] = 本周一，用于显示本周边界

        let html = '';
        html += `<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap;">`;
        html += `<div style="background:rgba(156,39,176,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#e040fb;font-size:1.4rem;font-weight:bold;">${totalGames}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">总局数</div></div>`;
        html += `<div style="background:rgba(0,188,212,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#00bcd4;font-size:1.4rem;font-weight:bold;">${stats.length}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">天数</div></div>`;
        html += `<div style="background:rgba(255,152,0,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#ff9800;font-size:1.4rem;font-weight:bold;">${avgCount}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">日均</div></div>`;
        html += `<div style="background:rgba(244,67,54,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#f44336;font-size:1.4rem;font-weight:bold;">${maxCount}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;">最高</div></div>`;
        html += `<div style="background:rgba(0,230,118,0.2);padding:8px 12px;border-radius:6px;text-align:center;"><div style="color:#00e676;font-size:1.4rem;font-weight:bold;" title="仅统计本周一~今天，每周一 0 点自动重置">${weekTotal}</div><div style="color:rgba(255,255,255,0.5);font-size:0.7rem;" title="每周一 0 点自动重置">本周局数·周一重置</div></div>`;
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

        const recent = stats.slice(0, 30);
        const wdMax = Math.max(1, ...wdData.map(d => d.count));
        html += `<div style="margin-top:12px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="color:rgba(255,255,255,0.5);font-size:0.75rem;">周一~周日<span style="color:#00e676;margin-left:6px;">· 每周一重置</span></span><span style="color:#00e676;font-size:0.9rem;font-weight:bold;" title="本周边界：自 ${mondayDate}（周一）起">本周合计 ${weekTotal} 局</span></div>`;
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
        if (typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP清除对战缓存');
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
        if (force === true && typeof window.__recordFeatureUse === 'function') window.__recordFeatureUse('APP对战统计(刷新)');
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

    // 远程皮肤注册表（GitHub Pages 托管，所有设备打开即自动同步；jsDelivr 冷回源反而更慢已回退）
    const REMOTE_SKIN_BASE = 'https://gyq-svip.github.io/tfjl-web/skins';
    const REMOTE_SKIN_BASE_FALLBACK = 'https://gyq-svip.github.io/tfjl-web/skins';
    const REMOTE_SKIN_REGISTRY_URL = REMOTE_SKIN_BASE + '/registry.json';
    const REMOTE_SKIN_FUSIONS_URL = REMOTE_SKIN_BASE + '/fusions.json';

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
    // 🔴 2026-08-29 内存优化：改为「LRU 上限缓存 + 淘汰时 revokeObjectURL」。
    //    原实现是无限增长的普通对象，且从不调用 revokeObjectURL —— 每看一张皮肤就常驻一份
    //    解码位图，413 张皮刷一遍即累积数百 MB，是 App 内存飙到 1.4G 的主因之一。
    const SKIN_URL_CACHE_MAX = 500; // 🔴 2026-08-30 200→500：用户要求全部缓存。共 413 张皮全量常驻，
    // blob URL 只持有编码后的 PNG 字节（413×~50KB≈20MB，可忽略）；解码位图仍只存在于正在显示的 <img>，
    // 不随缓存增长。配合 _preheatLocalSkinUrls 启动预热，任何切皮零读盘零缩放、即点即换。
    const skinImageUrlCache = new Map(); // filePath -> url（Map 保持插入顺序，天然支持 LRU）

    function _skinUrlRelease(url) {
        if (typeof url === 'string' && url.indexOf('blob:') === 0) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }
    }

    function _skinUrlEvictIfNeeded() {
        // 🔴 关键修复：LRU 淘汰时【不再 revoke】blob URL。
        // 原因：被淘汰的 blob 可能仍被页面 <img>（阵容槽/卡池）引用，revoke 后 <img> 加载失败 →
        //       日志里反复出现 'Failed to load skin image: blob:'。淘汰只删除 Map 引用，blob 由 <img> 持有保持存活，
        //       移除后浏览器自动回收。牺牲少量内存（最多 80 张未显示皮肤常驻）换皮肤不再坏。
        // 只有 clearSkinUrlCache()（重新扫描/切换项目）才真正 revoke 全清。
        while (skinImageUrlCache.size > SKIN_URL_CACHE_MAX) {
            const oldestKey = skinImageUrlCache.keys().next().value; // 最早插入 = 最久未用
            skinImageUrlCache.delete(oldestKey);
        }
    }

    function _skinUrlSet(filePath, url) {
        if (skinImageUrlCache.has(filePath)) skinImageUrlCache.delete(filePath);
        skinImageUrlCache.set(filePath, url);
        _skinUrlEvictIfNeeded();
    }

    // 全清皮肤 URL 缓存（重新扫描/切换项目时调用），逐个 revoke 释放 blob，避免旧图滞留
    function clearSkinUrlCache() {
        try { skinImageUrlCache.forEach(function (u) { _skinUrlRelease(u); }); } catch (e) {}
        try { skinImageUrlCache.clear(); } catch (e) {}
        // 同步释放远程皮肤 blob URL 缓存（LRU 改造后也需在此 revoke，否则切换项目/重扫时泄漏）
        try {
            _skinBlobUrlCache.forEach(function (u) { if (u && u.indexOf('blob:') === 0) { try { URL.revokeObjectURL(u); } catch (e) {} } });
            _skinBlobUrlCache.clear();
        } catch (e) {}
    }
    window.clearSkinUrlCache = clearSkinUrlCache;

    // 供 app-core.js 的 memoryReport() 调用：报告皮肤 URL 缓存占用
    window.skinCacheStats = function () {
        let blobCount = 0, dataCount = 0;
        try {
            skinImageUrlCache.forEach(function (u) {
                if (typeof u === 'string') {
                    if (u.indexOf('blob:') === 0) blobCount++;
                    else dataCount++; // data: URL（未缩放兜底）
                }
            });
        } catch (e) {}
        // 远程皮肤 blob 缓存（LRU 上限 _SKIN_BLOB_CACHE_MAX，挂机主要泄漏源）
        let remoteBlob = 0;
        try { _skinBlobUrlCache.forEach(function (u) { if (u && u.indexOf('blob:') === 0) remoteBlob++; }); } catch (e) {}
        // blob: URL 字符串本身极短，无法据此估算真实位图内存；改为按「缩放后解码尺寸」估算：
        // 缩放到 ≤256px 的 PNG 解码位图约 256×256×4 ≈ 262KB/张（GPU 纹理另计，约再 ×1.5）。
        const estDecodeMB = (blobCount + dataCount) * 256 * 256 * 4 / 1048576;
        return {
            size: skinImageUrlCache.size,
            max: SKIN_URL_CACHE_MAX,
            blob: blobCount,
            data: dataCount,
            estDecodeMB: estDecodeMB.toFixed(1),
            remoteBlobCache: remoteBlob + ' / 上限 ' + _SKIN_BLOB_CACHE_MAX
        };
    };

    async function getSkinImageUrl(filePath) {
        if (skinImageUrlCache.has(filePath)) {
            // 命中后移到末尾，维持 LRU 顺序
            const hit = skinImageUrlCache.get(filePath);
            skinImageUrlCache.delete(filePath);
            skinImageUrlCache.set(filePath, hit);
            return hit;
        }
        const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        if (!invokeFn) return null;

        // 方案A：优先用 read_image_base64 自定义命令（rebuild exe 后可用）
        try {
            const dataUrl = await invokeFn('read_image_base64', { filePath });
            if (dataUrl) {
                // data: URL → blob → 缩放 → 缓存 blob URL（缩放可大幅降低解码/GPU 内存）
                const blob = await _dataUrlToBlob(dataUrl);
                const finalUrl = blob ? await _downscaleBlobIfNeeded(blob) : dataUrl;
                _skinUrlSet(filePath, finalUrl);
                return finalUrl;
            }
        } catch(e) {
            console.log('[SKIN] read_image_base64 ACL blocked, trying fs plugin...', String(e).slice(0,80));
        }

        // 方案B：用 Tauri 内置 fs 插件读二进制 → blob: URL
        // （read_image_base64 的 ACL 需 rebuild exe 才能解锁，fs:default 在旧 exe 中已编译）
        try {
            const bytes = await invokeFn('plugin:fs|read_file', { path: filePath, options: undefined });
            const blobUrl = bytesToBlobUrl(bytes, filePath);
            if (blobUrl) {
                // 把原生 blob URL 还原成 blob 再缩放，避免缩放时再读一遍文件
                try {
                    const blob = await (await fetch(blobUrl)).blob();
                    const finalUrl = await _downscaleBlobIfNeeded(blob);
                    _skinUrlRelease(blobUrl); // 释放未缩放的原始 blob URL
                    _skinUrlSet(filePath, finalUrl);
                    return finalUrl;
                } catch(e) {
                    _skinUrlSet(filePath, blobUrl); // 缩放失败则退回原 blob
                    return blobUrl;
                }
            }
        } catch(e) {
            console.warn('[SKIN] read_file also failed:', filePath, String(e).slice(0,160));
        }
        return null;
    }

    // data: URL → Blob
    async function _dataUrlToBlob(dataUrl) {
        try {
            const res = await fetch(dataUrl);
            return await res.blob();
        } catch (e) { return null; }
    }

    // 🔴 2026-08-29 内存优化：把皮肤图缩放到最大边长 256px 再生成 blob。
    // 原图多为 512~1024px 的大 PNG，解码后位图直接膨胀 4~16 倍、再上传 GPU 又 ×1.5~2，
    // 400+ 张皮肤累积即数百 MB。缩到 256px 视觉几乎无差，但解码位图 + GPU 纹理内存可省 60%~80%。
    const SKIN_MAX_EDGE = 256;
    async function _downscaleBlobIfNeeded(blob) {
        // 🔴 内存泄漏修复：入参 blob 是临时中间产物（来自 dataUrl 或 read_file 解码），
        //    一旦生成出最终的 outBlob URL，源 blob 必须立即 revoke，否则每加载一张皮肤都泄漏一个
        //    512~1024px 的解码源（含底层解码位图），400+ 张累积即数百 MB，且永不回收（无引用后浏览器也不及时 GC）。
        //    revoke 源 blob 不影响已 createObjectURL 出来的 outBlob URL——两者是独立副本。
        if (!blob || !blob.type || blob.type.indexOf('image/') !== 0) {
            const u = URL.createObjectURL(blob);
            return u; // data: 等非 image 类型直接透传（无源泄漏风险）
        }
        try {
            if (typeof createImageBitmap !== 'function') {
                const u = URL.createObjectURL(blob);
                return u;
            }
            const bmp = await createImageBitmap(blob);
            const w = bmp.width, h = bmp.height;
            const maxEdge = Math.max(w, h);
            if (maxEdge <= SKIN_MAX_EDGE) {
                bmp.close && bmp.close();
                _skinUrlRelease(blob); // 源 blob 不再需要，立即释放
                return URL.createObjectURL(blob); // 本身已够小，直接走原图
            }
            const scale = SKIN_MAX_EDGE / maxEdge;
            const tw = Math.max(1, Math.round(w * scale));
            const th = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = tw; canvas.height = th;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bmp, 0, 0, tw, th);
            bmp.close && bmp.close();
            const outBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            _skinUrlRelease(blob); // 源 blob 用完即释放（关键修复点）
            if (outBlob) return URL.createObjectURL(outBlob);
            return URL.createObjectURL(blob);
        } catch (e) {
            // 缩放失败（解码/画布异常）→ 退回原 blob，不影响功能
            return URL.createObjectURL(blob);
        }
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

    // 🔴 2026-08-29 扫描防抖：启动阶段 app-local2 初始化、app-core 的 DOMContentLoaded 重扫、
    //    远端同步回调会各自触发一次，实测 1 秒内全量扫 3~4 遍（每遍遍历 400+ 文件并重建注册表），
    //    纯属浪费 IO/CPU 且放大内存峰值。3 秒内的重复调用直接复用已有结果。
    let _lastSkinScanTs = 0;
    const SKIN_SCAN_DEBOUNCE_MS = 3000;
    async function scanSkins() {
        const _since = Date.now() - _lastSkinScanTs;
        if (_since < SKIN_SCAN_DEBOUNCE_MS) {
            console.log('[SKIN] scanSkins() 跳过：' + _since + 'ms 前刚扫描过（防重复全量扫描）');
            return window.skinRegistry;
        }
        // 🔴 2026-08-30 网页版关键修复：网页版的皮肤注册表由 skins-web.js 管理（IndexedDB 缓存链路），
        //    本函数是磁盘扫描（Tauri 专用）。旧代码在 softwareDataDir 判空前就执行
        //    window.skinRegistry = {} —— 网页版每次启动（initAppLocal + DOMContentLoaded 两处调用）
        //    都会把 skins-web 刚从 IndexedDB 恢复好的注册表清空 → 皮肤要等网络注册表拉完才回来，
        //    弱网下「打开页面一片空白」。网页版直接原样返回，注册表交给 skins-web.js。
        if (!isTauriApp) {
            console.log('[SKIN] 网页版跳过磁盘扫描（注册表由 skins-web.js 管理）');
            return window.skinRegistry;
        }
        console.log('[SKIN] scanSkins() START');
        // 本轮扫描计数（汇总成一条日志，替代原先逐英雄打印）
        let _scanHeroCount = 0, _scanSkinCount = 0;
        // 保留已有的远程皮肤条目，避免和 syncRemoteSkins 并行/重复调用时把远程条目冲掉
        const existingRemote = {};
        for (const [heroName, skins] of Object.entries(window.skinRegistry || {})) {
            existingRemote[heroName] = (skins || []).filter(s => s.remote && s.url);
        }
        window.skinRegistry = {};
        // 清内存皮肤图缓存，避免重新扫描后仍命中旧 blob（更新/修复后拿不到新皮肤）
        // 🔴 2026-08-29：改用 clearSkinUrlCache()，逐个 revokeObjectURL 真正释放内存
        //    （原 Object.keys() 对 Map 无效，等于没清；且 delete 属性也不会释放 blob）
        try { clearSkinUrlCache(); } catch (e) {}
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
                // 用 Map 按皮肤名去重：同名时 .skin 优先（.png 是格式统一前的历史残留），
                // 避免"同一个皮肤既扫到 .png 又扫到 .skin"导致计数虚高（如 465 而非 413）。
                const skins = [];
                const _byName = new Map();
                for (const fileEntry of fileEntries) {
                    const fileName = (typeof fileEntry === 'string') ? fileEntry : (fileEntry.name || '');
                    // 本地皮肤缓存支持 .skin 非图片后缀（从 .png 源构建的 skins.zip，见 Gitee v-skins），
                    // 同时保留 .png 兼容老用户本地已下载的缓存。解码按文件头 magic bytes，与后缀无关。
                    const m = fileName.match(/^(.+)\.(png|jpg|jpeg|gif|webp|skin)$/i);
                    if (!m) continue;
                    let skinName = m[1];
                    // 🔴 2026-08-30 根治融合皮走远程：融合卡皮肤文件名形如「融合石头_石头.skin」，
                    //    而 registry 登记的 name 是「石头」（不带「融合XX_」前缀）。
                    //    若直接用全文件名当 name，两边对不上 → syncRemoteSkins 误判"本地没有"
                    //    → 为每张融合皮添加一条 {url:远程, path:null} 条目 → 每次都从 GitHub 拉图
                    //    （既刷屏 "Remote skin added"，又是内存持续增长的直接来源）。
                    //    仅对「融合XX」目录下的文件剥掉前缀，普通皮肤命名不受影响。
                    if (heroName.indexOf('融合') === 0) {
                        const fm = skinName.match(/^融合[^_]+_(.+)$/);
                        if (fm) skinName = fm[1];
                    }
                    const filePath = heroDir + '\\' + fileName;
                    // 统一存 raw path，由 resolveHeroSkinUrl 异步转 base64（convertFileSrc 对 Windows 含盘符路径无效）
                    const _isSkinExt = /\.skin$/i.test(fileName);
                    const _prev = _byName.get(skinName);
                    // 同名时 .skin 优先；尚无记录、或新的是 .skin 而旧的是 .png，则覆盖
                    if (!_prev || (_isSkinExt && !_prev.isSkin)) {
                        _byName.set(skinName, { name: skinName, url: null, path: filePath, loaded: false, isSkin: _isSkinExt });
                    }
                }
                for (const _v of _byName.values()) {
                    // 本地扫描设 path（异步读图用）；同时给一个 Tauri 原生资源协议 url 兜底，
                    // 万一 Rust 读图命令不可用也能直接显示，避免「切皮不动/融合皮不显示」。
                    const _native = (typeof convertFileSrc === 'function') ? convertFileSrc(_v.path) : null;
                    skins.push({ name: _v.name, url: _native, path: _v.path, loaded: false });
                }
                // 🔴 2026-08-29：不再逐英雄打印皮肤列表（119 个英雄 × 每次扫描 = 几百条日志，
                //    既刷屏挤掉有效日志，也让 __consoleLogs 常驻大量字符串）。改为末尾汇总一条。
                if (skins.length > 0) { window.skinRegistry[heroName] = skins; _scanHeroCount++; _scanSkinCount += skins.length; }
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
        // 🔴 2026-08-29：原先这里 join 出 119 个英雄名（一条超长日志），改为汇总计数；
        //    需要完整清单时用终端命令 dumpSkinRegistry()。
        console.log('[SKIN] scanSkins() DONE, 英雄数:' + Object.keys(window.skinRegistry).length +
            ' 皮肤总数:' + _scanSkinCount + '（本轮本地扫描 ' + _scanHeroCount + ' 个英雄目录）');
        _lastSkinScanTs = Date.now();
        // 扫描完本地皮肤后立刻重刷一次（不依赖远端同步，修复「加载时皮肤卡着不显示」概率问题）
        try { if (typeof window.reapplyAllSkins === 'function') await window.reapplyAllSkins(); } catch (e) {}
        // 🔴 2026-08-30：后台全量预热本地皮肤 blob URL（主阵容英雄优先），之后切皮零读盘零缩放
        _preheatLocalSkinUrls();
        return window.skinRegistry;
    }

    // 从 GitHub Pages 拉取远程皮肤注册表，与本地 skinRegistry 合并
    // 这样任何设备打开 APP/网页即可自动获取皮肤，无需手动创建本地文件夹
    let _remoteSkinSynced = false;
    // fetch 加超时：网络被墙/慢时不挂起启动（本地优先，远端只是后台补充）
    async function _fetchWithTimeout(url, ms, options) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms || 8000);
        try {
            return await fetch(url, Object.assign({}, options || {}, { signal: ctrl.signal }));
        } finally {
            clearTimeout(timer);
        }
    }
    // 左下角提示：后台拉取到新皮肤时弹出（点一下强制刷新）
    function _showSkinUpdateToast(count) {
        try {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:100002;background:rgba(26,26,46,0.94);color:#fff;padding:11px 14px;border-radius:10px;font-size:0.8rem;max-width:300px;box-shadow:0 4px 16px rgba(0,0,0,0.45);border:1px solid rgba(79,195,247,0.45);cursor:pointer;line-height:1.4;';
            div.textContent = '🆕 后台已拉取 ' + count + ' 张新皮肤并缓存，已自动应用（点击可强制刷新）';
            div.title = '点击强制刷新';
            div.onclick = function () { try { location.reload(); } catch (e) {} };
            document.body.appendChild(div);
            setTimeout(function () { div.style.opacity = '0'; div.style.transition = 'opacity 0.4s'; setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 400); }, 6000);
        } catch (e) {}
    }
    async function syncRemoteSkins(force) {
        if (_remoteSkinSynced && !force) return;
        _remoteSkinSynced = true;
        console.log('[SKIN] syncRemoteSkins() fetching registry from:', REMOTE_SKIN_REGISTRY_URL);
        try {
            const resp = await _fetchWithTimeout(REMOTE_SKIN_REGISTRY_URL, 8000, { cache: 'no-cache' });
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
                    const remoteUrl = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(remoteSkin.file || (skinName + '.skin'));
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

            // 拉取融合卡定义（云端 fusions.json，管理员维护）
            try {
                const fResp = await fetch(REMOTE_SKIN_FUSIONS_URL, { cache: 'no-cache' });
                if (fResp.ok) {
                    const fData = await fResp.json();
                    if (fData && fData.fusions) {
                        window.cloudFusions = fData.fusions;
                        console.log('[SKIN] cloud fusions loaded:', Object.keys(fData.fusions).length);
                        if (typeof window.renderFusionCardsToPool === 'function') window.renderFusionCardsToPool();
                    }
                }
            } catch (fe) { console.warn('[SKIN] load fusions.json failed:', fe); }
            // 拉取皮肤属性表（云端 skin-attributes.json，管理员维护，随 git_push_skins 推送）
            try {
                const aResp = await _fetchWithTimeout(REMOTE_SKIN_BASE + '/skin-attributes.json', 8000, { cache: 'no-cache' });
                if (aResp.ok) {
                    const aData = await aResp.json();
                    window.skinAttributesCloud = aData || {};
                    console.log('[SKIN] skin-attributes.json loaded, heroes:', Object.keys(aData || {}).length);
                }
            } catch (ae) { console.warn('[SKIN] load skin-attributes.json failed:', ae); }

            // 拉取云端基础卡定义（cards.json，管理员维护新英雄）
            try {
                const cResp = await fetch(REMOTE_SKIN_BASE + '/cards.json', { cache: 'no-cache' });
                if (cResp.ok) {
                    const cData = await cResp.json();
                    if (cData && cData.cards) {
                        window.cloudCards = cData.cards;
                        console.log('[SKIN] cloud cards loaded:', Object.keys(cData.cards).length);
                        if (typeof window.renderCloudCardsToPool === 'function') window.renderCloudCardsToPool();
                    }
                }
            } catch (ce) { console.warn('[SKIN] load cards.json failed:', ce); }

            // 后台尝试下载远程皮肤到本地 data/skin 目录（仅 Tauri 环境）
            _downloadRemoteSkinsToLocal(registry.heroes);
            // IndexedDB 预热（APP/网页通用，无需 Tauri 文件系统）
            _preheatSkins(registry.heroes);
        } catch(e) {
            console.warn('[SKIN] syncRemoteSkins() failed:', String(e).slice(0, 200));
        } finally {
            // 🔴 2026-08-30 皮肤注册表就绪标志：本地扫描+远程同步都结束后才置位。
            //    applySkinBgToSlot 据此抑制启动期（注册表还空着）的「No skin for XXX」误报——
            //    此处 finally 的 reapplyAllSkins 会补绘，真正缺皮的英雄此时才会告警（一次、且准确）。
            try { window._skinRegistryReady = true; } catch (_) {}
            // 无论远端是否拉取成功都重刷一次：修复「远端失败时皮肤不重刷导致加载卡住不显示」的概率问题
            try { if (typeof window.reapplyAllSkins === 'function') await window.reapplyAllSkins(); } catch(e2) {}
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
    // 改用 arrayBuffer + btoa 分块编码，绕开 Tauri WebView2 中 FileReader.readAsDataURL 对大二进制 blob
    // 返回 reader.result 为空字符串的已知 bug（导致 s1.0.139 仍报 b64.len=0）；FileReader 仅作兜底
    function _blobToBase64(blob) {
        return new Promise((resolve) => {
            // 主路径：arrayBuffer + btoa（稳定可靠）
            blob.arrayBuffer().then(ab => {
                try {
                    const bytes = new Uint8Array(ab);
                    const len = bytes.byteLength;
                    if (len === 0) { _b64Fallback(blob, resolve); return; }
                    let bin = '';
                    const CHUNK = 0x8000;
                    for (let i = 0; i < len; i += CHUNK) {
                        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                    }
                    resolve(btoa(bin));
                } catch (e) { _b64Fallback(blob, resolve); }
            }).catch(() => _b64Fallback(blob, resolve));
        });
    }
    function _b64Fallback(blob, resolve) {
        try {
            const reader = new FileReader();
            reader.onloadend = () => {
                const url = reader.result || '';
                const idx = String(url).indexOf(',');
                resolve(idx >= 0 ? url.substring(idx + 1) : '');
            };
            reader.onerror = () => resolve('');
            reader.onabort = () => resolve('');
            reader.readAsDataURL(blob);
        } catch (e) { resolve(''); }
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

    // 后台下载远程皮肤到本地磁盘（Tauri 环境下，写入 .skin 二进制文件，内容仍是 png）
    // 统一用 .skin 非图片后缀，避免 .b64 文本缓存（体积 +33% 且是可读文本，别人能直接看）
    let _remoteSkinDownloadStarted = false;
    let _skinUpdateToastShown = false;
    async function _downloadRemoteSkinsToLocal(heroes) {
        if (!isTauriApp || _remoteSkinDownloadStarted) return;
        _remoteSkinDownloadStarted = true;
        const base = _skinDiskBase();
        if (!base) return;
        const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
        let downloaded = 0, skipped = 0;
        // 王城低配版英雄优先落地磁盘
        const _dlEntries = Object.entries(heroes || {}).sort(([a], [b]) => (PRIORITY_HEROES.has(a) ? 0 : 1) - (PRIORITY_HEROES.has(b) ? 0 : 1));
        for (const [heroName, skinList] of _dlEntries) {
            if (!Array.isArray(skinList) || !skinList.length) continue;
            await _ensureSkinDiskDir(heroName);
            for (const s of skinList) {
                const file = s.file || (s.name + '.skin');
                const skinPath = base + '\\' + heroName + '\\' + file;
                // 已存在则跳过（本地已有 .skin，可能来自 Gitee zip 或之前下载）
                // 用自定义 path_exists 判断（已授权、跨 Tauri 版本稳定），避免 read_file 误判"不存在"导致每次重新下载
                // 但旧版本曾写出过 0 字节/损坏文件 → path_exists 误判"已存在"而永久跳过。这里额外校验文件大小，
                // 文件过小(<=64B)视为无效，强制删除后重新下载，打破"目录建好却写不进"的死循环。
                try {
                    const exists = await invokeFn('path_exists', { path: skinPath });
                    if (exists === true) {
                        let valid = true;
                        try {
                            const bytes = await invokeFn('plugin:fs|read_file', { path: skinPath, options: undefined });
                            const len = bytes ? (bytes.byteLength ?? bytes.length ?? 0) : 0;
                            if (len <= 64) { valid = false; await invokeFn('plugin:fs|remove', { path: skinPath }); }
                        } catch (eSize) { valid = false; }
                        if (valid) { skipped++; continue; }
                    }
                } catch(e) { /* 不存在，继续下载 */ }
                try {
                    const url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(file);
                    const resp = await _fetchWithTimeout(url, 8000);
                    if (!resp.ok) { console.warn('[SKIN] 远程皮肤 HTTP', resp.status, heroName, file); continue; }
                    const blob = await resp.blob();
                    const b64 = await _blobToBase64(blob);
                    let wrote = false;
                    // 写盘前诊断日志仅在失败时打印（避免数百条成功日志刷屏；批量结果在末尾汇总）
                    if (!b64 || b64.length === 0) {
                        console.warn('[SKIN] 写盘跳过(b64 为空):', heroName, file, 'blob.size=', blob.size, 'blob.type=', blob.type, 'content-type=', resp.headers.get('content-type'), 'content-length=', resp.headers.get('content-length'), 'path=', skinPath);
                    }
                    // 主：base64 字符串写（自定义命令 write_binary_file，跨 Tauri 版本稳定，不依赖二进制 IPC 序列化）
                    // 失败时重试 1 次（应对偶发 IPC 失败），并打印完整错误对象（message/name/code/stringified）便于诊断
                    if (b64 && b64.length > 0) {
                        for (let attempt = 1; attempt <= 2 && !wrote; attempt++) {
                            try {
                                // ⚠️ Tauri v2 IPC 序列化：Rust 参数名 file_path → JS 端必须用 filePath(驼峰)，否则报 missing required key `filePath`
                                await invokeFn('write_binary_file', { filePath: skinPath, contentBase64: b64 });
                                wrote = true;
                            } catch (e1) {
                                const e1Info = e1 ? (e1.message || e1.name || JSON.stringify(e1) || String(e1)) : 'unknown';
                                if (attempt === 2) console.warn('[SKIN] write_binary_file 彻底失败(已重试1次)，回退 fs 插件:', heroName, file, e1Info);
                            }
                        }
                    } else {
                        console.warn('[SKIN] 跳过写盘(b64 为空)，上方诊断行已说明网络/解析问题:', heroName, file);
                    }
                    // 备：Tauri v2 fs 插件写（contents 必须是 string，不能传 Uint8Array，否则 Tauri v2 ACL 会拒）
                    if (!wrote && b64 && b64.length > 0) {
                        try { await invokeFn('plugin:fs|write_file', { path: skinPath, contents: b64 }); wrote = true; }
                        catch (e2) { console.warn('[SKIN] 皮肤写盘失败(plugin:fs|write_file 也不允许 base64):', heroName, file, e2 && (e2.message || JSON.stringify(e2) || String(e2))); }
                    }
                    // 只有真正写盘成功才计入"新下载"，避免写失败却误报"有新皮肤"反复弹提示
                    if (wrote) {
                        downloaded++;
                        // 🔴 2026-08-30：下载成功后立即更新 registry 的 path。
                        //    否则 entry.path 始终为空，resolveHeroSkinInfo 会 fallback 到远程 url，
                        //    导致每次 reapplyAllSkins 都走网络 fetch + 新 blob，内存持续增长。
                        const regList = window.skinRegistry[heroName] || (window.skinRegistry[heroName] = []);
                        const entry = regList.find(x => x.name === s.name);
                        if (entry) {
                            entry.path = skinPath;
                            entry.loaded = true;
                        } else {
                            regList.push({ name: s.name, path: skinPath, url: url, loaded: true, remote: true });
                        }
                    }
                } catch(e) {
                    console.warn('[SKIN] 下载皮肤失败:', heroName, file, e.message || e);
                }
                if (downloaded % 10 === 0) await new Promise(r => setTimeout(r, 10));
            }
        }
        if (downloaded > 0 || skipped > 0) {
            console.log('[SKIN] 磁盘缓存: 新下载', downloaded, '跳过', skipped);
        }
        // 后台拉到新皮肤 → 左下角弹更新提示（同一会话最多一次），并重刷一次皮肤让新皮尽快可见
        // 🔴 2026-08-30：只要本次有下载就重刷（不再受 _skinUpdateToastShown 限制），确保新皮 path 立即生效渲染走本地
        if (downloaded > 0) {
            if (!_skinUpdateToastShown) {
                _skinUpdateToastShown = true;
                _showSkinUpdateToast(downloaded);
            }
            try { if (typeof window.reapplyAllSkins === 'function') window.reapplyAllSkins(); } catch (e) {}
            // 🔴 2026-08-30：刚落地的新皮肤 path 也预热进缓存（已缓存的自动跳过，只热新增）
            _preheatLocalSkinUrls();
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
    // 🔴 内存泄漏修复（s1.0.472）：已为某 remoteUrl 生成的 blobUrl 用 Map 缓存复用，
    //    避免每次 reapplyAllSkins 都重新 fetch + 生成新 blob（旧的从不释放 → 持续泄漏数百 MB）。
    //    缓存的 blobUrl 通过 LRU 上限管理：超过上限淘汰最旧的并 revokeObjectURL，避免挂机无限增长。
    const _skinBlobUrlCache = new Map();
    const _SKIN_BLOB_CACHE_MAX = 200;
    function _skinBlobCacheSet(url, blobUrl) {
        if (!url || !blobUrl) return;
        // 🔴 2026-08-30 关键修复：覆盖同名旧 blobUrl 时【不再 revoke】。
        //    右键切皮一次会并发触发多次 resolve，两个并发各自读盘生成 blobUrl1/blobUrl2，
        //    后 set 的会把先 set、且正被 <img> 显示的 blobUrl1 revoke 掉 → 图变黑。
        //    被覆盖的旧 blob 交给浏览器 GC（<img> 移除后自动回收），上限 200 的 LRU 已控制增长。
        _skinBlobUrlCache.set(url, blobUrl);
        // 超过上限 → 淘汰最旧（Map 迭代顺序=插入顺序，最旧在前面）
        // 🔴 2026-08-30 关键修复：淘汰时【不再 revoke】blob URL，与本地皮肤缓存
        //    （_skinUrlEvictIfNeeded）保持一致。
        //    原因：被淘汰的 blob 极可能仍被页面 <img>（阵容槽/卡池）引用，revoke 之后
        //    <img> 加载失败 → 日志反复出现 'Failed to load skin image: blob:xxx'
        //    （实测同一 blob 上一秒 loaded OK、下一秒 Failed，就是这个原因）。
        //    淘汰只删 Map 引用，blob 由 <img> 持有保持存活；<img> 移除后浏览器自动回收。
        while (_skinBlobUrlCache.size > _SKIN_BLOB_CACHE_MAX) {
            const oldestKey = _skinBlobUrlCache.keys().next().value;
            if (oldestKey === undefined) break;
            _skinBlobUrlCache.delete(oldestKey);
        }
    }
    async function _getCachedSkinUrl(remoteUrl) {
        if (!remoteUrl) return null;
        if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;
        // 命中 blobUrl 缓存直接复用（关键修复：不再重复 fetch + 生成）
        // 命中后移到末尾，维持 LRU 顺序（最近使用的放最后，淘汰从最旧开始）
        if (_skinBlobUrlCache.has(remoteUrl)) {
            const cached = _skinBlobUrlCache.get(remoteUrl);
            _skinBlobUrlCache.delete(remoteUrl);
            _skinBlobUrlCache.set(remoteUrl, cached);
            return cached;
        }

        // === Tauri APP：磁盘优先 ===
        if (isTauriApp) {
            const parsed = _parseSkinUrl(remoteUrl);
            if (parsed) {
                const invokeFn = window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke;
                const skinPath = _skinDiskBase() + '\\' + parsed.hero + '\\' + parsed.file;
                // 1. 尝试读本地 .skin 二进制缓存（来自 Gitee zip 或后台下载，内容仍是 png）
                try {
                    const bytes = await invokeFn('plugin:fs|read_file', { path: skinPath, options: undefined });
                    const blobUrl = bytesToBlobUrl(bytes, skinPath);
                    if (blobUrl) { _skinBlobCacheSet(remoteUrl, blobUrl); return blobUrl; }
                } catch(e) { /* 磁盘无缓存，走网络 */ }
                // 2. 网络下载 → 写 .skin 二进制缓存
                try {
                    await _ensureSkinDiskDir(parsed.hero);
                    const resp = await _fetchWithTimeout(remoteUrl, 10000);
                    if (!resp.ok) { console.warn('[SKIN] 单皮肤远程 HTTP', resp.status, parsed.hero, parsed.file, remoteUrl); return remoteUrl; }
                    const blob = await resp.blob();
                    const b64 = await _blobToBase64(blob);
                    let wrote = false;
                    if (!b64 || b64.length === 0) {
                        console.warn('[SKIN] 写盘跳过(b64 为空):', parsed.hero, parsed.file, 'blob.size=', blob.size, 'blob.type=', blob.type, 'content-type=', resp.headers.get('content-type'), 'content-length=', resp.headers.get('content-length'), 'path=', skinPath);
                    }
                    // 主：自定义 Rust 命令 write_binary_file（已授权、支持二进制、跨 Tauri 版本稳定）
                    // 失败时重试 1 次（应对偶发 IPC 失败），并打印完整错误对象（message/name/code/stringified）便于诊断
                    if (b64 && b64.length > 0) {
                        for (let attempt = 1; attempt <= 2 && !wrote; attempt++) {
                            try {
                                // ⚠️ Tauri v2 IPC 序列化：Rust 参数名 file_path → JS 端必须用 filePath(驼峰)
                                await invokeFn('write_binary_file', { filePath: skinPath, contentBase64: b64 });
                                wrote = true;
                            } catch (eW) {
                                const eWInfo = eW ? (eW.message || eW.name || JSON.stringify(eW) || String(eW)) : 'unknown';
                                if (attempt === 2) console.warn('[SKIN] write_binary_file 彻底失败(已重试1次)，回退 fs 插件:', parsed.hero, parsed.file, eWInfo);
                            }
                        }
                    } else {
                        console.warn('[SKIN] 跳过写盘(b64 为空)，上方诊断行已说明网络/解析问题:', parsed.hero, parsed.file);
                    }
                    // 备：fs 插件写 base64 字符串（注意 contents 必须是 string，不能传 Uint8Array，Tauri v2 ACL 会拒）
                    if (!wrote && b64 && b64.length > 0) {
                        try { await invokeFn('plugin:fs|write_file', { path: skinPath, contents: b64 }); wrote = true; }
                        catch (eF) { console.warn('[SKIN] 皮肤写盘失败(plugin:fs|write_file 也不允许 base64):', parsed.hero, parsed.file, eF && (eF.message || JSON.stringify(eF) || String(eF))); }
                    }
                    const blobUrl = URL.createObjectURL(blob);
                    _skinBlobCacheSet(remoteUrl, blobUrl);
                    return blobUrl;
                } catch(e) {
                    console.warn('[SKIN] 网络兜底失败:', remoteUrl, e.message || e);
                    return remoteUrl;
                }
            }
            // URL 解析失败，回退网络
            try {
                const resp = await _fetchWithTimeout(remoteUrl, 10000);
                if (!resp.ok) return remoteUrl;
                const blobUrl = URL.createObjectURL(await resp.blob());
                _skinBlobCacheSet(remoteUrl, blobUrl);
                return blobUrl;
            } catch(e) { return remoteUrl; }
        }

        // === 网页版：IndexedDB 优先 ===
        const key = 'skin:' + remoteUrl;
        const cached = await _idbGet(key);
        if (cached && cached.blob) {
            try {
                // 🔴 2026-08-30 关键内存修复：原代码每次命中 IDB 都 createObjectURL 生成新 blob URL，
                // 旧的从不 revoke → 每切一次皮泄漏一个 blob → 内存暴涨+GC 卡顿。
                // 改为：先查 _skinBlobUrlCache（已缓存则直接复用），未命中才创建并缓存。
                const blobUrl = URL.createObjectURL(cached.blob);
                _skinBlobCacheSet(remoteUrl, blobUrl);
                return blobUrl;
            }
            catch (e) { console.warn('[SKIN] createObjectURL failed:', e); }
        }
        try {
            const resp = await fetch(remoteUrl, { cache: 'force-cache' });
            if (!resp.ok) return remoteUrl;
            const blob = await resp.blob();
            _idbPut(key, blob);
            const blobUrl = URL.createObjectURL(blob);
            _skinBlobCacheSet(remoteUrl, blobUrl);
            return blobUrl;
        } catch (e) {
            console.warn('[SKIN] fetch skin failed:', remoteUrl, e);
            return remoteUrl;
        }
    }

    // 后台批量预热所有皮肤
    // APP（Tauri）：下载到本地磁盘 .b64（持久化，刷新不丢）
    // 网页版：下载到 IndexedDB
    let _preheatStarted = false;
    // 王城低配版阵容优先预热（用户主阵容，开项目秒开）：这些英雄皮肤先拉/先落地磁盘
    const PRIORITY_HEROES = new Set(['水灵','萌萌','咕咕','钢鬃','木精灵','光精灵','幻精灵','火炮射线','小野酋长','死神海妖','火炮','风灵','死神','骨弓','电法','铁骑','悟空','魂精灵','魔精灵']);

    async function _preheatSkins(heroes) {
        if (_preheatStarted) return;
        _preheatStarted = true;
        if (isTauriApp) {
            // Tauri: 磁盘缓存（一次性全量下载，后续秒开）
            _downloadRemoteSkinsToLocal(heroes).catch(() => {});
            return;
        }
        // 网页版: IndexedDB 预热（王城低配版英雄优先）
        let count = 0;
        const _phEntries = Object.entries(heroes || {}).sort(([a], [b]) => (PRIORITY_HEROES.has(a) ? 0 : 1) - (PRIORITY_HEROES.has(b) ? 0 : 1));
        for (const [heroName, skinList] of _phEntries) {
            if (!Array.isArray(skinList)) continue;
            for (const s of skinList) {
                const url = REMOTE_SKIN_BASE + '/' + encodeURIComponent(heroName) + '/' + encodeURIComponent(s.file || (s.name + '.skin'));
                _getCachedSkinUrl(url).catch(() => {});
                count++;
                if (count % 20 === 0) await new Promise(r => setTimeout(r, 30));
            }
        }
        console.log('[SKIN] Preheat queued:', count, 'skins');
    }

    // 🔴 2026-08-30 新增：本地皮肤 blob URL 全量预热（解决「切皮首次点击慢」的最后一环）。
    //    getSkinImageUrl 首次命中要走 Tauri IPC 读盘 + createImageBitmap + canvas 缩放（几十~几百 ms），
    //    之后才进 skinImageUrlCache。此前只有"用过才缓存"，导致每张皮第一次切都要现场读盘。
    //    这里在启动后台把 registry 里所有本地 path 全部预热进缓存（主阵容英雄优先），
    //    之后任何切皮/融合皮/卡池悬停都是缓存直出、零 IO。
    let _localUrlPreheatRunning = false;
    async function _preheatLocalSkinUrls() {
        if (_localUrlPreheatRunning) return;
        if (!isTauriApp) return;                 // 网页版本地无 path，走 _preheatSkins 的 IndexedDB 线
        if (window.isPerfLite && window.isPerfLite()) return; // 极速模式不显示皮肤，不预热
        _localUrlPreheatRunning = true;
        try {
            // 主阵容英雄优先，保证开局 1-2 秒内先热起来
            const entries = Object.entries(window.skinRegistry || {})
                .sort(([a], [b]) => (PRIORITY_HEROES.has(a) ? 0 : 1) - (PRIORITY_HEROES.has(b) ? 0 : 1));
            let warmed = 0, skipped = 0;
            for (const [heroName, skinList] of entries) {
                if (!Array.isArray(skinList)) continue;
                for (const s of skinList) {
                    if (!s || !s.path) continue;
                    if (skinImageUrlCache.has(s.path)) { skipped++; continue; }
                    try { await getSkinImageUrl(s.path); warmed++; }
                    catch (e) { /* 单张失败不影响整体 */ }
                    // 每张之间让出主线程：createImageBitmap/drawImage 虽轻，413 张连跑也别抢占 UI
                    await new Promise(r => setTimeout(r, 20));
                }
            }
            if (warmed > 0) console.log('[SKIN] 本地皮肤预热完成: 新热 ' + warmed + ' 张 / 已缓存 ' + skipped + ' 张');
        } finally {
            _localUrlPreheatRunning = false;
        }
    }

    function getHeroSkinUrl(heroName, skinName) {
        const mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
        const parsed = getBaseHeroName(mainName);
        const baseHero = parsed.heroName;
        const skins = window.skinRegistry[baseHero];
        if (!skins || !skins.length) return null;
        const userSel = window.heroSkinSelections[baseHero];
        // 显式传入 skinName 时优先；空字符串表示默认无皮肤
        if (skinName !== undefined && skinName !== null) {
            if (skinName === '') return null;
            const skin = skins.find(s => s.name === skinName);
            if (!skin) return null;
            // 🔴 2026-08-30：本地 path 优先于远程 url（避免调用方拿到远程 url 触发 fetch+新 blob 泄漏）
            return skin.path || skin.url || null;
        }
        if (userSel === '') return null; // 用户明确选择默认
        const target = userSel || parsed.skinName;
        const skin = target ? skins.find(s => s.name === target) : null;
        const finalSkin = skin || skins[0];
        // 🔴 2026-08-30：本地 path 优先于远程 url
        return finalSkin ? (finalSkin.path || finalSkin.url || null) : null;
    }

    // 获取皮肤信息（dataUrl + 名字），支持延迟 base64 加载
    async function resolveHeroSkinInfo(heroName, skinName) {
        const mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
        const parsed = getBaseHeroName(mainName);
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
        // 🔴 内存泄漏修复（s1.0.472）：App 端【本地 path 优先】于远程 url。
        //    原逻辑 `if (entry.url) return` 会让 syncRemoteSkins 注入的远程 URL 覆盖本地 path，
        //    导致每次 reapplyAllSkins 都走 _getCachedSkinUrl(entry.url) → fetch 远程图 → 生成新 blob 且不缓存不释放，
        //    反复重刷即持续泄漏数百 MB（实测开一会飙到 4G）。
        //    改为：有本地 path 就永远走本地磁盘读图（快、缓存进 skinImageUrlCache、无泄漏），远程 url 仅作兜底。
        if (entry.path) {
            // 🔴 2026-08-30 修复「切皮超级慢」：改回 Tauri 原生资源协议 asset://（convertFileSrc）优先。
            //    配置 assetProtocol.enable=true + scope=["**"] 全放行、csp=null → 用户环境 asset:// 可用；
            //    由 WebView 原生解码、浏览器按 URL 缓存，零 JS 缩放/解码开销 → 切皮丝滑不卡主线程。
            //    之前误判"变黑"实为切换瞬间旧 img 已 remove、新 img 未 onload 的黑闪（非 asset:// 不可用），
            //    已在 applySkinBgToSlot 用「双缓冲 onload 后移除旧图」根治。Rust 读图 blob 仅作兜底。
            const nativeUrl = (typeof convertFileSrc === 'function') ? convertFileSrc(entry.path) : null;
            if (nativeUrl) {
                entry.url = nativeUrl; entry.loaded = true;
                const cachedUrl = await _getCachedSkinUrl(nativeUrl);
                return { url: cachedUrl, name: entry.name, path: entry.path };
            }
            // 兜底：asset:// 不可用（极旧 exe 未挂载全局 Tauri）时，走 Rust 读图（read_image_base64 → blob → 缩放）
            const dataUrl = await getSkinImageUrl(entry.path);
            if (dataUrl) {
                entry.url = dataUrl; entry.loaded = true;
                const cachedUrl = await _getCachedSkinUrl(dataUrl);
                return { url: cachedUrl, name: entry.name, path: entry.path };
            }
        }
        // 本地无 path（纯远程皮肤）→ 用远程 url 兜底（网页版 / 远程特有皮）
        if (entry.url) {
            const cachedUrl = await _getCachedSkinUrl(entry.url);
            return { url: cachedUrl, name: entry.name, path: entry.path };
        }
        // 🔴 2026-08-30 诊断：皮肤 resolve 彻底失败，打印原因便于定位「没皮」根因
        try {
            const _native = (typeof convertFileSrc === 'function') ? convertFileSrc(entry.path) : 'convertFileSrc未定义';
            console.warn('[SKIN] resolveHeroSkinInfo 失败 → hero=' + heroName + ' target=' + target
                + ' | entry.path=' + (entry.path || '无')
                + ' | entry.url=' + (entry.url || '无')
                + ' | convertFileSrc尝试=' + _native);
        } catch (e) {}
        return null;
    }
    // 皮肤读取链路诊断（用户可在控制台执行：testSkin('火炮') 看某英雄皮肤能否正常 resolve）
    window.testSkin = async function (hero) {
        hero = hero || '火炮';
        const reg = window.skinRegistry || {};
        const names = Object.keys(reg);
        console.log('[TEST] 皮肤库英雄数:', names.length, '| skinRoot:', (typeof getSkinRootDir === 'function') ? getSkinRootDir() : 'n/a');
        const list = reg[hero];
        if (!list) { console.warn('[TEST] 皮肤库里没有英雄「' + hero + '」，可用英雄示例:', names.slice(0, 10).join(', ')); return; }
        console.log('[TEST] ' + hero + ' 皮肤列表(' + list.length + '):', list.map(s => s.name + (s.path ? '(有path)' : (s.url ? '(有url)' : '(空)'))).join(', '));
        for (const s of list.slice(0, 3)) {
            const info = await window.resolveHeroSkinInfo(hero, s.name);
            console.log('[TEST] ' + hero + '/' + s.name + ' →', info ? (info.url ? info.url.substring(0, 60) + '...' : '有entry但url空') : 'NULL');
        }
    };

    async function resolveHeroSkinUrl(heroName, skinName) {
        const info = await resolveHeroSkinInfo(heroName, skinName);
        return info ? info.url : null;
    }

    function getHeroSkins(heroName) {
        // 融合卡切半皮（融合XX）不进入皮肤选择器
        if (heroName && typeof heroName === 'string' && heroName.startsWith('融合')) return [];
        const mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
        const baseHero = getBaseHeroName(mainName).heroName;
        return window.skinRegistry[baseHero] || [];
    }

    function selectHeroSkin(heroName, skinName) {
        const mainName = (typeof getMainCardName === 'function') ? getMainCardName(heroName) : heroName;
        const baseHero = getBaseHeroName(mainName).heroName;
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

    // 🔴 2026-08-30 诊断日志落盘：由 app-core 的 _diagFlush 调用，把累积的日志内容整体写回当天文件。
    //    写到 软件数据目录\tfjl_temp\logs\app-console-YYYY-MM-DD.log（用户指定目录，Tauri 已确认可写）。
    //    复用已验证的 writeTextFileWithError（与 exportConsoleLogsToFile 同源），避免自己拼 invoke 参数名踩坑。
    window.__writeDiagLogFile = function (content) {
        if (!content) return;
        if (!softwareDataDir) return;
        const dir = softwareDataDir.replace(/[\\/]+$/, '') + '\\tfjl_temp\\logs';
        const day = new Date().toISOString().slice(0, 10);
        const filePath = dir + '\\app-console-' + day + '.log';
        // 目录不存在则创建（writeTextFileWithError 内部可能不建目录，这里先确保）
        try {
            if (!pathExists(dir)) { const r = createDir(dir); if (!r || !r.success) return; }
        } catch (e) {}
        try { writeTextFileWithError(filePath, content); } catch (e) {}
    };

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
    window.toggleAutoBackup = toggleAutoBackup;
    window.onAutoBackupKeepInput = onAutoBackupKeepInput;
    window.toggleAutoBackupTimer = toggleAutoBackupTimer;
    window.onAutoBackupIntervalInput = onAutoBackupIntervalInput;
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
        window.__tfjlMarkProjectsDirty = _markProjectsDirty;
        window.__tfjlRestoreAllProjects = tfjlRestoreAllProjects;
    window.clearLogBattleCache = clearLogBattleCache;
    window.importFileToProject = importFileToProject;
    window.batchImportFilesToProject = batchImportFilesToProject;
    // 英雄皮肤系统
    window.scanSkins = scanSkins;
    // 🔴 2026-08-29 诊断用：终端输入 dumpSkinRegistry() 打印完整皮肤清单
    // （scanSkins 的逐英雄日志已精简为汇总，需要明细时用它）
    window.dumpSkinRegistry = function () {
        const reg = window.skinRegistry || {};
        const keys = Object.keys(reg);
        console.log('=== 皮肤注册表 dumpSkinRegistry() ===');
        keys.forEach(function (h) {
            console.log('  ' + h + ' (' + (reg[h] || []).length + '): ' + (reg[h] || []).map(function (s) { return s.name; }).join(','));
        });
        console.log('共 ' + keys.length + ' 个英雄');
        return { heroes: keys.length, detail: reg };
    };
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

    // 暴露诊断所需的内部依赖给全局（供文件末尾的全局 runDiagnostics 在网页版也能调用）
    window.__tfjlDiagApi = {
        isTauriApp: _isTauriRuntime(),
        getSyncDir: _getSyncDir,
        getDatPath: _getDatPath,
        readDir: readDir,
        readTextFile: readTextFile,
        ensureStoreLoaded: _ensureStoreLoaded,
        forceReloadStore: _forceReloadStore,
        getStoreMap: () => _storeMap,
        flushStore: () => _flushStore(),
        syncAllNow: syncAllNow,
        restoreAllProjects: tfjlRestoreAllProjects,
    };

    // 确保 DOMContentLoaded 后初始化（处理竞态：script 加载时事件可能已触发）
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initAppLocal);
    } else {
        initAppLocal();
    }
    console.log('[APP] app-local.js 已加载 (IPC模式)');
}

// ==================== 异常诊断（全局，网页版/App版通用）====================
// 放在 IIFE 外，保证网页版也能加载 window.runDiagnostics（菜单「🔧 异常诊断」）
// Tauri 专属检查项在网页版自动标 info 跳过，其余（运行环境/昵称/项目/网络）通用。
async function _pingUrl(url, timeoutMs = 8000) {
    const t0 = performance.now();
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        const ms = Math.round(performance.now() - t0);
        return { ok: true, ms };
    } catch (e) {
        const ms = Math.round(performance.now() - t0);
        return { ok: false, ms, err: String(e && e.message || e) };
    }
}

async function runDiagnostics() {
    const api = window.__tfjlDiagApi;
    const isApp = !!(api && api.isTauriApp);
    const items = [];
    const push = (name, status, detail, advice) =>
        items.push({ name, status, detail: detail || '', advice: advice || '' });
    const WX = 'wx：gyqsvip';

    // 1) 运行环境
    push('运行环境', isApp ? 'ok' : 'info',
        isApp ? '桌面 App（Tauri），数据走本地磁盘落盘' : '网页版（浏览器），数据走浏览器缓存，清缓存会丢');

    // 2) Tauri 插件 / 核心命令（仅 App 版检查；网页版跳过）
    if (isApp) {
        const hasInvoke = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
        if (hasInvoke) {
            try {
                await window.__TAURI_INTERNALS__.invoke('write_text_file', { filePath: api.getDatPath(api.getSyncDir()) + '.diag_probe', content: '1' });
                push('Tauri 插件/写盘命令', 'ok', 'invoke 可用，核心命令 write_text_file 可调用');
            } catch (e) {
                push('Tauri 插件/写盘命令', 'error',
                    'invoke 存在但调用失败：' + String(e && e.message || e),
                    '很可能是插件/ACL 权限缺失或 Rust 未重打包。请先重打包桌面版；仍异常联系我 ' + WX);
            }
        } else {
            push('Tauri 插件/写盘命令', 'error',
                '未找到 invoke 函数（__TAURI_INTERNALS__ 缺失），插件未加载',
                'App 运行环境异常，建议重装/重打包桌面版；仍异常联系我 ' + WX);
        }
    } else {
        push('Tauri 插件/写盘命令', 'info', '网页版不依赖 Tauri 插件，跳过此项');
    }

    // 3) 数据目录 / tfjl.dat 文件（仅 App 版）
    if (isApp) {
        const datDir = api.getSyncDir();
        if (!datDir) {
            push('数据目录', 'error', '未配置软件数据目录', '请在「App本地设置」中指定数据目录后重试');
        } else {
            const datPath = api.getDatPath(datDir);
            let dirExists = false, fileExists = false;
            try { dirExists = !!(await api.readDir(datDir)); } catch (e) {}
            try { fileExists = !!(await api.readTextFile(datPath)); } catch (e) {}
            push('数据目录', dirExists ? 'ok' : 'warn',
                dirExists ? ('存在：' + datDir) : ('不存在：' + datDir),
                dirExists ? '' : '目录不存在，写入时会自动创建；若写入仍失败多为权限/磁盘问题');
            push('统一存储文件 tfjl.dat', fileExists ? 'ok' : 'warn',
                fileExists ? ('存在 (' + datPath + ')') : ('尚未生成：' + datPath),
                fileExists ? '' : '首次启动后保存任意设置即会生成，若长期为空请手动操作一次保存');
        }
    } else {
        push('数据目录', 'info', '仅限App版（本地数据目录 + tfjl.dat 落盘）：当前为网页版，此功能不适用', '网页版数据存于浏览器缓存，无需本地目录');
    }

    // 4) 写盘测试（仅 App 版）
    if (isApp) {
        try {
            // 修正：探针必须走 localStorage（而非 storeMap），因为 _flushStore 只把"项目+受控 localStorage 项"写盘，
            // 任意 storeMap.set 的 key 不会被写入 tfjl.dat → 必然读不回。改走 localStorage 后，
            // flushStore 会全量把 localStorage 项写入 tfjl.dat，再 forceReloadStore 重读即可验证真实落盘。
            // 不触发 syncAllNow 全量 Gist 写回，避免诊断本身制造限流。
            const probeKey = '__tfjl_diag_probe__';
            const probeVal = String(Date.now());
            localStorage.setItem(probeKey, probeVal);     // 触发 _scheduleFlush 落盘
            await api.flushStore();                        // 立即强制落盘（含 probe）
            await api.forceReloadStore();                  // 强制从磁盘重读（清缓存后读真值）
            const back = api.getStoreMap().get(probeKey) || localStorage.getItem(probeKey);
            if (back) { localStorage.removeItem(probeKey); await api.flushStore(); }
            push('写盘验证', back ? 'ok' : 'error',
                back ? '临时数据已成功写入并读回 tfjl.dat' : '写入后无法从磁盘读回（落盘失败）',
                back ? '' : '磁盘写入异常，检查目录权限/磁盘空间；仍异常联系我 ' + WX);
        } catch (e) {
            push('写盘验证', 'error', '写盘测试异常：' + String(e && e.message || e),
                '磁盘写入异常，检查目录权限/磁盘空间；仍异常联系我 ' + WX);
        }
    } else {
        push('写盘验证', 'info', '网页版无本地磁盘写盘，跳过');
    }

    // 5) 昵称（通用）
    const nick = (localStorage.getItem('TFJL_UserName') || '').trim();
    if (nick && nick !== '匿名用户') {
        push('昵称', 'ok', '当前昵称：' + nick);
    } else {
        push('昵称', 'warn', '未设置昵称或仍为「匿名用户」',
            '匿名用户无法区分身份，请在进入系统后按提示设置昵称');
    }

    // 6) 项目数据（通用，网页版与 App 版均存于 IndexedDB）
    let projOk = false, projDetail = '';
    try {
        const loader = (window.__tfjlLoadProjectList)
            ? window.__tfjlLoadProjectList
            : (api ? api.restoreAllProjects : null);
        const pj = loader ? await loader() : [];
        if (Array.isArray(pj) && pj.length > 0) { projOk = true; projDetail = ('共 ' + pj.length + ' 个项目'); }
        else projDetail = '无项目（空）';
    } catch (e) { projDetail = '读取异常：' + String(e && e.message || e); }
    push('项目数据', projOk ? 'ok' : 'warn', projDetail,
        projOk ? '' : '若你创建过项目却为空，说明此前落盘丢失，已用本次加固修复；新项目请确认退出前已保存');

    // 7) 网络 / 远端资源延迟（通用）
    const targets = [
        { label: 'GitHub（代码/皮肤源）', url: 'https://raw.githubusercontent.com/gyq-svip/tfjl-web/main/index.html' },
        { label: 'Gitee（安装包/下载源）', url: 'https://gitee.com/gyq-svip/tfjl-web' },
    ];
    for (const tg of targets) {
        const r = await _pingUrl(tg.url);
        push('网络·' + tg.label, r.ok ? (r.ms < 1500 ? 'ok' : 'warn') : 'error',
            r.ok ? ('延迟 ' + r.ms + 'ms') : ('不可达：' + (r.err || '超时')),
            r.ok ? (r.ms >= 1500 ? '延迟偏高，打开在线资源可能较慢' : '') : '网络不通，在线功能（皮肤同步/更新）会失败，可稍后重试或检查代理');
    }

    // 8) 阵容识别（Umi-OCR 本地引擎，仅限App版）
    if (isApp) {
        const hasInvoke = !!(window.__TAURI_INTERNALS__?.invoke || window.__TAURI__?.core?.invoke);
        if (!hasInvoke) {
            push('阵容识别（Umi-OCR）', 'error', '未找到 invoke，Tauri 环境异常',
                'App 运行环境异常，建议重装/重打包桌面版；仍异常联系我 ' + WX);
        } else {
            try {
                // 用 1x1 透明 png 探测本地 OCR 服务（127.0.0.1:1224）是否就绪
                const TINY = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                await window.__TAURI_INTERNALS__.invoke('umi_ocr', { base64: TINY, options: {} });
                push('阵容识别（Umi-OCR）', 'ok', '本机 OCR 引擎已就绪，可离线识别阵容');
            } catch (e) {
                const msg = String(e && e.message || e);
                push('阵容识别（Umi-OCR）', 'warn',
                    'OCR 引擎未就绪（' + msg.slice(0, 80) + '）',
                    '请打开「阵容识别」面板，点「🚀 启动识别引擎 / 下载安装」拉起本机 Umi-OCR；识别功能依赖本地 Umi-OCR.exe，未启动则无法识别');
            }
        }
    } else {
        push('阵容识别（Umi-OCR）', 'info', '仅限App版（依赖本机 Umi-OCR 离线引擎）：当前为网页版，此功能不适用',
            '网页版无法调用本地 OCR 程序，阵容识别需在桌面 App 内使用');
    }

    return items;
}
window.runDiagnostics = runDiagnostics;   // 菜单「异常诊断」调用
