"use client";
import { Button } from "@/components/ui/Button";
import { Printer, X } from "lucide-react";

interface Props {
  asset: { inventoryNumber: string; name: string };
  qr: string;
  onClose: () => void;
}

/**
 * Инвентаризационная наклейка ОС — печатается на этикеточном принтере
 * (Zebra) через обычный драйвер Windows: window.print() плюс @page под
 * размер этикетки, без ZPL и без Browser Print. Раскладка повторяет
 * ItemLabel.tsx (этикетка позиции склада) — тот же формат уже проверен
 * на печати.
 */
export function AssetLabel({ asset, qr, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center overflow-auto p-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #asset-label, #asset-label * { visibility: visible !important; }
          #asset-label { position: absolute; inset: 0; margin: 0; box-shadow: none; }
          .no-print { display: none !important; }
          @page { size: 58mm 40mm; margin: 2mm; }
        }
      `}</style>

      <div className="bg-white text-black rounded-xl max-w-sm w-full my-4 shadow-2xl">
        <div className="no-print flex justify-between items-center px-5 py-3 border-b">
          <span className="font-semibold">Наклейка ОС</span>
          <div className="flex gap-2">
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Печать</Button>
            <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        <div id="asset-label" className="p-5 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element --
              QR приходит как base64 data-URL: оптимизировать нечего */}
          <img src={qr} alt={`QR-код ОС ${asset.inventoryNumber}`} className="w-28 h-28 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-lg font-bold leading-tight">{asset.inventoryNumber}</div>
            <div className="text-sm leading-snug mt-1 break-words">{asset.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
