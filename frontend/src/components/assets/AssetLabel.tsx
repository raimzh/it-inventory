"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { buildLabelPrintCss } from "@/lib/label-print";
import { useLabelPrefs } from "@/store/label-prefs.store";
import { AssetLabelCard } from "./AssetLabelCard";
import { LabelTuning } from "./LabelTuning";
import { Printer, X, SlidersHorizontal } from "lucide-react";

interface Props {
  asset: { inventoryNumber: string; name: string };
  onClose: () => void;
}

/**
 * Печать одной инвентаризационной наклейки ОС с подгонкой макета.
 *
 * Сам макет — в AssetLabelCard, панель настроек — в LabelTuning: их же
 * использует пачечная печать из списка ОС.
 *
 * Размеры берутся из настроек (label-prefs), а не зашиты в код: подогнать
 * печать можно только по факту — у рулонов разный размер, у принтера своя
 * непечатаемая кромка, а термоголовка со временем смещается.
 *
 * Разметка выносится порталом в body ради печати — почему именно так,
 * описано в lib/label-print.
 */

const PORTAL_ID = "asset-label-portal";

export function AssetLabel({ asset, onClose }: Props) {
  // createPortal требует document, которого нет при серверном рендере.
  // Ленивый инициализатор, а не эффект: наклейка монтируется по клику
  const [container] = useState<HTMLElement | null>(
    () => (typeof document === "undefined" ? null : document.body),
  );
  const [tuning, setTuning] = useState(false);
  const p = useLabelPrefs();

  const printCss = useMemo(
    () => `
      /* Штрихкод тянется на всю отведённую полосу: сам SVG задаёт размер
         в модулях, здесь он подгоняется под миллиметры */
      .asset-label svg { width: 100%; height: 100%; display: block; }
      ${buildLabelPrintCss({
        portalId: PORTAL_ID,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        // Рамка — экранная подсказка, на листе её быть не должно
        extraRules: `
    .asset-label { outline: none !important; }`,
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
            <AssetLabelCard asset={asset} prefs={p} />

            {p.showFrame && (
              <p className="no-print mt-2 text-[11px] text-gray-400 text-center">
                Пунктир — край этикетки, на печать не идёт
              </p>
            )}
          </div>

          {tuning && <LabelTuning />}
        </div>
      </div>
    </div>,
    container,
  );
}
