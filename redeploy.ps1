# Пересборка production и перезапуск PM2-процессов после изменений кода
Set-Location $PSScriptRoot
npm --prefix backend run build
npm --prefix frontend run build
pm2 restart it-inventory-backend it-inventory-frontend
pm2 save
