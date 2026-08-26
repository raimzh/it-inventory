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
 * Отказы TLS-рукопожатия пишутся в журнал (PM2, процесс
 * it-inventory-tls). Это единственный способ увидеть устройство, которое
 * не приняло сертификат: со стороны сервера успешное соединение выглядит
 * одинаково и когда сертификат доверенный, и когда человек нажал «всё
 * равно перейти». Различает их алерт unknown ca, который устройство
 * присылает ДО показа предупреждения.
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

/**
 * Отметка времени для записи в журнал.
 *
 * PM2 сам времени не проставляет, а без него запись бесполезна: понять,
 * относится ли отказ к сегодняшней попытке или лежит с прошлой недели,
 * не по чему.
 *
 * Время местное и со смещением («+05:00»): на сервере оно и так местное,
 * а смещение снимает вопрос, не UTC ли это — иначе разница в пять часов
 * незаметно уводит расследование не туда.
 */
function formatTimestamp(date) {
  const d = date || new Date();
  const p = n => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offset = `${sign}${p(Math.floor(Math.abs(offsetMin) / 60))}:${p(Math.abs(offsetMin) % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${offset}`;
}

/** Строка журнала: отметка времени и метка процесса. */
function logLine(message, date) {
  return `[${formatTimestamp(date)}] [tls-proxy] ${message}`;
}

/**
 * Расшифровка кода ошибки рукопожатия.
 *
 * Коды вида ERR_SSL_TLSV1_ALERT_UNKNOWN_CA сами по себе ничего не говорят
 * тому, кто будет читать журнал через полгода.
 */
function explainHandshakeFailure(code) {
  const c = String(code).toUpperCase();
  if (c.includes('UNKNOWN_CA')) {
    // Устройство прислало алерт «не знаю такой центр». Браузер шлёт его
    // ДО того, как показать предупреждение, поэтому запись появится даже
    // если человек потом нажмёт «всё равно перейти»
    return 'устройство не доверяет корневому сертификату: на нём не установлен certs/ca.crt ' +
           '(на Android ставить как «Сертификат ЦС», а не «Сертификат пользователя»)';
  }
  if (c.includes('CERTIFICATE_UNKNOWN') || c.includes('BAD_CERTIFICATE')) {
    return 'устройство отвергло сертификат сервера';
  }
  if (c.includes('CERTIFICATE_EXPIRED')) {
    return 'срок сертификата истёк: перевыпустите его (npm run cert)';
  }
  if (c.includes('WRONG_VERSION_NUMBER') || c.includes('HTTP_REQUEST')) {
    return 'обращение по http:// на порт HTTPS — нужен адрес вида https://<адрес>:8443';
  }
  if (c.includes('NO_SHARED_CIPHER') || c.includes('UNSUPPORTED_PROTOCOL') || c.includes('VERSION')) {
    return 'клиент слишком старый: сервер требует TLS 1.2 и выше';
  }
  if (c.includes('ECONNRESET') || c.includes('EPROTO')) {
    return 'соединение оборвано до конца рукопожатия (обычно скан портов)';
  }
  return '';
}

/**
 * Ограничитель частоты записей об отказах рукопожатия.
 *
 * Порт 8443 открыт в сеть, и сканеры стучатся в него постоянно. Писать
 * каждую попытку — значит утопить в шуме единственную запись, ради
 * которой всё и заводилось. Поэтому пара «адрес + причина» попадает в
 * журнал сразу, а повторы сворачиваются в счётчик.
 *
 * Часы и запись передаются снаружи, чтобы это можно было проверить
 * тестами, не дожидаясь пяти минут и не засоряя вывод.
 */
function createHandshakeReporter(options) {
  const opts = options || {};
  const log = opts.log || (msg => console.warn(msg));
  const intervalMs = opts.intervalMs || 5 * 60 * 1000;
  const clock = opts.now || (() => Date.now());
  const seen = new Map();

  return function reportHandshakeFailure(err, socket) {
    const address = (socket && socket.remoteAddress) || 'адрес неизвестен';
    const code = (err && (err.code || err.message)) || 'причина неизвестна';
    const key = `${address} ${code}`;
    const now = clock();

    // null, а не 0: ноль — это ещё и корректная отметка времени, и
    // проверка «уже сообщали?» на нём молча перестаёт работать
    const entry = seen.get(key) || { pending: 0, reportedAt: null };
    entry.pending += 1;
    seen.set(key, entry);

    // Скан портов может насыпать сюда сколько угодно разных адресов —
    // без уборки таблица растёт без предела
    if (seen.size > 500) {
      for (const [k, v] of seen) {
        if (v.reportedAt !== null && now - v.reportedAt > intervalMs) seen.delete(k);
      }
    }

    if (entry.reportedAt !== null && now - entry.reportedAt < intervalMs) return;

    const repeats = entry.pending > 1 ? `, повторов с прошлой записи: ${entry.pending}` : '';
    const hint = explainHandshakeFailure(code);
    entry.reportedAt = now;
    entry.pending = 0;

    // Время берётся с тех же часов, что и ограничитель частоты, — иначе
    // отметка разошлась бы с логикой свёртывания повторов
    log(logLine(`рукопожатие не состоялось: ${address}, ${code}${repeats}` +
        (hint ? ` — ${hint}` : ''), new Date(now)));
  };
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
        console.error(logLine(`${req.method} ${req.url}: ${err.message}`));
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

  // Обрыв TLS-рукопожатия сам по себе процесс ронять не должен, но и
  // молчать о нём нельзя: именно так выглядит планшет, который не принял
  // сертификат, и без записи в журнале об этом узнать неоткуда
  server.on('tlsClientError', options.reportHandshake || createHandshakeReporter());
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

module.exports = {
  forwardHeaders, httpsLocation, createProxy, createRedirect,
  createHandshakeReporter, explainHandshakeFailure, formatTimestamp, logLine,
};

if (require.main === module) {
  let certs;
  try {
    certs = readCerts(CERT_DIR);
  } catch (err) {
    console.error(`[tls-proxy] ${err.message}`);
    process.exit(1);
  }

  createProxy(certs).listen(TLS_PORT, '0.0.0.0', () => {
    console.log(logLine(`HTTPS на 0.0.0.0:${TLS_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`));
  });

  createRedirect(TLS_PORT).listen(REDIRECT_PORT, '0.0.0.0', () => {
    console.log(logLine(`HTTP на 0.0.0.0:${REDIRECT_PORT} -> перенаправление на HTTPS`));
  });
}
