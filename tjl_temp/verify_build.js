// 代码结构与语法校验（铁律：每次修改代码后必跑）
// 用法：cd d:\tfjl-web && node tfjl_temp/verify_build.js
// 校验项：
//  1) HTML 的 <div> 开闭配对（少闭合/多闭合即报错）—— 用户最关心的低级错误
//  2) 对所有改动/核心 .js 跑 `node --check`（权威语法+括号校验）
//  3) 若改了 index.html，校验内联脚本可编译（抽取 <script> 块 vm.Script）
// 任一项 FAIL 必须修复到全绿，再提交。
// 说明：括号平衡直接用 node --check（V8 解析器权威），不再用正则启发式（易被正则字面量/模板串误报）。

const fs = require('fs');
const { execSync } = require('child_process');
const vm = require('vm');

let ok = true;
const FAIL = (m) => { console.log('FAIL: ' + m); ok = false; };
const PASS = (m) => console.log('PASS: ' + m);

// ---------- 1) HTML <div> 配对 ----------
function checkDivPair(file) {
    const s = fs.readFileSync(file, 'utf8');
    const open = (s.match(/<div\b/gi) || []).length;
    const close = (s.match(/<\/div>/gi) || []).length;
    if (open !== close) {
        FAIL(`${file} <div> 开(${open}) != 闭(${close})，疑似少闭合或多余`);
    } else {
        PASS(`${file} <div> 配对 ${open}/${close}`);
    }
}
['d:/tfjl-web/index.html', 'd:/tfjl-web/webroot/index.html'].forEach(checkDivPair);

// ---------- 2) node --check 所有核心/改动 JS ----------
const JS_FILES = [
    'd:/tfjl-web/app-core.js', 'd:/tfjl-web/webroot/app-core.js',
    'd:/tfjl-web/app-features.js', 'd:/tfjl-web/webroot/app-features.js',
    'd:/tfjl-web/recognize.js', 'd:/tfjl-web/webroot/recognize.js',
    'd:/tfjl-web/app-boot.js', 'd:/tfjl-web/webroot/app-boot.js',
    'd:/tfjl-web/app-effects.js', 'd:/tfjl-web/app-picker.js',
    'd:/tfjl-web/app-skinmaker.js', 'd:/tfjl-web/app-deepsea.js'
];
JS_FILES.forEach(file => {
    if (!fs.existsSync(file)) return;
    try {
        execSync(`node --check "${file}"`, { stdio: 'pipe' });
        PASS(`${file} node --check 语法+括号平衡`);
    } catch (e) {
        FAIL(`${file} 语法错误:\n${e.stderr ? e.stderr.toString() : e.message}`);
    }
});

// ---------- 3) index.html 内联脚本可编译 ----------
function checkInlineScripts(file) {
    const s = fs.readFileSync(file, 'utf8');
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m, idx = 0, fail = 0;
    while ((m = re.exec(s))) {
        idx++;
        const code = m[1];
        if (!code.trim()) continue;
        try { new vm.Script(code); }
        catch (e) { FAIL(`${file} 内联脚本#${idx} 编译失败: ${e.message}`); fail++; ok = false; }
    }
    if (!fail) PASS(`${file} 内联脚本编译通过 (${idx} 块)`);
}
['d:/tfjl-web/index.html', 'd:/tfjl-web/webroot/index.html'].forEach(checkInlineScripts);

console.log(ok ? '\n==== 全部校验通过 ✅ ====' : '\n==== 存在 FAIL，必须修复后再提交 ❌ ====');
process.exit(ok ? 0 : 1);
