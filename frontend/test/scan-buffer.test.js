'use strict';
/**
 * Распознавание скана: чистые тесты автомата, без браузера и без сборки
 * (Node снимает типы с .ts сам).
 *
 *   npm run test
 *
 * Профили соответствуют реальным устройствам:
 *   Zebra    — быстро + Enter в конце
 *   Chainway — быстро, но Enter может не прийти (завершение по паузе)
 *   человек  — медленно; НЕ должен распознаваться. Этот случай важнее
 *              остальных: про него обычно забывают, а ложное срабатывание
 *              при обычном наборе ломает страницу целиком.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createScanBuffer, DEFAULT_SCAN_CONFIG } = require('../src/lib/scan-buffer.ts');

const START = 1000;

/** Прогоняет строку через автомат, возвращая последний результат и время. */
function feed(buf, text, { intervalMs = 15, start = START } = {}) {
  let at = start;
  let last = { action: 'none' };
  for (const ch of text) {
    last = buf.feedKey(ch, at);
    at += intervalMs;
  }
  return { last, at: at - intervalMs };
}

test('Zebra: быстрый набор с Enter распознаётся', () => {
  const buf = createScanBuffer();
  const { at } = feed(buf, '4600051000057');
  const r = buf.feedKey('Enter', at + 15);
  assert.equal(r.action, 'emit');
  assert.equal(r.scan.code, '4600051000057');
  assert.equal(r.scan.terminator, 'enter');
});

test('Chainway: быстрый набор без Enter распознаётся по паузе', () => {
  const buf = createScanBuffer();
  const { at } = feed(buf, '4600051000057');
  const r = buf.feedTimeout(at + DEFAULT_SCAN_CONFIG.idleTerminatorMs);
  assert.equal(r.action, 'emit');
  assert.equal(r.scan.code, '4600051000057');
  assert.equal(r.scan.terminator, 'timeout');
});

test('человек: медленный набор НЕ распознаётся', () => {
  const buf = createScanBuffer();
  const { at } = feed(buf, 'привет', { intervalMs: 180 });
  const r = buf.feedTimeout(at + 200);
  assert.equal(r.action, 'drop');
  assert.equal(r.reason, 'too-slow');
});

test('одна задержка внутри очереди скан не рушит', () => {
  // Сборка мусора или перерисовка React способны задержать одно событие.
  // Требование «все интервалы быстрые» давало бы редкие пропуски.
  const buf = createScanBuffer();
  let at = START;
  const code = 'ABCDEFGH';
  code.split('').forEach((ch, i) => {
    buf.feedKey(ch, at);
    at += i === 3 ? 70 : 15; // одна пауза 70 мс из семи интервалов
  });
  const r = buf.feedTimeout(at + 100);
  assert.equal(r.action, 'emit');
  assert.equal(r.scan.code, code);
});

test('слишком короткий код отбрасывается', () => {
  const buf = createScanBuffer();
  const { at } = feed(buf, 'AB');
  const r = buf.feedTimeout(at + 100);
  assert.equal(r.action, 'drop');
  assert.equal(r.reason, 'too-short');
});

test('Enter при коротком наборе тоже отбрасывается', () => {
  const buf = createScanBuffer();
  const { at } = feed(buf, 'AB');
  const r = buf.feedKey('Enter', at + 15);
  assert.equal(r.action, 'drop');
  assert.equal(r.reason, 'too-short');
});

test('одиночное нажатие не считается отброшенным сканом', () => {
  // Иначе набор руками даёт отбраковку — а с нею и сигнал ошибки — на КАЖДЫЙ
  // символ: при интервале ~180 мс каждый успевает истечь в одиночку.
  // Найдено на живой странице: «привет как дела» дало 15 отбраковок подряд.
  const buf = createScanBuffer();
  buf.feedKey('п', START);
  assert.equal(buf.feedTimeout(START + 100).action, 'none');

  buf.feedKey('р', START + 200);
  assert.equal(buf.feedKey('Enter', START + 300).action, 'none');
});

