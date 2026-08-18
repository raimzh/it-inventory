'use strict';
/**
 * Разбор кодов с этикеток и приведение номера к учётному виду.
 *
 *   npm run test
 *
 * Отдельного внимания стоит stripLeadingZeros: на технике встречаются
 * наклейки, где инвентарный номер дополнен нулями до девяти знаков
 * (000009079), тогда как в учёте он хранится как 9079. Из-за этого
 * часть этикеток «не считывалась» — сканер их читал, но строка не
 * совпадала. Здесь же закреплено, чего трогать нельзя.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseScanCode, stripLeadingZeros } = require('../src/lib/scan-code.ts');

test('нули: дополненный номер приводится к учётному', () => {
  assert.equal(stripLeadingZeros('000009079'), '9079');
  assert.equal(stripLeadingZeros('000000033'), '33');
  assert.equal(stripLeadingZeros('0000002103'), '2103');
});

test('нули: номер без дополнения не меняется', () => {
  assert.equal(stripLeadingZeros('9079'), '9079');
  assert.equal(stripLeadingZeros('33'), '33');
});

test('нули: номер с разделителем не трогаем', () => {
  // Здесь ведущие нули — часть формата, а не дополнение
  assert.equal(stripLeadingZeros('00-001188'), '00-001188');
  assert.equal(stripLeadingZeros('00-002274'), '00-002274');
});

test('нули: буквенно-цифровой код не трогаем', () => {
  assert.equal(stripLeadingZeros('SOFT-697351'), 'SOFT-697351');
  assert.equal(stripLeadingZeros('0ABC'), '0ABC');
});

test('нули: код из одних нулей не схлопывается в пустую строку', () => {
  assert.equal(stripLeadingZeros('0'), '0');
  assert.equal(stripLeadingZeros('00000'), '0');
});

test('нули: пустая строка безопасна', () => {
  assert.equal(stripLeadingZeros(''), '');
});

test('разбор: этикетка ОС', () => {
  const r = parseScanCode('INV:00-001188|ID:4e18d87a-1298-4139-b200-817fb1bd1c3c');
  assert.equal(r.kind, 'asset');
  assert.equal(r.key, '00-001188');
  assert.equal(r.id, '4e18d87a-1298-4139-b200-817fb1bd1c3c');
});

test('разбор: этикетка позиции склада', () => {
  const r = parseScanCode('SKU:SCAN-FIXTURE|ID:4e18d87a-1298-4139-b200-817fb1bd1c3c');
  assert.equal(r.kind, 'item');
  assert.equal(r.key, 'SCAN-FIXTURE');
});

test('разбор: голый номер со старой наклейки', () => {
  // Именно так приходит код с линейного штрихкода
  const r = parseScanCode('000009079');
  assert.equal(r.kind, 'plain');
  assert.equal(r.key, '000009079');
  assert.equal(stripLeadingZeros(r.key), '9079');
});
