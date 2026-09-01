use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use std::fs;
use std::net::{TcpListener, TcpStream};
use std::io::{Read, Write};
use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};

// ==================== 应用级状态 ====================
// 记录「本助手自己拉起」的 Umi-OCR 进程 PID，App 退出时一并关闭，避免残留后台。
// 不记录用户手动打开的 Umi-OCR，退出时只杀我们拉起的那一个。
// ==================== 托盘常驻心跳（修复最小化到托盘后 WebView 冻结、心跳死掉） ====================
// WebView 窗口被隐藏（window.hide）后，Chromium 会把页面冻结，setInterval 定时器不再触发，
// 导致 30 分钟一次的心跳停发、超过超时后被判离线。Rust 进程不休眠，故用独立线程定时直接写 Gist，
// 与窗口是否可见无关，根治“挂机最小化后心跳死掉”。
#[derive(Clone)]
struct HeartbeatCtx {
    device_id: String,
    nick: String,
    token: String,
    counter_gist_id: String,
    // UTC→本地的分钟偏移（中国 +480），用于"每自然天第一次心跳打卡"判断 0 点换天。
    // JS 传 getTimezoneOffset()（符号相反，中国 -480）；旧版前端不传则按 +8 小时兜底。
    tz_offset_min: i64,
}

struct AppState {
    umi_pid: std::sync::Mutex<Option<u32>>,
    heartbeat: std::sync::Mutex<Option<HeartbeatCtx>>,
    // 已打卡的自然天索引（内存标志：同一天内不再碰登录 Gist；天级真正去重看 Gist 内容）
    checkin_day: std::sync::Mutex<Option<u64>>,
}

// 前端启动（或设置 token）时把心跳所需身份注册给 Rust；Rust 线程据此独立保活。
#[tauri::command]
fn register_heartbeat(
    device_id: String,
    nick: String,
    token: String,
    counter_gist_id: String,
    tz_offset_min: Option<i32>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    // JS getTimezoneOffset() 返回"本地落后 UTC 多少分钟"（UTC+8 为 -480），取反即 UTC→本地
    let tz = tz_offset_min.map(|v| -(v as i64)).unwrap_or(480);
    let mut hb = state.heartbeat.lock().unwrap();
    *hb = Some(HeartbeatCtx { device_id, nick, token, counter_gist_id, tz_offset_min: tz });
    println!("[heartbeat] registered device={} gist={} tz=+{}min", hb.as_ref().unwrap().device_id, hb.as_ref().unwrap().counter_gist_id, tz);
    Ok(())
}

// 只更新 counter Gist 中「本设备」的 online_users 条目，保留其它字段/其它设备，避免覆盖丢数据。
async fn do_gist_heartbeat(ctx: &HeartbeatCtx) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("client build: {}", e))?;
    let url = format!("https://api.github.com/gists/{}", ctx.counter_gist_id);
    let auth = format!("token {}", ctx.token);

    // —— GET 当前 counter.json ——
    let get_resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .header(reqwest::header::USER_AGENT, "TFJL-App-Heartbeat/1.0")
        .header(reqwest::header::AUTHORIZATION, &auth)
        .send()
        .await
        .map_err(|e| format!("GET: {}", e))?;
    let get_status = get_resp.status();
    if !get_status.is_success() {
        // 403 多为限流：本次心跳跳过，下个 tick 再试（不刷 error 日志，避免限流期间刷屏）
        if get_status.as_u16() == 403 {
            return Ok(());
        }
        return Err(format!("GET status {}", get_status));
    }
    let gist: serde_json::Value = get_resp.json().await.map_err(|e| format!("GET json: {}", e))?;
    let content = gist
        .get("files")
        .and_then(|f| f.get("counter.json"))
        .and_then(|c| c.get("content"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "counter.json not found in gist".to_string())?;

    let mut counter: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("parse counter: {}", e))?;
    if !counter.is_object() {
        counter = serde_json::json!({});
    }
    // 确保 online_users 对象存在
    if counter.get("online_users").is_none() || !counter["online_users"].is_object() {
        counter["online_users"] = serde_json::json!({});
    }
    let online = counter["online_users"].as_object_mut().unwrap();

    // 保留已有 nick（首次则由注册时传入的 nick 兜底），避免覆盖 JS 写的正确昵称
    let existing_nick = online
        .get(&ctx.device_id)
        .and_then(|v| v.get("nick"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let nick = if existing_nick.as_deref().map(|n| n.is_empty()).unwrap_or(true) {
        ctx.nick.clone()
    } else {
        existing_nick.unwrap()
    };

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    online.insert(
        ctx.device_id.clone(),
        serde_json::json!({ "t": now_ms, "nick": nick, "src": "app", "bg": 1 }),
    );

    let new_content = serde_json::to_string(&counter).map_err(|e| format!("serialize: {}", e))?;
    let patch_body = serde_json::json!({ "files": { "counter.json": { "content": new_content } } });

    // —— PATCH 回去（只列 counter.json，其它 gist 文件不受影响）——
    let patch_resp = client
        .patch(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .header(reqwest::header::USER_AGENT, "TFJL-App-Heartbeat/1.0")
        .header(reqwest::header::AUTHORIZATION, &auth)
        .json(&patch_body)
        .send()
        .await
        .map_err(|e| format!("PATCH: {}", e))?;
    let patch_status = patch_resp.status();
    if !patch_status.is_success() {
        // 403 多为限流：本次心跳跳过，下个 tick 再试（不刷 error 日志）
        if patch_status.as_u16() == 403 {
            return Ok(());
        }
        return Err(format!("PATCH status {}", patch_status));
    }
    Ok(())
}

// ==================== 托盘挂机每日打卡 ====================
// 背景：登录打卡只在前端页面加载时触发（recordLoginEvent），窗口最小化到托盘后 WebView 冻结、
// 页面不重新加载 → 常驻托盘的设备（如挂机的 P3）永远不打卡。这里让 Rust 心跳线程在
// 每自然天第一次心跳时往登录打卡汇总 Gist 记一笔，与 app-core.js 的 LOGIN_GIST_ID/LOGIN_GIST_FILENAME 一致。
const LOGIN_GIST_ID: &str = "51e7030023fa57de40aaf59bc48e9969";
const LOGIN_GIST_FILE: &str = "login-log.json";

// ⚠️ 管理员指令 Gist（纯键值对，几 KB，专用于定向下发指令）。由管理员手工创建维护。
//    创建后把 ID 填到这里即可生效（须与前端 admin-ctl.js 的 ADMIN_CTL_GIST_ID 保持一致）。
const ADMIN_CTL_GIST_ID: &str = "a45529be1fcb5f32a96dc49feaa422a0";
const ADMIN_CTL_FILE: &str = "admin_ctl.json";

// 拉取管理员指令 Gist，发现针对本设备的指令则：① 唤起被最小化的窗口 ② emit 给前端处理。
// 这样即使 APP 在系统托盘后台，用户也能看到飘窗通知/拉黑遮罩（Rust 直接 show 窗口）。
async fn do_admin_ctl_check(app: &tauri::AppHandle, ctx: &HeartbeatCtx) -> Result<(), String> {
    if ADMIN_CTL_GIST_ID.starts_with("REPLACE_") { return Ok(()); }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("client build: {}", e))?;
    let url = format!("https://api.github.com/gists/{}", ADMIN_CTL_GIST_ID);
    let auth = format!("token {}", ctx.token);
    let resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .header(reqwest::header::USER_AGENT, "TFJL-App-Heartbeat/1.0")
        .header(reqwest::header::AUTHORIZATION, &auth)
        .send()
        .await
        .map_err(|e| format!("GET admin_ctl: {}", e))?;
    if !resp.status().is_success() { return Err(format!("GET admin_ctl status {}", resp.status())); }
    let gist: serde_json::Value = resp.json().await.map_err(|e| format!("GET json: {}", e))?;
    let content = gist
        .get("files").and_then(|f| f.get(ADMIN_CTL_FILE))
        .and_then(|f| f.get("content")).and_then(|c| c.as_str())
        .ok_or_else(|| "admin_ctl.json not found".to_string())?;
    let ctl: serde_json::Value = serde_json::from_str(content).map_err(|e| format!("parse admin_ctl: {}", e))?;
    // 本设备是否命中（强制刷新 / 指令 / 拉黑 / 远程重启）
    let dev = &ctx.device_id;
    let has_cmd = ctl.get("cmds").and_then(|c| c.get(dev)).map(|v| v.is_array() && !v.as_array().unwrap().is_empty()).unwrap_or(false);
    let has_black = ctl.get("blacklist").and_then(|b| b.get(dev)).is_some();
    let force = ctl.get("forceReload").and_then(|f| f.get("to")).and_then(|t| t.as_str())
        .map(|t| t == "all" || t == dev).unwrap_or(false);
    let latest_ver = ctl.get("latestSwVersion").and_then(|v| v.as_str()).unwrap_or("");
    // 远程重启（救活假死设备）：本设备命中 restart 指令 → Rust 直接 restart（进程级，能绕过 JS 假死）
    let restart = ctl.get("restart").and_then(|r| r.get("to")).and_then(|t| t.as_str())
        .map(|t| t == "all" || t == dev).unwrap_or(false);
    if restart {
        println!("[adminCtl] 收到重启指令 dev={}，即将 restart()", dev);
        // 延迟 1s 让日志/emit 先出去，再重启（restart 是 ! 类型，成功则进程退出并重拉，假死也能救）
        std::thread::sleep(std::time::Duration::from_secs(1));
        app.restart();
    }
    if has_cmd || has_black || force || !latest_ver.is_empty() {
        // ① 唤起窗口（从托盘/最小化弹出），保证用户看得到
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        // ② emit 给前端（window.__adminCtlApply 会处理）
        let _ = app.emit("admin-ctl", ctl.clone());
        println!("[adminCtl] 命中本设备指令 dev={} cmd={} black={} force={} ver={}", dev, has_cmd, has_black, force, latest_ver);
    }
    Ok(())
}

// 本地自然天索引（本地 0 点换天）：offset_min 为 UTC→本地分钟偏移
fn local_day_index(unix_ms: u64, offset_min: i64) -> u64 {
    ((unix_ms as i64 + offset_min * 60_000).max(0) as u64) / 86_400_000
}

// 往登录打卡汇总 Gist 记一笔 {nick, ts}；今天已打过（Gist 里最后一条同昵称记录在今天）则跳过。
// 返回 Ok(true)=本次写入，Ok(false)=今天已打过；Err=网络/接口失败（下个心跳 tick 重试）。
async fn do_daily_checkin(ctx: &HeartbeatCtx, today: u64) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("client build: {}", e))?;
    let url = format!("https://api.github.com/gists/{}", LOGIN_GIST_ID);
    let auth = format!("token {}", ctx.token);

    let get_resp = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .header(reqwest::header::USER_AGENT, "TFJL-App-Heartbeat/1.0")
        .header(reqwest::header::AUTHORIZATION, &auth)
        .send()
        .await
        .map_err(|e| format!("GET: {}", e))?;
    if !get_resp.status().is_success() {
        return Err(format!("GET status {}", get_resp.status()));
    }
    let gist: serde_json::Value = get_resp.json().await.map_err(|e| format!("GET json: {}", e))?;
    let content = gist
        .get("files")
        .and_then(|f| f.get(LOGIN_GIST_FILE))
        .and_then(|c| c.get("content"))
        .and_then(|v| v.as_str())
        .unwrap_or("[]");

    let mut arr: serde_json::Value = serde_json::from_str(content).unwrap_or_else(|_| serde_json::json!([]));
    if !arr.is_array() {
        arr = serde_json::json!([]);
    }

    // 天级去重看 Gist 内容：最后一条同昵称记录若已落在今天（本地时区），本设备今天不再记
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    if let Some(items) = arr.as_array() {
        for entry in items.iter().rev() {
            let n = entry.get("nick").and_then(|v| v.as_str()).unwrap_or("");
            let ts = entry.get("ts").and_then(|v| v.as_u64()).unwrap_or(0);
            if n == ctx.nick && ts > 0 && local_day_index(ts, ctx.tz_offset_min) == today {
                return Ok(false);
            }
        }
    }

    if let Some(items) = arr.as_array_mut() {
        items.push(serde_json::json!({ "nick": ctx.nick, "ts": now_ms }));
        // 与前端 pushLoginEventToGist 相同上限，防无限增长
        while items.len() > 20000 {
            items.remove(0);
        }
    }
    let new_content = serde_json::to_string(&arr).map_err(|e| format!("serialize: {}", e))?;
    let patch_body = serde_json::json!({ "files": { LOGIN_GIST_FILE: { "content": new_content } } });
    let patch_resp = client
        .patch(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .header(reqwest::header::USER_AGENT, "TFJL-App-Heartbeat/1.0")
        .header(reqwest::header::AUTHORIZATION, &auth)
        .json(&patch_body)
        .send()
        .await
        .map_err(|e| format!("PATCH: {}", e))?;
    if !patch_resp.status().is_success() {
        return Err(format!("PATCH status {}", patch_resp.status()));
    }
    println!("[heartbeat] daily checkin written nick={} day={}", ctx.nick, today);
    Ok(true)
}

// 托盘图标闪动（需求墙新未读提醒）：保存托盘句柄 + 闪动开关 + 是否已启动闪动任务
static TRAY: OnceLock<TrayIcon> = OnceLock::new();
static FLASH_ON: AtomicBool = AtomicBool::new(false);

// 波数监控（Rust 后台线程）运行开关 + 世代计数：
// 世代计数用于「重启监控」——旧线程不必被强杀，发现世代不匹配即自然退出，避免双线程同时播报。
static GM_RUN: AtomicBool = AtomicBool::new(false);
static GM_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
// 托盘右键「暂停/恢复播报」全局静音开关（只停 TTS，监控/自动点击照常跑）
static GM_MUTE: AtomicBool = AtomicBool::new(false);

/// 退出时关闭本助手拉起的 Umi-OCR 进程树（/t 同时杀掉其 Paddle 引擎等子进程）
#[allow(unused_variables)]
fn kill_umi_ocr(pid: Option<u32>) {
    if let Some(pid) = pid {
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            if let Ok(child) = std::process::Command::new("taskkill")
                .args(["/pid", &pid.to_string(), "/f", "/t"])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .spawn()
            {
                std::mem::forget(child); // 不阻塞退出线程，taskkill 后台清理进程树
            }
        }
    }
}

// ==================== Tauri 命令 ====================
// 命令名就是函数名本身（snake_case），JS端用相同名字调用

/// 打开目录选择对话框
#[tauri::command]
async fn open_directory_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let _ = app.dialog()
        .file()
        .set_title("选择目录")
        .pick_folder(move |folder_path| {
            let result = folder_path.map(|f| f.to_string());
            let _ = tx.send(result);
        });
    let result = rx.await.map_err(|e| e.to_string())?;
    Ok(result)
}

