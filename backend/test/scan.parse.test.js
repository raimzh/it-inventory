'use strict';
/**
 * Разбор кодов с этикеток — чистые тесты, без базы и без запущенного приложения.
 *
 * Проверяется скомпилированный модуль, поэтому перед запуском нужен `npm run build`.
 *
 *   node --test test/scan.parse.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseScanCode } = require('../dist/common/scan/parse-scan-code');

const UUID = '3f1a7c2e-9b4d-4a1e-8c6f-2d5b7e9a0c31';

test('обычный штрихкод остаётся как есть', () => {
  const r = parseScanCode('4600051000057');
  assert.equal(r.kind, 'plain');
  assert.equal(r.key, '4600051000057');
  assert.equal(r.id, undefined);
});

test('этикетка основного средства разбирается на номер и идентификатор', () => {
  const r = parseScanCode(`INV:ОС-000123|ID:${UUID}`);
  assert.equal(r.kind, 'asset');
  assert.equal(r.key, 'ОС-000123');
  assert.equal(r.id, UUID);
});

test('этикетка позиции склада разбирается на артикул и идентификатор', () => {
  const r = parseScanCode(`SKU:QR-705669|ID:${UUID}`);
  assert.equal(r.kind, 'item');
  assert.equal(r.key, 'QR-705669');
  assert.equal(r.id, UUID);
});

test('идентификатор в верхнем регистре приводится к нижнему', () => {
  const r = parseScanCode(`SKU:X|ID:${UUID.toUpperCase()}`);
  assert.equal(r.id, UUID);
});

test('испорченный идентификатор отбрасывается, но ключ сохраняется', () => {
  // Повреждённая или самодельная наклейка не должна ронять поиск целиком:
  // артикул с неё всё ещё читается.
  const r = parseScanCode('SKU:QR-705669|ID:не-идентификатор');
  assert.equal(r.kind, 'item');
  assert.equal(r.key, 'QR-705669');
  assert.equal(r.id, undefined);
});

test('префикс без части |ID: этикеткой не считается', () => {
  const r = parseScanCode('INV:ОС-000123');
  assert.equal(r.kind, 'plain');
  assert.equal(r.key, 'INV:ОС-000123');
});

test('обрамляющие пробелы отбрасываются', () => {
  const r = parseScanCode(`  INV:A-1|ID:${UUID}  `);
  assert.equal(r.kind, 'asset');
  assert.equal(r.key, 'A-1');
  assert.equal(r.raw, `INV:A-1|ID:${UUID}`);
});

test('пустой ввод не роняет разбор', () => {
  for (const value of ['', '   ', null, undefined]) {
    const r = parseScanCode(value);
    assert.equal(r.kind, 'plain');
    assert.equal(r.key, '');
  }
});

test('номер с дефисами и точками разбирается целиком', () => {
  const r = parseScanCode(`INV:01.02-АБВ/17|ID:${UUID}`);
  assert.equal(r.key, '01.02-АБВ/17');
  assert.equal(r.id, UUID);
});
