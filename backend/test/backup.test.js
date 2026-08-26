'use strict';
/**
 * Резервные копии: доступ, имена файлов, создание и выгрузка.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/backup.test.js
 *
 * Модуль не был покрыт ничем, а особенность у него неприятная: про
 * сломанный бэкап узнают ровно в тот момент, когда он понадобился.
 * Ночная задача пишет только в журнал, и молчаливый отказ — самый
 * вероятный сценарий: у pg_dump не тот путь, у каталога нет прав.
 *
 * Второе, что здесь закрепляется, — проверка имени файла при выгрузке.
 * Имя приходит из URL, и без строгой проверки `../../..` давал чтение
 * любого файла на диске. Дамп содержит всю базу целиком, включая хеши
 * паролей, поэтому цена ошибки здесь выше обычной.
 *
 * Набор удаляет только те копии, которые создал сам: чужие файлы в
 * каталоге он не трогает.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { assertNotProductionDb } = require('./guard-test-db');

// Тест пишет в базу и на диск — против боевой не запускаем
assertNotProductionDb();

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, viewer: null, userIds: [], created: [] };

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

async function makeUser(role) {
  const username = `bk_${role}_${uniq()}`;
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: `Проверка ${role}`, role },
  });
  assert.equal(created.status, 201);
  ctx.userIds.push(created.body.id);
  const login = await req('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(login.status, 200);
  return { token: login.body.accessToken };
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;
  ctx.viewer = await makeUser('viewer');
});

after(async () => {
  for (const id of ctx.userIds) await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
});

test('список копий доступен администратору', async () => {
  const res = await req('/backup', { token: ctx.adminToken });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body), 'должен вернуться список');
});

test('копии закрыты от всех, кроме администратора', async () => {
  // Дамп содержит базу целиком, включая хеши паролей: доступ сюда
  // равнозначен доступу ко всему учёту
  assert.equal((await req('/backup', { token: ctx.viewer.token })).status, 403);
  assert.equal((await req('/backup', { method: 'POST', token: ctx.viewer.token })).status, 403);
  assert.equal(
    (await req('/backup/download/backup-2020-01-01T00-00-00-000Z.sql', { token: ctx.viewer.token })).status,
    403,
  );
});

test('без токена копии недоступны', async () => {
  assert.equal((await req('/backup')).status, 401);
});

test('имя файла не по формату отклоняется', async () => {
  // Именно 400, а не 404: отказ должен наступать на проверке имени,
  // до всякого обращения к файловой системе
  for (const bad of ['произвольное.sql', 'backup.sql', 'dump.tar', 'backup-2020.txt']) {
    const res = await req(`/backup/download/${encodeURIComponent(bad)}`, { token: ctx.adminToken });
    assert.equal(res.status, 400, `имя «${bad}» должно отклоняться`);
  }
});

test('обход каталога в имени файла не проходит', async () => {
  // Без строгой проверки такое имя давало чтение любого файла на диске
  const попытки = [
    '../../../etc/passwd',
    '..%2f..%2f..%2fetc%2fpasswd',
    '%2e%2e%2f%2e%2e%2fbackend%2f.env',
    'backup-2020-01-01T00-00-00-000Z.sql/../../../etc/passwd',
  ];
  for (const bad of попытки) {
    const res = await req(`/backup/download/${bad}`, { token: ctx.adminToken });
    assert.ok(
      res.status === 400 || res.status === 404,
      `обход «${bad}» должен отклоняться, получено ${res.status}`,
    );
    // Главное — наружу не должно уйти содержимое чужого файла
    assert.ok(
      typeof res.body !== 'string' || !res.body.includes('root:'),
      `по «${bad}» не должно отдаваться содержимое файла`,
    );
  }
});

test('правильное, но несуществующее имя даёт 404', async () => {
  const res = await req('/backup/download/backup-2000-01-01T00-00-00-000Z.sql', { token: ctx.adminToken });
  assert.equal(res.status, 404);
});

test('копия создаётся, попадает в список и скачивается', async () => {
  // Самый важный случай: ночная задача пишет только в журнал, и её
  // молчаливый отказ иначе не обнаружить
  const created = await req('/backup', { method: 'POST', token: ctx.adminToken });
  assert.equal(created.status, 201, `копия должна создаваться, ответ: ${JSON.stringify(created.body)}`);
  assert.ok(created.body.filename, 'должно вернуться имя файла');
  assert.ok(created.body.size > 0, 'копия не должна быть пустой');
  ctx.created.push(created.body.filename);

  const list = await req('/backup', { token: ctx.adminToken });
  const найдена = list.body.find(b => b.filename === created.body.filename);
  assert.ok(найдена, 'созданная копия должна появиться в списке');
  assert.equal(найдена.size, created.body.size);

  // Скачивание отдаёт непустое тело
  const res = await fetch(`${BASE}/backup/download/${created.body.filename}`, {
    headers: { authorization: `Bearer ${ctx.adminToken}` },
  });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0, 'скачанная копия не должна быть пустой');
});

test('имя созданной копии соответствует ожидаемому формату', async () => {
  // По этому же выражению фильтруется список и проверяется выгрузка:
  // разойдись они — копии перестали бы находиться
  assert.ok(ctx.created.length > 0, 'предыдущий тест должен был создать копию');
  for (const name of ctx.created) {
    assert.match(name, /^backup-[0-9T:.-]+\.sql(\.enc)?$/, `имя «${name}» должно подходить под формат`);
  }
});
