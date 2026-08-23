#!/usr/bin/env node
// ==================== TFJL 需求墙定时备份（GitHub Actions 专用，Node ≥18） ====================
// 方案 B 架构（2026-08-23 根治 Gist 300 文件硬上限截断）：
//   - 每份备份建【独立小 Gist】（主索引 + 该份 content 都在内，文件数少永不爆 300）
//   - 索引 Gist（room_index.json）的 wall_backup_index 字段只存轻量数组 [{id,ts,date,messageCount,scriptCount,fp}]
//     （仅1个文件不触发截断）；列表只读索引数组；清理=DELETE 整份超龄 Gist。
//   - 备份状态写索引 Gist 的 wall_backup_status 字段（网页端/Actions 统一可读）
// 与网页端 app-core.js 的 wallBackupAll 保持同一文件结构、同一内容指纹公式、同一清理规则。
// 环境变量：
//   GIST_TOKEN 必填——具 gist 权限的 PAT（仓库 secret，与 App 内使用的 token 同源即可）
//   KEEP_DAYS  保留天数，默认 10
//   DRY_RUN=1  只读不写（验证流程用）
//   FORCE=1    忽略指纹强制写一份
import { createHash } from 'node:crypto';

const TOKEN = (process.env.GIST_TOKEN || '').trim();
const KEEP_DAYS = parseInt(process.env.KEEP_DAYS || '10', 10) || 10;
const KEEP_MIN = parseInt(process.env.KEEP_MIN || '3', 10) || 3;   // 最少保留份数（防单份损坏无法恢复）
const DRY_RUN = process.env.DRY_RUN === '1';
const FORCE = process.env.FORCE === '1';

// 与 app-core.js 常量保持一致
const INDEX_GIST_ID = 'a32a0628bd9275f3a4922cd12cf298c9';        // room_index.json 指针所在
const MESSAGES_GIST_ID_FALLBACK = 'b02794a8d5c43874b76286185f7b1f7f';
const BACKUP_GIST_DESC_PREFIX = 'TFJL 需求墙数据备份 #';
const CHUNK = 800000;                                             // 消息分片上限，与网页端一致

const API = 'https://api.github.com';
const H = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'TFJL-Wall-Backup/2.0', ...(TOKEN ? { 'Authorization': `token ${TOKEN}` } : {}) };

const log = (...a) => console.log('[wall-backup]', ...a);

