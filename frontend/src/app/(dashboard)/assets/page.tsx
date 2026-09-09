"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { assetsApi, departmentsApi, reportsApi, downloadBlob } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import ExcelImportModal from "@/components/assets/ExcelImportModal";
import { BulkLabelDialog } from "@/components/assets/BulkLabelDialog";
import { AssetLabelBatch } from "@/components/assets/AssetLabelBatch";
import { ASSET_STATUS_LABELS, AssetStatus, Asset, Department, ASSET_CATEGORIES } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { useTableColumns } from "@/store/table-columns.store";
import { visibleColumns, activeFilters, BREAKPOINT_CLASS } from "@/lib/table-columns";
import { ColumnSettingsDialog } from "@/components/assets/ColumnSettingsDialog";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/store/toast.store";
import {
  Download, Plus, Search, X, ChevronLeft, ChevronRight, Upload, FileSpreadsheet, Printer, Settings2,
} from "lucide-react";

const STATUSES = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];

/**
 * Оформление ячеек и заглушек по ключу колонки.
 *
 * Вынесено в таблицы соответствий, потому что порядок и состав колонок
 * теперь задаёт пользователь: вшить оформление в разметку больше нельзя.
 */
const SKELETON_CLASS: Record<string, string> = {
  inventoryNumber: "h-4 w-24",
  name: "h-4 w-48",
  category: "h-4 w-24",
  departmentName: "h-4 w-32",
  responsiblePerson: "h-4 w-32",
  ownerName: "h-4 w-28",
  location: "h-4 w-28",
  residualValue: "h-4 w-20",
  status: "h-5 w-20 rounded-full",
};

