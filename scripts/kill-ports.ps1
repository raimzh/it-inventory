# Освобождает порты dev-серверов перед стартом (защита от EADDRINUSE)
foreach ($port in 3000, 3001) {
    $pids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess |
            Sort-Object -Unique
    foreach ($procId in $pids) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "Освобождён порт $port (PID $procId)"
        } catch {}
    }
}
