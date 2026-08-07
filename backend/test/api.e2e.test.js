'use strict';
/**
 * Сквозные тесты API: аутентификация, refresh-токены, ролевые ограничения,
 * оптимистичная блокировка и правила работы с ОС.
 *
 * Бьют по запущенному экземпляру приложения (по умолчанию http://localhost:3009),
 * то есть проверяют реальную цепочку HTTP → guard → сервис → БД, а не моки.
 * Созданные записи удаляются в конце.
 *
 *   BASE_URL=http://localhost:3009 node --test test/api.e2e.test.js
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

const ctx = { adminToken: null, viewer: null, createdAssetIds: [], createdUserIds: [] };

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;
  ctx.adminRefresh = login.body.refreshToken;

  // Отдельный пользователь с ролью viewer — для проверки ограничений
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const username = 'e2e_viewer_' + Math.random().toString(36).slice(2, 8);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: 'E2E просмотр', role: 'viewer' },
  });
  assert.equal(created.status, 201, 'viewer должен создаваться');
  ctx.createdUserIds.push(created.body.id);
  const vlogin = await req('/auth/login', { method: 'POST', body: { username, password } });
  ctx.viewer = { token: vlogin.body.accessToken, id: created.body.id };
});

after(async () => {
  for (const id of ctx.createdAssetIds) {
    await req(`/assets/${id}`, { method: 'DELETE', token: ctx.adminToken });
  }
  for (const id of ctx.createdUserIds) {
    await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
  }
});

// ── Аутентификация ──────────────────────────────────────────────────────────

test('неверный пароль даёт 401, а не 400', async () => {
  const r = await req('/auth/login', { method: 'POST', body: { username: ADMIN.username, password: 'заведомо-неверный' } });
  assert.equal(r.status, 401);
});

test('запрос без токена отклоняется', async () => {
  const r = await req('/assets');
  assert.equal(r.status, 401);
});

test('refresh выдаёт рабочую пару токенов', async () => {
  const r = await req('/auth/refresh', { method: 'POST', body: { refreshToken: ctx.adminRefresh } });
  assert.equal(r.status, 200);
  assert.ok(r.body.accessToken && r.body.refreshToken);
  const profile = await req('/auth/profile', { token: r.body.accessToken });
  assert.equal(profile.status, 200, 'выданный access-токен должен работать');
});

test('refresh не принимает мусор и access-токен', async () => {
  assert.equal((await req('/auth/refresh', { method: 'POST', body: { refreshToken: 'мусор' } })).status, 401);
  assert.equal((await req('/auth/refresh', { method: 'POST', body: { refreshToken: ctx.adminToken } })).status, 401,
    'access-токен не должен приниматься как refresh — у них разные секреты');
});

test('ответ содержит requestId для поиска в логах', async () => {
  const r = await req('/assets');
  assert.ok(r.body.requestId, 'в теле ошибки должен быть requestId');
  assert.ok(r.headers.get('x-request-id'), 'в заголовках должен быть X-Request-Id');
});

// ── Ролевые ограничения ─────────────────────────────────────────────────────

test('viewer не может выгрузить базу и открыть отчёты', async () => {
  assert.equal((await req('/reports/export/assets', { token: ctx.viewer.token })).status, 403);
  assert.equal((await req('/reports/by-department', { token: ctx.viewer.token })).status, 403);
});

test('viewer не может создать или изменить ОС', async () => {
  const create = await req('/assets', {
    method: 'POST', token: ctx.viewer.token,
    body: { inventoryNumber: 'E2E-FORBIDDEN', name: 'Не должно создаться' },
  });
  assert.equal(create.status, 403);
});

test('viewer видит остатки склада, но не проводит операции', async () => {
  assert.equal((await req('/warehouse/items', { token: ctx.viewer.token })).status, 200);
  const op = await req('/warehouse/stock/receipt', {
    method: 'POST', token: ctx.viewer.token,
    body: { itemId: '00000000-0000-0000-0000-000000000000', warehouseId: '00000000-0000-0000-0000-000000000000', quantity: 1 },
  });
  assert.equal(op.status, 403);
});

test('операционные данные закрыты от роли «Просмотр»', async () => {
  for (const ep of ['/assets/excel/logs', '/inventory/sessions', '/sync/logs']) {
    const r = await req(ep, { token: ctx.viewer.token });
    assert.equal(r.status, 403, `${ep} должен быть закрыт для viewer`);
  }
});

test('роль «Просмотр» сохраняет доступ к инвентарю и дашборду', async () => {
  for (const ep of ['/assets', '/assets/stats', '/sync/last', '/warehouse/items']) {
    const r = await req(ep, { token: ctx.viewer.token });
    assert.equal(r.status, 200, `${ep} должен быть доступен viewer — в этом смысл роли`);
  }
});

test('вложение не скачать без авторизации, а недопустимый тип не загрузить', async () => {
  const inv = 'E2E-FILE-' + Math.floor(Math.random() * 1e6);
  const asset = await req('/assets', { method: 'POST', token: ctx.adminToken, body: { inventoryNumber: inv, name: 'Вложения' } });
  ctx.createdAssetIds.push(asset.body.id);

  // Загружаем допустимое изображение (1x1 PNG)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const okForm = new FormData();
  okForm.append('file', new Blob([png], { type: 'image/png' }), 'photo.png');
  const uploaded = await fetch(`${BASE}/assets/${asset.body.id}/files?type=photo`, {
    method: 'POST', headers: { authorization: `Bearer ${ctx.adminToken}` }, body: okForm,
  });
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();

  const url = `${BASE}/assets/${asset.body.id}/files/${file.id}/download`;
  assert.equal((await fetch(url)).status, 401, 'без токена файл отдаваться не должен');
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${ctx.adminToken}` } })).status, 200);
  // Тег <img> не может отправить заголовок — токен должен приниматься и из куки
  assert.equal((await fetch(url, { headers: { cookie: `access_token=${ctx.adminToken}` } })).status, 200,
    'токен из куки нужен, чтобы картинка грузилась в <img>');

  // Недопустимый тип
  const badForm = new FormData();
  badForm.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'text/html' }), 'evil.html');
  const rejected = await fetch(`${BASE}/assets/${asset.body.id}/files?type=doc`, {
    method: 'POST', headers: { authorization: `Bearer ${ctx.adminToken}` }, body: badForm,
  });
  assert.equal(rejected.status, 400, 'HTML-файл должен отклоняться с понятной ошибкой, а не 500');
});

test('health доступен без токена', async () => {
  assert.equal((await req('/health')).status, 200);
  const ready = await req('/health/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.database, 'ok');
});

// ── Основные средства ───────────────────────────────────────────────────────

test('дубликат инвентарного номера отклоняется с понятным сообщением', async () => {
  const inv = 'E2E-DUP-' + Math.floor(Math.random() * 1e6);
  const first = await req('/assets', { method: 'POST', token: ctx.adminToken, body: { inventoryNumber: inv, name: 'Первое' } });
  assert.equal(first.status, 201);
  ctx.createdAssetIds.push(first.body.id);

  const second = await req('/assets', { method: 'POST', token: ctx.adminToken, body: { inventoryNumber: inv, name: 'Второе' } });
  assert.equal(second.status, 400, 'должен быть 400, а не 500');
  assert.match(String(second.body.message), /уже существует/i);
});

test('устаревшая версия карточки не затирает чужую правку', async () => {
  const inv = 'E2E-LOCK-' + Math.floor(Math.random() * 1e6);
  const created = await req('/assets', { method: 'POST', token: ctx.adminToken, body: { inventoryNumber: inv, name: 'Блокировка' } });
  ctx.createdAssetIds.push(created.body.id);
  const version = created.body.version;

  const first = await req(`/assets/${created.body.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { version, comment: 'правка первого' },
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.version, version + 1, 'версия должна увеличиться');

  const stale = await req(`/assets/${created.body.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { version, comment: 'правка второго' },
  });
  assert.equal(stale.status, 409, 'сохранение с устаревшей версией должно отклоняться');

  const current = await req(`/assets/${created.body.id}`, { token: ctx.adminToken });
  assert.equal(current.body.comment, 'правка первого', 'первая правка должна сохраниться');
});

test('несуществующая ОС даёт 404', async () => {
  const r = await req('/assets/11111111-1111-1111-1111-111111111111', { token: ctx.adminToken });
  assert.equal(r.status, 404);
});