/// 读取目录下的所有文件
#[tauri::command]
fn read_directory(dir_path: String) -> Result<Vec<FileInfo>, String> {
    let entries = fs::read_dir(&dir_path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_file = path.is_file();
        let path_str = path.to_string_lossy().to_string();
        let modified = entry.metadata()
            .map(|m| m.modified())
            .ok()
            .and_then(|r| r.ok())
            .map(|t| {
                // 格式化为 ISO 8601 日期字符串（如 "2026-07-23"）
                let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                let secs = duration.as_secs();
                let days = secs / 86400;
                // 从 Unix epoch 计算年月日
                let (y, m, d) = civil_from_days(days as i64 + 719468);
                format!("{:04}-{:02}-{:02}", y, m, d)
            })
            .unwrap_or_default();
        files.push(FileInfo { name, path: path_str, is_file, modified });
    }
    Ok(files)
}

/// 读取文本文件（多编码自动检测 + 逐层回退，一劳永逸）
/// 命令名 `read_text_file_auto`，避免与 tauri_plugin_fs 的 read_text_file 冲突
#[tauri::command]
fn read_text_file_auto(file_path: String) -> Result<String, String> {
    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;

    if bytes.is_empty() {
        return Ok(String::new());
    }

    // ① BOM 检测
    // UTF-8 BOM: EF BB BF
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        return String::from_utf8(bytes[3..].to_vec())
            .map_err(|_| "UTF-8 BOM 解码失败".into());
    }
    // UTF-16 LE BOM: FF FE
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16_data: Vec<u16> = bytes[2..]
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16_data)
            .map_err(|_| "UTF-16 LE BOM 解码失败".into());
    }
    // UTF-16 BE BOM: FE FF
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let u16_data: Vec<u16> = bytes[2..]
            .chunks(2)
            .filter(|c| c.len() == 2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16_data)
            .map_err(|_| "UTF-16 BE BOM 解码失败".into());
    }

    // ② 尝试 UTF-8（覆盖无 BOM 的 UTF-8 / ASCII）
    if let Ok(content) = String::from_utf8(bytes.clone()) {
        return Ok(content);
    }

    // ③ 尝试 GB18030（覆盖 GBK / GB2312 / ANSI 简体中文）
    {
        let (decoded, _, had_errors) = encoding_rs::GB18030.decode(&bytes);
        if !had_errors {
            return Ok(decoded.into_owned());
        }
        // 有替换字符不算致命，仍可用，但先记下给后续编码一次机会
    }

    // ④ 尝试 BIG5（繁中，覆盖台湾/香港常见编码）
    {
        let (decoded, _, had_errors) = encoding_rs::BIG5.decode(&bytes);
        if !had_errors {
            return Ok(decoded.into_owned());
        }
    }

    // ⑤ 最终兜底：GB18030 lossy（中文环境首选）+ 若结果纯乱码则回退 UTF-8 lossy
    let (decoded, _, _) = encoding_rs::GB18030.decode(&bytes);
    let gbk_result = decoded.into_owned();
    // 如果 GB18030 lossy 结果中出现了中文字符或常见英文，说明解出了有效内容
    let has_meaningful = gbk_result.chars().any(|c| {
        c.is_ascii_alphanumeric() || c.is_ascii_punctuation()
            || ('\u{4e00}'..='\u{9fff}').contains(&c)         // CJK 统一汉字
            || ('\u{3000}'..='\u{303f}').contains(&c)         // CJK 标点
            || ('\u{ff00}'..='\u{ffef}').contains(&c)         // 全角字符
    });
    if has_meaningful {
        return Ok(gbk_result);
    }

    // 最后：UTF-8 lossy（保底不会 panic）
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// 检测文件编码（用于前端诊断）
#[tauri::command]
fn detect_file_encoding(file_path: String) -> Result<String, String> {
    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;

    if bytes.is_empty() {
        return Ok("empty".into());
    }

    // UTF-8 BOM
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        return Ok("UTF-8 BOM".into());
    }
    // UTF-16 LE BOM
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        return Ok("UTF-16 LE".into());
    }
    // UTF-16 BE BOM
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        return Ok("UTF-16 BE".into());
    }
    // UTF-8 无 BOM
    if String::from_utf8(bytes.clone()).is_ok() {
        return Ok("UTF-8".into());
    }
    // GB18030（覆盖 GBK / GB2312 / ANSI 简体中文）
    {
        let (_, _, had_errors) = encoding_rs::GB18030.decode(&bytes);
        if !had_errors {
            return Ok("GB18030 / GBK / ANSI".into());
        }
    }
    // BIG5（繁体中文）
    {
        let (_, _, had_errors) = encoding_rs::BIG5.decode(&bytes);
        if !had_errors {
            return Ok("BIG5".into());
        }
    }
    // 无法精确识别，返回最常见推测
    Ok("未知（可能为 GBK/ANSI）".into())
}

/// 写入文本文件（自动创建父目录）
#[tauri::command]
fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

/// 追加文本到文件末尾（自动创建父目录）；用于诊断日志落盘，避免每次重写全量内容
#[tauri::command]
fn append_text_file(file_path: String, content: String) -> Result<(), String> {
    use std::io::Write as _;
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

/// 返回诊断日志落盘目录（置于 OS 应用缓存目录内，避免污染软件数据根目录）。
/// Windows: %LOCALAPPDATA%\<app-cache>\tfjl_diag\  ；macOS/Linux: 对应 cache dir 下 tfjl_diag\
#[tauri::command]
fn get_diag_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    // Tauri v2 移除了 tauri::api::path，统一走 app.path()（Manager trait 已在文件顶部导入）
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法获取应用缓存目录: {}", e))?
        .join("tfjl_diag");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// 执行 git 命令（在指定仓库目录），返回 stdout；非零退出码返回 stderr 文本
fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(repo)
        .output()
        .map_err(|e| format!("执行 git 失败: {}", e))?;
    if !out.status.success() {
        return Err(format!("git {:?} 失败: {}", args, String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// push 失败自愈：远端有新提交（CI 自动 bump 等）与本地分叉时 push 被拒，
/// 自动 pull --rebase --autostash 后重推一次，根治「一键推送偶发失败」。
fn push_with_self_heal(repo: &str, push_args: &[&str]) -> Result<String, String> {
    match run_git(repo, push_args) {
        Ok(p) => return Ok(p),
        Err(e1) => {
            // autostash：保护工作区未提交改动，rebase 完自动恢复
            match run_git(repo, &["-c", "rebase.autoStash=true", "pull", "--rebase", "origin", "main"]) {
                Ok(_) => {}
                Err(e2) => {
                    return Err(format!(
                        "push 失败: {}\n自动 rebase 修复失败: {}\n（多为网络/代理问题，稍后重试即可）",
                        e1, e2
                    ));
                }
            }
            match run_git(repo, push_args) {
                Ok(p) => Ok(format!("{}（已自动 rebase 远端新提交后重推成功）", p)),
                Err(e3) => Err(format!("push 失败（已尝试自动 rebase）: {}", e3)),
            }
        }
    }
}

/// 一键推送 skins/fusions.json 到 GitHub（及 Gitee 镜像）
/// 仅桌面端「卡组管理」调用，免去手动命令行。
/// 仓库级 .git/config 已为 github.com 配置代理；gitee 直连（清空代理）。
#[tauri::command]
fn git_push_fusions() -> Result<String, String> {
    let repo = "d:\\tfjl-web";
    let mut log = String::new();
    // 1. 有本地改动时提交（fusions.json + 自动切皮产物 registry.json 与 skins/融合XX/ 一起带上，
    //    免去用户再手动去「皮肤制作」Tab 二次推送）
    let status = run_git(repo, &["status", "--porcelain", "skins/fusions.json", "skins/registry.json", "skins/"])?;
    if !status.trim().is_empty() {
        run_git(repo, &["add", "skins/fusions.json", "skins/registry.json", "skins/"])?;
        run_git(repo, &["commit", "-m", "chore: 卡组管理一键推送 skins/fusions.json"])?;
        log.push_str("✓ 已提交本地改动（含 fusions.json / registry.json / 融合皮肤）。\n");
    } else {
        log.push_str("• 无本地改动，跳过提交。\n");
    }
    // 2. push origin main（失败自动 rebase 远端新提交后重试）
    match push_with_self_heal(repo, &["push", "origin", "main"]) {
        Ok(p1) => { log.push_str("✓ origin/main: "); log.push_str(p1.trim()); log.push('\n'); }
        Err(e) => return Err(format!("push origin/main 失败: {}", e)),
    }
    // 3. push gitee（直连，清空代理；失败自愈后仍失败则跳过，不阻断）
    match push_with_self_heal(repo, &["-c", "http.proxy=", "-c", "https.proxy=", "push", "gitee"]) {
        Ok(p2) => { log.push_str("✓ gitee: "); log.push_str(p2.trim()); log.push('\n'); }
        Err(e) => { log.push_str("• gitee: 跳过（"); log.push_str(&e); log.push_str("）\n"); }
    }
    Ok(log)
}

/// 皮肤制作工具「一键推送」：自动 bump 前端版本号 + 提交 skins/ 改动 + 推双远端
/// 复用 run_git（origin 走仓库默认代理；gitee 直连清空代理）
#[tauri::command]
fn git_push_skins() -> Result<String, String> {
    let repo = "d:\\tfjl-web";
    let mut log = String::new();
    // 1) 🔴 2026-09-01 修复误报「推送失败」：此前用【全仓库】status 判断有无改动，
    //    未跟踪的杂文件（.playwright-cli/ 等本地工具目录）会让 status 非空 →
    //    git add 暂存不到任何东西 → git commit 报 nothing-to-commit 退出码 1 → 整个推送被误报失败
    //    （pre-commit 钩子照跑并全部 PASS，用户看到「全部校验通过」却报失败，非常迷惑）。
    //    改为与 git_push_fusions 同款的【限路径】status，只看真正要提交的 skins/ + 版本文件。
    let status = run_git(repo, &["status", "--porcelain", "--", "skins/", "index.html", "sw.js"])?;
    if !status.trim().is_empty() {
        // 2) bump 前端版本号（versionTag + CACHE_VERSION），便于用户刷新识别
        match bump_skin_versions(repo) {
            Ok(_) => log.push_str("✓ 已自增前端版本号。\n"),
            Err(e) => log.push_str(&format!("• 版本号自增跳过（{}）\n", e)),
        }
        // 3) 暂存 skins/ 及前端版本文件
        run_git(repo, &["add", "skins/", "index.html", "sw.js"])?;
        // 4) 提交：暂存区为空（重复点击/竞态/杂文件干扰）时跳过提交不误报，
        //    用 git diff --cached 探测而非匹配 commit 错误文案（不受 git 输出语言影响）
        let staged = run_git(repo, &["diff", "--cached", "--name-only"])?;
        if staged.trim().is_empty() {
            log.push_str("• 无新改动可提交（可能刚已提交过），直接推送。\n");
        } else {
            run_git(repo, &["commit", "-m", "feat: 皮肤制作一键推送（自动 bump 版本）"])?;
            log.push_str("✓ 已提交本地改动。\n");
        }
    } else {
        log.push_str("• 无本地改动，跳过提交。\n");
    }
    // 5) push origin main（失败自动 rebase 远端新提交后重试）。
    //    无改动也照常推送：处理「已提交但尚未推送」的中间状态（push 幂等，重复无害）
    match push_with_self_heal(repo, &["push", "origin", "main"]) {
        Ok(p1) => { log.push_str("✓ origin/main: "); log.push_str(p1.trim()); log.push('\n'); }
        Err(e) => return Err(format!("push origin/main 失败: {}", e)),
    }
    // 6) push gitee（直连，清空代理；失败自愈后仍失败则跳过，不阻断）
    match push_with_self_heal(repo, &["-c", "http.proxy=", "-c", "https.proxy=", "push", "gitee"]) {
        Ok(p2) => { log.push_str("✓ gitee: "); log.push_str(p2.trim()); log.push('\n'); }
        Err(e) => { log.push_str("• gitee: 跳过（"); log.push_str(&e); log.push_str("）\n"); }
    }
    Ok(log)
}

/// 判断皮肤目录里是否真的存在 .skin 文件（识别"目录被手动删空"的场景）。
/// 只看两层：base/*.skin 与 base/<英雄>/*.skin。
fn has_skin_files(base: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(base) else { return false };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if let Ok(sub) = std::fs::read_dir(&p) {
                for f in sub.flatten() {
                    if f.path().extension().and_then(|x| x.to_str()) == Some("skin") {
                        return true;
                    }
                }
            }
        } else if p.extension().and_then(|x| x.to_str()) == Some("skin") {
            return true;
        }
    }
    false
}

/// 执行 PowerShell 脚本（在指定目录），返回合并后的 stdout+stderr；非零退出码返回错误文本
fn run_ps(repo: &str, script: &str, extra: &[&str]) -> Result<String, String> {
    let mut args: Vec<String> = vec![
        "-NoProfile".into(),
        "-ExecutionPolicy".into(),
        "Bypass".into(),
        "-File".into(),
        script.into(),
    ];
    for e in extra { args.push((*e).into()); }
    let out = Command::new("powershell")
        .args(&args)
        .current_dir(repo)
        .output()
        .map_err(|e| format!("执行 PowerShell 失败: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() {
        return Err(format!("{} 执行失败:\n{}\n{}", script, stdout, stderr));
    }
    Ok(format!("{}{}", stdout, stderr))
}

/// 一键打包皮肤并发布：皮肤包 -> Gitee 发行版（国内快），索引 skins-index.json -> GitHub Pages。
/// 脚本内部保证「上传+校验成功后才更新索引」，任何一步失败都不会让用户断供。
/// token 为空时脚本回退读取用户环境变量 GITEE_TOKEN。
#[tauri::command]
fn publish_skins(token: Option<String>) -> Result<String, String> {
    let repo = "d:\\tfjl-web";
    let tok = token.unwrap_or_default();
    if tok.is_empty() {
        run_ps(repo, "publish_skins.ps1", &[])
    } else {
        run_ps(repo, "publish_skins.ps1", &["-GiteeToken", &tok])
    }
}

/// 自增 index.html 的 versionTag 与 sw.js 的 CACHE_VERSION
fn bump_skin_versions(repo: &str) -> Result<(), String> {
    bump_in_file(&format!("{}\\index.html", repo), "id=\"versionTag\"", ">s", '<')?;
    bump_in_file(&format!("{}\\sw.js", repo), "CACHE_VERSION = 's1.0.", "s1.0.", '\'')?;
    Ok(())
}

/// 在文件中定位 marker，找到 token_prefix 后的数字（或 日期-数字），自增其末位序号。
/// 容忍 token 末尾附加字符（如 versionTag 的 " · sw-vXXX"），只替换数字序号部分。
fn bump_in_file(path: &str, marker: &str, prefix: &str, end_char: char) -> Result<(), String> {
    let mut content = fs::read_to_string(path).map_err(|e| format!("读取失败: {}", e))?;
    let pos = content.find(marker).ok_or("未找到版本标记")?;
    let after = &content[pos..];
    let vpos = after.find(prefix).ok_or("未找到版本前缀")?;
    let start = pos + vpos + prefix.len();
    let rest = &content[start..];
    let end = rest.find(end_char).ok_or("未找到版本结束符")?;
    let token = &rest[..end];
    if let Some(dash) = token.find('-') {
        // 形如 v260804-224 · sw-v341：只取 dash 后前导数字，其余附加字符原样保留
        let tail = &token[dash + 1..];
        let num_str: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
        if num_str.is_empty() { return Err("版本号解析失败".into()); }
        let num = num_str.parse::<u32>().map_err(|_| "版本号解析失败")?;
        let num_start = start + dash + 1;
        let num_end = num_start + num_str.len();
        content.replace_range(num_start..num_end, &(num + 1).to_string());
    } else {
        let num_str: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
        if num_str.is_empty() { return Err("版本号解析失败".into()); }
        let num = num_str.parse::<u32>().map_err(|_| "版本号解析失败")?;
        let num_end = start + num_str.len();
        content.replace_range(start..num_end, &(num + 1).to_string());
    }
    fs::write(path, content).map_err(|e| format!("写回失败: {}", e))?;
    Ok(())
}

/// 系统托盘图标闪动（需求墙新未读提醒）：on=true 启动闪动，on=false 停止
/// 闪动原理：在正常窗口图标与一张同尺寸透明图标之间每 500ms 交替 set_icon，直到 on=false 才恢复
#[tauri::command]
fn flash_tray_icon(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    if on {
        // 仅当从「不闪」切换到「闪」时才派发线程；已在闪则不再重复起线程
        if !FLASH_ON.swap(true, Ordering::SeqCst) {
            // 拥有数据的默认图标：复制图标字节(new_owned)得到 'static Image，不借用 app
            let default: Option<tauri::image::Image> = app.default_window_icon().map(|img| {
                tauri::image::Image::new_owned(img.rgba().to_vec(), img.width(), img.height())
            });
            std::thread::spawn(move || {
                if let Some(tray) = TRAY.get().cloned() {
                    if let Some(def) = default.as_ref() {
                        let (w, h) = (def.width(), def.height());
                        // 暗微光版本：压暗 + 偏蓝，替代原来的「全透明」（消除托盘裂纹伪影）
                        // 闪动 = 亮态(原图标) ↔ 暗态(微光变暗)，形成层次鲜明的呼吸提醒，不再硬切到透明
                        let dim_buf: Vec<u8> = def.rgba().chunks(4).flat_map(|px| {
                            let (r, g, b, a) = (px[0] as f32, px[1] as f32, px[2] as f32, px[3]);
                            let nr = (r * 0.25 + 20.0).min(255.0) as u8;
                            let ng = (g * 0.30 + 35.0).min(255.0) as u8;
                            let nb = (b * 0.45 + 75.0).min(255.0) as u8;
                            [nr, ng, nb, a]
                        }).collect();
                        let dim = tauri::image::Image::new_owned(dim_buf, w, h);
                        let mut show = false;
                        while FLASH_ON.load(Ordering::SeqCst) {
                            let _ = tray.set_icon(if show { Some(def.clone()) } else { Some(dim.clone()) });
                            show = !show;
                            std::thread::sleep(std::time::Duration::from_millis(500));
                        }
                        let _ = tray.set_icon(default.clone());
                    }
                }
            });
        }
    } else {
        FLASH_ON.store(false, Ordering::SeqCst);
    }
    Ok(())
}

/// 写入二进制文件（接受 base64 编码内容，自动创建父目录）
/// 用于把安装包等二进制保存到用户选择的文件夹（更新失败时的手动下载补救）
#[tauri::command]
fn write_binary_file(file_path: String, content_base64: String) -> Result<(), String> {
    let bytes = B64.decode(content_base64.trim()).map_err(|e| format!("base64 解码失败: {}", e))?;
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&file_path, bytes).map_err(|e| e.to_string())
}

/// 删除文件
#[tauri::command]
fn delete_file(file_path: String) -> Result<(), String> {
    fs::remove_file(&file_path).map_err(|e| e.to_string())
}

/// 检查路径是否存在
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// 创建目录
#[tauri::command]
fn create_dir(dir_path: String) -> Result<(), String> {
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

/// 在资源管理器中显示指定文件（选中状态）
/// Windows: explorer /select,"path"
#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("启动 explorer 失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("启动 Finder 失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        // Linux 兜底：用 xdg-open 打开父目录
        let p = Path::new(&path);
        let parent = p.parent().unwrap_or(Path::new("/"));
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("启动文件管理器失败: {}", e))?;
    }
    Ok(())
}

