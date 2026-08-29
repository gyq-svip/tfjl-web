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
    [string]$GiteeToken = ""
)

$ErrorActionPreference = "Stop"
$RootDir   = "d:\tfjl-web"
$SkinsDir  = Join-Path $RootDir "skins"
$Owner     = "dragon-soars-across-the-world_0"
$Repo      = "tfjl-web"
$Tag       = "v-skins"

function Write-Step($msg) { Write-Host "[SKIN-PUB] $msg" -ForegroundColor Cyan }

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

# ---------------- 2. 生成 manifest 并打包 ----------------
$stamp   = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$pkgName = "skins-$stamp.zip"
$zipPath = Join-Path $RootDir $pkgName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$tmpDir = Join-Path $env:TEMP ("tfjl_skinpack_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$manifest = [ordered]@{
    version  = 1
    packaged = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    heroes   = $heroCount
    skins    = $skinCount
    format   = ".skin"
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
Write-Step "打包完成：$( [math]::Round($zipSize/1MB, 2) ) MB"

if ($SkipUpload) {
    Write-Host "[SKIN-PUB] SkipUpload 已指定，仅打包不上传。包路径: $zipPath" -ForegroundColor Yellow
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
if ($rel.assets -and ($rel.assets | Where-Object { $_.name -eq $pkgName })) {
    Write-Step "$pkgName 已存在于 Gitee release，跳过上传"
} else {
    Write-Step "上传 $pkgName 到 Gitee release $Tag（约 $( [math]::Round($zipSize/1MB,2) ) MB，请稍候）..."
    # curl.exe 进度条走 stderr，在 Stop 模式下会被当成错误中断脚本（publish_update.ps1 踩过的坑），故临时降级
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & curl.exe -X POST "https://gitee.com/api/v5/repos/$Owner/$Repo/releases/$rid/attach_files?access_token=$tok" -F ("file=@" + $zipPath) 2>$null
    $curlExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    if ($curlExit -ne 0) {
        Write-Host "[SKIN-PUB] ERROR: 上传失败 (curl exit=$curlExit)。索引未改动，用户仍用旧包。" -ForegroundColor Red
        exit 1
    }
    Write-Step "上传完成"
}

# ---------------- 4. 校验下载直链（必须大小一致，防止拿到旧包/坏包） ----------------
Write-Step "校验 Gitee 下载直链..."
$dlUrl = "https://gitee.com/$Owner/$Repo/releases/download/$Tag/$pkgName"
try {
    $resp = Invoke-WebRequest -Uri $dlUrl -Method Head -TimeoutSec 60 -ErrorAction Stop
    $remoteSize = [int64]$resp.Headers['Content-Length']
    if ($remoteSize -ne $zipSize) {
        Write-Host "[SKIN-PUB] ERROR: 直链大小不一致（远程 $remoteSize / 本地 $zipSize），已中止（索引未改动）" -ForegroundColor Red
        exit 1
    }
    Write-Step "直链校验通过（$( [math]::Round($remoteSize/1MB,2) ) MB，与本地一致）"
} catch {
    Write-Host "[SKIN-PUB] ERROR: 直链校验失败: $($_.Exception.Message)。索引未改动，用户仍用旧包。" -ForegroundColor Red
    exit 1
}

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
[System.IO.File]::WriteAllText($indexPath, ($indexObj | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

# git 的远程提示走 stderr，Stop 模式下会中断脚本（publish_update.ps1 踩过的坑），故临时降级
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& git -C $RootDir add skins-index.json 2>$null
& git -C $RootDir commit -m "chore: publish skin pack $pkgName ($skinCount skins)" 2>$null
& git -C $RootDir push origin main 2>$null
$gitExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($gitExit -ne 0) { Write-Host "[SKIN-PUB] WARN: git push 失败 (exit=$gitExit)，索引未上线，用户仍用旧包" -ForegroundColor Yellow; exit 1 }

Write-Host "[SKIN-PUB] ✅ 发布完成：$pkgName（$skinCount 个皮肤，$( [math]::Round($zipSize/1MB,2) ) MB）" -ForegroundColor Green
Write-Host "[SKIN-PUB]    索引: https://gyq-svip.github.io/tfjl-web/skins-index.json" -ForegroundColor Green
Write-Host "[SKIN-PUB]    包:   $dlUrl" -ForegroundColor Green
