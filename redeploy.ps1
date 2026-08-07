# Пересборка production и перезапуск PM2-процессов после изменений кода.
#
# ВАЖНО: запускать из окна PowerShell, ЗАПУЩЕННОГО ОТ АДМИНИСТРАТОРА —
# боевые процессы живут в системном инстансе PM2 (PM2_HOME ниже).
# Без прав администратора pm2 отвечает EPERM и перезапуск молча не происходит.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Системный инстанс PM2 (иначе команды уйдут в пользовательский ~\.pm2)
$env:PM2_HOME = "C:\ProgramData\pm2-ktms"

# Проверка прав: без администратора дальше идти бессмысленно
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ОШИБКА: запустите этот скрипт от имени администратора." -ForegroundColor Red
    Write-Host "Иначе pm2 вернёт EPERM и процессы продолжат работать на старом коде."
    exit 1
}

Write-Host "== Сборка backend ==" -ForegroundColor Cyan
npm --prefix backend run build

Write-Host "== Сборка frontend ==" -ForegroundColor Cyan
npm --prefix frontend run build

Write-Host "== Перезапуск PM2 ==" -ForegroundColor Cyan
pm2 restart it-inventory-backend it-inventory-frontend --update-env
pm2 save

Write-Host "== Статус ==" -ForegroundColor Cyan
pm2 list
