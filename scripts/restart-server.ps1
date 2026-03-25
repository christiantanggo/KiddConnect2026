# Quick script to kill process on backend port (see config/dev-ports.json) and restart server
$portsPath = Join-Path $PSScriptRoot "..\config\dev-ports.json"
$port = 5000
if (Test-Path $portsPath) {
    try {
        $ports = Get-Content $portsPath -Raw | ConvertFrom-Json
        if ($ports.backend) { $port = [int]$ports.backend }
    } catch { }
}
Write-Host "Checking for process on port $port..."

$processes = netstat -ano | findstr ":$port" | ForEach-Object {
    if ($_ -match '\s+(\d+)$') {
        $matches[1]
    }
} | Select-Object -Unique

if ($processes) {
    foreach ($processId in $processes) {
        Write-Host "Killing process $processId on port $port"
        taskkill /PID $processId /F 2>$null
    }
    Write-Host "Port $port is now free"
    Start-Sleep -Seconds 1
} else {
    Write-Host "No process found on port $port"
}

Write-Host "`nServer should restart automatically via file watcher..."
Write-Host "If not, run: npm start"



















