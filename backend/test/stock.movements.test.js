'use strict';
/**
 * Тесты логики движений склада по критериям приёмки.
 * Против реальной БД (активны триггеры/констрейнты), всё в одной транзакции с
 * ROLLBACK в конце — тестовые данные не сохраняются. Между тестами состояние
 * откатывается к базовому (SAVEPOINT), поэтому тесты независимы.
 *
 *   npm run build && node --test test/stock.movements.test.js
 */
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { AppDataSource } = require('../dist/data-source.js');
const { StockService } = require('../dist/modules/warehouse/stock.service.js');

let qr, m, svc;
const ctx = {};

before(async () => {
  await AppDataSource.initialize();
  svc = new StockService(AppDataSource);
  qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  m = qr.manager;

  const wh = await m.query(`INSERT INTO warehouses (name) VALUES ('ТЕСТ-склад') RETURNING id`);
  ctx.wh = wh[0].id;
  const paper = await m.query(
    `INSERT INTO items (sku, name, unit, is_serialized, min_stock)
     VALUES ('TEST-PAPER', 'Бумага А4 (тест)', 'упак', false, 5) RETURNING id`);
  ctx.paper = paper[0].id;
  const pc = await m.query(
    `INSERT INTO items (sku, name, unit, is_serialized)
     VALUES ('TEST-PC', 'ПК (тест)', 'шт', true) RETURNING id`);
  ctx.pc = pc[0].id;
  const emp = await m.query(`INSERT INTO employees (full_name) VALUES ('Иванов И.И. (тест)') RETURNING id`);
  ctx.emp = emp[0].id;

  await m.query(`SAVEPOINT sp_base`);           // точка «чистого» состояния
});

afterEach(async () => {
  await m.query(`ROLLBACK TO SAVEPOINT sp_base`); // сброс между тестами
});

after(async () => {
  if (qr) { await qr.rollbackTransaction(); await qr.release(); }
  await AppDataSource.destroy();
});

test('приход 10 − выдача 3 = остаток 7 (из журнала)', async () => {
  await svc.receipt({ itemId: ctx.paper, warehouseId: ctx.wh, quantity: 10 }, null, m);
  await svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.paper, quantity: 3 }] }, null, m);
  assert.equal(await svc.balanceOf(ctx.paper, ctx.wh, m), 7);
});

test('выдача сверх остатка отклоняется, остаток не меняется', async () => {
  await svc.receipt({ itemId: ctx.paper, warehouseId: ctx.wh, quantity: 10 }, null, m);
  await assert.rejects(
    () => svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.paper, quantity: 999 }] }, null, m),
    (e) => /Недостаточно на складе/.test(e.message),
  );
  assert.equal(await svc.balanceOf(ctx.paper, ctx.wh, m), 10);
});

test('сторнирование выдачи возвращает остаток; оба движения в журнале', async () => {
  await svc.receipt({ itemId: ctx.paper, warehouseId: ctx.wh, quantity: 10 }, null, m);
  const issued = await svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.paper, quantity: 2 }] }, null, m);
  assert.equal(await svc.balanceOf(ctx.paper, ctx.wh, m), 8);
  const mv = issued.movements[0];
  const rev = await svc.reverse(mv.id, null, 'ошибка оператора', m);
  assert.equal(await svc.balanceOf(ctx.paper, ctx.wh, m), 10, 'сторно вернуло остаток');
  const both = await m.query(
    `SELECT id FROM stock_movements WHERE id=$1 OR reversal_of=$1`, [mv.id]);
  assert.equal(both.length, 2, 'исходное и сторнирующее движения оба на месте');
  const link = await m.query(`SELECT reversal_of FROM stock_movements WHERE id=$1`, [rev.id]);
  assert.equal(link[0].reversal_of, mv.id);
});

test('поштучная выдача без экземпляра отклоняется', async () => {
  await assert.rejects(
    () => svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.pc }] }, null, m),
    (e) => /экземпляр/i.test(e.message),
  );
});

test('дубликат серийного номера в рамках позиции отклоняется', async () => {
  await svc.receipt({ itemId: ctx.pc, warehouseId: ctx.wh, units: [{ serialNumber: 'SN-001' }] }, null, m);
  await assert.rejects(
    () => svc.receipt({ itemId: ctx.pc, warehouseId: ctx.wh, units: [{ serialNumber: 'SN-001' }] }, null, m),
    (e) => /серийный номер уже заведён/i.test(e.message),
  );
});

test('поштучный: выдача → повторная запрещена → возврат → снова доступен', async () => {
  const rec = await svc.receipt({ itemId: ctx.pc, warehouseId: ctx.wh, units: [{ serialNumber: 'SN-777' }] }, null, m);
  const unitId = rec.movements[0].stockUnitId;

  await svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.pc, stockUnitId: unitId }] }, null, m);
  assert.equal((await m.query(`SELECT status FROM stock_units WHERE id=$1`, [unitId]))[0].status, 'issued');

  await assert.rejects(
    () => svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.pc, stockUnitId: unitId }] }, null, m),
    (e) => /не числится на складе/i.test(e.message),
  );

  await svc.returnItems({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ stockUnitId: unitId }] }, null, m);
  assert.equal((await m.query(`SELECT status FROM stock_units WHERE id=$1`, [unitId]))[0].status, 'in_stock');

  await svc.issue({ employeeId: ctx.emp, warehouseId: ctx.wh, lines: [{ itemId: ctx.pc, stockUnitId: unitId }] }, null, m);
  assert.equal((await m.query(`SELECT status FROM stock_units WHERE id=$1`, [unitId]))[0].status, 'issued',
    'после возврата экземпляр снова удалось выдать');
});

test('проведённое движение нельзя удалить или изменить (журнал неизменяем)', async () => {
  const rec = await svc.receipt({ itemId: ctx.paper, warehouseId: ctx.wh, quantity: 1 }, null, m);
  const id = rec.movements[0].id;
  const failing = async (sql) => {
    await m.query('SAVEPOINT t');
    await assert.rejects(() => m.query(sql, [id]), /сторн/i);
    await m.query('ROLLBACK TO SAVEPOINT t');
  };
  await failing(`DELETE FROM stock_movements WHERE id=$1`);
  await failing(`UPDATE stock_movements SET quantity=99 WHERE id=$1`);
});
