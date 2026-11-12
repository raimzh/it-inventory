'use strict';
/**
 * Маршрутизация сервис-воркера.
 *
 *   npm run test
 *
 * Главное, что здесь закреплено, — чего воркер касаться НЕ должен.
 * Кэш на /api/ не выглядит как поломка: страница открывается, цифры
 * показываются, просто они от прошлого раза. Во время инвентаризации это
 * означает отметку не того предмета и расхождение в акте — поэтому
 * проверка «мимо воркера» стоит первой и перечисляет методы и пути
 * поимённо, а не одним общим случаем.
 *
 * Второй по важности пункт — HTML страниц не кэшируется никогда. HTML
 * ссылается на файлы Next с хэшами в именах; отданный из кэша старый
 * HTML попросит файлы, которых после деплоя уже нет, и человек увидит
 * белый экран, который не лечится перезагрузкой.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseStrategy, staleCaches, isCacheable,
  CACHE_NAME, CACHE_PREFIX, PRECACHE, OFFLINE_URL,
} = require('../public/sw.js');

const ORIGIN = 'https://10.5.10.28:8443';

/** Запрос как его видит воркер. По умолчанию — обычный GET за ресурсом */
function req(path, extra) {
  return Object.assign(
    { url: ORIGIN + path, method: 'GET', mode: 'no-cors', origin: ORIGIN },
    extra
  );
}

test('данные и авторизация идут мимо воркера', () => {
  const paths = [
    '/api/assets',
    '/api/assets?page=2',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/preferences/asset-table-columns',
    '/api',
  ];
  for (const p of paths) {
    assert.equal(chooseStrategy(req(p)), 'passthrough', p);
  }
});

test('похожие на /api пути не считаются за /api', () => {
  // Срезать /api-docs вместе с /api/ было бы легко через
  // startsWith('/api'), и тогда страница с таким адресом лишилась бы
  // заглушки при обрыве сети, а заметили бы это не скоро
  assert.equal(chooseStrategy(req('/api-docs', { mode: 'navigate' })), 'network-then-offline');
  assert.equal(chooseStrategy(req('/apiary', { mode: 'navigate' })), 'network-then-offline');
});

test('изменяющие запросы всегда в сеть', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
    assert.equal(chooseStrategy(req('/inventory', { method, mode: 'navigate' })), 'passthrough', method);
    assert.equal(chooseStrategy(req('/_next/static/chunks/a.js', { method })), 'passthrough', method);
  }
});

test('статика Next кэшируется: в имени файла хэш, устареть не может', () => {
  assert.equal(chooseStrategy(req('/_next/static/chunks/main-a1b2c3.js')), 'cache-first');
  assert.equal(chooseStrategy(req('/_next/static/css/abc123.css')), 'cache-first');
  assert.equal(chooseStrategy(req('/_next/static/media/inter-x.woff2')), 'cache-first');
});

test('значки и манифест кэшируются — нужны при запуске с ярлыка', () => {
  assert.equal(chooseStrategy(req('/icon-192.png')), 'cache-first');
  assert.equal(chooseStrategy(req('/icon-512.png')), 'cache-first');
  assert.equal(chooseStrategy(req('/manifest.webmanifest')), 'cache-first');
});

test('логотип и прочая картинка из public не кэшируются молча', () => {
  // Хэша в имени нет: заменят файл — из кэша будет отдаваться старый,
  // причём неизвестно сколько. Пусть идёт в сеть, там свои заголовки
  assert.equal(chooseStrategy(req('/KTMS_LOGO_ORIGINAL.png')), 'passthrough');
  assert.equal(chooseStrategy(req('/icon-192.svg')), 'passthrough');
  assert.equal(chooseStrategy(req('/icons-192.png')), 'passthrough');
});

test('HTML страниц не кэшируется, но обрыв сети ловится', () => {
  for (const p of ['/', '/inventory', '/assets', '/login', '/scan/abc']) {
    assert.equal(chooseStrategy(req(p, { mode: 'navigate' })), 'network-then-offline', p);
  }
});

test('/_next/image не кэшируется: ответ зависит от query', () => {
  assert.equal(chooseStrategy(req('/_next/image?url=%2Fa.png&w=64&q=75')), 'passthrough');
});

test('чужие домены не перехватываются', () => {
  assert.equal(
    chooseStrategy({ url: 'https://fonts.gstatic.com/s/inter/x.woff2', method: 'GET', origin: ORIGIN }),
    'passthrough'
  );
  // Тот же путь, но другой хост — не наша статика
  assert.equal(
    chooseStrategy({ url: 'https://example.com/_next/static/chunks/a.js', method: 'GET', origin: ORIGIN }),
    'passthrough'
  );
});

test('адрес Tailscale и localhost обслуживаются так же', () => {
  // Адрес в сети меняется по DHCP, и сертификат покрывает несколько
  // адресов: правила не должны быть привязаны к конкретному хосту
  for (const origin of ['https://100.82.183.50:8443', 'http://localhost:3010']) {
    assert.equal(
      chooseStrategy({ url: origin + '/_next/static/chunks/a.js', method: 'GET', origin }),
      'cache-first',
      origin
    );
    assert.equal(
      chooseStrategy({ url: origin + '/api/assets', method: 'GET', origin }),
      'passthrough',
      origin
    );
  }
});

test('битый url не валит обработчик', () => {
  assert.equal(chooseStrategy({ url: 'не-адрес', method: 'GET', origin: 'тоже-не-адрес' }), 'passthrough');
});

test('удаляются только свои кэши прошлых версий', () => {
  const names = [CACHE_NAME, CACHE_PREFIX + 'v0', 'workbox-precache', 'ktms-gps-v3'];
  const stale = staleCaches(names, CACHE_NAME);
  assert.deepEqual(stale, [CACHE_PREFIX + 'v0']);
  // На том же адресе живёт ещё и GPS-приложение — его кэш не наш
  assert.ok(!stale.includes('ktms-gps-v3'));
  assert.deepEqual(staleCaches(undefined, CACHE_NAME), []);
});

test('в кэш попадают только полные успешные свои ответы', () => {
  assert.ok(isCacheable({ ok: true, status: 200, type: 'basic' }));
  assert.ok(!isCacheable({ ok: false, status: 404, type: 'basic' }));
  assert.ok(!isCacheable({ ok: true, status: 206, type: 'basic' }), 'частичный ответ');
  assert.ok(!isCacheable({ ok: true, status: 200, type: 'opaque' }), 'ответ без доступа к телу');
  assert.ok(!isCacheable(null));
});

test('страница-заглушка лежит в precache — иначе её не будет именно когда нужна', () => {
  assert.ok(PRECACHE.includes(OFFLINE_URL));
});
