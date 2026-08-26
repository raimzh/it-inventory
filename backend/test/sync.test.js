'use strict';
/**
 * Обмен с 1С: отображение полей на карточку ОС.
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/sync.test.js
 *
 * Обмен пишет прямо в реестр основных средств по расписанию, и его
 * ошибка портит учёт тихо: записи остаются на месте, меняются только
 * значения полей. Заметить подмену можно лишь сверкой с 1С вручную.
 *
 * Проверяется через POST /sync/import — он вызывает ту же функцию
 * отображения, что и обмен, но не требует живой 1С.
 *
 * Главное здесь — что обмен не затирает то, чего в выгрузке нет.
 * Раньше у наименования и стоимостей были запасные значения:
 * `|| invNumber` и `|| 0`. Выгрузка без стоимости обнуляла остаточную у
 * всех попавших в неё записей, а выгрузка без наименования подменяла
 * его инвентарным номером.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { assertNotProductionDb } = require('./guard-test-db');

// Тест пишет в реестр ОС — против боевой базы не запускаем
assertNotProductionDb();

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, viewer: null, userIds: [], assetIds: [] };

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
  const username = `sync_${role}_${uniq()}`;
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

/** ОС с заполненными полями — на ней и проверяется, что обмен ничего не затрёт */
async function makeAsset(fields = {}) {
  const inventoryNumber = `SYNC-${uniq()}`;
  const res = await req('/assets', {
    method: 'POST', token: ctx.adminToken,
    body: { inventoryNumber, name: 'Исходное наименование', residualValue: 12345.67, initialValue: 50000, ...fields },
  });
  assert.equal(res.status, 201, `ОС должно создаваться: ${JSON.stringify(res.body)}`);
  ctx.assetIds.push(res.body.id);
  return { id: res.body.id, inventoryNumber };
}

