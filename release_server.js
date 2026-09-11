#!/usr/bin/env node
/* =====================================================================
 * release_server.js —— tfjl 本地「自助打包 / 签名 / 发布」小服务（localhost 网页）
 * ---------------------------------------------------------------------
 * 存在的意义：把《铁律.md》里 A→E 发版流程 + 历史上踩过的所有坑，固化成一个
 *             点按钮就能跑、出错能看懂、不必每次重新踩坑的本地工具。
 *
 * 启动：  node release_server.js        （或双击 release-server.bat）
 *        浏览器打开 http://127.0.0.1:8799
 * 步骤：  ① 预检（编码全部已知坑）② bump 版本 ③ 打包 ④ 签名 ⑤ 发布 ⑥ 线上验证
 * 依赖：  仅 Node 内置模块；打包/签名/发布复用仓库既有
 *         `npx tauri build` / `sign.ps1` / `publish_update.ps1`（不重写发布逻辑，避免双份维护）
 *
 * 🔴 安全：只监听 127.0.0.1；API 需一次性随机 token（X-TFJL-Token，杜绝网页跨站误触）；
 *         绝不执行 force push；除 sign.ps1 自己的密钥恢复流程外不触碰任何密钥文件。
 * ===================================================================== */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { StringDecoder } = require('string_decoder');

const ROOT = __dirname;
const PORT = Number(process.env.TFJL_RELEASE_PORT || 8799);
const TOKEN = crypto.randomBytes(16).toString('hex');

const PAGES_BASE = 'https://gyq-svip.github.io/tfjl-web';
const GITEE_OWNER = 'dragon-soars-across-the-world_0';
const GITEE_REPO = 'tfjl-web';
const KEY_BACKUP = 'D:\\withfriends\\tfjl-sign-key.b64';

const P = {
  conf: path.join(ROOT, 'src-tauri', 'tauri.conf.json'),
  cargo: path.join(ROOT, 'src-tauri', 'Cargo.toml'),
  capToml: path.join(ROOT, 'src-tauri', 'capabilities', 'allow-custom-commands.toml'),
  capJson: path.join(ROOT, 'src-tauri', 'capabilities', 'default.json'),
  libRs: path.join(ROOT, 'src-tauri', 'src', 'lib.rs'),
  sw: path.join(ROOT, 'sw.js'),
  index: path.join(ROOT, 'index.html'),
  version: path.join(ROOT, 'version.json'),
  updater: path.join(ROOT, 'updater.json'),
  publish: path.join(ROOT, 'publish_update.ps1'),
  sign: path.join(ROOT, 'sign.ps1'),
  verify: path.join(ROOT, '.github', 'verify_build.js'),
  key: path.join(ROOT, 'tauri.key'),
  keyPub: path.join(ROOT, 'tauri.key.pub'),
  nsisDir: path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
};

/* ------------------------------------------------------------------ */
/* 基础设施                                                            */
/* ------------------------------------------------------------------ */

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function exists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }
function toPosix(p) { return String(p).replace(/\\/g, '/'); }

function sh(file, args, opts) {
  const o = Object.assign({ cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024, shell: false }, opts || {});
  try {
    const r = spawnSync(file, args, o);
    return { code: r.status === null ? -1 : r.status, out: String((r.stdout || '') + (r.stderr || '')) };
  } catch (e) { return { code: -1, out: 'spawn failed: ' + e.message }; }
}
function git(args) { return sh('git', args); }

// 统一用 PowerShell 跑外部命令：便于设 UTF-8 输出编码、便于整树 kill
function psScript(body) {
  return "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ErrorActionPreference='Continue'; " + body;
}

/* ------------------------------------------------------------------ */
/* 日志 + 步骤执行器                                                    */
/* ------------------------------------------------------------------ */

const state = {
  logs: [], seq: 0, running: null, lastResult: null, startedAt: null
};
const MAX_LOGS = 6000;

function pushLog(step, text) {
  const s = String(text).replace(/\r\n/g, '\n');
  const parts = s.split('\n');
  for (let i = 0; i < parts.length; i++) {
    if (i === parts.length - 1 && parts[i] === '') continue;
    state.logs.push({ n: ++state.seq, t: Date.now(), step: step || '-', line: parts[i] });
  }
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
}

function logsFrom(from) {
  const n = Number(from) || 0;
  return state.logs.filter(function (l) { return l.n > n; });
}

function runStep(key, label, psBody, onDone) {
  if (state.running) return { ok: false, err: '已有步骤在运行：' + state.running.label };
  pushLog(key, '==================== ' + label + ' 开始 ====================');
  let child;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript(psBody)],
      { cwd: ROOT, windowsHide: true });
  } catch (e) {
    pushLog(key, '[启动失败] ' + e.message);
    return { ok: false, err: e.message };
  }
  state.running = { key: key, label: label, pid: child.pid, startedAt: Date.now() };
  state.startedAt = Date.now();
  const decOut = new StringDecoder('utf8');
  const decErr = new StringDecoder('utf8');
  if (child.stdout) child.stdout.on('data', function (d) { pushLog(key, decOut.write(d)); });
  if (child.stderr) child.stderr.on('data', function (d) { pushLog(key, decErr.write(d)); });
  child.on('error', function (e) { pushLog(key, '[进程错误] ' + e.message); });
  child.on('close', function (code) {
    pushLog(key, '==================== ' + label + ' 结束（退出码 ' + code + '）= ' + (code === 0 ? '✅ 成功' : '❌ 失败') + ' ====================');
    const r = { step: key, label: label, code: code, ok: code === 0, ts: Date.now() };
    state.lastResult = r;
    state.running = null;
    if (typeof onDone === 'function') { try { onDone(r); } catch (e) { pushLog(key, '[回调错误] ' + e.message); } }
  });
  return { ok: true, pid: child.pid };
}

/* ------------------------------------------------------------------ */
/* 预检：把《铁律.md》里的坑逐条变成机器可查的项                          */
/* ------------------------------------------------------------------ */

function mk(id, level, title, detail, fix) { return { id: id, level: level, title: title, detail: detail || '', fix: fix || '' }; }

