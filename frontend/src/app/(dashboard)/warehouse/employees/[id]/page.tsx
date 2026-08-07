"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, notFound } from "next/navigation";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, User, Laptop, Boxes } from "lucide-react";

export default function EmployeeCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["wh-emp-holdings", id, from, to],
    queryFn: () => warehouseApi.employeeHoldings(id, { dateFrom: from || undefined, dateTo: to || undefined }).then(r => r.data),
  });

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" /></div>;
  if (!data) notFound();
  const { employee, onHand, consumables } = data;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Карточка сотрудника">
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => router.back()}>Назад</Button>
      </Header>
      <div className="p-6 space-y-5">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center text-white"><User className="w-6 h-6" /></div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{employee.fullName}</h2>
            <p className="text-sm text-gray-500">{[employee.position, employee.department?.name, employee.personnelNumber].filter(Boolean).join(" · ")}</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800"><h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Laptop className="w-4 h-4 text-gray-400" /> Техника на руках ({onHand.length})</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50"><tr><th className="th">Наименование</th><th className="th">Серийный №</th><th className="th">Инв. №</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {onHand.length ? onHand.map((u: any) => (
                  <tr key={u.stockUnitId}>
                    <td className="td font-medium text-gray-900 dark:text-white cursor-pointer hover:text-primary-600" onClick={() => router.push(`/warehouse/${u.itemId}`)}>{u.itemName}</td>
                    <td className="td font-mono text-xs text-gray-500">{u.serialNumber}</td>
                    <td className="td text-gray-500">{u.inventoryNumber || "—"}</td>
                  </tr>
                )) : <tr><td className="td text-center text-gray-400 py-8" colSpan={3}>Ничего не числится</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Boxes className="w-4 h-4 text-gray-400" /> Расход материалов</h3>
            <div className="flex gap-2 items-center text-sm">
              <input type="date" className="input py-1 w-36" value={from} onChange={e => setFrom(e.target.value)} />
              <span className="text-gray-400">—</span>
              <input type="date" className="input py-1 w-36" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50"><tr><th className="th">Материал</th><th className="th text-right">Израсходовано</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {consumables.length ? consumables.map((c: any) => (
                  <tr key={c.itemId}><td className="td">{c.itemName}</td><td className="td text-right tabular-nums font-medium">{c.issuedQty} {c.unit}</td></tr>
                )) : <tr><td className="td text-center text-gray-400 py-8" colSpan={2}>Нет расхода за период</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
