<#
.SYNOPSIS
    tfjl one-shot publisher: write updater.json/version.json + push installer + verify signature.
    Prereq: npx tauri build done, english exe copied to repo root, and .\sign.ps1 <englishExe> done.
    Usage: .\publish_update.ps1
#>
$ErrorActionPreference = "Stop"
$RootDir = (Get-Location).Path
$ConfPath = (Get-ChildItem -Path "src-tauri" -Filter "tauri.conf.json" -Recurse)[0].FullName

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

function Publish-GiteeRelease($ver, $exePath) {
    $tok = [Environment]::GetEnvironmentVariable("GITEE_TOKEN", "User")
    if (-not $tok) { Write-Host "WARN: GITEE_TOKEN 未设置，跳过 Gitee 发行版上传（请手动上传 exe 到发行版 v$ver）" -ForegroundColor Yellow; return }
    $owner = "dragon-soars-across-the-world_0"; $repo = "tfjl-web"; $tag = "v$ver"; $fname = Split-Path $exePath -Leaf
    try { $list = Invoke-RestMethod -Uri ("https://gitee.com/api/v5/repos/$owner/$repo/releases?access_token=$tok") -Method Get } catch { Write-Host "WARN: 查 Gitee releases 失败: $($_.Exception.Message)" -ForegroundColor Yellow; return }
    $rel = $list | Where-Object { $_.tag_name -eq $tag }
    if (-not $rel) {
        $body = @{ tag_name=$tag; target_commitish="main"; name=$tag; body="auto update $tag"; prerelease=$false } | ConvertTo-Json -Compress
        try { $rel = Invoke-RestMethod -Uri ("https://gitee.com/api/v5/repos/$owner/$repo/releases?access_token=$tok") -Method Post -ContentType "application/json; charset=utf-8" -Body $body } catch { Write-Host "WARN: 创建 Gitee release 失败: $($_.Exception.Message)" -ForegroundColor Yellow; return }
    }
    $rid = $rel.id
    if ($rel.assets -and ($rel.assets | Where-Object { $_.name -eq $fname })) {
        Write-Host "exe 已在 Gitee release $tag，跳过上传" -ForegroundColor Cyan
    } else {
        $up = "https://gitee.com/api/v5/repos/$owner/$repo/releases/$rid/attach_files?access_token=$tok"
        curl.exe -X POST $up -F ("file=@" + $exePath) 2>&1 | Out-Null
        Write-Host "Uploaded $fname -> Gitee release $tag" -ForegroundColor Green
    }
}

$confJson = [System.IO.File]::ReadAllText($ConfPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$ver = $confJson.version
$confPubB64 = $confJson.plugins.updater.pubkey
$kConf = Get-Keynum $confPubB64
Write-Host "Version: $ver  trust-root keynum=$kConf" -ForegroundColor Cyan

$ExeName = "tfjl-assistant_$($ver)_x64-setup.exe"
$ExePath = Join-Path $RootDir $ExeName
$SigPath = "$ExePath.sig"
if (-not (Test-Path $ExePath)) {
    Write-Host "ERROR: $ExeName not found in repo root. Build + copy english exe first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $SigPath)) {
    Write-Host "ERROR: $ExeName.sig not found. Run .\sign.ps1 $ExeName first." -ForegroundColor Red
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
        windows = [ordered]@{
            url       = $rawUrl
            signature = $sigContent
        }
    }
}
$versionJson = [ordered]@{
    version     = $ver
    notes       = "auto update v$ver"
    pub_date    = $pubDate
    downloadUrl = $rawUrl
}

$updaterPath = Join-Path $RootDir "updater.json"
$versionPath = Join-Path $RootDir "version.json"
[System.IO.File]::WriteAllText($updaterPath, ($updater | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($versionPath, ($versionJson | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote updater.json / version.json" -ForegroundColor Green

Set-Location $RootDir
# exe 由 Gitee 发行版托管（免登录下载、不入库二进制）；仅 updater.json/version.json 入库
Publish-GiteeRelease $ver $ExePath
git add updater.json version.json
git commit -m "release v$ver (updater + pages; installer on gitee release)"
git push gitee main
git push origin main
Write-Host "Published: v$ver (updater.json->Pages, installer->Gitee release)" -ForegroundColor Green
Write-Host "NOTE: exe 已上传 Gitee 发行版 v$ver（免登录）；旧根用户仍需手动重装一次。" -ForegroundColor Yellow
