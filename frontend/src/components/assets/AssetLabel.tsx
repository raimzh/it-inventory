"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { code128Svg } from "@/lib/code128";
import { buildLabelPrintCss } from "@/lib/label-print";
import { useLabelPrefs, LABEL_DEFAULTS, type LabelPrefs } from "@/store/label-prefs.store";
import { Printer, X, SlidersHorizontal, RotateCcw } from "lucide-react";

interface Props {
  asset: { inventoryNumber: string; name: string };
  onClose: () => void;
}

/**
 * Инвентаризационная наклейка ОС с подгонкой макета по месту.
 *
 * Раскладка повторяет наклейки, которые уже наклеены на технику: слева
 * полоса под логотип, справа сверху вниз — наименование, крупный
 * инвентарный номер, линейный штрихкод.
 *
 * Штрихкод, а не QR: сканеры уже читают линейный код с инвентарным
 * номером со старых наклеек, и новые должны читаться так же.
 *
 * Размеры берутся из настроек (label-prefs), а не зашиты в код: подогнать
 * печать можно только по факту — у рулонов разный размер, у принтера своя
 * непечатаемая кромка, а термоголовка со временем смещается. Настройки
 * правятся прямо здесь, рядом с просмотром, и сохраняются на устройстве.
 *
 * Разметка выносится порталом в body ради печати — почему именно так,
 * описано в lib/label-print.
 */

const PORTAL_ID = "asset-label-portal";
const LOGO_SRC = "/KTMS_LOGO_ORIGINAL.png";

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

export function AssetLabel({ asset, onClose }: Props) {
  // createPortal требует document, которого нет при серверном рендере.
  // Ленивый инициализатор, а не эффект: наклейка монтируется по клику
  const [container] = useState<HTMLElement | null>(
    () => (typeof document === "undefined" ? null : document.body),
  );
  const [tuning, setTuning] = useState(false);
  const p = useLabelPrefs();

  // Штрихкод не зависит от перерисовок — считаем один раз на номер
  const barcode = useMemo(
    () => code128Svg(asset.inventoryNumber, { height: 60 }),
    [asset.inventoryNumber],
  );

  const printCss = useMemo(
    () => `
      /* Штрихкод тянется на всю отведённую полосу: сам SVG задаёт размер
         в модулях, здесь он подгоняется под миллиметры */
      #asset-label svg { width: 100%; height: 100%; display: block; }
      ${buildLabelPrintCss({
        portalId: PORTAL_ID,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        // Рамка и сдвиг — экранные подсказки и подгонка положения:
        // на листе макет должен лежать ровно в углу
        extraRules: `
    #asset-label { outline: none !important; }`,
      })}`,
    [p.widthMm, p.heightMm],
  );

  if (!container) return null;

  return createPortal(
    <div id={PORTAL_ID}>
      <style>{printCss}</style>

      <div className="no-print fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      <div className="label-shell fixed z-[61] left-1/2 -translate-x-1/2 top-6 max-h-[92vh] overflow-auto bg-white text-black rounded-xl shadow-2xl">
        <div className="no-print flex justify-between items-center px-5 py-3 border-b gap-3 sticky top-0 bg-white z-10">
          <span className="font-semibold">Наклейка ОС</span>
          <div className="flex gap-2">
            <Button
              size="sm" variant={tuning ? "primary" : "secondary"}
              icon={<SlidersHorizontal className="w-4 h-4" />}
              onClick={() => setTuning(v => !v)}
            >
              Макет
            </Button>
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Печать</Button>
            <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        <div className="label-pad p-4 flex gap-5 items-start">
          {/* Просмотр: то, что уйдёт на печать, один в один */}
          <div className="flex-shrink-0">
            <div
              id="asset-label"
              style={{
                width: `${p.widthMm}mm`,
                height: `${p.heightMm}mm`,
                display: "flex",
                alignItems: "stretch",
                background: "#fff",
                color: "#000",
                paddingTop: `${p.padTopMm}mm`,
                paddingRight: `${p.padRightMm}mm`,
                paddingBottom: `${p.padBottomMm}mm`,
                paddingLeft: `${p.padLeftMm}mm`,
                boxSizing: "border-box",
                // Сдвиг компенсирует смещение подачи у принтера
                position: "relative",
                left: `${p.offsetXMm}mm`,
                top: `${p.offsetYMm}mm`,
                // Длинное наименование обрезается, а не выталкивает штрихкод
                overflow: "hidden",
                fontFamily: "Arial, Helvetica, sans-serif",
                outline: p.showFrame ? "1px dashed #94a3b8" : "none",
              }}
            >
              {p.logoStripMm > 0 && (
                <div
                  style={{
                    width: `${p.logoStripMm}mm`,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      печатный макет фиксированного размера: оптимизировать нечего */}
                  <img
                    src={LOGO_SRC}
                    alt=""
                    onError={e => { e.currentTarget.style.visibility = "hidden"; }}
                    style={{
                      transform: "rotate(-90deg)",
                      // До поворота ширина идёт вдоль высоты этикетки, а высота —
                      // поперёк, по узкой полосе. Пределы заданы соответственно
                      maxWidth: `${Math.max(0, p.heightMm - p.padTopMm - p.padBottomMm)}mm`,
                      maxHeight: `${Math.max(0, p.logoStripMm - 0.5)}mm`,
                      objectFit: "contain",
                    }}
                  />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.5mm" }}>
                <div
                  style={{
                    fontSize: `${p.nameFontMm}mm`,
                    lineHeight: 1.15,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    wordBreak: "break-word",
                  }}
                >
                  {asset.name}
                </div>

                {/* Инвентарный номер — главное, что читают глазами */}
                <div
                  style={{
                    fontSize: `${p.numberFontMm}mm`,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: "0.2mm",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {asset.inventoryNumber}
                </div>

                <div
                  style={{ marginTop: "auto", height: `${p.barcodeHeightMm}mm`, width: "100%" }}
                  // Штрихкод — доверенный SVG, собранный здесь же из
                  // инвентарного номера, а не пришедший извне
                  dangerouslySetInnerHTML={{ __html: barcode }}
                />
              </div>
            </div>

            {p.showFrame && (
              <p className="no-print mt-2 text-[11px] text-gray-400 text-center">
                Пунктир — край этикетки, на печать не идёт
              </p>
            )}
          </div>

          {/* Настройка макета */}
          {tuning && (
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
                <input
                  type="checkbox" checked={p.showFrame}
                  onChange={e => p.set("showFrame", e.target.checked)}
                />
                <span className="text-gray-600 dark:text-slate-300">Показывать край этикетки</span>
              </label>

              <Button
                size="sm" variant="secondary" className="w-full"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={() => p.reset()}
              >
                Сбросить к {LABEL_DEFAULTS.widthMm}×{LABEL_DEFAULTS.heightMm} мм
              </Button>

              <p className="text-[11px] text-gray-400">
                Настройки сохраняются на этом устройстве и применяются ко всем наклейкам.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    container,
  );
}