test('набор руками целиком проходит молча', () => {
  const buf = createScanBuffer();
  const results = [];
  let at = START;
  for (const ch of 'привет как дела') {
    results.push(buf.feedKey(ch, at));
    results.push(buf.feedTimeout(at + 90)); // пауза успевает истечь между символами
    at += 180;
  }
  const noisy = results.filter(r => r.action === 'drop' || r.action === 'emit');
  assert.equal(noisy.length, 0, 'обычный набор не должен порождать ни сканов, ни отбраковок');
});

test('Enter на пустом наборе ничего не делает', () => {
  const buf = createScanBuffer();
  assert.equal(buf.feedKey('Enter', START).action, 'none');
});

test('Enter завершает независимо от скорости', () => {
  // Осознанное послабление: на устройстве без физической клавиатуры Enter
  // при непустом наборе — это скан почти наверняка.
  const buf = createScanBuffer();
  const { at } = feed(buf, 'SN-00042', { intervalMs: 200 });
  const r = buf.feedKey('Enter', at + 200);
  assert.equal(r.action, 'emit');
  assert.equal(r.scan.code, 'SN-00042');
});

test('Escape и Backspace сбрасывают набор', () => {
  for (const key of ['Escape', 'Backspace', 'ArrowLeft', 'F5']) {
    const buf = createScanBuffer();
    feed(buf, 'ABCD');
    assert.equal(buf.feedKey(key, START + 100).action, 'none');
    assert.equal(buf.peek(), '', `клавиша ${key} должна сбрасывать набор`);
  }
});

test('модификаторы набор не сбрасывают', () => {
  // В части раскладок сканера заглавной букве предшествует Shift
  const buf = createScanBuffer();
  let at = START;
  buf.feedKey('A', at); at += 15;
  buf.feedKey('Shift', at); at += 5;
  buf.feedKey('B', at); at += 15;
  buf.feedKey('C', at); at += 15;
  buf.feedKey('D', at); at += 15;
  const r = buf.feedTimeout(at + 100);
  assert.equal(r.action, 'emit');
  assert.equal(r.scan.code, 'ABCD');
});

test('повторное чтение того же кода подавляется, позднее — нет', () => {
  const buf = createScanBuffer();
  const first = feed(buf, 'SN-00042');
  assert.equal(buf.feedKey('Enter', first.at + 15).action, 'emit');

  // Тот же код почти сразу — физическое двойное чтение
  const soon = feed(buf, 'SN-00042', { start: first.at + 100 });
  const dup = buf.feedKey('Enter', soon.at + 15);
  assert.equal(dup.action, 'drop');
  assert.equal(dup.reason, 'duplicate');

  // Тот же код спустя окно подавления — это уже осознанный повтор оператора
  const later = feed(buf, 'SN-00042', { start: soon.at + DEFAULT_SCAN_CONFIG.dedupeWindowMs + 100 });
  assert.equal(buf.feedKey('Enter', later.at + 15).action, 'emit');
});

test('после Enter запоздавшая пауза второй раз не срабатывает', () => {
  // Иначе один скан давал бы два события: по Enter и по таймеру
  const buf = createScanBuffer();
  const { at } = feed(buf, 'SN-00042');
  assert.equal(buf.feedKey('Enter', at + 15).action, 'emit');
  assert.equal(buf.feedTimeout(at + 200).action, 'none');
});

test('интервалы сохраняются для настройки порогов', () => {
  const buf = createScanBuffer();
  const { at } = feed(buf, 'ABCDE', { intervalMs: 12 });
  const r = buf.feedTimeout(at + 100);
  assert.equal(r.action, 'emit');
  assert.deepEqual(r.scan.intervals, [12, 12, 12, 12]);
});

test('каждый символ просит перевзвести таймер паузы', () => {
  const buf = createScanBuffer();
  const r = buf.feedKey('A', START);
  assert.equal(r.action, 'arm');
  assert.equal(r.timeoutAt, START + DEFAULT_SCAN_CONFIG.idleTerminatorMs);
});

test('пауза на пустом наборе безвредна', () => {
  const buf = createScanBuffer();
  assert.equal(buf.feedTimeout(START).action, 'none');
});

test('пороги настраиваются', () => {
  const buf = createScanBuffer({ minLength: 2, idleTerminatorMs: 40 });
  const { at } = feed(buf, 'AB');
  const r = buf.feedTimeout(at + 50);
  assert.equal(r.action, 'emit');
  assert.equal(r.scan.code, 'AB');
});