const CELL_CLASS: Record<string, string> = {
  inventoryNumber: "font-mono text-xs text-gray-500 dark:text-slate-400",
  name: "font-semibold text-gray-900 dark:text-white max-w-xs truncate",
  ownerName: "text-gray-500 dark:text-slate-400 max-w-[12rem] truncate",
  location: "text-gray-500 dark:text-slate-400 max-w-[12rem] truncate",
  residualValue: "text-right text-gray-600 dark:text-slate-400 tabular-nums",
  status: "",
  actions: "text-right",
};

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
  const [labelsDialog, setLabelsDialog] = useState(false);
  const [columnsDialog, setColumnsDialog] = useState(false);
  // Пачка, готовая к печати: набор ОС и с какого номера начали
  const [batch, setBatch] = useState<{ assets: Asset[]; startNo: number; totalNo: number } | null>(null);

  // Состав и порядок колонок задаёт пользователь; настройка своя у каждого
  const columnConfig = useTableColumns(s => s.byUser[user?.id ?? "anon"]);
  const columns = useMemo(() => visibleColumns(columnConfig), [columnConfig]);
  const filters = useMemo(() => activeFilters(columnConfig), [columnConfig]);

  // Фильтр по скрытой колонке не применяется. Иначе вышло бы «куда делись
  // записи»: отбор продолжает действовать, а увидеть и снять его негде.
  //
  // При этом выбранное значение НЕ стирается: скрытие колонки — действие
  // про отображение, терять из-за него настроенный отбор незачем. Вернёте
  // колонку — вернётся и фильтр, уже видимый на экране.
  const effStatus = filters.has("status") ? statusFilter : "";
  const effDept = filters.has("department") ? deptFilter : "";
  const effCat = filters.has("category") ? catFilter : "";

  /** Содержимое ячейки по ключу колонки. */
  const renderCell = (key: string, asset: Asset) => {
    switch (key) {
      case "inventoryNumber": return asset.inventoryNumber;
      case "name": return asset.name;
      case "category": return asset.category || "—";
      case "departmentName": return asset.departmentName || "—";
      case "responsiblePerson": return asset.responsiblePerson || "—";
      case "ownerName": return asset.ownerName || "—";
      case "location": return asset.location || "—";
      case "residualValue": return Number(asset.residualValue).toLocaleString("ru-RU");
      case "status": return <AssetStatusBadge status={asset.status} />;
      case "actions": return (
        <Button variant="ghost" size="xs" onClick={() => router.push(`/assets/${asset.id}`)}>
          Открыть
        </Button>
      );
      default: return null;
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["assets", debouncedSearch, effStatus, effDept, effCat, page],
    queryFn: () =>
      assetsApi
        .getAll({ search: debouncedSearch, status: effStatus || undefined, departmentId: effDept || undefined, category: effCat || undefined, page, limit: 25 })
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
  const hasFilters = !!(search || effStatus || effDept || effCat);

  // Расшифровка отбора для диалога печати: печатать «всё по фильтру»,
  // не видя, какой он, — верный способ извести ленту впустую
  const filtersLabel = [
    search && `поиск «${search}»`,
    effStatus && `статус «${ASSET_STATUS_LABELS[effStatus as AssetStatus]}»`,
    effDept && `подразделение «${depts?.find(d => d.id === effDept)?.name ?? "—"}»`,
    effCat && `категория «${effCat}»`,
  ].filter(Boolean).join(", ") || null;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Основные средства">
        {canManage && selected.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setBulkModal(true)}>
            Изменить статус ({selected.length})
          </Button>
        )}

        {/* Печать наклеек — по отмеченным строкам либо по всему отбору.
            Без гейта по роли: одиночная печать на карточке ОС тоже открыта всем */}
        <Button
          variant="secondary" size="sm"
          onClick={() => setLabelsDialog(true)}
          icon={<Printer className="w-3.5 h-3.5" />}
        >
          Наклейки{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>

        {/* Состав и порядок колонок — настройка своя у каждого пользователя */}
        <Button
          variant="secondary" size="sm"
          onClick={() => setColumnsDialog(true)}
          icon={<Settings2 className="w-3.5 h-3.5" />}
        >
          Колонки
        </Button>

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
            {/* Фильтр живёт ровно столько, сколько его колонка на экране */}
            {filters.has("status") && (
              <select
                className="input w-44"
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="">Все статусы</option>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {filters.has("department") && (
              <select
                className="input w-52"
                value={deptFilter}
                onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
              >
                <option value="">Все подразделения</option>
                {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {filters.has("category") && (
              <select
                className="input w-44"
                value={catFilter}
                onChange={e => { setCatFilter(e.target.value); setPage(1); }}
              >
                <option value="">Все категории</option>
                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
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
                    {columns.map(col => (
                      <th
                        key={col.key}
                        className={`th ${BREAKPOINT_CLASS[col.breakpoint]} ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {isLoading
                    ? Array(8).fill(0).map((_, i) => (
                      <tr key={i}>
                        {canManage && <td className="px-4 py-3.5"><div className="skeleton h-4 w-4 rounded" /></td>}
                        {columns.map(col => (
                          <td key={col.key} className={`td ${BREAKPOINT_CLASS[col.breakpoint]}`}>
                            {SKELETON_CLASS[col.key] && (
                              <div className={`skeleton ${SKELETON_CLASS[col.key]}`} />
                            )}
                          </td>
                        ))}
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
                        {columns.map(col => (
                          <td
                            key={col.key}
                            className={`td ${BREAKPOINT_CLASS[col.breakpoint]} ${CELL_CLASS[col.key] ?? "text-gray-500 dark:text-slate-400"}`}
                            // Кнопка «Открыть» не должна ещё раз открывать
                            // карточку через клик по строке
                            onClick={col.key === "actions" ? e => e.stopPropagation() : undefined}
                          >
                            {renderCell(col.key, asset)}
                          </td>
                        ))}
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
      <ColumnSettingsDialog open={columnsDialog} onClose={() => setColumnsDialog(false)} />

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

      {/* Печать наклеек: сначала выбор набора, затем предпросмотр.
          Выбор строк после печати не сбрасываем — допечатка второй
          попыткой и есть смысл всей этой кнопки */}
      {labelsDialog && (
        <BulkLabelDialog
          selectedIds={selected}
          filters={{ search: debouncedSearch, status: effStatus, departmentId: effDept, category: effCat }}
          totalByFilters={data?.total ?? 0}
          filtersLabel={filtersLabel}
          onClose={() => setLabelsDialog(false)}
          onReady={(assets, startNo, totalNo) => {
            setLabelsDialog(false);
            setBatch({ assets, startNo, totalNo });
          }}
        />
      )}

      {batch && (
        <AssetLabelBatch
          assets={batch.assets}
          startNo={batch.startNo}
          totalNo={batch.totalNo}
          onClose={() => setBatch(null)}
        />
      )}

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
