"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Настройки макета наклейки.
 *
 * Вынесены в настройки, а не зашиты в код, потому что подогнать печать
 * можно только по факту: рулоны бывают разного размера, у принтера своя
 * непечатаемая кромка, а термоголовка со временем смещается. Каждый раз
 * править исходник и пересобирать ради миллиметра — не дело.
 *
 * Хранятся на устройстве, с которого печатают: подгонка привязана к
 * конкретному принтеру и рулону, а не к пользователю.
 *
 * Все размеры в миллиметрах.
 */
export interface LabelPrefs {
  /** Размер этикетки в рулоне */
  widthMm: number;
  heightMm: number;
  /** Поля внутри этикетки */
  padTopMm: number;
  padRightMm: number;
  padBottomMm: number;
  padLeftMm: number;
  /** Ширина полосы под логотип слева (0 — логотип не печатать) */
  logoStripMm: number;
  /** Кегль наименования и инвентарного номера */
  nameFontMm: number;
  numberFontMm: number;
  /** Высота штрихкода */
  barcodeHeightMm: number;
  /** Сдвиг всего макета — компенсирует смещение подачи у принтера */
  offsetXMm: number;
  offsetYMm: number;
  /** Показывать границу этикетки на экране (на печать не идёт) */
  showFrame: boolean;
}

export const LABEL_DEFAULTS: LabelPrefs = {
  widthMm: 57,
  heightMm: 39,
  padTopMm: 1.2,
  padRightMm: 1.2,
  padBottomMm: 1.2,
  padLeftMm: 1.2,
  logoStripMm: 7,
  nameFontMm: 2.6,
  numberFontMm: 7,
  barcodeHeightMm: 9,
  offsetXMm: 0,
  offsetYMm: 0,
  showFrame: true,
};

interface LabelPrefsState extends LabelPrefs {
  set: <K extends keyof LabelPrefs>(key: K, value: LabelPrefs[K]) => void;
  reset: () => void;
}

export const useLabelPrefs = create<LabelPrefsState>()(
  persist(
    (set) => ({
      ...LABEL_DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<LabelPrefsState>),
      reset: () => set({ ...LABEL_DEFAULTS }),
    }),
    {
      name: "label-prefs",
      // Версия нужна, чтобы при появлении новых полей у уже настроенных
      // принтеров не оставались undefined вместо чисел
      version: 1,
      merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
    },
  ),
);
