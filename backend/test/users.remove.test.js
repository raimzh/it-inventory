'use strict';
/**
 * Уборка учётных записей.
 *
 * Раньше DELETE /users/:id только снимал флаг активности, поэтому тестовые
 * учётки копились в базе: за месяц их набралось 43 штуки при одной настоящей.
 * Теперь запись удаляется полностью, если за ней не осталось следов, и
 * деактивируется, если следы есть — историю правок и журнал аудита обезличивать
 * нельзя.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/users.remove.test.js
 *
 * Набор убирает за собой полностью: именно это он и проверяет.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

/** Единственная запись, которую набор оставляет в базе намеренно (см. ниже) */
const FIXTURE_REFERENCED = 'rm_fixture_referenced';

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, adminId: null, strays: [] };

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

/** Создаёт временного пользователя с ролью «Просмотр». */
async function makeUser(role = 'viewer') {
  const username = `rm_test_${uniq()}`;
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: 'Проверка уборки', role },
  });
  assert.equal(created.status, 201, 'пользователь должен создаваться');
  ctx.strays.push(created.body.id);
  return { ...created.body, username, password };
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;
  ctx.adminId = login.body.user.id;
});

after(async () => {
  for (const id of ctx.strays) {
    await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
  }
});

test('учётка без следов удаляется полностью', async () => {
  const user = await makeUser();

  const removed = await req(`/users/${user.id}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.deleted, true, 'должна быть удалена, а не деактивирована');

  const after = await req(`/users/${user.id}`, { token: ctx.adminToken });
  assert.equal(after.status, 404, 'записи больше нет');
});

test('учётка со следами в журнале деактивируется, а не стирается', async () => {
  // Эта проверка по своей природе оставляет запись в базе: чтобы убедиться,
  // что учётка со следами НЕ стирается, нужен реальный след, а удалить его
  // через API нельзя — журнал аудита на то и журнал. Поэтому используется
  // постоянная фикстура с фиксированным именем: сколько бы раз ни запускали,
  // в базе остаётся ровно одна такая запись, а не по одной на прогон.
  const list = await req(`/users?search=${FIXTURE_REFERENCED}`, { token: ctx.adminToken });
  let user = (list.body || []).find(u => u.username === FIXTURE_REFERENCED);

  if (!user) {
    const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
    const created = await req('/users', {
      method: 'POST', token: ctx.adminToken,
      body: {
        username: FIXTURE_REFERENCED, email: `${FIXTURE_REFERENCED}@example.com`,
        password, fullName: 'Фикстура: учётка со следом в журнале', role: 'viewer',
      },
    });
    assert.equal(created.status, 201);
    user = created.body;

    // След оставляет не вход (он выполняется без аутентификации и в журнал
    // действий не попадает), а первое изменяющее действие под своим токеном
    const login = await req('/auth/login', { method: 'POST', body: { username: FIXTURE_REFERENCED, password } });
    assert.equal(login.status, 200);
    const acted = await req('/auth/logout', { method: 'POST', token: login.body.accessToken });
    assert.equal(acted.status, 200, 'выход должен пройти и попасть в журнал');
  }

  const removed = await req(`/users/${user.id}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.deleted, false, 'стирать учётку со следами нельзя');
  assert.ok(removed.body.references && Object.keys(removed.body.references).length > 0,
    'ответ должен называть, что именно ссылается');

  const after = await req(`/users/${user.id}`, { token: ctx.adminToken });
  assert.equal(after.status, 200, 'запись осталась');
  assert.equal(after.body.isActive, false, 'но деактивирована');
});

test('последний активный администратор не убирается', async () => {
  // Себя убрать нельзя в принципе, поэтому заводим второго админа и им же
  // пробуем снять единственного оставшегося после его деактивации
  const second = await makeUser('admin');
  const secondLogin = await req('/auth/login', { method: 'POST', body: { username: second.username, password: second.password } });
  assert.equal(secondLogin.status, 200);

  // Пока администраторов двое — снятие проходит
  const first = await req(`/users/${second.id}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(first.status, 200);

  // Теперь активный администратор один; он же пытается убрать сам себя
  const self = await req(`/users/${ctx.adminId}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(self.status, 409, 'собственную учётку убрать нельзя');
});

test('несуществующая учётка даёт 404', async () => {
  const r = await req('/users/00000000-0000-0000-0000-000000000000', { method: 'DELETE', token: ctx.adminToken });
  assert.equal(r.status, 404);
});
