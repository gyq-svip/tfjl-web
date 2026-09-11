# 🧰 tfjl 本地发布工具 · 使用手册

> 打包 / 签名 / 发布 一条龙，把《铁律.md》里的发版流程与历史踩过的坑做成了自动检查。
> **人和 AI 都能用** —— 网页点按钮，或命令行一句话。
> 相关文件：`release_server.js`（服务）、`release_cli.js`（命令行接口）、`release-server.bat`（双击启动）、`.gitignore` 忽略的 `.release-server.json`（运行时凭据）。

---

## 一、两种用法，挑一个

### ① 网页版（人用，推荐）
在仓库根 `d:\tfjl-web`：**双击 `release-server.bat`**（或 `node release_server.js`）
→ 浏览器自动打开 `http://127.0.0.1:8799`

界面顺序：**① 预检 → ② bump 版本 → ③ 打包 → ④ 签名 → ⑤ 发布 → ⑥ 线上验证**
全程实时日志、可「⛔ 中止当前步骤」、发布前会二次确认。

### ② 命令行版（AI 用 / 你也能用）
```powershell
node release_cli.js <命令>
```

| 命令 | 作用 | 退出码 |
|---|---|---|
| `status` | 版本/门禁/打包产物/签名包就绪度 | 0 |
| `preflight` | 跑全部预检（**发布前必跑**） | 0 通过 / 1 有阻断 |
| `build` | 打包（`npx tauri build`，约 3 分钟，实时打印日志） | 0/1 |
| `sign` | 签名（跑 `sign.ps1`） | 0/1 |
| `publish --yes` | 发布（传 Gitee 发行版 + 推 GitHub Pages，**不可逆**） | 0/1 |
| `verify` | 线上验证（只读：updater.json / version.json / Pages / Gitee 直链） | 0/1 |
| `logs --tail 50` | 看最近日志 | 0 |
| `cancel` | 中止当前步骤 | 0 |
| `stop` | 关掉后台服务（并清掉运行时文件） | 0 |
| `url` | 打印网页地址 | 0 |

**选项**：`--port <n>`（默认 8799）· `--json`（机器可读输出）· `--yes`（确认不可逆操作）

**退出码约定**：`0` 成功 · `1` 失败或预检有阻断 · `2` 参数/连接问题

> 服务没在跑会**自动拉起**（不弹浏览器）；端口被占会**自动挑空闲端口**（8799→8800→…）。

---

## 二、典型流程

### A. 只改了前端（`app-*.js` / `index.html` / `sw.js`）—— 不用发版！
前端是线上加载的，**只 `git push` 即可**，不需要打包。
（除非新增/改了 Tauri 命令，那才必须发新版 exe —— 见《铁律》三.1）

### B. 需要发新版 exe（完整流程）
```powershell
node release_cli.js preflight        # 1) 先体检，有阻断就修
node release_cli.js build            # 2) 打包
#   3) 签名（由你执行，AI 不代跑）
.\sign.ps1
node release_cli.js publish --yes    # 4) 发布
node release_cli.js verify           # 5) 线上验证
```
网页版就是照着 ①→⑥ 点按钮，顺序一样。

### C. 版本号怎么改
网页版②那个卡片，或：
```powershell
# 网页版里点「执行 bump」即可（会同时改 tauri.conf.json + Cargo.toml 并单独提交）
```
⚠️ 版本 bump 必须**单独一个 commit**，别混进功能改动（铁律 B）——工具已按此处理。
⚠️ **bump 之后必须重新打包**，否则 `sign.ps1` 会把旧产物按新版本号签名发布（预检会拦这一条）。

---

## 三、预检都查什么（每条都是踩过的坑）

