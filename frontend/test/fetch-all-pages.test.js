'use strict';
/**
 * Постраничный сбор записей для печати пачки наклеек.
 *
 *   npm run test
 *
 * Проверяется прежде всего то, что цикл всегда заканчивается: он ходит в
 * сеть, и зависший обход означает подвисшую вкладку у кладовщика, а не
 * упавший тест.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { fetchAllPages } = require('../src/lib/fetch-all-pages.ts');

/** Отдаёт страницы по limit из массива, считая обращения */
function source(items, limit = 100) {
  const calls = [];
  const load = async page => {
    calls.push(page);
    const from = (page - 1) * limit;
    return {
      data: items.slice(from, from + limit),
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / limit)),
    };
  };
  return { load, calls };
}

const range = n => Array.from({ length: n }, (_, i) => i + 1);

test('собирает все 380 записей за 4 запроса по 100', async () => {
  const { load, calls } = source(range(380));
  const got = await fetchAllPages(load, { maxItems: 500 });
  assert.equal(got.length, 380);
  assert.deepEqual(calls, [1, 2, 3, 4]);
  assert.equal(got[0], 1);
  assert.equal(got[379], 380);
});

test('одна страница — один запрос', async () => {
  const { load, calls } = source(range(25));
  assert.equal((await fetchAllPages(load, { maxItems: 500 })).length, 25);
  assert.deepEqual(calls, [1]);
});

test('ранний выход прекращает обход', async () => {
  // Так печать отмеченных строк не тянет всю таблицу, когда отмечено
  // несколько позиций с первых страниц
  const { load, calls } = source(range(380));
  const got = await fetchAllPages(load, { maxItems: 500, stop: acc => acc.length >= 100 });
  assert.equal(got.length, 100);
  assert.deepEqual(calls, [1]);
});

test('потолок обрезает результат и прекращает обход', async () => {
  const { load, calls } = source(range(380));
  const got = await fetchAllPages(load, { maxItems: 150 });
  assert.equal(got.length, 150);
  assert.deepEqual(calls, [1, 2]);
});

test('пустая страница внутри диапазона не вешает цикл', async () => {
  // Состав мог измениться между запросами: totalPages обещает больше,
  // чем реально отдаётся
  const calls = [];
  const load = async page => {
    calls.push(page);
    return { data: page === 1 ? range(100) : [], total: 380, totalPages: 4 };
  };
  const got = await fetchAllPages(load, { maxItems: 500 });
  assert.equal(got.length, 100);
  assert.deepEqual(calls, [1, 2]);
});

test('пустой ответ на первой странице даёт пустой результат', async () => {
  const load = async () => ({ data: [], total: 0, totalPages: 0 });
  assert.deepEqual(await fetchAllPages(load, { maxItems: 500 }), []);
});
