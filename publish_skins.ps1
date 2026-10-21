<#
.SYNOPSIS
    一键打包 skins/ 并发布：皮肤包上传 Gitee 发行版（国内快），索引文件走 GitHub Pages（git push 全自动）。
.DESCRIPTION
    安全顺序（关键，任何一步失败都不会让用户断供）：
      1. 打包 skins/ 内 registry 登记的全部皮肤 -> skins-{时间戳}.zip（绝不含未登记孤儿，零脏数据）
      2. 上传到 Gitee release v-skins
      3. 校验下载直链可达且大小一致
      4. 全部成功后才更新 skins-index.json 并 git push（索引上 Pages）
    => 若上传或校验失败，索引仍指向上一个好包，用户不受影响。
.PARAMETER SkipUpload
    只打包不上传，用于本地验证。
.PARAMETER GiteeToken
    可选。不传则读用户环境变量 GITEE_TOKEN。
#>
param(
    [switch]$SkipUpload,
    [switch]$SkipSpine,
    [string]$GiteeToken = ""
)

$ErrorActionPreference = "Stop"
$RootDir   = "d:\tfjl-web"
$SkinsDir  = Join-Path $RootDir "skins"
$Owner     = "dragon-soars-across-the-world_0"
$Repo      = "tfjl-web"
$Tag       = "v-skins"

function Write-Step($msg) { Write-Host "[SKIN-PUB] $msg" -ForegroundColor Cyan }

# 🔴 本脚本只负责「Gitee 皮肤包」，不碰 GitHub 代码推送。
#    双端是两条独立的线，各自单独操作、互不影响，任一方失败可单独重试：
#      ① 网页版源（GitHub Pages 的 skins/ 散文件）→ 用界面上的「🚀 一键推送到 GitHub / Gitee」按钮
#      ② 客户端源（Gitee release 的 zip 整包）     → 用界面上的「📦 一键打包发布到 Gitee」按钮（本脚本）
#    两者内容同源（都是 .skin），只是分发形态不同。

