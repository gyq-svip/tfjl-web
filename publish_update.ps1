<#
.SYNOPSIS
    tfjl one-shot publisher: write updater.json/version.json + push installer + verify signature.
    Prereq: npx tauri build done, english exe copied to repo root, and .\sign.ps1 <englishExe> done.
    Usage: .\publish_update.ps1
#>
$ErrorActionPreference = "Stop"
# 发布层小版本号（可选）。热修小版本叠在大版本上，如 2.0.13.4。留空则用 build 版本。
# 用法： .\publish_update.ps1 -PublishVer 2.0.13.4
$PublishVer = if ($args -match '^-PublishVer$') { $args[($args.IndexOf('-PublishVer'))+1] } else { $env:TFJL_PUBLISH_VER }
$RootDir = (Get-Location).Path
$ConfPath = (Get-ChildItem -Path "src-tauri" -Filter "tauri.conf.json" -Recurse)[0].FullName

# 🔴 强制升级门禁：桌面端最低可用版本。低于此版本的桌面端启动即被拦截（网页版不受影响）。
#    改这里即可调整拦截线；若发布版本低于它，下面的「发版前自检」会直接中止发布。
$MinSupportedVersion = "2.0.25"

function Get-Keynum($b64) {
    $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64.Trim()))
    $inner = ($text.Trim() -split "`n")[1].Trim()
    $blob = [System.Convert]::FromBase64String($inner)
    # minisign stores the 8-byte keynum little-endian; reverse to the human-readable order.
    $kn = $blob[9],$blob[8],$blob[7],$blob[6],$blob[5],$blob[4],$blob[3],$blob[2]
    $sb = New-Object System.Text.StringBuilder
    foreach ($b in $kn) { [void]$sb.Append($b.ToString("X2")) }
    return $sb.ToString()
}

function Publish-GiteeRelease($ver, $exePath, $remoteName) {
    $tok = [Environment]::GetEnvironmentVariable("GITEE_TOKEN", "User")
    if (-not $tok) { Write-Host "WARN: GITEE_TOKEN 未设置，跳过 Gitee 发行版上传（请手动上传 exe 到发行版 v$ver）" -ForegroundColor Yellow; return }
    $owner = "dragon-soars-across-the-world_0"; $repo = "tfjl-web"; $tag = "v$ver"; $fname = if ($remoteName) { $remoteName } else { Split-Path $exePath -Leaf }
    try { $list = Invoke-RestMethod -Uri ("https://gitee.com/api/v5/repos/$owner/$repo/releases?access_token=$tok") -Method Get } catch { Write-Host "WARN: 查 Gitee releases 失败: $($_.Exception.Message)" -ForegroundColor Yellow; return }
    $rel = $list | Where-Object { $_.tag_name -eq $tag }
    if (-not $rel) {
        $body = @{ tag_name=$tag; target_commitish="main"; name=$tag; body="auto update $tag"; prerelease=$false } | ConvertTo-Json -Compress
        # 🔴 Gitee WAF 偶发把 POST /releases 拦成 400 假象（同版本 release 已存在也会 400）。
        # 先重试一次；若仍失败，再查一次 release 列表（可能其实已建好，只是返回被 WAF 干扰），
        # 仍查不到才放弃上传并告警，绝不直接 return 导致 exe 漏传。
        try { $rel = Invoke-RestMethod -Uri ("https://gitee.com/api/v5/repos/$owner/$repo/releases?access_token=$tok") -Method Post -ContentType "application/json; charset=utf-8" -Body $body } catch {
            Write-Host "WARN: 创建 Gitee release 首次失败: $($_.Exception.Message)，重试一次…" -ForegroundColor Yellow
            try { $rel = Invoke-RestMethod -Uri ("https://gitee.com/api/v5/repos/$owner/$repo/releases?access_token=$tok") -Method Post -ContentType "application/json; charset=utf-8" -Body $body } catch { $rel = $null }
            if (-not $rel) {
                try { $relist = Invoke-RestMethod -Uri ("https://gitee.com/api/v5/repos/$owner/$repo/releases?access_token=$tok") -Method Get; $rel = $relist | Where-Object { $_.tag_name -eq $tag } } catch {}
            }
            if (-not $rel) { Write-Host "ERROR: 创建 Gitee release 失败（已重试），exe 未能上传，请手动传 $fname 到发行版 v$ver" -ForegroundColor Red; return }
        }
    }
    $rid = $rel.id
    if ($rel.assets -and ($rel.assets | Where-Object { $_.name -eq $fname })) {
        Write-Host "exe 已在 Gitee release $tag，跳过上传" -ForegroundColor Cyan
    } else {
        $up = "https://gitee.com/api/v5/repos/$owner/$repo/releases/$rid/attach_files?access_token=$tok"
        # 注意：curl.exe 的进度条走 stderr，PowerShell 会把它当作 NativeCommandError，
        # 在 $ErrorActionPreference="Stop" 下直接中断整个发布脚本（v1.3.7/1.3.8 都翻过此车）。
        # 这里临时降为 Continue 并吞掉 stderr，仅当 curl 真返回非 0 退出码才判为失败。
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & curl.exe -X POST $up -F ("file=@" + $exePath) 2>$null
        $curlExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        if ($curlExit -ne 0) { Write-Host "ERROR: 上传 exe 到 Gitee 失败 (curl exit=$curlExit)" -ForegroundColor Red; exit 1 }
        Write-Host "Uploaded $fname -> Gitee release $tag" -ForegroundColor Green
    }
    # 🔴 2026-08-27 v2.0.16：原生 Tauri updater 的 endpoints 主源指向 Gitee 发行版里的 updater.json
    # （与 exe 同 tag，国内稳）。这里把生成好的 updater.json 也作为附件上传，确保双端（Gitee 主 / GitHub Pages 备）都有。
    $ujName = "updater.json"
    $ujPath = Join-Path $RootDir $ujName
    if (Test-Path $ujPath) {
        if ($rel.assets -and ($rel.assets | Where-Object { $_.name -eq $ujName })) {
            Write-Host "updater.json 已在 Gitee release $tag，跳过上传" -ForegroundColor Cyan
        } else {
            $upUj = "https://gitee.com/api/v5/repos/$owner/$repo/releases/$rid/attach_files?access_token=$tok"
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            & curl.exe -X POST $upUj -F ("file=@" + $ujPath) 2>$null
            $curlExitUj = $LASTEXITCODE
            $ErrorActionPreference = $prevEAP
            if ($curlExitUj -ne 0) { Write-Host "WARN: 上传 updater.json 到 Gitee 失败 (curl exit=$curlExitUj)，原生 updater 主源将缺失，但 GitHub Pages 兜底仍可用" -ForegroundColor Yellow }
            else { Write-Host "Uploaded $ujName -> Gitee release $tag" -ForegroundColor Green }
        }
    } else {
        Write-Host "WARN: 根目录未找到 updater.json，跳过上传（请先确保已生成）" -ForegroundColor Yellow
    }
}