/// 获取 App 版本号（编译时从 Cargo.toml 读取）
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ====================== 大版本整包升级（2.0.13 → 2.0.14/15/16 ...） ======================
// 需求（2026-08-27 用户定）：
//   · 不显示具体新版本号（不说 "2.0.14"），只提示"有版本升级"
//   · 点击提示 → 立即检查并安装（点一下就查就升，不弹多余信息、不引导）
//   · 绝不碰右下角 #versionTag（双击刷新那个），提示元素独立于它
// 🔴 2026-08-27 修复（v2.0.16）：原实现用 app.updater() 连 GitHub Pages 的 updater.json，
//   用户环境对 GitHub 网络不稳（代理断着）→ 启动 check() 失败 → 触发 Tauri 原生
//   "自动更新失败"系统弹窗（用户明确反感）。改为：
//     ① endpoints 主源改 Gitee 发行版直链（国内稳，与 exe 同域名），
//        GitHub Pages 作兜底（双端主备，Tauri 按顺序试，第一个成功即用）；
//     ② check() 失败静默处理（不弹系统窗），仅返回 false 让前端自行决定是否提示，
//        彻底消除原生弹窗、同时恢复"点一下后台静默装"的体验。
// 实现：Rust 静默 check，发现新大版本 → emit("app-update-available", ())（不带版本号）；
//       前端在 #versionTag 旁显示独立 badge，点击 → invoke('install_app_update') 直接下载安装并重启。

/// 静默检查大版本更新。发现新版本 → emit 事件给前端（不带版本号）；返回值仅用于前端点击时再确认。
/// check 失败（网络/Gitee 不可达）静默返回 false，绝不触发 Tauri 原生"更新失败"系统弹窗。
#[tauri::command]
async fn check_app_update(app: tauri::AppHandle) -> Result<bool, String> {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            // 插件未初始化等 fatal，静默
            eprintln!("[updater] updater() 初始化失败（静默）: {}", e);
            return Ok(false);
        }
    };
    match updater.check().await {
        Ok(Some(_update)) => {
            // 有新版本：emit 事件（不带版本号，前端只显示"有版本升级"）
            let _ = app.emit("app-update-available", ());
            Ok(true)
        }
        Ok(None) => Ok(false),
        Err(e) => {
            // 🔴 网络失败静默，不弹系统窗（用户明确反感原生弹窗）
            eprintln!("[updater] check() 失败（静默，前端将走 SW 兜底）: {}", e);
            Ok(false)
        }
    }
}

/// 点击提示后调用：检查并立即下载安装（passive 模式后台装完提示重启）。
/// 不显示版本号，不弹引导窗，点一下直接升。失败静默返回（不弹系统窗）。
#[tauri::command]
async fn install_app_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[updater] install: updater() 失败: {}", e);
            // 🔴 2026-08-29 改为返回 Err：让前端能给用户明确提示（之前静默 Ok 导致"点了没反应"）。
            // 注意：这里返回 Err 给前端，前端自行轻提示，**不会**触发 Tauri 原生系统弹窗（用户明确反感）。
            return Err(format!("更新组件初始化失败: {}", e));
        }
    };
    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return Ok(()), // 无新版本，静默退出（正常情况，不报错）
        Err(e) => {
            eprintln!("[updater] install: check() 失败: {}", e);
            return Err(format!("检查更新失败（网络不通？）: {}", e));
        }
    };
    // 下载并安装（Windows installMode=quiet → 完全后台静默，装完由下方 restart 生效，全程无窗口）
    if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
        eprintln!("[updater] 下载安装失败: {}", e);
        return Err(format!("下载或安装失败: {}", e));
    }
    // 安装完成 → 重启生效（restart 后进程退出，下方不可达）
    app.restart();
}

/// 读取图片文件并返回 base64 data URL（供皮肤系统使用）
#[tauri::command]
fn read_image_base64(file_path: String) -> Result<String, String> {
    let data = fs::read(&file_path).map_err(|e| e.to_string())?;
    let ext = Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    // 使用标准 base64 编码
    let mut buf = String::new();
    for chunk in data.chunks(3) {
        const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        buf.push(TABLE[((triple >> 18) & 63) as usize] as char);
        buf.push(TABLE[((triple >> 12) & 63) as usize] as char);
        if chunk.len() > 1 { buf.push(TABLE[((triple >> 6) & 63) as usize] as char); }
        else { buf.push('='); }
        if chunk.len() > 2 { buf.push(TABLE[(triple & 63) as usize] as char); }
        else { buf.push('='); }
    }
    Ok(format!("data:{};base64,{}", mime, buf))
}

/// 重命名文件或目录
#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    if !Path::new(&old_path).exists() {
        return Err(format!("源文件不存在: {}", old_path));
    }
    if Path::new(&new_path).exists() {
        return Err(format!("目标路径已存在: {}", new_path));
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct FileInfo {
    name: String,
    path: String,
    is_file: bool,
    modified: String,
}

/// 将距 Unix epoch 的天数转为 (年, 月, 日)
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days as i64;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// ====================== 自动更新忽略系统代理 ======================
// Tauri updater 内部基于 reqwest，默认会读取系统代理环境变量（HTTP_PROXY / HTTPS_PROXY 等）。
// 若用户本机残留指向 127.0.0.1:7897 这类失效代理端口（代理软件关了但设置没还原），
// 更新下载会被发到该端口导致失败。更新资源走直连即可，启动时强制清除这些变量。
fn clear_proxy_env() {
    const PROXY_VARS: &[&str] = &[
        "HTTP_PROXY", "http_proxy",
        "HTTPS_PROXY", "https_proxy",
        "ALL_PROXY", "all_proxy",
        "NO_PROXY", "no_proxy",
    ];
    for v in PROXY_VARS {
        // remove_var 可能与其他线程读环境产生数据竞争，需置于 unsafe 块
        unsafe { std::env::remove_var(v); }
    }
}

// ====================== Umi-OCR 本地服务桥接 ======================
// 让 https 远程页能调用本机 Umi-OCR（127.0.0.1:1224），绕过浏览器混合内容限制。
// OCR 引擎本体（Umi-OCR 程序）不打包进安装包，由用户本机独立运行；APP 仅按需转发。
/// Umi-OCR HTTP 请求核心（命令与波数监控后台线程共用）
async fn umi_ocr_http(base64: String, options: serde_json::Value) -> Result<serde_json::Value, String> {
    // 关键：Umi-OCR 在 127.0.0.1:1224（本机），必须绕过系统代理。
    // reqwest 默认会读取 HTTP_PROXY/HTTPS_PROXY 环境变量，把本机请求转发给代理
    // （如 127.0.0.1:7897），代理转发本地地址会失败/返回非 JSON → “error decoding response body”。
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 OCR 客户端失败: {}", e))?;
    let body = serde_json::json!({ "base64": base64, "options": options });
    let resp = client
        .post("http://127.0.0.1:1224/api/ocr")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 Umi-OCR 失败: {}", e))?;
    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|e| format!("读取 Umi-OCR 响应失败: {}", e))?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| {
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]);
        format!("解析 Umi-OCR 响应失败: {}（响应前200字节: {}）", e, preview)
    })?;
    if !status.is_success() {
        return Err(format!("Umi-OCR 返回状态 {}: {}", status, json));
    }
    Ok(json)
}

#[tauri::command]
async fn umi_ocr(base64: String, options: serde_json::Value) -> Result<serde_json::Value, String> {
    umi_ocr_http(base64, options).await
}

/// 自动启动本机 Umi-OCR（后台常驻，自动开 127.0.0.1:1224 HTTP 服务）
/// 仅在探测不到服务时调用，避免重复拉起。DETACHED 使其独立于 APP 进程生命周期。
/// `hidden=true` 时加 --hide 后台无窗口启动（无感场景）；`hidden=false` 显示 Umi-OCR 窗口（用户手动启动）。
/// 记录拉起进程的 PID 到全局 state，便于 App 退出时一并关闭（见 kill_umi_ocr）。
#[tauri::command]
fn start_umi_ocr(exe_path: String, hidden: Option<bool>, state: tauri::State<AppState>) -> Result<(), String> {
    if !Path::new(&exe_path).exists() {
        return Err(format!("Umi-OCR 路径不存在: {}", exe_path));
    }
    let hide = hidden.unwrap_or(false);
    let extra: Vec<&str> = if hide { vec!["--hide"] } else { vec![] };
    // 关键：把 Umi-OCR 进程的工作目录设为其安装目录（可写、存在）。
    // 否则会继承本助手进程的 cwd（常为 C:\），当 Umi-OCR 配置里 outputDirName 为
    // 绝对路径时，会被当成相对路径拼成 C:\D:\... 这类非法路径，导致
    // “Cannot create output directory” 报错。设为安装目录可避免落到 C:\ 根。
    let exe_parent = Path::new(&exe_path).parent().unwrap_or_else(|| Path::new("."));
    #[cfg(windows)]
    let pid = {
        use std::os::windows::process::CommandExt;
        let child = std::process::Command::new(&exe_path)
            .args(&extra)
            .current_dir(exe_parent)
            .creation_flags(0x00000200 | 0x00000008) // CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS
            .spawn()
            .map_err(|e| format!("启动 Umi-OCR 失败: {}", e))?;
        let pid = child.id();
        std::mem::forget(child); // 不阻塞：否则 Child drop 会 wait 直到 Umi-OCR 退出
        pid
    };
    #[cfg(not(windows))]
    let pid = {
        let child = std::process::Command::new(&exe_path)
            .args(&extra)
            .current_dir(exe_parent)
            .spawn()
            .map_err(|e| format!("启动 Umi-OCR 失败: {}", e))?;
        let pid = child.id();
        std::mem::forget(child);
        pid
    };
    if let Ok(mut g) = state.umi_pid.lock() { *g = Some(pid); } // 覆盖旧 PID，避免残留
    Ok(())
}

/// 静默启动更新安装包：NSIS `/S` 全程无窗，`/R` 装完自动重启 APP（Tauri 模板
/// .onInstSuccess 内建机制，与原生 updater 通道同款参数同款行为，无双开风险）。
#[tauri::command]
fn start_installer_silent(exe_path: String) -> Result<(), String> {
    if !Path::new(&exe_path).exists() {
        return Err(format!("安装包不存在: {}", exe_path));
    }
    #[cfg(windows)]
    {
        std::process::Command::new(&exe_path)
            .args(["/S", "/R"])
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(&exe_path)
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;
    }
    Ok(())
}

/// 用系统默认浏览器打开外部链接（绕过 Tauri WebView 对 target="_blank" 的拦截）
#[tauri::command]
fn open_url(url: String) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }
}