function checkMinSupportedVersion() {
  const t = readText(P.publish);
  if (!t) return null;
  const m = t.match(/\$MinSupportedVersion\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}
function cmpVer(a, b) {
  const pa = String(a).split('.').map(function (x) { return parseInt(String(x).replace(/\D/g, ''), 10) || 0; });
  const pb = String(b).split('.').map(function (x) { return parseInt(String(x).replace(/\D/g, ''), 10) || 0; });
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = i < pa.length ? pa[i] : 0, y = i < pb.length ? pb[i] : 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function runPreflight() {
  const out = [];
  const conf = readJSON(P.conf);
  const cargoTxt = readText(P.cargo);
  const confVer = conf && conf.version;
  const cargoVer = cargoTxt ? ((cargoTxt.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/) || [])[1] || null) : null;

  // 1) 关键文件/脚本在位
  const missing = [];
  [['publish_update.ps1', P.publish], ['sign.ps1', P.sign], ['.github/verify_build.js', P.verify], ['src-tauri/tauri.conf.json', P.conf]].forEach(function (it) { if (!exists(it[1])) missing.push(it[0]); });
  out.push(missing.length
    ? mk('files', 'fail', '必需文件缺失', '缺少：' + missing.join('、'), '恢复这些文件后再发布（sign.ps1 / publish_update.ps1 是发布链路的核心）')
    : mk('files', 'ok', '必需文件齐全', 'publish_update.ps1 / sign.ps1 / verify_build.js / tauri.conf.json 都在'));

  // 2) 工作区是否干净（铁律 A1）
  const st = git(['status', '--porcelain']);
  const dirty = st.out.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  out.push(dirty.length
    ? mk('gitClean', 'warn', '工作区有未提交改动（' + dirty.length + ' 项）', dirty.slice(0, 8).join(' | '), '建议先 commit，避免发布 commit 里混进无关改动；发布脚本仍能跑，但出问题不好回滚')
    : mk('gitClean', 'ok', '工作区干净', 'git status 无输出'));

  // 3) 版本号同步（铁律十二.1：Cargo.toml 与 tauri.conf.json 必须一致）
  out.push(confVer && cargoVer && confVer === cargoVer
    ? mk('versionSync', 'ok', '版本号已同步', 'tauri.conf.json = Cargo.toml = ' + confVer)
    : mk('versionSync', 'fail', '版本号不同步', 'tauri.conf.json=' + confVer + ' / Cargo.toml=' + cargoVer, '两处必须同为 ' + (confVer || '?') + '；用本工具的「bump 版本」按钮可一次改两处并单独提交'));

  // 4) updater endpoints（铁律 A3，出过事故）
  const ep = conf && conf.plugins && conf.plugins.updater && conf.plugins.updater.endpoints;
  const epStr = JSON.stringify(ep || []);
  if (epStr.indexOf('{{current_version}}') >= 0) {
    out.push(mk('endpoints', 'fail', 'updater endpoints 含 {{current_version}}', epStr, '改成固定地址 ' + PAGES_BASE + '/updater.json，否则所有人永远判定"无更新"（历史事故）'));
  } else if (!Array.isArray(ep) || ep.length !== 1 || ep[0] !== PAGES_BASE + '/updater.json') {
    out.push(mk('endpoints', 'warn', 'updater endpoints 非标准值', epStr, '标准值应为 ["' + PAGES_BASE + '/updater.json"]'));
  } else {
    out.push(mk('endpoints', 'ok', 'updater endpoints 正确', epStr));
  }

  // 5) installMode（铁律 A3：必须 quiet）
  const im = conf && conf.plugins && conf.plugins.updater && conf.plugins.updater.windows && conf.plugins.updater.windows.installMode;
  out.push(im === 'quiet'
    ? mk('installMode', 'ok', 'installMode = quiet', '静默安装，不弹 NSIS 向导')
    : mk('installMode', 'fail', 'installMode 不是 quiet（当前 ' + im + '）', 'passive 会弹安装窗口', '改成 "quiet" 后必须重新打包才生效'));

  // 6) dragDropEnabled（铁律 A5）
  const dde = conf && conf.app && conf.app.windows && conf.app.windows[0] && conf.app.windows[0].dragDropEnabled;
  out.push(dde === false
    ? mk('dragDrop', 'ok', 'dragDropEnabled = false', 'APP 手牌拖拽正常')
    : mk('dragDrop', 'fail', 'dragDropEnabled 不是 false（当前 ' + dde + '）', '会被 WebView2 拦截导致"APP 里手牌拖不动"', '在 tauri.conf.json 的 app.windows[0] 加 "dragDropEnabled": false（这行不许删）'));

  // 7) 签名公钥 / 密钥文件
  const pub = conf && conf.plugins && conf.plugins.updater && conf.plugins.updater.pubkey;
  const kp = [];
  if (!pub) kp.push(mk('pubkey', 'fail', 'tauri.conf.json 缺 updater.pubkey', '', '没有 trust-root 公钥，签名无法校验，装好的用户会拒绝更新'));
  if (!exists(P.keyPub)) kp.push(mk('keyPub', 'fail', '缺 tauri.key.pub', toPosix(P.keyPub), 'sign.ps1 用它做 pubkey 一致性校验，缺了会直接中止；从密钥备份恢复'));
  if (!exists(P.key)) kp.push(mk('key', 'warn', '仓库根缺 tauri.key', toPosix(P.key), 'sign.ps1 会尝试从备份恢复；若备份也没了就无法签名'));
  if (!exists(KEY_BACKUP)) kp.push(mk('keyBackup', 'warn', '缺密钥备份 tfjl-sign-key.b64', KEY_BACKUP, 'sign.ps1 靠它恢复干净私钥；建议把私钥 base64 备份放到该路径'));
  if (exists(P.keyPub) && pub) {
    const a = (readText(P.keyPub) || '').trim(), b = String(pub).trim();
    kp.push(a === b
      ? mk('keyMatch', 'ok', '签名公钥与 trust-root 一致', 'keynum 校验会通过')
      : mk('keyMatch', 'fail', '签名公钥 ≠ 应用 trust-root 公钥', 'tauri.key.pub 与 tauri.conf.json 的 pubkey 不一致', '装好的用户会拒绝更新包！必须用与 trust-root 匹配的 tauri.key 重新签名'));
  }
  out.push.apply(out, kp);

  // 8) 全量校验（含 Tauri 命令三处一致）
  const vb = exists(P.verify) ? sh('node', [P.verify]) : { code: -1, out: 'verify_build.js 不存在' };
  const vbTail = vb.out.split('\n').filter(function (l) { return /FAIL|失败|Error/i.test(l); }).slice(0, 6).join(' | ');
  out.push(vb.code === 0
    ? mk('verifyBuild', 'ok', 'verify_build.js 全量校验通过', 'HTML 配对 / JS 语法 / 内联脚本 / Tauri 命令三处一致 全部 PASS')
    : mk('verifyBuild', 'fail', 'verify_build.js 校验未通过', vbTail || ('退出码 ' + vb.code), '先修 FAIL 项；打包前必须过（pre-commit 钩子也会拦）'));

  // 9) 顶层重复函数声明扫描（铁律七.3）
  //    只统计「文件顶层缩进（8 空格）」的同名函数，避免把各闭包里的内层同名函数误报；
  //    真正的语法级重复声明由 verify_build 的 node --check 拦（那才是权威闸门），此项仅作提示。
  const dupFiles = ['app-core.js', 'app-features.js', 'app-local2.js', 'app-picker.js', 'app-effects.js', 'app-deepsea.js', 'app-skinmaker.js'];
  const dupHits = [];
  dupFiles.forEach(function (f) {
    const t = readText(path.join(ROOT, f));
    if (!t) return;
    const m = {}; let r;
    const re = /^ {8}(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    while ((r = re.exec(t)) !== null) m[r[1]] = (m[r[1]] || 0) + 1;
    Object.keys(m).forEach(function (k) { if (m[k] > 1) dupHits.push(f + ':' + k + '×' + m[k]); });
  });
  out.push(dupHits.length
    ? mk('dupFunc', 'warn', '顶层有同名函数出现多次（后者覆盖前者）', dupHits.slice(0, 6).join(' | '),
        'node --check 未报语法冲突（说明可合法重声明），但请确认不是改代码时误重复插入；历史上这类重复曾让整个 JS 文件静默失效')
    : mk('dupFunc', 'ok', '顶层无同名函数重复', '已扫描 ' + dupFiles.length + ' 个主 JS 文件（仅顶层）'));

  // 10) exe 绝不能进 git（历史事故：6 个安装包入库导致 Pages 部署超时）
  const ls = git(['ls-files']);
  const trackedExe = ls.out.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return /\.(exe|sig|zip)$/i.test(s); });
  out.push(trackedExe.length
    ? mk('exeInGit', 'fail', '仓库里有被 git 跟踪的 exe/sig/zip', trackedExe.slice(0, 5).join(' | '), '安装包只能放 Gitee 发行版附件；git rm --cached 后提交，否则 Pages artifact 过大部署失败')
    : mk('exeInGit', 'ok', 'exe/sig/zip 未进 git', '仓库干净'));

  // 11) GITEE_TOKEN（缺了会静默跳过上传 exe —— 最容易被忽略的坑）
  const tok = sh('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('GITEE_TOKEN','User')"]);
  const hasTok = tok.out.trim().length > 10;
  out.push(hasTok
    ? mk('giteeToken', 'ok', 'GITEE_TOKEN 已配置（User 级）', '发布时能自动上传 exe 到 Gitee 发行版')
    : mk('giteeToken', 'fail', '未配置 GITEE_TOKEN', 'publish_update.ps1 会"警告并跳过"上传 exe —— 看着发布成功，其实用户下不到包', '设置用户环境变量 GITEE_TOKEN=<你的 Gitee 私人令牌> 后重开发布工具'));

  // 12) 强制升级门禁（低于 minVersion 发布 = 用户装完又被拦）
  const minSup = checkMinSupportedVersion();
  if (confVer && minSup) {
    const c = cmpVer(confVer, minSup);
    out.push(c < 0
      ? mk('gate', 'fail', '发布版本低于强制升级门禁', '当前 v' + confVer + ' < minVersion v' + minSup, 'publish_update.ps1 会直接中止；把版本提到 >= v' + minSup + '，或用 -PublishVer 指定更高版本')
      : mk('gate', 'ok', '版本高于升级门禁', 'v' + confVer + ' >= minVersion v' + minSup));
  }

  // 13) 线上版本一致性（提示性）
  const vj = readJSON(P.version);
  if (vj && confVer) {
    out.push(vj.version === confVer
      ? mk('onlineVer', 'ok', 'version.json 与当前版本一致', 'v' + vj.version + '（已发布过该版本）')
      : mk('onlineVer', 'info', 'version.json 与当前版本不同', 'version.json=v' + vj.version + ' / 待发布=v' + confVer, '正常：改完版本号还没发布时就是这样，发布后会自动同步'));
    const gate3 = ['minVersion', 'forceUpdate', 'deprecatedMessage'].every(function (k) { return vj[k] !== undefined; });
    out.push(gate3
      ? mk('gateFields', 'ok', 'version.json 门禁三字段齐全', 'minVersion / forceUpdate / deprecatedMessage 都在（发布冲突合并时不会丢）')
      : mk('gateFields', 'warn', 'version.json 缺门禁字段', '缺：' + ['minVersion', 'forceUpdate', 'deprecatedMessage'].filter(function (k) { return vj[k] === undefined; }).join('、'), '发布脚本写入时会补上；但冲突智能合并依赖这三个键，缺了会丢门禁'));
  }

  // 14) 打包产物：按时间取最新 + 校验版本是否与当前版本一致
  //     🔴 真坑：bump 版本后若忘记重新打包，sign.ps1 会「自动挑最新产物」再按当前版本号改名，
  //        结果把旧二进制当成新版本签名发布 —— 用户装完版本号变了但功能没变，极难排查。
  let exeList = [];
  try {
    exeList = exists(P.nsisDir) ? fs.readdirSync(P.nsisDir).filter(function (n) { return /_x64-setup\.exe$/i.test(n); })
      .map(function (n) {
        let mtime = 0;
        try { mtime = fs.statSync(path.join(P.nsisDir, n)).mtimeMs; } catch (e) {}
        return { name: n, mtime: mtime, ver: (n.match(/_([\d.]+)_x64-setup\.exe$/i) || [])[1] || '' };
      }).sort(function (a, b) { return b.mtime - a.mtime; }) : [];
  } catch (e) {}
  if (!exeList.length) {
    out.push(mk('builtExe', 'info', '尚无打包产物', toPosix(P.nsisDir), '点「打包」生成（约 3 分钟）'));
  } else {
    const newest = exeList[0];
    const mtimeStr = newest.mtime ? new Date(newest.mtime).toLocaleString('zh-CN') : '?';
    if (confVer && newest.ver && newest.ver !== confVer) {
      out.push(mk('builtExe', 'fail', '最新打包产物版本 ≠ 当前版本', '最新产物 = ' + newest.ver + '（' + mtimeStr + '） / 当前版本 = ' + confVer,
        'bump 版本后必须重新打包再签名，否则 sign.ps1 会把旧产物按新版本号签名发布（用户装完版本号变了但功能没变）'));
    } else {
      out.push(mk('builtExe', 'ok', '最新打包产物版本与当前一致', 'v' + newest.ver + '（' + mtimeStr + '）；nsis 目录共 ' + exeList.length + ' 个历史包（可自行清理省空间）'));
    }
  }

  const rootExe = confVer ? ('tfjl-assistant_' + confVer + '_x64-setup.exe') : null;
  if (rootExe) {
    const hasExe = exists(path.join(ROOT, rootExe));
    const hasSig = exists(path.join(ROOT, rootExe + '.sig'));
    out.push(hasExe && hasSig
      ? mk('signReady', 'ok', '根目录已有签名包', rootExe + ' + .sig（可直接发布）')
      : mk('signReady', 'info', '根目录签名包不完整', rootExe + (hasExe ? ' 有' : ' 缺') + ' / .sig ' + (hasSig ? '有' : '缺'), '签名步骤会自动生成英文包名 + .sig'));
  }

  // 15) 工具链可用性
  const npxT = sh('powershell.exe', ['-NoProfile', '-Command', 'npx tauri --version']);
  out.push(npxT.code === 0
    ? mk('toolchain', 'ok', 'tauri CLI 可用', (npxT.out.match(/tauri-cli[^\n]*/i) || [npxT.out.split('\n')[0]])[0].trim())
    : mk('toolchain', 'fail', 'npx tauri 不可用', npxT.out.split('\n').slice(0, 3).join(' | '), '在仓库根执行 npm install 恢复依赖'));

  return out;
}

/* ------------------------------------------------------------------ */
/* 线上验证（发布后自检）                                                */
/* ------------------------------------------------------------------ */

function httpsReq(url, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    let u;
    try { u = new URL(url); } catch (e) { resolve({ status: 0, headers: {}, body: Buffer.alloc(0), error: 'bad url' }); return; }
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET',
      headers: Object.assign({ 'User-Agent': 'tfjl-release-server', 'Cache-Control': 'no-cache' }, opts.headers || {}),
      timeout: 30000
    }, function (res) {
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location && (opts._r || 0) < 6) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(httpsReq(next, Object.assign({}, opts, { _r: (opts._r || 0) + 1 })));
        return;
      }
      const chunks = [];
      res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', function (e) { resolve({ status: 0, headers: {}, body: Buffer.alloc(0), error: e.message }); });
    req.end();
  });
}

