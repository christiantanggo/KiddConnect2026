# Kill process on backend dev port (reads config/dev-ports.json)
$portsPath = Join-Path $PSScriptRoot "config\dev-ports.json"
if (-not (Test-Path $portsPath)) {
    Write-Host "Missing $portsPath" -ForegroundColor Red
    exit 1
}
$ports = Get-Content $portsPath -Raw | ConvertFrom-Json
$port = [int]$ports.backend

Write-Host "Looking for process using backend dev port $port (from dev-ports.json)..." -ForegroundColor Yellow

$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connections) {
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        if ($processId) {
            Write-Host "Killing process $processId..." -ForegroundColor Red
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

$netstatConnections = netstat -ano | findstr ":$port"
if ($netstatConnections) {
    $processIds = $netstatConnections | ForEach-Object {
        if ($_ -match '\s+(\d+)$') { $matches[1] }
    } | Select-Object -Unique

    foreach ($processId in $processIds) {
        if ($processId) {
            Write-Host "Killing process $processId (netstat method)..." -ForegroundColor Red
            taskkill /F /PID $processId 2>$null | Out-Null
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

$stillInUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($stillInUse) {
    Write-Host "Port $port is still in use. Trying one more time..." -ForegroundColor Yellow
    $stillInUse | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

$finalCheck = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($finalCheck) {
    Write-Host "Port $port is still in use. Please manually kill the process." -ForegroundColor Red
    $finalCheck | ForEach-Object { Write-Host "  Process ID: $($_.OwningProcess)" -ForegroundColor Red }
} else {
    Write-Host "Port $port is now free." -ForegroundColor Green
}
