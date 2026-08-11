'use strict';
/**
 * Поиск по отсканированному коду и валидация тел запросов инвентаризации.
 *
 * Бьёт по запущенному экземпляру (по умолчанию http://localhost:3009).
 *
 *   BASE_URL=http://localhost:3009 ADMIN_PASSWORD=... node --test test/scan.lookup.test.js
 *
 * Об уборке. Позиции склада и основные средства в API намеренно не удаляются:
 * на них ссылаются журнал движений и история изменений. Поэтому тест берёт
 * существующие записи и работает с ними на чтение, а своё заводит только
 * когда взять нечего. Сколько бы раз ни запускали, ничего не размножается.
 *
 * Основное средство берётся существующее ВСЕГДА, если база не пуста, —
 * фальшивая карточка в списке ОС недопустима, его смотрят каждый день.
 * Сканирование саму карточку не меняет: отметка ложится в строку сессии.
 *
 * Что тест всё же оставляет в базе (по одному экземпляру навсегда):
 *   • сессию инвентаризации с названием из FIXTURE.sessionName;
 *   • позицию склада SCAN-FIXTURE — но только если среди активных позиций
 *     не нашлось ни одной со штрихкодом (список скрывает деактивированные).
 * Обе подписаны так, чтобы человек, увидев их, понял, откуда они.
 *
 * Одноразовым всегда остаётся пользователь с ролью «Просмотр».
 */
const FIXTURE = {
  itemSku: 'SCAN-FIXTURE',
  itemBarcode: '9900000000017',
  assetNumber: 'SCAN-FIXTURE-OS',
  sessionName: 'Фикстура тестов сканирования (не удалять)',
};
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3009';
const ADMIN = { username: process.env.ADMIN_USERNAME || 'r.zhuman', password: process.env.ADMIN_PASSWORD };

const uniq = () => Math.random().toString(36).slice(2, 8);
const ctx = { adminToken: null, viewerToken: null, userIds: [], item: null, asset: null, session: null };

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

