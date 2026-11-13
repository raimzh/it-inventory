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
  DEFAULT_HIDDEN_VERSION,
  resolveOrder, visibleColumns, activeFilters, migrateConfig,
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
  // Колонка, видимая по умолчанию: у скрытых по умолчанию первое
  // переключение наоборот ПОКАЗЫВАЕТ, и проверка вышла бы о другом
  let cfg = toggleColumn(DEFAULT_CONFIG, 'ownerName');
  assert.ok(cfg.hidden.includes('ownerName'));
  assert.ok(!keys(visibleColumns(cfg)).includes('ownerName'));

  cfg = toggleColumn(cfg, 'ownerName');
  assert.ok(!cfg.hidden.includes('ownerName'));
  assert.ok(keys(visibleColumns(cfg)).includes('ownerName'));
});

test('последнюю видимую колонку скрыть нельзя', () => {
  // Пустая таблица неотличима от поломки, а вернуть колонку было бы
  // неоткуда, кроме сброса настроек
  // Версию указываем явно: иначе досылка скрытого по умолчанию сама
  // спрячет часть колонок, и проверка будет уже не про запрет
  let cfg = { order: DEFAULT_CONFIG.order, hidden: [], hiddenVersion: DEFAULT_HIDDEN_VERSION };
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
  assert.ok(activeFilters(DEFAULT_CONFIG).has('department'));

  const cfg = toggleColumn(DEFAULT_CONFIG, 'departmentName');
  assert.ok(!activeFilters(cfg).has('department'));
  assert.ok(activeFilters(cfg).has('status'), 'остальные фильтры на месте');
});

test('колонки без фильтра его и не добавляют', () => {
  const f = activeFilters(DEFAULT_CONFIG);
  assert.deepEqual([...f].sort(), ['department', 'status']);
});

test('фильтр по категории возвращается вместе с колонкой', () => {
  // Категория скрыта по умолчанию, значит и фильтра по ней сразу нет.
  // Но включивший колонку должен получить фильтр обратно
  assert.ok(!activeFilters(DEFAULT_CONFIG).has('category'));
  const cfg = toggleColumn(DEFAULT_CONFIG, 'category');
  assert.ok(activeFilters(cfg).has('category'));
});

// --- Сброс ----------------------------------------------------------------

test('изменённая настройка отличается от стандартной', () => {
  assert.equal(isCustomized(DEFAULT_CONFIG), false);
  assert.equal(isCustomized(null), false);
  assert.equal(isCustomized(toggleColumn(DEFAULT_CONFIG, 'category')), true);
  assert.equal(isCustomized(moveColumn(DEFAULT_CONFIG, 'category', 1)), true);
});

// --- Досылка новых скрытий тем, у кого настройка уже сохранена ------------
//
// Это главное место этого набора. Сохранённая настройка хранит СПИСОК
// скрытых колонок, а не «пользуюсь стандартным набором», поэтому новый
// набор по умолчанию сам собой до человека не доезжает. Без досылки
// правка выглядела бы сделанной, а на складе ничего бы не изменилось.

test('старой настройке досылаются новые скрытые колонки', () => {
  // Так выглядит настройка, сохранённая до появления версий: человек
  // всего лишь переставил колонки, про категорию он решения не принимал
  const saved = {
    order: ['inventoryNumber', 'name', 'status', 'category', 'responsiblePerson', 'actions'],
    hidden: ['location'],
  };
  const got = migrateConfig(saved);
  assert.ok(got.hidden.includes('category'));
  assert.ok(got.hidden.includes('responsiblePerson'));
  assert.equal(got.hiddenVersion, DEFAULT_HIDDEN_VERSION);
});

test('порядок при досылке не ломается', () => {
  // Скрытие не должно превращаться в перестановку: человек расставил
  // колонки сам, и возврат скрытой колонки обязан вернуть её на место
  const saved = { order: ['status', 'name', 'inventoryNumber', 'actions'], hidden: [] };
  const got = migrateConfig(saved);
  // Между сохранёнными колонками встанут те, которых в настройке не было
  // (так и задумано), поэтому сверяем ОТНОСИТЕЛЬНЫЙ порядок
  const mine = got.order.filter(k => saved.order.includes(k));
  assert.deepEqual(mine, saved.order);
});

test('повторная досылка чужой выбор не перебивает', () => {
  // Человек вернул «Ответственного» себе в таблицу. Версия в его
  // настройке уже текущая, значит колонку больше не скрываем —
  // иначе она пропадала бы при каждом заходе
  const chosen = migrateConfig({ order: null, hidden: ['location'], hiddenVersion: DEFAULT_HIDDEN_VERSION });
  assert.ok(!chosen.hidden.includes('responsiblePerson'));
  assert.ok(!chosen.hidden.includes('category'));

  // и после второго прохода тоже
  assert.deepEqual(migrateConfig(chosen).hidden, chosen.hidden);
});

test('включённая колонка остаётся включённой', () => {
  const cfg = toggleColumn(DEFAULT_CONFIG, 'responsiblePerson');
  assert.ok(visibleColumns(cfg).some(c => c.key === 'responsiblePerson'));
  // Повторное чтение той же настройки колонку не отбирает
  assert.ok(visibleColumns(migrateConfig(cfg)).some(c => c.key === 'responsiblePerson'));
});

test('отсутствие настройки даёт текущий набор скрытого', () => {
  for (const empty of [undefined, null]) {
    const got = migrateConfig(empty);
    assert.deepEqual([...got.hidden].sort(), [...DEFAULT_HIDDEN].sort());
  }
});

test('таблица не остаётся без колонок', () => {
  // Пустая таблица выглядит как поломка. Проверяем на пустой настройке и
  // на старой сохранённой: досылка не должна выесть всё
  for (const cfg of [null, { order: null, hidden: ['location'] }]) {
    const keysLeft = visibleColumns(cfg).map(c => c.key);
    assert.ok(keysLeft.includes('inventoryNumber'), 'инв. номер обязателен');
    assert.ok(keysLeft.includes('name'));
    assert.ok(keysLeft.includes('status'));
    assert.ok(keysLeft.includes('actions'));
  }
});

test('неизвестный ключ в досылаемом скрытии не попадает в настройку', () => {
  // Колонку могут убрать из кода позже, чем из HIDDEN_SINCE
  const got = migrateConfig({ order: null, hidden: ['колонки-такой-нет'] });
  assert.ok(!got.hidden.includes('колонки-такой-нет'));
});
