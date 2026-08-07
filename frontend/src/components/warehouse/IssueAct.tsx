"use client";
import { WarehouseItem, WarehouseEmployee, StockUnit } from "@/types";
import { Button } from "@/components/ui/Button";
import { Printer, X } from "lucide-react";

interface CartLine { item: WarehouseItem; quantity: number; unit?: StockUnit; }
interface Props {
  data: { employee: WarehouseEmployee; lines: CartLine[]; doc: string; date: string };
  onClose: () => void;
}

/** Акт выдачи ТМЦ — печатная форма с местом для подписи (window.print). */
export function IssueAct({ data, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center overflow-auto p-4 no-print-bg">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #issue-act, #issue-act * { visibility: visible !important; }
          #issue-act { position: absolute; inset: 0; margin: 0; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="bg-white text-black rounded-xl max-w-3xl w-full my-4 shadow-2xl">
        <div className="no-print flex justify-between items-center px-6 py-3 border-b">
          <span className="font-semibold">Акт выдачи</span>
          <div className="flex gap-2">
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Печать</Button>
            <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        <div id="issue-act" className="p-10 text-[13px] leading-relaxed">
          <h1 className="text-center text-lg font-bold mb-1">АКТ ВЫДАЧИ ТМЦ</h1>
          <p className="text-center text-gray-600 mb-6">{data.doc ? `№ ${data.doc} ` : ""}от {data.date}</p>

          <table className="w-full mb-6">
            <tbody>
              <tr><td className="py-1 pr-4 align-top w-40 text-gray-600">Получатель:</td><td className="py-1 font-semibold">{data.employee.fullName}</td></tr>
              {data.employee.position && <tr><td className="py-1 pr-4 text-gray-600">Должность:</td><td className="py-1">{data.employee.position}</td></tr>}
              {data.employee.department?.name && <tr><td className="py-1 pr-4 text-gray-600">Подразделение:</td><td className="py-1">{data.employee.department.name}</td></tr>}
            </tbody>
          </table>

          <table className="w-full border-collapse mb-8">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="text-left py-2 px-2 w-8">№</th>
                <th className="text-left py-2 px-2">Наименование</th>
                <th className="text-left py-2 px-2">Серийный / инв. номер</th>
                <th className="text-right py-2 px-2 w-24">Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-300">
                  <td className="py-2 px-2">{i + 1}</td>
                  <td className="py-2 px-2">{l.item.name}</td>
                  <td className="py-2 px-2">{l.item.isSerialized ? (l.unit?.serialNumber + (l.unit?.inventoryNumber ? ` / ${l.unit.inventoryNumber}` : "")) : "—"}</td>
                  <td className="py-2 px-2 text-right">{l.item.isSerialized ? 1 : l.quantity} {l.item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between mt-16">
            <div className="text-center">
              <div className="border-t border-black w-52 pt-1">Выдал (подпись)</div>
            </div>
            <div className="text-center">
              <div className="border-t border-black w-52 pt-1">Получил (подпись)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
