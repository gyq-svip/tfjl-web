// github-config.js — 盟战战绩(联盟) 网络版共享配置
// 说明：GitHub Token 由部署时注入（GitHub Actions 会把下方占位符替换为真实 Token），
//       或读取 localStorage('TFJL_Gist_Token')。代码不写死真实 token。
//       与 index.html 的 getGistToken 逻辑保持一致。
window.GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';

// 盟战战绩总数据库 gist id（registry）。留空则首次注册会自动创建并提示管理员，
// 把提示的 id 复制到此处即可让所有用户共享同一份数据。
window.TFJL_ALLIANCE_DB_GIST_ID = '';

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
