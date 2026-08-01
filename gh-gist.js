// gh-gist.js — GitHub Gist 读写层 + 盟战战绩数据库逻辑 + 本地缓存
// 依赖：github-config.js（提供 window.GITHUB_TOKEN / hashPassword / verifyPassword）
(function () {
    const GH_API = 'https://api.github.com';

    function ghToken() {
        // 复用 index.html 既有的 getGistToken()（部署注入 / localStorage 兜底）
        if (typeof window.getGistToken === 'function') return window.getGistToken();
        return localStorage.getItem('TFJL_Gist_Token') || '';
    }
    function ghHeaders(extra) {
        const t = ghToken();
        return Object.assign(
            { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
            extra || {},
            t ? { 'Authorization': 'token ' + t } : {}
        );
    }

    async function ghGistGet(id) {
        const r = await fetch(`${GH_API}/gists/${id}`, { headers: ghHeaders() });
        if (!r.ok) throw new Error('读取 Gist 失败 (' + r.status + ')');
        return r.json();
    }
    async function ghGistCreate(files, desc, pub) {
        const r = await fetch(`${GH_API}/gists`, {
            method: 'POST', headers: ghHeaders(),
            body: JSON.stringify({ description: desc || 'tfjl', public: !!pub, files })
        });
        if (!r.ok) throw new Error('创建 Gist 失败 (' + r.status + ')');
        return r.json();
    }
    async function ghGistPatch(id, files) {
        const r = await fetch(`${GH_API}/gists/${id}`, {
            method: 'PATCH', headers: ghHeaders(),
            body: JSON.stringify({ files })
        });
        if (!r.ok) throw new Error('更新 Gist 失败 (' + r.status + ')');
        return r.json();
    }
    async function ghGistFileContent(id, filename) {
        const g = await ghGistGet(id);
        const f = g.files && g.files[filename];
        return f ? f.content : null;
    }

    // ===== 本地缓存（网络版用 localStorage；桌面版后续可换文件系统） =====
    function _ck(gistId, date) { return 'tfjl_al_' + gistId + '_' + date; }
    function cacheSet(gistId, date, data) {
        try { localStorage.setItem(_ck(gistId, date), JSON.stringify(data)); } catch (e) {}
        _cacheAddDate(gistId, date);
    }
    function cacheGet(gistId, date) {
        try { const s = localStorage.getItem(_ck(gistId, date)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    }
    function _cacheAddDate(gistId, date) {
        try {
            const k = 'tfjl_al_dates_' + gistId;
            let a = JSON.parse(localStorage.getItem(k) || '[]');
            if (!a.includes(date)) { a.push(date); a.sort(); localStorage.setItem(k, JSON.stringify(a)); }
        } catch (e) {}
    }
    function cacheDates(gistId) {
        try { return JSON.parse(localStorage.getItem('tfjl_al_dates_' + gistId) || '[]'); } catch (e) { return []; }
    }

    // ===== 盟战战绩数据库（共享总表 gist + 每个联盟一个 gist） =====
    // 复用主站固定的「总表 gist」(GIST_ID = a32a0628bd9275f3a4922cd12cf298c9)，所有用户/设备共用同一份。
    // 该 gist 内用 alliance_index.json 记录 { accounts:{用户名:{...}}, alliances:{联盟号:{name,gistId}} }，
    // 与 room_index.json 等共存（PATCH 仅改本文件，不破坏其它文件）。所有人读它查当前联盟 gist 地址。
    const MASTER_GIST_ID = window.TFJL_MASTER_GIST_ID;
    const REGISTRY_FILE = 'alliance_index.json';

    // 读总表：首次（文件不存在）或读不到（网络/权限/404）都返回空索引；注册时会自动建文件。
    async function loadRegistry() {
        try {
            const g = await ghGistGet(MASTER_GIST_ID);
            const f = g.files && g.files[REGISTRY_FILE];
            if (f && f.content) return JSON.parse(f.content);
        } catch (e) { /* 总表读不到 → 空索引 */ }
        return { accounts: {}, alliances: {} };
    }

    // 写总表：仅 PATCH 本文件；带重试避免瞬时失败丢数据。
    async function saveRegistry(data) {
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await ghGistPatch(MASTER_GIST_ID, { [REGISTRY_FILE]: { content: JSON.stringify(data, null, 2) } });
                return;
            } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400 * (attempt + 1))); }
        }
        throw lastErr || new Error('写入联盟总表失败');
    }

    // 注册：账号 + 密码 + 联盟号 + 联盟名，自动绑定
    // 乐观并发：循环「读最新总表→改→写回」，冲突/失败重试；首次文件不存在时 loadRegistry 返回空索引即自动建。
    // onStep('creating') 在需要新建联盟 gist 时回调（供 UI 显示进度）。
    async function registerAccount(username, password, allianceId, allianceName, onStep) {
        const passwordHash = await hashPassword(password);
        for (let attempt = 0; attempt < 3; attempt++) {
            const data = await loadRegistry();
            if (data.accounts[username]) throw new Error('账号已存在');
            let al = data.alliances[allianceId];
            if (!al || !al.gistId) {
                // 首次创建联盟 gist
                if (typeof onStep === 'function') onStep('creating');
                const ag = await ghGistCreate(
                    { 'readme.json': { content: '联盟战绩：' + (allianceName || allianceId) } },
                    'tfjl-alliance-' + (allianceName || allianceId), false);
                al = { name: allianceName, gistId: ag.id, createdBy: username, members: [username], createdAt: Date.now() };
                data.alliances[allianceId] = al;
            } else if (allianceName && !al.name) {
                al.name = allianceName;
            }
            if (al.members && !al.members.includes(username)) al.members.push(username);
            data.accounts[username] = { passwordHash, allianceId, allianceName, createdAt: Date.now() };
            try {
                await saveRegistry(data);
                return al;
            } catch (e) {
                if (attempt >= 2) throw e;
                await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
            }
        }
    }

    // 登录：校验账号密码，返回绑定信息
    async function loginAccount(username, password) {
        const data = await loadRegistry();
        const acc = data.accounts[username];
        if (!acc) throw new Error('账号不存在，请先注册');
        if (!(await verifyPassword(password, acc.passwordHash))) throw new Error('密码错误');
        const al = data.alliances[acc.allianceId] || { name: acc.allianceName, gistId: null };
        return { username, allianceId: acc.allianceId, allianceName: al.name || acc.allianceName, gistId: al.gistId };
    }

    async function loadDateRecords(gistId, date) {
        try { const c = await ghGistFileContent(gistId, date + '.json'); return c ? JSON.parse(c) : null; }
        catch (e) { return null; }
    }
    async function saveDateRecords(gistId, date, data) {
        await ghGistPatch(gistId, { [date + '.json']: { content: JSON.stringify(data, null, 2) } });
    }
    async function listAllianceDates(gistId) {
        const g = await ghGistGet(gistId);
        return Object.keys(g.files || {})
            .filter(f => f.endsWith('.json') && f !== 'readme.json')
            .map(f => f.replace(/\.json$/, ''))
            .sort();
    }

    // 暴露到全局
    window.AllianceDB = {
        ghToken, ghGistGet, ghGistCreate, ghGistPatch, ghGistFileContent,
        cacheSet, cacheGet, cacheDates,
        loadRegistry, saveRegistry,
        registerAccount, loginAccount,
        loadDateRecords, saveDateRecords, listAllianceDates
    };
})();
