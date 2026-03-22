# Kill process on backend dev port, then start API (port from config/dev-ports.json)
$portsPath = Join-Path $PSScriptRoot "config\dev-ports.json"
if (-not (Test-Path $portsPath)) {
    Write-Host "Missing $portsPath" -ForegroundColor Red
    exit 1
}
$ports = Get-Content $portsPath -Raw | ConvertFrom-Json
$backendPort = [int]$ports.backend
Write-Host "Killing any process on backend port $backendPort (from dev-ports.json)..." -ForegroundColor Yellow

$connections = netstat -ano | findstr ":$backendPort "
if ($connections) {
    $connections | ForEach-Object {
        if ($_ -match '\s+(\d+)\s*$') { $matches[1] }
    } | Select-Object -Unique | ForEach-Object {
        if ($_) {
            Write-Host "  Killing PID $_ on port $backendPort" -ForegroundColor Red
            taskkill /F /PID $_ 2>$null | Out-Null
        }
    }
}
Start-Sleep -Seconds 2
Write-Host "Starting server (PORT env or port $backendPort from dev-ports.json)..." -ForegroundColor Green
node --watch server.js
