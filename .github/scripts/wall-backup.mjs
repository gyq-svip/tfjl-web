#!/usr/bin/env node
// ==================== TFJL 需求墙定时备份（GitHub Actions 专用，Node ≥18） ====================
// 与网页端 app-core.js 的 wallBackupAll 保持同一文件结构、同一内容指纹公式、同一清理规则：
//   有新数据 → 写一份全量备份（消息分片 + 资料 + 脚本内容）；
//   无变化   → 跳过（指纹一致），Gist 不重复膨胀；
//   每次运行 → 清理超龄备份（默认保留 10 天，最新一份永不删）。
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
const BACKUP_GIST_DESC = 'TFJL 需求墙数据备份（私有）';
const CHUNK = 800000;                                             // 消息分片上限，与网页端一致

const API = 'https://api.github.com';
const H = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'TFJL-Wall-Backup/1.0', ...(TOKEN ? { 'Authorization': `token ${TOKEN}` } : {}) };

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

// ===== 超龄备份文件选择（与网页端 wallSelectExpiredBackupFiles 同一规则，导出供单测） =====
// 安全规则：只认 backup_wall_all_<13位ts>.json 为主索引；最新 keepMin 份（默认3）永不删；
//           content_ 前缀且能严格解析出同一 13 位时间戳的文件成套删除；其它文件名一概不碰。
export function selectExpiredBackupFiles(names, nowMs, keepDays, keepMin = 3) {
    const MIN_KEEP = Math.max(1, keepMin || 3);
    const MAIN_RE = /^backup_wall_all_(\d{13})\.json$/;
    const CONTENT_RE = /^(backup_wall_all_|content_)[A-Za-z0-9_.\-]*_(\d{13})(\.[A-Za-z0-9]+)?$/;
    const list = (names || []).filter(n => n && typeof n === 'string');
    const mains = [];
    for (const n of list) {
        const m = n.match(MAIN_RE);
        if (m) mains.push({ name: n, ts: parseInt(m[1], 10) });
    }
    if (!mains.length) return [];
    mains.sort((a, b) => b.ts - a.ts);
    const cutoff = nowMs - (keepDays || 10) * 86400 * 1000;
    const doomed = new Set();
    for (let i = MIN_KEEP; i < mains.length; i++) { if (mains[i].ts < cutoff) doomed.add(mains[i].ts); }
    if (!doomed.size) return [];
    const out = [];
    for (const n of list) {
        const mm = n.match(MAIN_RE);
        if (mm) { if (doomed.has(parseInt(mm[1], 10))) out.push(n); continue; }
        const cm = n.match(CONTENT_RE);
        if (cm && doomed.has(parseInt(cm[2], 10))) out.push(n);
    }
    return out;
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

// ===== 孤儿残留检测（与网页端 wallSelectOrphanBackupFiles 同一规则，导出供单测） =====
// 旧版"删除备份"只删主索引不删关联文件，历史残留的 content_* 无主文件在此清掉；
// 任一主索引 JSON 损坏 → 保守放弃（返回空，宁可不清也不误删）。
export function selectOrphanBackupFiles(filesObj) {
    const MAIN_RE = /^backup_wall_all_\d{13}\.json$/;
    const names = Object.keys(filesObj || {});
    const declared = new Set();
    for (const n of names) {
        if (!MAIN_RE.test(n)) continue;
        let main;
        try { main = JSON.parse(filesObj[n]); } catch (e) { return []; }
        if (!main || typeof main !== 'object') return [];
        const cf = main.files || {};
        (Array.isArray(cf.messages) ? cf.messages : (cf.messages ? [cf.messages] : [])).forEach(x => declared.add(x));
        if (cf.profiles) declared.add(cf.profiles);
        (main.scripts || []).forEach(s => { if (s && s.backupFile) declared.add(s.backupFile); });
    }
    return names.filter(n => n.startsWith('content_') && !declared.has(n));
}

// 备份状态文件（与网页端 wallWriteBackupStatus 同一文件名/结构），供备份中心"上次自动备份"栏展示
let _stBackupId = '';
async function writeStatus(st) {
    if (!_stBackupId || DRY_RUN) return;
    try {
        await patchGist(_stBackupId, { files: { 'backup_status.json': { content: JSON.stringify(Object.assign({ ts: Date.now(), mode: 'actions' }, st), null, 2) } } });
    } catch (e) { log('状态写入失败(不影响备份):', e.message); }
}

async function main() {
    if (!TOKEN) throw new Error('缺少 GIST_TOKEN 环境变量（仓库 secret）');
    log(`配置：保留 ${KEEP_DAYS} 天 · 最少 ${KEEP_MIN} 份${DRY_RUN ? ' · DRY_RUN 只读' : ''}${FORCE ? ' · FORCE 强制备份' : ''}`);

    // 1. 索引 gist → 消息/备份指针
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

    // 4. 指纹比对 → 增量判定
    const fp = fingerprint(msgContent, profContent, scripts);
    let backupId = roomIndex.wall_backup || '';
    if (backupId) {
        try { await getGist(backupId); } catch (e) { log('备份 Gist 失效，将重建:', e.message); backupId = ''; }
    }
    if (!backupId) {
        if (DRY_RUN) { log('DRY_RUN：备份 Gist 不存在，实际运行时将创建'); backupId = ''; }
        else {
            const c = await fetch(`${API}/gists`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: BACKUP_GIST_DESC, public: false, files: { 'backup_info.json': { content: JSON.stringify({ created: Date.now(), type: 'wall_backup' }, null, 2) } } }) });
            if (!c.ok) throw new Error('创建备份 Gist 失败 HTTP ' + c.status);
            const d = await c.json();
            backupId = d.id;
            roomIndex.wall_backup = backupId;
            await patchGist(INDEX_GIST_ID, { files: { 'room_index.json': { content: JSON.stringify(roomIndex, null, 2) } } });
            log('已创建备份 Gist 并写回索引指针:', backupId);
        }
    }

    if (backupId) {
        _stBackupId = backupId;
        const backupGist = await getGist(backupId);
        const mainNames = Object.keys(backupGist.files || {}).filter(n => /^backup_wall_all_\d{13}\.json$/.test(n)).sort();
        const lastMain = mainNames.length ? backupGist.files[mainNames[mainNames.length - 1]] : null;
        let lastFp = '';
        if (lastMain && lastMain.content) { try { lastFp = JSON.parse(lastMain.content).fp || ''; } catch (e) {} }
        let runResult = 'none';
        if (!FORCE && lastFp && lastFp === fp) {
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
                log(`DRY_RUN：将写入 ${Object.keys(files).length} 个文件（含主索引），实际运行时才落盘`);
            } else {
                await patchGist(backupId, { files });
                runResult = 'backup';
                log(`✅ 备份完成：消息 ${msgCount} · 脚本 ${scripts.length} · 共 ${Object.keys(files).length} 个文件`);
            }
        }
        // 5. 清理超龄备份（最少保留 KEEP_MIN 份）+ 孤儿残留（旧版删除bug留下的无主 content_*）
        let cleanedN = 0;
        const g = await getGist(backupId);
        const filesObj = {};
        for (const [n, f] of Object.entries(g.files || {})) filesObj[n] = f.content || '';
        const sel = selectExpiredBackupFiles(Object.keys(filesObj), Date.now(), KEEP_DAYS, KEEP_MIN);
        const orphans = selectOrphanBackupFiles(filesObj);
        const all = [...sel, ...orphans];
        if (!all.length) {
            log(`✅ 无超龄备份、无孤儿残留（保留 ${KEEP_DAYS} 天 · 最少 ${KEEP_MIN} 份）`);
        } else if (DRY_RUN) {
            log(`DRY_RUN：将清理超龄 ${sel.length} 个文件 + 孤儿 ${orphans.length} 个`);
        } else {
            const files = {};
            all.forEach(n => { files[n] = null; });
            await patchGist(backupId, { files });
            cleanedN = all.length;
            log(`🧹 已清理：超龄 ${sel.length} 个文件（${sel.filter(n => n.startsWith('backup_wall_all_')).length} 个备份整套）+ 孤儿 ${orphans.length} 个`);
        }
        const remaining = (await getGist(backupId)).files ? Object.keys((await getGist(backupId)).files).length : 0;
        log(`备份 Gist 当前共 ${remaining} 个文件`);
        await writeStatus({ ok: true, result: runResult, messageCount: msgCount, scriptCount: scripts.length, cleaned: cleanedN });
    }
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