/// 自动查找本机已安装的 Umi-OCR.exe（用户常不知道装在哪，故主动扫描常见位置）
/// 扫描：D:\withfriends\Umi-OCR、各常见盘根 Umi-OCR 文件夹、用户下载目录、桌面、Program Files（最多 3 层子目录）
/// 放到 spawn_blocking 避免扫描时阻塞 UI 主线程
/// 优先读取已记住的 Umi-OCR 路径（data/umi-ocr-path.json），存在且文件有效则直接返回，避免每次扫描整盘。
fn read_stored_umi_path() -> Option<String> {
    let p = std::path::Path::new(r"D:\withfriends\塔防精灵助手数据\data\umi-ocr-path.json");
    let txt = std::fs::read_to_string(p).ok()?;
    let v: serde_json::Value = serde_json::from_str(&txt).ok()?;
    let exe = v.get("path")?.as_str()?.to_string();
    if std::path::Path::new(&exe).is_file() { Some(exe) } else { None }
}

#[tauri::command]
async fn find_umi_ocr() -> Option<String> {
    // 先试用已记住的路径（最稳最快）；找不到再扫描常见位置
    if let Some(p) = read_stored_umi_path() { return Some(p); }
    tokio::task::spawn_blocking(|| scan_umi_ocr_exe())
        .await
        .ok()
        .flatten()
}

fn scan_umi_ocr_exe() -> Option<String> {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let mut bases: Vec<std::path::PathBuf> = Vec::new();
    // 本助手数据目录内的统一安装位置（所有文件都应在这里，不散落他处）
    bases.push(std::path::PathBuf::from(r"D:\withfriends\塔防精灵助手数据\Umi-OCR"));
    // 兼容旧位置
    bases.push(std::path::PathBuf::from(r"D:\withfriends\Umi-OCR"));
    if !home.is_empty() {
        bases.push(std::path::PathBuf::from(&home).join("Downloads"));
        bases.push(std::path::PathBuf::from(&home).join("Desktop"));
    }
    for pf in ["C:\\Program Files", "C:\\Program Files (x86)"] {
        bases.push(std::path::PathBuf::from(pf));
    }
    // 各盘根下的 Umi-OCR 文件夹（用户可能解压到 D:\Umi-OCR 之类）
    for drive in ['C', 'D', 'E', 'F'] {
        let root = format!("{}:\\Umi-OCR", drive);
        bases.push(std::path::PathBuf::from(root));
    }
    for base in &bases {
        if let Some(found) = scan_dir_for_umi(base, 0) {
            return Some(found);
        }
    }
    None
}

// 递归扫描（限深 3 层，避免过慢 / 权限拒绝）
fn scan_dir_for_umi(dir: &std::path::Path, depth: u32) -> Option<String> {
    if depth > 3 || !dir.is_dir() { return None; }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                let lower = name.to_lowercase();
                // 匹配 Umi-OCR.exe / Umi-OCR_Paddle_v2.1.5.exe 等
                // 排除自解压安装包 Umi-OCR_Paddle_v2.1.5.7z.exe（也是 .exe 但非运行程序）
                if lower.starts_with("umi-ocr") && lower.ends_with(".exe") && !lower.contains(".7z") && p.is_file() {
                    return Some(p.to_string_lossy().into_owned());
                }
            }
            if depth < 3 && p.is_dir() {
                if let Some(found) = scan_dir_for_umi(&p, depth + 1) {
                    return Some(found);
                }
            }
        }
    }
    None
}

/// 一键下载并安装 Umi-OCR 到本助手数据目录（不再散落到浏览器默认下载目录）
/// 下载 v2.1.5 Paddle 版（.7z.exe 自解压包）→ 静默解压到 D:\withfriends\塔防精灵助手数据\Umi-OCR → 返回 exe 路径
/// 主源：Gitee 发行版（把 128MB 包拆成 2 个约 64MB 纯二进制卷上传，各 <100MB 满足 Gitee 单附件限制，
/// 国内直连快、免登录）。本地按顺序拼接两卷即还原完整自解压包（纯二进制拼接，不依赖 7z 分卷格式），
/// 后续解压逻辑完全不变。Gitee 两卷均失败时回退 GitHub 原镜像。
/// 通过 `umi-ocr-download-progress` 事件实时回传下载进度（前端据此显示真实进度条，避免“是不是卡死”）。

/// 下载单段 URL 到内存，并实时回传合并进度。
/// ui_base = 已下载字节偏移（用于多卷拼接时累计）；ui_total = 合并总字节（0 表示未知，前端退化为字节计数）。
/// 仅在流内部 emit "progress"；"done"/"extract" 由调用方统一发，避免多卷时进度条被提前置满。
/// 仅当 ui_base==0（首卷/单文件）时才发 "start"，避免后续卷把进度条重置回 2%。
async fn fetch_to_vec(
    client: &reqwest::Client,
    url: &str,
    app: &tauri::AppHandle,
    ui_base: u64,
    ui_total: u64,
    _label: &str,
) -> Result<Vec<u8>, String> {
    if ui_base == 0 {
        let _ = app.emit("umi-ocr-download-progress", serde_json::json!({"stage":"start","url":url}));
    }
    let resp = client.get(url).send().await.map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP 状态码 {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    use tokio_stream::StreamExt;
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(c) => {
                downloaded += c.len() as u64;
                buf.extend_from_slice(c.as_ref());
                // 节流：每变化 1% 或每累计 512KB 上报一次，避免事件过多
                let need_emit = if ui_total > 0 {
                    let pct = ((ui_base + downloaded) * 100 / ui_total) as u64;
                    let last_pct = ((ui_base + last_emit) * 100 / ui_total) as u64;
                    pct != last_pct
                } else {
                    (ui_base + downloaded) - (ui_base + last_emit) >= 512 * 1024
                };
                if need_emit {
                    last_emit = downloaded;
                    let _ = app.emit("umi-ocr-download-progress",
                        serde_json::json!({"stage":"progress","downloaded":ui_base+downloaded,"total":ui_total}));
                }
            }
            Err(e) => { return Err(format!("读取响应失败: {}", e)); }
        }
    }
    if buf.is_empty() {
        return Err("下载中断（未收到任何字节）".into());
    }
    Ok(buf)
}

#[tauri::command]
async fn download_umi_ocr(app: tauri::AppHandle) -> Result<String, String> {
    let base = r"D:\withfriends\塔防精灵助手数据\Umi-OCR";
    let _ = std::fs::create_dir_all(base);
    let installer = format!("{}\\Umi-OCR_Paddle_v2.1.5.7z.exe", base);

    // 主源：Gitee 资源发行版（拆 2 卷，各 <100MB 满足 Gitee 单附件限制，国内直连快、免登录）
    let gitee_tag = "v-umi-ocr-v2.1.5";
    let pkg = "Umi-OCR_Paddle_v2.1.5.7z.exe";
    let vol1 = format!("https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/{}/{}.001", gitee_tag, pkg);
    let vol2 = format!("https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/{}/{}.002", gitee_tag, pkg);
    // 后备：GitHub 原镜像（仅 Gitee 两卷都失败时才用，避免国内慢速直连）
    let gh_candidates = [
        "https://ghproxy.com/https://github.com/hiroi-sora/Umi-OCR/releases/download/v2.1.5/Umi-OCR_Paddle_v2.1.5.7z.exe",
        "https://mirror.ghproxy.com/https://github.com/hiroi-sora/Umi-OCR/releases/download/v2.1.5/Umi-OCR_Paddle_v2.1.5.7z.exe",
        "https://github.com/hiroi-sora/Umi-OCR/releases/download/v2.1.5/Umi-OCR_Paddle_v2.1.5.7z.exe",
    ];

    // 强制直连（绕过系统代理，否则代理不可达会无限挂起）；短连接超时让死镜像快速失败，整体超时兜底
    let client = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))?;

    // 完整包大小固定（两卷之和），用于进度条分母 + 拼接完整性校验
    const EXPECTED: u64 = 134_293_725;

    // 1) 尝试 Gitee 两卷下载 + 顺序拼接（纯二进制拼接即还原完整自解压包）
    let mut merged: Option<Vec<u8>> = None;
    let mut gitee_err = String::from("无可用卷");
    {
        let mut buf: Vec<u8> = Vec::with_capacity(EXPECTED as usize);
        let mut ok_all = true;
        let mut base_off: u64 = 0;
        for (i, u) in [&vol1, &vol2].iter().enumerate() {
            let label = format!("卷{}/2", i + 1);
            match fetch_to_vec(&client, u, &app, base_off, EXPECTED, &label).await {
                Ok(part) => {
                    base_off += part.len() as u64;
                    buf.extend_from_slice(&part);
                }
                Err(e) => { ok_all = false; gitee_err = e; break; }
            }
        }
        if ok_all && !buf.is_empty() {
            merged = Some(buf);
        }
    }

    // 2) Gitee 失败 → 回退 GitHub 单文件（HEAD 估算大小以显示百分比）
    let from_gitee = merged.is_some();
    let data: Vec<u8> = if let Some(m) = merged {
        m
    } else {
        let _ = app.emit("umi-ocr-download-progress", serde_json::json!({"stage":"start","url":"fallback-github"}));
        let mut data: Option<Vec<u8>> = None;
        let mut last_err = gitee_err.clone();
        for url in &gh_candidates {
            let mut t: u64 = 0;
            if let Ok(r) = client.head(*url).send().await {
                if let Some(cl) = r.content_length() { t = cl; }
            }
            match fetch_to_vec(&client, url, &app, 0, t, "github").await {
                Ok(d) => { data = Some(d); break; }
                Err(e) => { last_err = e; }
            }
        }
        data.ok_or_else(|| format!("下载 Umi-OCR 失败（Gitee 与 GitHub 镜像均失败）：{}。请检查网络或改用界面里的「手动下载」", last_err))?
    };

    // 3) 完整性校验：两卷拼接后总字节必须等于完整包大小（防止某卷损坏导致解压失败）
    if from_gitee && data.len() as u64 != EXPECTED {
        return Err(format!("Umi-OCR 分卷拼接不完整（得到 {} 字节，期望 {} 字节），可能某卷下载损坏。请重试或改用界面里的「手动下载」", data.len(), EXPECTED));
    }

    // 4) 写入安装包 → 解压
    let _ = app.emit("umi-ocr-download-progress", serde_json::json!({"stage":"done","downloaded":data.len() as u64,"total":data.len() as u64}));
    tokio::fs::write(&installer, &data).await.map_err(|e| e.to_string())?;
    let _ = app.emit("umi-ocr-download-progress", serde_json::json!({"stage":"extract"}));
    // 2) 静默解压（7z 自解压包支持 -y -o"路径" 参数；CREATE_NO_WINDOW 避免弹黑窗）
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        // 注意：7z 自解压包对 -o 的解析是「朴素字符串拼接」——若把路径用引号包成
        // -o"D:\..."，引号会被当成路径一部分、被当作相对路径拼到 cwd(C:\) 上，
        // 得到非法的 C:\D:\... 路径而报 “Cannot create output directory”。
        // 本助手数据目录路径不含空格，故直接传 -o + 绝对路径（不带引号）即可；
        // 另设 current_dir(base) 作防御：即便被当成相对路径，也会解析到正确目录。
        let arg = format!("-o{}", base);
        let out = std::process::Command::new(&installer)
            .args(["-y", &arg])
            .current_dir(base)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("解压失败: {}", e))?;
        if !out.status.success() {
            return Err(format!("解压失败（退出码 {:?}）：{}。请手动双击运行 {}", out.status.code(), String::from_utf8_lossy(&out.stderr), installer));
        }
    }
    #[cfg(not(windows))] {
        return Err("当前仅支持 Windows 一键安装".into());
    }
    // 3) 查找解压出的 Umi-OCR.exe
    if let Some(p) = scan_umi_ocr_exe() {
        Ok(p)
    } else {
        Err(format!("已下载但解压后未找到 Umi-OCR.exe，请检查 {}", base))
    }
}

/// 一键下载皮肤包并解压到本助手数据目录（跟 Umi-OCR 同机制：Gitee 发行版直连、国内快、免登录）。
/// 皮肤包 skins.zip 由开发者预先打包仓库 skins/ 目录上传到 Gitee 发行版（tag v-skins），
/// 解压到 D:\withfriends\塔防精灵助手数据\data\skin\，之后 scanSkins 直接读本地，秒开无网可用。
#[tauri::command]
async fn download_skins(app: tauri::AppHandle, force: Option<bool>) -> Result<String, String> {
    let base = r"D:\withfriends\塔防精灵助手数据\data\skin";
    let _ = std::fs::create_dir_all(base);
    // 临时 zip 放在皮肤目录之外，避免"先删目录"时把自己删掉
    let tmp_dir = r"D:\withfriends\塔防精灵助手数据\data";
    let _ = std::fs::create_dir_all(tmp_dir);
    let zip_path = format!("{}\\skins_download_tmp.zip", tmp_dir);
    let installed_path = format!("{}\\skins_installed.json", tmp_dir);

    let client = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))?;

    // ===== 1. 从 GitHub Pages 读索引（几 KB，秒开），拿到当前有效包名 =====
    // 索引由 publish_skins.ps1 在"上传+校验成功后"才更新，因此永远指向一个可用的好包。
    let index_url = "https://gyq-svip.github.io/tfjl-web/skins-index.json";
    let idx_resp = client.get(index_url).send().await
        .map_err(|e| format!("读取皮肤索引失败: {}（将回退到固定包名 skins.zip）", e))?;
    let idx: serde_json::Value = if idx_resp.status().is_success() {
        idx_resp.json().await.unwrap_or(serde_json::Value::Null)
    } else {
        serde_json::Value::Null
    };
    let pkg = idx.get("package").and_then(|v| v.as_str()).unwrap_or("skins.zip").to_string();
    let remote_updated = idx.get("updated").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let remote_skins = idx.get("skins").and_then(|v| v.as_u64()).unwrap_or(0);
    let remote_size = idx.get("size").and_then(|v| v.as_u64()).unwrap_or(0);

    // ===== 2. 已装同版本 + 本地确实有图 + 非强制 -> 才跳过下载（省流量、秒开）=====
    // 🔴 关键：本地皮肤被手动删空时，即使 installed 记录说"已装"也必须重下。
    //    否则会出现「记录已装但磁盘没图」→ 界面一片空白且永远不自动恢复。
    let installed_pkg = std::fs::read_to_string(&installed_path).unwrap_or_default();
    let local_has_skin = has_skin_files(base);
    if force != Some(true) && local_has_skin && !installed_pkg.is_empty() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&installed_pkg) {
            let p = v.get("package").and_then(|x| x.as_str()).unwrap_or("");
            if p == pkg && !pkg.is_empty() {
                let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"uptodate","package":pkg}));
                return Ok(format!("皮肤已是最新（{}，{} 张），无需重新下载", pkg, remote_skins));
            }
        }
    }

    let gitee_tag = "v-skins";
    let url = format!("https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/{}/{}", gitee_tag, pkg);

    let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"start","url":url,"package":pkg}));
    let data = fetch_to_vec(&client, &url, &app, 0, 0, "skins").await
        .map_err(|e| format!("下载皮肤包失败: {}。本地皮肤保持原样未改动", e))?;

    // ===== 3. 完整性校验：索引声明了大小就必须一致，防止拿到坏包/错误页面 =====
    if remote_size > 0 && data.len() as u64 != remote_size {
        return Err(format!(
            "皮肤包大小不一致（下载 {} 字节，索引声明 {} 字节），已中止。本地皮肤未改动，请重试",
            data.len(), remote_size
        ));
    }
    if data.len() < 1024 {
        return Err(format!("下载内容异常（仅 {} 字节），可能拿到错误页面，已中止", data.len()));
    }

    tokio::fs::write(&zip_path, &data).await.map_err(|e| e.to_string())?;

    // ===== 4. 下载+校验全部成功后，才清空旧目录并解压（失败时本地皮肤完好无损）=====
    let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"extract"}));
    let _ = std::fs::remove_dir_all(&base);
    let _ = std::fs::create_dir_all(&base);

    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        let ps = format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", zip_path, base);
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("解压失败: {}", e))?;
        if !out.status.success() {
            let msg = String::from_utf8_lossy(&out.stderr);
            return Err(format!("解压皮肤包失败: {}。本地皮肤目录已清空，请重试或手动解压 {}", msg, zip_path));
        }
    }
    #[cfg(not(windows))] {
        return Err("当前仅支持 Windows 解压皮肤包".into());
    }

    // ===== 5. 记录已装版本，下次启动直接跳过下载 =====
    let installed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let rec = serde_json::json!({
        "package": pkg,
        "updated": remote_updated,
        "skins": remote_skins,
        "installedAt": installed_at,
    });
    let _ = std::fs::write(&installed_path, rec.to_string());
    let _ = std::fs::remove_file(&zip_path);
    let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"done","package":pkg,"skins":remote_skins}));
    Ok(format!("皮肤包 {} 已解压到 {}（{} 张皮肤）", pkg, base, remote_skins))
}

