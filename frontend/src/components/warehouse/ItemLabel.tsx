"use client";
import { Button } from "@/components/ui/Button";
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
 * кладовщик читает его глазами. Размер подобран под наклейку 58×40 мм —
 * типовой формат этикеточных принтеров.
 */
export function ItemLabel({ item, qr, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center overflow-auto p-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #item-label, #item-label * { visibility: visible !important; }
          #item-label { position: absolute; inset: 0; margin: 0; box-shadow: none; }
          .no-print { display: none !important; }
          @page { size: 58mm 40mm; margin: 2mm; }
        }
      `}</style>

      <div className="bg-white text-black rounded-xl max-w-sm w-full my-4 shadow-2xl">
        <div className="no-print flex justify-between items-center px-5 py-3 border-b">
          <span className="font-semibold">Этикетка позиции</span>
          <div className="flex gap-2">
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Печать</Button>
            <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        <div id="item-label" className="p-5 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element --
              QR приходит как base64 data-URL: оптимизировать нечего */}
          <img src={qr} alt={`QR-код позиции ${item.sku}`} className="w-28 h-28 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-lg font-bold leading-tight">{item.sku}</div>
            <div className="text-sm leading-snug mt-1 break-words">{item.name}</div>
            <div className="text-xs text-gray-500 mt-1">Ед. изм.: {item.unit}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
