"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { ShoppingCart, TrendingDown, Boxes } from "lucide-react";

type Tab = "purchase" | "consumption" | "holdings";

export default function WarehouseReportsPage() {
  const [tab, setTab] = useState<Tab>("purchase");
  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Отчёты склада" />
      <div className="p-6 flex flex-col gap-4">
        <div className="flex gap-2">
          <TabBtn active={tab === "purchase"} onClick={() => setTab("purchase")} icon={<ShoppingCart className="w-4 h-4" />}>К закупу</TabBtn>
          <TabBtn active={tab === "consumption"} onClick={() => setTab("consumption")} icon={<TrendingDown className="w-4 h-4" />}>Расход материалов</TabBtn>
          <TabBtn active={tab === "holdings"} onClick={() => setTab("holdings")} icon={<Boxes className="w-4 h-4" />}>Техника на руках</TabBtn>
        </div>
        {tab === "purchase" && <ToPurchase />}
        {tab === "consumption" && <Consumption />}
        {tab === "holdings" && <Holdings />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${active ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border border-gray-100 dark:border-slate-800"}`}>
      {icon}{children}
    </button>
  );
}

function ToPurchase() {
  const { data } = useQuery<any[]>({ queryKey: ["wh-rep-purchase"], queryFn: () => warehouseApi.reportToPurchase().then(r => r.data) });
  return (
    <Card headers={[
      { label: "Артикул" }, { label: "Наименование" }, { label: "Остаток" },
      { label: "Точка заказа", className: "hidden md:table-cell" },
      { label: "Ср. расход/мес", className: "hidden lg:table-cell" },
    ]}>
      {data?.length ? data.map(r => (
        <tr key={r.itemId}>
          <td className="td font-mono text-xs text-gray-500">{r.sku}</td>
          <td className="td font-medium text-gray-900 dark:text-white">{r.name}</td>
          <td className="td text-right tabular-nums text-amber-600 font-semibold">{r.balance}</td>
          <td className="td text-right tabular-nums text-gray-500 hidden md:table-cell">{r.minStock}</td>
          <td className="td text-right tabular-nums hidden lg:table-cell">{r.avgMonthly}</td>
        </tr>
      )) : <Empty cols={5} text="Все позиции выше точки заказа" />}
    </Card>
  );
}

function Consumption() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data } = useQuery<any[]>({ queryKey: ["wh-rep-cons", from, to], queryFn: () => warehouseApi.reportConsumption(from || undefined, to || undefined).then(r => r.data) });
  return (
    <>
      <div className="card p-4 flex gap-3 items-end">
        <div><label className="label">С даты</label><input type="date" className="input w-40" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">По дату</label><input type="date" className="input w-40" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      <Card headers={[
        { label: "Подразделение", className: "hidden md:table-cell" },
        { label: "Сотрудник" }, { label: "Материал" }, { label: "Выдано" },
      ]}>
        {data?.length ? data.map((r, i) => (
          <tr key={i}>
            <td className="td text-gray-500 hidden md:table-cell">{r.department}</td>
            <td className="td font-medium text-gray-900 dark:text-white">{r.employee || "—"}</td>
            <td className="td">{r.item}</td>
            <td className="td text-right tabular-nums font-medium">{r.issuedQty} {r.unit}</td>
          </tr>
        )) : <Empty cols={4} text="Нет расхода за период" />}
      </Card>
    </>
  );
}

function Holdings() {
  const { data } = useQuery<any[]>({ queryKey: ["wh-rep-hold"], queryFn: () => warehouseApi.reportHoldings().then(r => r.data) });
  return (
    <Card headers={[
      { label: "Подразделение", className: "hidden md:table-cell" },
      { label: "Сотрудник" }, { label: "Техника" },
      { label: "Серийный №", className: "hidden lg:table-cell" },
      { label: "Инв. №", className: "hidden xl:table-cell" },
    ]}>
      {data?.length ? data.map((r, i) => (
        <tr key={i}>
          <td className="td text-gray-500 hidden md:table-cell">{r.department}</td>
          <td className="td font-medium text-gray-900 dark:text-white">{r.employee}</td>
          <td className="td">{r.item}</td>
          <td className="td font-mono text-xs text-gray-500 hidden lg:table-cell">{r.serialNumber}</td>
          <td className="td text-gray-500 hidden xl:table-cell">{r.inventoryNumber || "—"}</td>
        </tr>
      )) : <Empty cols={5} text="Ничего не выдано на руки" />}
    </Card>
  );
}

interface ReportColumn { label: string; className?: string; }

function Card({ headers, children }: { headers: ReportColumn[]; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
            <tr>{headers.map((h, i) => <th key={i} className={`th ${h.className || ""}`}>{h.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
function Empty({ cols, text }: { cols: number; text: string }) {
  return <tr><td className="td text-center text-gray-400 py-12" colSpan={cols}>{text}</td></tr>;
}
