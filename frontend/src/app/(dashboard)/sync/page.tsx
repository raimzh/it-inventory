"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { SyncLog } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { RefreshCw, CheckCircle2, XCircle, Clock, Database, Settings2 } from "lucide-react";

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

  const syncMutation = useMutation({
    mutationFn: () => syncApi.run(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-logs"] });
      qc.invalidateQueries({ queryKey: ["last-sync"] });
    },
  });

  const canSync = user && ["admin", "accountant"].includes(user.role);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Синхронизация с 1С">
        {canSync && (
          <Button
            size="sm" loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />}
          >
            Обновить из 1С
          </Button>
        )}
      </Header>

      <div className="p-6 space-y-5">
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
              Автосинхронизация: ежедневно в 06:00. Изменить расписание: переменная <code className="font-mono text-gray-500">ONE_C_SYNC_CRON</code> в .env
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
                  {["Статус", "Начало", "Завершение", "Обработано", "Создано", "Обновлено", "Ошибки", "Запустил"].map(h => (
                    <th key={h} className="th">{h}</th>
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
                      </td>
                      <td className="td text-xs text-gray-500 dark:text-slate-400 tabular-nums">{new Date(log.startedAt).toLocaleString("ru-RU")}</td>
                      <td className="td text-xs text-gray-500 dark:text-slate-400 tabular-nums">{log.finishedAt ? new Date(log.finishedAt).toLocaleString("ru-RU") : "—"}</td>
                      <td className="td text-center tabular-nums">{log.recordsProcessed}</td>
                      <td className="td text-center text-green-600 dark:text-green-400 font-semibold tabular-nums">{log.recordsCreated}</td>
                      <td className="td text-center text-blue-600 dark:text-blue-400 font-semibold tabular-nums">{log.recordsUpdated}</td>
                      <td className="td text-center text-red-500 dark:text-red-400 font-semibold tabular-nums">{log.errors?.length || 0}</td>
                      <td className="td text-xs text-gray-400 dark:text-slate-500">
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
