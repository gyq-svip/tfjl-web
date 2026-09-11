#!/usr/bin/env node
/* =====================================================================
 * release_cli.js —— 本地发布工具的「命令行 / AI 接口」
 * ---------------------------------------------------------------------
 * 作用：让 AI（或你自己在终端）不必开浏览器就能跑完整发版流程。
 *       它只是 release_server.js 的瘦客户端：读 .release-server.json 拿端口+token→调 API→转发日志。
 *       服务没在跑时会自动拉起一个（不自动开浏览器）。
 *
 * 用法：
 *   node release_cli.js status                 # 版本/门禁/产物/签名包就绪度
 *   node release_cli.js preflight              # 跑全部预检（有 fail 则退出码 1）
 *   node release_cli.js build                  # 打包（阻塞到结束，实时打印日志）
 *   node release_cli.js sign                   # 签名
 *   node release_cli.js publish --yes          # 发布（不可逆，必须显式 --yes）
 *   node release_cli.js verify                 # 线上验证（只读）
 *   node release_cli.js logs --tail 50         # 只看最近日志
 *   node release_cli.js cancel                 # 中止当前步骤
 *   node release_cli.js stop                   # 关掉后台服务
 *   node release_cli.js url                    # 打印网页地址
 * 选项：--port <n>  指定端口 | --json 机器可读输出 | --yes 确认不可逆步骤
 *
 * 🔴 退出码：0=成功 / 1=失败或预检有阻断 / 2=参数或连接问题（AI 可直接据此判断）
 * 🔴 安全：token 只从本地 .release-server.json 读（已 gitignore）；publish 必须 --yes，防误触。
 * ===================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const RUNTIME = path.join(ROOT, '.release-server.json');
const DEF_PORT = 8799;

const argv = process.argv.slice(2);
const cmd = String(argv[0] || 'help').toLowerCase();
const asJson = argv.includes('--json');
const yes = argv.includes('--yes');
function opt(name, def) { const i = argv.indexOf('--' + name); return (i >= 0 && argv[i + 1]) ? argv[i + 1] : def; }
const portWanted = Number(opt('port', 0)) || 0;

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function bad(msg) { console.error('[FAIL] ' + msg); process.exit(2); }
function emit(human, obj) { if (asJson) console.log(JSON.stringify(obj)); else console.log(human); }

/* ---------------- HTTP ---------------- */
function api(rt, method, p, body) {
  return new Promise(function (resolve) {
    const r = http.request({
      host: '127.0.0.1', port: rt.port, path: p, method: method, timeout: 20000,
      headers: Object.assign({ 'X-TFJL-Token': rt.token }, body ? { 'Content-Type': 'application/json' } : {})
    }, function (res) {
      const cs = [];
      res.on('data', function (d) { cs.push(d); });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(Buffer.concat(cs).toString('utf8')); } catch (e) {}
        resolve({ status: res.statusCode, json: j });
      });
    });
    r.on('timeout', function () { r.destroy(new Error('timeout')); });
    r.on('error', function (e) { resolve({ status: 0, err: e.message }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

/* ---------------- 连接 / 自动拉起服务 ---------------- */
function readRuntime() { try { return JSON.parse(fs.readFileSync(RUNTIME, 'utf8')); } catch (e) { return null; } }

// 端口是否空闲（起一个临时监听试探，秒级返回）
function portFree(port) {
  return new Promise(function (res) {
    const s = require('net').createServer();
    s.once('error', function () { res(false); });
    s.once('listening', function () { s.close(function () { res(true); }); });
    try { s.listen(port, '127.0.0.1'); } catch (e) { res(false); }
  });
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return false; } }

async function ensureServer() {
  // 1) 已有运行时文件且服务健康 → 直接复用
  const rt = readRuntime();
  if (rt && rt.token && (!portWanted || rt.port === portWanted)) {
    const r = await api(rt, 'GET', '/api/status');
    if (r.status === 200) return { port: rt.port, token: rt.token, reused: true };
  }
  // 2) 需要拉起：先挑一个空闲端口（默认端口可能被上次没关干净的旧实例占用）
  const cands = [];
  if (portWanted) cands.push(portWanted);
  else {
    if (rt && rt.port && (!rt.pid || pidAlive(rt.pid))) cands.push(rt.port);
    cands.push(DEF_PORT, 8800, 8801, 8802, 8803, 8804);
  }
  const uniq = cands.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  let port = 0;
  for (let i = 0; i < uniq.length; i++) {
    if (await portFree(uniq[i])) { port = uniq[i]; break; }
  }
  if (!port) { console.error('[FAIL] 找不到空闲端口（试过 ' + uniq.join('/') + '）'); return null; }
  if (!asJson) console.log('· 本地发布服务未运行，正在拉起（端口 ' + port + '，不自动开浏览器）…');
  try {
    spawn(process.execPath, [path.join(ROOT, 'release_server.js')], {
      cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true,
      env: Object.assign({}, process.env, { TFJL_NO_OPEN: '1', TFJL_RELEASE_PORT: String(port) })
    }).unref();
  } catch (e) { return null; }
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    const r2 = readRuntime();
    if (r2 && r2.token && r2.port === port) {
      const rr = await api(r2, 'GET', '/api/status');
      if (rr.status === 200) return { port: r2.port, token: r2.token, reused: false, url: r2.url };
    }
  }
  return null;
}

/* ---------------- 命令实现 ---------------- */

async function cmdStatus(rt) {
  const r = await api(rt, 'GET', '/api/status');
  if (r.status !== 200) { bad('读取状态失败: ' + JSON.stringify(r.json || r.err)); }
  const s = r.json;
  if (asJson) { console.log(JSON.stringify(s)); return 0; }
  console.log('待发布版本 : v' + s.ver + '   (下一版建议 v' + s.nextVer + ')');
  console.log('已上线版本 : v' + s.releasedVer);
  console.log('升级门禁   : minVersion v' + (s.minVersion || '?') + '   version.json 门禁字段 ' + s.gateFields + '/3');
  console.log('SW 缓存版  : ' + s.swCacheVersion);
  console.log('打包产物   : ' + s.builtCount + ' 个' + (s.builtCount ? '' : '（还没打包）'));
  console.log('根目录签名包: ' + (s.signedReady ? '已就绪（exe + .sig 都在，可直接发布）' : '未就绪（需要先打包+签名）'));
  console.log('仓库根目录 : ' + s.root);
  if (s.running) console.log('⚠️ 当前有步骤在运行: ' + s.running.label);
  else if (s.lastResult) console.log('上次步骤   : ' + s.lastResult.label + ' → ' + (s.lastResult.ok ? '✅ 成功' : '❌ 失败') + '（退出码 ' + s.lastResult.code + '）');
  return 0;
}

async function cmdPreflight(rt) {
  if (!asJson) console.log('· 正在跑预检（含 verify_build.js，约数秒）…\n');
  const r = await api(rt, 'POST', '/api/preflight', {});
  if (r.status !== 200 || !r.json || !r.json.checks) { bad('预检调用失败: ' + JSON.stringify(r.json || r.err)); }
  const d = r.json;
  if (asJson) { console.log(JSON.stringify(d)); return d.fail > 0 ? 1 : 0; }
  d.checks.forEach(function (c) {
    const tag = c.level === 'ok' ? '[OK]  ' : c.level === 'warn' ? '[WARN]' : c.level === 'fail' ? '[FAIL]' : '[INFO]';
    console.log(tag + ' ' + c.title + (c.detail ? '\n        ' + c.detail : '') + (c.fix ? '\n        → ' + c.fix : ''));
  });
  console.log('\n预检完成：' + d.checks.length + ' 项，fail=' + d.fail + '，warn=' + d.warn + '，耗时 ' + d.ms + 'ms');
  if (d.fail > 0) console.log('❌ 有 ' + d.fail + ' 项阻断，先修好再打包发布。');
  else console.log('✅ 无阻断项，可以进入打包/发布流程。');
  return d.fail > 0 ? 1 : 0;
}

async function cmdRun(rt, stepKey, humanLabel) {
  const start = await api(rt, 'POST', '/api/run', { step: stepKey });
  if (start.status !== 202) {
    console.error('[FAIL] 无法启动「' + humanLabel + '」: ' + JSON.stringify(start.json || start.err));
    return 1;
  }
  if (!asJson) console.log('· 已启动「' + humanLabel + '」，实时日志如下（服务端也在跑，可直接关掉本终端不影响）…\n');
  let from = 0, done = false, guard = 0;
  while (!done) {
    await sleep(1000);
    if (++guard > 2700) { console.error('[FAIL] 等待超时（45 分钟），任务可能仍在后台运行'); return 1; }
    const r = await api(rt, 'GET', '/api/logs?from=' + from);
    if (r.status !== 200 || !r.json) continue;
    from = r.json.seq;
    (r.json.lines || []).forEach(function (l) { if (!asJson) console.log(l.line); });
    if (!r.json.running) done = true;
  }
  const st = await api(rt, 'GET', '/api/status');
  const lr = st.json && st.json.lastResult;
  if (asJson) { console.log(JSON.stringify(lr || {})); }
  else if (lr) console.log('\n结果：' + lr.label + ' → ' + (lr.ok ? '✅ 成功' : '❌ 失败') + '（退出码 ' + lr.code + '）');
  return (lr && lr.ok) ? 0 : 1;
}

async function cmdRunVerify(rt) {
  const start = await api(rt, 'POST', '/api/run', { step: 'verify-online' });
  if (start.status !== 202) { console.error('[FAIL] 无法启动线上验证: ' + JSON.stringify(start.json || start.err)); return 1; }
  let from = 0, done = false, guard = 0;
  const lines = [];
  while (!done) {
    await sleep(1000);
    if (++guard > 300) { console.error('[FAIL] 线上验证超时'); return 1; }
    const r = await api(rt, 'GET', '/api/logs?from=' + from);
    if (r.status !== 200 || !r.json) continue;
    from = r.json.seq;
    (r.json.lines || []).forEach(function (l) { lines.push(l.line); if (!asJson) console.log(l.line); });
    if (!r.json.running) done = true;
  }
  const okAll = lines.some(function (l) { return /线上验证 结束（✅/.test(l); });
  if (asJson) console.log(JSON.stringify({ ok: okAll, lines: lines }));
  return okAll ? 0 : 1;
}

async function cmdLogs(rt) {
  const tail = Number(opt('tail', 80)) || 80;
  const r = await api(rt, 'GET', '/api/logs?from=0');
  if (r.status !== 200 || !r.json) { bad('读取日志失败'); }
  const lines = (r.json.lines || []).slice(-tail);
  if (asJson) { console.log(JSON.stringify({ running: r.json.running, lines: lines })); return 0; }
  lines.forEach(function (l) { console.log('[' + l.step + '] ' + l.line); });
  if (r.json.running) console.log('（当前仍在运行: ' + r.json.running.label + '）');
  return 0;
}

async function cmdCancel(rt) {
  const r = await api(rt, 'POST', '/api/cancel', {});
  console.log(r.json && r.json.ok ? '· 已请求中止当前步骤' : '· 中止失败或没有正在运行的步骤');
  return 0;
}

async function cmdStop(rt) {
  const rt2 = readRuntime();
  if (!rt2 || !rt2.pid) { console.log('· 没有找到在运行的服务（无 .release-server.json）'); return 0; }
  const { spawnSync } = require('child_process');
  spawnSync('taskkill', ['/PID', String(rt2.pid), '/T', '/F'], { shell: true, windowsHide: true });
  try { fs.unlinkSync(RUNTIME); } catch (e) {}
  console.log('· 已关闭发布服务（PID ' + rt2.pid + '）');
  return 0;
}

/* ---------------- 入口 ---------------- */
const HELP = [
  'tfjl 发布工具 · 命令行/AI 接口',
  '',
  '  node release_cli.js status            查看状态（版本/门禁/产物/签名包）',
  '  node release_cli.js preflight         跑全部预检（有 fail → 退出码 1）',
  '  node release_cli.js build             打包',
  '  node release_cli.js sign              签名',
  '  node release_cli.js publish --yes     发布（不可逆，必须 --yes）',
  '  node release_cli.js verify            线上验证（只读）',
  '  node release_cli.js logs --tail 50    查看最近日志',
  '  node release_cli.js cancel            中止当前步骤',
  '  node release_cli.js stop              关闭后台服务',
  '  node release_cli.js url               打印网页地址',
  '',
  '选项: --port <n>  --json  --yes',
  '退出码: 0 成功 / 1 失败或预检阻断 / 2 参数或连接问题'
].join('\n');

(async function main() {
  if (cmd === 'help' || cmd === '-h' || cmd === '--help') { console.log(HELP); process.exit(0); }

  const rt = await ensureServer();
  if (!rt) { bad('无法连接或拉起发布服务（端口被占用？试试 --port 8800）'); }
  if (!asJson && rt.reused === false && rt.url) console.log('· 服务已就绪: ' + rt.url + '\n');

  let code = 0;
  switch (cmd) {
    case 'status': case 'st': code = await cmdStatus(rt); break;
    case 'preflight': case 'check': case 'pf': code = await cmdPreflight(rt); break;
    case 'build': case 'b': code = await cmdRun(rt, 'build', '打包'); break;
    case 'sign': case 's': code = await cmdRun(rt, 'sign', '签名'); break;
    case 'publish': case 'pub': case 'p':
      if (!yes) { console.error('[FAIL] publish 是不可逆操作（上传 Gitee 发行版 + 推送 Pages）。确认无误请加 --yes。'); process.exit(2); }
      code = await cmdRun(rt, 'publish', '发布'); break;
    case 'verify': case 'v': code = await cmdRunVerify(rt); break;
    case 'logs': code = await cmdLogs(rt); break;
    case 'cancel': code = await cmdCancel(rt); break;
    case 'stop': code = await cmdStop(rt); break;
    case 'url': console.log((readRuntime() || {}).url || ('http://127.0.0.1:' + DEF_PORT + '/')); break;
    default: console.log(HELP); code = 2;
  }
  process.exit(code);
})().catch(function (e) {
  console.error('[FAIL] ' + ((e && e.message) || e));
  process.exit(2);
});
