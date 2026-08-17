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
 * Применить `display: none` к соседям на каждом уровне вложенности
 * нельзя, поэтому наклейка выносится порталом прямо в body: тогда
 * достаточно одного правила `body > *:not(#id)`.
 */

interface LabelPrintOptions {
  /** id корня портала — прямого ребёнка body */
  portalId: string;
  widthMm: number;
  heightMm: number;
}

export function buildLabelPrintCss({ portalId, widthMm, heightMm }: LabelPrintOptions): string {
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
    #${portalId} .label-pad { padding: 0 !important; }
  }
`;
}
