// 代码结构与语法校验（铁律：每次修改代码后必跑）
// 单一可信源，本地钩子与 CI 共用。路径相对仓库根（__dirname 为 .github/）。
// 用法：
//   本地： node .github/verify_build.js
//   CI：  GitHub Actions 调用相同命令
// 校验项：
//  1) HTML 的 <div> 开闭配对（少闭合/多闭合即报错）—— 用户最关心的低级错误
//  2) 对所有核心/改动 .js 跑 `node --check`（权威语法+括号校验）
//  3) index.html 内联脚本可编译（抽取 <script> 块 vm.Script）
//  4) 运行时冒烟测试（DOM 桩）：管理员全部页面入口 + 登录打卡 4 视图渲染
//     背景：s1.0.206 事故——删 const 声明后 show 分支仍引用 → ReferenceError，
//     node --check 语法级检查抓不住，只有运行时才能暴露。凡改共享入口函数必被此项拦截。
// 任一项 FAIL（退出码非 0）必须修复到全绿，再提交/合并。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..'); // .github/ -> 仓库根
const P = (...p) => path.join(ROOT, ...p);

let ok = true;
const FAIL = (m) => { console.log('FAIL: ' + m); ok = false; };
const PASS = (m) => console.log('PASS: ' + m);

// ---------- 0) 临时脚本每日自动清理（铁律配套）----------
// 规则：AI 新建的一次性脚本必须放 tfjl_temp/ 且命名 `YYYY-MM-DD_描述.ext`。
// 每天第一次跑本校验时，自动删掉「日期早于今天」的那些文件，之后当天不再重复扫描。
// 🔴 安全底线：只删带日期前缀的文件，不带前缀的历史文件/密钥/子目录一律不动。
// 清理过程任何异常都不得影响校验结果（绝不因清理失败而 FAIL）。
function dailyCleanTemp() {
    try {
        const dir = P('tfjl_temp');
        if (!fs.existsSync(dir)) return; // CI 环境无此目录，直接跳过
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const stamp = path.join(dir, '.last-clean');
        // 当天已清理过 → 跳过（实现"每天第一次打开清一次"）
        if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === today) return;

        const DATED = /^(\d{4}-\d{2}-\d{2})[_-]/;
        let removed = 0, legacy = 0;
        for (const name of fs.readdirSync(dir)) {
            if (name === '.last-clean') continue;
            const full = path.join(dir, name);
            let st;
            try { st = fs.statSync(full); } catch (e) { continue; }
            if (st.isDirectory()) continue;            // 子目录不动
            const m = name.match(DATED);
            if (!m) { legacy++; continue; }             // 无日期前缀 = 历史/用户文件，绝不删
            if (m[1] >= today) continue;                // 今天及以后的保留
            try { fs.unlinkSync(full); removed++; } catch (e) {}
        }
        fs.writeFileSync(stamp, today, 'utf8');
        if (removed) console.log(`CLEAN: 已自动清理 ${removed} 个过期临时脚本（${today} 之前，tfjl_temp/）`);
        if (legacy) console.log(`NOTE : tfjl_temp/ 还有 ${legacy} 个无日期前缀的历史文件未动（含密钥/草稿，需手动确认后再删）`);
    } catch (e) { /* 清理失败绝不影响校验 */ }
}
dailyCleanTemp();

// ---------- 1) HTML <div> 配对 ----------
function checkDivPair(file) {
    if (!fs.existsSync(file)) { FAIL('缺少文件 ' + file); return; }
    const s = fs.readFileSync(file, 'utf8');
    const open = (s.match(/<div\b/gi) || []).length;
    const close = (s.match(/<\/div>/gi) || []).length;
    if (open !== close) {
        FAIL(`${path.relative(ROOT, file)} <div> 开(${open}) != 闭(${close})，疑似少闭合或多余`);
    } else {
        PASS(`${path.relative(ROOT, file)} <div> 配对 ${open}/${close}`);
    }
}
[P('index.html'), P('webroot', 'index.html')].forEach(checkDivPair);

// ---------- 2) node --check 所有核心/改动 JS ----------
const JS_FILES = [
    'app-core.js', 'webroot/app-core.js',
    'app-features.js', 'webroot/app-features.js',
    'recognize.js', 'webroot/recognize.js',
    'app-boot.js', 'webroot/app-boot.js',
    'app-effects.js', 'app-picker.js',
    'app-skinmaker.js', 'app-deepsea.js'
];
JS_FILES.forEach(rel => {
    const file = P(rel);
    if (!fs.existsSync(file)) return;
    try {
        execSync(`node --check "${file}"`, { stdio: 'pipe' });
        PASS(`${rel} node --check 语法+括号平衡`);
    } catch (e) {
        FAIL(`${rel} 语法错误:\n${e.stderr ? e.stderr.toString() : e.message}`);
    }
});

