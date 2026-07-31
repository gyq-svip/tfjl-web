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

    // ===== 盟战战绩数据库（registry 总索引 + 每个联盟一个 gist） =====
    let _registryGistId = (window.TFJL_ALLIANCE_DB_GIST_ID) || '';

    async function ensureRegistry() {
        if (_registryGistId) {
            try { await ghGistGet(_registryGistId); return _registryGistId; } catch (e) { /* placeholder 无效，重建 */ }
        }
        const g = await ghGistCreate(
            { 'registry.json': { content: JSON.stringify({ accounts: {}, alliances: {} }, null, 2) } },
            'tfjl-alliance-registry', false);
        _registryGistId = g.id;
        localStorage.setItem('TFJL_AllianceDbGistId', g.id);
        window.__ALLIANCE_REGISTRY_CREATED__ = g.id; // 供 UI 提示管理员复制此 id
        return g.id;
    }

    async function loadRegistry() {
        const id = await ensureRegistry();
        let data = { accounts: {}, alliances: {} };
        try { const c = await ghGistFileContent(id, 'registry.json'); if (c) data = JSON.parse(c); } catch (e) {}
        return { id, data };
    }
    async function saveRegistry(data) {
        const id = await ensureRegistry();
        await ghGistPatch(id, { 'registry.json': { content: JSON.stringify(data, null, 2) } });
    }

    // 注册：账号 + 密码 + 联盟号 + 联盟名，自动绑定
    async function registerAccount(username, password, allianceId, allianceName) {
        const { id, data } = await loadRegistry();
        if (data.accounts[username]) throw new Error('账号已存在');
        const passwordHash = await hashPassword(password);
        let al = data.alliances[allianceId];
        if (!al) {
            const ag = await ghGistCreate(
                { 'readme.json': { content: '联盟战绩：' + (allianceName || allianceId) } },
                'tfjl-alliance-' + (allianceName || allianceId), false);
            al = { name: allianceName, gistId: ag.id, createdBy: username, createdAt: Date.now() };
            data.alliances[allianceId] = al;
        }
        data.accounts[username] = { passwordHash, allianceId, allianceName, createdAt: Date.now() };
        await saveRegistry(data);
        return al;
    }

    // 登录：校验账号密码，返回绑定信息
    async function loginAccount(username, password) {
        const { id, data } = await loadRegistry();
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
            .filter(f => f.endsWith('.json') && f !== 'readme.json' && f !== 'registry.json')
            .map(f => f.replace(/\.json$/, ''))
            .sort();
    }

    // 暴露到全局
    window.AllianceDB = {
        ghToken, ghGistGet, ghGistCreate, ghGistPatch, ghGistFileContent,
        cacheSet, cacheGet, cacheDates,
        ensureRegistry, loadRegistry, saveRegistry,
        registerAccount, loginAccount,
        loadDateRecords, saveDateRecords, listAllianceDates
    };
})();
