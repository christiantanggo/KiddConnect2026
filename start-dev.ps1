# Kill processes on 5001 and 5002, then start dev server (backend listens on 5002)
Write-Host "Killing any process on port 5001 and 5002..." -ForegroundColor Yellow
foreach ($port in @(5001, 5002)) {
    $connections = netstat -ano | findstr ":$port "
    if ($connections) {
        $connections | ForEach-Object {
            if ($_ -match '\s+(\d+)\s*$') { $matches[1] }
        } | Select-Object -Unique | ForEach-Object {
            if ($_) {
                Write-Host "  Killing PID $_ on port $port" -ForegroundColor Red
                taskkill /F /PID $_ 2>$null | Out-Null
            }
        }
    }
}
Start-Sleep -Seconds 2
Write-Host "Starting server (will listen on 5002)..." -ForegroundColor Green
node --watch server.js
