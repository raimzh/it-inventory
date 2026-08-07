# Запуск IT Inventory в один клик: ставит зависимости при необходимости и поднимает оба сервера
Set-Location $PSScriptRoot
if (-not (Test-Path node_modules))          { npm install }
if (-not (Test-Path backend/node_modules))  { npm --prefix backend install }
if (-not (Test-Path frontend/node_modules)) { npm --prefix frontend install }
npm run dev
