'use strict';
/**
 * Code 128 для инвентаризационных наклеек.
 *
 *   npm run test
 *
 * Главное здесь — проверка таблицы знаков. Ошибиться в одной цифре из 107
 * записей легко, а последствие проявляется только на физическом сканере:
 * наклейка печатается, выглядит правильно и не читается. Поэтому таблица
 * проверяется по инвариантам самого формата (ширина знака в модулях),
 * а не по образцам вывода.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { encodeCode128B, code128Svg, PATTERNS, START_B, STOP } = require('../src/lib/code128.ts');

test('таблица знаков: 107 записей', () => {
  assert.equal(PATTERNS.length, 107);
});

test('таблица знаков: каждый знак ровно 11 модулей, стоп-знак 13', () => {
  PATTERNS.forEach((pattern, code) => {
    const modules = [...pattern].reduce((sum, d) => sum + Number(d), 0);
    const expected = code === STOP ? 13 : 11;
    assert.equal(modules, expected, `знак ${code} (${pattern}): ${modules} модулей вместо ${expected}`);
  });
});

test('таблица знаков: 6 элементов, у стоп-знака 7', () => {
  PATTERNS.forEach((pattern, code) => {
    assert.equal(pattern.length, code === STOP ? 7 : 6, `знак ${code} (${pattern}) неверной длины`);
  });
});

test('таблица знаков: ширина элемента от 1 до 4 модулей', () => {
  PATTERNS.forEach((pattern, code) => {
    for (const d of pattern) {
      const width = Number(d);
      assert.ok(width >= 1 && width <= 4, `знак ${code} (${pattern}): недопустимая ширина ${width}`);
    }
  });
});

test('кодирование: старт, данные, контрольная сумма, стоп', () => {
  // «AB»: A = 65-32 = 33, B = 66-32 = 34
  // сумма = (104 + 1*33 + 2*34) mod 103 = 205 mod 103 = 102
  assert.deepEqual(encodeCode128B('AB'), [START_B, 33, 34, 102, STOP]);
});

test('кодирование: инвентарный номер с дефисом', () => {
  // Дефис — причина, по которой используется набор B, а не числовой C
  const codes = encodeCode128B('00-002278');
  assert.equal(codes[0], START_B);
  assert.equal(codes[codes.length - 1], STOP);
  // '0'=16, '-'=13, '2'=18, '7'=23, '8'=24
  assert.deepEqual(codes.slice(1, -2), [16, 16, 13, 16, 16, 18, 18, 23, 24]);
  // сумма = (104 + 16+32+39+64+80+108+126+184+216) mod 103 = 969 mod 103 = 42
  assert.equal(codes[codes.length - 2], 42);
});

test('кодирование: непечатный символ отвергается', () => {
  assert.throws(() => encodeCode128B('ЖЖ'), /не кодирует символ/);
});

test('SVG: содержит штрихи и белую подложку', () => {
  const svg = code128Svg('00-002278');
  assert.match(svg, /^<svg /);
  assert.match(svg, /fill="#fff"/);
  assert.ok(svg.split('<rect').length > 10, 'штрихов должно быть много');
});

test('SVG: ширина соответствует числу модулей', () => {
  // старт 11 + 9 знаков по 11 + сумма 11 + стоп 13 + свободные поля 2×10
  const expectedModules = 11 + 9 * 11 + 11 + 13 + 20;
  const svg = code128Svg('00-002278', { moduleWidth: 2 });
  assert.match(svg, new RegExp(`viewBox="0 0 ${expectedModules} `));
  assert.match(svg, new RegExp(`width="${expectedModules * 2}"`));
});