$confJson = [System.IO.File]::ReadAllText($ConfPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
# build 版本(Cargo/Tauri 不支持四段式，用 2.0.13)；发布层小版本号可在调用时覆盖，
# 例如叠在 2.0.13 上的热修小版本 2.0.13.4： .\publish_update.ps1 -PublishVer 2.0.13.4
$buildVer = $confJson.version
$ver = if ($PublishVer) { $PublishVer } else { $buildVer }
Write-Host "build version=$buildVer  publish version=$ver" -ForegroundColor Cyan

# ============ 发版前自检：强制升级门禁一致性 ============
# 语义化版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0（支持 2.0.13 / 2.0.13.4 这类多段版本）
function Compare-Version($a, $b) {
    $pa = ($a -split '\.') | ForEach-Object { [int]($_ -replace '\D', '') }
    $pb = ($b -split '\.') | ForEach-Object { [int]($_ -replace '\D', '') }
    $n = [Math]::Max($pa.Count, $pb.Count)
    for ($i = 0; $i -lt $n; $i++) {
        $x = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
        $y = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
        if ($x -gt $y) { return 1 }
        if ($x -lt $y) { return -1 }
    }
    return 0
}

Write-Host "--- 发版前自检（强制升级门禁）---" -ForegroundColor Cyan
$gateCmp = Compare-Version $ver $MinSupportedVersion
if ($gateCmp -lt 0) {
    Write-Host "ERROR: 本次发布版本 v$ver 低于最低要求 v$MinSupportedVersion，已中止发布！" -ForegroundColor Red
    Write-Host "  若强行发布，用户装完 v$ver 仍会被门禁拦截（要求 >= v$MinSupportedVersion），" -ForegroundColor Red
    Write-Host "  将陷入「装完又被拦、装完又被拦」的死循环。" -ForegroundColor Red
    Write-Host "  处理：把 src-tauri/tauri.conf.json 的 version 提升到 >= $MinSupportedVersion，" -ForegroundColor Red
    Write-Host "        或用 .\publish_update.ps1 -PublishVer <更高版本> 指定发布版本。" -ForegroundColor Red
    exit 1
}
if ($gateCmp -eq 0) {
    Write-Host "⚠️ 发布版本 v$ver 与最低要求相同：该版本本身不会被拦，用户装完可正常使用，安全。" -ForegroundColor Yellow
} else {
    Write-Host "✅ 发布版本 v$ver > 最低要求 v$MinSupportedVersion" -ForegroundColor Green
}
Write-Host "✅ 门禁阈值 minVersion=$MinSupportedVersion 将写入 version.json" -ForegroundColor Green

$confPubB64 = $confJson.plugins.updater.pubkey
$kConf = Get-Keynum $confPubB64
Write-Host "Version: $ver  trust-root keynum=$kConf" -ForegroundColor Cyan

# 本地 exe 名始终用 build 版本(buildVer)，因为 sign.ps1 按 build 版本产出；
# 但远端 tag / url / json version 用发布层 $ver(PublishVer，如 2.0.13.4)。
$LocalExeName = "tfjl-assistant_$($buildVer)_x64-setup.exe"
$ExeName = "tfjl-assistant_$($ver)_x64-setup.exe"
$ExePath = Join-Path $RootDir $LocalExeName
$SigPath = "$ExePath.sig"
if (-not (Test-Path $ExePath)) {
    Write-Host "ERROR: $LocalExeName not found in repo root. Build + copy english exe first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $SigPath)) {
    Write-Host "ERROR: $LocalExeName.sig not found. Run .\sign.ps1 first." -ForegroundColor Red
    exit 1
}

$sigContent = [System.IO.File]::ReadAllText($SigPath, [System.Text.Encoding]::ASCII).Trim()
$kSig = Get-Keynum $sigContent
if ($kSig -ne $kConf) {
    Write-Host "ERROR: .sig pubkey ($kSig) != trust-root ($kConf)! Installed users will reject. Re-sign with matching tauri.key." -ForegroundColor Red
    exit 1
}
Write-Host "Signature verified (keynum=$kSig)" -ForegroundColor Green

$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$rawUrl = "https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/v$ver/$ExeName"

$updater = [ordered]@{
    version  = $ver
    notes    = "auto update v$ver"
    pub_date = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            url       = $rawUrl
            signature = $sigContent
        }
    }
}
$exeSize = if (Test-Path $ExePath) { (Get-Item $ExePath).Length } else { 0 }
$versionJson = [ordered]@{
    version     = $ver
    notes       = "auto update v$ver"
    pub_date    = $pubDate
    downloadUrl = $rawUrl
    size        = $exeSize
    # 🔴 强制升级门禁：低于 minVersion 的桌面端启动即拦截（网页版不拦；断网/缺字段放行）
    #   仅桌面端生效，CI 注入 frontVersion/deployTag 时会合并保留这些字段；Tauri 原生 updater.json 不动，避免破坏其 schema。
    minVersion        = "2.0.25"
    forceUpdate       = $true
    deprecatedMessage = "我们已升级后台数据服务，旧版本无法连接新服务。请更新到最新版后继续使用。"
}

