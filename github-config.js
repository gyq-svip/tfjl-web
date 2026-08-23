// github-config.js — 盟战战绩(联盟) 网络版共享配置
// 说明：GitHub Token 复用 index.html 既有的 getGistToken()（部署时由 GitHub Actions 注入 /
//       本地开发从 localStorage('TFJL_Gist_Token') 读取），无需在此填写任何 token。
//       沿用现有需求墙 / 拍卖 / 聊天室同一套 Gist 读写能力。
// 注意：只提供 getGistToken 的兜底实现；若本页在 index.html 内嵌/同源加载，
//       会优先使用 index.html 已定义的 getGistToken（更权威）。

// ===== 把本页(iframe)的 console 日志转发到父窗口浮动控制台 =====
// 盟战页以 iframe 内嵌于 index.html，自身 console 不进首页浮窗；同一域下可直接调用父窗口已被
// captureConsole 重写的 console.*（会写入父窗口 __consoleLogs，并被浮动控制台渲染），便于在 APP 内观测报错。
(function forwardIframeConsole() {
    const FWD = ['log', 'warn', 'error', 'info'];
    FWD.forEach(function (level) {
        const orig = (console[level] || console.log).bind(console);
        console[level] = function () {
            const args = Array.prototype.slice.call(arguments);
            try {
                const p = window.parent;
                if (p && p !== window && p.console && typeof p.console[level] === 'function') {
                    p.console[level].apply(p.console, ['[联盟]'].concat(args));
                }
                if (p && p !== window && typeof p.refreshFloatConsole === 'function') {
                    try { p.refreshFloatConsole(); } catch (e) {}
                }
            } catch (e) {}
            orig.apply(null, args);
        };
    });
})();


// 盟战战绩总索引：复用主站固定的「总表 gist」(GIST_ID = a32a0628bd9275f3a4922cd12cf298c9)，
// 与 room_index.json 共存于同一 gist。所有用户/设备共用同一份，注册时自动写入 alliance_index.json。
window.TFJL_MASTER_GIST_ID = 'a32a0628bd9275f3a4922cd12cf298c9';

// 深海「势力统计」共享 Gist id（所有人可见）。留空则管理员首次上传时自动创建并提示。
window.TFJL_DEEPSEA_GIST_ID = '';

// 深海「个人排名战绩（图2）」共享 Gist id（所有人可见，含 OCR 切片校对）。留空则管理员首次上传时自动创建并提示。
window.TFJL_DEEPSEA_PLAYER_GIST_ID = '';

// 兜底：若页面未定义 getGistToken（独立打开 alliance.html 时 index.html 的函数不可用），
// 这里提供一份一致的实现。优先用已存在的全局函数。
if (typeof window.getGistToken !== 'function') {
    window.getGistToken = function () {
        // 子页经 iframe 内嵌时，复用父窗口（index.html）运行时注入的真实 token
        try {
            if (window.parent && window.parent !== window && typeof window.parent.getGistToken === 'function') {
                const pt = window.parent.getGistToken();
                if (pt && pt.length > 10 && !pt.startsWith('YOUR_')) return pt;
            }
        } catch (e) {}
        try { const ls = localStorage.getItem('TFJL_Gist_Token'); if (ls) return ls; } catch (e) {}
        return '';
    };
}

// ===== 沿用 index.html 的 PBKDF2 加密（密码方案完全一致） =====
const _ENC_FIXED_SALT = 'tfjl-share-v2-salt'; // 应用级固定 salt（公开无妨），仅用于密码哈希校验
const _PBKDF2_ITER = 200000;                  // 迭代次数：让单次猜测成本≈数十毫秒，拖慢字典攻击

function _abToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}
function _b64ToAb(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

// 密码哈希（v2：PBKDF2-SHA256 慢哈希，抵抗对公开哈希的离线暴破），返回 'v2$<base64>'
async function hashPassword(password) {
    try {
        if (window.crypto && window.crypto.subtle) {
            const enc = new TextEncoder();
            const salt = enc.encode(_ENC_FIXED_SALT);
            const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
            const bits = await crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: salt, iterations: _PBKDF2_ITER, hash: 'SHA-256' }, km, 256);
            return 'v2$' + _abToB64(bits);
        }
    } catch (e) {}
    // 无 subtle 环境下的兜底（不推荐，仅兼容）
    return 'plain$' + password;
}

// 验证密码：兼容 v2 PBKDF2 哈希 与 plain 兜底
async function verifyPassword(input, storedHash) {
    if (!storedHash) return false;
    if (storedHash.indexOf('v2$') === 0) {
        return (await hashPassword(input)) === storedHash;
    }
    if (storedHash.indexOf('plain$') === 0) {
        return 'plain$' + input === storedHash;
    }
    // 旧版 SHA-256 哈希兜底
    try {
        if (window.crypto && window.crypto.subtle) {
            const data = new TextEncoder().encode(input);
            const hash = await crypto.subtle.digest('SHA-256', data);
            if (btoa(String.fromCharCode(...new Uint8Array(hash))) === storedHash) return true;
        }
    } catch (e) {}
    return false;
}
