"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, inventoryApi, downloadBlob } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { Download, FileSpreadsheet, AlertTriangle, Building2, User } from "lucide-react";

type Tab = "missing" | "departments" | "owners";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "missing", label: "Отсутствующие ОС", icon: AlertTriangle },
  { key: "departments", label: "По подразделениям", icon: Building2 },
  { key: "owners", label: "История владельцев", icon: User },
];

// Скрытие второстепенных колонок на узком экране: параллельный заголовкам
// массив классов по индексу (см. тот же приём в admin/page.tsx).
const MISSING_COLS = ["Инв. номер", "Наименование", "Подразделение", "Ответственный", "Статус", "Обновлено"];
const MISSING_COL_HIDE = ["", "", "hidden md:table-cell", "hidden lg:table-cell", "", "hidden md:table-cell"];

const DEPT_REPORT_COLS = ["Подразделение", "Всего ОС", "В наличии", "Не найдено", "Суммарная стоимость"];
const DEPT_REPORT_COL_HIDE = ["", "", "", "hidden md:table-cell", "hidden lg:table-cell"];

const OWNER_COLS = ["ОС", "Поле", "Было", "Стало", "Кем изменено", "Дата"];
const OWNER_COL_HIDE = ["", "hidden md:table-cell", "", "", "hidden md:table-cell", "hidden lg:table-cell"];