# ---------------- 1. 收集 registry 登记的文件（只打登记过的，杜绝脏数据） ----------------
Write-Step "读取 registry.json 并校验文件完整性..."
$regPath = Join-Path $SkinsDir "registry.json"
if (-not (Test-Path $regPath)) { Write-Host "[SKIN-PUB] ERROR: 未找到 $regPath" -ForegroundColor Red; exit 1 }
$reg = [System.IO.File]::ReadAllText($regPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

$files = New-Object System.Collections.Generic.List[string]
$missing = New-Object System.Collections.Generic.List[string]
$heroCount = 0; $skinCount = 0
foreach ($prop in $reg.heroes.PSObject.Properties) {
    $hero = $prop.Name; $heroCount++
    foreach ($s in $prop.Value) {
        $skinCount++
        $p = Join-Path $SkinsDir "$hero\$($s.file)"
        if (Test-Path $p) { $files.Add($p) }
        else { $missing.Add("$hero/$($s.file)") }
    }
}
if ($missing.Count -gt 0) {
    Write-Host "[SKIN-PUB] ERROR: registry 登记了但磁盘缺失 $($missing.Count) 个文件，拒绝打包（先修复断裂）" -ForegroundColor Red
    $missing | Select-Object -First 20 | ForEach-Object { Write-Host "         缺失: $_" -ForegroundColor Red }
    exit 1
}
Write-Step "校验通过：$heroCount 个英雄 / $skinCount 个皮肤，零断裂"

# 附带配置文件（融合定义 / 属性 / 基础卡 / 注册表）
foreach ($j in @('registry.json', 'fusions.json', 'cards.json', 'skin-attributes.json')) {
    $p = Join-Path $SkinsDir $j
    if (Test-Path $p) { $files.Add($p) }
}

# ---------------- 1c. 附带英雄骨骼动画资源（data/hero-spine/**，客户端本地化后离线秒开） ----------------
# 🔴 2026-10-21 与皮肤同包发布：桌面版「更新皮肤资源」解压后即本地可用，不再走 github.io 拉动画（国内慢）。
#    包内相对路径保持 data/hero-spine/... 与仓库一致，客户端只需把 base 切到本地皮肤根目录即可。
$spineDir   = Join-Path $RootDir "data\hero-spine"
$spineFiles = @()
$spineMB    = 0
if (-not $SkipSpine) {
    if (Test-Path $spineDir) {
        $spineFiles = @(Get-ChildItem -Path $spineDir -Recurse -File | Where-Object { @('.json', '.txt', '.png') -contains $_.Extension.ToLower() })
        $spineMB = [math]::Round((($spineFiles | Measure-Object -Property Length -Sum).Sum) / 1MB, 2)
        Write-Step "附带动画资源：$($spineFiles.Count) 个文件 / $spineMB MB"
    } else {
        Write-Host "[SKIN-PUB] WARN: 未找到 $spineDir，本次不含动画资源" -ForegroundColor Yellow
    }
}

# ---------------- 2. 生成 manifest 并打包 ----------------
$stamp   = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$pkgName = "skins-$stamp.zip"
$zipPath = Join-Path $RootDir $pkgName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$tmpDir = Join-Path $env:TEMP ("tfjl_skinpack_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$manifest = [ordered]@{
    version   = 1
    packaged  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    heroes    = $heroCount
    skins     = $skinCount
    format    = ".skin"
    spine     = $spineFiles.Count
    spineMB   = $spineMB
} | ConvertTo-Json -Depth 5
$mfPath = Join-Path $tmpDir "manifest.json"
[System.IO.File]::WriteAllText($mfPath, $manifest, [System.Text.UTF8Encoding]::new($false))

Write-Step "打包 $skinCount 个皮肤 -> $pkgName ..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    foreach ($f in $files) {
        $rel = $f.Substring($SkinsDir.Length).TrimStart('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f, $rel, 'Optimal') | Out-Null
    }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $mfPath, 'manifest.json', 'Optimal') | Out-Null
} finally {
    $zip.Dispose()
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
$zipSize = (Get-Item $zipPath).Length
Write-Step "皮肤包完成：$( [math]::Round($zipSize/1MB, 2) ) MB"

# ---------------- 2b. 动画资源【单独打包】（不并入皮肤包，避免突破 Gitee 附件体积上限） ----------------
#    包内路径保持 data/hero-spine/... —— 客户端解压到皮肤根目录后，
#    <皮肤根>\data\hero-spine\... 与原站点路径一致，前端只需把资源 base 切到本地即可。
$spinePkgName = $null; $spineZipPath = $null; $spineZipSize = 0
if ($spineFiles.Count -gt 0) {
    $spinePkgName = "spine-$stamp.zip"
    $spineZipPath = Join-Path $RootDir $spinePkgName
    if (Test-Path $spineZipPath) { Remove-Item $spineZipPath -Force }
    Write-Step "打包动画资源 $($spineFiles.Count) 个文件 -> $spinePkgName ..."
    $z2 = [System.IO.Compression.ZipFile]::Open($spineZipPath, 'Create')
    try {
        foreach ($f in $spineFiles) {
            $rel = "data/hero-spine/" + $f.FullName.Substring($spineDir.Length).TrimStart('\', '/')
            # PNG 已压缩、json/txt 很小：NoCompression 换打包速度
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z2, $f.FullName, $rel, 'NoCompression') | Out-Null
        }
    } finally { $z2.Dispose() }
    $spineZipSize = (Get-Item $spineZipPath).Length
    Write-Step "动画包完成：$( [math]::Round($spineZipSize/1MB, 2) ) MB"
    if ($spineZipSize -gt 95MB) {
        Write-Host "[SKIN-PUB] WARN: 动画包 $( [math]::Round($spineZipSize/1MB,2) ) MB 接近 Gitee 附件上限，若上传失败需分卷" -ForegroundColor Yellow
    }
}

if ($SkipUpload) {
    $msg = "SkipUpload 已指定，仅打包不上传（本地预览）。"
    if ($spinePkgName) { $msg += "`n  皮肤包：$zipPath（$( [math]::Round($zipSize/1MB,2) ) MB，$heroCount 英雄/$skinCount 皮肤）" }
    else { $msg += "`n  皮肤包：$zipPath（$( [math]::Round($zipSize/1MB,2) ) MB，$heroCount 英雄/$skinCount 皮肤）" }
    $msg += "`n  动画包：$spineZipPath（$( [math]::Round($spineZipSize/1MB,2) ) MB，$($spineFiles.Count) 个文件）"
    $msg += "`n确认无误后，去掉 SkipUpload 重新运行即可上传发布（或在管理面板点「📦 一键打包发布到 Gitee」）。"
    Write-Host "[SKIN-PUB] $msg" -ForegroundColor Yellow
    exit 0
}

# ---------------- 3. 上传 Gitee 发行版 ----------------
$tok = if ($GiteeToken) { $GiteeToken } else { [Environment]::GetEnvironmentVariable("GITEE_TOKEN", "User") }
if (-not $tok) {
    Write-Host "[SKIN-PUB] ERROR: 未配置 GITEE_TOKEN。请设置用户环境变量 GITEE_TOKEN，或在「一键打包」界面填写。" -ForegroundColor Red
    exit 1
}

Write-Step "查询/创建 Gitee release $Tag ..."
$rel = $null
try {
    $list = Invoke-RestMethod -Uri "https://gitee.com/api/v5/repos/$Owner/$Repo/releases?access_token=$tok" -Method Get -TimeoutSec 60
    $rel  = $list | Where-Object { $_.tag_name -eq $Tag }
} catch { Write-Host "[SKIN-PUB] WARN: 查 releases 失败: $($_.Exception.Message)" -ForegroundColor Yellow }

if (-not $rel) {
    $body = @{ tag_name = $Tag; target_commitish = "main"; name = $Tag; body = "皮肤包（自动发布）"; prerelease = $false } | ConvertTo-Json -Compress
    # 复用 publish_update.ps1 的经验：Gitee WAF 偶发把 POST /releases 拦成 400 假象（其实已建好），故失败后重试并复查列表
    try {
        $rel = Invoke-RestMethod -Uri "https://gitee.com/api/v5/repos/$Owner/$Repo/releases?access_token=$tok" -Method Post -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 60
    } catch {
        Write-Host "[SKIN-PUB] WARN: 创建 release 失败，重试并复查...: $($_.Exception.Message)" -ForegroundColor Yellow
        try {
            $rel = Invoke-RestMethod -Uri "https://gitee.com/api/v5/repos/$Owner/$Repo/releases?access_token=$tok" -Method Post -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 60
        } catch { $rel = $null }
        if (-not $rel) {
            try {
                $relist = Invoke-RestMethod -Uri "https://gitee.com/api/v5/repos/$Owner/$Repo/releases?access_token=$tok" -Method Get -TimeoutSec 60
                $rel = $relist | Where-Object { $_.tag_name -eq $Tag }
            } catch {}
        }
    }
}
if (-not $rel) { Write-Host "[SKIN-PUB] ERROR: 无法创建/获取 Gitee release $Tag，已中止（索引未改动，用户仍用旧包）" -ForegroundColor Red; exit 1 }

$rid = $rel.id
# 上传 + 直链校验（皮肤包 / 动画包复用同一套：任一失败即中止，索引不动，用户仍用上一个好包）
function Publish-Pack([string]$name, [string]$path, [int64]$size) {
    if ($rel.assets -and ($rel.assets | Where-Object { $_.name -eq $name })) {
        Write-Step "$name 已存在于 Gitee release，跳过上传"
    } else {
        Write-Step "上传 $name（约 $( [math]::Round($size/1MB,2) ) MB，请稍候）..."
        # curl.exe 进度条走 stderr，在 Stop 模式下会被当成错误中断脚本（publish_update.ps1 踩过的坑），故临时降级
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        # 🔴 curl 的响应体会进 stdout；函数里必须 Out-Null，否则会污染返回值（$dlUrl 变成数组）
        & curl.exe -X POST "https://gitee.com/api/v5/repos/$Owner/$Repo/releases/$rid/attach_files?access_token=$tok" -F ("file=@" + $path) 2>$null | Out-Null
        $curlExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        if ($curlExit -ne 0) {
            Write-Host "[SKIN-PUB] ❌ 上传失败 ($name, curl exit=$curlExit)" -ForegroundColor Red
            Write-Host "[SKIN-PUB]    影响范围：索引未改动，客户端仍用上一个好包，功能不受影响。" -ForegroundColor Red
            Write-Host "[SKIN-PUB]    如何补救：检查网络后重新点一次「📦 一键打包发布到 Gitee」；若反复失败可检查 Gitee Token 是否有效。" -ForegroundColor Red
            exit 1
        }
        Write-Step "$name 上传完成"
    }
    $u = "https://gitee.com/$Owner/$Repo/releases/download/$Tag/$name"
    Write-Step "校验直链 $name ..."
    try {
        $resp = Invoke-WebRequest -Uri $u -Method Head -TimeoutSec 60 -ErrorAction Stop
        $remoteSize = [int64]$resp.Headers['Content-Length']
        if ($remoteSize -ne $size) {
            Write-Host "[SKIN-PUB] ERROR: 直链大小不一致（$name：远程 $remoteSize / 本地 $size），已中止（索引未改动）" -ForegroundColor Red
            exit 1
        }
        Write-Step "$name 直链校验通过（$( [math]::Round($remoteSize/1MB,2) ) MB，与本地一致）"
    } catch {
        Write-Host "[SKIN-PUB] ERROR: 直链校验失败 ($name): $($_.Exception.Message)。索引未改动，用户仍用旧包。" -ForegroundColor Red
        exit 1
    }
    return $u
}

$dlUrl = Publish-Pack $pkgName $zipPath $zipSize
$spineUrl = $null
if ($spinePkgName) { $spineUrl = Publish-Pack $spinePkgName $spineZipPath $spineZipSize }

# ---------------- 5. 全部成功后才更新索引并推送 ----------------
Write-Step "更新 skins-index.json 并推送 GitHub Pages..."
$indexPath = Join-Path $RootDir "skins-index.json"
$indexObj = [ordered]@{
    package = $pkgName
    updated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    heroes  = $heroCount
    skins   = $skinCount
    size    = $zipSize
    url     = $dlUrl
}
# 动画资源包（与皮肤包同 release，独立文件；客户端解压到同一皮肤根目录）
if ($spinePkgName) {
    $indexObj.spinePackage = $spinePkgName
    $indexObj.spineSize    = $spineZipSize
    $indexObj.spineUrl     = $spineUrl
    $indexObj.spineFiles   = $spineFiles.Count
}
[System.IO.File]::WriteAllText($indexPath, ($indexObj | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

# git 的远程提示走 stderr，Stop 模式下会中断脚本（publish_update.ps1 踩过的坑），故临时降级
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& git -C $RootDir add skins-index.json 2>$null
& git -C $RootDir commit -m "chore: publish skin pack $pkgName ($skinCount skins)" 2>$null
# 🔴 必须先 pull --rebase 再 push：仓库的 CI 会在每次 push 后自动 bump sw.js 版本号并回推一个提交，
#    导致本地 origin/main 引用必然落后，直接 push 会被 rejected (fetch first)。
& git -C $RootDir pull --rebase origin main 2>$null
& git -C $RootDir push origin main 2>$null
$gitExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($gitExit -ne 0) {
    # 这是唯一的"半成品"状态：包已在 Gitee、但索引没上线。必须说清影响与补救，避免用户以为发布坏了。
    Write-Host "[SKIN-PUB] ⚠️ 皮肤包已成功上传到 Gitee，但索引推送 GitHub Pages 失败 (exit=$gitExit)" -ForegroundColor Yellow
    Write-Host "[SKIN-PUB]    影响范围：客户端暂时仍在使用上一个好包，功能完全正常，只是拿不到这批新皮肤。" -ForegroundColor Yellow
    Write-Host "[SKIN-PUB]    如何补救：网络恢复后重新点一次「📦 一键打包发布到 Gitee」即可（会重新打包并补推索引）。" -ForegroundColor Yellow
    Write-Host "[SKIN-PUB]    已上传的包：$dlUrl" -ForegroundColor Yellow
    exit 1
}

Write-Host "[SKIN-PUB] ✅ 发布完成：$pkgName（$skinCount 个皮肤，$( [math]::Round($zipSize/1MB,2) ) MB）" -ForegroundColor Green
if ($spinePkgName) {
    Write-Host "[SKIN-PUB]    动画包：$spinePkgName（$($spineFiles.Count) 个文件，$( [math]::Round($spineZipSize/1MB,2) ) MB）" -ForegroundColor Green
}
Write-Host "[SKIN-PUB]    索引: https://gyq-svip.github.io/tfjl-web/skins-index.json" -ForegroundColor Green
Write-Host "[SKIN-PUB]    包:   $dlUrl" -ForegroundColor Green
# 本地压缩包只是中间产物，发布成功后清掉（避免仓库目录里堆几十上百 MB）
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
if ($spineZipPath) { Remove-Item $spineZipPath -Force -ErrorAction SilentlyContinue }