// ==================== 游戏窗口监控（波数播报 / 自动截图识别底座） ====================
// 三个原子命令：找窗口 → 截区域（BMP base64，可直送 umi_ocr）→ TTS 播报。
// 监控循环在前端跑（3 秒一拍：截取 → OCR → 波数变化才播报），便于不打包迭代解析逻辑。

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameWindowInfo {
    pub hwnd: usize,
    pub title: String,
}

/// 枚举本机可见的普通窗口（模拟器/游戏窗口），返回 [{hwnd, title}]
/// 普通模式过滤：可见 + 有标题 + 非工具窗口 + 客户区 ≥ 300x200 + 非本助手进程的窗口
/// 深度扫描（deep=true，2026-09-01 新增）：放宽过滤——含工具窗口、无标题窗口（显示「(无标题)」）、
///   尺寸门槛降到 ≥150x120。用于新版微信小程序等非常规窗口找不到的场景：
///   新版微信的小程序窗口常带工具窗口样式/特殊父属关系，普通枚举被过滤掉。
#[tauri::command]
fn find_game_windows(deep: Option<bool>) -> Result<Vec<GameWindowInfo>, String> {
    #[cfg(windows)]
    {
        use winapi::shared::windef::{HWND, RECT};
        use winapi::um::winuser::{
            EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowRect, GetWindowThreadProcessId,
            IsWindowVisible, GetWindowLongW, WS_EX_TOOLWINDOW, GWL_EXSTYLE,
        };
        let deep = deep.unwrap_or(false);

        struct Ctx {
            items: Vec<GameWindowInfo>,
            self_pid: u32,
            deep: bool,
        }
        unsafe extern "system" fn cb(hwnd: HWND, lparam: isize) -> i32 {
            let ctx = &mut *(lparam as *mut Ctx);
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }
            // 普通模式排除工具窗口（悬浮球/输入法条等）；深度模式保留（微信小程序可能是工具窗样式）
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            if !ctx.deep && (ex_style as u32 & WS_EX_TOOLWINDOW) != 0 {
                return 1;
            }
            let len = GetWindowTextLengthW(hwnd);
            let title: String = if len > 0 {
                let mut buf = vec![0u16; (len + 1) as usize];
                GetWindowTextW(hwnd, buf.as_mut_ptr(), len + 1);
                String::from_utf16_lossy(&buf[..len as usize])
            } else if ctx.deep {
                "(无标题)".to_string() // 深度模式收无标题窗（微信小程序可能无标题）
            } else {
                return 1;
            };
            // 排除本助手自己进程的窗口（用户要选的是游戏窗口，不是助手）
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == ctx.self_pid {
                return 1;
            }
            let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return 1;
            }
            let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
            // 深度模式门槛放宽到 150x120（小程序窗/竖屏窗），普通模式 300x200
            let (mw, mh) = if ctx.deep { (150, 120) } else { (300, 200) };
            if w < mw || h < mh {
                return 1;
            }
            if title.trim().is_empty() && !ctx.deep {
                return 1;
            }
            ctx.items.push(GameWindowInfo { hwnd: hwnd as usize, title });
            1
        }

        let mut ctx = Ctx { items: Vec::new(), self_pid: std::process::id(), deep };
        unsafe {
            EnumWindows(Some(cb), &mut ctx as *mut Ctx as isize);
        }
        // hwnd 降序：新启动的窗口（游戏）排前面，好找
        ctx.items.sort_by(|a, b| b.hwnd.cmp(&a.hwnd));
        Ok(ctx.items)
    }
    #[cfg(not(windows))]
    {
        let _ = deep;
        Ok(Vec::new())
    }
}

/// 截取窗口指定区域，返回 32 位 BMP 的原始字节（供命令 base64 返回 / 波数监控线程直接送 OCR）
/// 坐标系 = PrintWindow 整窗位图（左上角为窗口左上角，含标题栏），与 find 后前端预览图一致。
/// full=true 时忽略 x/y/w/h 截整窗（用于配置区域时的预览大图）。
fn capture_region_bmp(hwnd: usize, x: i32, y: i32, w: i32, h: i32, full: bool) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        use std::mem;
        use winapi::shared::windef::{HWND, RECT, HGDIOBJ};
        use winapi::um::wingdi::{
            BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC,
            DeleteObject, GetDIBits, SelectObject, DIB_RGB_COLORS, BI_RGB,
        };
        use winapi::um::winuser::{GetDC, PrintWindow, ReleaseDC, GetWindowRect, PW_RENDERFULLCONTENT};

        if w <= 0 || h <= 0 {
            return Err(format!("区域尺寸非法：{}x{}", w, h));
        }
        let hwnd = hwnd as HWND;
        unsafe {
            // 整窗尺寸（PrintWindow 输出位图大小 = 窗口外框大小）
            let mut win_rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            if GetWindowRect(hwnd, &mut win_rect) == 0 {
                return Err("获取窗口尺寸失败（窗口可能已关闭）".into());
            }
            let win_w = win_rect.right - win_rect.left;
            let win_h = win_rect.bottom - win_rect.top;
            if win_w <= 0 || win_h <= 0 {
                return Err("窗口尺寸非法".into());
            }

            // 1) PrintWindow 整窗到位图（PW_RENDERFULLCONTENT 支持采集 D3D/OpenGL 模拟器画面）
            let hdc_screen = GetDC(hwnd);
            if hdc_screen.is_null() {
                return Err("获取窗口 DC 失败".into());
            }
            let hdc_mem = CreateCompatibleDC(hdc_screen);
            let hbmp = CreateCompatibleBitmap(hdc_screen, win_w, win_h);
            let old_bmp = SelectObject(hdc_mem, hbmp as HGDIOBJ);
            // PW_RENDERFULLCONTENT = 2：Win8.1+，DirectX 渲染内容也能截到
            let _ = PrintWindow(hwnd, hdc_mem, PW_RENDERFULLCONTENT); // 返回值部分驱动不可靠，继续取图

            // 2) GetDIBits 整窗像素（top-down 32bpp BGRA）
            let mut bmi: BITMAPINFO = mem::zeroed();
            bmi.bmiHeader.biSize = mem::size_of::<BITMAPINFOHEADER>() as u32;
            bmi.bmiHeader.biWidth = win_w;
            bmi.bmiHeader.biHeight = -win_h; // 负高度 = top-down，位图行序与屏幕一致
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biCompression = BI_RGB;
            let mut pixels: Vec<u8> = vec![0u8; (win_w as usize) * (win_h as usize) * 4];
            let got = GetDIBits(hdc_mem, hbmp, 0, win_h as u32, pixels.as_mut_ptr() as *mut _, &mut bmi, DIB_RGB_COLORS);
            if got == 0 {
                SelectObject(hdc_mem, old_bmp);
                DeleteObject(hbmp as HGDIOBJ);
                DeleteDC(hdc_mem);
                ReleaseDC(hwnd, hdc_screen);
                return Err("读取窗口像素失败".into());
            }
            SelectObject(hdc_mem, old_bmp);
            DeleteObject(hbmp as HGDIOBJ);
            DeleteDC(hdc_mem);
            ReleaseDC(hwnd, hdc_screen);

            // 3) 内存裁剪目标区域
            let (rx, ry, rw, rh): (i32, i32, i32, i32) = if full {
                (0, 0, win_w, win_h)
            } else {
                (x, y, w, h)
            };
            // 越界钳制
            let rx = rx.clamp(0, win_w - 1);
            let ry = ry.clamp(0, win_h - 1);
            let rw = rw.min(win_w - rx);
            let rh = rh.min(win_h - ry);
            if rw <= 0 || rh <= 0 {
                return Err(format!("区域越界：窗口 {}x{}，请求 x={} y={} w={} h={}", win_w, win_h, rx, ry, rw, rh));
            }
            let row = win_w as usize * 4;
            let mut out: Vec<u8> = Vec::with_capacity(rw as usize * rh as usize * 4);
            for yy in 0..rh {
                let start = ry as usize * row + rx as usize * 4 + yy as usize * row;
                let end = start + rw as usize * 4;
                out.extend_from_slice(&pixels[start..end]);
            }

            // 4) 构造 32 位 BMP（14 文件头 + 40 信息头 + BGRA 数据，top-down）
            let data_len = out.len() as u32;
            let file_len = 54 + data_len;
            let mut bmp: Vec<u8> = Vec::with_capacity(54 + out.len());
            bmp.extend_from_slice(b"BM");
            bmp.extend_from_slice(&file_len.to_le_bytes());
            bmp.extend_from_slice(&0u32.to_le_bytes());
            bmp.extend_from_slice(&54u32.to_le_bytes());
            let mut hdr = [0u8; 40];
            hdr[0..4].copy_from_slice(&40u32.to_le_bytes());
            hdr[4..8].copy_from_slice(&(rw as i32).to_le_bytes());
            hdr[8..12].copy_from_slice(&(-(rh as i32)).to_le_bytes());
            hdr[12..14].copy_from_slice(&1u16.to_le_bytes());
            hdr[14..16].copy_from_slice(&32u16.to_le_bytes());
            hdr[16..20].copy_from_slice(&(BI_RGB as u32).to_le_bytes());
            hdr[20..24].copy_from_slice(&data_len.to_le_bytes());
            bmp.extend_from_slice(&hdr);
            bmp.extend_from_slice(&out);

            Ok(bmp)
        }
    }
    #[cfg(not(windows))]
    {
        Err("仅支持 Windows".into())
    }
}

/// Tauri 命令封装：截图区域 → BMP base64（与旧版返回格式完全一致，前端无需改动）
#[tauri::command]
fn capture_window_region(hwnd: usize, x: i32, y: i32, w: i32, h: i32, full: Option<bool>) -> Result<String, String> {
    Ok(B64.encode(capture_region_bmp(hwnd, x, y, w, h, full.unwrap_or(false))?))
}

/// TTS 语音播报核心（命令与波数监控线程共用）
fn speak_sync(text: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let t = text.replace('\'', "''");
        let ps = format!(
            "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 2; $s.Speak('{}')",
            t
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("语音播报启动失败: {}", e))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = text;
        Err("仅支持 Windows".into())
    }
}

/// TTS 语音播报（Windows 自带 System.Speech，无需联网/安装）
/// 每次独立 spawn PowerShell（CREATE_NO_WINDOW 不闪黑框），短句播报延迟可接受
#[tauri::command]
fn speak_text(text: String) -> Result<(), String> {
    speak_sync(&text)
}

// ==================== 游戏波数监控 · Rust 后台线程（2026-08-31 全面升级） ====================
// 旧版监控循环跑在前端 JS：窗口最小化/隐藏到托盘后 WebView 被冻结、定时器停摆 → 后台播报失效；
// 且每拍截「整窗 BMP」+ 前端 canvas 二次解码裁剪，内存/CPU 浪费大（用户实测内存偏高）。
// 现整体下沉 Rust 独立线程（与窗口可见性无关）：
//   多窗口同拍 → 每窗口只截「波数小区域」（几十 KB BMP 直传 OCR，不再整窗+前端转码）
//   → 波数解析 → 变化时 TTS 播报（自定义前后缀 / 仅关键波数防噪音）→ 托盘角标数字 + tooltip 汇总
//   → emit gm-wave/gm-log/gm-state 事件刷新前端面板（面板开着才刷新，关了不影响监控）。
// 全程只读：PrintWindow 截图，不动游戏窗口、不抢焦点、不发按键，与脚本软件互不冲突。

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmWin {
    hwnd: usize,
    title: String,
    region: [f64; 4],      // 比例坐标 x,y,w,h（0..1，换分辨率不失效）
    speak: bool,           // 语音播报开关
    speak_prefix: String,  // 播报前缀，如「马上到」→「马上到第12波」
    speak_suffix: String,  // 播报后缀，如「了，请注意上卡」→「第12波了，请注意上卡」
    key_waves: Vec<u32>,   // 关键波数（空 = 每波都播；非空 = 命中才播，防连播噪音）
    // 🔴 2026-09-01 新增：到波自动点击（多组）+ 文字识别触发点击（多组）。
    // serde(default)：旧版前端下发的 cfg 无这两个字段也能正常启动（纯播报模式不受影响）。
    #[serde(default)]
    wave_clicks: Vec<GmWaveClick>,
    #[serde(default)]
    text_clicks: Vec<GmTextClick>,
    // 🔴 v3 通用宏规则（用户核心需求）：触发器 + 动作序列自由组合，前端编辑免打包。
    // 旧的 wave_clicks/text_clicks 会在 game_monitor_start 统一转换为 rules 执行（兼容旧前端）。
    #[serde(default)]
    rules: Vec<GmRule>,
}

/// 单个点击点位：一组内多个位置按顺序连点（点完一个等 gap_ms 再点下一个）
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmPoint {
    x: f64,               // 点击位置（窗口整窗比例坐标 0..1，与框选截图同一坐标系）
    y: f64,
    #[serde(default = "gm_d_one")]
    times: u32,           // 该位置连点次数
    #[serde(default = "gm_d_gap")]
    gap_ms: u64,          // 该位置点完后到下一位置的间隔（同位置连点也用此间隔）
}