// ---------- 3) index.html 内联脚本可编译 ----------
function checkInlineScripts(file) {
    if (!fs.existsSync(file)) return;
    const s = fs.readFileSync(file, 'utf8');
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m, idx = 0, fail = 0;
    while ((m = re.exec(s))) {
        idx++;
        const code = m[1];
        if (!code.trim()) continue;
        try { new vm.Script(code); }
        catch (e) { FAIL(`${path.relative(ROOT, file)} 内联脚本#${idx} 编译失败: ${e.message}`); fail++; ok = false; }
    }
    if (!fail) PASS(`${path.relative(ROOT, file)} 内联脚本编译通过 (${idx} 块)`);
}
[P('index.html'), P('webroot', 'index.html')].forEach(checkInlineScripts);

// ---------- 4) 运行时冒烟测试（DOM 桩）----------
// 4a) 管理员页面入口：adminHideAllPages / adminShowMenu / adminShowPage 全部页面参数逐一调用，断言不抛错。
// 4b) 登录打卡面板：adminBuildLoginStatsHTML 四视图（热力图/今日签到/动态含展开/总表）渲染，断言产出 HTML 且无 "NaN"。
// 提取正则若因函数改名/挪位失配 → FAIL 提示同步更新本段（作为提交闸门宁可误报不可漏检）。
function smokeRuntime() {
    let src;
    try { src = fs.readFileSync(P('app-core.js'), 'utf8'); }
    catch (e) { FAIL('冒烟测试: 读不到 app-core.js'); return; }

    const SEGS = [
        ['adminHideAllPages',    /function adminHideAllPages[\s\S]*?window\.adminHideAllPages = adminHideAllPages;/],
        ['adminShowMenu',        /function adminShowMenu[\s\S]*?\n        \}/],
        ['adminShowPage',        /function adminShowPage\(page\) \{[\s\S]*?\n        \}/],
        ['adminBuildLoginStatsHTML', /function adminBuildLoginStatsHTML[\s\S]*?\n\s*window\.adminBuildLoginStatsHTML = adminBuildLoginStatsHTML;/]
    ];
    let code = '';
    for (const [name, re] of SEGS) {
        const m = src.match(re);
        if (!m) { FAIL(`冒烟测试: 无法定位 ${name}（函数被改名/挪位？请同步更新 verify_build.js 冒烟段正则）`); return; }
        code += m[0] + '\n';
    }

    // DOM/环境桩：getElementById 返回可复用元素对象，querySelectorAll 返回空表（adminPage* 全部"存在"于桩外）
    const els = {};
    const noop = () => {};
    const ctx = {
        console, Date, Math, JSON, Array, Object, String, Number, isFinite, parseInt, parseFloat,
        document: {
            getElementById: (id) => els[id] || (els[id] = { style: {}, value: '' }),
            querySelectorAll: () => []
        },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        currentConfig: {},
        INDEX_GIST_ID_KEY: 'TFJL_INDEX_GIST_ID', GIST_ID: 'smoke',
        escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        _loginTab: 'heat', _loginSort: { key: 'total', desc: true }, _loginLogSource: 'gist', _loginLogError: '', _loginOpenDays: {},
        // adminShowPage 各分支依赖的加载函数全部 no-op
        adminRefreshNews: noop, adminLoadStats: noop, adminLoadAnalytics: noop, adminLoadScriptStats: noop,
        updateAdminTokenStatus: noop, loadCurrentNick: noop, renderNickRegistry: noop, loadPasswordList: noop,
        adminRefreshDebugLog: noop, adminRefreshConsoleLog: noop, adminLoadLoginStats: noop, refreshApiMonitor: noop,
        renderDamageCalc: noop, updateBroadcastToggleStatus: noop, adminRenderApiUsage: noop
    };
    ctx.window = ctx;
    vm.createContext(ctx);

    // 4a) 管理员页面入口
    const PAGES = ['help', 'title', 'news', 'stats', 'analytics', 'scriptStats', 'settings', 'nickManage',
        'passwordManage', 'cacheManage', 'logStats', 'loginStats', 'apiMonitor', 'damageCalc'];
    let bad = 0;
    try {
        vm.runInContext(code, ctx);
        for (const p of PAGES) {
            try { ctx.adminShowPage(p); }
            catch (e) { FAIL(`冒烟测试: adminShowPage('${p}') 抛错 → ${e.message}`); bad++; }
        }
        try { ctx.adminShowMenu(); }
        catch (e) { FAIL('冒烟测试: adminShowMenu() 抛错 → ' + e.message); bad++; }
    } catch (e) {
        FAIL('冒烟测试: 提取代码无法在桩环境执行 → ' + e.message); return;
    }
    if (!bad) PASS(`管理员页面入口冒烟 ${PAGES.length + 1} 项（adminShowPage×${PAGES.length} + menu）全通过`);

    // 4b) 登录打卡 4 视图渲染（含动态展开当天）
    const d = new Date();
    const tk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mk = (nick, h, m) => ({ nick, ts: new Date(new Date().setHours(h, m, 0, 0)).getTime() });
    const fixture = [mk('冒烟A', 8, 5), mk('冒烟A', 12, 30), mk('冒烟B', 9, 15), mk('冒烟B', 18, 40), mk('冒烟C', 23, 1)];
    let bad2 = 0;
    for (const tab of ['heat', 'today', 'feed', 'table']) {
        ctx._loginTab = tab;
        ctx._loginOpenDays = tab === 'feed' ? { [tk]: 1 } : {};
        try {
            const html = ctx.adminBuildLoginStatsHTML(fixture);
            if (typeof html !== 'string' || html.length < 200) { FAIL(`冒烟测试: 登录打卡视图 ${tab} 产出异常`); bad2++; }
            else if (/NaN/.test(html)) { FAIL(`冒烟测试: 登录打卡视图 ${tab} 输出含 NaN`); bad2++; }
        } catch (e) { FAIL(`冒烟测试: 登录打卡视图 ${tab} 渲染抛错 → ${e.message}`); bad2++; }
    }
    if (!bad2) PASS('登录打卡 4 视图渲染冒烟通过（热力图/今日签到/动态展开/总表，无 NaN）');
}
smokeRuntime();

