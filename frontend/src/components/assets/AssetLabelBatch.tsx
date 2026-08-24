"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { buildLabelPrintCss } from "@/lib/label-print";
import { useLabelPrefs } from "@/store/label-prefs.store";
import { AssetLabelCard } from "./AssetLabelCard";
import { LabelTuning } from "./LabelTuning";
import { Printer, X, SlidersHorizontal, AlertTriangle } from "lucide-react";

interface Props {
  assets: { id: string; inventoryNumber: string; name: string }[];
  /** Номер первой наклейки в исходном наборе — для подписи «с №151 по №380» */
  startNo: number;
  totalNo: number;
  onClose: () => void;
}

/**
 * Предпросмотр и печать пачки наклеек.
 *
 * Макет и панель настроек — те же, что у одиночной печати
 * (AssetLabelCard, LabelTuning): пачка обязана печатать ровно то же, что
 * человек подогнал на одной наклейке.
 *
 * Предпросмотр обязателен и печать не стартует сама: перед тем как уедет
 * метр рулона, видно, что первая карточка именно та, с которой нужно
 * продолжить, и что макет не поехал.
 */

const PORTAL_ID = "assets-batch-label-portal";

export function AssetLabelBatch({ assets, startNo, totalNo, onClose }: Props) {
  const [container] = useState<HTMLElement | null>(
    () => (typeof document === "undefined" ? null : document.body),
  );
  const [tuning, setTuning] = useState(false);
  // Стор читается один раз здесь и раздаётся карточкам пропом: подписка
  // внутри каждой из сотен карточек означала бы столько же перерисовок
  // на каждое нажатие в панели макета
  const p = useLabelPrefs();

  const printCss = useMemo(
    () => `
      .asset-label svg { width: 100%; height: 100%; display: block; }
      ${buildLabelPrintCss({
        portalId: PORTAL_ID,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        pageSelector: ".label-page",
        extraRules: `
    .asset-label { outline: none !important; }`,
      })}`,
    [p.widthMm, p.heightMm],
  );

  if (!container) return null;

  const endNo = startNo + assets.length - 1;

  return createPortal(
    <div id={PORTAL_ID}>
      <style>{printCss}</style>

      <div className="no-print fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      <div className="label-shell fixed z-[61] left-1/2 -translate-x-1/2 top-6 w-[min(1100px,95vw)] max-h-[92vh] overflow-auto bg-white text-black rounded-xl shadow-2xl">
        <div className="no-print flex justify-between items-center px-5 py-3 border-b gap-3 sticky top-0 bg-white z-10 flex-wrap">
          <div className="min-w-0">
            <span className="font-semibold">Наклейки: {assets.length}</span>
            <span className="text-gray-500 text-sm ml-2">
              с №{startNo} по №{endNo} из {totalNo}
            </span>
          </div>
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

        {assets.length >= 100 && (
          <div className="no-print flex gap-2 items-start px-5 py-2.5 bg-amber-50 text-amber-900 text-xs border-b">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Наклеек много — окно печати может открываться до минуты, не закрывайте вкладку.
              Если лента закончится, допечатайте остаток, указав «Начать с №».
            </span>
          </div>
        )}

        <div className="label-pad p-4 flex gap-5 items-start">
          {/* Сетка только для экрана: в печати она распрямляется в блок,
              иначе Chrome местами игнорирует разрывы у детей flex/grid */}
          <div className="label-grid flex-1 min-w-0 flex flex-wrap gap-3 content-start">
            {assets.map(a => (
              <div key={a.id} className="label-page">
                <AssetLabelCard asset={a} prefs={p} />
              </div>
            ))}
          </div>

          {tuning && <LabelTuning />}
        </div>
      </div>
    </div>,
    container,
  );
}
