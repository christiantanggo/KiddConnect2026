# Quick script to kill process on port 5001 and restart server
$port = 5001
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
