// ---------- 5) Tauri v2 自定义命令授权三处一致性（2026-08-24 加，防「打包后才发现 not allowed by ACL」）----------
// 铁律：每新增 `#[tauri::command]` 必须三处同步，缺一即运行时弹原生错误对话框 → 必须重新打包 → 浪费一次打包。
//  ① lib.rs 函数（用 Result<T,String> 返回，Tauri 宏才会生成 ACL 权限）
//  ② src-tauri/permissions/allow-custom-commands.toml 追加 [[permission]] commands.allow=["命令名"]
//  ③ src-tauri/capabilities/default.json 声明 "allow-命令名"
// 本项自动检查：invoke_handler 注册的每个命令，是否②③④都有对应授权；缺 → FAIL（提交闸门拦下，不必等到打包）。
function checkTauriCommandAuth() {
    const lib = P('src-tauri', 'src', 'lib.rs');
    const toml = P('src-tauri', 'permissions', 'allow-custom-commands.toml');
    const cap = P('src-tauri', 'capabilities', 'default.json');
    if (!fs.existsSync(lib) || !fs.existsSync(toml) || !fs.existsSync(cap)) {
        PASS('Tauri 命令授权检查: 文件不全（CI 无 Rust 环境），跳过'); return;
    }
    const libSrc = fs.readFileSync(lib, 'utf8');
    const tomlSrc = fs.readFileSync(toml, 'utf8');
    const capSrc = fs.readFileSync(cap, 'utf8');

    // 取 invoke_handler!([ a, b, ... ]) 内注册的所有命令名
    const regM = libSrc.match(/invoke_handler\s*\(\s*tauri::generate_handler!\s*\[([\s\S]*?)\]\s*\)/);
    if (!regM) { PASS('Tauri 命令授权检查: 未找到 invoke_handler，跳过'); return; }
    const registered = regM[1].split(',').map(s => s.trim()).filter(Boolean);

    // toml 里所有被 allow 的命令
    const tomlAllowed = new Set();
    const tomlRe = /commands\.allow\s*=\s*\[([^\]]*)\]/g;
    let tm;
    while ((tm = tomlRe.exec(tomlSrc))) {
        tm[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean).forEach(c => tomlAllowed.add(c));
    }
    // capabilities 里所有 "allow-命令名"
    const capAllowed = new Set();
    const capRe = /"allow-([a-z0-9_-]+)"/g;
    let cm;
    while ((cm = capRe.exec(capSrc))) capAllowed.add(cm[1]);

    let miss = 0;
    for (const cmd of registered) {
        // Tauri ACL 标识符用小写连字符（foo_bar → foo-bar），而 Rust 函数名下划线。
        // capabilities/default.json 用连字符版，allow-custom-commands.toml 用下划线版。
        const cmdHyphen = cmd.replace(/_/g, '-');
        const aHyphen = `allow-${cmdHyphen}`;
        const inToml = tomlAllowed.has(cmd);
        const inCap = capAllowed.has(cmdHyphen);
        if (!inToml || !inCap) {
            FAIL(`Tauri 命令授权缺失 [${cmd}]：${inToml ? '✓toml' : '✗toml缺'} ${inCap ? '✓capability' : '✗capability缺 "' + aHyphen + '"'}\n     → 运行时必弹「${cmd} not allowed by ACL」，须补 src-tauri/permissions/allow-custom-commands.toml + capabilities/default.json 后重新打包`);
            miss++;
        }
    }
    if (!miss) PASS(`Tauri 命令授权检查 ${registered.length} 个命令三处一致（lib.rs / toml / capability）`);
}
checkTauriCommandAuth();

console.log(ok ? '\n==== 全部校验通过 ✅ ====' : '\n==== 存在 FAIL，必须修复后再提交/合并 ❌ ====');
process.exit(ok ? 0 : 1);
