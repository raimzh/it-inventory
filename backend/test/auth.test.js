'use strict';
/**
 * Вход, обновление и отзыв токенов.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/auth.test.js
 *
 * Модуль auth до сих пор не был покрыт ничем, хотя это граница
 * безопасности: ошибка здесь означает чужой доступ ко всей системе.
 *
 * Главное, что закрепляют эти тесты, — отзыв токенов. Он построен не на
 * списке выданных токенов, а на счётчике tokenVersion: выход увеличивает
 * его, и все ранее выданные refresh-токены перестают подходить. Механизм
 * тихий — при поломке вход продолжит работать, а перестанет работать
 * только отзыв, и заметить это без теста нельзя.
 *
 * Набор работает под собственными временными учётками и убирает их за
 * собой. Администратора он не трогает намеренно: выход увеличил бы его
 * tokenVersion и обрушил бы токены остальных наборов, идущих следом.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { assertNotProductionDb } = require('./guard-test-db');

// Тест пишет в базу — против боевой не запускаем
assertNotProductionDb();

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

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

/** Временный пользователь: у каждого теста свой, чтобы отзыв не задевал соседей */
async function makeUser(role = 'viewer') {
  const username = `auth_test_${uniq()}`;
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: 'Проверка входа', role },
  });
  assert.equal(created.status, 201, 'пользователь должен создаваться');
  ctx.strays.push(created.body.id);
  return { id: created.body.id, username, password };
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;
});

after(async () => {
  for (const id of ctx.strays) {
    await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
  }
});

test('вход выдаёт пару токенов и не отдаёт хеш пароля', async () => {
  const user = await makeUser();
  const res = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });

  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken, 'должен вернуться access-токен');
  assert.ok(res.body.refreshToken, 'должен вернуться refresh-токен');
  assert.equal(res.body.user.username, user.username);
  // Хеш не должен покидать сервер ни при каких обстоятельствах
  assert.equal(res.body.user.passwordHash, undefined);
  assert.ok(!JSON.stringify(res.body).includes('$2'), 'в ответе не должно быть bcrypt-хеша');
});

test('вход по адресу почты работает наравне с логином', async () => {
  const user = await makeUser();
  const res = await req('/auth/login', {
    method: 'POST', body: { username: `${user.username}@example.com`, password: user.password },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, user.username);
});

test('неверный пароль отклоняется', async () => {
  const user = await makeUser();
  const res = await req('/auth/login', { method: 'POST', body: { username: user.username, password: 'НеТотПароль1!' } });
  assert.equal(res.status, 401);
  assert.equal(res.body.accessToken, undefined);
});

test('несуществующий пользователь отклоняется', async () => {
  const res = await req('/auth/login', { method: 'POST', body: { username: `нет_такого_${uniq()}`, password: 'Whatever1!' } });
  assert.equal(res.status, 401);
});

test('деактивированный пользователь войти не может', async () => {
  const user = await makeUser();
  const off = await req(`/users/${user.id}`, { method: 'PATCH', token: ctx.adminToken, body: { isActive: false } });
  assert.equal(off.status, 200, 'деактивация должна проходить');

  const res = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });
  assert.equal(res.status, 401, 'вход заблокированного должен отклоняться');
});

test('профиль без токена недоступен', async () => {
  const res = await req('/auth/profile');
  assert.equal(res.status, 401);
});

test('профиль с подложным токеном недоступен', async () => {
  // Токен подписан не тем секретом — подпись обязана проверяться
  const fake = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYWRtaW4ifQ.podlog';
  const res = await req('/auth/profile', { token: fake });
  assert.equal(res.status, 401);
});

test('профиль по своему токену отдаёт своего пользователя', async () => {
  const user = await makeUser();
  const login = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });

  const res = await req('/auth/profile', { token: login.body.accessToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.username, user.username);
  assert.equal(res.body.passwordHash, undefined);
});

test('refresh обменивается на новую пару токенов', async () => {
  const user = await makeUser();
  const login = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });

  const res = await req('/auth/refresh', { method: 'POST', body: { refreshToken: login.body.refreshToken } });
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken, 'должен прийти новый access-токен');
  assert.ok(res.body.refreshToken, 'должен прийти новый refresh-токен');

  // Новый токен обязан работать
  const profile = await req('/auth/profile', { token: res.body.accessToken });
  assert.equal(profile.status, 200);
});

test('испорченный refresh отклоняется', async () => {
  const res = await req('/auth/refresh', { method: 'POST', body: { refreshToken: 'не.токен.вовсе' } });
  assert.equal(res.status, 401);
});

test('access-токен не годится вместо refresh', async () => {
  // Секреты у пары разные: подстановка одного вместо другого не должна проходить
  const user = await makeUser();
  const login = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });

  const res = await req('/auth/refresh', { method: 'POST', body: { refreshToken: login.body.accessToken } });
  assert.equal(res.status, 401);
});

test('выход отзывает ранее выданный refresh-токен', async () => {
  // Ради этого теста всё и затевалось: механизм отзыва тихий, при поломке
  // вход продолжит работать, а перестанет работать только отзыв
  const user = await makeUser();
  const login = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });

  const before = await req('/auth/refresh', { method: 'POST', body: { refreshToken: login.body.refreshToken } });
  assert.equal(before.status, 200, 'до выхода refresh должен работать');

  const out = await req('/auth/logout', { method: 'POST', token: login.body.accessToken });
  assert.equal(out.status, 200);

  const after = await req('/auth/refresh', { method: 'POST', body: { refreshToken: before.body.refreshToken } });
  assert.equal(after.status, 401, 'после выхода refresh обязан отклоняться');
});

test('удалённый пользователь не может обновить токены', async () => {
  const user = await makeUser();
  const login = await req('/auth/login', { method: 'POST', body: { username: user.username, password: user.password } });

  const removed = await req(`/users/${user.id}`, { method: 'DELETE', token: ctx.adminToken });
  assert.equal(removed.status, 200);

  const res = await req('/auth/refresh', { method: 'POST', body: { refreshToken: login.body.refreshToken } });
  assert.equal(res.status, 401, 'токены удалённого или заблокированного не продлеваются');
});