before(async () => {
  assert.ok(ADMIN.password, 'Задайте ADMIN_PASSWORD в окружении для запуска тестов');
  const login = await req('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(login.status, 200, 'вход администратора должен проходить');
  ctx.adminToken = login.body.accessToken;

  const password = 'Tmp#' + Math.random().toString(36).slice(2, 12);
  const username = 'scan_viewer_' + uniq();
  const viewer = await req('/users', {
    method: 'POST', token: ctx.adminToken,
    body: { username, email: `${username}@example.com`, password, fullName: 'Проверка сканирования', role: 'viewer' },
  });
  assert.equal(viewer.status, 201, 'viewer должен создаваться');
  ctx.userIds.push(viewer.body.id);
  ctx.viewerToken = (await req('/auth/login', { method: 'POST', body: { username, password } })).body.accessToken;

  // ── Берём существующие данные; заводим своё только если брать нечего ─────

  // Нужна позиция со штрихкодом: список отдаёт проекцию без него, поэтому
  // штрихкод смотрим в карточке.
  const items = await req('/warehouse/items?limit=50', { token: ctx.adminToken });
  for (const candidate of (items.body?.data || items.body || [])) {
    const card = await req(`/warehouse/items/${candidate.id}`, { token: ctx.adminToken });
    if (card.body?.item?.barcode) { ctx.item = card.body.item; break; }
  }
  if (!ctx.item) {
    const created = await req('/warehouse/items', {
      method: 'POST', token: ctx.adminToken,
      body: { sku: FIXTURE.itemSku, name: 'Фикстура тестов сканирования', unit: 'шт', barcode: FIXTURE.itemBarcode },
    });
    assert.equal(created.status, 201, 'позиция-фикстура должна создаваться');
    ctx.item = created.body;
  }

  const assets = await req('/assets?limit=1', { token: ctx.adminToken });
  ctx.asset = (assets.body?.data || [])[0];
  if (!ctx.asset) {
    const created = await req('/assets', {
      method: 'POST', token: ctx.adminToken,
      body: { inventoryNumber: FIXTURE.assetNumber, name: 'Фикстура тестов сканирования' },
    });
    assert.equal(created.status, 201, 'ОС-фикстура должна создаваться');
    ctx.asset = created.body;
  }

  const sessions = await req('/inventory/sessions?limit=100', { token: ctx.adminToken });
  ctx.session = (sessions.body?.data || []).find(s => s.name === FIXTURE.sessionName);
  ctx.sessionWasCreatedNow = false;
  if (!ctx.session) {
    // Создаётся сразу с подложенными полями: проверка ниже убеждается, что
    // они отброшены, а не приняты.
    const created = await req('/inventory/sessions', {
      method: 'POST', token: ctx.adminToken,
      body: {
        name: FIXTURE.sessionName, departmentId: ctx.asset.departmentId,
        status: 'closed', totalAssets: 9999, checkedAssets: 777,
      },
    });
    assert.equal(created.status, 201, 'сессия-фикстура должна создаваться');
    ctx.session = created.body;
    ctx.sessionWasCreatedNow = true;
  }
});

after(async () => {
  // Фикстуры намеренно остаются: см. пояснение в заголовке файла.
  // Одноразовым был только пользователь.
  for (const id of ctx.userIds) {
    await req(`/users/${id}`, { method: 'DELETE', token: ctx.adminToken });
  }
});

// ── Поиск позиции склада по коду ────────────────────────────────────────────

test('позиция находится по артикулу', async () => {
  const r = await req(`/warehouse/items/scan/${encodeURIComponent(ctx.item.sku)}`, { token: ctx.adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, ctx.item.id);
});

test('позиция находится по штрихкоду', async () => {
  // ctx.item взят из карточки позиции, а не из списка: список отдаёт
  // проекцию без barcode.
  assert.ok(ctx.item.barcode, 'у выбранной позиции должен быть штрихкод');
  const r = await req(`/warehouse/items/scan/${encodeURIComponent(ctx.item.barcode)}`, { token: ctx.adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, ctx.item.id);
});

test('QR-этикетка позиции находит ту же позицию', async () => {
  const payload = `SKU:${ctx.item.sku}|ID:${ctx.item.id}`;
  const r = await req(`/warehouse/items/scan/${encodeURIComponent(payload)}`, { token: ctx.adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, ctx.item.id);
});

test('при переименованном артикуле позиция находится по идентификатору с этикетки', async () => {
  // Регрессия: идентификатор из QR извлекался и тут же выбрасывался,
  // поэтому старая наклейка после смены артикула переставала работать.
  const payload = `SKU:АРТИКУЛ-КОТОРОГО-НЕТ|ID:${ctx.item.id}`;
  const r = await req(`/warehouse/items/scan/${encodeURIComponent(payload)}`, { token: ctx.adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, ctx.item.id);
});

test('неизвестный код даёт 404', async () => {
  const r = await req('/warehouse/items/scan/КОДА-ТАКОГО-НЕТ', { token: ctx.adminToken });
  assert.equal(r.status, 404);
});

// ── Инвентаризация основных средств ─────────────────────────────────────────

test('QR-этикетка основного средства принимается', async () => {
  // Регрессия: разбора INV:...|ID:... не было вовсе, отсканированный QR давал 404
  const payload = `INV:${ctx.asset.inventoryNumber}|ID:${ctx.asset.id}`;
  const r = await req(`/inventory/sessions/${ctx.session.id}/scan`, {
    method: 'POST', token: ctx.adminToken, body: { inventoryNumber: payload, status: 'active' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.isChecked, true);
});

test('голый инвентарный номер по-прежнему принимается', async () => {
  const r = await req(`/inventory/sessions/${ctx.session.id}/scan`, {
    method: 'POST', token: ctx.adminToken, body: { inventoryNumber: ctx.asset.inventoryNumber, status: 'active' },
  });
  assert.equal(r.status, 201);
});

test('идентификатор с этикетки важнее напечатанного на ней номера', async () => {
  const payload = `INV:НОМЕР-КОТОРОГО-НЕТ|ID:${ctx.asset.id}`;
  const r = await req(`/inventory/sessions/${ctx.session.id}/scan`, {
    method: 'POST', token: ctx.adminToken, body: { inventoryNumber: payload, status: 'active' },
  });
  assert.equal(r.status, 201);
});

// ── Валидация тел запросов ──────────────────────────────────────────────────

test('лишние поля в теле скана отбрасываются', async () => {
  const r = await req(`/inventory/sessions/${ctx.session.id}/scan`, {
    method: 'POST', token: ctx.adminToken,
    body: {
      inventoryNumber: ctx.asset.inventoryNumber, status: 'active',
      checkedByName: 'подделка', isChecked: false, sessionId: '00000000-0000-0000-0000-000000000000',
    },
  });
  assert.equal(r.status, 201);
  assert.notEqual(r.body.checkedByName, 'подделка');
  assert.equal(r.body.isChecked, true);
  assert.equal(r.body.sessionId, ctx.session.id);
});

test('недопустимый статус отклоняется с 400', async () => {
  const r = await req(`/inventory/sessions/${ctx.session.id}/scan`, {
    method: 'POST', token: ctx.adminToken,
    body: { inventoryNumber: ctx.asset.inventoryNumber, status: 'мусор' },
  });
  assert.equal(r.status, 400);
});

test('сессия без названия отклоняется с 400', async () => {
  const r = await req('/inventory/sessions', {
    method: 'POST', token: ctx.adminToken, body: { description: 'без названия' },
  });
  assert.equal(r.status, 400);
});

test('статус и счётчики сессии телом запроса не подменить', async () => {
  // Фикстура создавалась с подложенными status:closed, totalAssets:9999,
  // checkedAssets:777. Проверка сильнее всего на первом прогоне, когда сессия
  // заводится прямо сейчас; на последующих подтверждает, что подлог не прошёл
  // и тогда.
  assert.equal(ctx.session.status, 'open', 'статус должен остаться начальным');
  assert.notEqual(ctx.session.totalAssets, 9999);
  assert.notEqual(ctx.session.checkedAssets, 777);
});

// ── Поиск экземпляра по коду ────────────────────────────────────────────────

test('несуществующий серийный номер даёт 404', async () => {
  const r = await req('/warehouse/stock/units/scan/СЕРИЙНИКА-ТАКОГО-НЕТ', { token: ctx.adminToken });
  assert.equal(r.status, 404);
});

test('поиск экземпляра закрыт без токена', async () => {
  const r = await req('/warehouse/stock/units/scan/что-угодно');
  assert.equal(r.status, 401);
});

test('роль «Просмотр» не может искать экземпляры', async () => {
  const r = await req('/warehouse/stock/units/scan/что-угодно', { token: ctx.viewerToken });
  assert.equal(r.status, 403);
});
