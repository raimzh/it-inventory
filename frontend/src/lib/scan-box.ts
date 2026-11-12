/**
 * Размер рамки наведения при сканировании камерой.
 *
 * Вынесено из компонента, чтобы закрепить тестом форму рамки: это не
 * косметика. На технике наклеены линейные коды Code 128 с инвентарным
 * номером (см. code128.ts) — длинные и невысокие. Квадратная рамка
 * 250x250 из примеров html5-qrcode заставляет отводить планшет далеко,
 * чтобы наклейка влезла целиком, а на таком расстоянии штрихи уже
 * сливаются. Снаружи это выглядит как «штрихкод не сканируется».
 *
 * Рамка занимает почти всю ширину кадра и остаётся втрое ниже, чем шире.
 */

export interface ScanBox {
  width: number;
  height: number;
}

/** Доля ширины кадра под рамку: поля нужны, чтобы было видно, куда целиться */
const WIDTH_RATIO = 0.92;
/** Высота от ширины рамки */
const HEIGHT_RATIO = 0.45;
/** Но не выше этой доли кадра — иначе рамка перестаёт помогать целиться */
const MAX_HEIGHT_RATIO = 0.6;

export function scanBoxSize(frameWidth: number, frameHeight: number): ScanBox {
  const w = Math.max(0, frameWidth);
  const h = Math.max(0, frameHeight);

  // Ограничение по высоте кадра: в вертикальной ориентации кадр узкий и
  // высокий, и рамка во всю ширину получилась бы выше, чем нужно
  const width = Math.floor(Math.min(w, h * 2) * WIDTH_RATIO);
  const height = Math.floor(Math.min(width * HEIGHT_RATIO, h * MAX_HEIGHT_RATIO));
  return { width, height };
}
