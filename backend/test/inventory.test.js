'use strict';
/**
 * Инвентаризация: состав сессии, отметка позиций, отзыв прав и закрытие.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/inventory.test.js
 *
 * Ежедневный рабочий процесс: кладовщик ходит со сканером и отмечает
 * технику. До сих пор из него был покрыт только разбор кода с этикетки
 * (scan.lookup), а сам ход инвентаризации — нет.
 *
 * Отдельного внимания стоит счётчик проверенных в сессии: он не
 * инкрементируется, а пересчитывается сырым подзапросом с параметром
 * внутри `set(() => ...)`. Если TypeORM перестанет подставлять туда
 * параметр, счётчик молча собьётся или посчитает чужие сессии — на
 * экране это выглядит как «проверено N из M», и неверное N никто не
 * заметит.
 *
 * Сессии создаются под собственное подразделение: так их состав
 * предсказуем и не зависит от того, что оставили другие наборы.
 *
 * Об уборке: удаления сессий в API нет вовсе, поэтому созданные сессии
 * остаются. В CI база одноразовая, а против боевой набор не запустится
 * (guard-test-db), так что копиться им негде. Подразделения и ОС набор
 * за собой убирает.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { assertNotProductionDb } = require('./guard-test-db');

// Тест пишет в базу — против боевой не запускаем
assertNotProductionDb();

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, viewer: null, keeper: null, deptIds: [], assetIds: [], userIds: [] };

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
  const username = `inv_${role}_${uniq()}`;
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: `Проверка ${role}`, role },
  });
  assert.equal(created.status, 201, `должен создаваться пользователь роли ${role}`);
  ctx.userIds.push(created.body.id);
  const login = await req('/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(login.status, 200);
  return { id: created.body.id, token: login.body.accessToken };
}

/** Своё подразделение — чтобы состав сессии зависел только от этого набора */
async function makeDept() {
  const res = await req('/departments', {
    method: 'POST', token: ctx.adminToken,
    body: { name: `Проверка инвентаризации ${uniq()}`, code: `INV${uniq()}` },
  });
  assert.equal(res.status, 201, 'подразделение должно создаваться');
  ctx.deptIds.push(res.body.id);
  return res.body.id;
}

async function makeAsset(departmentId, name = 'ОС для инвентаризации') {
  const inventoryNumber = `INV-TEST-${uniq()}`;
  const res = await req('/assets', {
    method: 'POST', token: ctx.adminToken, body: { inventoryNumber, name, departmentId },
  });
  assert.equal(res.status, 201, 'ОС должно создаваться');
  ctx.assetIds.push(res.body.id);
  return { id: res.body.id, inventoryNumber };
}

async function makeSession(departmentId) {
  const res = await req('/inventory/sessions', {
    method: 'POST', token: ctx.adminToken,
    body: { name: `Проверка ${uniq()}`, departmentId },
  });
  assert.equal(res.status, 201, 'сессия должна создаваться');
  return res.body;
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;

  ctx.viewer = await makeUser('viewer');
  ctx.keeper = await makeUser('inventorizer');
});

after(async () => {
  for (const id of ctx.assetIds) await req(`/assets/${id}`, { method: 'DELETE', token: ctx.adminToken });
  for (const id of ctx.deptIds) await req(`/departments/${id}`, { method: 'DELETE', token: ctx.adminToken });
  for (const id of ctx.userIds) await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
});

test('сессия по подразделению берёт только его ОС', async () => {
  const deptA = await makeDept();
  const deptB = await makeDept();
  await makeAsset(deptA);
  await makeAsset(deptA);
  await makeAsset(deptB);

  const session = await makeSession(deptA);
  assert.equal(session.totalAssets, 2, 'в снимок должны попасть только ОС своего подразделения');

  const items = await req(`/inventory/sessions/${session.id}/items`, { token: ctx.adminToken });
  assert.equal(items.body.total, 2);
});

test('сессия — снимок на момент создания: добавленное позже в неё не попадает', async () => {
  const dept = await makeDept();
  await makeAsset(dept);
  const session = await makeSession(dept);
  assert.equal(session.totalAssets, 1);

  await makeAsset(dept);
  const items = await req(`/inventory/sessions/${session.id}/items`, { token: ctx.adminToken });
  assert.equal(items.body.total, 1, 'состав сессии не должен меняться задним числом');
});

test('отметка позиции проставляет проверившего и пересчитывает счётчик сессии', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept);
  const session = await makeSession(dept);

  const checked = await req(`/inventory/sessions/${session.id}/items/${asset.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'active', comment: 'на месте' },
  });
  assert.equal(checked.status, 200);
  assert.equal(checked.body.isChecked, true);
  assert.ok(checked.body.checkedAt, 'должно проставиться время отметки');
  assert.ok(checked.body.checkedByName, 'должно проставиться имя проверившего');
  assert.equal(checked.body.comment, 'на месте');

  // Счётчик пересчитывается подзапросом — именно он и проверяется
  const after = await req(`/inventory/sessions/${session.id}`, { token: ctx.adminToken });
  assert.equal(after.body.checkedAssets, 1);
});

test('счётчик считает только свою сессию', async () => {
  // Подзапрос пересчёта фильтрует по session_id; при потере параметра
  // сюда попали бы отметки соседних сессий
  const deptA = await makeDept();
  const deptB = await makeDept();
  const assetA = await makeAsset(deptA);
  await makeAsset(deptB);

  const sessionA = await makeSession(deptA);
  const sessionB = await makeSession(deptB);

  await req(`/inventory/sessions/${sessionA.id}/items/${assetA.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'active' },
  });

  const b = await req(`/inventory/sessions/${sessionB.id}`, { token: ctx.adminToken });
  assert.equal(b.body.checkedAssets, 0, 'отметка в чужой сессии не должна учитываться');
});

