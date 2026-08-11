"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { InventorySession, InventoryItem, ASSET_STATUS_LABELS, AssetStatus } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { useScanner } from "@/hooks/useScanner";
import { feedback } from "@/lib/feedback";
import { parseScanCode } from "@/lib/scan-code";
import { useScannerPrefs } from "@/store/scanner-prefs.store";
import {
  Plus, ScanLine, CheckCircle2, XCircle, ClipboardList, Lock, AlertTriangle,
  Volume2, VolumeX, RotateCcw, Keyboard,
} from "lucide-react";

const STATUSES = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];
const PAGE_SIZE = 500;

/** Ключ указателя: регистр и пробелы на этикетках не всегда совпадают с базой */
const norm = (v: string) => v.trim().toLowerCase();

type BannerKind = "success" | "duplicate" | "error";
interface Banner {
  kind: BannerKind;
  title: string;
  detail?: string;
}
interface RecentScan {
  id: string;
  code: string;
  name: string;
  at: number;
}
interface PendingScan {
  code: string;
  status: AssetStatus;
  message: string;
}

const pendingKey = (sessionId: string) => `inventory-pending:${sessionId}`;

function loadPending(sessionId: string): PendingScan[] {
  try {
    const raw = localStorage.getItem(pendingKey(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { muted, setMuted } = useScannerPrefs();

  const [newModal, setNewModal] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionDesc, setSessionDesc] = useState("");
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<AssetStatus>("active");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [counter, setCounter] = useState(0);
  const [manual, setManual] = useState("");
  const [armed, setArmed] = useState(false);
  const bannerTimer = useRef<number | undefined>(undefined);

  const { data: sessionsData } = useQuery({
    queryKey: ["inventory-sessions"],
    queryFn: () => inventoryApi.getSessions({ limit: 20 }).then(r => r.data),
  });

  /**
   * Позиции сессии выгружаются ЦЕЛИКОМ, а не первой страницей.
   * На этом строится локальный указатель, благодаря которому каждый скан
   * разрешается мгновенно и без обращения к сети — а неизвестный код
   * отвергается сразу, не тратя запрос. Раньше грузилось только 100 позиций,
   * и для сессии из нескольких сотен ОС указатель был бы неполным.
   */
  const { data: items = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: ["session-items", activeSession],
    enabled: !!activeSession,
    // Реже, чем было (10 с), и не в фоне: на терминале это расход батареи,
    // а ещё фоновое обновление способно затереть оптимистичную отметку
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const all: InventoryItem[] = [];
      for (let page = 1; ; page++) {
        const res = await inventoryApi.getSessionItems(activeSession!, { page, limit: PAGE_SIZE });
        const chunk: InventoryItem[] = res.data?.data || [];
        all.push(...chunk);
        if (chunk.length < PAGE_SIZE || all.length >= (res.data?.total ?? all.length)) break;
      }
      return all;
    },
  });

  const sessions: InventorySession[] = sessionsData?.data || [];
  const currentSession = sessions.find(s => s.id === activeSession);
  const canEdit = user && ["admin", "accountant", "inventorizer"].includes(user.role);
  const canClose = user && ["admin", "accountant"].includes(user.role);
  const sessionOpen = !!activeSession && currentSession?.status !== "closed";
  const scanReady = !!canEdit && sessionOpen && armed && !itemsLoading;

  /** Статистика считается из уже загруженных позиций — отдельный запрос не нужен */
  const stats = useMemo(() => {
    const total = items.length;
    const checked = items.filter(i => i.isChecked).length;
    const notFound = items.filter(i => i.status === "not_found").length;
    return { total, checked, notFound, progress: total ? Math.round((checked / total) * 100) : 0 };
  }, [items]);

  const index = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      if (item.assetId) map.set(item.assetId, item);
      if (item.asset?.inventoryNumber) map.set(norm(item.asset.inventoryNumber), item);
      if (item.asset?.serialNumber) map.set(norm(item.asset.serialNumber), item);
    }
    return map;
  }, [items]);

  // Сброс при смене сессии — приём из документации React («adjusting state
  // when props change»), а не эффект: React перезапускает компонент сразу,
  // не фиксируя промежуточный кадр, поэтому лишнего каскада перерисовок нет.
  // Несохранённые сканы при этом поднимаются из хранилища: терять
  // отсканированное из-за севшей батареи или ухода со страницы нельзя.
  const [seenSession, setSeenSession] = useState(activeSession);
  if (activeSession !== seenSession) {
    setSeenSession(activeSession);
    setPending(activeSession ? loadPending(activeSession) : []);
    setRecent([]);
    setCounter(0);
    setBanner(null);
  }

  useEffect(() => {
    if (!activeSession) return;
    try {
      if (pending.length) localStorage.setItem(pendingKey(activeSession), JSON.stringify(pending));
      else localStorage.removeItem(pendingKey(activeSession));
    } catch {
      // Приватный режим или переполнение — не повод мешать работе
    }
  }, [pending, activeSession]);

  const showBanner = useCallback((next: Banner) => {
    setBanner(next);
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), next.kind === "success" ? 2500 : 4000);
  }, []);

  const markChecked = useCallback((itemId: string, status: AssetStatus, checked: boolean) => {
    qc.setQueryData<InventoryItem[]>(["session-items", activeSession], old =>
      old?.map(i => i.id === itemId
        ? {
            ...i,
            isChecked: checked,
            status: checked ? status : i.status,
            checkedByName: checked ? (user?.fullName ?? i.checkedByName) : i.checkedByName,
            checkedAt: checked ? new Date().toISOString() : i.checkedAt,
          }
        : i),
    );
  }, [qc, activeSession, user?.fullName]);

  const checkMutation = useMutation({
    mutationFn: ({ assetId, status }: { assetId: string; status: AssetStatus; itemId: string; code: string }) =>
      inventoryApi.checkItem(activeSession!, assetId, { status }),
    onError: (err: any, vars) => {
      // Откатываем отметку: показывать проверенным то, что не сохранилось, нельзя
      markChecked(vars.itemId, vars.status, false);
      setCounter(c => Math.max(0, c - 1));
      const message = err?.friendlyMessage || err?.response?.data?.message || "Не удалось сохранить";
      setPending(p => [...p, { code: vars.code, status: vars.status, message }]);
      feedback.error();
      showBanner({ kind: "error", title: "Не сохранено", detail: message });
    },
  });

  /** Разбор отсканированного кода и решение, что с ним делать. */
  const handleCode = useCallback((raw: string) => {
    if (!scanReady || !activeSession) return;
    const parsed = parseScanCode(raw);
    const found = (parsed.id ? index.get(parsed.id) : undefined) ?? index.get(norm(parsed.key));

    if (!found) {
      feedback.error();
      showBanner({
        kind: "error",
        title: "Нет в этой сессии",
        detail: `${parsed.key} — сессия описывает состав на момент её создания; этой ОС в нём нет`,
      });
      return;
    }

    if (found.isChecked) {
      feedback.duplicate();
      const when = found.checkedAt ? new Date(found.checkedAt).toLocaleTimeString("ru-RU") : "";
      showBanner({
        kind: "duplicate",
        title: "Уже отмечено",
        detail: [found.asset?.name, found.checkedByName, when].filter(Boolean).join(" · "),
      });
      return; // запрос не шлём — на складе это самый частый случай
    }

    feedback.success();
    showBanner({ kind: "success", title: found.asset?.name || parsed.key, detail: found.asset?.inventoryNumber });
    markChecked(found.id, scanStatus, true);
    setCounter(c => c + 1);
    setRecent(r => [{ id: found.id, code: found.asset?.inventoryNumber || parsed.key, name: found.asset?.name || "", at: Date.now() }, ...r].slice(0, 10));
    checkMutation.mutate({ assetId: found.assetId, status: scanStatus, itemId: found.id, code: raw });
  }, [scanReady, activeSession, index, scanStatus, markChecked, showBanner, checkMutation]);

  const { suspended } = useScanner({
    onScan: (scan) => handleCode(scan.code),
    enabled: scanReady,
  });

  const start = async () => {
    await feedback.unlock();
    setArmed(true);
  };

  const retryPending = (entry: PendingScan, at: number) => {
    setPending(p => p.filter((_, i) => i !== at));
    handleCode(entry.code);
  };

  const createMutation = useMutation({
    mutationFn: () => inventoryApi.createSession({ name: sessionName, description: sessionDesc }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inventory-sessions"] });
      setNewModal(false); setSessionName(""); setSessionDesc("");
      setActiveSession(res.data.id);
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.closeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-sessions"] }),
  });

  const bannerStyle: Record<BannerKind, string> = {
    success: "bg-emerald-500 text-white",
    duplicate: "bg-amber-500 text-white",
    error: "bg-red-600 text-white",
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
        {/* Список сессий */}
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
                      : "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-300"
                  }`}>
                    {s.status === "closed" ? "Закрыта" : "Открыта"}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-primary-500 to-violet-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }} />
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

        {activeSession ? (
          <div className="lg:col-span-2 space-y-4">
            {/* Показатели — считаются из загруженных позиций */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Всего", value: stats.total, color: "text-gray-900 dark:text-white" },
                { label: "Проверено", value: stats.checked, color: "text-green-600 dark:text-green-400" },
                { label: "Не найдено", value: stats.notFound, color: "text-red-500 dark:text-red-400" },
                { label: "Прогресс", value: `${stats.progress}%`, color: "text-primary-600 dark:text-primary-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="card p-4 text-center">
                  <div className={`text-2xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {canEdit && sessionOpen && (
              <div className="card p-5 space-y-4">
                {!armed ? (
                  <button onClick={start} disabled={itemsLoading}
                    className="w-full py-6 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary-400 transition-colors disabled:opacity-50">
                    <ScanLine className="w-10 h-10 text-primary-600" />
                    <span className="text-lg font-semibold">
                      {itemsLoading ? "Загружаем состав сессии…" : "Начать сканирование"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400 max-w-sm text-center">
                      Одно нажатие включает звук — браузер на Android иначе его не разрешает.
                      Дальше просто сканируйте, попадать в поле не нужно.
                    </span>
                  </button>
                ) : (
                  <>
                    {/* Крупная плашка результата — её видно, не приглядываясь */}
                    <div className={`rounded-xl px-4 py-4 min-h-[76px] flex items-center gap-3 transition-colors ${
                      banner ? bannerStyle[banner.kind] : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"
                    }`}>
                      {banner?.kind === "success" && <CheckCircle2 className="w-7 h-7 flex-shrink-0" />}
                      {banner?.kind === "duplicate" && <AlertTriangle className="w-7 h-7 flex-shrink-0" />}
                      {banner?.kind === "error" && <XCircle className="w-7 h-7 flex-shrink-0" />}
                      {!banner && <ScanLine className="w-7 h-7 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-lg font-bold leading-tight truncate">
                          {banner ? banner.title : "Готов к сканированию"}
                        </div>
                        {banner?.detail && <div className="text-sm opacity-90 truncate">{banner.detail}</div>}
                      </div>
                      <div className="ml-auto text-right flex-shrink-0">
                        <div className="text-3xl font-bold tabular-nums">{counter}</div>
                        <div className="text-[11px] opacity-80">за сеанс</div>
                      </div>
                    </div>

                    {/* Статус, который проставляется отсканированному */}
                    <div>
                      <div className="label mb-1.5">Отмечать статусом</div>
                      <div className="flex flex-wrap gap-2">
                        {STATUSES.map(([value, label]) => (
                          <button key={value} onClick={() => setScanStatus(value)}
                            className={`px-3.5 py-2 coarse:min-h-11 rounded-xl text-sm font-semibold border transition-colors ${
                              scanStatus === value
                                ? "bg-primary-600 border-primary-600 text-white"
                                : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300"
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ручной ввод — для стёртых наклеек */}
                    <div className="flex gap-2 flex-wrap items-center">
                      <div className="relative flex-1 min-w-[200px]">
                        <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          className="input pl-9"
                          placeholder="Ввести номер вручную"
                          value={manual}
                          onChange={e => setManual(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && manual.trim()) { handleCode(manual.trim()); setManual(""); }
                          }}
                        />
                      </div>
                      <Button variant="secondary" disabled={!manual.trim()}
                        onClick={() => { handleCode(manual.trim()); setManual(""); }}>
                        Отметить
                      </Button>
                      <button onClick={() => setMuted(!muted)} className="btn-secondary" title="Звук">
                        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>

                    {suspended && (
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Курсор в поле ввода — приём со сканера приостановлен. Нажмите вне поля.
                      </p>
                    )}

                    {/* Не сохранённое — ничего не теряем молча */}
                    {pending.length > 0 && (
                      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3">
                        <div className="text-sm font-bold text-red-700 dark:text-red-300 mb-2">
                          Не сохранено: {pending.length}
                        </div>
                        <div className="space-y-1.5">
                          {pending.map((p, i) => (
                            <div key={`${p.code}-${i}`} className="flex items-center gap-2 text-sm">
                              <span className="font-mono flex-1 truncate">{p.code}</span>
                              <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[40%]">{p.message}</span>
                              <Button size="xs" variant="secondary" icon={<RotateCcw className="w-3 h-3" />}
                                onClick={() => retryPending(p, i)}>
                                Повторить
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Последние сканы */}
                    {recent.length > 0 && (
                      <div>
                        <div className="label mb-1.5">Последние отметки</div>
                        <div className="space-y-1">
                          {recent.map(r => (
                            <div key={`${r.id}-${r.at}`} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/60">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                              <span className="font-mono text-xs text-gray-500 dark:text-slate-400">{r.code}</span>
                              <span className="truncate">{r.name}</span>
                              <span className="ml-auto text-xs text-gray-400 tabular-nums">
                                {new Date(r.at).toLocaleTimeString("ru-RU")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Позиции */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Позиции <span className="text-gray-400 font-normal">({items.length})</span>
                </h3>
                {canClose && sessionOpen && (
                  <Button variant="secondary" size="sm" loading={closeMutation.isPending}
                    icon={<Lock className="w-3.5 h-3.5" />}
                    onClick={() => closeMutation.mutate(activeSession)}>
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
                            : <span className="text-gray-400 text-xs">—</span>}
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
