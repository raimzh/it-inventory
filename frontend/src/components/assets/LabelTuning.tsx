"use client";
import { Button } from "@/components/ui/Button";
import { useLabelPrefs, LABEL_DEFAULTS, type LabelPrefs } from "@/store/label-prefs.store";
import { RotateCcw } from "lucide-react";

/**
 * Панель подгонки макета наклейки.
 *
 * Общая для одиночной печати и для пачки: подгонять размеры приходится
 * по факту, и делать это можно из обоих мест. Копия панели разошлась бы
 * с оригиналом так же, как чуть не разошёлся сам макет.
 *
 * Работает напрямую со стором, состояния снаружи не требует.
 */

/** Пределы ввода: за ними макет теряет смысл, а не просто выглядит плохо */
const LIMITS: Record<keyof Omit<LabelPrefs, "showFrame">, { min: number; max: number; step: number }> = {
  widthMm: { min: 20, max: 120, step: 1 },
  heightMm: { min: 15, max: 120, step: 1 },
  padTopMm: { min: 0, max: 10, step: 0.2 },
  padRightMm: { min: 0, max: 10, step: 0.2 },
  padBottomMm: { min: 0, max: 10, step: 0.2 },
  padLeftMm: { min: 0, max: 10, step: 0.2 },
  logoStripMm: { min: 0, max: 25, step: 0.5 },
  nameFontMm: { min: 1.5, max: 8, step: 0.1 },
  numberFontMm: { min: 2, max: 20, step: 0.2 },
  barcodeHeightMm: { min: 3, max: 25, step: 0.5 },
  offsetXMm: { min: -15, max: 15, step: 0.2 },
  offsetYMm: { min: -15, max: 15, step: 0.2 },
};

type NumKey = keyof typeof LIMITS;

function Field({ label, k }: { label: string; k: NumKey }) {
  // Подписка на одно поле, а не на весь стор: панель перерисовывается
  // на каждое нажатие, и рядом с ней может висеть пачка наклеек
  const value = useLabelPrefs(s => s[k]);
  const set = useLabelPrefs(s => s.set);
  const { min, max, step } = LIMITS[k];
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10));

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="flex-1 text-gray-600 dark:text-slate-300">{label}</span>
      <button
        type="button" aria-label="Уменьшить"
        onClick={() => set(k, clamp(value - step))}
        className="w-7 h-7 rounded-lg border border-gray-200 dark:border-slate-700 font-bold leading-none"
      >−</button>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => { const v = Number(e.target.value); if (!Number.isNaN(v)) set(k, clamp(v)); }}
        className="w-16 px-1.5 py-1 text-center tabular-nums rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
      />
      <button
        type="button" aria-label="Увеличить"
        onClick={() => set(k, clamp(value + step))}
        className="w-7 h-7 rounded-lg border border-gray-200 dark:border-slate-700 font-bold leading-none"
      >+</button>
    </label>
  );
}

export function LabelTuning() {
  const showFrame = useLabelPrefs(s => s.showFrame);
  const set = useLabelPrefs(s => s.set);
  const reset = useLabelPrefs(s => s.reset);

  return (
    <div className="no-print w-64 flex-shrink-0 space-y-4 text-sm">
      <div>
        <div className="font-semibold text-xs uppercase tracking-wide text-gray-400 mb-1.5">Этикетка, мм</div>
        <div className="space-y-1.5">
          <Field label="Ширина" k="widthMm" />
          <Field label="Высота" k="heightMm" />
        </div>
      </div>

      <div>
        <div className="font-semibold text-xs uppercase tracking-wide text-gray-400 mb-1.5">Поля, мм</div>
        <div className="space-y-1.5">
          <Field label="Сверху" k="padTopMm" />
          <Field label="Справа" k="padRightMm" />
          <Field label="Снизу" k="padBottomMm" />
          <Field label="Слева" k="padLeftMm" />
        </div>
      </div>

      <div>
        <div className="font-semibold text-xs uppercase tracking-wide text-gray-400 mb-1.5">Содержимое, мм</div>
        <div className="space-y-1.5">
          <Field label="Полоса логотипа" k="logoStripMm" />
          <Field label="Кегль названия" k="nameFontMm" />
          <Field label="Кегль номера" k="numberFontMm" />
          <Field label="Высота штрихкода" k="barcodeHeightMm" />
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Полоса логотипа 0 — печатать без логотипа.
        </p>
      </div>

      <div>
        <div className="font-semibold text-xs uppercase tracking-wide text-gray-400 mb-1.5">Сдвиг печати, мм</div>
        <div className="space-y-1.5">
          <Field label="По горизонтали" k="offsetXMm" />
          <Field label="По вертикали" k="offsetYMm" />
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Если принтер печатает со смещением, сдвиньте макет в обратную сторону.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={showFrame} onChange={e => set("showFrame", e.target.checked)} />
        <span className="text-gray-600 dark:text-slate-300">Показывать край этикетки</span>
      </label>

      <Button
        size="sm" variant="secondary" className="w-full"
        icon={<RotateCcw className="w-3.5 h-3.5" />}
        onClick={() => reset()}
      >
        Сбросить к {LABEL_DEFAULTS.widthMm}×{LABEL_DEFAULTS.heightMm} мм
      </Button>

      <p className="text-[11px] text-gray-400">
        Настройки сохраняются на этом устройстве и применяются ко всем наклейкам.
      </p>
    </div>
  );
}
