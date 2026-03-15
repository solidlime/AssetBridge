# AssetBridge セットアップ + 起動スクリプト（Windows PowerShell ネイティブ版）
# 使用方法: .\scripts\setup.ps1 [OPTIONS]
#
#   -NoStart      セットアップのみ実行（サーバー起動しない）
#   -InstallDeps  依存関係を強制的に再インストール（初回は自動検出）
#   -WithMcp      MCP Server も起動する（デフォルト: 無効）
#   -WithDiscord  Discord Bot も起動する（デフォルト: 無効）
#   -AutoScrape   起動後にスクレイパーを自動実行する（デフォルト: 無効）
#
# 実行ポリシー解除が必要な場合:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

param(
    [switch]$NoStart,
    [switch]$InstallDeps,
    [switch]$WithMcp,
    [switch]$WithDiscord,
    [switch]$AutoScrape
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$VenvDir = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

# .venv と node_modules が両方存在する場合はインストール済みとみなしてスキップ
# -InstallDeps フラグで強制再インストールが可能
$SkipDeps = (Test-Path $VenvDir) -and (Test-Path (Join-Path $ProjectRoot "apps\web\node_modules"))
if ($InstallDeps) { $SkipDeps = $false }

# =========================================================
# カラー出力ユーティリティ
# =========================================================
function Info    { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Success { param($msg) Write-Host "[OK]   $msg" -ForegroundColor Green }
function Warn    { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Err     { param($msg) Write-Host "[ERR]  $msg" -ForegroundColor Red }

# =========================================================
# ポート解放ユーティリティ（taskkill /F /T でプロセスツリーごと強制終了）
# =========================================================
function Kill-Port {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($conn) {
        Info "ポート $Port の既存プロセスツリー (PID: $($conn.OwningProcess)) を終了中..."
        & taskkill /F /T /PID $conn.OwningProcess 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }
}

function Kill-Tree {
    param([System.Diagnostics.Process]$Proc)
    if ($null -eq $Proc -or $Proc.HasExited) { return }
    & taskkill /F /T /PID $Proc.Id 2>$null | Out-Null
}

Write-Host ""
Write-Host "========================================"
Write-Host "  AssetBridge セットアップ"
Write-Host "========================================"
Write-Host ""

# =========================================================
# Step 1: Python バージョン確認
# =========================================================
Info "Step 1/6: Python バージョン確認"

$PythonCmd = $null
foreach ($cmd in @("python", "python3", "python3.12", "python3.11")) {
    try {
        $ver = & $cmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        $parts = $ver -split "\."
        if ([int]$parts[0] -eq 3 -and [int]$parts[1] -ge 11) {
            $PythonCmd = $cmd
            $PythonVer = $ver
            break
        }
    } catch { }
}

if (-not $PythonCmd) {
    Err "Python 3.11 以上が必要です。インストールしてください。"
    exit 1
}
Success "Python $PythonVer ($PythonCmd)"

# =========================================================
# Step 2: 仮想環境の作成・確認
# =========================================================
Info "Step 2/6: 仮想環境のセットアップ"
if (-not (Test-Path $VenvDir)) {
    Info ".venv を作成中..."
    & $PythonCmd -m venv $VenvDir
    Success ".venv 作成完了"
} else {
    Success ".venv は既に存在します"
}
Success "仮想環境確認完了: $VenvDir"

# =========================================================
# Step 3: Python 依存関係インストール
# =========================================================
Info "Step 3/6: Python 依存関係インストール"
if (-not $SkipDeps) {
    & $VenvPip install --quiet --upgrade pip
    & $VenvPip install --quiet -r (Join-Path $ProjectRoot "requirements.txt")
    Success "Python パッケージインストール完了"

    # Playwright ブラウザ確認
    $playwrightOk = & $VenvPython -c @"
try:
    from playwright.sync_api import sync_playwright
    p = sync_playwright().__enter__()
    p.chromium.launch().close()
    p.__exit__(None, None, None)
    print('ok')
except:
    print('ng')
"@ 2>$null
    if ($playwrightOk -ne "ok") {
        Info "Playwright Chromium をインストール中..."
        & (Join-Path $VenvDir "Scripts\playwright.exe") install chromium
        Success "Playwright Chromium インストール完了"
    } else {
        Success "Playwright Chromium は既にインストール済み"
    }
} else {
    Info "依存関係は既にインストール済みです（-InstallDeps で強制再インストール）"
}

# =========================================================
# Step 4: pnpm / Node.js 確認
# =========================================================
Info "Step 4/6: pnpm / Node.js 確認"
$pnpmAvailable = $false
try {
    $pnpmVer = pnpm --version 2>$null
    Success "pnpm $pnpmVer"
    $pnpmAvailable = $true
    if (-not $SkipDeps) {
        try { pnpm install --frozen-lockfile 2>$null } catch { pnpm install }
        Success "pnpm パッケージインストール完了"
    }
} catch {
    Warn "pnpm が見つかりません。Web UI を使用する場合は npm install -g pnpm でインストールしてください。"
}

# =========================================================
# Step 5: 環境変数ファイル確認
# =========================================================
Info "Step 5/6: 環境変数ファイル確認"
$EnvFile = if ($env:ASSETBRIDGE_ENV_PATH) {
    $env:ASSETBRIDGE_ENV_PATH
} else {
    Join-Path $env:USERPROFILE ".assetbridge\.env"
}

if (-not (Test-Path $EnvFile)) {
    Warn "~/.assetbridge/.env が見つかりません"
    Info "setup_secrets.py を実行して作成します..."
    & $VenvPython (Join-Path $ProjectRoot "scripts\setup_secrets.py")
    Write-Host ""
    Warn "================================================"
    Warn "  重要: $EnvFile を開いて"
    Warn "  MF_EMAIL / MF_PASSWORD 等を設定してください"
    Warn "================================================"
    Write-Host ""
    Read-Host "設定が完了したら Enter を押してください"
} else {
    Success "環境変数ファイル確認済み: $EnvFile"
}

# .env を読み込んで環境変数に展開（CRLF 対応）
# クォートを除去後、インラインコメント（スペース + # ...）も除去する。
# 例: API_KEY=abc123   # コメント → "abc123" として取得される。
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.TrimEnd("`r")
    if ($line -match "^([^#=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $raw = $matches[2].Trim().Trim('"').Trim("'")
        # インラインコメント（スペース1個以上 + # で始まる部分）を除去
        $val = ($raw -split '\s+#')[0].Trim()
        $envVars[$key] = $val
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

# API_KEY が未設定なら生成
if (-not $envVars["API_KEY"]) {
    $ApiKey = & $VenvPython -c "import secrets; print(secrets.token_urlsafe(32))"
    Add-Content -Path $EnvFile -Value "`nAPI_KEY=$ApiKey"
    [System.Environment]::SetEnvironmentVariable("API_KEY", $ApiKey, "Process")
    Info "API_KEY を生成して .env に保存しました"
} else {
    $ApiKey = $envVars["API_KEY"]
}

# apps/web/.env.local に接続情報を書き込み
$ApiPort = if ($envVars["API_PORT"]) { $envVars["API_PORT"] } else { "8000" }
$webEnvLocal = Join-Path $ProjectRoot "apps\web\.env.local"
Set-Content -Path $webEnvLocal -Value "NEXT_PUBLIC_API_URL=http://localhost:$ApiPort`nNEXT_PUBLIC_API_KEY=$ApiKey"
Success "apps/web/.env.local 更新済み"

# =========================================================
# Step 6: データベース初期化
# =========================================================
Info "Step 6/6: データベース初期化"
$DbFile = if ($envVars["DATABASE_URL"]) { $envVars["DATABASE_URL"] } else { "sqlite:///./data/assetbridge.db" }
$DbPath = $DbFile -replace "^sqlite:///", ""
if ($DbPath -match "^\./") {
    $DbPath = Join-Path $ProjectRoot ($DbPath -replace "^\./", "")
}

$env:PYTHONPATH = $ProjectRoot
if (-not (Test-Path $DbPath)) {
    Info "データベースを初期化中..."
    & $VenvPython (Join-Path $ProjectRoot "scripts\setup_db.py")
    Success "データベース初期化完了: $DbPath"
} else {
    Success "データベースは既に存在します: $DbPath"
    & $VenvPython (Join-Path $ProjectRoot "scripts\setup_db.py") 2>$null
}

# =========================================================
# セットアップ完了サマリー
# =========================================================
Write-Host ""
Write-Host "========================================"
Write-Host "  セットアップ完了！" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "  設定ファイル:  $EnvFile"
Write-Host "  データベース:  $DbPath"
Write-Host "  仮想環境:      $VenvDir"
Write-Host ""

if ($NoStart) {
    Info "-NoStart: サーバー起動をスキップします"
    Info "起動するには: .\scripts\setup.ps1"
    exit 0
}

# =========================================================
# サーバー起動
# =========================================================
Write-Host "========================================"
Write-Host "  サービス起動"
Write-Host "========================================"
Write-Host ""

$WebPort = if ($envVars["WEB_PORT"]) { [int]$envVars["WEB_PORT"] } else { 3000 }
$ApiPortInt = [int]$ApiPort
$McpPort = if ($envVars["MCP_PORT"]) { [int]$envVars["MCP_PORT"] } else { 8001 }

# ---- 既存プロセスを停止 ----
Info "既存プロセスを確認・停止中..."
Kill-Port $ApiPortInt
Kill-Port $WebPort
if ($WithMcp) { Kill-Port $McpPort }

# ログ保存先
$LogDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$ApiLog    = Join-Path $LogDir "api.log"
$ApiErrLog = Join-Path $LogDir "api.err.log"
$WebLog    = Join-Path $LogDir "web.log"
$WebErrLog = Join-Path $LogDir "web.err.log"

# ---- FastAPI ----
Info "[1/2] FastAPI を起動中 (port $ApiPortInt)..."
$apiDir = Join-Path $ProjectRoot "apps\api"
$ApiFastApi = Start-Process -FilePath $VenvPython `
    -ArgumentList "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "$ApiPortInt", "--reload" `
    -WorkingDirectory $apiDir `
    -RedirectStandardOutput $ApiLog -RedirectStandardError $ApiErrLog `
    -PassThru -WindowStyle Hidden

# FastAPI の起動を最大 30 秒待機
# Invoke-WebRequest は Windows のプロキシ設定に影響を受けてタイムアウトすることがある。
# そのため curl.exe（Windows 10 以降にプリインストール）を優先し、
# 失敗時は System.Net.WebClient にフォールバックする。
$apiReady = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        # 方法1: curl.exe（プロキシ設定を無視して直接接続）
        # Windows では /dev/null ではなく NUL を使ってボディを破棄する
        $curlResult = & curl.exe -s -o NUL -w "%{http_code}" --max-time 2 --noproxy "*" "http://localhost:$ApiPortInt/health" 2>$null
        if ($curlResult -eq "200") { $apiReady = $true; break }
    } catch {}
    try {
        # 方法2: System.Net.WebClient（Invoke-WebRequest より軽量でプロキシ問題が少ない）
        $wc = New-Object System.Net.WebClient
        $wc.Proxy = $null  # プロキシを明示的に無効化
        $body = $wc.DownloadString("http://localhost:$ApiPortInt/health")
        if ($body -match '"ok"') { $apiReady = $true; break }
    } catch {}
}
if ($apiReady) {
    Success "FastAPI 起動完了"
} else {
    Err "FastAPI の起動を確認できませんでした。ログを確認してください: $ApiLog"
}

# ---- Next.js ----
$WebProc = $null
if ($pnpmAvailable) {
    Info "[2/2] Next.js を起動中 (port $WebPort)..."
    $webDir = Join-Path $ProjectRoot "apps\web"
    # Start-Process は .cmd/.ps1 を直接実行できないため cmd.exe 経由で起動
    $WebProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "pnpm", "dev", "--port", "$WebPort" `
        -WorkingDirectory $webDir `
        -RedirectStandardOutput $WebLog -RedirectStandardError $WebErrLog `
        -PassThru -WindowStyle Hidden
    Info "Next.js ログ: $WebLog"
} else {
    Warn "pnpm が見つからないため Next.js をスキップ"
}

# ---- MCP Server（オプション） ----
$McpProc = $null
if ($WithMcp) {
    Info "[+MCP] MCP サーバを起動中 (port $McpPort)..."
    $mcpDir = Join-Path $ProjectRoot "apps\mcp"
    $McpProc = Start-Process -FilePath $VenvPython `
        -ArgumentList "-m", "src.server" `
        -WorkingDirectory $mcpDir `
        -PassThru -WindowStyle Hidden
}

# ---- Discord Bot（オプション） ----
$BotProc = $null
if ($WithDiscord) {
    $discordToken = $envVars["DISCORD_TOKEN"]
    if ($discordToken) {
        Info "[+Discord] Discord Bot を起動中..."
        $botDir = Join-Path $ProjectRoot "apps\discord-bot"
        $BotProc = Start-Process -FilePath $VenvPython `
            -ArgumentList "-m", "src.bot" `
            -WorkingDirectory $botDir `
            -PassThru -WindowStyle Hidden
    } else {
        Warn "[+Discord] DISCORD_TOKEN が未設定のため Discord Bot をスキップ"
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  サービス一覧"
Write-Host "========================================"
Write-Host "  FastAPI Swagger: http://localhost:$ApiPortInt/docs"
Write-Host "  Web Dashboard:   http://localhost:$WebPort"
if ($WithMcp) { Write-Host "  MCP Server:      http://localhost:$McpPort/mcp" }
Write-Host ""
Write-Host "  MCP / Discord Bot は Web UI 設定ページから起動できます"
Write-Host "  スクレイパー: Web UI から手動実行$(if ($AutoScrape) { ' (起動後に自動実行)' } else { '' })"
Write-Host ""
Write-Host "  停止するには各ウィンドウを閉じるか Ctrl+C"
Write-Host "========================================"
Write-Host ""

# 自動スクレイプ（オプション）
if ($AutoScrape) {
    Info "スクレイパーを自動起動します（API 準備完了後）..."
    Start-Job -ScriptBlock {
        param($port, $key)
        for ($i = 0; $i -lt 30; $i++) {
            # Invoke-WebRequest はプロキシ設定の影響でタイムアウトするため curl.exe を使用
            # Windows では /dev/null ではなく NUL を使ってボディを破棄する
            $status = & curl.exe -s -o NUL -w "%{http_code}" --max-time 2 --noproxy "*" "http://localhost:$port/health" 2>$null
            if ($status -eq "200") {
                try {
                    $triggerResult = & curl.exe -s -X POST --max-time 5 --noproxy "*" `
                        -H "X-API-Key: $key" -H "Content-Type: application/json" `
                        "http://localhost:$port/api/scrape/trigger" 2>$null
                    Write-Host "[INFO] スクレイパートリガー送信済み: $triggerResult"
                    break
                } catch { }
            }
            Start-Sleep -Seconds 2
        }
    } -ArgumentList $ApiPortInt, $ApiKey | Out-Null
}

# プロセス監視ループ（Ctrl+C で終了）
Write-Host "サービスが起動しました。Ctrl+C で全サービスを停止します。" -ForegroundColor Green
try {
    while ($true) {
        Start-Sleep -Seconds 5
        if ($ApiFastApi.HasExited) {
            Warn "FastAPI が停止しました (exit: $($ApiFastApi.ExitCode))"
        }
    }
} finally {
    Info "サービスを停止しています..."
    foreach ($proc in @($ApiFastApi, $WebProc, $McpProc, $BotProc)) {
        Kill-Tree $proc
    }
    # 念のため残存ポートを解放
    Kill-Port $ApiPortInt
    Kill-Port $WebPort
    Success "停止完了"
}
