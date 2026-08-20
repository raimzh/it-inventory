'use strict';
/**
 * Разбор дат и сопоставление колонок при импорте из Excel.
 *
 *   npm run test:import
 *
 * Оба проверяемых здесь дефекта портили данные молча, без единой ошибки
 * в журнале импорта:
 *
 *   • заголовки выгрузки и импорта назывались по-разному, и файл,
 *     выгруженный из системы и залитый обратно, терял остаточную
 *     стоимость, местоположение, владельца и комментарий;
 *
 *   • `new Date('04.01.2026')` возвращает 31 марта — дата не терялась,
 *     а подменялась правдоподобной, но неверной.
 *
 * Поэтому здесь закреплены оба формата дат и оба набора заголовков.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseDateCell } = require('../src/common/excel/parse-date-cell.ts');

test('дата: ДД.ММ.ГГГГ разбирается как день-месяц-год', () => {
  assert.equal(parseDateCell('20.06.2023'), '2023-06-20');
  assert.equal(parseDateCell('30.12.2021'), '2021-12-30');
  // Тот самый случай, который new Date толковал как 31 марта
  assert.equal(parseDateCell('04.01.2026'), '2026-01-04');
});

test('дата: разделителем может быть точка, слэш или дефис', () => {
  assert.equal(parseDateCell('20/06/2023'), '2023-06-20');
  assert.equal(parseDateCell('20-06-2023'), '2023-06-20');
});

test('дата: однозначный ГГГГ-ММ-ДД остаётся как есть', () => {
  assert.equal(parseDateCell('2023-06-20'), '2023-06-20');
});

test('дата: ячейка Date берётся по UTC, без сдвига на сутки', () => {
  assert.equal(parseDateCell(new Date('2023-06-20T00:00:00Z')), '2023-06-20');
});

test('дата: несуществующая дата отвергается, а не донормируется', () => {
  // Date сам превратил бы это в 3 марта, и в учёт попала бы чужая дата
  assert.equal(parseDateCell('31.02.2023'), null);
  assert.equal(parseDateCell('20.13.2023'), null);
});

test('дата: пустая ячейка и мусор дают null', () => {
  assert.equal(parseDateCell(''), null);
  assert.equal(parseDateCell(null), null);
  assert.equal(parseDateCell(undefined), null);
  assert.equal(parseDateCell('не дата'), null);
});

test('колонки: заголовки выгрузки распознаются наравне со своими', () => {
  // Читаем таблицу сопоставления из самого модуля, чтобы тест ловил
  // расхождение, а не повторял его
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/modules/assets/excel-import.service.ts'), 'utf8',
  );
  const map = src.slice(src.indexOf('const COLUMN_MAP'), src.indexOf('const REQUIRED_COLS'));

  // Именно эти четыре колонки выгрузка называет иначе, чем ждал импорт
  const pairs = [
    ['Остаточная стоимость', 'residualValue'],
    ['Местоположение', 'location'],
    ['Владелец', 'ownerName'],
    ['Комментарий', 'comment'],
  ];
  for (const [header, field] of pairs) {
    assert.ok(
      map.includes(`'${header}'`),
      `заголовок выгрузки «${header}» не сопоставлен — колонка будет молча пропущена`,
    );
    assert.ok(map.includes(field), `поле ${field} отсутствует в сопоставлении`);
  }
});
