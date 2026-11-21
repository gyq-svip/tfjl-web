/**
 * 聊天消息 & 需求墙整理脚本
 * 功能：
 *   1. 遍历所有房间，对消息(messages)和求购需求(buyRequests)进行去重、按时间排序
 *   2. 整理独立的 messages Gist（需求墙消息 + 拍卖快讯）
 *   3. 清理过期的求购需求（超过7天）
 *
 * 运行环境：GitHub Actions (Node.js 18)
 * 触发方式：每20分钟定时触发，或手动触发
 *
 * 环境变量：
 *   GIST_TOKEN    - GitHub Token（从仓库Secret读取）
 *   GIST_INDEX_ID - 房间索引文件的Gist ID
 */

const https = require('https');

const TOKEN = process.env.GIST_TOKEN;
const INDEX_GIST_ID = process.env.GIST_INDEX_ID || 'a32a0628bd9275f3a4922cd12cf298c9';
const API_BASE = 'api.github.com';

// 并行处理的房间数（同时整理多个房间，加快速度）
const CONCURRENCY = 5;
// 单个房间超时时间（毫秒）
const ROOM_TIMEOUT = 10000;
// 消息保留上限
const MAX_MESSAGES = 200;
// 求购需求保留上限
const MAX_BUY_REQUESTS = 100;
// 求购需求过期时间（7天，毫秒）
const BUY_REQUEST_EXPIRE = 7 * 24 * 60 * 60 * 1000;
// 拍卖快讯保留上限
const MAX_BROADCASTS = 200;

if (!TOKEN) {
    console.error('❌ GIST_TOKEN 未配置');
    process.exit(0);
}

// ============ GitHub API 封装 ============

function apiRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_BASE,
            path: path,
            method: method,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${TOKEN}`,
                'User-Agent': 'tfjl-message-sorter'
            }
        };

        if (body) {
            const data = JSON.stringify(body);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let parsed;
                try {
                    parsed = raw ? JSON.parse(raw) : null;
                } catch (e) {
                    parsed = raw;
                }
                resolve({ status: res.statusCode, headers: res.headers, data: parsed });
            });
        });

        req.on('error', reject);
        req.setTimeout(ROOM_TIMEOUT, () => {
            req.destroy(new Error('请求超时'));
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function getGist(gistId) {
    return apiRequest('GET', `/gists/${gistId}`);
}

async function patchGist(gistId, files) {
    return apiRequest('PATCH', `/gists/${gistId}`, { files });
}

// ============ 核心整理逻辑 ============

/**
 * 从索引文件获取所有房间和消息Gist
 * 索引结构: { allowedRooms: [...], usedNicks: [...], [roomId]: gistId, messages: gistId }
 */
async function getIndexData() {
    console.log('📋 读取房间索引...');
    const resp = await getGist(INDEX_GIST_ID);

    if (resp.status !== 200) {
        throw new Error(`读取索引失败: ${resp.status}`);
    }

    const indexContent = resp.data?.files?.['room_index.json']?.content;
    if (!indexContent) {
        throw new Error('索引文件不存在或为空');
    }

    const index = JSON.parse(indexContent);
    const rooms = [];

    // 从 allowedRooms 提取房间ID
    const allowedRooms = index.allowedRooms || [];
    for (const r of allowedRooms) {
        const roomId = typeof r === 'string' ? r : r.id;
        if (roomId && roomId !== 'news' && index[roomId]) {
            rooms.push({ roomId, gistId: index[roomId] });
        }
    }

    // 从索引的其他键提取房间（兼容旧格式）
    Object.keys(index).forEach(key => {
        if (key === 'allowedRooms' || key === 'usedNicks' || key === 'news' || key === 'messages') return;
        // 如果值看起来像gistId（长字符串）
        if (typeof index[key] === 'string' && index[key].length > 10) {
            if (!rooms.find(r => r.roomId === key)) {
                rooms.push({ roomId: key, gistId: index[key] });
            }
        }
    });

    // 消息Gist（需求墙消息 + 拍卖快讯）
    const messagesGistId = index['messages'] || null;

    console.log(`✅ 发现 ${rooms.length} 个房间${messagesGistId ? '，消息Gist: ' + messagesGistId.substring(0, 8) + '...' : ''}`);
    return { rooms, messagesGistId };
}

/**
 * 整理数组：去重 + 按时间排序 + 限制数量
 * @param {Array} arr - 原始数组
 * @param {string} idField - 去重用的字段（默认 'id'）
 * @param {string} timeField - 排序用的时间字段（默认 'time'）
 * @param {number} maxLimit - 最大保留数量
 * @returns {Object} { data: 整理后的数组, changed: 是否有变化, removed: 移除数量 }
 */
function sortAndDedup(arr, idField = 'id', timeField = 'time', maxLimit = MAX_MESSAGES) {
    if (!arr || arr.length === 0) {
        return { data: [], changed: false, removed: 0 };
    }

    const beforeCount = arr.length;

    // 1. 去重（按id）
    const seen = new Set();
    const deduped = [];
    for (const item of arr) {
        const id = item[idField] || `${item[timeField] || 0}_${Math.random()}`;
        if (!seen.has(id)) {
            seen.add(id);
            deduped.push(item);
        }
    }

    // 2. 按时间排序（升序，旧的在前）
    deduped.sort((a, b) => (a[timeField] || 0) - (b[timeField] || 0));

    // 3. 限制数量（保留最新的N条）
    const trimmed = deduped.length > maxLimit
        ? deduped.slice(-maxLimit)
        : deduped;

    // 4. 检查是否有变化
    let changed = false;
    if (trimmed.length !== beforeCount) {
        changed = true;
    } else {
        for (let i = 0; i < trimmed.length; i++) {
            if (trimmed[i][idField] !== arr[i][idField]) {
                changed = true;
                break;
            }
        }
    }

    return {
        data: trimmed,
        changed,
        removed: beforeCount - trimmed.length
    };
}

/**
 * 整理单个房间
 * 1. 消息去重排序
 * 2. 求购需求去重排序 + 清理过期
 */
async function sortRoomMessages(room) {
    const { roomId, gistId } = room;
    const filename = `chatrooms_${roomId}.json`;
    const startTime = Date.now();

    try {
        const resp = await getGist(gistId);
        if (resp.status !== 200) {
            console.log(`  ⚠️ [${roomId}] 获取失败: ${resp.status}`);
            return { roomId, status: 'skip', reason: `获取失败${resp.status}` };
        }

        const content = resp.data?.files?.[filename]?.content;
        if (!content) {
            console.log(`  ⚠️ [${roomId}] 文件不存在: ${filename}`);
            return { roomId, status: 'skip', reason: '文件不存在' };
        }

        const roomData = JSON.parse(content);
        const roomObj = roomData?.rooms?.[roomId];
        if (!roomObj) {
            console.log(`  ⚠️ [${roomId}] 房间数据结构异常`);
            return { roomId, status: 'skip', reason: '结构异常' };
        }

        let changed = false;
        let totalRemoved = 0;
        const stats = { messages: 0, buyRequests: 0 };

        // 1. 整理消息
        if (roomObj.messages && roomObj.messages.length > 0) {
            const result = sortAndDedup(roomObj.messages, 'id', 'time', MAX_MESSAGES);
            if (result.changed) {
                roomObj.messages = result.data;
                changed = true;
                totalRemoved += result.removed;
            }
            stats.messages = result.data.length;
        }

        // 2. 整理求购需求（去重 + 排序 + 清理过期）
        if (roomObj.buyRequests && roomObj.buyRequests.length > 0) {
            const beforeCount = roomObj.buyRequests.length;
            const now = Date.now();

            // 先清理过期的求购需求（超过7天且状态不是active）
            let filtered = roomObj.buyRequests.filter(r => {
                const expireTime = r.expireTime || (r.createTime + BUY_REQUEST_EXPIRE);
                return expireTime > now || r.status === 'active';
            });

            // 去重 + 排序
            const result = sortAndDedup(filtered, 'id', 'createTime', MAX_BUY_REQUESTS);
            if (result.changed || filtered.length !== beforeCount) {
                roomObj.buyRequests = result.data;
                changed = true;
                totalRemoved += (beforeCount - result.data.length);
            }
            stats.buyRequests = result.data.length;
        }

        if (!changed) {
            const elapsed = Date.now() - startTime;
            console.log(`  ✅ [${roomId}] 无需整理 (消息${stats.messages}条/求购${stats.buyRequests}条, ${elapsed}ms)`);
            return { roomId, status: 'ok', reason: '无需整理', stats };
        }

        // 3. 写回
        const patchResp = await patchGist(gistId, {
            [filename]: {
                content: JSON.stringify(roomData, null, 2)
            }
        });

        if (patchResp.status !== 200) {
            console.log(`  ❌ [${roomId}] 写回失败: ${patchResp.status}`);
            return { roomId, status: 'fail', reason: `写回失败${patchResp.status}` };
        }

        const elapsed = Date.now() - startTime;
        console.log(`  ✅ [${roomId}] 整理完成: 消息${stats.messages}条/求购${stats.buyRequests}条 (清理${totalRemoved}条, ${elapsed}ms)`);
        return { roomId, status: 'ok', stats, removed: totalRemoved };

    } catch (e) {
        console.log(`  ❌ [${roomId}] 异常: ${e.message}`);
        return { roomId, status: 'fail', reason: e.message };
    }
}

/**
 * 整理独立的 messages Gist
 * 1. messages.json（需求墙消息）
 * 2. auction_broadcasts.json（拍卖快讯）
 */
async function sortMessagesGist(messagesGistId) {
    if (!messagesGistId) {
        console.log('  ℹ️ 无消息Gist，跳过');
        return { status: 'skip', reason: '无消息Gist' };
    }

    const startTime = Date.now();

    try {
        const resp = await getGist(messagesGistId);
        if (resp.status !== 200) {
            console.log(`  ⚠️ 消息Gist获取失败: ${resp.status}`);
            return { status: 'skip', reason: `获取失败${resp.status}` };
        }

        const files = resp.data?.files;
        if (!files) {
            console.log(`  ⚠️ 消息Gist无文件`);
            return { status: 'skip', reason: '无文件' };
        }

        const patchFiles = {};
        let changed = false;
        let totalRemoved = 0;
        const stats = {};

        // 1. 整理 messages.json（需求墙消息）
        if (files['messages.json']?.content) {
            try {
                const msgData = JSON.parse(files['messages.json'].content);
                if (msgData.messages && Array.isArray(msgData.messages)) {
                    const result = sortAndDedup(msgData.messages, 'id', 'time', MAX_MESSAGES);
                    if (result.changed) {
                        msgData.messages = result.data;
                        patchFiles['messages.json'] = {
                            content: JSON.stringify(msgData, null, 2)
                        };
                        changed = true;
                        totalRemoved += result.removed;
                    }
                    stats.messages = result.data.length;
                }
            } catch (e) {
                console.log(`  ⚠️ messages.json 解析失败: ${e.message}`);
            }
        }

        // 2. 整理 auction_broadcasts.json（拍卖快讯）
        if (files['auction_broadcasts.json']?.content) {
            try {
                const broadcasts = JSON.parse(files['auction_broadcasts.json'].content);
                if (Array.isArray(broadcasts)) {
                    const result = sortAndDedup(broadcasts, 'id', 'addedAt', MAX_BROADCASTS);
                    if (result.changed) {
                        patchFiles['auction_broadcasts.json'] = {
                            content: JSON.stringify(result.data, null, 2)
                        };
                        changed = true;
                        totalRemoved += result.removed;
                    }
                    stats.broadcasts = result.data.length;
                }
            } catch (e) {
                console.log(`  ⚠️ auction_broadcasts.json 解析失败: ${e.message}`);
            }
        }

        if (!changed) {
            const elapsed = Date.now() - startTime;
            console.log(`  ✅ [消息Gist] 无需整理 (消息${stats.messages || 0}条/快讯${stats.broadcasts || 0}条, ${elapsed}ms)`);
            return { status: 'ok', reason: '无需整理', stats };
        }

        // 写回
        const patchResp = await patchGist(messagesGistId, patchFiles);
        if (patchResp.status !== 200) {
            console.log(`  ❌ [消息Gist] 写回失败: ${patchResp.status}`);
            return { status: 'fail', reason: `写回失败${patchResp.status}` };
        }

        const elapsed = Date.now() - startTime;
        console.log(`  ✅ [消息Gist] 整理完成: 消息${stats.messages || 0}条/快讯${stats.broadcasts || 0}条 (清理${totalRemoved}条, ${elapsed}ms)`);
        return { status: 'ok', stats, removed: totalRemoved };

    } catch (e) {
        console.log(`  ❌ [消息Gist] 异常: ${e.message}`);
        return { status: 'fail', reason: e.message };
    }
}

/**
 * 并行处理房间（控制并发数）
 */
async function processRoomsWithConcurrency(rooms) {
    const results = [];
    const queue = [...rooms];

    async function worker() {
        while (queue.length > 0) {
            const room = queue.shift();
            if (!room) break;
            const result = await sortRoomMessages(room);
            results.push(result);
        }
    }

    // 启动 CONCURRENCY 个 worker
    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, rooms.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

// ============ 主流程 ============

async function main() {
    console.log('🚀 开始整理聊天消息 & 需求墙');
    console.log(`⏰ 时间: ${new Date().toISOString()}`);
    console.log(`📋 索引Gist: ${INDEX_GIST_ID}`);
    console.log('');

    try {
        // 1. 获取所有房间和消息Gist
        const { rooms, messagesGistId } = await getIndexData();
        if (rooms.length === 0 && !messagesGistId) {
            console.log('ℹ️ 没有数据需要整理');
            return;
        }

        console.log('');
        console.log('📝 开始整理各房间数据...');
        console.log(`   并发数: ${CONCURRENCY}`);
        console.log('');

        // 2. 并行整理所有房间
        const roomResults = rooms.length > 0
            ? await processRoomsWithConcurrency(rooms)
            : [];

        // 3. 整理消息Gist（需求墙消息 + 拍卖快讯）
        console.log('');
        console.log('📝 整理消息Gist（需求墙消息 + 拍卖快讯）...');
        const msgResult = messagesGistId
            ? await sortMessagesGist(messagesGistId)
            : { status: 'skip', reason: '无消息Gist' };

        // 4. 输出统计
        console.log('');
        console.log('📊 执行统计:');
        console.log('=========================================');

        const success = roomResults.filter(r => r.status === 'ok');
        const skipped = roomResults.filter(r => r.status === 'skip');
        const failed = roomResults.filter(r => r.status === 'fail');

        console.log(`✅ 房间成功: ${success.length} 个`);
        console.log(`ℹ️ 房间跳过: ${skipped.length} 个`);
        console.log(`❌ 房间失败: ${failed.length} 个`);
        console.log(`📦 消息Gist: ${msgResult.status}`);

        if (failed.length > 0) {
            console.log('');
            console.log('失败详情:');
            failed.forEach(f => {
                console.log(`  - ${f.roomId}: ${f.reason}`);
            });
        }

        const totalRemoved = success.reduce((sum, r) => sum + (r.removed || 0), 0)
                          + (msgResult.removed || 0);
        if (totalRemoved > 0) {
            console.log('');
            console.log(`🗑️  共清理重复/过期数据: ${totalRemoved} 条`);
        }

        console.log('=========================================');
        console.log(`✨ 整理完成，耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}秒`);

    } catch (e) {
        console.error('❌ 整理失败:', e.message);
        process.exit(1);
    }
}

const startTime = Date.now();
main().catch(e => {
    console.error('❌ 未捕获异常:', e);
    process.exit(1);
});