async function runOnlineVerify() {
  const key = 'verify';
  pushLog(key, '==================== 线上验证 开始 ====================');
  const conf = readJSON(P.conf) || {};
  const ver = conf.version || '?';
  const nc = '?nocache=' + Date.now();
  let ok = true;

  // 1) updater.json（Tauri 原生升级读它）
  const up = await httpsReq(PAGES_BASE + '/updater.json' + nc);
  if (up.status !== 200) { ok = false; pushLog(key, '❌ updater.json 拉取失败 status=' + up.status + ' ' + (up.error || '')); }
  else {
    let j = null; try { j = JSON.parse(up.body.toString('utf8')); } catch (e) {}
    if (!j) { ok = false; pushLog(key, '❌ updater.json 不是合法 JSON'); }
    else {
      const same = j.version === ver;
      pushLog(key, (same ? '✅' : '❌') + ' updater.json version=' + j.version + (same ? '（与本地一致）' : '（期望 ' + ver + '）'));
      if (!same) ok = false;
      const sig = j.platforms && j.platforms['windows-x86_64'] && j.platforms['windows-x86_64'].signature;
      pushLog(key, (sig ? '✅' : '❌') + ' updater.json 含签名' + (sig ? '（' + String(sig).length + ' 字符）' : '（缺失 → 原生升级会失败）'));
      if (!sig) ok = false;
    }
  }

  // 2) version.json（网页/APP 前端读它）
  const vj = await httpsReq(PAGES_BASE + '/version.json' + nc);
  if (vj.status !== 200) { ok = false; pushLog(key, '❌ version.json 拉取失败 status=' + vj.status); }
  else {
    let j = null; try { j = JSON.parse(vj.body.toString('utf8')); } catch (e) {}
    if (!j) { ok = false; pushLog(key, '❌ version.json 不是合法 JSON'); }
    else {
      const same = j.version === ver;
      pushLog(key, (same ? '✅' : '❌') + ' version.json version=' + j.version + (same ? '' : '（期望 ' + ver + '）'));
      if (!same) ok = false;
      pushLog(key, 'ℹ️ minVersion=' + j.minVersion + ' forceUpdate=' + j.forceUpdate + ' frontVersion=' + j.frontVersion + ' deployTag=' + j.deployTag);
      if (j.frontVersion && j.deployTag) pushLog(key, '✅ CI 注入字段 frontVersion/deployTag 仍在（冲突合并没丢）');
    }
  }

  // 3) Pages 首页已部署
  const idx = await httpsReq(PAGES_BASE + '/index.html' + nc);
  const idxOk = idx.status === 200 && idx.body.toString('utf8').indexOf('app-features.js') >= 0;
  pushLog(key, (idxOk ? '✅' : '❌') + ' Pages 首页可访问且含 app-features.js');
  if (!idxOk) ok = false;

  // 4) Gitee 下载直链（HTTP 200 + 与本地签名包字节数一致）
  const exeName = 'tfjl-assistant_' + ver + '_x64-setup.exe';
  const dlUrl = 'https://gitee.com/' + GITEE_OWNER + '/' + GITEE_REPO + '/releases/download/v' + ver + '/' + exeName;
  const r = await httpsReq(dlUrl, { method: 'HEAD' });
  if (r.status === 200) {
    const remote = parseInt(r.headers['content-length'] || '0', 10);
    const localPath = path.join(ROOT, exeName);
    const local = exists(localPath) ? fs.statSync(localPath).size : 0;
    if (local && remote && remote !== local) {
      ok = false;
      pushLog(key, '❌ 下载直链可达但大小不一致：远程 ' + (remote / 1048576).toFixed(2) + 'MB / 本地 ' + (local / 1048576).toFixed(2) + 'MB（Gitee 上可能是旧包）');
    } else {
      pushLog(key, '✅ Gitee 下载直链 HTTP 200，大小 ' + (remote / 1048576).toFixed(2) + 'MB' + (local ? '（与本地一致）' : '（本地无同名包，跳过比对）'));
    }
  } else {
    ok = false;
    pushLog(key, '❌ Gitee 下载直链不可达 status=' + r.status + ' ' + (r.error || '') + ' → ' + dlUrl);
  }

  pushLog(key, '==================== 线上验证 结束（' + (ok ? '✅ 全部通过' : '❌ 有失败项，见上') + '）====================');
  return ok;
}

