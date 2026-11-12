/**
 * Сервис-воркер.
 *
 * Нужен для двух вещей, и важно не путать их с третьей, которой тут нет.
 *
 * 1. Chrome предлагает «Установить приложение» только сайту со
 *    сервис-воркером, у которого есть обработчик fetch. Без него ярлык на
 *    планшете приходилось заводить вручную через «Добавить на гл. экран».
 * 2. Статика (/_next/static/, значки) отдаётся из кэша — на планшете по
 *    Wi-Fi это заметно: страница перестаёт собираться заново при каждом
 *    переходе.
 *
 * Чего тут НЕТ и не будет без отдельного решения: работы без сети. Все
 * данные приходят из /api/, и эти запросы воркер НЕ перехватывает вообще
 * (см. chooseStrategy). Причина не в лени: во время инвентаризации
 * кладовщик сканирует вещь и смотрит, отмечена ли она. Ответ из кэша
 * здесь — это не «чуть устаревшие данные», а отметка не того предмета и
 * расхождение в акте. Пусть лучше честно не загрузится.
 *
 * Поэтому offline-режим ограничен: вместо дырявой страницы Chrome
 * показывается /offline.html с понятным текстом. Сделать больше можно
 * только с локальной очередью сканов, и это отдельная задача.
 *
 * Файл лежит в public/ (отдаётся как есть, с корня — иначе scope воркера
 * не покрыл бы весь сайт) и написан так, чтобы его можно было
 * подключить в тестах через require: слушатели регистрируются только
 * внутри воркера, логика маршрутизации — чистая функция.
 */
'use strict';

// Версию поднимать руками при изменении списка precache или стратегий:
// по ней в activate удаляются кэши прошлых версий
var CACHE_VERSION = 'v1';
var CACHE_PREFIX = 'it-inventory-';
var CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
var OFFLINE_URL = '/offline.html';

// Кладётся в кэш на установке. Только то, что не зависит от сборки:
// хэши файлов Next меняются каждый билд, их класть по имени нельзя
var PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png'];

/**
 * Что делать с запросом. Отдельная чистая функция, чтобы правила можно
 * было закрепить тестами, — ошибка здесь тихая и дорогая: лишний кэш на
 * /api/ заметят не сразу, а по неверному акту инвентаризации.
 *
 * @param {{url: string, method?: string, mode?: string, origin: string}} req
 * @returns {'passthrough'|'cache-first'|'network-then-offline'}
 */
function chooseStrategy(req) {
  var method = (req.method || 'GET').toUpperCase();
  // POST/PATCH/DELETE — только в сеть. Кэшировать нечего, а отвечать на
  // них из кэша нельзя тем более
  if (method !== 'GET') return 'passthrough';

  var url;
  try {
    url = new URL(req.url, req.origin);
  } catch (e) {
    return 'passthrough';
  }

  // Чужие домены (шрифты Google и прочее) — не наше дело
  if (url.origin !== req.origin) return 'passthrough';

  var path = url.pathname;

  // Данные и авторизация. Строго мимо воркера, см. комментарий в шапке
  if (path === '/api' || path.indexOf('/api/') === 0) return 'passthrough';

  // Содержимое с хэшем в имени: при изменении файла меняется и путь,
  // поэтому устаревшего ответа из кэша тут быть не может
  if (path.indexOf('/_next/static/') === 0) return 'cache-first';

  // Значки и манифест — редко меняются, нужны при запуске с ярлыка
  if (path === '/manifest.webmanifest' || /^\/icon-\d+\.png$/.test(path)) {
    return 'cache-first';
  }

  // Переходы по страницам: всегда из сети (HTML ссылается на свежие
  // хэши статики, кэшировать его — путь к белому экрану после деплоя),
  // но при обрыве сети показываем свою страницу вместо динозавра
  if (req.mode === 'navigate') return 'network-then-offline';

  return 'passthrough';
}

/**
 * Кэши, оставшиеся от прошлых версий воркера. Чужие (другого приложения
 * на том же адресе) не трогаем — поэтому проверка по префиксу, а не
 * «всё, кроме текущего».
 */
function staleCaches(names, currentName) {
  return (names || []).filter(function (name) {
    return name.indexOf(CACHE_PREFIX) === 0 && name !== currentName;
  });
}

/** Ответ годится для кэша: успешный, свой, не частичный (206) */
function isCacheable(response) {
  return !!response && response.ok && response.type !== 'opaque' && response.status === 200;
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && typeof caches !== 'undefined') {
  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(function (cache) {
        // addAll падает целиком, если не скачался хоть один файл, и тогда
        // воркер не установится вовсе. Поэтому по одному
        return Promise.all(
          PRECACHE.map(function (url) {
            return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
          })
        );
      })
    );
    // Новый воркер начинает работать сразу, не дожидаясь закрытия всех
    // вкладок: стратегии безопасные, старые страницы они не ломают
    self.skipWaiting();
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches
        .keys()
        .then(function (names) {
          return Promise.all(
            staleCaches(names, CACHE_NAME).map(function (name) {
              return caches.delete(name);
            })
          );
        })
        .then(function () {
          return self.clients.claim();
        })
    );
  });

  self.addEventListener('fetch', function (event) {
    var request = event.request;
    var strategy = chooseStrategy({
      url: request.url,
      method: request.method,
      mode: request.mode,
      origin: self.location.origin,
    });

    // passthrough — именно не вызывать respondWith: запрос уходит в сеть
    // как будто воркера нет, со всеми cookie и редиректами
    if (strategy === 'passthrough') return;

    if (strategy === 'cache-first') {
      event.respondWith(
        caches.match(request).then(function (cached) {
          if (cached) return cached;
          return fetch(request).then(function (response) {
            if (isCacheable(response)) {
              var copy = response.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(request, copy).catch(function () {});
              });
            }
            return response;
          });
        })
      );
      return;
    }

    if (strategy === 'network-then-offline') {
      event.respondWith(
        fetch(request).catch(function () {
          return caches.match(OFFLINE_URL).then(function (page) {
            return (
              page ||
              new Response('Нет связи с сервером', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              })
            );
          });
        })
      );
    }
  });
}

// Для тестов под node: в воркере `module` не существует, поэтому проверка
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chooseStrategy: chooseStrategy, staleCaches: staleCaches, isCacheable: isCacheable, CACHE_NAME: CACHE_NAME, CACHE_PREFIX: CACHE_PREFIX, PRECACHE: PRECACHE, OFFLINE_URL: OFFLINE_URL };
}
