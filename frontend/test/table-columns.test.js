'use strict';
/**
 * Состав и порядок колонок таблицы ОС.
 *
 *   npm run test
 *
 * Настройка живёт в браузере пользователя годами, а набор колонок в коде
 * меняется. Поэтому проверяется не столько «скрыть/показать», сколько
 * слияние старой сохранённой настройки с новым набором: колонка, которой
 * в коде уже нет, не должна ломать таблицу, а появившаяся позже — обязана
 * встать на своё место, иначе пользователь её никогда не увидит и решит,
 * что её не добавили.
 *
 * Отдельно закреплён запрет скрывать последнюю колонку: пустая таблица
 * выглядит как поломка, а вернуть колонку было бы уже неоткуда.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ASSET_COLUMNS, DEFAULT_CONFIG, DEFAULT_HIDDEN,
  resolveOrder, visibleColumns, activeFilters,
  toggleColumn, moveColumn, reorderColumns, isCustomized,
} = require('../src/lib/table-columns.ts');

const keys = cols => cols.map(c => c.key);

// --- Слияние с сохранённой настройкой -------------------------------------

test('без сохранённой настройки берётся порядок по умолчанию', () => {
  assert.deepEqual(keys(resolveOrder()), ASSET_COLUMNS.map(c => c.key));
  assert.deepEqual(keys(resolveOrder(null)), ASSET_COLUMNS.map(c => c.key));
  assert.deepEqual(keys(resolveOrder([])), ASSET_COLUMNS.map(c => c.key));
});

test('колонка, которой больше нет в коде, выбрасывается', () => {
  // Иначе таблица пыталась бы рисовать несуществующее поле
  const saved = ['inventoryNumber', 'колонка-которую-удалили', 'name'];
  const got = keys(resolveOrder(saved));
  assert.ok(!got.includes('колонка-которую-удалили'));
  assert.ok(got.includes('inventoryNumber') && got.includes('name'));
});

test('колонка, добавленная позже, встаёт на своё место, а не в конец', () => {
  // Сохранено до появления «Местоположения» — оно должно оказаться между
  // владельцем и стоимостью, как задумано, а не последним столбцом
  const saved = ASSET_COLUMNS.map(c => c.key).filter(k => k !== 'location');
  const got = keys(resolveOrder(saved));

  assert.ok(got.includes('location'), 'новая колонка обязана появиться');
  assert.equal(got.indexOf('location'), ASSET_COLUMNS.findIndex(c => c.key === 'location'));
  assert.equal(got.length, ASSET_COLUMNS.length);
});

test('сохранённые колонки сохраняют взаимный порядок', () => {
  // Именно взаимный, а не абсолютные позиции: между сохранёнными колонками
  // могут встать новые, появившиеся в коде позже. Требовать, чтобы
  // сохранённые шли строго первыми, значило бы сваливать всё новое в конец
  const saved = ['status', 'name', 'inventoryNumber'];
  const got = keys(resolveOrder(saved));

  assert.equal(got.length, ASSET_COLUMNS.length, 'остальные добавлены');
  assert.deepEqual(got.filter(k => saved.includes(k)), saved);
});

test('повторы в сохранённом порядке не размножают колонку', () => {
  const got = keys(resolveOrder(['name', 'name', 'name']));
  assert.equal(got.filter(k => k === 'name').length, 1);
  assert.equal(got.length, ASSET_COLUMNS.length);
});

// --- Видимость ------------------------------------------------------------

test('по умолчанию местоположение скрыто, остальное видно', () => {
  const vis = keys(visibleColumns());
  assert.ok(!vis.includes('location'), 'поле заполнено у единиц записей');
  assert.equal(vis.length, ASSET_COLUMNS.length - DEFAULT_HIDDEN.length);
});

test('скрытые колонки не попадают в таблицу, но остаются в списке настройки', () => {
  const cfg = { order: DEFAULT_CONFIG.order, hidden: ['category', 'location'] };
  assert.ok(!keys(visibleColumns(cfg)).includes('category'));
  // resolveOrder отдаёт всё — иначе скрытую колонку нечем было бы вернуть
  assert.ok(keys(resolveOrder(cfg.order)).includes('category'));
});

// --- Переключение ---------------------------------------------------------

test('колонка скрывается и возвращается', () => {
  let cfg = toggleColumn(DEFAULT_CONFIG, 'category');
  assert.ok(cfg.hidden.includes('category'));
  assert.ok(!keys(visibleColumns(cfg)).includes('category'));

  cfg = toggleColumn(cfg, 'category');
  assert.ok(!cfg.hidden.includes('category'));
  assert.ok(keys(visibleColumns(cfg)).includes('category'));
});

test('последнюю видимую колонку скрыть нельзя', () => {
  // Пустая таблица неотличима от поломки, а вернуть колонку было бы
  // неоткуда, кроме сброса настроек
  let cfg = { order: DEFAULT_CONFIG.order, hidden: [] };
  for (const col of ASSET_COLUMNS) cfg = toggleColumn(cfg, col.key);

  assert.equal(visibleColumns(cfg).length, 1, 'одна колонка обязана остаться');
});

test('неизвестный ключ ничего не портит', () => {
  const cfg = toggleColumn(DEFAULT_CONFIG, 'выдуманная-колонка');
  assert.deepEqual(cfg.order, DEFAULT_CONFIG.order);
  assert.deepEqual(cfg.hidden, DEFAULT_CONFIG.hidden);
});

// --- Порядок --------------------------------------------------------------

test('колонка двигается вверх и вниз', () => {
  const start = DEFAULT_CONFIG.order.indexOf('category');

  const up = moveColumn(DEFAULT_CONFIG, 'category', -1);
  assert.equal(up.order.indexOf('category'), start - 1);

  const down = moveColumn(DEFAULT_CONFIG, 'category', 1);
  assert.equal(down.order.indexOf('category'), start + 1);
});

test('за границы списка колонка не уезжает', () => {
  const first = DEFAULT_CONFIG.order[0];
  const last = DEFAULT_CONFIG.order[DEFAULT_CONFIG.order.length - 1];

  assert.deepEqual(moveColumn(DEFAULT_CONFIG, first, -1).order, DEFAULT_CONFIG.order);
  assert.deepEqual(moveColumn(DEFAULT_CONFIG, last, 1).order, DEFAULT_CONFIG.order);
});

test('перетаскивание переносит колонку на место другой', () => {
  // Пример из задачи: местоположение вместо категории
  const cfg = reorderColumns(DEFAULT_CONFIG, 'location', 'category');
  const catIndex = DEFAULT_CONFIG.order.indexOf('category');

  assert.equal(cfg.order.indexOf('location'), catIndex);
  assert.equal(cfg.order.length, DEFAULT_CONFIG.order.length, 'ничего не потерялось');
  assert.equal(new Set(cfg.order).size, cfg.order.length, 'и не задвоилось');
});

test('перенос на самого себя и на неизвестный ключ ничего не меняет', () => {
  assert.deepEqual(reorderColumns(DEFAULT_CONFIG, 'name', 'name').order, DEFAULT_CONFIG.order);
  assert.deepEqual(reorderColumns(DEFAULT_CONFIG, 'name', 'нет-такой').order, DEFAULT_CONFIG.order);
});

// --- Связь с фильтрами ----------------------------------------------------

test('скрытая колонка убирает свой фильтр', () => {
  // Фильтровать по тому, чего не видно, — верный способ получить
  // «куда делись записи»
  assert.ok(activeFilters(DEFAULT_CONFIG).has('category'));

  const cfg = toggleColumn(DEFAULT_CONFIG, 'category');
  assert.ok(!activeFilters(cfg).has('category'));
  assert.ok(activeFilters(cfg).has('status'), 'остальные фильтры на месте');
});

test('колонки без фильтра его и не добавляют', () => {
  const f = activeFilters(DEFAULT_CONFIG);
  assert.deepEqual([...f].sort(), ['category', 'department', 'status']);
});

// --- Сброс ----------------------------------------------------------------

test('изменённая настройка отличается от стандартной', () => {
  assert.equal(isCustomized(DEFAULT_CONFIG), false);
  assert.equal(isCustomized(null), false);
  assert.equal(isCustomized(toggleColumn(DEFAULT_CONFIG, 'category')), true);
  assert.equal(isCustomized(moveColumn(DEFAULT_CONFIG, 'category', 1)), true);
});
