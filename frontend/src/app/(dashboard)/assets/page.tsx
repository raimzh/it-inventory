"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { assetsApi, departmentsApi, reportsApi, downloadBlob } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import ExcelImportModal from "@/components/assets/ExcelImportModal";
import { ASSET_STATUS_LABELS, AssetStatus, Asset, Department, ASSET_CATEGORIES } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/store/toast.store";
import {
  Download, Plus, Search, X, ChevronLeft, ChevronRight, Upload, FileSpreadsheet,
} from "lucide-react";

const STATUSES = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];

export default function AssetsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<AssetStatus>("active");
  const [exportLoading, setExportLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["assets", debouncedSearch, statusFilter, deptFilter, catFilter, page],
    queryFn: () =>
      assetsApi
        .getAll({ search: debouncedSearch, status: statusFilter || undefined, departmentId: deptFilter || undefined, category: catFilter || undefined, page, limit: 25 })
        .then(r => r.data),
    placeholderData: (prev: any) => prev,
  });

  const { data: depts } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.getAll().then(r => r.data),
  });

  const bulkMutation = useMutation({
    mutationFn: () => assetsApi.bulkUpdate(selected, { status: bulkStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(`Статус обновлён (${selected.length})`);
      setSelected([]);
      setBulkModal(false);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось обновить статус"));
    },
  });

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const { data: blob } = await reportsApi.exportAssets();
      downloadBlob(blob, `assets-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExportLoading(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelected(prev =>
      prev.length === (data?.data?.length || 0) ? [] : (data?.data?.map((a: Asset) => a.id) || [])
    );

  // Создание/массовые операции и выбор строк доступны только admin/accountant
  // (бэкенд: POST /assets и POST /assets/bulk-update → admin, accountant)
  const canManage = user && ["admin", "accountant"].includes(user.role);
  const canImport = user && ["admin", "accountant"].includes(user.role);
  const hasFilters = !!(search || statusFilter || deptFilter || catFilter);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Основные средства">
        {canManage && selected.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setBulkModal(true)}>
            Изменить статус ({selected.length})
          </Button>
        )}

        {/* Excel export */}
        <Button
          variant="secondary" size="sm"
          loading={exportLoading} onClick={handleExport}
          icon={<Download className="w-3.5 h-3.5" />}
        >
          Скачать Excel
        </Button>

        {/* Excel import — visible to admin/accountant */}
        {canImport && (
          <Button
            variant="secondary" size="sm"
            onClick={() => setShowImport(true)}
            icon={<Upload className="w-3.5 h-3.5" />}
          >
            Загрузить Excel
          </Button>
        )}

        {canManage && (
          <Button
            size="sm"
            onClick={() => router.push("/assets/new")}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Добавить
          </Button>
        )}
      </Header>

      <div className="p-6 flex flex-col gap-4">
        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                className="input pl-10"
                placeholder="Поиск по номеру, названию, ответственному..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="input w-44"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Все статусы</option>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select
              className="input w-52"
              value={deptFilter}
              onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
            >
              <option value="">Все подразделения</option>
              {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select
              className="input w-44"
              value={catFilter}
              onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            >
              <option value="">Все категории</option>
              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {hasFilters && (
              <Button
                variant="ghost" size="sm"
                icon={<X className="w-3.5 h-3.5" />}
                onClick={() => { setSearch(""); setStatusFilter(""); setDeptFilter(""); setCatFilter(""); setPage(1); }}
              >
                Сбросить
              </Button>
            )}
          </div>
        </div>

        {/* Empty state with import hint */}
        {!isLoading && (!data?.data?.length) && (
          <div className="card flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 rounded-2xl flex items-center justify-center">
              <FileSpreadsheet className="w-8 h-8 text-primary-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-700 dark:text-slate-300 text-base">
                {hasFilters ? "Ничего не найдено" : "Основные средства не добавлены"}
              </p>
              {!hasFilters && canImport && (
                <p className="text-sm text-gray-500 mt-1">
                  Добавьте ОС вручную или{" "}
                  <button
                    onClick={() => setShowImport(true)}
                    className="text-primary-600 hover:underline font-medium"
                  >
                    загрузите из Excel
                  </button>
                </p>
              )}
            </div>
            {!hasFilters && canImport && (
              <Button
                onClick={() => setShowImport(true)}
                icon={<Upload className="w-4 h-4" />}
              >
                Загрузить из Excel
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        {(isLoading || !!data?.data?.length) && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                  <tr>
                    {canManage && (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 dark:border-slate-600 text-primary-600 cursor-pointer"
                          checked={selected.length === (data?.data?.length || 0) && selected.length > 0}
                          onChange={toggleAll}
                        />
                      </th>
                    )}
                    <th className="th">Инв. номер</th>
                    <th className="th">Наименование</th>
                    <th className="th hidden lg:table-cell">Категория</th>
                    <th className="th hidden md:table-cell">Подразделение</th>
                    <th className="th hidden lg:table-cell">Ответственный</th>
                    <th className="th hidden xl:table-cell text-right">Стоимость, ₽</th>
                    <th className="th">Статус</th>
                    <th className="th text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {isLoading
                    ? Array(8).fill(0).map((_, i) => (
                      <tr key={i}>
                        {canManage && <td className="px-4 py-3.5"><div className="skeleton h-4 w-4 rounded" /></td>}
                        <td className="td"><div className="skeleton h-4 w-24" /></td>
                        <td className="td"><div className="skeleton h-4 w-48" /></td>
                        <td className="td hidden lg:table-cell"><div className="skeleton h-4 w-24" /></td>
                        <td className="td hidden md:table-cell"><div className="skeleton h-4 w-32" /></td>
                        <td className="td hidden lg:table-cell"><div className="skeleton h-4 w-32" /></td>
                        <td className="td hidden xl:table-cell"><div className="skeleton h-4 w-20" /></td>
                        <td className="td"><div className="skeleton h-5 w-20 rounded-full" /></td>
                        <td className="td" />
                      </tr>
                    ))
                    : data?.data?.map((asset: Asset) => (
                      <tr
                        key={asset.id}
                        className="tr-hover cursor-pointer"
                        onClick={() => router.push(`/assets/${asset.id}`)}
                      >
                        {canManage && (
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 dark:border-slate-600 text-primary-600 cursor-pointer"
                              checked={selected.includes(asset.id)}
                              onChange={() => toggleSelect(asset.id)}
                            />
                          </td>
                        )}
                        <td className="td font-mono text-xs text-gray-500 dark:text-slate-400">
                          {asset.inventoryNumber}
                        </td>
                        <td className="td font-semibold text-gray-900 dark:text-white max-w-xs truncate">
                          {asset.name}
                        </td>
                        <td className="td text-gray-500 dark:text-slate-400 hidden lg:table-cell">
                          {asset.category || "—"}
                        </td>
                        <td className="td text-gray-500 dark:text-slate-400 hidden md:table-cell">
                          {asset.departmentName || "—"}
                        </td>
                        <td className="td text-gray-500 dark:text-slate-400 hidden lg:table-cell">
                          {asset.responsiblePerson || "—"}
                        </td>
                        <td className="td text-right text-gray-600 dark:text-slate-400 hidden xl:table-cell tabular-nums">
                          {Number(asset.residualValue).toLocaleString("ru-RU")}
                        </td>
                        <td className="td"><AssetStatusBadge status={asset.status} /></td>
                        <td className="td text-right" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="xs"
                            onClick={() => router.push(`/assets/${asset.id}`)}
                          >
                            Открыть
                          </Button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-slate-800">
                <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                  {(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} из {data.total}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="secondary" size="sm"
                    disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    icon={<ChevronLeft className="w-3.5 h-3.5" />}
                  />
                  <Button
                    variant="secondary" size="sm"
                    disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                    icon={<ChevronRight className="w-3.5 h-3.5" />}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk status modal */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title={`Изменить статус (${selected.length} ОС)`}>
        <div className="space-y-5">
          <div>
            <label className="label">Новый статус</label>
            <select className="input" value={bulkStatus} onChange={e => setBulkStatus(e.target.value as AssetStatus)}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setBulkModal(false)}>Отмена</Button>
            <Button loading={bulkMutation.isPending} onClick={() => bulkMutation.mutate()}>Применить</Button>
          </div>
        </div>
      </Modal>

      {/* Excel Import Modal */}
      {showImport && (
        <ExcelImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["assets"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }}
        />
      )}
    </div>
  );
}