/// 到波自动点击（一组）：到达/跨越触发波数时，按顺序点击多个位置
/// 2026-09-01 v2：x/y 单点位升级为 points 多点位（用户需求「连续多点几个位置」）。
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmWaveClick {
    wave: u32,            // 触发波数（到达或跨越该波即点；新一局自动重置后每局都会点）
    points: Vec<GmPoint>, // 多个位置按顺序连点（空 = 不点，前端已校验）
}

/// 文字识别触发点击（一组）：指定区域 OCR 识别到关键词 → 按顺序点击多个位置
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmTextClick {
    region: [f64; 4],     // 识别区域（比例坐标）
    keyword: String,      // 关键词（包含匹配，去空格后比对，兼容 OCR 分词断开）
    points: Vec<GmPoint>, // 多个位置按顺序连点
    #[serde(default = "gm_d_cd")]
    cooldown_sec: u64,    // 触发后冷却（秒）：防止按钮还没消失时连续误点
    #[serde(default = "gm_d_true")]
    enabled: bool,
}

// ==================== 通用宏规则引擎（2026-09-01 v3，用户核心需求）====================
// 🎯 设计（用户提议的架构）：Rust 只做「动作原语执行器」，规则怎么编（触发条件+动作序列）
//    完全由前端决定并下发 —— 前端热更新改宏不用打包。
//    动作原语集合：Click（点击）/ Delay（延时）/ Key（输入文字），以后加新原语才需要打包。
//    兼容：旧的 wave_clicks/text_clicks 结构在 game_monitor_start 里统一转换为 rules 执行。

/// 宏动作（一步）：click 点位置 / delay 等待 / key 输入文字
#[derive(serde::Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
enum GmAction {
    #[serde(rename_all = "camelCase")]
    Click {
        x: f64,
        y: f64,
        #[serde(default = "gm_d_one")]
        times: u32,
        #[serde(default = "gm_d_gap")]
        gap_ms: u64,
    },
    #[serde(rename_all = "camelCase")]
    Delay {
        ms: u64,
    },
    #[serde(rename_all = "camelCase")]
    Key {
        text: String,
    },
}

/// 宏触发条件：到第 X 波 / 指定区域识别到关键词
#[derive(serde::Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
enum GmTrigger {
    #[serde(rename_all = "camelCase")]
    Wave { wave: u32 },
    #[serde(rename_all = "camelCase")]
    Text { region: [f64; 4], keyword: String },
}

/// 宏规则：触发器 + 动作序列（自由组合，前端编辑）
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmRule {
    trigger: GmTrigger,
    #[serde(default)]
    actions: Vec<GmAction>,
    #[serde(default = "gm_d_cd")]
    cooldown_sec: u64,    // 触发后冷却秒（text 触发防连发；wave 触发每局一次不受此限）
    #[serde(default = "gm_d_true")]
    enabled: bool,
}

