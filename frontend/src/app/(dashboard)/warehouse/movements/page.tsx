"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warehouseApi, downloadBlob } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import {
  StockMovement, MovementType, MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_COLORS, PaginatedResponse,
} from "@/types";
import { Download, Undo2, ChevronLeft, ChevronRight } from "lucide-react";

const TYPES = Object.entries(MOVEMENT_TYPE_LABELS) as [MovementType, string][];

export default function MovementsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canOperate = !!user && ["admin", "accountant", "inventorizer"].includes(user.role);

  const [type, setType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery<PaginatedResponse<StockMovement>>({
    queryKey: ["wh-journal", type, dateFrom, dateTo, page],
    queryFn: () => warehouseApi.journal({ type: type || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, limit: 30 }).then(r => r.data),
    placeholderData: (p: any) => p,
  });

  const reverseMut = useMutation({
    mutationFn: (mv: StockMovement) => warehouseApi.reverse(mv.id, "Исправление ошибочной операции"),
    onSuccess: () => { toast.success("Движение сторнировано"); qc.invalidateQueries({ queryKey: ["wh-journal"] }); qc.invalidateQueries({ queryKey: ["wh-items"] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Не удалось сторнировать"),
  });

  const doExport = async () => {
    setExporting(true);
    try {
      const { data: blob } = await warehouseApi.exportJournal({ type: type || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      downloadBlob(blob, `warehouse-journal-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally { setExporting(false); }
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Журнал операций">
        <Button size="sm" variant="secondary" loading={exporting} icon={<Download className="w-3.5 h-3.5" />} onClick={doExport}>Скачать Excel</Button>
      </Header>

      <div className="p-6 flex flex-col gap-4">
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div><label className="label">Тип</label>
            <select className="input w-44" value={type} onChange={e => { setType(e.target.value); setPage(1); }}>
              <option value="">Все операции</option>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">С даты</label><input type="date" className="input w-40" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></div>
          <div><label className="label">По дату</label><input type="date" className="input w-40" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800"><tr>
                <th className="th">Дата</th><th className="th">Операция</th><th className="th">Позиция</th>
                <th className="th text-right">Кол-во</th><th className="th">Экземпляр</th><th className="th">Сотрудник</th>
                <th className="th hidden lg:table-cell">Документ / причина</th><th className="th text-right">Действия</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {isLoading ? Array(8).fill(0).map((_, i) => <tr key={i}><td className="td" colSpan={8}><div className="skeleton h-4 w-full" /></td></tr>)
                  : data?.data.map(mv => (
                    <tr key={mv.id}>
                      <td className="td text-gray-500 text-xs whitespace-nowrap">{new Date(mv.createdAt).toLocaleString("ru-RU")}</td>
                      <td className="td"><span className={`text-xs px-2 py-0.5 rounded-full ${MOVEMENT_TYPE_COLORS[mv.type]}`}>{MOVEMENT_TYPE_LABELS[mv.type]}</span></td>
                      <td className="td font-medium text-gray-900 dark:text-white">{mv.item?.name}</td>
                      <td className={`td text-right tabular-nums font-medium ${Number(mv.quantity) < 0 ? "text-red-600" : "text-green-600"}`}>{Number(mv.quantity) > 0 ? "+" : ""}{mv.quantity}</td>
                      <td className="td text-gray-500 text-xs font-mono">{mv.stockUnit?.serialNumber || "—"}</td>
                      <td className="td text-gray-500">{mv.employee?.fullName || "—"}</td>
                      <td className="td text-gray-500 hidden lg:table-cell text-xs max-w-[200px] truncate">{mv.documentNumber || mv.reason || "—"}</td>
                      <td className="td text-right">
                        {canOperate && !mv.reversalOf && (mv.type === "issue" || mv.type === "write_off") && (
                          <Button variant="ghost" size="xs" icon={<Undo2 className="w-3.5 h-3.5" />} loading={reverseMut.isPending}
                            onClick={() => { if (confirm("Сторнировать это движение?")) reverseMut.mutate(mv); }}>Сторно</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                {!isLoading && !data?.data.length && <tr><td className="td text-center text-gray-400 py-12" colSpan={8}>Операций не найдено</td></tr>}
              </tbody>
            </table>
          </div>
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-slate-800">
              <p className="text-xs text-gray-500 tabular-nums">{(page - 1) * 30 + 1}–{Math.min(page * 30, data.total)} из {data.total}</p>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} icon={<ChevronLeft className="w-3.5 h-3.5" />} />
                <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} icon={<ChevronRight className="w-3.5 h-3.5" />} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