test('отметка ОС, которой нет в сессии, даёт 404', async () => {
  const deptA = await makeDept();
  const deptB = await makeDept();
  await makeAsset(deptA);
  const чужое = await makeAsset(deptB);
  const session = await makeSession(deptA);

  const res = await req(`/inventory/sessions/${session.id}/items/${чужое.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'active' },
  });
  assert.equal(res.status, 404);
});

test('скан голого инвентарного номера отмечает позицию', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept);
  const session = await makeSession(dept);

  const res = await req(`/inventory/sessions/${session.id}/scan`, {
    method: 'POST', token: ctx.adminToken, body: { inventoryNumber: asset.inventoryNumber, status: 'active' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.isChecked, true);
  assert.equal(res.body.assetId, asset.id);
});

test('скан QR-этикетки отмечает ту же позицию', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept);
  const session = await makeSession(dept);

  const res = await req(`/inventory/sessions/${session.id}/scan`, {
    method: 'POST', token: ctx.adminToken,
    body: { inventoryNumber: `INV:${asset.inventoryNumber}|ID:${asset.id}`, status: 'active' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.assetId, asset.id);
});

test('идентификатор с этикетки важнее напечатанного на ней номера', async () => {
  // Этикетку могли перепечатать: номер на ней устарел, а идентификатор нет
  const dept = await makeDept();
  const asset = await makeAsset(dept);
  const session = await makeSession(dept);

  const res = await req(`/inventory/sessions/${session.id}/scan`, {
    method: 'POST', token: ctx.adminToken,
    body: { inventoryNumber: `INV:СТАРЫЙ-НОМЕР|ID:${asset.id}`, status: 'active' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.assetId, asset.id, 'должна отметиться ОС из идентификатора');
});

test('скан неизвестного номера даёт 404', async () => {
  const dept = await makeDept();
  await makeAsset(dept);
  const session = await makeSession(dept);

  const res = await req(`/inventory/sessions/${session.id}/scan`, {
    method: 'POST', token: ctx.adminToken, body: { inventoryNumber: `НЕТ-ТАКОГО-${uniq()}` },
  });
  assert.equal(res.status, 404);
});

test('статистика отражает проверенное и расхождения', async () => {
  const dept = await makeDept();
  const a = await makeAsset(dept);
  const b = await makeAsset(dept);
  await makeAsset(dept);
  const session = await makeSession(dept);

  await req(`/inventory/sessions/${session.id}/items/${a.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'active' },
  });
  await req(`/inventory/sessions/${session.id}/items/${b.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'not_found' },
  });

  const stats = await req(`/inventory/sessions/${session.id}/stats`, { token: ctx.adminToken });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.total, 3);
  assert.equal(stats.body.checked, 2);
  assert.equal(stats.body.unchecked, 1);
  assert.equal(stats.body.notFound, 1, 'ненайденное должно попадать в расхождения');
  assert.equal(stats.body.progress, 67);
});

test('позиции фильтруются по признаку проверенности', async () => {
  const dept = await makeDept();
  const a = await makeAsset(dept);
  await makeAsset(dept);
  const session = await makeSession(dept);

  await req(`/inventory/sessions/${session.id}/items/${a.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'active' },
  });

  const checked = await req(`/inventory/sessions/${session.id}/items?isChecked=true`, { token: ctx.adminToken });
  assert.equal(checked.body.total, 1);
  const unchecked = await req(`/inventory/sessions/${session.id}/items?isChecked=false`, { token: ctx.adminToken });
  assert.equal(unchecked.body.total, 1);
});

test('роль «Просмотр» к инвентаризации не допускается', async () => {
  // Ход инвентаризации — рабочий процесс, а не справочные данные
  const list = await req('/inventory/sessions', { token: ctx.viewer.token });
  assert.equal(list.status, 403);

  const create = await req('/inventory/sessions', {
    method: 'POST', token: ctx.viewer.token, body: { name: 'Не должна создаться' },
  });
  assert.equal(create.status, 403);
});

test('инвентаризатор отмечает позиции, но закрыть сессию не может', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept);
  const session = await makeSession(dept);

  const marked = await req(`/inventory/sessions/${session.id}/items/${asset.id}`, {
    method: 'PATCH', token: ctx.keeper.token, body: { status: 'active' },
  });
  assert.equal(marked.status, 200, 'отмечать позиции инвентаризатор должен уметь');

  const closed = await req(`/inventory/sessions/${session.id}/close`, {
    method: 'POST', token: ctx.keeper.token,
  });
  assert.equal(closed.status, 403, 'закрытие сессии — за бухгалтером или администратором');
});

test('закрытие проставляет статус и дату окончания', async () => {
  const dept = await makeDept();
  await makeAsset(dept);
  const session = await makeSession(dept);

  const res = await req(`/inventory/sessions/${session.id}/close`, { method: 'POST', token: ctx.adminToken });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'closed');
  assert.ok(res.body.endDate, 'должна проставиться дата окончания');
});

test('несуществующая сессия даёт 404, а не пустой ответ', async () => {
  const res = await req('/inventory/sessions/00000000-0000-0000-0000-000000000000', { token: ctx.adminToken });
  assert.equal(res.status, 404);
});
