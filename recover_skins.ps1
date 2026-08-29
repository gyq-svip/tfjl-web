<#
.SYNOPSIS
    紧急恢复本地皮肤：绕过旧版 exe 的 download_skins bug（zip 下到 data\skin 内又被自己删掉）。
    做法：把 zip 下到 data\ 外层 → 校验大小 → 清空 data\skin → 解压 → 统计。
    重新打包 exe（含 Rust 修复）后本脚本可废弃。
#>
$ErrorActionPreference = 'Stop'

$DataRoot = 'D:\withfriends\塔防精灵助手数据\data'
$SkinDir  = Join-Path $DataRoot 'skin'
$ZipPath  = Join-Path $DataRoot 'skins_recover_tmp.zip'
$Owner    = 'dragon-soars-across-the-world_0'
$Repo     = 'tfjl-web'
$Tag      = 'v-skins'

Write-Host "[RECOVER] 读取皮肤索引..." -ForegroundColor Cyan
$idx = Invoke-RestMethod -Uri 'https://gyq-svip.github.io/tfjl-web/skins-index.json' -TimeoutSec 30
$pkg = $idx.package
$url = "https://gitee.com/$Owner/$Repo/releases/download/$Tag/$pkg"
Write-Host ("[RECOVER] 包: " + $pkg + "  (" + $idx.skins + " 张 / " + [math]::Round($idx.size/1MB,2) + " MB)") -ForegroundColor Cyan

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Write-Host "[RECOVER] 从 Gitee 下载..." -ForegroundColor Cyan
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $url -OutFile $ZipPath -TimeoutSec 300
$ProgressPreference = 'Continue'

$got = (Get-Item $ZipPath).Length
Write-Host ("[RECOVER] 下载完成: " + [math]::Round($got/1MB,2) + " MB") -ForegroundColor Cyan
if ($idx.size -gt 0 -and $got -ne [int64]$idx.size) {
    Write-Host ("[RECOVER] ERROR: 大小不一致（下载 $got / 索引 $($idx.size)），已中止，皮肤目录未改动") -ForegroundColor Red
    exit 1
}

Write-Host "[RECOVER] 清空并重建皮肤目录..." -ForegroundColor Cyan
if (Test-Path $SkinDir) { Remove-Item $SkinDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $SkinDir -Force | Out-Null

Write-Host "[RECOVER] 解压中..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
# 逐条解压：ExtractToDirectory 在 .NET Framework 下没有 (ZipArchive, string, bool) 重载，
# 且手动方式可确保中文文件名（含 · 等特殊字符）完整保留。
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
    $n = 0
    foreach ($entry in $zip.Entries) {
        if ([string]::IsNullOrEmpty($entry.Name)) {
            New-Item -ItemType Directory -Path (Join-Path $SkinDir $entry.FullName) -Force | Out-Null
            continue
        }
        $dest = Join-Path $SkinDir $entry.FullName
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
        $n++
    }
    Write-Host ("[RECOVER] 解压条目: " + $n) -ForegroundColor Cyan
} finally {
    $zip.Dispose()
}
Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue

# 统计结果
$skins = @(Get-ChildItem -Path $SkinDir -Recurse -File -Filter '*.skin')
$png   = @(Get-ChildItem -Path $SkinDir -Recurse -File -Filter '*.png')
$heroes = @(Get-ChildItem -Path $SkinDir -Directory)
Write-Host ""
Write-Host ("[RECOVER] ✅ 恢复完成") -ForegroundColor Green
Write-Host ("         英雄目录: " + $heroes.Count) -ForegroundColor Green
Write-Host ("         皮肤文件: " + $skins.Count + "  (.skin)") -ForegroundColor Green
Write-Host ("         残留 png: " + $png.Count) -ForegroundColor $(if ($png.Count -eq 0) { 'Green' } else { 'Yellow' })