/* ------------------------------------------------------------------ */
/* 版本 bump（tauri.conf.json + Cargo.toml 同改，单独提交 + 推送）        */
/* ------------------------------------------------------------------ */

function bumpVersion(newVer, push) {
  const key = 'bump';
  pushLog(key, '==================== bump 版本到 v' + newVer + ' 开始 ====================');
  const t = readText(P.conf);
  if (!t) { pushLog(key, '❌ 读不到 tauri.conf.json'); return { ok: false, err: '读不到 tauri.conf.json' }; }
  // 只替换顶层（第一个）"version"，避免动到 schema 或其他字段
  const nConf = t.replace(/("version"\s*:\s*)"[^"]+"/, '$1"' + newVer + '"');
  if (nConf === t) { pushLog(key, '❌ tauri.conf.json 里没找到可替换的 version 字段'); return { ok: false, err: 'no version field' }; }
  fs.writeFileSync(P.conf, nConf, 'utf8');
  pushLog(key, '✅ tauri.conf.json → ' + newVer);

  const c = readText(P.cargo);
  if (!c) { pushLog(key, '❌ 读不到 Cargo.toml'); return { ok: false, err: '读不到 Cargo.toml' }; }
  const nCargo = c.replace(/(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/, '$1"' + newVer + '"');
  if (nCargo === c) { pushLog(key, '⚠️ Cargo.toml 未匹配到 [package] version（请手动确认）'); }
  else { fs.writeFileSync(P.cargo, nCargo, 'utf8'); pushLog(key, '✅ src-tauri/Cargo.toml → ' + newVer); }

  pushLog(key, 'git add + commit（英文提交信息，避免 PowerShell 中文乱码）…');
  git(['add', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml']);
  const cm = git(['commit', '-m', 'chore: bump version to ' + newVer]);
  pushLog(key, cm.out.trim() || ('(exit ' + cm.code + ')'));
  if (cm.code !== 0) { pushLog(key, '❌ 提交失败（可能没有改动或钩子拦截）'); return { ok: false, err: 'commit failed' }; }

  if (push) {
    pushLog(key, 'git pull --rebase + push origin main…');
    git(['pull', '--rebase', 'origin', 'main']);
    let pr = git(['push', 'origin', 'main']);
    pushLog(key, pr.out.trim() || ('(exit ' + pr.code + ')'));
    if (pr.code !== 0) {
      pushLog(key, '⚠️ 首次 push 被拒（多为 CI 自动提交），重试一次…');
      git(['pull', '--rebase', 'origin', 'main']);
      pr = git(['push', 'origin', 'main']);
      pushLog(key, pr.out.trim() || ('(exit ' + pr.code + ')'));
    }
    pushLog(key, pr.code === 0 ? '✅ 已推送到 origin/main' : '❌ 推送仍失败，请手动处理（详见上方 git 输出）');
  } else {
    pushLog(key, '（按选择：只本地提交，不推送；发布步骤会一并 push）');
  }
  pushLog(key, '==================== bump 结束 ====================');
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* HTTP 服务                                                          */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve) {
    const chunks = [];
    req.on('data', function (d) { chunks.push(d); });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { resolve({}); }
    });
  });
}

