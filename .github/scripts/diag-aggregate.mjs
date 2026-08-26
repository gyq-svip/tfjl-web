// 诊断数据定时聚合脚本（由 .github/workflows/diag-aggregate.yml 每 10 分钟调用）
// 复用仓库 Secrets.GIST_TOKEN（gyq-svip 账号，与自动部署同一 token）
// 读取私有诊断 Gist 下所有 diag-*.json → 聚合成 diag-agg.json → 写到【独立公开 Gist】
// 目的：诊断面板用 gist.githubusercontent.com raw 公开取 diag-agg.json（1 次请求、无需 token、无限额），
//       彻底替代拉全量私有 Gist，大幅降 API。聚合 Gist ID 持久化在诊断 Gist 的 diag-agg-gistid.json。
import process from 'node:process';

const GIST_ID = 'deb09eba308f044c3b78935507972717'; // DIAG_GIST_ID（私有，gyq-svip 拥有）
const TOKEN = process.env.GIST_TOKEN;
if (!TOKEN) { console.error('❌ GIST_TOKEN 未设置'); process.exit(1); }

const AGG_FILE = 'diag-agg.json';
const ID_FILE = 'diag-agg-gistid.json'; // 存聚合公开 Gist 的 ID（持久化，避免每次新建）
const ALIVE_MS = 60 * 60 * 1000; // 最近 60 分钟有上报算在线
const HEADERS = { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tfjl-diag-agg' };
const JSON_HEADERS = { ...HEADERS, 'Content-Type': 'application/json' };

async function getAggGistId() {
  // 从诊断 Gist 读持久化的聚合 Gist ID
  try {
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    if (r.ok) {
      const g = await r.json();
      const raw = g.files && g.files[ID_FILE] && g.files[ID_FILE].content;
      if (raw) { const id = raw.trim(); if (id) return id; }
    }
  } catch (e) {}
  return null;
}

async function ensureAggGist() {
  let id = await getAggGistId();
  if (id) return id;
  // 首次：创建独立【公开】Gist 存放聚合结果
  const create = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      public: true,
      description: 'tfjl-web 诊断聚合快照（公开，供面板 raw 读取，降 API）',
      files: { [AGG_FILE]: { content: '{}' } }
    })
  });
  if (!create.ok) { console.error('❌ 创建聚合公开 Gist 失败:', create.status, await create.text()); process.exit(1); }
  const cg = await create.json();
  id = cg.id;
  // 把 ID 持久化回诊断 Gist（便于下次复用，不再新建）
  const save = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ files: { [ID_FILE]: { content: id } } })
  });
  if (!save.ok) console.error('⚠️ 持久化聚合 Gist ID 失败（下次会重建）:', save.status);
  console.log('🆕 已创建公开聚合 Gist:', id);
  return id;
}

async function persistAggGistId(id) {
  // 把聚合公开 Gist ID 写回诊断 Gist 的 diag_config.json，面板本来就读它，0 额外成本拿到 ID
  try {
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    if (!r.ok) return;
    const g = await r.json();
    let cfg = {};
    try { cfg = JSON.parse((g.files && g.files['diag_config.json'] && g.files['diag_config.json'].content) || '{}'); } catch (e) {}
    if (cfg.aggGistId === id) return;
    cfg.aggGistId = id;
    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH', headers: JSON_HEADERS,
      body: JSON.stringify({ files: { 'diag_config.json': { content: JSON.stringify(cfg, null, 2) } } })
    });
  } catch (e) { /* 非致命 */ }
}

async function main() {
  // 1) 单次 GET 拿全部文件（含内联 content）
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
  if (!res.ok) { console.error('❌ 读取诊断 Gist 失败:', res.status, await res.text()); process.exit(1); }
  const gist = await res.json();
  const files = gist.files || {};

  // 2) 遍历 diag-*.json（排除聚合文件自身）
  const perUser = {}, perGist = {}, perFn = {};
  let totalWrites = 0, fileCount = 0, onlineCount = 0;
  const now = Date.now();
  for (const [name, f] of Object.entries(files)) {
    if (!name.startsWith('diag-') || name === AGG_FILE || name === ID_FILE) continue;
    fileCount++;
    let p; try { p = JSON.parse(f.content || '{}'); } catch (e) { continue; }
    const who = (p.nick ? p.nick + '(' + (p.anonId || '?') + ')' : (p.anonId || '?'));
    const entries = Array.isArray(p.entries) ? p.entries : [];
    let userSum = 0;
    for (const e of entries) {
      // 跳过脏条目：gistId 是 URL 片段或非法格式（历史 _gistIdOf bug 产生），避免 TOP 出现链接字符串
      const rawGid = typeof e.gistId === 'string' ? e.gistId : '';
      if (!rawGid || rawGid === 'unknown' || rawGid.indexOf('http') === 0 || rawGid.indexOf('/') !== -1) continue;
      const c = e.count || 0;
      userSum += c; totalWrites += c;
      const gid = e.gistId;
      perGist[gid] = (perGist[gid] || 0) + c;
      const key = gid + '|' + (e.fn || '?');
      perFn[key] = (perFn[key] || 0) + c;
    }
    perUser[who] = (perUser[who] || 0) + userSum;
    if (p.lastUpload && (now - p.lastUpload) < ALIVE_MS) onlineCount++;
  }

  // 3) 排序 TOP（保留前 30，避免聚合文件过大）
  const topN = (obj, n = 30) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => ({ k, v }));

  const agg = {
    generatedAt: new Date().toISOString(),
    note: '由 diag-aggregate.yml 定时聚合，面板用 gist.githubusercontent.com raw 公开读取本文件（替代拉全量私有 Gist，降 API）',
    fileCount, totalWrites, onlineCount,
    perUser: topN(perUser),
    perGist: topN(perGist),
    perFn: topN(perFn)
  };

  // 4) 写到独立【公开】聚合 Gist（面板用 raw 取，无需 token）
  const aggGistId = await ensureAggGist();
  await persistAggGistId(aggGistId);
  const put = await fetch(`https://api.github.com/gists/${aggGistId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ files: { [AGG_FILE]: { content: JSON.stringify(agg, null, 2) } } })
  });
  if (!put.ok) { console.error('❌ 写回聚合公开 Gist 失败:', put.status, await put.text()); process.exit(1); }
  console.log(`✅ 聚合完成：扫描 ${fileCount} 个上报文件，总写 ${totalWrites} 次，在线 ${onlineCount} 人，已写回公开 Gist ${aggGistId} 的 ${AGG_FILE}`);
}

main().catch(e => { console.error('❌ 异常:', e); process.exit(1); });
