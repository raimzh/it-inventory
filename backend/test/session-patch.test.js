'use strict';
/**
 * Что правка делает с сессией — чистые тесты, без базы и без запущенного
 * приложения. Перед запуском нужен `npm run build`.
 *
 *   node --test test/session-patch.test.js
 *
 * Сетевая часть (права, 404, запрет на закрытую сессию) проверяется в
 * inventory.test.js — там нужна база, и локально он не запускается.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildSessionPatch } = require('../dist/modules/inventory/session-patch');

test('оба поля попадают в правку', () => {
  const r = buildSessionPatch({ name: '12.11.26', description: 'ноябрь 26' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.patch, { name: '12.11.26', description: 'ноябрь 26' });
});

test('непришедшее поле в правку не попадает', () => {
  // Важно именно отсутствие ключа: TypeORM не включает undefined в UPDATE,
  // но лишний ключ со значением undefined легко превратить в затирание
  const r = buildSessionPatch({ description: 'только описание' });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.patch), ['description']);
});

test('пустое тело — отказ, а не пустая правка', () => {
  const r = buildSessionPatch({});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty');
});

test('название из пробелов отсекается', () => {
  // Валидатор @IsNotEmpty такую строку пропускает: она непустая
  for (const name of ['   ', '\t', '\n ']) {
    const r = buildSessionPatch({ name });
    assert.equal(r.ok, false, `«${JSON.stringify(name)}» не должно проходить`);
    assert.equal(r.reason, 'blank-name');
  }
});

test('у названия обрезаются края', () => {
  const r = buildSessionPatch({ name: '  12.11.26  ' });
  assert.equal(r.ok, true);
  assert.equal(r.patch.name, '12.11.26');
});

test('описание можно очистить', () => {
  const r = buildSessionPatch({ description: '' });
  assert.equal(r.ok, true, 'очистка описания — осмысленное действие');
  assert.equal(r.patch.description, '');
});

test('описание сохраняется как есть, без обрезки', () => {
  // В описание вписывают заметки обхода; переносы и отступы в них значимы
  const text = '  ноябрь 26\n  второй этаж  ';
  const r = buildSessionPatch({ description: text });
  assert.equal(r.ok, true);
  assert.equal(r.patch.description, text);
});

test('пустое название вместе с описанием тоже отказ', () => {
  // Иначе правка применилась бы наполовину: описание легло, название нет
  const r = buildSessionPatch({ name: ' ', description: 'ноябрь 26' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'blank-name');
});
