# Выпуск сертификата для HTTPS.
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-tls-cert.ps1
#
# Прав администратора не требует: файлы кладутся в certs\ внутри проекта.
#
# Сертификатов два, и это не усложнение ради усложнения:
#
#   ca.crt      корневой, живёт 10 лет. Устанавливается на планшеты и
#               рабочие места ОДИН раз. Он и есть то, чему доверяют.
#   server.crt  серверный, привязан к адресу машины, живёт 825 дней.
#               Именно его отдаёт tls-proxy.
#
# Одиночный самоподписанный сертификат Android установить как доверенный
# не даст — в хранилище принимаются только удостоверяющие центры. И при
# смене адреса пришлось бы обходить все планшеты заново. Здесь смена
# адреса — это перевыпуск server.crt, корневой остаётся прежним, и на
# устройствах ничего делать не надо.
#
# Срок 825 дней выбран не случайно: Apple не доверяет серверным
# сертификатам, выпущенным на больший срок.
param(
    # По умолчанию берётся адрес интерфейса, через который машина ходит в сеть
    [string]$IpAddress = "",
    [int]$Days = 825,
    # Перевыпустить корневой. ВНИМАНИЕ: после этого все устройства
    # придётся обходить заново
    [switch]$NewCa
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "certs"

$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
if (-not $openssl) {
    foreach ($p in @("$env:ProgramFiles\Git\usr\bin\openssl.exe",
                     "$env:ProgramFiles\Git\mingw64\bin\openssl.exe")) {
        if (Test-Path $p) { $openssl = $p; break }
    }
}
if (-not $openssl) {
    Write-Host "ОШИБКА: openssl не найден. Он входит в состав Git для Windows." -ForegroundColor Red
    exit 1
}

# openssl из Git собран на MSYS, и тот принимает аргумент вида /C=KZ/O=...
# за путь и переписывает его в C:\... Без этой переменной subject
# сертификата молча уедет в мусор
$env:MSYS2_ARG_CONV_EXCL = "*"

if (-not $IpAddress) {
    $IpAddress = (Get-NetIPConfiguration |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
        Select-Object -First 1).IPv4Address.IPAddress
}
if (-not $IpAddress) {
    Write-Host "ОШИБКА: не удалось определить адрес. Задайте -IpAddress явно." -ForegroundColor Red
    exit 1
}

$hostName = $env:COMPUTERNAME
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$caKey = Join-Path $certDir "ca.key"
$caCrt = Join-Path $certDir "ca.crt"

if ($NewCa -and (Test-Path $caCrt)) {
    Remove-Item $caKey, $caCrt -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $caCrt)) {
    Write-Host "== Корневой сертификат ==" -ForegroundColor Cyan
    & $openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 `
        -keyout $caKey -out $caCrt `
        -subj "/C=KZ/O=IT Inventory/CN=IT Inventory Local CA" `
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" `
        -addext "keyUsage=critical,keyCertSign,cRLSign"
    if ($LASTEXITCODE -ne 0) { Write-Host "ОШИБКА выпуска корневого." -ForegroundColor Red; exit 1 }
    Write-Host "   создан (10 лет). Устанавливается на устройства один раз."
} else {
    Write-Host "== Корневой уже есть, оставляю как есть ==" -ForegroundColor Cyan
    Write-Host "   устройства, которым он установлен, переделывать не нужно."
}

Write-Host "== Серверный сертификат для $IpAddress ==" -ForegroundColor Cyan

$csr  = Join-Path $certDir "server.csr"
$ext  = Join-Path $certDir "server.ext"
$key  = Join-Path $certDir "server.key"
$crt  = Join-Path $certDir "server.crt"

# Браузеры давно не смотрят на CN — адрес обязан быть в subjectAltName.
# localhost и 127.0.0.1 здесь для проверок с самой машины
@"
subjectAltName = IP:$IpAddress, IP:127.0.0.1, DNS:localhost, DNS:$hostName
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
"@ | Out-File -FilePath $ext -Encoding ascii

& $openssl req -newkey rsa:2048 -nodes -sha256 `
    -keyout $key -out $csr `
    -subj "/C=KZ/O=IT Inventory/CN=$IpAddress"
if ($LASTEXITCODE -ne 0) { Write-Host "ОШИБКА создания запроса." -ForegroundColor Red; exit 1 }

& $openssl x509 -req -in $csr -CA $caCrt -CAkey $caKey -CAcreateserial `
    -out $crt -days $Days -sha256 -extfile $ext
if ($LASTEXITCODE -ne 0) { Write-Host "ОШИБКА подписи." -ForegroundColor Red; exit 1 }

Remove-Item $csr, $ext -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Готово. Файлы в $certDir" -ForegroundColor Green
& $openssl x509 -in $crt -noout -subject -dates -ext subjectAltName
Write-Host ""
Write-Host "Отпечаток корневого — сверьте его на устройстве при установке:" -ForegroundColor Yellow
& $openssl x509 -in $caCrt -noout -fingerprint -sha256
Write-Host ""
Write-Host "Дальше: перезапустите процесс it-inventory-tls (redeploy.ps1)." -ForegroundColor Cyan
