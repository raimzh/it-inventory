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

const { forwardHeaders, httpsLocation } = require('../scripts/tls-proxy.js');

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