const STEPS = {
  build: { label: '打包（npx tauri build）', ps: 'npx tauri build' },
  sign: { label: '签名（sign.ps1）', ps: "& './sign.ps1'" },
  publish: { label: '发布（publish_update.ps1）', ps: "& './publish_update.ps1'" }
};

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;

  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(HTML.replace('__TOKEN__', TOKEN));
    return;
  }

  // API 一律要求 token（防网页跨站误触本机服务）
  if (p.indexOf('/api/') === 0) {
    if (req.headers['x-tfjl-token'] !== TOKEN) { json(res, 403, { ok: false, err: 'bad token' }); return; }
  }

  try {
    if (p === '/api/status' && req.method === 'GET') {
      const conf = readJSON(P.conf) || {};
      const vj = readJSON(P.version) || {};
      const swTxt = readText(P.sw) || '';
      const minSup = checkMinSupportedVersion();
      const exeName = 'tfjl-assistant_' + (conf.version || '?') + '_x64-setup.exe';
      json(res, 200, {
        ok: true,
        running: state.running,
        lastResult: state.lastResult,
        ver: conf.version || '?',
        minVersion: minSup,
        swCacheVersion: (swTxt.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1] || '?',
        releasedVer: vj.version || '?',
        gateFields: ['minVersion', 'forceUpdate', 'deprecatedMessage'].filter(function (k) { return vj[k] !== undefined; }).length,
        signedReady: exists(path.join(ROOT, exeName)) && exists(path.join(ROOT, exeName + '.sig')),
        builtCount: (function () { try { return exists(P.nsisDir) ? fs.readdirSync(P.nsisDir).filter(function (n) { return /_x64-setup\.exe$/i.test(n); }).length : 0; } catch (e) { return 0; } })(),
        nextVer: (function () {
          const v = String(conf.version || '2.0.0').split('.');
          v[v.length - 1] = String((parseInt(v[v.length - 1], 10) || 0) + 1);
          return v.join('.');
        })(),
        root: ROOT
      });
      return;
    }

    if (p === '/api/preflight' && req.method === 'POST') {
      const t0 = Date.now();
      const checks = runPreflight();
      const fail = checks.filter(function (c) { return c.level === 'fail'; }).length;
      const warn = checks.filter(function (c) { return c.level === 'warn'; }).length;
      json(res, 200, { ok: true, checks: checks, fail: fail, warn: warn, ms: Date.now() - t0 });
      return;
    }

    if (p === '/api/logs' && req.method === 'GET') {
      json(res, 200, { ok: true, seq: state.seq, lines: logsFrom(u.searchParams.get('from')), running: state.running });
      return;
    }

    if (p === '/api/clear-logs' && req.method === 'POST') {
      state.logs = []; state.seq = 0;
      json(res, 200, { ok: true });
      return;
    }

    if (p === '/api/bump' && req.method === 'POST') {
      const b = await readBody(req);
      const v = String(b.version || '').trim();
      if (!/^\d+\.\d+\.\d+$/.test(v)) { json(res, 400, { ok: false, err: '版本号格式应为 x.y.z（如 2.0.32）' }); return; }
      if (state.running) { json(res, 409, { ok: false, err: '已有步骤在运行' }); return; }
      const r = bumpVersion(v, !!b.push);
      json(res, r.ok ? 200 : 500, r);
      return;
    }

    if (p === '/api/run' && req.method === 'POST') {
      const b = await readBody(req);
      const key = String(b.step || '');
      if (key === 'verify-online') {
        if (state.running) { json(res, 409, { ok: false, err: '已有步骤在运行' }); return; }
        state.running = { key: 'verify', label: '线上验证', pid: 0, startedAt: Date.now() };
        runOnlineVerify().then(function (okv) {
          state.running = null;
          state.lastResult = { step: 'verify', label: '线上验证', code: okv ? 0 : 1, ok: okv, ts: Date.now() };
        }).catch(function (e) {
          pushLog('verify', '[验证异常] ' + e.message);
          state.running = null;
        });
        json(res, 202, { ok: true });
        return;
      }
      const def = STEPS[key];
      if (!def) { json(res, 400, { ok: false, err: '未知步骤: ' + key }); return; }
      const r = runStep(key, def.label, def.ps);
      json(res, r.ok ? 202 : 409, r);
      return;
    }

    if (p === '/api/cancel' && req.method === 'POST') {
      if (!state.running) { json(res, 200, { ok: true, msg: '没有正在运行的步骤' }); return; }
      const pid = state.running.pid;
      pushLog(state.running.key, '⛔ 用户手动中止（taskkill /T /F PID=' + pid + '）');
      if (pid) sh('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true });
      state.running = null;
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { ok: false, err: 'not found' });
  } catch (e) {
    json(res, 500, { ok: false, err: String((e && e.message) || e) });
  }
});

