// 代码结构与语法校验（铁律：每次修改代码后必跑）
// 单一可信源，本地钩子与 CI 共用。路径相对仓库根（__dirname 为 .github/）。
// 用法：
//   本地： node .github/verify_build.js
//   CI：  GitHub Actions 调用相同命令
// 校验项：
//  1) HTML 的 <div> 开闭配对（少闭合/多闭合即报错）—— 用户最关心的低级错误
//  2) 对所有核心/改动 .js 跑 `node --check`（权威语法+括号校验）
//  3) index.html 内联脚本可编译（抽取 <script> 块 vm.Script）
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

console.log(ok ? '\n==== 全部校验通过 ✅ ====' : '\n==== 存在 FAIL，必须修复后再提交/合并 ❌ ====');
process.exit(ok ? 0 : 1);