function sha256(s) { return createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex'); }
// 指纹公式与网页端 wallComputeBackupFingerprint 完全一致，两边增量判定才不会各说各话
function fingerprint(msgContent, profContent, scripts) {
    const parts = scripts.map(s => `${s.gistId || ''}:${sha256(s.content || '')}`).sort();
    return sha256('msg:' + sha256(msgContent || '') + '|prof:' + sha256(profContent || '') + '|scripts:' + parts.join(','));
}

async function getGist(id) {
    const r = await fetch(`${API}/gists/${id}`, { headers: H });
    if (!r.ok) throw new Error(`GET gist ${id} → HTTP ${r.status}`);
    return r.json();
}
async function patchGist(id, body) {
    const r = await fetch(`${API}/gists/${id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`PATCH gist ${id} → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
}
async function createGist(description, files) {
    const r = await fetch(`${API}/gists`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ description, public: false, files }) });
    if (!r.ok) throw new Error(`POST gist → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
}
async function deleteGist(id) {
    const r = await fetch(`${API}/gists/${id}`, { method: 'DELETE', headers: H });
    return r.ok || r.status === 404;
}
// 读 gist 内单文件内容（处理 truncated 走 raw_url）
async function readGistFile(gist, fileName) {
    const f = gist.files && gist.files[fileName];
    if (!f) return null;
    let content = f.content || '';
    if (f.truncated && f.raw_url) {
        const r = await fetch(f.raw_url, { headers: H });
        if (r.ok) content = await r.text();
    }
    return content;
}

// 读/写索引数组（wall_backup_index）+ 状态（wall_backup_status），均在 room_index.json 内
async function readIndex() {
    try {
        const g = await getGist(INDEX_GIST_ID);
        const c = await readGistFile(g, 'room_index.json');
        const obj = c ? JSON.parse(c || '{}') : {};
        return { arr: Array.isArray(obj.wall_backup_index) ? obj.wall_backup_index : [], raw: obj };
    } catch (e) { return { arr: [], raw: {} }; }
}
async function writeIndexArr(arr) {
    if (DRY_RUN) return false;
    const { raw } = await readIndex();
    raw.wall_backup_index = arr;
    await patchGist(INDEX_GIST_ID, { files: { 'room_index.json': { content: JSON.stringify(raw, null, 2) } } });
    return true;
}
async function writeStatus(st) {
    if (DRY_RUN) return;
    try {
        const { raw } = await readIndex();
        raw.wall_backup_status = Object.assign({ ts: Date.now(), mode: 'actions' }, st);
        await patchGist(INDEX_GIST_ID, { files: { 'room_index.json': { content: JSON.stringify(raw, null, 2) } } });
    } catch (e) { log('状态写入失败(不影响备份):', e.message); }
}

// 扫描账号下全部「脚本分享」Gist（与网页端 wallFetchScriptsForBackup 一致）
async function scanScripts() {
    const out = [];
    for (let page = 1; page <= 5; page++) {
        const r = await fetch(`${API}/gists?per_page=100&page=${page}`, { headers: H });
        if (!r.ok) break;
        const gists = await r.json();
        if (!Array.isArray(gists) || gists.length === 0) break;
        for (const g of gists) {
            if (!(g.description || '').includes('脚本分享')) continue;
            try {
                const dd = await getGist(g.id);
                const names = Object.keys(dd.files || {});
                if (!names.length) continue;
                const fn = names[0];
                let content = dd.files[fn].content || '';
                if (dd.files[fn].truncated && dd.files[fn].raw_url) {
                    const raw = await fetch(dd.files[fn].raw_url, { headers: H });
                    if (raw.ok) content = await raw.text();
                }
                const m = g.description.match(/脚本分享:\s*(.+)/);
                out.push({ gistId: g.id, description: g.description, fileName: m ? m[1].trim() : fn, backupFileName: fn, content });
            } catch (e) { log('脚本读取失败', g.id, e.message); }
        }
        if (gists.length < 100) break;
    }
    return out;
}

async function main() {
    if (!TOKEN) throw new Error('缺少 GIST_TOKEN 环境变量（仓库 secret）');
    log(`配置：保留 ${KEEP_DAYS} 天 · 最少 ${KEEP_MIN} 份${DRY_RUN ? ' · DRY_RUN 只读' : ''}${FORCE ? ' · FORCE 强制备份' : ''}`);

    // 1. 索引 gist → 消息指针 + 备份索引数组
    const indexGist = await getGist(INDEX_GIST_ID);
    let roomIndex = {};
    try { roomIndex = JSON.parse((await readGistFile(indexGist, 'room_index.json')) || '{}'); } catch (e) {}
    const msgGistId = roomIndex.messages || MESSAGES_GIST_ID_FALLBACK;
    log('消息 Gist:', msgGistId);

    // 2. 消息 + 资料
    const msgGist = await getGist(msgGistId);
    const msgContent = await readGistFile(msgGist, 'messages.json');
    const profContent = await readGistFile(msgGist, 'profiles.json');
    let msgCount = 0;
    try { msgCount = msgContent ? (JSON.parse(msgContent).messages || []).length : 0; } catch (e) {}

    // 3. 脚本
    const scripts = await scanScripts();
    log(`消息 ${msgCount} 条 · 资料 ${profContent ? '有' : '无'} · 脚本 ${scripts.length} 个`);

    // 4. 指纹比对 → 增量判定（对比索引数组最后一条 fp）
    const fp = fingerprint(msgContent, profContent, scripts);
    let indexArr = (await readIndex()).arr;
    const lastEntry = indexArr.length ? indexArr[indexArr.length - 1] : null;
    let runResult = 'none';
    if (!FORCE && lastEntry && lastEntry.fp && lastEntry.fp === fp) {
        runResult = 'skip';
        log('✅ 数据无变化（指纹一致），跳过备份');
    } else {
        const ts = Date.now();
        const files = {};
        // 消息分片（与网页端同规则：>800KB 切片）
        let msgFiles = null;
        if (msgContent) {
            let allMsgs = [];
            try { allMsgs = JSON.parse(msgContent).messages || []; } catch (e) {}
            const bytes = Buffer.byteLength(msgContent, 'utf8');
            const n = bytes > CHUNK ? Math.max(1, Math.ceil(bytes / CHUNK)) : 1;
            const per = Math.ceil(allMsgs.length / n);
            msgFiles = [];
            for (let i = 0; i < n; i++) {
                const fn = `content_messages_${i}_${ts}.json`;
                files[fn] = { content: JSON.stringify({ messages: allMsgs.slice(i * per, (i + 1) * per) }, null, 2) };
                msgFiles.push(fn);
            }
        }
        if (profContent) files[`content_profiles_${ts}.json`] = { content: profContent };
        const scriptsRef = [];
        for (const s of scripts) {
            const safe = s.backupFileName.replace(/[^a-zA-Z0-9_\-.]/g, '_');
            const ext = s.backupFileName.includes('.') ? s.backupFileName.split('.').pop() : 'js';
            const bf = `content_script_${safe}_${s.gistId}_${ts}.${ext}`;
            const scBytes = Buffer.byteLength(s.content || '', 'utf8');
            if (scBytes > 900000) log('⚠️ 脚本', safe, `约 ${(scBytes / 1048576).toFixed(1)}MB，可能超 Gist 单文件上限`);
            files[bf] = { content: s.content };
            scriptsRef.push({ gistId: s.gistId, description: s.description, fileName: s.fileName, backupFile: bf, bytes: scBytes });
        }
        const dt = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' (UTC+8)';
        const main = { timestamp: ts, date: dt, type: 'wall_full_v1', fp, messagesGistId: msgGistId, messageCount: msgCount, scriptCount: scripts.length, scripts: scriptsRef, files: { messages: msgFiles, profiles: profContent ? `content_profiles_${ts}.json` : null } };
        files[`backup_wall_all_${ts}.json`] = { content: JSON.stringify(main, null, 2) };
        if (DRY_RUN) {
            log(`DRY_RUN：将创建独立备份 Gist 并写入 ${Object.keys(files).length} 个文件（含主索引），实际运行时才落盘`);
        } else {
            // 方案 B：每份备份独立小 Gist（不再堆同一 Gist，根治 300 文件截断）
            const cg = await createGist(BACKUP_GIST_DESC_PREFIX + ts, files);
            indexArr.push({ id: cg.id, ts, date: dt, messageCount: msgCount, scriptCount: scripts.length, fp });
            await writeIndexArr(indexArr);
            runResult = 'backup';
            log(`✅ 备份完成：消息 ${msgCount} · 脚本 ${scripts.length} · 独立 Gist ${cg.id} · 共 ${Object.keys(files).length} 个文件`);
        }
    }

    // 5. 清理超龄备份（方案 B：DELETE 整份超龄 Gist，最少保留 KEEP_MIN 份）
    let cleanedN = 0;
    const now = Date.now();
    const keepMs = KEEP_DAYS * 86400 * 1000;
    const sorted = indexArr.slice().sort((a, b) => a.ts - b.ts);
    const keepIds = new Set(sorted.slice(Math.max(0, sorted.length - KEEP_MIN)).map(e => e.id));
    const toDelete = sorted.filter(e => (now - e.ts > keepMs) && !keepIds.has(e.id));
    if (!toDelete.length) {
        log(`✅ 无超龄备份（保留 ${KEEP_DAYS} 天 · 最少 ${KEEP_MIN} 份）`);
    } else if (DRY_RUN) {
        log(`DRY_RUN：将删除 ${toDelete.length} 份超龄备份 Gist`);
    } else {
        for (const e of toDelete) { const ok = await deleteGist(e.id); if (ok) cleanedN++; }
        indexArr = indexArr.filter(e => !toDelete.some(t => t.id === e.id));
        await writeIndexArr(indexArr);
        log(`🧹 已清理 ${cleanedN} 份超龄备份 Gist，索引剩 ${indexArr.length} 份`);
    }

    await writeStatus({ ok: true, result: runResult, messageCount: msgCount, scriptCount: scripts.length, cleaned: cleanedN });
    log('结束');
}

// 直接运行（非被 import 测试）时执行主流程；失败也尽力写一条失败状态，备份中心能看到红字
if (process.argv[1] && process.argv[1].endsWith('wall-backup.mjs')) {
    main().catch(async e => {
        console.error('[wall-backup] ❌ 失败:', e.message);
        try { await writeStatus({ ok: false, result: 'error', error: e.message }); } catch (e2) {}
        process.exit(1);
    });
}
