'use strict';
/**
 * Эмулятор стандартного интерфейса OData 1С для тестов.
 *
 * Отвечает так, как отвечает настоящая 1С: `{ value: [...] }`, постранично
 * по $top/$skip, ошибки — в `odata.error.message.value`. Живая 1С в CI
 * недоступна, а без эмулятора сетевая часть обмена не проверялась бы вовсе —
 * ровно так обмен и прожил полгода, ни разу не поговорив с настоящей базой.
 *
 *   const emu = await startEmulator({ port: 3998, entities: { 'Catalog_X': [...] } });
 *   emu.requests  // что спрашивали — для проверки заголовков и параметров
 *   await emu.close();
 */
const http = require('node:http');

function startEmulator({ port = 0, entities = {}, failing = {}, auth } = {}) {
  const requests = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const entity = path.split('/odata/standard.odata/')[1] ?? path.replace(/^\/+/, '');
    requests.push({ entity, params: Object.fromEntries(url.searchParams), headers: req.headers });

    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    if (auth && req.headers.authorization !== auth) {
      return send(401, { 'odata.error': { code: '', message: { lang: 'ru', value: 'Не пройдена аутентификация' } } });
    }
    if (failing[entity]) {
      return send(failing[entity], { 'odata.error': { code: '14', message: { lang: 'ru', value: `Не найдено: ${entity}` } } });
    }
    if (!(entity in entities)) {
      return send(404, { 'odata.error': { code: '9', message: { lang: 'ru', value: `Не найден сегмент ${entity}` } } });
    }

    let rows = [...entities[entity]];
    if (url.searchParams.get('$orderby') === 'Ref_Key') rows.sort((a, b) => String(a.Ref_Key).localeCompare(String(b.Ref_Key)));
    const skip = Number(url.searchParams.get('$skip') ?? 0);
    const top = url.searchParams.has('$top') ? Number(url.searchParams.get('$top')) : rows.length;
    send(200, { 'odata.metadata': 'emulator', value: rows.slice(skip, skip + top) });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port;
      resolve({
        port: actual,
        url: `http://127.0.0.1:${actual}/base/odata/standard.odata`,
        requests,
        /** Подменить содержимое сущностей между прогонами */
        set(name, rows) { entities[name] = rows; },
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

/** GUID для фикстур: детерминированный, чтобы порядок по Ref_Key был предсказуем */
function guid(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

module.exports = { startEmulator, guid };