| 检查项 | 对应历史问题 |
|---|---|
| 必需文件齐全 | `sign.ps1` / `publish_update.ps1` 缺失 |
| 工作区是否干净 | 发版 commit 混进无关改动（铁律 A1） |
| `tauri.conf.json` ↔ `Cargo.toml` 版本同步 | 版本漂移 5 个版本（铁律十二.1） |
| updater `endpoints` 不含 `{{current_version}}` | 所有人永远"无更新"（铁律 A3） |
| `installMode = quiet` | 升级弹 NSIS 安装窗口（铁律 A3） |
| `dragDropEnabled = false` | APP 里手牌拖不动（铁律 A5） |
| 签名公钥 = trust-root | 装好的用户拒绝更新 |
| `verify_build.js` 全量 | HTML/JS/Tauri 命令三处一致 |
| 顶层同名函数（同文件/跨文件分开报） | 重复声明让整个 JS 文件静默失效（铁律七.3） |
| exe/sig/zip 未进 git | 安装包入库导致 Pages 部署超时 |
| **GITEE_TOKEN 已配置** | 发布"成功"但用户下不到包（上传被静默跳过） |
| 版本 > `minVersion` 门禁 | 用户装完又被拦，死循环 |
| `version.json` 门禁三字段齐全 | 发布冲突合并时丢门禁 |
| **最新打包产物版本 == 当前版本** | bump 后忘重打包 → 静默发旧包 |
| 根目录签名包就绪 | 发布前缺 exe/.sig |
| tauri CLI 可用 | 依赖没装 |

---

## 四、出问题怎么办

| 现象 | 原因 / 解决 |
|---|---|
| 双击 bat 没反应 / 只打印地址 | 说明服务已在跑，浏览器应自动打开；没开就手动访问打印出的地址 |
| `❌ 端口 8799 被其他程序占用` | 上次没关干净。`netstat -ano \| findstr :8799` 找到 PID → `taskkill /PID <pid> /F`；或换端口 `set TFJL_RELEASE_PORT=8800 && node release_server.js`；或直接用 CLI（会自动换端口） |
| CLI 报"无法连接或拉起服务" | 多为端口被占；CLI 已会自动尝试 8800~8804。仍失败就用 `--port 8810` |
| 预检某项 FAIL | 每项都写了「→ 修复建议」，照着做；不确定就先别打包 |
| 预检 WARN | 多数只是提醒（如工作区有未提交改动），不阻断 |
| 发布时 push 被拒 | `publish_update.ps1` 已内置 rebase 自愈，重跑即可（铁律八.2） |
| 该关服务了 | `node release_cli.js stop`，或直接关掉那个黑窗口 |

---

## 五、🤖 给 AI 的使用指引（人类可跳过）

**结论：发版相关操作优先用 `release_cli.js`，不要手敲 `npx tauri build` / `sign.ps1` / `publish_update.ps1`。**

```bash
node release_cli.js status          # 先看状态
node release_cli.js preflight       # 必跑；退出码 1 = 有阻断，别继续
node release_cli.js build           # 打包
node release_cli.js verify          # 只读验证，随时可跑
node release_cli.js preflight --json   # 需要结构化结果时（可直接 JSON.parse）
```

要点：
1. **看退出码判断成败**，不用解析中文文本：`0` 成功 / `1` 失败或预检阻断 / `2` 参数或连接问题。
2. 服务**没跑会自动拉起**，不要自己去 `node release_server.js`（那会占用当前终端）。
3. `publish` 是**不可逆**操作 → 只在用户明确要求时执行，且必须带 `--yes`。
4. `sign` **不要代跑**（铁律 C3：由用户在本地执行，AI 跑要数分钟）。
5. 纯前端改动**不需要打包**，`git push` 即生效（铁律一.2）。
6. 日志很长时用 `node release_cli.js logs --tail 50`，别把整段贴进对话。
7. 别把 `.release-server.json` 提交进仓库（含一次性 token，已 gitignore）。
8. 需要长期后台驻留时用 `stop` 收尾，避免留下孤儿进程占端口。

**分工（与铁律 C/D 一致）**：AI 可自行跑 `preflight` / `build` / `verify` / `logs`；`publish` 需用户明确指令；`sign` 由用户执行。
