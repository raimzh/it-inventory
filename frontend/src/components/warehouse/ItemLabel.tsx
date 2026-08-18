"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { buildLabelPrintCss } from "@/lib/label-print";
import { Printer, X } from "lucide-react";

interface Props {
  item: { sku: string; name: string; unit: string };
  qr: string;
  onClose: () => void;
}

/**
 * Этикетка позиции для наклейки на полку или коробку.
 *
 * Кроме QR печатается артикул крупным текстом: если сканера под рукой нет,
 * кладовщик читает его глазами.
 *
 * QR, а не линейный штрихкод (в отличие от наклейки ОС): складские экраны
 * разбирают этикетку полки как `SKU:{артикул}|ID:{id}` и по виду кода
 * решают, искать позицию или экземпляр. Менять символику здесь нельзя.
 *
 * Размеры в миллиметрах, а разметка вынесена порталом в body —
 * почему именно так, описано в lib/label-print.
 */

/** Физический размер этикетки в рулоне (замерен по факту) */
const LABEL_W_MM = 57;
const LABEL_H_MM = 39;
/** Термопринтер не печатает у самого края — миллиметр отдаём сразу */
const PAD_MM = 1.2;
const PORTAL_ID = "item-label-portal";

const PRINT_CSS = buildLabelPrintCss({
  portalId: PORTAL_ID,
  widthMm: LABEL_W_MM,
  heightMm: LABEL_H_MM,
});

export function ItemLabel({ item, qr, onClose }: Props) {
  // createPortal требует document, которого нет при серверном рендере.
  // Ленивый инициализатор, а не эффект: этикетка монтируется по клику
  const [container] = useState<HTMLElement | null>(
    () => (typeof document === "undefined" ? null : document.body),
  );

  if (!container) return null;

  return createPortal(
    <div id={PORTAL_ID}>
      <style>{PRINT_CSS}</style>

      <div className="no-print fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      <div className="label-shell fixed z-[61] left-1/2 -translate-x-1/2 top-8 bg-white text-black rounded-xl shadow-2xl">
        <div className="no-print flex justify-between items-center px-5 py-3 border-b gap-4">
          <span className="font-semibold">Этикетка позиции</span>
          <div className="flex gap-2">
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Печать</Button>
            <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        <div className="label-pad p-4">
          <div
            id="item-label"
            style={{
              width: `${LABEL_W_MM}mm`,
              height: `${LABEL_H_MM}mm`,
              display: "flex",
              alignItems: "center",
              gap: "1.5mm",
              background: "#fff",
              color: "#000",
              padding: `${PAD_MM}mm`,
              boxSizing: "border-box",
              // Длинное наименование лучше обрезать, чем вытолкнуть QR за край
              overflow: "hidden",
              fontFamily: "Arial, Helvetica, sans-serif",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                QR приходит как base64 data-URL: оптимизировать нечего */}
            <img
              src={qr}
              alt={`QR-код позиции ${item.sku}`}
              style={{ width: "26mm", height: "26mm", flexShrink: 0 }}
            />

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "monospace", fontSize: "4mm", fontWeight: 700, lineHeight: 1.1 }}>
                {item.sku}
              </div>
              {/* Наименование обрезается тремя строками: на 58 мм длинное
                  название иначе вытесняет артикул за край этикетки */}
              <div
                style={{
                  fontSize: "2.6mm",
                  lineHeight: 1.15,
                  marginTop: "1mm",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                }}
              >
                {item.name}
              </div>
              <div style={{ fontSize: "2.4mm", marginTop: "1mm", color: "#555" }}>
                Ед. изм.: {item.unit}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    container,
  );
}
