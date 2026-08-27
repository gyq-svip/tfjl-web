# 管理员工具箱 · 管理员指令 Gist 使用说明

## 一、创建指令 Gist（一次性）
1. 在 GitHub 新建一个 **Private Gist**，文件名 `admin_ctl.json`，内容见下方模板。
2. 拿到 Gist ID（URL `https://gist.github.com/<用户名>/<ID>` 里的 `<ID>`）。
3. 把 ID 填到两处（保持一致）：
   - 前端：`webroot/admin-ctl.js` 顶部 `ADMIN_CTL_GIST_ID`
   - Rust：`src-tauri/src/lib.rs` 顶部 `ADMIN_CTL_GIST_ID`
4. 重新打包 / 重新 `npm run dev` 即可生效。

## 二、指令 Gist 结构（admin_ctl.json）
```json
{
  "v": "20260828-1",
  "pollSec": 300,
  "latestSwVersion": "s1.0.392",
  "forceReload": { "to": "all", "ts": 1693270000000 },
  "cmds": {
    "device_xxx": [
      {
        "id": "c1",
        "type": "notify",
        "title": "升级通知",
        "body": "你的版本过旧，请于今日内升级，否则将限制访问。",
        "level": "warn",
        "actions": ["ok"],
        "expire": 1694000000000,
        "thread": [
          { "from": "admin", "ts": 1693270000000, "text": "请尽快升级" }
        ]
      }
    ]
  },
  "blacklist": {
    "device_xxx": { "reason": "检测到异常访问，请联系管理员解除限制。", "until": "forever" }
  },
  "restart": { "to": "device_xxx", "ts": 1693270000000 }
}
```

## 三、字段说明
| 字段 | 作用 |
|---|---|
| `pollSec` | Rust/前端拉取间隔（秒），默认 300，可远程调小应急 |
| `latestSwVersion` | 最新 SW 小版本号，本机旧则自动升级 |
| `forceReload.to` | `all` 全推 或 `device_xxx` 定向；`ts` 为本次指令时间戳（变更即重新触发） |
| `cmds[deviceId]` | 定向指令数组，按 `deviceId` 投放，离线用户上线即收 |
| `cmds[].type` | 目前仅 `notify`（飘窗通知）；可带 `thread` 双向会话 |
| `cmds[].level` | `info` / `warn` / `error`（颜色不同） |
| `cmds[].expire` | 过期时间戳（毫秒），过期自动忽略，支持离线投递 |
| `cmds[].actions` | 含 `"ok"` 显示「知道了」按钮 |
| `blacklist[deviceId]` | 拉黑锁机：`reason` 显示内容，`until` 为 `"forever"` 或时间戳 |
| `restart.to` | `all` 全推 或 `device_xxx` 定向；`ts` 时间戳（变更即重新触发）。Rust 心跳收到后 `app.restart()` 救活假死设备 |

## 四、如何拿到 deviceId（用于定向）
- 设备首次上报诊断后，诊断 Gist 的 `diag-<anonId>.json` 里含 `deviceId` 字段。
- 或直接看诊断面板各设备条目（已显示 deviceId 末 4 位 + 昵称）。

## 五、功能已落地清单
✅ 强制刷新 SW（全推/定向，挂机设备也能收到）
✅ 自动比版本升级（latestSwVersion）
✅ 心跳间隔远程调（pollSec）
✅ 飘屏通知（定向/全推，info/warn/error，含「知道了」+ 会话回复）
✅ 拉黑锁机（soft：全屏遮罩显示联系管理员，不退出，针对异常/搞破坏设备）
✅ 离线用户投递（指令带 expire，上线首跳即收）
✅ Rust 心跳拉取 + 从托盘唤起窗口 + emit 前端弹窗（用户后台也看得到）
✅ 远程重启（restart 指令：Rust 进程级 `app.restart()`，可救活 JS 假死的挂机设备）
✅ 诊断面板新增「Gist 写入点全清单」（7 类写入全部显式标记，杜绝未知操作）

## 六、未做（按约定）
❌ 清缓存 / 任意命令执行（风险高，暂不需要）

## 七、远程重启稳定性说明（2026-08-28 评估）
- `app.restart()` 是 Tauri 官方 API：退出当前进程并由运行时重新拉起，**稳定可靠**。
- 能救活：**JS 主线程假死 / WebView 卡死 / 挂机无响应**（Rust 心跳线程仍活着，能收到指令并执行 restart）。
- 不能救活：Rust 进程本身崩溃/被杀（此时心跳也停了，指令无门可入，只能用户手动重开）。
- 默认不用，仅异常/假死设备由管理员手动定向触发，不丢本地数据（localStorage/磁盘数据保留）。
