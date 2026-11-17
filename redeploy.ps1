#!/usr/bin/env pwsh
# Пересборка production и перезапуск PM2-процессов после изменений кода.
#
# ВАЖНО: запускать из окна PowerShell, ЗАПУЩЕННОГО ОТ АДМИНИСТРАТОРА —
# боевые процессы живут в системном инстансе PM2 (PM2_HOME ниже).
# Без прав администратора pm2 отвечает EPERM и перезапуск молча не происходит.
#
# Схема: СОБРАТЬ В СТОРОНЕ -> ОСТАНОВИТЬ -> ПОДМЕНИТЬ -> ПОДНЯТЬ -> ПРОВЕРИТЬ.
#
# Раньше сборка шла прямо в боевые каталоги (frontend/.next и backend/dist),
# из которых в этот момент работали живые процессы. `next build` стирает
# старые чанки до того, как появятся новые, поэтому ВСЁ ВРЕМЯ СБОРКИ — не
# секунды перезапуска, а минуты — сайт отдавал 500 и битые страницы. У
# backend та же беда: nest build стирает dist, и упавший в этот момент
# процесс PM2 уже не поднимет (max_restarts исчерпаются на пустом каталоге).
#
# Теперь живые каталоги не трогаются до последнего момента, а простой равен
# одному перезапуску. Если новая сборка не отвечает — откат на предыдущую
# выполняется здесь же, автоматически.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Системный инстанс PM2 (иначе команды уйдут в пользовательский ~\.pm2)
$env:PM2_HOME = "C:\ProgramData\pm2-ktms"

$FrontLive    = Join-Path $PSScriptRoot "frontend\.next"
$FrontStaging = Join-Path $PSScriptRoot "frontend\.next-staging"
$FrontPrev    = Join-Path $PSScriptRoot "frontend\.next-prev"
$BackLive     = Join-Path $PSScriptRoot "backend\dist"
$BackStaging  = Join-Path $PSScriptRoot "backend\dist-staging"
$BackPrev     = Join-Path $PSScriptRoot "backend\dist-prev"

# Адрес для проверки живости. Именно через прокси на 8443: так проверяется
# весь путь целиком, включая TLS, а не только то, что node запустился
$HealthUrl = "https://127.0.0.1:8443/api/health"
$PageUrl   = "https://127.0.0.1:8443/login"

function Fail([string]$message) {
    Write-Host "ОШИБКА: $message" -ForegroundColor Red
    exit 1
}

# --- Проверки до того, как что-либо тронуто --------------------------------

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ОШИБКА: запустите этот скрипт от имени администратора." -ForegroundColor Red
    Write-Host "Иначе pm2 вернёт EPERM и процессы продолжат работать на старом коде."
    exit 1
}

# Без сертификата процесс it-inventory-tls не поднимется, а фронтенд
# слушает только localhost — снаружи не будет доступно ничего. Лучше
# остановиться здесь, чем узнать об этом от пользователей
foreach ($f in @("certs\server.crt", "certs\server.key")) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $f))) {
        Write-Host "ОШИБКА: нет файла $f — HTTPS не поднимется." -ForegroundColor Red
        Write-Host "Выпустите сертификат: .\scripts\make-tls-cert.ps1"
        exit 1
    }
}

# --- Сборка в сторону. Живой сайт продолжает работать ----------------------

Write-Host "== Сборка backend (в dist-staging) ==" -ForegroundColor Cyan
if (Test-Path $BackStaging) { Remove-Item $BackStaging -Recurse -Force }
npm --prefix backend run build -- -p tsconfig.deploy.json
if ($LASTEXITCODE -ne 0) { Fail "сборка backend не удалась. Боевая версия не тронута, сайт работает." }

Write-Host "== Сборка frontend (в .next-staging) ==" -ForegroundColor Cyan
if (Test-Path $FrontStaging) { Remove-Item $FrontStaging -Recurse -Force }
$env:NEXT_DIST_DIR = ".next-staging"
try {
    npm --prefix frontend run build
    $buildCode = $LASTEXITCODE
} finally {
    # Снимаем ОБЯЗАТЕЛЬНО и до обращения к pm2: ниже идёт
    # `pm2 startOrRestart --update-env`, которая копирует переменные из
    # ЭТОЙ оболочки в процессы. Останься NEXT_DIST_DIR — `next start`
    # пойдёт искать сборку в staging-каталоге, которого после подмены уже
    # нет, и сайт ляжет сразу после удачного деплоя
    Remove-Item Env:\NEXT_DIST_DIR -ErrorAction SilentlyContinue
}
if ($buildCode -ne 0) { Fail "сборка frontend не удалась. Боевая версия не тронута, сайт работает." }