/** Прогоняет выгрузку через ту же функцию отображения, что и обмен с 1С */
async function importRecords(data) {
  const res = await req('/sync/import', { method: 'POST', token: ctx.adminToken, body: { data } });
  assert.equal(res.status, 201, `импорт должен отрабатывать: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function getAsset(id) {
  const res = await req(`/assets/${id}`, { token: ctx.adminToken });
  assert.equal(res.status, 200);
  return res.body;
}

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;
  ctx.viewer = await makeUser('viewer');
});

after(async () => {
  for (const id of ctx.assetIds) await req(`/assets/${id}`, { method: 'DELETE', token: ctx.adminToken });
  for (const id of ctx.userIds) await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
});

test('выгрузка без стоимости не обнуляет остаточную', async () => {
  // Ради этого случая набор и писался: запасное `|| 0` записывало ноль
  // поверх реальной стоимости у всех записей, попавших в выгрузку
  const asset = await makeAsset();
  await importRecords([{ Code: asset.inventoryNumber, Description: 'Пришло из 1С' }]);

  const after = await getAsset(asset.id);
  assert.equal(Number(after.residualValue), 12345.67, 'остаточная стоимость обязана сохраниться');
  assert.equal(Number(after.initialValue), 50000, 'первоначальная стоимость обязана сохраниться');
});

test('выгрузка без наименования не подменяет его инвентарным номером', async () => {
  const asset = await makeAsset();
  await importRecords([{ Code: asset.inventoryNumber }]);

  const after = await getAsset(asset.id);
  assert.equal(after.name, 'Исходное наименование', 'наименование обязано сохраниться');
});

test('пришедшие значения записываются', async () => {
  const asset = await makeAsset();
  await importRecords([{
    Code: asset.inventoryNumber,
    Description: 'Новое наименование',
    'ОстаточнаяСтоимость': 777.5,
    'СерийныйНомер': 'SN-ИЗ-1С',
    'Местоположение': 'Склад 5',
    'ОтветственноеЛицо': 'Иванов И.И.',
  }]);

  const after = await getAsset(asset.id);
  assert.equal(after.name, 'Новое наименование');
  assert.equal(Number(after.residualValue), 777.5);
  assert.equal(after.serialNumber, 'SN-ИЗ-1С');
  assert.equal(after.location, 'Склад 5');
  assert.equal(after.responsiblePerson, 'Иванов И.И.');
});

test('нулевая стоимость из выгрузки записывается, а не считается пропуском', async () => {
  // Ноль — законное значение полностью самортизированного средства,
  // и отличать его от «поля не было» обязательно
  const asset = await makeAsset();
  await importRecords([{ Code: asset.inventoryNumber, 'ОстаточнаяСтоимость': 0 }]);

  const after = await getAsset(asset.id);
  assert.equal(Number(after.residualValue), 0, 'явный ноль должен записаться');
});

test('дата ввода принимается и в ISO, и в формате ДД.ММ.ГГГГ', async () => {
  // 1С отдаёт оба формата, а `new Date` на втором либо не понимает вовсе,
  // либо молча подставляет другую дату — тот же дефект уже ловили в Excel
  const iso = await makeAsset();
  await importRecords([{ Code: iso.inventoryNumber, 'ДатаВводаВЭксплуатацию': '2023-06-20' }]);
  assert.match((await getAsset(iso.id)).commissioningDate ?? '', /^2023-06-20/);

  const ru = await makeAsset();
  await importRecords([{ Code: ru.inventoryNumber, 'ДатаВводаВЭксплуатацию': '20.06.2023' }]);
  assert.match((await getAsset(ru.id)).commissioningDate ?? '', /^2023-06-20/, 'ДД.ММ.ГГГГ должен разбираться как день-месяц-год');
});

test('новая запись создаётся, а её отсутствующее наименование заменяется номером', async () => {
  // На создании запасное значение уместно: затирать нечего, а поле обязательное
  const inv = `SYNC-NEW-${uniq()}`;
  const stats = await importRecords([{ Code: inv }]);
  assert.equal(stats.recordsCreated, 1);

  const found = await req(`/assets?search=${inv}`, { token: ctx.adminToken });
  const asset = found.body.data.find(a => a.inventoryNumber === inv);
  assert.ok(asset, 'запись должна была создаться');
  ctx.assetIds.push(asset.id);
  assert.equal(asset.name, inv);
});

test('записи без инвентарного номера пропускаются, а не роняют обмен', async () => {
  const asset = await makeAsset();
  const stats = await importRecords([
    { Description: 'Без номера' },
    { Code: asset.inventoryNumber, Description: 'С номером' },
    {},
  ]);
  assert.equal(stats.recordsProcessed, 3);
  assert.equal(stats.recordsSkipped, 2, 'две записи без номера должны быть пропущены');
  assert.equal(stats.recordsUpdated, 1);
});

test('журнал фиксирует итог обмена', async () => {
  const asset = await makeAsset();
  const stats = await importRecords([{ Code: asset.inventoryNumber, Description: 'Для журнала' }]);
  assert.equal(stats.status, 'success');
  assert.ok(stats.finishedAt, 'должно проставиться время завершения');
  assert.equal(stats.source, 'file');

  const logs = await req('/sync/logs?limit=5', { token: ctx.adminToken });
  assert.equal(logs.status, 200);
  assert.ok(logs.body.some(l => l.id === stats.id), 'обмен должен попасть в журнал');
});

test('запуск обмена и журнал закрыты от роли «Просмотр»', async () => {
  assert.equal((await req('/sync/run', { method: 'POST', token: ctx.viewer.token })).status, 403);
  assert.equal((await req('/sync/import', { method: 'POST', token: ctx.viewer.token, body: { data: [] } })).status, 403);
  assert.equal((await req('/sync/logs', { token: ctx.viewer.token })).status, 403);
});

test('время последнего обмена доступно всем — его показывает дашборд', async () => {
  const res = await req('/sync/last', { token: ctx.viewer.token });
  assert.equal(res.status, 200);
});
