// 诊断数据定时聚合脚本（由 .github/workflows/diag-aggregate.yml 每 10 分钟调用）
// 复用仓库 Secrets.GIST_TOKEN（gyq-svip 账号，与自动部署同一 token）
// 读取诊断 Gist 下所有 diag-*.json → 聚合成 diag-agg.json 写回同一 Gist
// 目的：让诊断面板优先读 diag-agg.json（1 次请求拿聚合结果，替代拉全量文件，大幅降 API）
import process from 'node:process';

const GIST_ID = 'deb09eba308f044c3b78935507972717'; // DIAG_GIST_ID（gyq-svip 拥有的匿名诊断 Gist）
const TOKEN = process.env.GIST_TOKEN;
if (!TOKEN) { console.error('❌ GIST_TOKEN 未设置'); process.exit(1); }

const AGG_FILE = 'diag-agg.json';
const ALIVE_MS = 60 * 60 * 1000; // 最近 60 分钟有上报算在线

async function main() {
  // 1) 单次 GET 拿全部文件（含内联 content）
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tfjl-diag-agg' }
  });
  if (!res.ok) { console.error('❌ 读取诊断 Gist 失败:', res.status, await res.text()); process.exit(1); }
  const gist = await res.json();
  const files = gist.files || {};

  // 2) 遍历 diag-*.json（排除聚合文件自身）
  const perUser = {}, perGist = {}, perFn = {};
  let totalWrites = 0, fileCount = 0, onlineCount = 0;
  const now = Date.now();
  for (const [name, f] of Object.entries(files)) {
    if (!name.startsWith('diag-') || name === AGG_FILE) continue;
    fileCount++;
    let p; try { p = JSON.parse(f.content || '{}'); } catch (e) { continue; }
    const who = (p.nick ? p.nick + '(' + (p.anonId || '?') + ')' : (p.anonId || '?'));
    const entries = Array.isArray(p.entries) ? p.entries : [];
    let userSum = 0;
    for (const e of entries) {
      const c = e.count || 0;
      userSum += c; totalWrites += c;
      const gid = e.gistId || '?';
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
    note: '由 diag-aggregate.yml 定时聚合，诊断面板优先读取本文件（替代拉全量 diag-*.json）',
    fileCount, totalWrites, onlineCount,
    perUser: topN(perUser),
    perGist: topN(perGist),
    perFn: topN(perFn)
  };

  // 4) 写回 diag-agg.json（PATCH 只更新该文件，其他文件保留）
  const put = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'tfjl-diag-agg' },
    body: JSON.stringify({ files: { [AGG_FILE]: { content: JSON.stringify(agg, null, 2) } } })
  });
  if (!put.ok) { console.error('❌ 写回 diag-agg.json 失败:', put.status, await put.text()); process.exit(1); }
  console.log(`✅ 聚合完成：扫描 ${fileCount} 个上报文件，总写 ${totalWrites} 次，在线 ${onlineCount} 人，已写回 diag-agg.json`);
}

main().catch(e => { console.error('❌ 异常:', e); process.exit(1); });