# Сборка могла завершиться с нулевым кодом и при этом не дать результата —
# проверяем то, без чего `next start` не стартует
if (-not (Test-Path (Join-Path $FrontStaging "BUILD_ID"))) {
    Fail "в $FrontStaging нет BUILD_ID — сборка frontend неполная. Боевая версия не тронута."
}
if (-not (Test-Path (Join-Path $BackStaging "main.js"))) {
    Fail "в $BackStaging нет main.js — сборка backend неполная. Боевая версия не тронута."
}

# --- Подмена. С этой секунды начинается простой ----------------------------

Write-Host "== Остановка процессов ==" -ForegroundColor Cyan
# Прокси (it-inventory-tls) намеренно НЕ останавливаем: пусть отвечает
# внятной ошибкой, а не обрывом соединения
pm2 stop it-inventory-frontend it-inventory-backend

function Swap-Dir([string]$live, [string]$staging, [string]$prev) {
    if (Test-Path $prev) { Remove-Item $prev -Recurse -Force }
    if (Test-Path $live) { Move-Item $live $prev }
    Move-Item $staging $live
}

function Rollback-Dir([string]$live, [string]$prev) {
    if (-not (Test-Path $prev)) { return }
    if (Test-Path $live) { Remove-Item $live -Recurse -Force }
    Move-Item $prev $live
}

Write-Host "== Подмена сборок ==" -ForegroundColor Cyan
Swap-Dir $BackLive  $BackStaging  $BackPrev
Swap-Dir $FrontLive $FrontStaging $FrontPrev

Write-Host "== Запуск PM2 ==" -ForegroundColor Cyan
# Именно startOrRestart, а не restart: restart перезапускает процесс со
# СТАРЫМИ аргументами и не читает ecosystem.config.js заново. После
# правки портов в конфигурации это выглядит как «изменения не
# применились», причём фронтенд остаётся на прежнем порту и отбирает его
# у прокси. startOrRestart заодно создаёт процессы, которых ещё нет
pm2 startOrRestart ecosystem.config.js --update-env

# --- Проверка, что поднялось именно рабочее --------------------------------

function Wait-Healthy([int]$timeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        # -k: сертификат самоподписанный; проверяем доступность, не доверие
        $health = & curl.exe -sk -o NUL -w "%{http_code}" --max-time 10 $HealthUrl 2>$null
        $page   = & curl.exe -sk -o NUL -w "%{http_code}" --max-time 15 $PageUrl 2>$null
        if ($health -eq "200" -and $page -eq "200") { return $true }
    }
    return $false
}

Write-Host "== Проверка ==" -ForegroundColor Cyan
if (Wait-Healthy) {
    pm2 save
    Write-Host "Готово: сайт отвечает на новой сборке." -ForegroundColor Green
    Write-Host "Предыдущая версия лежит в .next-prev и dist-prev — на случай отката."
    pm2 list
    exit 0
}

# Не поднялось — возвращаем предыдущую сборку. Сохранять в pm2 save такое
# состояние нельзя: после перезагрузки машины оно поднимется снова
Write-Host "Новая сборка не отвечает — откатываюсь на предыдущую." -ForegroundColor Yellow
pm2 stop it-inventory-frontend it-inventory-backend
Rollback-Dir $FrontLive $FrontPrev
Rollback-Dir $BackLive  $BackPrev
pm2 startOrRestart ecosystem.config.js --update-env

if (Wait-Healthy) {
    Write-Host "Откат удался: сайт работает на ПРЕДЫДУЩЕЙ версии." -ForegroundColor Yellow
    Write-Host "Разберитесь с новой сборкой и запустите деплой заново."
    exit 1
}

Write-Host "ОТКАТ НЕ ПОМОГ — сайт не отвечает. Смотрите логи:" -ForegroundColor Red
Write-Host "  pm2 logs it-inventory-frontend --lines 50"
Write-Host "  pm2 logs it-inventory-backend --lines 50"
pm2 list
exit 1