/// 键盘输入文字原语：SendInput KEYEVENTF_UNICODE 逐字符注入（支持任意文字含中文）。
/// ⚠️ 需目标窗口持有焦点（前面的 Click 动作点输入框即转移焦点）；比剪贴板+Ctrl+V 干净（不动剪贴板）。
fn gm_type_text(text: &str) {
    #[cfg(windows)]
    {
        use winapi::um::winuser::{SendInput, INPUT, INPUT_KEYBOARD, KEYEVENTF_UNICODE, KEYEVENTF_KEYUP};
        for ch in text.chars() {
            unsafe {
                let mut down: INPUT = std::mem::zeroed();
                down.type_ = INPUT_KEYBOARD;
                down.u.ki_mut().wScan = ch as u16;
                down.u.ki_mut().dwFlags = KEYEVENTF_UNICODE;
                let mut up: INPUT = std::mem::zeroed();
                up.type_ = INPUT_KEYBOARD;
                up.u.ki_mut().wScan = ch as u16;
                up.u.ki_mut().dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                let seq = [down, up];
                SendInput(2, seq.as_ptr() as *mut _, std::mem::size_of::<INPUT>() as i32);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = text;
    }
}

fn gm_d_one() -> u32 { 1 }
fn gm_d_gap() -> u64 { 200 }
fn gm_d_cd() -> u64 { 3 }
fn gm_d_true() -> bool { true }

/// 当前 Unix 毫秒（文字点击冷却计时用）
fn gm_now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// 屏幕绝对坐标模拟鼠标左键点击（真实点击：会移动用户鼠标）
/// ⚠️ 前提：目标窗口可见、未最小化、未被其他窗口遮挡（多开请平铺不重叠）。
/// 用 mouse_event（user32 老牌 API，Win11 仍完整支持，模拟器/小游戏全兼容）。
fn gm_click_at(x: i32, y: i32, times: u32, gap_ms: u64) {
    #[cfg(windows)]
    {
        use winapi::um::winuser::{SetCursorPos, mouse_event, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP};
        let times = times.clamp(1, 10);
        for n in 0..times {
            unsafe {
                SetCursorPos(x, y);
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                std::thread::sleep(std::time::Duration::from_millis(40)); // 按住时长，游戏普遍识别
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
            }
            if n + 1 < times {
                std::thread::sleep(std::time::Duration::from_millis(gap_ms.max(50)));
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (x, y, times, gap_ms);
    }
}

/// 窗口比例坐标 → 屏幕绝对坐标（与 PrintWindow 整窗截图同一坐标系 = 含标题栏，
/// 用户在截图上点选的位置换算到屏幕分毫不差）。最小化/已关闭时报错跳过。
fn gm_win_point_to_screen(hwnd: usize, rx: f64, ry: f64) -> Result<(i32, i32), String> {
    #[cfg(windows)]
    {
        use winapi::shared::windef::{HWND, RECT};
        use winapi::um::winuser::{GetWindowRect, IsIconic};
        let hwnd = hwnd as HWND;
        unsafe {
            if IsIconic(hwnd) != 0 {
                return Err("窗口已最小化（还原窗口后自动点击才会生效）".into());
            }
            let mut wr = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            if GetWindowRect(hwnd, &mut wr) == 0 {
                return Err("获取窗口位置失败（窗口可能已关闭）".into());
            }
            let w = (wr.right - wr.left) as f64;
            let h = (wr.bottom - wr.top) as f64;
            if w <= 0.0 || h <= 0.0 {
                return Err("窗口尺寸非法".into());
            }
            Ok((wr.left + (rx * w) as i32, wr.top + (ry * h) as i32))
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (hwnd, rx, ry);
        Err("仅支持 Windows".into())
    }
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmCfg {
    windows: Vec<GmWin>,
    interval_sec: u64,     // 识别间隔（秒），各窗口共用同一拍速
}

/// 提取字符串中所有 ASCII 数字组（多字节 UTF-8 的续字节均 ≥0x80，不会与数字字节混淆，切片安全）
fn gm_digit_groups(s: &str) -> Vec<&str> {
    let b = s.as_bytes();
    let mut out: Vec<&str> = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i].is_ascii_digit() {
            let mut j = i;
            while j < b.len() && b[j].is_ascii_digit() { j += 1; }
            out.push(&s[i..j]);
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// 波数解析（与前端旧版 _gmParseWave 同构）：
/// ① 数字后（可隔空格）紧跟「波/泫/渡」→ 取该数字（含「第X波」）；
/// ② ^W12$ → 12；③ 全部文本只出现一个数字时兜底采用；多个数字歧义 → 拒绝（防把别的数字当波数）。
fn gm_parse_wave(texts: &[String]) -> Option<u32> {
    for t in texts {
        let b = t.as_bytes();
        let mut i = 0;
        while i < b.len() {
            if b[i].is_ascii_digit() {
                let mut j = i;
                while j < b.len() && b[j].is_ascii_digit() { j += 1; }
                let num = &t[i..j];
                let mut k = j;
                while let Some(c) = t[k..].chars().next() {
                    if c == ' ' || c == '\u{a0}' { k += c.len_utf8(); } else { break; }
                }
                if let Some(c) = t[k..].chars().next() {
                    if c == '波' || c == '泫' || c == '渡' {
                        if let Ok(v) = num.parse::<u32>() { return Some(v); }
                    }
                }
                i = j;
            } else {
                i += 1;
            }
        }
        let tr = t.trim();
        let tb = tr.as_bytes();
        if tb.len() >= 2 && (tb[0] == b'W' || tb[0] == b'w') {
            let rest = tr[1..].trim();
            if !rest.is_empty() && rest.bytes().all(|c| c.is_ascii_digit()) {
                if let Ok(v) = rest.parse::<u32>() { return Some(v); }
            }
        }
    }
    let mut nums: Vec<&str> = Vec::new();
    for t in texts { nums.extend(gm_digit_groups(t)); }
    if nums.len() == 1 { nums[0].parse::<u32>().ok() } else { None }
}

/// 3x5 像素数字字库（每行 3 位 × 5 行，'1' = 亮）
const GM_FONT: [&str; 10] = [
    "111101101101111",
    "010110010010111",
    "111001111100111",
    "111001111001111",
    "101101111001001",
    "111100111001111",
    "111100111101111",
    "111001001001001",
    "111101111101111",
    "111101111001111",
];

/// 托盘角标背景像素：金色描边圆角方块 + 深蓝底（64x64，系统自动缩放到托盘实际尺寸）
fn gm_badge_bg(x: i32, y: i32, s: i32) -> (u8, u8, u8, u8) {
    let r = 14;
    let half = s / 2;
    let dx = (x - half).abs();
    let dy = (y - half).abs();
    let in_corner = dx > half - r && dy > half - r;
    let dist2 = (dx - (half - r)).pow(2) + (dy - (half - r)).pow(2);
    if in_corner && dist2 > r * r { return (0, 0, 0, 0); } // 圆角外透明
    let ir = r - 4;
    let in_corner2 = dx > half - ir && dy > half - ir;
    let dist2i = (dx - (half - ir)).pow(2) + (dy - (half - ir)).pow(2);
    let inner = !in_corner2 || dist2i <= ir * ir;
    let is_border = !inner || x < 3 || y < 3 || x >= s - 3 || y >= s - 3;
    if is_border { (0xFF, 0xD7, 0x00, 0xFF) } else { (0x1A, 0x1A, 0x2E, 0xFF) }
}

/// 托盘角标图标：深蓝底金字波数数字（监控期间托盘直接显示最新波数，用户看角标即知战况）
fn gm_badge_image(wave: u32) -> tauri::image::Image<'static> {
    let s: i32 = 64;
    let digits: Vec<u8> = wave.min(999).to_string().bytes().map(|b| b - b'0').collect();
    let n = digits.len() as i32;
    let scale = match n { 1 => 9, 2 => 7, _ => 5 };
    let dw = 3 * scale;
    let dh = 5 * scale;
    let gap = scale;
    let total_w = n * dw + (n - 1) * gap;
    let ox = ((s - total_w) / 2).max(1);
    let oy = ((s - dh) / 2).max(1);
    let mut rgba: Vec<u8> = vec![0u8; (s * s * 4) as usize];
    for y in 0..s {
        for x in 0..s {
            let (r, g, bl, a) = gm_badge_bg(x, y, s);
            let i = ((y * s + x) * 4) as usize;
            rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = bl; rgba[i + 3] = a;
        }
    }
    for (di, &d) in digits.iter().enumerate() {
        let glyph = GM_FONT[d as usize].as_bytes();
        for gy in 0..5 {
            for gx in 0..3 {
                if glyph[(gy * 3 + gx) as usize] == b'1' {
                    for sy in 0..scale {
                        for sx in 0..scale {
                            let px = ox + di as i32 * (dw + gap) + gx * scale + sx;
                            let py = oy + gy * scale + sy;
                            if px >= 0 && px < s && py >= 0 && py < s {
                                let i = ((py * s + px) * 4) as usize;
                                rgba[i] = 0xFF; rgba[i + 1] = 0xD7; rgba[i + 2] = 0x00; rgba[i + 3] = 0xFF;
                            }
                        }
                    }
                }
            }
        }
    }
    tauri::image::Image::new_owned(rgba, s as u32, s as u32)
}

/// 恢复托盘默认状态（停止监控时）：默认图标 + 原始 tooltip + 无监控项的菜单
fn gm_restore_tray(app: &tauri::AppHandle) {
    if let Some(tray) = TRAY.get() {
        let _ = tray.set_tooltip(Some("塔防精灵助手"));
        if let Some(def) = app.default_window_icon() {
            let _ = tray.set_icon(Some(def.clone()));
        }
    }
    gm_apply_tray_menu(app, false, false);
}

/// 构建托盘右键菜单：监控运行时附加「暂停/恢复播报 + 停止波数监控」项
/// （此前必须打开面板才能停监控/静音，托盘直接操作快得多——2026-09-01 用户需求）
fn gm_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>, monitoring: bool, muted: bool) -> Result<Menu<R>, tauri::Error> {
    use tauri::menu::{IsMenuItem, PredefinedMenuItem};
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
    let sep0 = PredefinedMenuItem::separator(app)?;
    let mute = MenuItem::with_id(app, "gm-mute-toggle",
        if muted { "🔊 恢复播报" } else { "🔇 暂停播报" }, true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "gm-stop", "⏹ 停止波数监控", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![&show, &hide];
    if monitoring {
        items.push(&sep0);
        items.push(&mute);
        items.push(&stop);
    }
    items.push(&sep1);
    items.push(&quit);
    Menu::with_items(app, &items)
}

/// 托盘菜单热更新（运行态/静音态变化时重建 set_menu，事件仍路由到 builder 注册的处理器）
fn gm_apply_tray_menu(app: &tauri::AppHandle, monitoring: bool, muted: bool) {
    if let Some(tray) = TRAY.get() {
        match gm_tray_menu(app, monitoring, muted) {
            Ok(m) => { let _ = tray.set_menu(Some(m)); }
            Err(e) => { eprintln!("[TRAY] 波数监控托盘菜单构建失败: {}", e); }
        }
    }
}

/// 单窗口单拍：按比例坐标只截「波数小区域」→ Umi-OCR（BMP 直传几十 KB，内存占用极小）
/// Ok(None) = 识别无文字（code 101，可能黑屏/最小化）；Err = 截图/网络级异常。
fn gm_tick_window(win: &GmWin, region: &[f64; 4]) -> Result<Option<Vec<String>>, String> {
    #[cfg(windows)]
    {
        use winapi::shared::windef::{HWND, RECT};
        use winapi::um::winuser::GetWindowRect;
        let hwnd = win.hwnd as HWND;
        unsafe {
            let mut wr = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            if GetWindowRect(hwnd, &mut wr) == 0 {
                return Err("获取窗口尺寸失败（窗口可能已关闭）".into());
            }
            let (ww, wh) = (wr.right - wr.left, wr.bottom - wr.top);
            if ww <= 0 || wh <= 0 { return Err("窗口尺寸非法".into()); }
            let rx = ((region[0] * ww as f64) as i32).clamp(0, ww - 1);
            let ry = ((region[1] * wh as f64) as i32).clamp(0, wh - 1);
            let rw = (((region[2] * ww as f64) as i32).max(8)).min(ww - rx);
            let rh = (((region[3] * wh as f64) as i32).max(8)).min(wh - ry);
            if rw <= 0 || rh <= 0 { return Err("识别区域越界".into()); }
            let bmp = capture_region_bmp(win.hwnd, rx, ry, rw, rh, false)?;
            let b64 = B64.encode(&bmp);
            let opts = serde_json::json!({
                "data": { "format": "dict", "outputDirName": "", "outputFileName": "", "outputFileFormat": [] },
                "ocr": { "language": "models/config_chinese.txt", "cls": true }
            });
            let j = tauri::async_runtime::block_on(umi_ocr_http(b64, opts))?;
            let code = j.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            if code == 100 {
                let texts = j.get("data").and_then(|d| d.as_array()).map(|arr| {
                    arr.iter()
                        .filter_map(|it| it.get("text").and_then(|t| t.as_str()))
                        .map(|s| s.to_string())
                        .collect()
                }).unwrap_or_default();
                Ok(Some(texts))
            } else if code == 101 {
                Ok(None)
            } else {
                Err(format!("Umi-OCR 返回异常: {}", j.get("data").and_then(|d| d.as_str()).unwrap_or("?")))
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (win, region);
        Err("仅支持 Windows".into())
    }
}

/// 按顺序执行宏动作序列（规则引擎核心，Click/Delay/Key 三原语）：
/// Click → 换算屏幕坐标连点；Delay → 100ms 粒度可中断等待；Key → SendInput UNICODE 注入文字。
/// 中途世代变化（监控重启/停止）立即中断，不打断新会话。
fn gm_exec_actions<F: Fn() -> bool>(app: &tauri::AppHandle, hwnd: usize, actions: &[GmAction], alive: F, ctx: &str) {
    for (ai, act) in actions.iter().enumerate() {
        if !alive() { break; }
        match act {
            GmAction::Click { x, y, times, gap_ms } => {
                match gm_win_point_to_screen(hwnd, *x, *y) {
                    Ok((sx, sy)) => {
                        let _ = app.emit("gm-log", serde_json::json!({
                            "hwnd": hwnd,
                            "msg": format!("{} 第{}步·点击（×{}次）", ctx, ai + 1, (*times).max(1)),
                        }));
                        gm_click_at(sx, sy, *times, *gap_ms);
                    }
                    Err(e) => {
                        let _ = app.emit("gm-log", serde_json::json!({
                            "hwnd": hwnd, "msg": format!("{} 第{}步·点击跳过：{}", ctx, ai + 1, e), "isErr": true,
                        }));
                    }
                }
            }
            GmAction::Delay { ms } => {
                let _ = app.emit("gm-log", serde_json::json!({
                    "hwnd": hwnd,
                    "msg": format!("{} 第{}步·延时 {}ms", ctx, ai + 1, ms),
                }));
                let mut slept = 0u64;
                while slept < *ms {
                    if !alive() { break; }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    slept += 100;
                }
            }
            GmAction::Key { text } => {
                let _ = app.emit("gm-log", serde_json::json!({
                    "hwnd": hwnd,
                    "msg": format!("{} 第{}步·输入文字「{}」", ctx, ai + 1, text),
                }));
                gm_type_text(text);
            }
        }
    }
}

/// 每窗口运行时状态（波数记忆 / 规则触发标记）
struct GmWinRT {
    last: Option<u32>,
    rule_done: Vec<bool>,         // wave 触发规则：本局该条是否已执行（新局重置）
    rule_last: Vec<Option<u128>>, // 规则上次触发时间戳（冷却用，text 触发主用）
}

/// 监控主循环（独立线程）：与窗口是否可见无关，最小化/隐藏到托盘照常播报
/// 2026-09-01 v3：统一宏规则引擎（触发器+动作序列），旧 wave_clicks/text_clicks 已在 start 转换为 rules
fn gm_monitor_loop(app: tauri::AppHandle, cfg: GmCfg, gen: u64, interval_sec: u64) {
    let interval_ms = interval_sec * 1000;
    let multi = cfg.windows.len() > 1;
    let mut rt: Vec<GmWinRT> = cfg.windows.iter().map(|w| GmWinRT {
        last: None,
        rule_done: vec![false; w.rules.len()],
        rule_last: vec![None; w.rules.len()],
    }).collect();
    let mut last: Vec<Option<u32>> = vec![None; cfg.windows.len()];
    let mut empty_cnt: Vec<u32> = vec![0; cfg.windows.len()];
    let mut err_cnt: Vec<u32> = vec![0; cfg.windows.len()];
    let mut warned_empty: Vec<bool> = vec![false; cfg.windows.len()];
    let mut warned_dead: Vec<bool> = vec![false; cfg.windows.len()];
    let alive = |gen: u64| GM_RUN.load(Ordering::SeqCst) && GM_GEN.load(Ordering::SeqCst) == gen;
    let muted = || GM_MUTE.load(Ordering::SeqCst);
    loop {
        if !alive(gen) { break; }
        for (idx, win) in cfg.windows.iter().enumerate() {
            if !alive(gen) { break; }
            match gm_tick_window(win, &win.region) {
                Ok(Some(texts)) => {
                    empty_cnt[idx] = 0;
                    warned_empty[idx] = false;
                    match gm_parse_wave(&texts) {
                        Some(wave) => {
                            err_cnt[idx] = 0;
                            let prev = rt[idx].last;
                            rt[idx].last = Some(wave);
                            last[idx] = Some(wave);
                            if prev.map_or(true, |p| p != wave) {
                                let is_up = prev.map_or(true, |p| wave > p);
                                // 🔴 新局检测：波数回退（如 25→1）判定新一局 → 重置到波规则标记 + 播报
                                if let Some(p) = prev {
                                    if wave < p {
                                        for d in rt[idx].rule_done.iter_mut() { *d = false; }
                                        let _ = app.emit("gm-log", serde_json::json!({
                                            "hwnd": win.hwnd,
                                            "msg": format!("波数回退（{}→{}）判定新一局，到波自动执行已重置（本局会再执行）", p, wave),
                                        }));
                                        if win.speak && !muted() {
                                            let tag = if multi { format!("{}号窗 ", idx + 1) } else { String::new() };
                                            let _ = speak_sync(&format!("{}新一局", tag));
                                        }
                                    }
                                }
                                let key_hit = win.key_waves.is_empty() || win.key_waves.contains(&wave);
                                let spoken = win.speak && key_hit && !muted();
                                if spoken {
                                    let tag = if multi { format!("{}号窗 ", idx + 1) } else { String::new() };
                                    let _ = speak_sync(&format!("{}{}第{}波{}", tag, win.speak_prefix, wave, win.speak_suffix));
                                }
                                // 托盘角标：显示最新变化波数；tooltip 汇总全部监控窗口战况
                                if let Some(tray) = TRAY.get() {
                                    let _ = tray.set_icon(Some(gm_badge_image(wave)));
                                    let tip = if multi {
                                        let summary: Vec<String> = last.iter().enumerate()
                                            .filter_map(|(i, l)| l.map(|w| format!("{}号窗:第{}波", i + 1, w)))
                                            .collect();
                                        format!("塔防精灵助手 — 监控中{} | {}", if muted() { "（播报已暂停）" } else { "" }, summary.join(" | "))
                                    } else {
                                        format!("塔防精灵助手 — 监控中{}：第{}波", if muted() { "（播报已暂停）" } else { "" }, wave)
                                    };
                                    let _ = tray.set_tooltip(Some(&tip));
                                }
                                let _ = app.emit("gm-wave", serde_json::json!({
                                    "hwnd": win.hwnd, "title": win.title, "idx": idx,
                                    "wave": wave, "prev": prev, "isUp": is_up,
                                    "spoken": spoken, "keyHit": key_hit,
                                }));
                            }
                            // 🔴 到波规则（wave 触发）：到达或跨越触发波数即执行动作序列，每局一次（新局重置）
                            for (ri, rule) in win.rules.iter().enumerate() {
                                if !alive(gen) { break; }
                                if !rule.enabled || rt[idx].rule_done[ri] { continue; }
                                if let GmTrigger::Wave { wave: tw } = &rule.trigger {
                                    let fire = prev.map_or(false, |p| p < *tw && wave >= *tw)
                                        || (prev.is_none() && wave == *tw);
                                    if !fire { continue; }
                                    rt[idx].rule_done[ri] = true;
                                    rt[idx].rule_last[ri] = Some(gm_now_ms());
                                    let ctx = format!("⚡ 第{}波规则", tw);
                                    gm_exec_actions(&app, win.hwnd, &rule.actions, || alive(gen), &ctx);
                                }
                            }
                        }
                        None => {
                            let _ = app.emit("gm-log", serde_json::json!({
                                "hwnd": win.hwnd,
                                "msg": format!("识别到文字但未解析出波数：{}", texts.join(" | ")),
                                "isErr": true,
                            }));
                        }
                    }
                }
                Ok(None) => {
                    empty_cnt[idx] += 1;
                    if empty_cnt[idx] >= 5 && !warned_empty[idx] {
                        warned_empty[idx] = true;
                        let _ = app.emit("gm-log", serde_json::json!({
                            "hwnd": win.hwnd,
                            "msg": "连续多次未识别到文字：游戏窗口可能被最小化（黑图）或框选区域不对",
                            "isErr": true,
                        }));
                    }
                }
                Err(e) => {
                    err_cnt[idx] += 1;
                    if err_cnt[idx] == 1 || err_cnt[idx] % 10 == 0 {
                        let _ = app.emit("gm-log", serde_json::json!({
                            "hwnd": win.hwnd, "msg": format!("监控异常：{}", e), "isErr": true,
                        }));
                    }
                    if err_cnt[idx] >= 8 && !warned_dead[idx] {
                        warned_dead[idx] = true;
                        let _ = app.emit("gm-log", serde_json::json!({
                            "hwnd": win.hwnd,
                            "msg": "该窗口连续失败（可能已关闭或 Umi-OCR 未运行）；其余窗口继续监控，重新开始监控可重绑窗口",
                            "isErr": true,
                        }));
                    }
                }
            }
            // 🔴 识别文字规则（text 触发）：OCR 规则区域，命中关键词且冷却过 → 执行动作序列
            for (ri, rule) in win.rules.iter().enumerate() {
                if !alive(gen) { break; }
                if !rule.enabled { continue; }
                let (region, keyword) = match &rule.trigger {
                    GmTrigger::Text { region, keyword } => (region, keyword),
                    GmTrigger::Wave { .. } => continue, // wave 触发在上面波数分支处理
                };
                let now = gm_now_ms();
                if let Some(t0) = rt[idx].rule_last[ri] {
                    if now.saturating_sub(t0) < (rule.cooldown_sec as u128) * 1000 { continue; }
                }
                match gm_tick_window(win, region) {
                    Ok(Some(texts)) => {
                        // 去空格拼接：OCR 分词可能把「开始战斗」拆成「开始」+「战斗」
                        let joined: String = texts.join("").chars()
                            .filter(|c| *c != ' ' && *c != '\u{a0}')
                            .collect();
                        if joined.contains(keyword) {
                            rt[idx].rule_last[ri] = Some(now);
                            let ctx = format!("🎯 识别到「{}」", keyword);
                            gm_exec_actions(&app, win.hwnd, &rule.actions, || alive(gen), &ctx);
                        }
                    }
                    _ => {}
                }
            }
        }
        // 按 100ms 粒度睡眠（停止/重启指令即时生效，不必等满整拍）
        let mut slept = 0u64;
        while slept < interval_ms {
            if !alive(gen) { break; }
            std::thread::sleep(std::time::Duration::from_millis(100));
            slept += 100;
        }
    }
}

/// 启动波数监控（Rust 后台线程）：命令立即返回，运行状态经 gm-wave / gm-log / gm-state 事件推送前端。
/// 重复调用 = 重启监控（世代计数让旧线程自然退出，避免双线程同时播报）。
/// 🔴 v3：旧的 wave_clicks/text_clicks 在此统一转换为通用 rules（一份执行引擎，兼容旧前端下发格式）
#[tauri::command]
fn game_monitor_start(mut cfg: GmCfg, app: tauri::AppHandle) -> Result<String, String> {
    if cfg.windows.is_empty() { return Err("未选择监控窗口".into()); }
    // 旧结构 → 通用规则转换（wave_clicks/text_clicks 各转一条 rule，动作序列 = points 顺序点击）
    for w in cfg.windows.iter_mut() {
        let mut rules = std::mem::take(&mut w.rules);
        for wc in &w.wave_clicks {
            let actions: Vec<GmAction> = wc.points.iter().map(|p| GmAction::Click {
                x: p.x, y: p.y, times: p.times, gap_ms: p.gap_ms,
            }).collect();
            rules.push(GmRule {
                trigger: GmTrigger::Wave { wave: wc.wave },
                actions,
                cooldown_sec: 0,
                enabled: true,
            });
        }
        for tc in &w.text_clicks {
            let actions: Vec<GmAction> = tc.points.iter().map(|p| GmAction::Click {
                x: p.x, y: p.y, times: p.times, gap_ms: p.gap_ms,
            }).collect();
            rules.push(GmRule {
                trigger: GmTrigger::Text { region: tc.region, keyword: tc.keyword.clone() },
                actions,
                cooldown_sec: tc.cooldown_sec,
                enabled: tc.enabled,
            });
        }
        w.rules = rules;
        w.wave_clicks.clear();
        w.text_clicks.clear();
    }
    for (i, w) in cfg.windows.iter().enumerate() {
        if w.region[2] <= 0.0 || w.region[3] <= 0.0 {
            return Err(format!("第{}个窗口未配置波数识别区域", i + 1));
        }
        // 规则校验：启用中的规则必须有动作；text 触发需有效识别区域 + 关键词
        for rule in w.rules.iter().filter(|r| r.enabled) {
            if rule.actions.is_empty() {
                return Err(format!("第{}个窗口有启用的规则没有配置任何动作", i + 1));
            }
            if let GmTrigger::Text { region, keyword } = &rule.trigger {
                if region[2] <= 0.0 || region[3] <= 0.0 {
                    return Err(format!("第{}个窗口的文字规则「{}」未框选识别区域", i + 1, keyword));
                }
                if keyword.trim().is_empty() {
                    return Err(format!("第{}个窗口有文字规则没填关键词", i + 1));
                }
            }
        }
    }
    let interval = cfg.interval_sec.clamp(1, 30);
    let nwin = cfg.windows.len();
    let nclick = cfg.windows.iter().map(|w| w.rules.iter().filter(|r| r.enabled).count()).sum::<usize>();
    let gen = GM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    GM_RUN.store(true, Ordering::SeqCst);
    GM_MUTE.store(false, Ordering::SeqCst); // 新会话默认开声（暂停状态不跨会话残留）
    let app_h = app.clone();
    std::thread::spawn(move || gm_monitor_loop(app_h, cfg, gen, interval));
    // 托盘先行亮「监控中」提示（识别到首个波数后自动换成角标数字）+ 菜单加暂停播报/停止监控项
    gm_apply_tray_menu(&app, true, false);
    if let Some(tray) = TRAY.get() {
        let _ = tray.set_tooltip(Some("塔防精灵助手 — 波数监控运行中…"));
    }
    let _ = app.emit("gm-state", serde_json::json!({ "running": true, "muted": false }));
    Ok(format!("监控已启动：{} 个窗口，每 {} 秒识别一次（最小化/关闭窗口也持续播报）", nwin, interval)
        + (if nclick > 0 { format!("，含 {} 条自动执行规则", nclick) } else { String::new() }).as_str())
}

/// 停止波数监控：线程在 100ms 内感知退出，托盘恢复默认图标与菜单
#[tauri::command]
fn game_monitor_stop(app: tauri::AppHandle) -> Result<(), String> {
    GM_RUN.store(false, Ordering::SeqCst);
    gm_restore_tray(&app);
    let _ = app.emit("gm-state", serde_json::json!({ "running": false }));
    Ok(())
}

/// 通用点击命令（前端可控）：在指定窗口的比例坐标处点击。
/// 🎯 架构定位（2026-09-01 用户提议）：Rust 只做「点击执行器」原语，点哪里/怎么点/什么顺序由前端决定
///    ——前端逻辑热更新免打包。用途：①面板「试点击」当场验证位置 ②前端自定义联动（收到 gm-wave
///    事件后自行编排点击序列）③未来扩展不走打包。
/// ⚠️ 与监控循环内的自动点击同用 mouse_event（真实鼠标），窗口需可见/未最小化/未被遮挡。
#[tauri::command]
fn gm_click(hwnd: usize, x: f64, y: f64, times: Option<u32>, gap_ms: Option<u64>) -> Result<String, String> {
    let times = times.unwrap_or(1).clamp(1, 10);
    let gap = gap_ms.unwrap_or(200).max(50);
    if !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) {
        return Err("点击位置必须在 0~1 比例范围内".into());
    }
    let (sx, sy) = gm_win_point_to_screen(hwnd, x, y)?;
    gm_click_at(sx, sy, times, gap);
    Ok(format!("已点击 ({:.3},{:.3}) ×{} 次", x, y, times))
}

/// 查询监控是否运行中（前端打开面板时恢复按钮状态用）
#[tauri::command]
fn game_monitor_status() -> bool {
    GM_RUN.load(Ordering::SeqCst)
}

/// 下载新版安装包到本机固定目录（返回保存路径）。
/// 🔴 2026-08-29 新增：网页里的 fetch 拉 Gitee 发行版直链会被 CORS/重定向拦掉（报 "Failed to fetch"），
///    所以下载必须由 Rust 侧用 reqwest 完成（无跨域限制、走 Gitee 国内快）。
///    下载完由前端调 start_umi_ocr 启动安装，安装程序接管：关闭本程序 → 安装 → 自动重启。
/// 🔴 2026-08-31 目录收编：更新包下载目录从 D:\withfriends\塔防精灵助手更新（独立目录）
///    移到软件数据目录下（D:\withfriends\塔防精灵助手数据\update），与 data/skin、stats、
///    backups 等子目录并列，数据目录成为唯一软件根。旧目录遗留的旧安装包可手动删除。
#[tauri::command]
async fn download_installer(app: tauri::AppHandle, url: String, file_name: String) -> Result<String, String> {
    let base = r"D:\withfriends\塔防精灵助手数据\update";
    std::fs::create_dir_all(base).map_err(|e| format!("创建更新目录失败: {}", e))?;
    let safe_name = if file_name.is_empty() { "tfjl-assistant-setup.exe".to_string() } else { file_name };
    let save_path = format!("{}\\{}", base, safe_name);

    let client = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))?;

    let _ = app.emit("installer-download-progress", serde_json::json!({"stage":"start","url":url}));
    let data = fetch_to_vec(&client, &url, &app, 0, 0, "installer").await
        .map_err(|e| format!("下载安装包失败: {}。请检查网络或稍后重试", e))?;
    if data.len() < 1024 * 100 {
        return Err(format!("下载内容异常（仅 {} 字节），可能拿到错误页面，已中止", data.len()));
    }

    tokio::fs::write(&save_path, &data).await.map_err(|e| format!("写入安装包失败: {}", e))?;
    let _ = app.emit("installer-download-progress", serde_json::json!({"stage":"done","path":save_path}));
    Ok(save_path)
}

/// 弹出系统文件选择框，让用户选择本机 Umi-OCR.exe（返回完整路径，WebView 无法直接拿本地路径）
#[tauri::command]
async fn pick_umi_ocr_exe(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let _ = app.dialog()
        .file()
        .set_title("选择 Umi-OCR.exe")
        .add_filter("Umi-OCR 可执行文件", &["exe"])
        .pick_file(move |p| {
            let result = p.map(|f| f.to_string());
            let _ = tx.send(result);
        });
    let result = rx.await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 更新下载走直连，忽略本机残留代理设置（避免 127.0.0.1:7897 失效端口导致下载失败）
    clear_proxy_env();

    // ====================== 单实例锁 ======================
    // 防止多次双击 exe 开出多个进程 → 托盘图标叠加、窗口找不到、退不干净
    const SINGLETON_PORT: u16 = 23456;
    let listener = match TcpListener::bind(("127.0.0.1", SINGLETON_PORT)) {
        Ok(l) => Some(l),
        Err(_) => {
            // 已有实例在运行 → 通知它退出，让本（新）进程接管。
            // 关键：更新后的新版本必须把旧进程顶掉，否则旧进程占着端口、
            // 新进程发完 "show" 就退出 → 用户永远跑着旧代码（托盘修不好）。
            if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", SINGLETON_PORT)) {
                let _ = stream.write_all(b"replace");
            }
            // 等待旧实例释放端口（抢不到就重试几次）
            let mut taken = None;
            for _ in 0..10 {
                std::thread::sleep(std::time::Duration::from_millis(300));
                if let Ok(l) = TcpListener::bind(("127.0.0.1", SINGLETON_PORT)) {
                    taken = Some(l);
                    break;
                }
            }
            if let Some(l) = taken {
                Some(l)
            } else {
                // 实在抢不到端口：仅让旧窗口弹出，避免双开
                if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", SINGLETON_PORT)) {
                    let _ = stream.write_all(b"show");
                }
                std::process::exit(0);
            }
        }
    };

    // ====================== 构建 Tauri App ======================
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            register_heartbeat,
            open_directory_dialog,
            read_directory,
            read_text_file_auto,
            detect_file_encoding,
            write_text_file,
            append_text_file,
            get_diag_log_dir,
            git_push_fusions,
            git_push_skins,
            flash_tray_icon,
            write_binary_file,
            delete_file,
            rename_file,
            read_image_base64,
            get_app_version,
            check_app_update,
            install_app_update,
            path_exists,
            create_dir,
            show_in_folder,
            umi_ocr,
            start_umi_ocr,
            start_installer_silent,
            pick_umi_ocr_exe,
            open_url,
            find_umi_ocr,
            download_umi_ocr,
            download_skins,
            download_installer,
            publish_skins,
            find_game_windows,
            capture_window_region,
            speak_text,
            game_monitor_start,
            game_monitor_stop,
            game_monitor_status,
            gm_click,
        ])
        .manage(AppState { umi_pid: std::sync::Mutex::new(None), heartbeat: std::sync::Mutex::new(None), checkin_day: std::sync::Mutex::new(None) })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let ver = app.package_info().version.to_string();
                let _ = window.eval(&format!("window.__TAURI_APP__ = true; window.__APP_VERSION = '{}'; console.log('[Tauri] APP标记/版本已注入 v{}');", ver, ver));
            }
            // ============ 系统托盘（最小化到托盘而非退出） ============
            // 菜单统一走 gm_tray_menu（监控运行时热加「暂停播报/停止监控」项，见 gm_apply_tray_menu）
            let menu = gm_tray_menu(&app.handle(), false, false)?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("塔防精灵助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        // 🔴 波数监控托盘快捷控制（2026-09-01）：不开面板直接暂停播报/停止监控
                        "gm-mute-toggle" => {
                            if GM_RUN.load(Ordering::SeqCst) { // 监控未运行（菜单残留竞态）不处理
                                let muted = !GM_MUTE.load(Ordering::SeqCst);
                                GM_MUTE.store(muted, Ordering::SeqCst);
                                gm_apply_tray_menu(app, true, muted);
                                if let Some(tray) = TRAY.get() {
                                    let _ = tray.set_tooltip(Some(if muted {
                                        "塔防精灵助手 — 监控中（播报已暂停，自动点击照常）"
                                    } else {
                                        "塔防精灵助手 — 波数监控运行中…"
                                    }));
                                }
                                let _ = app.emit("gm-mute", serde_json::json!({ "muted": muted }));
                            }
                        }
                        "gm-stop" => {
                            if GM_RUN.load(Ordering::SeqCst) {
                                GM_RUN.store(false, Ordering::SeqCst);
                                gm_restore_tray(app);
                                let _ = app.emit("gm-state", serde_json::json!({ "running": false }));
                            }
                        }
                        // 退出不依赖窗口是否存在，单独处理，保证一定能退出
                        "quit" => {
                            // 彻底退出前关闭本助手自己拉起的 Umi-OCR（含其引擎子进程）
                            let pid = app.state::<AppState>().umi_pid.lock().ok().and_then(|g| *g);
                            kill_umi_ocr(pid);
                            std::process::exit(0);
                        }
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // 仅左键点击打开窗口；右键由 show_menu_on_left_click(false) 弹菜单。
                    // 若此处也对右键开窗，会抢走焦点导致托盘菜单瞬间消失（"弹出来就没了"的根因）
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app_h = tray.app_handle();
                        if let Some(w) = app_h.get_webview_window("main") {
                            let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus();
                        }
                    }
                })
                .build(app.handle())?;
            // 托盘句柄存入全局，供「闪动」命令访问；OnceLock 持有 'static，图标常驻不析构
            let _ = TRAY.set(_tray);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // ============ 托盘常驻心跳线程（每 5 分钟独立保活，不受 WebView 冻结影响） ============
            // 窗口最小化到托盘后 WebView 被冻结、JS 定时器停摆，这里用 Rust 进程级线程直接写 Gist，
            // 保证 24h 挂机最小化也持续在线。仅当已注册身份（前端启动/填 token 后）才生效。
            {
                let hb_app = app.handle().clone();
                std::thread::spawn(move || {
                    // 递增错峰心跳：第1次≈1h、第2次≈2h、第3次≈3h、第4次起≈4h，每次再叠加 0–30 分钟随机抖动。
                    // 间隔从本进程启动(登录)时刻起算，只要用户登录时间不同，心跳相位天然错开，避免挂机用户批量并发触发限流。
                    let mut tick: u32 = 0;
                    loop {
                        let base_min: u64 = match tick { 0 => 60, 1 => 120, 2 => 180, _ => 240 };
                        // 用当前时间纳秒做伪随机种子（避免引入 rand 依赖），取 0–30 分钟抖动
                        let ns = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.subsec_nanos() as u64)
                            .unwrap_or(0);
                        let jitter_min: u64 = ns % 31; // 0..30
                        let next_secs = (base_min + jitter_min) * 60;
                        std::thread::sleep(std::time::Duration::from_secs(next_secs));
                        tick = tick.saturating_add(1);
                        let st = hb_app.state::<AppState>();
                        let ctx_opt = st.heartbeat.lock().unwrap().clone();
                        if let Some(ctx) = ctx_opt {
                            if !ctx.token.is_empty() && !ctx.counter_gist_id.is_empty() {
                                if let Err(e) = tauri::async_runtime::block_on(do_gist_heartbeat(&ctx)) {
                                    eprintln!("[heartbeat] tick failed: {}", e);
                                }
                                // 管理员指令检查：拉取 admin_ctl Gist，命中本设备则唤起窗口 + emit 前端处理
                                if let Err(e) = tauri::async_runtime::block_on(do_admin_ctl_check(&hb_app, &ctx)) {
                                    eprintln!("[heartbeat] admin_ctl check failed: {}", e);
                                }
                            }
                            // 每自然天第一次心跳补一笔登录打卡（托盘挂机设备页面永不重载、原本永远不打卡）。
                            // 内存 day 标志同一天只查一次 Gist；真正去重以 Gist 内容为准（进程重启也不会重复记）。
                            if !ctx.token.is_empty() && !ctx.nick.is_empty() {
                                let now_ms = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_millis() as u64)
                                    .unwrap_or(0);
                                let today = local_day_index(now_ms, ctx.tz_offset_min);
                                let mut day = st.checkin_day.lock().unwrap();
                                if *day != Some(today) {
                                    match tauri::async_runtime::block_on(do_daily_checkin(&ctx, today)) {
                                        Ok(_) => { *day = Some(today); }
                                        Err(e) => eprintln!("[heartbeat] daily checkin failed: {}", e), // 下个 tick 自动重试
                                    }
                                }
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    // ====================== 单实例监听线程 ======================
    // 后台监听 TCP 连接：
    //   "show"    → 弹出窗口（旧实例让位前的兼容信号）
    //   "replace" → 旧实例退出，把端口让给新版本
    if let Some(l) = listener {
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            for stream in l.incoming() {
                let mut buf = [0u8; 16];
                if let Ok(mut s) = stream {
                    if let Ok(n) = s.read(&mut buf) {
                        let msg = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                        if msg == "replace" {
                            // 收到接管信号：退出旧进程，释放端口给新版本
                            let pid = handle.state::<AppState>().umi_pid.lock().ok().and_then(|g| *g);
                            kill_umi_ocr(pid);
                            std::process::exit(0);
                        } else {
                            // 默认视为 "show"
                            if let Some(w) = handle.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                    }
                }
            }
        });
    }

    // ====================== 运行事件循环 ======================
    app.run(|app, event| {
        // 点窗口 X / 关闭请求 → 阻止窗口被销毁，改为隐藏到托盘。
        // 必须在 WindowEvent::CloseRequested 阶段 prevent_close()：
        // 否则窗口已被销毁，之后托盘菜单"显示窗口/退出"会因找不到窗口而全部失灵。
        if let tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { ref api, .. },
            ..
        } = event
        {
            api.prevent_close();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
        }
        // 🔴 点「-」最小化到任务栏：Tauri v2 的 WindowEvent 枚举没有 Minimized 变体（JS 端也无 window-minimize 事件），
        // 但最小化时必触发 Focused(false)。这里在失焦时额外查询 is_minimized() 精确区分「真最小化」与「被其它窗口盖住失焦」
        // （被盖住不能误判后台，否则会误强刷丢数据）。真最小化 → emit tfjl-minimized → 前端置 __tfjlInTray=true → 可静默升级
        // （窗口仍留任务栏图标，符合用户"最小化到任务栏、非关闭"的要求）。重新聚焦 → emit tfjl-restored → 回到前台不升级。
        if let tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::Focused(focused),
            ..
        } = event
        {
            if !focused {
                if let Some(w) = app.get_webview_window("main") {
                    if let Ok(true) = w.is_minimized() {
                        let _ = app.emit("tfjl-minimized", ());
                    }
                }
            } else {
                let _ = app.emit("tfjl-restored", ());
            }
        }
        // 兜底：应用即将退出时也阻止（防止某些路径直接退出导致托盘残留）
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}