$updaterPath = Join-Path $RootDir "updater.json"
$versionPath = Join-Path $RootDir "version.json"
[System.IO.File]::WriteAllText($updaterPath, ($updater | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($versionPath, ($versionJson | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote updater.json / version.json" -ForegroundColor Green

Set-Location $RootDir
# 🔴 exe 绝不入 git 仓库！Gitee 发行版附件才是唯一下载源（免登录）。
# 历史教训（2026-08-07 修复）：以前这里用 `git add -f $ExePath` 强制绕过 .gitignore，
# 导致 1.3.7~1.3.12 共 6 个安装包（约 27MB）堆积在仓库里，
# 使 GitHub Pages 部署的 artifact 过大、Set up job 阶段超时失败，
# 线上页面从 2026-08-06 起一直卡在旧版本无法更新。
Publish-GiteeRelease $ver $ExePath $ExeName
git add updater.json version.json
git commit -m "release v$ver (updater+pages; installer on gitee release only)"
# git push 的远程提示（如 "remote: Powered by GITEE.COM"）走 stderr，
# 在 $ErrorActionPreference="Stop" 下会被当成 NativeCommandError 中断整个脚本
# （v1.3.8/v1.3.9 都在此翻过车，导致 origin 没推）。这里临时降为 Continue 吞 stderr，
# 仅当 git 真返回非 0 退出码才判失败。
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
# 🔴 只推 origin(GitHub)。Gitee 代码树无人读取（网页/App 都跑 GitHub Pages），
# Gitee 仅用于发行版附件下载，上面 Publish-GiteeRelease 已完成。
# 🔴 2026-08-30：必须用仓库 .git/config 里写死的 127.0.0.1:7897 代理，
#    绝不能加 `-c http.proxy= -c https.proxy=` 去清空它——清代理直连 github.com:443 已连续失败 22 次。
git push origin main 2>$null; $po = $LASTEXITCODE
# 🔴 2026-08-31 自愈推送：打包耗时几分钟，期间 CI 会自动提交（bump sw.js CACHE_VERSION +
#    往 version.json 注入 frontVersion/deployTag），与本地 release 提交分叉 → push 被拒（非快进）。
#    自愈流程：stash 脏区 → pull --rebase → version.json 冲突时智能合并
#    （发布字段取本次 $versionJson，frontVersion/deployTag 保留远端 CI 注入值）→ rebase --continue → 重推。
if ($po -ne 0) {
    Write-Host "WARN: git push 被拒（远端有新提交，多为 CI 自动提交），自动 rebase 自愈重推…" -ForegroundColor Yellow
    $dirty = (git status --porcelain 2>$null | Out-String)
    $stashed = $false
    if ($dirty.Trim()) { git stash 2>$null | Out-Null; $stashed = $true }
    git pull --rebase 2>$null | Out-Null; $pr = $LASTEXITCODE
    if ($pr -ne 0) {
        # version.json 冲突：远端(CI)版含 frontVersion/deployTag，本地版含新发布字段，两者都保留
        # 🔴 2026-09-01 修复：合并键漏了 minVersion/forceUpdate/deprecatedMessage（强制升级门禁三字段），
        #    此前冲突智能合并会丢掉它们 → 线上 version.json 门禁失效（旧版客户端不再被拦）。
        $remoteVer = (git show "origin/main:version.json" 2>$null | Out-String)
        $merged = [ordered]@{}
        foreach ($k in @('version','notes','pub_date','downloadUrl','size','minVersion','forceUpdate','deprecatedMessage')) { $merged[$k] = $versionJson[$k] }
        foreach ($k in @('frontVersion','deployTag')) {
            if ($remoteVer -match ('"' + $k + '"\s*:\s*"([^"]+)"')) { $merged[$k] = $Matches[1] }
        }
        [System.IO.File]::WriteAllText((Join-Path $RootDir "version.json"), ($merged | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
        Write-Host "version.json 冲突已智能合并：发布字段=v$ver，frontVersion/deployTag=CI 注入值" -ForegroundColor Cyan
        git add version.json updater.json 2>$null | Out-Null
        $env:GIT_EDITOR = "true"
        git rebase --continue 2>$null | Out-Null
    }
    if ($stashed) { git stash pop 2>$null | Out-Null }
    git push origin main 2>$null; $po = $LASTEXITCODE
}
$ErrorActionPreference = $prevEAP
if ($po -ne 0) { Write-Host "ERROR: git push origin 失败 (exit=$po)" -ForegroundColor Red; exit 1 }
Write-Host "Published: v$ver (updater.json->Pages; installer->Gitee release only)" -ForegroundColor Green
Write-Host "NOTE: exe 已上传 Gitee 发行版 v$ver（主,免登录）；旧根用户仍需手动重装一次。" -ForegroundColor Yellow

# ============ 自动测试：验证 Gitee 下载直链可达（自动更新可用性自检） ============
# ⚠️ 用 Invoke-WebRequest（Gitee 放行），绝不用 curl.exe（会被 WAF 拦成 400 假象）。
Write-Host "--- 自动测试下载直链 ---" -ForegroundColor Cyan
try {
    $dlUrl = "https://gitee.com/dragon-soars-across-the-world_0/tfjl-web/releases/download/v$ver/tfjl-assistant_$($ver)_x64-setup.exe"
    $r = Invoke-WebRequest -Uri $dlUrl -Method Head -TimeoutSec 30 -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
        $remoteSize = [int64]$r.Headers['Content-Length']
        $localSize = (Get-Item $ExePath).Length
        $remoteMB = [math]::Round($remoteSize/1MB, 2)
        # 🔴 200 只代表直链存在，不代表是本版新包：用本地 exe 字节数比对，不一致则明确标红告警。
        if ($remoteSize -eq $localSize) {
            Write-Host "✅ 自动更新可用：下载直链 HTTP 200，大小 ${remoteMB} MB，与本地签名包一致" -ForegroundColor Green
        } else {
            Write-Host "❌ 直链可达(HTTP 200)但大小不一致！远程 ${remoteMB} MB / 本地 $([math]::Round($localSize/1MB,2)) MB —— 很可能 Gitee 上是旧版本文件，请手动核查发行版 v$ver 附件" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ 下载直链返回状态码 $($r.StatusCode)，请手动核查。" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ 下载直链自检失败：$($_.Exception.Message)（发布可能仍成功，请手动打开 App 点检查更新确认）" -ForegroundColor Yellow
}
