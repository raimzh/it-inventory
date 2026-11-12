'use strict';
/**
 * Форма рамки наведения.
 *
 *   npm run test
 *
 * Проверяется ровно одно свойство и его границы: рамка должна быть
 * ВЫТЯНУТОЙ. Квадратная рамка уже приводила к жалобе «штрихкод не
 * сканируется» — наклейки с Code 128 длинные, и в квадрат они влезают
 * только издалека, где штрихи сливаются. Тест стоит тут, чтобы правку
 * «сделаем как в примерах библиотеки» заметили сразу.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scanBoxSize } = require('../src/lib/scan-box.ts');

test('рамка шире, чем выше, при любой ориентации кадра', () => {
  const frames = [
    [640, 480],   // альбомная
    [480, 640],   // книжная
    [1280, 720],
    [720, 1280],
    [300, 300],   // квадратный кадр
  ];
  for (const [w, h] of frames) {
    const box = scanBoxSize(w, h);
    assert.ok(box.width > box.height, `${w}x${h}: ${box.width}x${box.height}`);
    assert.ok(box.width / box.height >= 2, `${w}x${h}: рамка недостаточно вытянута`);
  }
});

test('рамка помещается в кадр', () => {
  for (const [w, h] of [[640, 480], [480, 640], [1280, 720], [200, 900]]) {
    const box = scanBoxSize(w, h);
    assert.ok(box.width <= w, `ширина ${box.width} > ${w}`);
    assert.ok(box.height <= h, `высота ${box.height} > ${h}`);
  }
});

test('в книжной ориентации рамка не разрастается по высоте', () => {
  // Кадр 480x640: ширина рамки считается от высоты, иначе на узком
  // кадре рамка заняла бы почти весь экран и целиться стало бы некуда
  const box = scanBoxSize(480, 640);
  assert.ok(box.height <= 640 * 0.6);
});

test('вырожденный кадр не даёт отрицательных размеров', () => {
  for (const [w, h] of [[0, 0], [-10, 50], [50, -10]]) {
    const box = scanBoxSize(w, h);
    assert.ok(box.width >= 0 && box.height >= 0, `${w}x${h}`);
    assert.ok(Number.isFinite(box.width) && Number.isFinite(box.height));
  }
});

test('размеры целые — дробные пиксели библиотека не принимает', () => {
  const box = scanBoxSize(641.7, 481.3);
  assert.equal(box.width, Math.floor(box.width));
  assert.equal(box.height, Math.floor(box.height));
});