export default function ReportsPage() {
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("missing");
  const [selectedSession, setSelectedSession] = useState("");

  const { data: missingAssets } = useQuery({
    queryKey: ["report-missing"],
    queryFn: () => reportsApi.getMissing().then(r => r.data),
    enabled: tab === "missing",
  });
  const { data: deptReport } = useQuery({
    queryKey: ["report-departments"],
    queryFn: () => reportsApi.getDepartmentReport().then(r => r.data),
    enabled: tab === "departments",
  });
  const { data: ownerHistory } = useQuery({
    queryKey: ["report-owners"],
    queryFn: () => reportsApi.getOwnerHistory().then(r => r.data),
    enabled: tab === "owners",
  });
  const { data: sessionsData } = useQuery({
    queryKey: ["inventory-sessions"],
    queryFn: () => inventoryApi.getSessions({ limit: 50 }).then(r => r.data),
  });

  const handleExportAssets = async () => {
    setExportLoading("assets");
    try {
      const { data } = await reportsApi.exportAssets();
      downloadBlob(data, `assets-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally { setExportLoading(null); }
  };

  const handleExportInventory = async () => {
    if (!selectedSession) return;
    setExportLoading("inventory");
    try {
      const { data } = await reportsApi.exportInventory(selectedSession);
      downloadBlob(data, `inventory-${selectedSession.slice(0, 8)}.xlsx`);
    } finally { setExportLoading(null); }
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Отчёты">
        <Button
          variant="secondary" size="sm"
          loading={exportLoading === "assets"}
          onClick={handleExportAssets}
          icon={<Download className="w-3.5 h-3.5" />}
        >
          Экспорт всех ОС
        </Button>
      </Header>

      <div className="p-6 space-y-5">
        {/* Export inventory */}
        <div className="card p-4 flex items-center gap-3 flex-wrap">
          <FileSpreadsheet className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Инвентаризационная ведомость:</span>
          <select
            className="input w-full sm:w-64"
            value={selectedSession}
            onChange={e => setSelectedSession(e.target.value)}
          >
            <option value="">Выберите сессию</option>
            {sessionsData?.data?.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} — {new Date(s.createdAt).toLocaleDateString("ru-RU")}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!selectedSession}
            loading={exportLoading === "inventory"}
            onClick={handleExportInventory}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Скачать Excel
          </Button>
        </div>

        {/* Tabs */}
        <div className="tabs-container">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-item flex items-center gap-1.5 ${tab === t.key ? "active" : ""}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Missing assets */}
        {tab === "missing" && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Отсутствующие ОС{" "}
                <span className="text-gray-400 font-normal">({missingAssets?.length || 0})</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr>
                    {MISSING_COLS.map((h, i) => (
                      <th key={h} className={`th ${MISSING_COL_HIDE[i]}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {missingAssets?.map((a: any) => (
                    <tr key={a.id} className="tr-hover">
                      <td className={`td font-mono text-xs text-gray-500 dark:text-slate-400 ${MISSING_COL_HIDE[0]}`}>{a.inventoryNumber}</td>
                      <td className={`td font-semibold text-gray-900 dark:text-white max-w-xs truncate ${MISSING_COL_HIDE[1]}`}>{a.name}</td>
                      <td className={`td text-gray-500 ${MISSING_COL_HIDE[2]}`}>{a.departmentName || "—"}</td>
                      <td className={`td text-gray-500 ${MISSING_COL_HIDE[3]}`}>{a.responsiblePerson || "—"}</td>
                      <td className={`td ${MISSING_COL_HIDE[4]}`}><AssetStatusBadge status={a.status} /></td>
                      <td className={`td text-xs text-gray-400 ${MISSING_COL_HIDE[5]}`}>{new Date(a.updatedAt).toLocaleDateString("ru-RU")}</td>
                    </tr>
                  ))}
                  {!missingAssets?.length && (
                    <tr><td colSpan={6} className="td py-10 text-center text-gray-400">Нет отсутствующих ОС</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Department report */}
        {tab === "departments" && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Отчёт по подразделениям</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr>
                    {DEPT_REPORT_COLS.map((h, i) => (
                      <th key={h} className={`th ${DEPT_REPORT_COL_HIDE[i]}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {deptReport?.map((d: any, i: number) => (
                    <tr key={i} className="tr-hover">
                      <td className={`td font-semibold text-gray-900 dark:text-white ${DEPT_REPORT_COL_HIDE[0]}`}>{d.department || "Без подразделения"}</td>
                      <td className={`td text-gray-600 dark:text-slate-400 tabular-nums ${DEPT_REPORT_COL_HIDE[1]}`}>{d.total}</td>
                      <td className={`td text-green-600 dark:text-green-400 font-semibold tabular-nums ${DEPT_REPORT_COL_HIDE[2]}`}>{d.active}</td>
                      <td className={`td text-red-500 dark:text-red-400 font-semibold tabular-nums ${DEPT_REPORT_COL_HIDE[3]}`}>{d.notFound}</td>
                      <td className={`td text-gray-600 dark:text-slate-400 tabular-nums ${DEPT_REPORT_COL_HIDE[4]}`}>{Number(d.totalValue || 0).toLocaleString("ru-RU")} ₽</td>
                    </tr>
                  ))}
                  {!deptReport?.length && (
                    <tr><td colSpan={5} className="td py-10 text-center text-gray-400">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Owner history */}
        {tab === "owners" && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">История изменений владельцев</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                  <tr>
                    {OWNER_COLS.map((h, i) => (
                      <th key={h} className={`th ${OWNER_COL_HIDE[i]}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {ownerHistory?.map((h: any) => (
                    <tr key={h.id} className="tr-hover">
                      <td className={`td font-mono text-xs text-gray-500 dark:text-slate-400 ${OWNER_COL_HIDE[0]}`}>{h.asset?.inventoryNumber}</td>
                      <td className={`td text-gray-600 ${OWNER_COL_HIDE[1]}`}>{h.field}</td>
                      <td className={`td text-red-500 dark:text-red-400 line-through text-xs ${OWNER_COL_HIDE[2]}`}>{h.oldValue || "—"}</td>
                      <td className={`td text-green-600 dark:text-green-400 font-medium text-xs ${OWNER_COL_HIDE[3]}`}>{h.newValue || "—"}</td>
                      <td className={`td text-gray-500 ${OWNER_COL_HIDE[4]}`}>{h.changedByName || "Система"}</td>
                      <td className={`td text-xs text-gray-400 ${OWNER_COL_HIDE[5]}`}>{new Date(h.createdAt).toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                  {!ownerHistory?.length && (
                    <tr><td colSpan={6} className="td py-10 text-center text-gray-400">Нет записей</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
