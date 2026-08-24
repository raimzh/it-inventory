'use strict';
/**
 * Правила печати наклеек.
 *
 *   npm run test
 *
 * Главное здесь — первый тест: он посимвольно фиксирует вывод для
 * одиночной печати. Этот CSS уже дважды приводил к браку (печать уходила
 * на десяток пустых страниц, макет съезжал за край листа), и оба раза
 * дефект был не виден на экране — только на бумаге. Пока эталон совпадает,
 * добавление режима пачки не может сломать печать одной наклейки.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildLabelPrintCss } = require('../src/lib/label-print.ts');

const SINGLE = `
  @media print {
    @page { size: 57mm 39mm; margin: 0; }

    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }

    /* Именно display:none — см. пункт 1 в описании модуля */
    body > *:not(#p) { display: none !important; }

    #p .no-print { display: none !important; }

    /* Экранное оформление окна не должно смещать наклейку на листе */
    #p .label-shell {
      position: static !important;
      transform: none !important;
      translate: none !important;
      left: auto !important;
      top: auto !important;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    #p .label-pad { padding: 0 !important; display: block !important; }

  }
`;

test('одиночная печать: вывод не изменился', () => {
  assert.equal(buildLabelPrintCss({ portalId: 'p', widthMm: 57, heightMm: 39 }), SINGLE);
});

test('одиночная печать: правил разрывов нет вовсе', () => {
  const css = buildLabelPrintCss({ portalId: 'p', widthMm: 57, heightMm: 39 });
  assert.ok(!css.includes('break-after'), 'разрывы не должны попадать в одиночную печать');
  assert.ok(!css.includes('label-grid'));
});

test('пачка: каждая наклейка уходит на свою страницу', () => {
  const css = buildLabelPrintCss({ portalId: 'p', widthMm: 57, heightMm: 39, pageSelector: '.label-page' });
  assert.match(css, /#p \.label-page \{[\s\S]*break-after: page;/);
  // Устаревшее свойство дублируется намеренно: драйверы расходятся
  assert.match(css, /page-break-after: always;/);
  assert.match(css, /break-inside: avoid;/);
});

test('пачка: у последней наклейки разрыв снят', () => {
  // Иначе после неё печатается пустая страница — уже было дважды
  const css = buildLabelPrintCss({ portalId: 'p', widthMm: 57, heightMm: 39, pageSelector: '.label-page' });
  assert.match(css, /#p \.label-page:last-child \{[\s\S]*break-after: auto;[\s\S]*page-break-after: auto;/);
});

test('пачка: сетка предпросмотра распрямляется в блок', () => {
  // Разрывы у детей flex/grid Chrome местами игнорирует
  const css = buildLabelPrintCss({ portalId: 'p', widthMm: 57, heightMm: 39, pageSelector: '.label-page' });
  assert.match(css, /#p \.label-grid \{ display: block !important;/);
});

test('блок @media print в выводе ровно один', () => {
  // Второй блок рядом уже приводил к тому, что проверка читала половину
  // правил и не замечала расхождения
  for (const opts of [
    { portalId: 'p', widthMm: 57, heightMm: 39 },
    { portalId: 'p', widthMm: 57, heightMm: 39, pageSelector: '.label-page', extraRules: '    .x { color: red; }' },
  ]) {
    const css = buildLabelPrintCss(opts);
    assert.equal((css.match(/@media print/g) || []).length, 1);
  }
});

test('extraRules попадают внутрь @media print', () => {
  const css = buildLabelPrintCss({
    portalId: 'p', widthMm: 57, heightMm: 39, extraRules: '    .asset-label { outline: none !important; }',
  });
  const inside = css.slice(css.indexOf('@media print'), css.lastIndexOf('}'));
  assert.ok(inside.includes('.asset-label { outline: none !important; }'));
});

test('размер страницы следует за настройками макета', () => {
  assert.match(buildLabelPrintCss({ portalId: 'p', widthMm: 70, heightMm: 40 }), /@page \{ size: 70mm 40mm;/);
});
