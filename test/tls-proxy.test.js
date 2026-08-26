'use strict';
/**
 * Заголовки TLS-терминатора и перенаправление со старого адреса.
 *
 *   npm test
 *
 * Оба проверяемых здесь свойства ломаются молча — сайт продолжает
 * открываться, и понять, что что-то не так, по внешнему виду нельзя:
 *
 *   • пропал X-Forwarded-Proto — соединение зашифровано, но куки уходят
 *     без флага Secure, то есть браузеру разрешено слать их и по
 *     открытому HTTP;
 *
 *   • перенаправление дописало порт вместо замены — получается адрес
 *     вида https://10.5.10.32:3000:8443, и старые закладки на планшетах
 *     перестают работать.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  forwardHeaders, httpsLocation, createHandshakeReporter, explainHandshakeFailure,
} = require('../scripts/tls-proxy.js');

test('фронтенду сообщается, что снаружи было шифрование', () => {
  // Без этого заголовка route.ts не ставит кукам Secure
  const headers = forwardHeaders({ headers: { host: '10.5.10.32:8443' } }, '10.5.10.7');
  assert.equal(headers['x-forwarded-proto'], 'https');
});

test('заголовки X-Forwarded-* от клиента не переживают прокси', () => {
  // Иначе кто угодно из сети подставит чужой адрес в журнал, а подделка
  // proto собьёт логику Secure
  const headers = forwardHeaders({
    headers: {
      host: '10.5.10.32:8443',
      'x-forwarded-proto': 'http',
      'x-forwarded-for': '203.0.113.9',
      'X-Forwarded-Host': 'evil.example',
    },
  }, '10.5.10.7');

  assert.equal(headers['x-forwarded-proto'], 'https');
  assert.equal(headers['x-forwarded-for'], '10.5.10.7');
  assert.equal(headers['x-forwarded-host'], '10.5.10.32:8443');
  // Подделка пришла с заглавными буквами — отбрасывание должно быть
  // нечувствительно к регистру, иначе останутся оба варианта
  assert.equal(headers['X-Forwarded-Host'], undefined);
});

test('Host передаётся как есть', () => {
  // Next.js сверяет Origin с Host у серверных действий: подмена Host
  // ломает формы, но не сразу и не очевидно
  const headers = forwardHeaders({ headers: { host: '10.5.10.32:8443' } }, '10.5.10.7');
  assert.equal(headers.host, '10.5.10.32:8443');
});

test('прочие заголовки не теряются', () => {
  const headers = forwardHeaders({
    headers: { host: 'x', cookie: 'access_token=abc', 'content-type': 'application/json' },
  }, '10.5.10.7');
  assert.equal(headers.cookie, 'access_token=abc');
  assert.equal(headers['content-type'], 'application/json');
});

test('перенаправление заменяет порт, а не дописывает его', () => {
  const req = { headers: { host: '10.5.10.32:3000' }, url: '/assets?page=2' };
  assert.equal(httpsLocation(req, 8443), 'https://10.5.10.32:8443/assets?page=2');
});

test('перенаправление сохраняет путь целиком', () => {
  const req = { headers: { host: '10.5.10.32:3000' }, url: '/inventory/sessions/42' };
  assert.equal(httpsLocation(req, 8443), 'https://10.5.10.32:8443/inventory/sessions/42');
});

test('для 443 порт в адресе не указывается', () => {
  // Если приложение когда-нибудь переедет на стандартный порт, лишнее
  // «:443» в адресе выглядит поломкой
  const req = { headers: { host: 'inv.example' }, url: '/' };
  assert.equal(httpsLocation(req, 443), 'https://inv.example/');
});

test('запрос без Host не превращается в битый адрес', () => {
  assert.equal(httpsLocation({ headers: {}, url: '/' }, 8443), null);
});

// --- Отказы TLS-рукопожатия ---------------------------------------------
//
// Ради этих записей журнал и заводился: со стороны сервера успешное
// соединение выглядит одинаково и когда сертификат доверенный, и когда
// человек нажал «всё равно перейти». Различает их только алерт unknown ca,
// который устройство присылает ДО предупреждения.

/** Отчёт с подставными часами и записью — без ожидания и без вывода. */
function reporter(intervalMs = 1000) {
  const lines = [];
  let clock = 0;
  const report = createHandshakeReporter({
    log: m => lines.push(m),
    intervalMs,
    now: () => clock,
  });
  return { lines, report, tick: ms => { clock += ms; } };
}

