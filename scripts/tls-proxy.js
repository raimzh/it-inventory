'use strict';
/**
 * TLS-терминатор перед фронтендом.
 *
 * Next.js не умеет HTTPS сам, а порты 80 и 443 на этой машине заняты
 * другим приложением (GPS-мониторинг KTMS). Поэтому шифрование даёт
 * отдельный процесс: слушает 8443, расшифровывает и передаёт запрос на
 * localhost, где фронтенд слушает уже без сети.
 *
 * Зависимостей нет намеренно: PM2 держит node_modules открытыми, и
 * установка пакетов на боевой машине — отдельная операция с риском.
 * Всё нужное есть во встроенных модулях.
 *
 * Три вещи, которые здесь легко сломать:
 *
 *   1. Заголовок X-Forwarded-Proto. Прокси фронтенда
 *      (frontend/src/app/api/[...path]/route.ts) ставит кукам флаг
 *      Secure, только увидев его. Без заголовка соединение будет
 *      зашифровано, а куки — помечены как пригодные для открытого
 *      HTTP, то есть половина смысла HTTPS потеряется.
 *
 *   2. Клиентские X-Forwarded-* перезаписываются, а не дополняются.
 *      Иначе кто угодно из сети подставит свой адрес в журнал.
 *
 *   3. Заголовок Host идёт как есть. Next.js сверяет Origin с Host у
 *      серверных действий и отклоняет запрос при расхождении — подмена
 *      Host сломает формы, но проявится не сразу.
 *
 * HSTS здесь намеренно НЕ выставляется. Он запрещает браузеру обходить
 * предупреждение о сертификате, а сертификат тут самоподписанный: на
 * планшете без установленного корневого сертификата HSTS превратит
 * предупреждение в наглухо закрытую дверь. К адресам вида 10.5.10.32
 * браузеры его всё равно не применяют.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const TLS_PORT = Number(process.env.TLS_PROXY_PORT || 8443);
// Старый адрес: на планшетах и в закладках остался http://<сервер>:3000.
// Здесь его встречает перенаправление на HTTPS, а не пустота
const REDIRECT_PORT = Number(process.env.TLS_PROXY_REDIRECT_PORT || 3000);
const TARGET_HOST = process.env.TLS_PROXY_TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.TLS_PROXY_TARGET_PORT || 3010);
const CERT_DIR = process.env.TLS_CERT_DIR || path.join(__dirname, '..', 'certs');

/** Заголовки для запроса к фронтенду. */
function forwardHeaders(req, remoteAddress) {
  const headers = Object.assign({}, req.headers);
  // Всё, что клиент прислал сам, отбрасываем — доверять этому нельзя
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase().startsWith('x-forwarded-')) delete headers[name];
  }
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-port'] = String(TLS_PORT);
  if (remoteAddress) headers['x-forwarded-for'] = remoteAddress;
  return headers;
}

/** Адрес, на который перенаправлять с открытого HTTP. */
function httpsLocation(req, tlsPort) {
  // Порт в Host — старый, его надо заменить, а не дописать. IPv6-адрес
  // приходит в скобках, поэтому отрезаем порт с конца
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (!host) return null;
  const suffix = tlsPort === 443 ? '' : `:${tlsPort}`;
  return `https://${host}${suffix}${req.url || '/'}`;
}

function readCerts(dir) {
  const key = path.join(dir, 'server.key');
  const cert = path.join(dir, 'server.crt');
  for (const file of [key, cert]) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Нет файла ${file}.\n` +
        'Сертификат создаётся скриптом scripts/make-tls-cert.ps1:\n' +
        '  powershell -ExecutionPolicy Bypass -File scripts\make-tls-cert.ps1',
      );
    }
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

function createProxy(options) {
  const server = https.createServer(
    { key: options.key, cert: options.cert, minVersion: 'TLSv1.2' },
    (req, res) => {
      const proxyReq = http.request({
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: req.method,
        path: req.url,
        headers: forwardHeaders(req, req.socket.remoteAddress),
      }, proxyRes => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', err => {
        // Фронтенд лежит или перезапускается. Отвечаем внятно: иначе
        // браузер покажет обрыв соединения и это спишут на сертификат
        console.error(`[tls-proxy] ${req.method} ${req.url}: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        }
        res.end('Приложение недоступно. Проверьте процесс it-inventory-frontend.');
      });

      req.on('error', () => proxyReq.destroy());
      req.pipe(proxyReq);
    },
  );

  // Веб-сокеты: в проде Next.js их не открывает, но при обновлении
  // версии это может измениться, и молчаливо ломать их не хочется
  server.on('upgrade', (req, socket, head) => {
    const proxyReq = http.request({
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req, req.socket.remoteAddress),
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const lines = Object.entries(proxyRes.headers)
        .map(([k, v]) => `${k}: ${v}`).join('\r\n');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines}\r\n\r\n`);
      if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
      proxySocket.pipe(socket).pipe(proxySocket);
    });
    proxyReq.on('error', () => socket.destroy());
    socket.on('error', () => proxyReq.destroy());
    if (head && head.length) proxyReq.write(head);
    proxyReq.end();
  });

  // Обрыв TLS-рукопожатия — обычное дело (сканеры портов, закрытая
  // вкладка с непринятым сертификатом). Процесс от этого падать не должен
  server.on('tlsClientError', () => {});
  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return server;
}

function createRedirect(tlsPort) {
  return http.createServer((req, res) => {
    const location = httpsLocation(req, tlsPort);
    if (!location) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Запрос без заголовка Host');
      return;
    }
    // 302, а не 301: постоянное перенаправление браузер кэширует
    // навсегда, и откатить настройку станет нечем
    res.writeHead(302, { location, 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Приложение переехало на ${location}`);
  });
}

module.exports = { forwardHeaders, httpsLocation, createProxy, createRedirect };

if (require.main === module) {
  let certs;
  try {
    certs = readCerts(CERT_DIR);
  } catch (err) {
    console.error(`[tls-proxy] ${err.message}`);
    process.exit(1);
  }

  createProxy(certs).listen(TLS_PORT, '0.0.0.0', () => {
    console.log(`[tls-proxy] HTTPS на 0.0.0.0:${TLS_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
  });

  createRedirect(TLS_PORT).listen(REDIRECT_PORT, '0.0.0.0', () => {
    console.log(`[tls-proxy] HTTP на 0.0.0.0:${REDIRECT_PORT} -> перенаправление на HTTPS`);
  });
}