/* ------------------------------------------------------------------ */
/* 页面 UI（内联，无构建步骤）                                           */
/* ------------------------------------------------------------------ */

const HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>tfjl 发布工具</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;background:#0f1220;color:#e6e8f0;font:14px/1.6 "Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:18px}
h1{font-size:19px;margin:0 0 4px}
.sub{color:#8b90a8;font-size:12px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0}
.chip{background:#1a1f36;border:1px solid #2b3355;border-radius:999px;padding:4px 12px;font-size:12px}
.chip b{color:#7dd3fc}
.card{background:#151a2e;border:1px solid #252c4a;border-radius:12px;padding:14px;margin-bottom:14px}
.card h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px}
button{font:inherit;font-size:13px;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;background:#2a3358;color:#dfe4ff;transition:.15s}
button:hover:not(:disabled){filter:brightness(1.25)}
button:disabled{opacity:.45;cursor:not-allowed}
button.primary{background:linear-gradient(135deg,#4f8cff,#2f6bff);color:#fff;font-weight:600}
button.danger{background:#5a2230;color:#ffb4b4}
button.ok{background:linear-gradient(135deg,#37b26a,#1f8a4c);color:#fff;font-weight:600}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:10px}
.step{background:#1a2038;border:1px solid #2b3355;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.step .t{font-weight:600}
.step .d{font-size:11.5px;color:#8b90a8;min-height:32px}
.step button{width:100%}
table{width:100%;border-collapse:collapse;font-size:12.5px}
td{padding:6px 8px;border-bottom:1px solid #232a45;vertical-align:top}
tr:last-child td{border-bottom:none}
.lvl{font-weight:700;white-space:nowrap}
.ok{color:#4ade80}.warn{color:#fbbf24}.fail{color:#f87171}.info{color:#7dd3fc}
.fix{color:#94a3b8;font-size:11.5px}
pre{margin:0;background:#0a0d18;border:1px solid #232a45;border-radius:10px;padding:12px;height:400px;overflow:auto;font:12px/1.55 Consolas,"Courier New",monospace;white-space:pre-wrap;word-break:break-all}
.lg-ok{color:#4ade80}.lg-bad{color:#f87171}.lg-warn{color:#fbbf24}.lg-dim{color:#6b7280}
.pill{font-size:11px;padding:1px 8px;border-radius:999px;background:#232a45;color:#a5b4d4}
.spin{display:inline-block;width:11px;height:11px;border:2px solid #4f8cff;border-top-color:transparent;border-radius:50%;animation:sp .7s linear infinite;vertical-align:-1px;margin-right:6px}
@keyframes sp{to{transform:rotate(360deg)}}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input[type=text]{background:#0f1424;border:1px solid #2b3355;color:#e6e8f0;border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;width:110px}
label.ck{font-size:12.5px;color:#a5b4d4;display:flex;align-items:center;gap:5px;cursor:pointer}
details summary{cursor:pointer;color:#a5b4d4;font-size:13px}
.hint{font-size:11.5px;color:#8b90a8;margin-top:6px}
</style></head>
<body><div class="wrap">
<h1>🧰 tfjl 本地发布工具 <span class="sub">打包 · 签名 · 发布 一条龙（把《铁律》里的坑都做成了自动检查）</span></h1>
<div class="bar" id="bar"><span class="pill">载入中…</span></div>

<div class="card">
  <h2>① 预检 <span class="sub">（发布前必跑 · 每条都是历史上真实踩过的坑）</span></h2>
  <div class="row"><button class="primary" id="btnPre">运行预检</button><span class="sub" id="preSummary"></span></div>
  <div id="preWrap" style="margin-top:10px"></div>
</div>

<div class="card">
  <h2>② 发布流程</h2>
  <div class="steps">
    <div class="step"><div class="t">版本 bump</div><div class="d">同时改 tauri.conf.json + Cargo.toml，单独提交并推送（英文 commit）</div>
      <div class="row"><input type="text" id="newVer"><label class="ck"><input type="checkbox" id="bumpPush" checked>同时推送</label></div>
      <button id="btnBump">执行 bump</button></div>
    <div class="step"><div class="t">③ 打包</div><div class="d">npx tauri build，约 3 分钟。产物在 bundle/nsis</div>
      <button class="primary" id="btnBuild">开始打包</button></div>
    <div class="step"><div class="t">④ 签名</div><div class="d">sign.ps1：恢复密钥→校验→复制英文包名→签名→keynum 复核</div>
      <button class="primary" id="btnSign">开始签名</button></div>
    <div class="step"><div class="t">⑤ 发布</div><div class="d">publish_update.ps1：写 json→传 Gitee 发行版→推 GitHub（含 rebase 自愈）</div>
      <button class="primary" id="btnPub">开始发布</button></div>
    <div class="step"><div class="t">⑥ 线上验证</div><div class="d">查 updater.json / version.json / Pages / Gitee 直链大小</div>
      <button class="ok" id="btnVer">开始验证</button></div>
  </div>
  <div class="hint">顺序固定：bump → 打包 → 签名 → 发布 → 验证。<b>改了前端 JS 只推 GitHub 即可，不用打包</b>（仅当新增/改动 Tauri 命令才需发版）。</div>
</div>

<div class="card">
  <h2>运行日志 <button id="btnCancel" class="danger" style="margin-left:auto">⛔ 中止当前步骤</button>
      <button id="btnClear">清空</button></h2>
  <pre id="log"></pre>
</div>

<div class="card">
  <details><summary>📕 常见故障速查（《铁律》摘要）</summary>
  <table style="margin-top:10px">
    <tr><td class="lvl">点升级永远"无更新"</td><td>endpoints 含 <code>{{current_version}}</code></td><td class="fix">改成固定的 GitHub Pages 地址</td></tr>
    <tr><td class="lvl">升级弹 NSIS 安装窗口</td><td>installMode 是 passive</td><td class="fix">改成 quiet（需重新打包）</td></tr>
    <tr><td class="lvl">push 报 SSL/TLS failed</td><td>代理握手失败</td><td class="fix">直接重试；持续失败用 git -c http.sslVerify=false push origin main</td></tr>
    <tr><td class="lvl">push 被拒 fetch first</td><td>打包期间 CI 自动提交造成分叉</td><td class="fix">publish_update.ps1 已内置 rebase 自愈，重跑即可</td></tr>
    <tr><td class="lvl">PowerShell"字符串缺少终止符"</td><td>命令里带了中文</td><td class="fix">commit message 一律英文</td></tr>
    <tr><td class="lvl">某 JS 文件导出全 undefined</td><td>该文件有 TDZ 或重复声明</td><td class="fix">先 node --check + 重复函数扫描（预检已含）</td></tr>
    <tr><td class="lvl">APP 手牌拖不动</td><td>dragDropEnabled 被删</td><td class="fix">改回 false（预检已含）</td></tr>
    <tr><td class="lvl">改了前端用户没生效</td><td>Service Worker 缓存</td><td class="fix">APP 内双击右下角版本号，或调试窗 clearSWCache()</td></tr>
    <tr><td class="lvl">发布"成功"但用户下不到包</td><td>GITEE_TOKEN 没配，上传被静默跳过</td><td class="fix">配好用户环境变量（预检已含）</td></tr>
  </table></details>
</div>
</div>
<script>
const TOKEN='__TOKEN__';
let lastSeq=0, timer=null, preResult=null;
const $=id=>document.getElementById(id);
async function api(p,opt){opt=opt||{};opt.headers=Object.assign({'X-TFJL-Token':TOKEN,'Content-Type':'application/json'},opt.headers||{});const r=await fetch(p,opt);return await r.json();}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function colorize(l){
  if(/✅|PASS|成功|Sign success/.test(l))return 'lg-ok';
  if(/❌|FAIL|ERROR|失败|\[进程错误\]/.test(l))return 'lg-bad';
  if(/⚠|WARN|警告/.test(l))return 'lg-warn';
  if(/^====/.test(l))return 'lg-dim';
  return '';
}
function appendLogs(lines){
  const box=$('log');const atBottom=box.scrollTop+box.clientHeight>=box.scrollHeight-40;
  const frag=document.createDocumentFragment();
  lines.forEach(o=>{const d=document.createElement('div');const c=colorize(o.line);if(c)d.className=c;d.textContent='['+o.step+'] '+o.line;frag.appendChild(d);});
  box.appendChild(frag);
  while(box.childNodes.length>4000)box.removeChild(box.firstChild);
  if(atBottom)box.scrollTop=box.scrollHeight;
}
async function poll(){
  try{
    const r=await api('/api/logs?from='+lastSeq);
    if(r.lines&&r.lines.length){lastSeq=r.seq;appendLogs(r.lines);}
    setRunning(r.running);
  }catch(e){}
}
function setRunning(run){
  const busy=!!run;
  ['btnBuild','btnSign','btnPub','btnVer','btnBump','btnPre'].forEach(id=>{const b=$(id);if(b)b.disabled=busy;});
  window.__busy=busy;
  if(busy)$('bar').dataset.busy='1';
}
async function refresh(){
  const s=await api('/api/status');
  setRunning(s.running);
  $('bar').innerHTML=
    '<span class="chip">待发布版本 <b>v'+esc(s.ver)+'</b></span>'+
    '<span class="chip">已上线 <b>v'+esc(s.releasedVer)+'</b></span>'+
    '<span class="chip">门禁 minVersion <b>v'+esc(s.minVersion||'?')+'</b></span>'+
    '<span class="chip">SW <b>'+esc(s.swCacheVersion)+'</b></span>'+
    '<span class="chip">打包产物 <b>'+s.builtCount+'</b> 个</span>'+
    '<span class="chip">签名包 '+(s.signedReady?'<b class="ok">已就绪</b>':'<b class="warn">未就绪</b>')+'</span>'+
    '<span class="chip sub">'+esc(s.root)+'</span>';
  if(!$('newVer').value)$('newVer').value=s.nextVer;
  if(s.running)$('preSummary').innerHTML='<span class="spin"></span>正在执行：'+esc(s.running.label);
  else if(s.lastResult)$('preSummary').innerHTML=(s.lastResult.ok?'✅':'❌')+' 上次步骤：'+esc(s.lastResult.label)+'（退出码 '+s.lastResult.code+'）';
}
async function doPre(){
  $('preSummary').innerHTML='<span class="spin"></span>正在跑全量校验（含 verify_build.js，约数秒）…';
  $('preWrap').innerHTML='';$('btnPre').disabled=true;
  try{
    const r=await api('/api/preflight',{method:'POST'});
    preResult=r;
    let h='<table>';
    (r.checks||[]).forEach(c=>{
      const lv=c.level==='ok'?'✅ ok':c.level==='warn'?'⚠️ warn':c.level==='fail'?'❌ fail':'ℹ️ info';
      h+='<tr><td class="lvl '+c.level+'">'+lv+'</td><td><b>'+esc(c.title)+'</b>'+(c.detail?'<div class="sub">'+esc(c.detail)+'</div>':'')+(c.fix?'<div class="fix">→ '+esc(c.fix)+'</div>':'')+'</td></tr>';
    });
    h+='</table>';
    $('preWrap').innerHTML=h;
    $('preSummary').innerHTML=(r.fail?'<span class="fail">❌ '+r.fail+' 项阻断</span>':'<span class="ok">✅ 无阻断项</span>')+(r.warn?' · <span class="warn">'+r.warn+' 项提醒</span>':'')+' · 耗时 '+r.ms+'ms';
  }catch(e){$('preSummary').textContent='预检失败：'+e.message;}
  $('btnPre').disabled=false;
}
async function run(step,label){
  if(window.__busy){alert('已有步骤在运行');return;}
  if(step==='publish'&&!confirm('确认发布？将上传安装包到 Gitee 发行版并推送 GitHub Pages。'))return;
  const r=await api('/api/run',{method:'POST',body:JSON.stringify({step})});
  if(!r.ok){alert(r.err||'启动失败');return;}
  $('preSummary').innerHTML='<span class="spin"></span>正在执行：'+label;
  setTimeout(poll,300);
}
async function doBump(){
  if(window.__busy){alert('已有步骤在运行');return;}
  const v=$('newVer').value.trim();
  if(!/^\\d+\\.\\d+\\.\\d+$/.test(v)){alert('版本号格式应为 x.y.z，如 2.0.32');return;}
  if(!confirm('把版本号改为 v'+v+' 并提交'+(($('bumpPush').checked)?' + 推送':'（不推送）')+'？'))return;
  const r=await api('/api/bump',{method:'POST',body:JSON.stringify({version:v,push:$('bumpPush').checked})});
  if(!r.ok)alert(r.err||'bump 失败');
  await refresh();poll();
}
async function doCancel(){
  if(!window.__busy){alert('当前没有在运行的步骤');return;}
  if(!confirm('确定中止当前步骤？'))return;
  await api('/api/cancel',{method:'POST'});poll();
}
$('btnPre').onclick=doPre;
$('btnBump').onclick=doBump;
$('btnBuild').onclick=()=>run('build','打包');
$('btnSign').onclick=()=>run('sign','签名');
$('btnPub').onclick=()=>run('publish','发布');
$('btnVer').onclick=()=>run('verify-online','线上验证');
$('btnCancel').onclick=doCancel;
$('btnClear').onclick=async()=>{await api('/api/clear-logs',{method:'POST'});$('log').innerHTML='';lastSeq=0;};
refresh();poll();
timer=setInterval(()=>{poll();if(!window.__busy&&Date.now()%6000<800)refresh();},800);
window.addEventListener('beforeunload',()=>clearInterval(timer));
</script>
</body></html>`;

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

server.listen(PORT, '127.0.0.1', function () {
  const url = 'http://127.0.0.1:' + PORT + '/';
  console.log('=========================================');
  console.log(' tfjl 本地发布工具已启动');
  console.log('   浏览器打开: ' + url);
  console.log('   仓库根目录: ' + ROOT);
  console.log('   仅本机可用（127.0.0.1），关闭本窗口即停止');
  console.log('=========================================');
  // TFJL_NO_OPEN=1 时不自动开浏览器（供自动化测试用）
  if (!process.env.TFJL_NO_OPEN) {
    try { spawn('cmd', ['/c', 'start', '', url], { shell: true, detached: true, windowsHide: true }).unref(); } catch (e) {}
  }
});
server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') {
    console.log('端口 ' + PORT + ' 已被占用：可能本工具已在运行。直接打开 http://127.0.0.1:' + PORT + '/');
    console.log('（想换端口：set TFJL_RELEASE_PORT=8800 && node release_server.js）');
  } else {
    console.log('启动失败: ' + e.message);
  }
  process.exit(1);
});
