use tauri_plugin_dialog::DialogExt;
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
struct AppState {
    umi_pid: std::sync::Mutex<Option<u32>>,
}

// 托盘图标闪动（需求墙新未读提醒）：保存托盘句柄 + 闪动开关 + 是否已启动闪动任务
static TRAY: OnceLock<TrayIcon> = OnceLock::new();
static FLASH_ON: AtomicBool = AtomicBool::new(false);

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

/// 一键推送 skins/fusions.json 到 GitHub（及 Gitee 镜像）
/// 仅桌面端「卡组管理」调用，免去手动命令行。
/// 仓库级 .git/config 已为 github.com 配置代理；gitee 直连（清空代理）。
#[tauri::command]
fn git_push_fusions() -> Result<String, String> {
    let repo = "d:\\tfjl-web";
    let mut log = String::new();
    // 1. 仅当 fusions.json 有本地改动时才提交
    let status = run_git(repo, &["status", "--porcelain", "skins/fusions.json"])?;
    if !status.trim().is_empty() {
        run_git(repo, &["add", "skins/fusions.json"])?;
        run_git(repo, &["commit", "-m", "chore: 卡组管理一键推送 skins/fusions.json"])?;
        log.push_str("✓ 已提交本地改动。\n");
    } else {
        log.push_str("• fusions.json 无本地改动，跳过提交。\n");
    }
    // 2. push origin main（走仓库默认代理）
    match run_git(repo, &["push", "origin", "main"]) {
        Ok(p1) => { log.push_str("✓ origin/main: "); log.push_str(p1.trim()); log.push('\n'); }
        Err(e) => return Err(format!("push origin/main 失败: {}", e)),
    }
    // 3. push gitee（直连，清空代理）
    match run_git(repo, &["-c", "http.proxy=", "-c", "https.proxy=", "push", "gitee"]) {
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
    // 1) 仅在本地有改动时继续
    let status = run_git(repo, &["status", "--porcelain"])?;
    if status.trim().is_empty() {
        return Ok("• 无本地改动，无需推送。".to_string());
    }
    let mut log = String::new();
    // 2) bump 前端版本号（versionTag + CACHE_VERSION），便于用户刷新识别
    match bump_skin_versions(repo) {
        Ok(_) => log.push_str("✓ 已自增前端版本号。\n"),
        Err(e) => log.push_str(&format!("• 版本号自增跳过（{}）\n", e)),
    }
    // 3) 暂存 skins/ 及前端版本文件
    run_git(repo, &["add", "skins/", "index.html", "sw.js"])?;
    // 4) 提交
    run_git(repo, &["commit", "-m", "feat: 皮肤制作一键推送（自动 bump 版本）"])?;
    log.push_str("✓ 已提交本地改动。\n");
    // 5) push origin main（仓库默认代理）
    match run_git(repo, &["push", "origin", "main"]) {
        Ok(p1) => { log.push_str("✓ origin/main: "); log.push_str(p1.trim()); log.push('\n'); }
        Err(e) => return Err(format!("push origin/main 失败: {}", e)),
    }
    // 6) push gitee（直连，清空代理）
    match run_git(repo, &["-c", "http.proxy=", "-c", "https.proxy=", "push", "gitee"]) {
        Ok(p2) => { log.push_str("✓ gitee: "); log.push_str(p2.trim()); log.push('\n'); }
        Err(e) => { log.push_str("• gitee: 跳过（"); log.push_str(&e); log.push_str("）\n"); }
    }
    Ok(log)
}

/// 自增 index.html 的 versionTag 与 sw.js 的 CACHE_VERSION
fn bump_skin_versions(repo: &str) -> Result<(), String> {
    bump_in_file(&format!("{}\\index.html", repo), "id=\"versionTag\"", ">v", '<')?;
    bump_in_file(&format!("{}\\sw.js", repo), "CACHE_VERSION = 'tfjl-v", "tfjl-v", '\'')?;
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
                    let (w, h) = default.as_ref().map(|i| (i.width(), i.height())).unwrap_or((32, 32));
                    // 透明图标用拥有数据的 Image（new_owned 返回 'static），与 default 生命周期一致
                    let buf = vec![0u8; (w as usize) * (h as usize) * 4];
                    let transparent = tauri::image::Image::new_owned(buf, w, h);
                    let mut show = false;
                    while FLASH_ON.load(Ordering::SeqCst) {
                        let _ = tray.set_icon(if show { default.clone() } else { Some(transparent.clone()) });
                        show = !show;
                        std::thread::sleep(std::time::Duration::from_millis(500));
                    }
                    let _ = tray.set_icon(default);
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

/// 获取 App 版本号（编译时从 Cargo.toml 读取）
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
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
    let mut era = if z >= 0 { z } else { z - 146096 } / 146097;
    let mut doe = (z - era * 146097) as u32;
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
#[tauri::command]
async fn umi_ocr(base64: String, options: serde_json::Value) -> Result<serde_json::Value, String> {
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
async fn download_skins(app: tauri::AppHandle) -> Result<String, String> {
    let base = r"D:\withfriends\塔防精灵助手数据\data\skin";
    let _ = std::fs::create_dir_all(base);
    let zip_path = format!("{}\\skins_download_tmp.zip", base);

    let gitee_tag = "v-skins";
    let pkg = "skins.zip";
    let url = format!("https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/{}/{}", gitee_tag, pkg);

    let client = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))?;

    let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"start","url":url}));
    let data = fetch_to_vec(&client, &url, &app, 0, 0, "skins").await
        .map_err(|e| format!("下载皮肤包失败: {}。请检查网络或稍后重试", e))?;

    tokio::fs::write(&zip_path, &data).await.map_err(|e| e.to_string())?;
    let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"extract"}));

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
            return Err(format!("解压皮肤包失败: {}。可手动下载 skins.zip 解压到 {}", msg, base));
        }
    }
    #[cfg(not(windows))] {
        return Err("当前仅支持 Windows 解压皮肤包".into());
    }

    let _ = std::fs::remove_file(&zip_path);
    let _ = app.emit("skin-download-progress", serde_json::json!({"stage":"done"}));
    Ok(format!("皮肤包已解压到 {}", base))
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
            open_directory_dialog,
            read_directory,
            read_text_file_auto,
            detect_file_encoding,
            write_text_file,
            git_push_fusions,
            git_push_skins,
            flash_tray_icon,
            write_binary_file,
            delete_file,
            rename_file,
            read_image_base64,
            get_app_version,
            path_exists,
            create_dir,
            umi_ocr,
            start_umi_ocr,
            pick_umi_ocr_exe,
            open_url,
            find_umi_ocr,
            download_umi_ocr,
            download_skins,
        ])
        .manage(AppState { umi_pid: std::sync::Mutex::new(None) })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.__TAURI_APP__ = true; console.log('[Tauri] APP标记已注入');");
            }
            // ============ 系统托盘（最小化到托盘而非退出） ============
            let menu = Menu::with_items(app, &[
                &MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?,
                &MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?,
                &MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
            ])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("塔防精灵助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
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
        // 兜底：应用即将退出时也阻止（防止某些路径直接退出导致托盘残留）
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}
