/**
 * Правила печати наклеек на этикеточном принтере.
 *
 * Общие для всех наклеек, потому что тут собраны две неочевидности,
 * каждая из которых уже приводила к браку печати:
 *
 * 1. Остальную страницу нужно убирать `display: none`, а не
 *    `visibility: hidden`. Скрытое по visibility остаётся в потоке, и
 *    длинная карточка при формате листа в 40 мм режется на десяток
 *    страниц, из которых заполнена только первая.
 *
 * 2. Отдельно сбрасывается `translate`. Tailwind 4 центрирует окно
 *    самостоятельным свойством `translate`, а не `transform`, поэтому
 *    сброс одного лишь transform оставляет наклейку сдвинутой на
 *    пол-ширины влево — за границу листа.
 *
 * 3. При печати пачки (`pageSelector`) последней наклейке разрыв нужно
 *    снимать, иначе после неё уходит лишняя пустая страница — тот же
 *    симптом, что и в пункте 1, но по другой причине. А контейнер пачки
 *    в печати обязан быть `display: block`: разрывы у детей flex- и
 *    grid-контейнера Chrome местами игнорирует и клеит наклейки на одну
 *    страницу.
 *
 * Применить `display: none` к соседям на каждом уровне вложенности
 * нельзя, поэтому наклейка выносится порталом прямо в body: тогда
 * достаточно одного правила `body > *:not(#id)`.
 */

interface LabelPrintOptions {
  /** id корня портала — прямого ребёнка body */
  portalId: string;
  widthMm: number;
  heightMm: number;
  /**
   * Дополнительные правила внутрь того же `@media print`. Второй блок
   * рядом заводить нельзя: правила печати должны читаться и проверяться
   * как одно целое, иначе легко упустить половину.
   */
  extraRules?: string;
  /**
   * Селектор обёртки одной наклейки при печати пачки — каждая уходит на
   * свою страницу. Не задан (одиночная печать) — правила разрывов не
   * выводятся вовсе, и результат совпадает с прежним посимвольно.
   */
  pageSelector?: string;
}

export function buildLabelPrintCss(
  { portalId, widthMm, heightMm, extraRules = '', pageSelector }: LabelPrintOptions,
): string {
  // Устаревшие page-break-* идут рядом с современными break-*: драйверы
  // этикеточных принтеров расходятся в том, какие понимают
  const batchRules = pageSelector ? `
    #${portalId} ${pageSelector} {
      break-inside: avoid; page-break-inside: avoid;
      break-after: page; page-break-after: always;
      margin: 0 !important; padding: 0 !important;
      box-shadow: none !important; border-radius: 0 !important;
    }
    /* Без этого после последней наклейки печатается пустая страница */
    #${portalId} ${pageSelector}:last-child {
      break-after: auto; page-break-after: auto;
    }
    /* Экранная сетка распрямляется — см. пункт 3 в описании модуля */
    #${portalId} .label-grid { display: block !important; gap: 0 !important; }` : '';

  return `
  @media print {
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }

    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }

    /* Именно display:none — см. пункт 1 в описании модуля */
    body > *:not(#${portalId}) { display: none !important; }

    #${portalId} .no-print { display: none !important; }

    /* Экранное оформление окна не должно смещать наклейку на листе */
    #${portalId} .label-shell {
      position: static !important;
      transform: none !important;
      translate: none !important;
      left: auto !important;
      top: auto !important;
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    #${portalId} .label-pad { padding: 0 !important; display: block !important; }${batchRules}
${extraRules}
  }
`;
}
