<#
.SYNOPSIS
    tfjl installer signer with pubkey-consistency gate.
    Usage: .\sign.ps1                         (auto-find latest *_x64-setup.exe)
    Usage: .\sign.ps1 tfjl-1.3.4_x64-setup.exe
#>
param([string]$ExeName = "")

$ErrorActionPreference = "Stop"
$RootDir = (Get-Location).Path
$NsisDir = Join-Path $RootDir "src-tauri\target\release\bundle\nsis"
$ConfPath = (Get-ChildItem -Path "src-tauri" -Filter "tauri.conf.json" -Recurse)[0].FullName

# Both tauri.conf.json pubkey and the .sig file are a single-line base64 that decodes
# to the multiline minisign text ("untrusted comment: ...\n<base64blob>\n...").
# The real keynum lives in byte[2..9] of the INNER base64 blob (line 2 of the decoded text).
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

# ---- 0. Restore tauri.key from secure backup (prevents dirty/overwritten key) ----
$SafeB64 = $env:TFJL_SIGN_KEY_B64
if (-not $SafeB64 -or !(Test-Path $SafeB64)) { $SafeB64 = "D:\withfriends\tfjl-sign-key.b64" }
if (Test-Path $SafeB64) {
    try {
        $b64 = ([System.IO.File]::ReadAllText($SafeB64, [System.Text.Encoding]::ASCII)).Trim()
        $decoded = [System.Convert]::FromBase64String($b64)
        $keyText = [System.Text.Encoding]::UTF8.GetString($decoded).Trim()
        if ($keyText -like "*untrusted comment*" -or $keyText -like "*encrypted secret key*") {
            [System.IO.File]::WriteAllText((Join-Path $RootDir "tauri.key"), $keyText + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
            Write-Host "Restored tauri.key from secure backup" -ForegroundColor Green
        } else { Write-Host "Backup content invalid, skip restore" -ForegroundColor Yellow }
    } catch { Write-Host "Restore failed: $_ (will use existing tauri.key)" -ForegroundColor Yellow }
} else {
    Write-Host "No secure backup found ($SafeB64), using existing tauri.key" -ForegroundColor Yellow
}

# ---- 0.5 Pubkey consistency gate: tauri.key's pubkey MUST equal tauri.conf.json pubkey ----
# tauri.key.pub (Tauri output) and conf pubkey are BOTH base64 strings of the minisign public key.
# Compare them directly as base64; extract keynum from the decoded blob.
$confJson = [System.IO.File]::ReadAllText($ConfPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$confPubB64 = $confJson.plugins.updater.pubkey
$keyPubPath = Join-Path $RootDir "tauri.key.pub"
if (-not (Test-Path $keyPubPath)) {
    Write-Host "ERROR: missing tauri.key.pub, cannot verify pubkey consistency. Regenerate keypair first." -ForegroundColor Red
    exit 1
}
$keyPubB64 = [System.IO.File]::ReadAllText($keyPubPath, [System.Text.Encoding]::UTF8).Trim()
if ($keyPubB64 -ne $confPubB64) {
    $k1 = Get-KeynumFromB64 $keyPubB64
    $k2 = Get-KeynumFromB64 $confPubB64
    Write-Host "ERROR: signing key pubkey ($k1) != app trust-root pubkey ($k2)!" -ForegroundColor Red
    Write-Host "       Signing with this key will be rejected by installed users." -ForegroundColor Red
    Write-Host "       Use the tauri.key matching the pubkey, and keep the secure backup in sync." -ForegroundColor Red
    exit 1
}
$kConf = Get-Keynum $confPubB64
Write-Host "Pubkey consistency OK (keynum=$kConf)" -ForegroundColor Green

# ---- 1. Clean key (strip BOM, write no-BOM) ----
$keyPath = Join-Path $RootDir "tauri.key"
$raw = [System.IO.File]::ReadAllText($keyPath, [System.Text.Encoding]::UTF8)
$clean = $raw.Trim()
if ($clean.Length -gt 0 -and $clean[0] -eq [char]0xFEFF) { $clean = $clean.Substring(1) }
[System.IO.File]::WriteAllText($keyPath, $clean, [System.Text.UTF8Encoding]::new($false))
Write-Host "Key cleaned, length: $($clean.Length)" -ForegroundColor Green

# ---- 2. Find exe to sign ----
if ($ExeName -eq "") {
    # 自动定位最新中文构建产物（用通配避开 PowerShell 中文文件名编码坑），
    # 复制为根目录英文包名 tfjl-assistant_{ver}_x64-setup.exe（publish_update.ps1 需要此名），
    # 随后直接对英文包签名，一步产出 exe + .sig。
    $cnExes = @(Get-ChildItem "$NsisDir\*_x64-setup.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "tfjl-sign-temp.exe" } | Sort-Object LastWriteTime -Descending)
    if ($cnExes.Count -eq 0) {
        Write-Host "No *_x64-setup.exe found in $NsisDir" -ForegroundColor Red
        Get-ChildItem "$NsisDir\*.exe" | Select-Object Name, LastWriteTime
        exit 1
    }
    try { $ver = ([System.IO.File]::ReadAllText($ConfPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json).version }
    catch { Write-Host "无法读取版本号: $ConfPath" -ForegroundColor Red; exit 1 }
    $EngExe = Join-Path $RootDir "tfjl-assistant_$($ver)_x64-setup.exe"
    Copy-Item $cnExes[0].FullName $EngExe -Force
    Write-Host "Auto: $($cnExes[0].Name) -> $(Split-Path $EngExe -Leaf) (v$ver)" -ForegroundColor Cyan
    $SrcExe = $EngExe
} else {
    $SrcExe = if (Test-Path $ExeName) { (Resolve-Path $ExeName).Path } else { Join-Path $NsisDir $ExeName }
    if (!(Test-Path $SrcExe)) {
        Write-Host "File not found: $SrcExe" -ForegroundColor Red
        exit 1
    }
}

# ---- 3. Copy to plain-ASCII temp file (avoid Chinese path/filename issues) ----
$TempExe = Join-Path $NsisDir "tfjl-sign-temp.exe"
Copy-Item $SrcExe $TempExe -Force
Write-Host "Temp file: tfjl-sign-temp.exe" -ForegroundColor Cyan

# ---- 4. Sign ----
$env:TAURI_SIGNING_PRIVATE_KEY = $clean
Write-Host "Signing ..." -ForegroundColor Yellow
npx tauri signer sign --private-key "$clean" "$TempExe"

# ---- 5. Result + final verify ----
$sigPath = "$TempExe.sig"
if (Test-Path $sigPath) {
    $finalSig = "$SrcExe.sig"
    Move-Item $sigPath $finalSig -Force
    Remove-Item $TempExe -Force

    $sigContent = [System.IO.File]::ReadAllText($finalSig, [System.Text.Encoding]::ASCII)
    $sigKeynum = Get-Keynum $sigContent
    if ($sigKeynum -ne $kConf) {
        Write-Host "ERROR: produced .sig pubkey ($sigKeynum) != trust-root ($kConf), invalid signature!" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "Sign success and verified!" -ForegroundColor Green
    Write-Host "sig: $finalSig  ($($sigContent.Length) chars)" -ForegroundColor White
    Write-Host ""
    Write-Host "--- signature content (publish_update.ps1 reads it automatically) ---" -ForegroundColor Cyan
    Write-Host $sigContent
} else {
    Write-Host "Sign failed, no .sig produced" -ForegroundColor Red
    Remove-Item $TempExe -Force -ErrorAction SilentlyContinue
    exit 1
}
