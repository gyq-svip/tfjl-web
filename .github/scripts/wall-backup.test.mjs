// ==================== 清理选择逻辑单测 ====================
// 1) 直接测 Node/Actions 版 selectExpiredBackupFiles（wall-backup.mjs 导出）
// 2) 从 app-core.js 里【提取网页版 wallSelectExpiredBackupFiles 真实源码】跑同一组用例
// 两版输出必须逐例一致——防止网页端与 Actions 端清理规则漂移（清错文件=脏数据）。
// 运行：node .github/scripts/wall-backup.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { selectExpiredBackupFiles } from './wall-backup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DAY = 86400 * 1000;
const NOW = 1787500000000;   // 固定"现在"，用例可复现
const ts = (daysAgo) => NOW - Math.round(daysAgo * DAY);

let fails = 0;
function check(name, actual, expected) {
    const a = JSON.stringify([...actual].sort());
    const e = JSON.stringify([...expected].sort());
    const ok = a === e;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  实际: ${a}\n  期望: ${e}`}`);
}

// ---- 从 app-core.js 提取网页版真实函数源码（括号配平） ----
function extractWebFn(src, fnName) {
    const start = src.indexOf(`function ${fnName}(`);
    if (start < 0) throw new Error(`app-core.js 里找不到 function ${fnName}`);
    let i = src.indexOf('{', start), depth = 0, end = -1;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) throw new Error(`${fnName} 括号配平失败`);
    return src.slice(start, end);
}
const appCore = readFileSync(join(here, '..', '..', 'app-core.js'), 'utf8');
const webFnSrc = extractWebFn(appCore, 'wallSelectExpiredBackupFiles');
const webSelect = new Function(`${webFnSrc}; return wallSelectExpiredBackupFiles;`)();
console.log('已从 app-core.js 提取网页版函数（' + webFnSrc.length + ' 字符）\n');

// ---- 用例 ----
const cases = [];
// 1. 常规：3 份备份，1 新 2 旧 → 删两套旧的（主索引+各自 content 文件），保留最新
cases.push(['常规-删两套旧的', [
    'backup_info.json',
    `backup_wall_all_${ts(0)}.json`, `content_messages_0_${ts(0)}.json`, `content_script_a_1111111111111111_${ts(0)}.js`,
    `backup_wall_all_${ts(12)}.json`, `content_messages_0_${ts(12)}.json`, `content_profiles_${ts(12)}.json`, `content_script_a_1111111111111111_${ts(12)}.js`,
    `backup_wall_all_${ts(30)}.json`, `content_messages_0_${ts(30)}.json`, `content_messages_1_${ts(30)}.json`, `content_script_b_2222222222222222_${ts(30)}.js`,
], [
    `backup_wall_all_${ts(12)}.json`, `content_messages_0_${ts(12)}.json`, `content_profiles_${ts(12)}.json`, `content_script_a_1111111111111111_${ts(12)}.js`,
    `backup_wall_all_${ts(30)}.json`, `content_messages_0_${ts(30)}.json`, `content_messages_1_${ts(30)}.json`, `content_script_b_2222222222222222_${ts(30)}.js`,
]]);
// 2. 全部超龄 → 最新一份仍保留（floor）
cases.push(['全部超龄-最新保留', [
    `backup_wall_all_${ts(15)}.json`, `content_messages_0_${ts(15)}.json`,
    `backup_wall_all_${ts(40)}.json`, `content_messages_0_${ts(40)}.json`,
], [
    `backup_wall_all_${ts(40)}.json`, `content_messages_0_${ts(40)}.json`,
]]);
// 3. 保留期内（9.9 天）→ 一个不删
cases.push(['保留期内不删', [
    `backup_wall_all_${ts(1)}.json`, `content_messages_0_${ts(1)}.json`,
    `backup_wall_all_${ts(9.9)}.json`, `content_messages_0_${ts(9.9)}.json`,
], []]);
// 4. 无关文件永不删（backup_info / 其它前缀）——需有一份新鲜主索引，旧主索引才可删
cases.push(['无关文件不碰', [
    'backup_info.json', 'room_index.json', 'counter.json', `content_${'x'.repeat(20)}.txt`,
    `backup_wall_all_${ts(0)}.json`,
    `backup_wall_all_${ts(30)}.json`,
], [
    `backup_wall_all_${ts(30)}.json`,
]]);
// 5. 文件名中段嵌 13 位数字（脚本名自带时间戳样数字）→ 取最后一组 = 真实备份 ts
cases.push(['中段嵌13位数字取末组', [
    `backup_wall_all_${ts(0)}.json`,
    `backup_wall_all_${ts(20)}.json`,
    `content_script_abc_1787000000000_3333333333333333_${ts(20)}.js`,
    `content_script_1787000000000_${ts(0)}.js`,
], [
    `backup_wall_all_${ts(20)}.json`,
    `content_script_abc_1787000000000_3333333333333333_${ts(20)}.js`,
]]);
// 6. 12/14 位数字不算时间戳
cases.push(['非13位不匹配', [
    `backup_wall_all_${ts(0)}.json`,
    `content_messages_0_${ts(30)}0.json`,            // 14 位
    `content_messages_0_${String(ts(30)).slice(1)}.json`, // 12 位
], []]);
// 7. 没有主索引 → 什么都不删（孤儿 content 保守留下）
cases.push(['无主索引全保留', [
    `content_messages_0_${ts(30)}.json`, `content_script_a_1111111111111111_${ts(40)}.js`,
], []]);
// 8. 孤儿 content（ts 无对应主索引且超龄）→ 保守不删（只删有主索引背书的整套）
cases.push(['孤儿content保守留', [
    `backup_wall_all_${ts(0)}.json`,
    `content_messages_0_${ts(30)}.json`,   // 没有对应主索引
], []]);
// 9. 无扩展名 content 文件仍按 ts 匹配
cases.push(['无扩展名匹配', [
    `backup_wall_all_${ts(0)}.json`,
    `backup_wall_all_${ts(20)}.json`, `content_messages_0_${ts(20)}`,
], [
    `backup_wall_all_${ts(20)}.json`, `content_messages_0_${ts(20)}`,
]]);
// 10. 同一天多份（同 ts 主索引只有一个）+ 乱序输入
cases.push(['乱序输入', [
    `content_script_z_9999999999999999_${ts(11)}.js`,
    `backup_wall_all_${ts(2)}.json`,
    `backup_wall_all_${ts(11)}.json`,
    `content_messages_0_${ts(11)}.json`,
    `content_messages_0_${ts(2)}.json`,
], [
    `backup_wall_all_${ts(11)}.json`, `content_messages_0_${ts(11)}.json`, `content_script_z_9999999999999999_${ts(11)}.js`,
]]);

for (const [name, input, expectedNode] of cases) {
    const outNode = selectExpiredBackupFiles(input, NOW, 10);
    check(`[Node] ${name}`, outNode, expectedNode);
}
console.log('');
for (const [name, input, expected] of cases) {
    const outWeb = webSelect(input, NOW, 10);
    check(`[Web] ${name}`, outWeb, expected);
}
// 双端一致性：同输入两版输出完全相同
console.log('');
for (const [name, input] of cases) {
    const a = JSON.stringify([...selectExpiredBackupFiles(input, NOW, 10)].sort());
    const b = JSON.stringify([...webSelect(input, NOW, 10)].sort());
    check(`[双端一致] ${name}`, a === b ? [b] : [a], [b]);
}

console.log(fails === 0 ? '\n全部通过 ✅' : `\n${fails} 项失败 ❌`);
process.exit(fails === 0 ? 0 : 1);
