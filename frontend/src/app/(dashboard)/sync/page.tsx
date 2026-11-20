"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { SyncLog, SyncReport } from "@/types";
import { SyncReportView } from "@/components/sync/SyncReportView";
import { useAuthStore } from "@/store/auth.store";
import { RefreshCw, CheckCircle2, XCircle, Clock, Database, Settings2, FlaskConical } from "lucide-react";

// Скрытие второстепенных колонок на узком экране: параллельный заголовкам
// массив классов по индексу (см. тот же приём в admin/page.tsx).
const SYNC_COLS = ["Статус", "Начало", "Завершение", "Обработано", "Создано", "Обновлено", "Ошибки", "Запустил"];
const SYNC_COL_HIDE = ["", "", "hidden md:table-cell", "hidden lg:table-cell", "hidden xl:table-cell", "hidden lg:table-cell", "", "hidden md:table-cell"];

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  success: { label: "Успешно", cls: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300", icon: CheckCircle2 },
  error: { label: "Ошибка", cls: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300", icon: XCircle },
  running: { label: "Выполняется", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300", icon: RefreshCw },
  pending: { label: "Ожидание", cls: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400", icon: Clock },
};

export default function SyncPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const { data: logs, isLoading } = useQuery<SyncLog[]>({
    queryKey: ["sync-logs"],
    queryFn: () => syncApi.getLogs(50).then(r => r.data),
    refetchInterval: 15_000,
  });
  const { data: lastSync } = useQuery({
    queryKey: ["last-sync"],
    queryFn: () => syncApi.getLastSync().then(r => r.data),
  });

  // Отчёт последнего запуска с этой страницы. В журнале он не хранится —
  // только счётчики, — поэтому живёт до перезагрузки страницы
  const [report, setReport] = useState<SyncReport | null>(null);

  const syncMutation = useMutation({
    mutationFn: (dryRun: boolean) => syncApi.run(dryRun).then(r => r.data as SyncLog),
    onSuccess: (log) => {
      setReport(log.report ?? null);
      qc.invalidateQueries({ queryKey: ["sync-logs"] });
      qc.invalidateQueries({ queryKey: ["last-sync"] });
    },
  });

  const runReal = () => {
    // Первый настоящий обмен пишет в реестр сотни карточек сразу. Ошибка
    // сопоставления при этом не роняет обмен, а тихо плодит дубли — поэтому
    // перед ним напоминаем о пробном прогоне
    if (!lastSync && !window.confirm(
      "Обмен с 1С ещё ни разу не проходил. Он сразу запишет изменения в реестр ОС.\n\n" +
      "Сначала стоит сделать «Пробный прогон» и проверить отчёт. Продолжить всё равно?",
    )) return;
    syncMutation.mutate(false);
  };

  const canSync = user && ["admin", "accountant"].includes(user.role);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Синхронизация с 1С">
        {canSync && (
          <div className="flex gap-2">
            <Button
              size="sm" variant="secondary"
              loading={syncMutation.isPending && syncMutation.variables === true}
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate(true)}
              icon={<FlaskConical className="w-3.5 h-3.5" />}
              title="Загрузить из 1С и показать, что изменится, ничего не записывая"
            >
              Пробный прогон
            </Button>
            <Button
              size="sm"
              loading={syncMutation.isPending && syncMutation.variables === false}
              disabled={syncMutation.isPending}
              onClick={runReal}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending && syncMutation.variables === false ? "animate-spin" : ""}`} />}
            >
              Обновить из 1С
            </Button>
          </div>
        )}
      </Header>

      <div className="p-6 space-y-5">
        {report && <SyncReportView report={report} onClose={() => setReport(null)} />}

        {/* Ошибка запуска без отчёта — например, 1С не ответила */}
        {!report && syncMutation.data?.status === "error" && (
          <div className="card p-4 border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
            Обмен не прошёл: {syncMutation.data.errors?.map(e => e.message ?? e.error).filter(Boolean).join("; ") || "причина в журнале"}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Последняя синхронизация</p>
            </div>
            <p className="font-bold text-gray-900 dark:text-white text-sm">
              {lastSync?.finishedAt ? new Date(lastSync.finishedAt).toLocaleString("ru-RU") : "Никогда"}
            </p>
            {lastSync?.triggeredByName && (
              <p className="text-xs text-gray-400 mt-1">Запустил: {lastSync.triggeredByName}</p>
            )}
            {lastSync?.source === "scheduler" && (
              <p className="text-xs text-gray-400 mt-1">По расписанию</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Обработано записей</p>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">{lastSync?.recordsProcessed || 0}</p>
            <p className="text-xs text-gray-400 mt-1 tabular-nums">
              +{lastSync?.recordsCreated || 0} создано · ~{lastSync?.recordsUpdated || 0} обновлено
            </p>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Статус</p>
            </div>
            {lastSync?.status ? (() => {
              const cfg = STATUS_CONFIG[lastSync.status];
              const Icon = cfg?.icon || Clock;
              return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold ${cfg?.cls}`}>
                  <Icon className={`w-3.5 h-3.5 ${lastSync.status === "running" ? "animate-spin" : ""}`} />
                  {cfg?.label}
                </span>
              );
            })() : <span className="text-gray-400 text-sm">—</span>}
          </div>
        </div>

        {/* Integration settings */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Настройки интеграции</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">URL 1С OData API</p>
              <p className="text-sm text-gray-700 dark:text-slate-300 font-mono mt-1.5 bg-gray-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-slate-700">
                {process.env.NEXT_PUBLIC_ONE_C_URL || "Не настроен (ONE_C_URL в .env)"}
              </p>
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Обмен по расписанию (ежедневно в 06:00, переменная <code className="font-mono text-gray-500">ONE_C_SYNC_CRON</code>)
              включается переменной <code className="font-mono text-gray-500">ONE_C_SYNC_ENABLED=true</code> в .env — только после
              проверки отчёта пробного прогона.
            </p>
          </div>
        </div>

        {/* Logs table */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Журнал синхронизаций</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50">
                <tr>
                  {SYNC_COLS.map((h, i) => (
                    <th key={h} className={`th ${SYNC_COL_HIDE[i]}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {isLoading ? (
                  <tr><td colSpan={8} className="td py-10 text-center text-gray-400">Загрузка...</td></tr>
                ) : logs?.map(log => {
                  const cfg = STATUS_CONFIG[log.status];
                  const Icon = cfg?.icon || Clock;
                  return (
                    <tr key={log.id} className="tr-hover">
                      <td className="td">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg?.cls}`}>
                          <Icon className={`w-3 h-3 ${log.status === "running" ? "animate-spin" : ""}`} />
                          {cfg?.label}
                        </span>
                        {/* Счётчики пробного прогона — «было бы», а не «сделано» */}
                        {log.source === "dry-run" && (
                          <span className="ml-1.5 text-[11px] font-semibold text-gray-400 dark:text-slate-500">пробный</span>
                        )}
                      </td>
                      <td className={`td text-xs text-gray-500 dark:text-slate-400 tabular-nums ${SYNC_COL_HIDE[1]}`}>{new Date(log.startedAt).toLocaleString("ru-RU")}</td>
                      <td className={`td text-xs text-gray-500 dark:text-slate-400 tabular-nums ${SYNC_COL_HIDE[2]}`}>{log.finishedAt ? new Date(log.finishedAt).toLocaleString("ru-RU") : "—"}</td>
                      <td className={`td text-center tabular-nums ${SYNC_COL_HIDE[3]}`}>{log.recordsProcessed}</td>
                      <td className={`td text-center text-green-600 dark:text-green-400 font-semibold tabular-nums ${SYNC_COL_HIDE[4]}`}>{log.recordsCreated}</td>
                      <td className={`td text-center text-blue-600 dark:text-blue-400 font-semibold tabular-nums ${SYNC_COL_HIDE[5]}`}>{log.recordsUpdated}</td>
                      <td className={`td text-center text-red-500 dark:text-red-400 font-semibold tabular-nums ${SYNC_COL_HIDE[6]}`}>{log.errors?.length || 0}</td>
                      <td className={`td text-xs text-gray-400 dark:text-slate-500 ${SYNC_COL_HIDE[7]}`}>
                        {log.triggeredByName || (log.source === "scheduler" ? "По расписанию" : "—")}
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && !logs?.length && (
                  <tr><td colSpan={8} className="td py-10 text-center text-gray-400">Нет записей</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
