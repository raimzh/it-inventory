'use strict';
/**
 * Отчёты и выгрузка в Excel.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/reports.test.js
 *
 * Отчёты только читают, поэтому испортить данные не могут — но по ним
 * принимают решения и сдают инвентаризацию. Молча неверная цифра здесь
 * хуже отказа: отказ видно сразу, а неверную сумму по подразделению
 * никто не пересчитывает вручную.
 *
 * Выгрузка проверяется не «файл непустой», а разбором самого файла:
 * содержимое должно совпадать с тем, что в учёте. Иначе тест проходил
 * бы и на пустой книге с одними заголовками.
 *
 * Все проверки привязаны к собственному подразделению набора: отчёты
 * считают по всей базе, и без такой привязки цифры зависели бы от
 * того, что оставили соседние наборы.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { assertNotProductionDb } = require('./guard-test-db');

// Набор заводит ОС и подразделения — против боевой базы не запускаем
assertNotProductionDb();

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, viewer: null, keeper: null, userIds: [], assetIds: [], deptIds: [] };

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
  const username = `rep_${role}_${uniq()}`;
  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const created = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: `Проверка ${role}`, role },
  });
  assert.equal(created.status, 201);
  ctx.userIds.push(created.body.id);
  const login = await req('/auth/login', { method: 'POST', body: { username, password } });
  return { token: login.body.accessToken };
}

async function makeDept() {
  const name = `Отчёты ${uniq()}`;
  const res = await req('/departments', {
    method: 'POST', token: ctx.adminToken, body: { name, code: `REP${uniq()}` },
  });
  assert.equal(res.status, 201);
  ctx.deptIds.push(res.body.id);
  return { id: res.body.id, name };
}

async function makeAsset(departmentId, fields = {}) {
  const inventoryNumber = `REP-${uniq()}`;
  const res = await req('/assets', {
    method: 'POST', token: ctx.adminToken,
    body: { inventoryNumber, name: 'ОС для отчёта', departmentId, ...fields },
  });
  assert.equal(res.status, 201, `ОС должно создаваться: ${JSON.stringify(res.body)}`);
  ctx.assetIds.push(res.body.id);
  return { id: res.body.id, inventoryNumber };
}

/** Скачивает выгрузку и разбирает книгу — проверяем содержимое, а не факт ответа */
async function fetchSheet(path) {
  const res = await fetch(BASE + path, { headers: { authorization: `Bearer ${ctx.adminToken}` } });
  assert.equal(res.status, 200, `выгрузка должна отдаваться: ${path}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Книга Excel — это zip: первые байты PK. Так отличаем файл от текста ошибки
  assert.equal(buf.subarray(0, 2).toString(), 'PK', 'ответ должен быть книгой Excel');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0];
}

/** Все значения листа одной строкой — чтобы искать по содержимому */
function sheetText(ws) {
  const parts = [];
  ws.eachRow(row => row.eachCell(cell => parts.push(String(cell.value ?? ''))));
  return parts.join('');
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

test('отчёт об отсутствующих берёт только ненайденные', async () => {
  const dept = await makeDept();
  const пропала = await makeAsset(dept.id, { status: 'not_found' });
  const на_месте = await makeAsset(dept.id, { status: 'active' });

  const res = await req(`/reports/missing?departmentId=${dept.id}`, { token: ctx.adminToken });
  assert.equal(res.status, 200);
  const номера = res.body.map(a => a.id);
  assert.ok(номера.includes(пропала.id), 'ненайденная ОС должна попасть в отчёт');
  assert.ok(!номера.includes(на_месте.id), 'ОС в наличии в отчёте быть не должно');
});

test('отчёт об отсутствующих фильтруется по подразделению', async () => {
  const своё = await makeDept();
  const чужое = await makeDept();
  const наше = await makeAsset(своё.id, { status: 'not_found' });
  const не_наше = await makeAsset(чужое.id, { status: 'not_found' });

  const res = await req(`/reports/missing?departmentId=${своё.id}`, { token: ctx.adminToken });
  const ids = res.body.map(a => a.id);
  assert.ok(ids.includes(наше.id));
  assert.ok(!ids.includes(не_наше.id), 'чужое подразделение попадать не должно');
});

test('отчёт по подразделениям считает количество и сумму', async () => {
  const dept = await makeDept();
  await makeAsset(dept.id, { status: 'active', residualValue: 1000 });
  await makeAsset(dept.id, { status: 'active', residualValue: 2000.5 });
  await makeAsset(dept.id, { status: 'not_found', residualValue: 500 });

  const res = await req('/reports/by-department', { token: ctx.adminToken });
  assert.equal(res.status, 200);
  const строка = res.body.find(r => r.department === dept.name);
  assert.ok(строка, 'подразделение должно появиться в отчёте');
  assert.equal(Number(строка.total), 3);
  assert.equal(Number(строка.active), 2, 'должны считаться только ОС в наличии');
  assert.equal(Number(строка.notFound), 1);
  assert.equal(Number(строка.totalValue), 3500.5, 'сумма должна включать все ОС подразделения');
});

test('история владельцев отбирает только смену владельца и ответственного', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept.id, { responsiblePerson: 'Первый' });

  // Меняем ответственного и не относящееся к владению поле
  await req(`/assets/${asset.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { responsiblePerson: 'Второй' },
  });
  await req(`/assets/${asset.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { location: 'Другая комната' },
  });

  const res = await req(`/reports/owner-history?assetId=${asset.id}`, { token: ctx.adminToken });
  assert.equal(res.status, 200);
  assert.ok(res.body.length > 0, 'смена ответственного должна попасть в историю');
  for (const h of res.body) {
    assert.ok(
      ['ownerId', 'ownerName', 'responsiblePerson'].includes(h.field),
      `в отчёт попало поле «${h.field}», не относящееся к владению`,
    );
  }
  assert.ok(res.body.some(h => h.newValue === 'Второй'), 'новое значение должно быть видно');
});

test('выгрузка ОС содержит созданную запись', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept.id, { residualValue: 4242.42 });

  const ws = await fetchSheet('/reports/export/assets');
  const текст = sheetText(ws);
  assert.ok(текст.includes(asset.inventoryNumber), 'инвентарный номер должен быть в выгрузке');
  assert.ok(текст.includes(dept.name), 'подразделение должно быть в выгрузке');
});

test('выгрузка ведомости содержит позиции сессии и отметку о проверке', async () => {
  const dept = await makeDept();
  const asset = await makeAsset(dept.id);
  const session = await req('/inventory/sessions', {
    method: 'POST', token: ctx.adminToken, body: { name: `Ведомость ${uniq()}`, departmentId: dept.id },
  });
  assert.equal(session.status, 201);

  await req(`/inventory/sessions/${session.body.id}/items/${asset.id}`, {
    method: 'PATCH', token: ctx.adminToken, body: { status: 'active', comment: 'сверено' },
  });

  const ws = await fetchSheet(`/reports/export/inventory/${session.body.id}`);
  const текст = sheetText(ws);
  assert.ok(текст.includes(asset.inventoryNumber), 'позиция должна быть в ведомости');
  assert.ok(текст.includes('сверено'), 'комментарий проверки должен попасть в ведомость');
  assert.ok(текст.includes(session.body.name), 'заголовок должен содержать название сессии');
});

test('отчёты закрыты от роли «Просмотр»', async () => {
  for (const p of ['/reports/missing', '/reports/by-department', '/reports/owner-history']) {
    assert.equal((await req(p, { token: ctx.viewer.token })).status, 403, `${p} должен быть закрыт`);
  }
});

test('инвентаризатор видит отчёты, но выгружать не может', async () => {
  // Выгрузка всей базы ОС — не операция «на посмотреть»
  assert.equal((await req('/reports/missing', { token: ctx.keeper.token })).status, 200);
  assert.equal((await req('/reports/by-department', { token: ctx.keeper.token })).status, 200);
  assert.equal((await req('/reports/export/assets', { token: ctx.keeper.token })).status, 403);
});

test('без токена отчёты недоступны', async () => {
  assert.equal((await req('/reports/by-department')).status, 401);
  assert.equal((await req('/reports/export/assets')).status, 401);
});
