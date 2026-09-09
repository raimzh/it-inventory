'use strict';
/**
 * Настройки интерфейса пользователя.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/preferences.test.js
 *
 * Главное, что здесь закрепляется, — изоляция. Идентификатор пользователя
 * берётся из токена и никогда из запроса, поэтому в адресе его нет вовсе.
 * Стоит однажды принять его параметром — и любой авторизованный сможет
 * читать и переписывать чужие настройки. Ущерб невелик, но это ровно та
 * дыра, которую потом никто не ищет, потому что «настройки же».
 *
 * Второе — белый список ключей и потолок размера: без них таблица
 * превращается в место, куда клиент складывает что угодно и сколько
 * угодно.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { assertNotProductionDb } = require('./guard-test-db');

// Тест пишет в базу — против боевой не запускаем
assertNotProductionDb();

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };
const KEY = 'asset-table-columns';

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, strays: [] };

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

/** Временный пользователь со своим токеном. */
async function makeUser(role = 'viewer') {
  const username = `pref_test_${uniq()}`;
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: 'Проверка настроек', role },
  });
  assert.equal(created.status, 201, 'пользователь должен создаваться');
  ctx.strays.push(created.body.id);

  const login = await req('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(login.status, 200);
  return { id: created.body.id, token: login.body.accessToken };
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;
});

after(async () => {
  await req(`/preferences/${KEY}`, { method: 'DELETE', token: ctx.adminToken });
  for (const id of ctx.strays) {
    await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
  }
});

test('без токена настройки недоступны', async () => {
  assert.equal((await req(`/preferences/${KEY}`)).status, 401);
  assert.equal((await req(`/preferences/${KEY}`, { method: 'PUT', body: { value: {} } })).status, 401);
  assert.equal((await req(`/preferences/${KEY}`, { method: 'DELETE' })).status, 401);
});

test('пока настройку не меняли, приходит null', async () => {
  await req(`/preferences/${KEY}`, { method: 'DELETE', token: ctx.adminToken });
  const got = await req(`/preferences/${KEY}`, { token: ctx.adminToken });
  assert.equal(got.status, 200);
  assert.equal(got.body.value, null, 'клиент по null понимает, что берёт значения по умолчанию');
});

test('сохранённая настройка возвращается как есть', async () => {
  const value = { order: ['inventoryNumber', 'name', 'status'], hidden: ['category'] };
  const put = await req(`/preferences/${KEY}`, { method: 'PUT', token: ctx.adminToken, body: { value } });
  assert.equal(put.status, 204);

  const got = await req(`/preferences/${KEY}`, { token: ctx.adminToken });
  assert.deepEqual(got.body.value, value, 'сервер в структуру не вмешивается');
});

test('повторное сохранение обновляет, а не плодит записи', async () => {
  // Одна учётная запись легко открыта в двух вкладках; сохранение идёт
  // через upsert по паре «пользователь + ключ»
  await req(`/preferences/${KEY}`, { method: 'PUT', token: ctx.adminToken, body: { value: { order: ['name'], hidden: [] } } });
  await req(`/preferences/${KEY}`, { method: 'PUT', token: ctx.adminToken, body: { value: { order: ['status'], hidden: [] } } });

  const got = await req(`/preferences/${KEY}`, { token: ctx.adminToken });
  assert.deepEqual(got.body.value, { order: ['status'], hidden: [] }, 'осталось последнее значение');
});

test('сброс возвращает к значениям по умолчанию', async () => {
  await req(`/preferences/${KEY}`, { method: 'PUT', token: ctx.adminToken, body: { value: { order: ['name'], hidden: [] } } });

  const del = await req(`/preferences/${KEY}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(del.status, 204);

  const got = await req(`/preferences/${KEY}`, { token: ctx.adminToken });
  assert.equal(got.body.value, null);
});

test('сброс несуществующей настройки не считается ошибкой', async () => {
  // Клиент жмёт «Сбросить», ничего не настроив, — это не повод для отказа
  const del = await req(`/preferences/${KEY}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(del.status, 204);
});

test('настройки одного пользователя не видны другому', async () => {
  // Тот самый случай, ради которого идентификатор берётся из токена
  const a = await makeUser();
  const b = await makeUser();

  const mine = { order: ['inventoryNumber'], hidden: ['name'] };
  assert.equal((await req(`/preferences/${KEY}`, { method: 'PUT', token: a.token, body: { value: mine } })).status, 204);

  const seenByB = await req(`/preferences/${KEY}`, { token: b.token });
  assert.equal(seenByB.body.value, null, 'чужая настройка не должна быть видна');

  // И запись одного не затирает настройку другого
  await req(`/preferences/${KEY}`, { method: 'PUT', token: b.token, body: { value: { order: ['status'], hidden: [] } } });
  const seenByA = await req(`/preferences/${KEY}`, { token: a.token });
  assert.deepEqual(seenByA.body.value, mine, 'своя настройка на месте');
});

test('роль «только просмотр» настраивает свой интерфейс', async () => {
  // Настройки интерфейса не про права на данные: их меняет кто угодно
  const viewer = await makeUser('viewer');
  const put = await req(`/preferences/${KEY}`, {
    method: 'PUT', token: viewer.token, body: { value: { order: ['name'], hidden: [] } },
  });
  assert.equal(put.status, 204);
});

test('неизвестный ключ отклоняется', async () => {
  // Иначе таблица станет свалкой произвольных имён
  const put = await req('/preferences/что-угодно', {
    method: 'PUT', token: ctx.adminToken, body: { value: { a: 1 } },
  });
  assert.equal(put.status, 400);
  assert.equal((await req('/preferences/что-угодно', { token: ctx.adminToken })).status, 400);
});

test('слишком большое значение отклоняется', async () => {
  // Настройка колонок весит сотни байт; мегабайтам взяться неоткуда
  const put = await req(`/preferences/${KEY}`, {
    method: 'PUT', token: ctx.adminToken, body: { value: { junk: 'x'.repeat(20 * 1024) } },
  });
  assert.equal(put.status, 400);
});

test('пустое значение отклоняется', async () => {
  // null от клиента означал бы «сбросить», а для этого есть DELETE
  const put = await req(`/preferences/${KEY}`, { method: 'PUT', token: ctx.adminToken, body: { value: null } });
  assert.equal(put.status, 400);
});
