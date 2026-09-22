// ============================================================
// 按文件内容哈希注入 ?v= 版本号（2026-09-22）
// 用法：node scripts/inject-hash-version.mjs _site/index.html
// 效果：<script src="app-core.js?v=CI_AUTO"> → <script src="app-core.js?v=h<sha256前8位>"
//       <link href="styles.css?v=CI_AUTO"> 同理。
// 目的：每次部署只让【内容真正变化】的文件换 URL（触发重下）；没变的文件 URL 不变
//       → Service Worker 对这类 URL 走 cacheFirst 秒开 + activate 跨部署保留 → 小更新不再全量重下。
// 注意：URL 里的哈希 = 文件内容的指纹，缓存不可能是旧的（根治 2026-08-27 那类「旧缓存缺新函数」白屏）。
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join, resolve } from 'path';

const htmlPath = resolve(process.argv[2] || 'index.html');
const baseDir = dirname(htmlPath);
let html = readFileSync(htmlPath, 'utf8');
const attrRe = /((?:src|href)=")([^"?]+\.(?:js|css))\?v=CI_AUTO(")/g;
let total = 0, injected = 0, missing = [];
html = html.replace(attrRe, (m, pre, path, post) => {
    total++;
    const f = join(baseDir, path);
    if (!existsSync(f)) { missing.push(path); return m; }   // 文件缺失：保留占位（部署产物不全，让 CI 日志可见）
    const h = createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 8);
    injected++;
    return pre + path + '?v=h' + h + post;
});
writeFileSync(htmlPath, html);
console.log('inject-hash-version: ' + injected + '/' + total + ' 个资源已按内容哈希注入 ?v=h* → ' + htmlPath);
for (const f of missing) console.warn('  ⚠️ 部署目录里缺文件（保留 CI_AUTO 占位）: ' + f);
if (injected === 0) { console.error('❌ 一个都没注入 —— HTML 里没有 CI_AUTO 占位或文件全缺失'); process.exit(1); }
if (missing.length) process.exit(2);
