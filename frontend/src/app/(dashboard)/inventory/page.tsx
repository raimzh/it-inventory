"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { InventorySession, InventoryItem, ASSET_STATUS_LABELS, AssetStatus } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { Plus, ScanLine, CheckCircle2, XCircle, ClipboardList, Lock } from "lucide-react";

const STATUSES = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];

export default function InventoryPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [newModal, setNewModal] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionDesc, setSessionDesc] = useState("");
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scanStatus, setScanStatus] = useState<AssetStatus>("active");
  const [scanResult, setScanResult] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: sessionsData } = useQuery({
    queryKey: ["inventory-sessions"],
    queryFn: () => inventoryApi.getSessions({ limit: 20 }).then(r => r.data),
  });
  const { data: sessionStats } = useQuery({
    queryKey: ["session-stats", activeSession],
    queryFn: () => inventoryApi.getSessionStats(activeSession!).then(r => r.data),
    enabled: !!activeSession,
  });
  const { data: sessionItems } = useQuery({
    queryKey: ["session-items", activeSession],
    queryFn: () => inventoryApi.getSessionItems(activeSession!, { limit: 100 }).then(r => r.data),
    enabled: !!activeSession,
    refetchInterval: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: () => inventoryApi.createSession({ name: sessionName, description: sessionDesc }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inventory-sessions"] });
      setNewModal(false); setSessionName(""); setSessionDesc("");
      setActiveSession(res.data.id);
    },
  });

  const scanMutation = useMutation({
    mutationFn: (invNum: string) =>
      inventoryApi.scanByInventoryNumber(activeSession!, { inventoryNumber: invNum, status: scanStatus }),
    onSuccess: () => {
      setScanResult({ ok: true, text: "Отмечено успешно" });
      setScanInput("");
      qc.invalidateQueries({ queryKey: ["session-stats", activeSession] });
      qc.invalidateQueries({ queryKey: ["session-items", activeSession] });
      setTimeout(() => setScanResult(null), 2500);
    },
    onError: (err: any) => {
      setScanResult({ ok: false, text: err.response?.data?.message || "Ошибка при сканировании" });
      setTimeout(() => setScanResult(null), 3500);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.closeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-sessions"] }),
  });

  // Создание сессии и сканирование доступны инвентаризатору, закрытие — только admin/accountant
  const canEdit = user && ["admin", "accountant", "inventorizer"].includes(user.role);
  const canClose = user && ["admin", "accountant"].includes(user.role);
  const sessions: InventorySession[] = sessionsData?.data || [];
  const items: InventoryItem[] = sessionItems?.data || [];
  const currentSession = sessions.find(s => s.id === activeSession);

  const handleScan = () => {
    if (scanInput.trim()) scanMutation.mutate(scanInput.trim());
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Инвентаризация">
        {canEdit && (
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setNewModal(true)}>
            Новая сессия
          </Button>
        )}
      </Header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions list */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 px-1">
            Сессии инвентаризации
          </h3>
          {sessions.map(s => {
            const progress = s.totalAssets ? Math.round((s.checkedAssets / s.totalAssets) * 100) : 0;
            const isActive = activeSession === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                className={`card-interactive p-4 cursor-pointer transition-all duration-150 ${isActive ? "ring-2 ring-primary-500/50 border-primary-200 dark:border-primary-800" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <span className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">{s.name}</span>
                  <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                    s.status === "closed"
                      ? "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"
                      : s.status === "in_progress"
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                      : "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-300"
                  }`}>
                    {s.status === "closed" ? "Закрыта" : s.status === "in_progress" ? "В работе" : "Открыта"}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-primary-500 to-violet-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 tabular-nums">
                  {s.checkedAssets} / {s.totalAssets} проверено · {progress}%
                </p>
              </div>
            );
          })}
          {!sessions.length && (
            <div className="card p-8 text-center">
              <ClipboardList className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Нет сессий инвентаризации</p>
            </div>
          )}
        </div>

        {/* Active session panel */}
        {activeSession ? (
          <div className="lg:col-span-2 space-y-4">
            {/* Stats */}
            {sessionStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Всего", value: sessionStats.total, color: "text-gray-900 dark:text-white" },
                  { label: "Проверено", value: sessionStats.checked, color: "text-green-600 dark:text-green-400" },
                  { label: "Не найдено", value: sessionStats.notFound, color: "text-red-500 dark:text-red-400" },
                  { label: "Прогресс", value: `${sessionStats.progress}%`, color: "text-primary-600 dark:text-primary-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="card p-4 text-center">
                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Scan */}
            {canEdit && currentSession?.status !== "closed" && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ScanLine className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Сканирование / ввод номера</h3>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <input
                    className="input flex-1 min-w-[200px]"
                    placeholder="Инвентарный номер или QR-код..."
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleScan(); }}
                    autoFocus
                  />
                  <select className="input w-36" value={scanStatus} onChange={e => setScanStatus(e.target.value as AssetStatus)}>
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <Button
                    size="md" loading={scanMutation.isPending} disabled={!scanInput.trim()}
                    onClick={handleScan}
                    icon={<ScanLine className="w-4 h-4" />}
                  >
                    Отметить
                  </Button>
                </div>
                {scanResult && (
                  <div className={`flex items-center gap-2 text-sm mt-3 font-semibold ${scanResult.ok ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                    {scanResult.ok
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <XCircle className="w-4 h-4" />
                    }
                    {scanResult.text}
                  </div>
                )}
              </div>
            )}

            {/* Items table */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Позиции <span className="text-gray-400 font-normal">({items.length})</span>
                </h3>
                {canClose && currentSession?.status !== "closed" && (
                  <Button
                    variant="secondary" size="sm"
                    loading={closeMutation.isPending}
                    icon={<Lock className="w-3.5 h-3.5" />}
                    onClick={() => closeMutation.mutate(activeSession)}
                  >
                    Закрыть сессию
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800/50 sticky top-0">
                    <tr>
                      <th className="th">Инв. номер</th>
                      <th className="th">Наименование</th>
                      <th className="th">Статус</th>
                      <th className="th">Проверено</th>
                      <th className="th">Кем</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {items.map(item => (
                      <tr key={item.id} className={`tr-hover ${item.isChecked ? "opacity-60" : ""}`}>
                        <td className="td font-mono text-xs text-gray-500 dark:text-slate-400">{item.asset?.inventoryNumber}</td>
                        <td className="td font-medium text-gray-900 dark:text-white max-w-xs truncate">{item.asset?.name}</td>
                        <td className="td"><AssetStatusBadge status={item.status} /></td>
                        <td className="td">
                          {item.isChecked
                            ? <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />Да</span>
                            : <span className="text-gray-400 text-xs">—</span>
                          }
                        </td>
                        <td className="td text-xs text-gray-400 dark:text-slate-500">{item.checkedByName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center">
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-200 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400 dark:text-slate-500">Выберите сессию для работы</p>
            </div>
          </div>
        )}
      </div>

      {/* New session modal */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="Новая сессия инвентаризации">
        <div className="space-y-4">
          <div>
            <label className="label">Название *</label>
            <input className="input" value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Инвентаризация Q1 2026" autoFocus />
          </div>
          <div>
            <label className="label">Описание</label>
            <textarea className="input h-20 resize-none" value={sessionDesc} onChange={e => setSessionDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setNewModal(false)}>Отмена</Button>
            <Button loading={createMutation.isPending} disabled={!sessionName.trim()} onClick={() => createMutation.mutate()}>Создать</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