test('недоверенный сертификат виден в журнале с объяснением', () => {
  const r = reporter();
  r.report({ code: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA' }, { remoteAddress: '10.5.10.28' });

  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /10\.5\.10\.28/);
  assert.match(r.lines[0], /не доверяет корневому/);
  // Подсказка должна называть само действие, иначе запись бесполезна
  assert.match(r.lines[0], /Сертификат ЦС/);
});

test('первый отказ пишется сразу, а не после выдержки', () => {
  // Иначе единственная попытка с планшета не попадёт в журнал вовсе
  const r = reporter(5 * 60 * 1000);
  r.report({ code: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA' }, { remoteAddress: '10.5.10.28' });
  assert.equal(r.lines.length, 1);
});

test('повторы сворачиваются в счётчик, а не заливают журнал', () => {
  // Порт открыт в сеть, и сканеры стучатся постоянно
  const r = reporter(1000);
  for (let i = 0; i < 50; i++) {
    r.report({ code: 'ECONNRESET' }, { remoteAddress: '203.0.113.9' });
  }
  assert.equal(r.lines.length, 1, 'пятьдесят попыток — одна запись');

  r.tick(1001);
  r.report({ code: 'ECONNRESET' }, { remoteAddress: '203.0.113.9' });
  assert.equal(r.lines.length, 2);
  assert.match(r.lines[1], /повторов с прошлой записи: 50/);
});

test('разные адреса и причины не заслоняют друг друга', () => {
  // Иначе шум от сканера скроет единственную запись с планшета
  const r = reporter(60 * 1000);
  r.report({ code: 'ECONNRESET' }, { remoteAddress: '203.0.113.9' });
  r.report({ code: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA' }, { remoteAddress: '10.5.10.28' });
  r.report({ code: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA' }, { remoteAddress: '10.5.10.29' });

  assert.equal(r.lines.length, 3);
  assert.match(r.lines[1], /10\.5\.10\.28/);
  assert.match(r.lines[2], /10\.5\.10\.29/);
});

test('запись не падает на пустых аргументах', () => {
  // tlsClientError приходит из недр TLS, и сокет может быть уже разрушен.
  // Отчёты разные, потому что одинаковые ключи схлопнулись бы в один —
  // это и есть правильное поведение, но проверить надо оба случая
  const a = reporter();
  a.report({}, { remoteAddress: '10.5.10.28' });
  assert.equal(a.lines.length, 1);
  assert.match(a.lines[0], /причина неизвестна/);

  const b = reporter();
  b.report(null, null);
  assert.equal(b.lines.length, 1);
  assert.match(b.lines[0], /адрес неизвестен/);
});

test('одинаковые отказы схлопываются даже без адреса и причины', () => {
  const r = reporter(60 * 1000);
  r.report(null, null);
  r.report(null, null);
  assert.equal(r.lines.length, 1, 'ключ тот же — записи быть не должно');
});

test('таблица адресов не растёт без предела', () => {
  // Иначе поток соединений с разных адресов съест память процесса
  const r = reporter(1000);
  for (let i = 0; i < 600; i++) {
    r.report({ code: 'ECONNRESET' }, { remoteAddress: `198.51.100.${i}` });
  }
  r.tick(1001);
  // Уборка идёт при следующем обращении; проверяем, что процесс жив и
  // записи продолжают появляться
  r.report({ code: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA' }, { remoteAddress: '10.5.10.28' });
  assert.match(r.lines[r.lines.length - 1], /10\.5\.10\.28/);
});

test('обращение по http на порт HTTPS объясняется человеческим языком', () => {
  assert.match(explainHandshakeFailure('ERR_SSL_WRONG_VERSION_NUMBER'), /https:\/\//);
});

test('истёкший сертификат подсказывает перевыпуск', () => {
  assert.match(explainHandshakeFailure('CERTIFICATE_EXPIRED'), /npm run cert/);
});

test('незнакомый код не выдумывает объяснение', () => {
  assert.equal(explainHandshakeFailure('ERR_WHATEVER_NEW'), '');
});
