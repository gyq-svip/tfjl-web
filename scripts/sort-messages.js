/**
 * 聊天消息整理脚本
 * 功能：遍历所有房间，对消息进行去重、按时间排序，防止并发写入导致的数据混乱
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
 * 从索引文件获取所有房间
 * 索引结构: { allowedRooms: [...], usedNicks: [...], [roomId]: gistId, ... }
 */
async function getAllRooms() {
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

    console.log(`✅ 发现 ${rooms.length} 个房间`);
    return rooms;
}

/**
 * 整理单个房间的消息
 * 1. 去重（按消息id）
 * 2. 按时间排序
 * 3. 限制数量
 * 4. 有变化才写回
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

        const messages = roomObj.messages || [];
        if (messages.length === 0) {
            console.log(`  ℹ️ [${roomId}] 无消息，跳过`);
            return { roomId, status: 'skip', reason: '无消息' };
        }

        // 记录整理前状态
        const beforeCount = messages.length;

        // 1. 去重（按id）
        const seen = new Set();
        const deduped = [];
        for (const msg of messages) {
            const id = msg.id || `msg_${msg.time}_${msg.author}_${Math.random()}`;
            if (!seen.has(id)) {
                seen.add(id);
                deduped.push(msg);
            }
        }

        // 2. 按时间排序（升序，旧的在前）
        deduped.sort((a, b) => (a.time || 0) - (b.time || 0));

        // 3. 限制数量（保留最新的200条）
        const trimmed = deduped.length > MAX_MESSAGES
            ? deduped.slice(-MAX_MESSAGES)
            : deduped;

        // 4. 检查是否有变化
        let changed = false;
        if (trimmed.length !== beforeCount) {
            changed = true;
        } else {
            // 对比顺序和内容
            for (let i = 0; i < trimmed.length; i++) {
                if (trimmed[i].id !== messages[i].id) {
                    changed = true;
                    break;
                }
            }
        }

        if (!changed) {
            const elapsed = Date.now() - startTime;
            console.log(`  ✅ [${roomId}] 无需整理 (${beforeCount}条, ${elapsed}ms)`);
            return { roomId, status: 'ok', reason: '无需整理', count: beforeCount };
        }

        // 5. 写回
        roomObj.messages = trimmed;
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
        const removed = beforeCount - trimmed.length;
        console.log(`  ✅ [${roomId}] 整理完成: ${beforeCount} → ${trimmed.length}条 (去重/裁剪${removed}条, ${elapsed}ms)`);
        return { roomId, status: 'ok', count: trimmed.length, removed };

    } catch (e) {
        console.log(`  ❌ [${roomId}] 异常: ${e.message}`);
        return { roomId, status: 'fail', reason: e.message };
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
    console.log('🚀 开始整理聊天消息');
    console.log(`⏰ 时间: ${new Date().toISOString()}`);
    console.log(`📋 索引Gist: ${INDEX_GIST_ID}`);
    console.log('');

    try {
        // 1. 获取所有房间
        const rooms = await getAllRooms();
        if (rooms.length === 0) {
            console.log('ℹ️ 没有房间需要整理');
            return;
        }

        console.log('');
        console.log('📝 开始整理各房间消息...');
        console.log(`   并发数: ${CONCURRENCY}`);
        console.log('');

        // 2. 并行整理所有房间
        const results = await processRoomsWithConcurrency(rooms);

        // 3. 输出统计
        console.log('');
        console.log('📊 执行统计:');
        console.log('=========================================');

        const success = results.filter(r => r.status === 'ok');
        const skipped = results.filter(r => r.status === 'skip');
        const failed = results.filter(r => r.status === 'fail');

        console.log(`✅ 成功: ${success.length} 个房间`);
        console.log(`ℹ️ 跳过: ${skipped.length} 个房间`);
        console.log(`❌ 失败: ${failed.length} 个房间`);

        if (failed.length > 0) {
            console.log('');
            console.log('失败详情:');
            failed.forEach(f => {
                console.log(`  - ${f.roomId}: ${f.reason}`);
            });
        }

        const totalRemoved = success.reduce((sum, r) => sum + (r.removed || 0), 0);
        if (totalRemoved > 0) {
            console.log('');
            console.log(`🗑️  共清理重复/过期消息: ${totalRemoved} 条`);
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
