"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warehouseApi, downloadBlob } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import { InventoryCheck, WarehouseRef } from "@/types";
import { useScanner } from "@/hooks/useScanner";
import { feedback } from "@/lib/feedback";
import { parseScanCode } from "@/lib/scan-code";
import { useScannerPrefs } from "@/store/scanner-prefs.store";
import {
  Plus, ClipboardCheck, Download, CheckCircle2, ScanLine, AlertTriangle,
  XCircle, Volume2, VolumeX, Keyboard, Filter,
} from "lucide-react";

const norm = (v: string) => v.trim().toLowerCase();
const actualsKey = (checkId: string) => `wh-check-actuals:${checkId}`;
/** Через сколько тишины факт уходит на сервер сам */
const AUTOSAVE_MS = 5000;

export default function ChecksPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canOperate = !!user && ["admin", "accountant", "inventorizer"].includes(user.role);

  const { data: checks } = useQuery<InventoryCheck[]>({ queryKey: ["wh-checks"], queryFn: () => warehouseApi.listChecks().then(r => r.data) });
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Инвентаризация склада">
        {canOperate && <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreateOpen(true)}>Новая инвентаризация</Button>}
      </Header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card overflow-hidden h-fit">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800"><h3 className="font-semibold text-gray-900 dark:text-white">Ведомости</h3></div>
          <div className="divide-y divide-gray-50 dark:divide-slate-800/60">
            {checks?.length ? checks.map(c => (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full text-left px-5 py-3 coarse:py-4 hover:bg-gray-50 dark:hover:bg-slate-800 ${activeId === c.id ? "bg-primary-50 dark:bg-primary-900/20" : ""}`}>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900 dark:text-white">{c.warehouse?.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {c.status === "completed" ? "Завершена" : "В процессе"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{new Date(c.startedAt).toLocaleDateString("ru-RU")}</div>
              </button>
            )) : <div className="px-5 py-10 text-center text-sm text-gray-400"><ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />Инвентаризаций пока нет</div>}
          </div>
        </div>

        <div className="lg:col-span-2">
          {activeId
            // key: смена ведомости пересоздаёт компонент, поэтому факт и
            // указатель поднимаются из хранилища заново, без эффекта на смену id
            ? <ConductCheck key={activeId} id={activeId} canOperate={canOperate} onChanged={() => qc.invalidateQueries({ queryKey: ["wh-checks"] })} />
            : <div className="card p-12 text-center text-gray-400">Выберите ведомость слева</div>}
        </div>
      </div>

      {createOpen && <CreateCheckModal onClose={() => setCreateOpen(false)} onDone={(id) => { qc.invalidateQueries({ queryKey: ["wh-checks"] }); setActiveId(id); setCreateOpen(false); }} />}
    </div>
  );
}

function CreateCheckModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { data: whs } = useQuery<WarehouseRef[]>({ queryKey: ["wh-refs"], queryFn: () => warehouseApi.warehouses().then(r => r.data) });
  const [picked, setPicked] = useState("");
  // Значение выводится, а не проставляется эффектом: эффект, синхронно
  // вызывающий setState, порождает лишний каскад перерисовок
  const warehouseId = picked || whs?.[0]?.id || "";

  const mut = useMutation({
    mutationFn: () => warehouseApi.createCheck(warehouseId),
    onSuccess: (r: any) => { toast.success("Инвентаризация создана"); onDone(r.data.check.id); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Ошибка"),
  });

  return (
    <Modal open onClose={onClose} title="Новая инвентаризация">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Будет создан снимок учётных остатков по складу (количественный учёт). Затем внесите фактические количества.</p>
        <div><label className="label">Склад</label>
          <select className="input" value={warehouseId} onChange={e => setPicked(e.target.value)}>{whs?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </div>
        <div className="flex gap-3 justify-end"><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={mut.isPending} disabled={!warehouseId} onClick={() => mut.mutate()}>Создать</Button></div>
      </div>
    </Modal>
  );
}

type BannerKind = "success" | "error";
interface Banner { kind: BannerKind; title: string; detail?: string }

function loadActuals(checkId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(actualsKey(checkId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function ConductCheck({ id, canOperate, onChanged }: { id: string; canOperate: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const { muted, setMuted } = useScannerPrefs();
  const { data } = useQuery<{ check: InventoryCheck; items: any[] }>({
    queryKey: ["wh-check", id],
    queryFn: () => warehouseApi.getCheck(id).then(r => r.data),
  });

  /**
   * Факт хранится локально и переживает перезагрузку.
   * Раньше он жил только в состоянии компонента и пропадал целиком при
   * обновлении страницы или случайном уходе — на пересчёте большого склада
   * это означало начать заново.
   */
  const [actuals, setActuals] = useState<Record<string, string>>(() => loadActuals(id));
  const [armed, setArmed] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [manual, setManual] = useState("");
  const [confirmDone, setConfirmDone] = useState(false);
  const bannerTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      if (Object.keys(actuals).length) localStorage.setItem(actualsKey(id), JSON.stringify(actuals));
      else localStorage.removeItem(actualsKey(id));
    } catch {
      // Приватный режим или переполнение — работе мешать не должно
    }
  }, [actuals, id]);

  const done = data?.check.status === "completed";
  const items = useMemo(() => data?.items ?? [], [data]);

  const index = useMemo(() => {
    const map = new Map<string, any>();
    for (const it of items) {
      map.set(it.itemId, it);
      if (it.sku) map.set(norm(it.sku), it);
      if (it.barcode) map.set(norm(it.barcode), it);
    }
    return map;
  }, [items]);

  /** Сколько строк расходится с сохранённым на сервере */
  const unsaved = useMemo(
    () => items.filter(it => {
      const local = actuals[it.itemId];
      if (local === undefined || local === "") return false;
      return Number(local) !== (it.actualQty ?? null);
    }).length,
    [items, actuals],
  );

  const saveMut = useMutation({
    mutationFn: () => warehouseApi.submitCheck(
      id,
      items
        .filter(it => actuals[it.itemId] !== undefined && actuals[it.itemId] !== "")
        .map(it => ({ itemId: it.itemId, actualQty: Number(actuals[it.itemId]) })),
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh-check", id] }),
    onError: (e: any) => toast.error(e?.friendlyMessage || e.response?.data?.message || "Не удалось сохранить факт"),
  });

  // Автосохранение: submit идемпотентен (update по паре checkId+itemId),
  // поэтому повторные вызовы безопасны
  useEffect(() => {
    if (done || !canOperate || unsaved === 0) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveMut.mutate(), AUTOSAVE_MS);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actuals, unsaved, done, canOperate]);

  const showBanner = useCallback((next: Banner) => {
    setBanner(next);
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), next.kind === "success" ? 2000 : 4000);
  }, []);

  /** Скан позиции = +1 к её факту: повторный скан той же коробки и есть пересчёт. */
  const handleCode = useCallback((raw: string) => {
    if (done || !canOperate) return;
    const parsed = parseScanCode(raw);
    const found = (parsed.id ? index.get(parsed.id) : undefined) ?? index.get(norm(parsed.key));

    if (!found) {
      feedback.error();
      showBanner({
        kind: "error",
        title: "Нет в этой ведомости",
        detail: `${parsed.key} — либо позиция с поштучным учётом (в ведомость они не попадают), либо она числится за другим складом`,
      });
      return;
    }

    setActuals(prev => {
      const next = Number(prev[found.itemId] ?? 0) + 1;
      feedback.success();
      showBanner({ kind: "success", title: found.name, detail: `+1 → ${next} ${found.unit || ""}`.trim() });
      return { ...prev, [found.itemId]: String(next) };
    });
  }, [done, canOperate, index, showBanner]);

  useScanner({
    onScan: (s) => handleCode(s.code),
    enabled: armed && !done && canOperate,
    // Окно подавления повтора здесь короче общего (1200 мс): на пересчёте
    // повторный скан ОДНОЙ И ТОЙ ЖЕ этикетки — это и есть способ считать
    // одинаковые коробки, а не ошибка. 400 мс по-прежнему отсекают повторное
    // чтение при удержанном курке, но не мешают считать быстро.
    // Точную границу стоит уточнить замерами на живом устройстве.
    config: { dedupeWindowMs: 400 },
  });

  const completeMut = useMutation({
    mutationFn: () => warehouseApi.completeCheck(id),
    onSuccess: (r: any) => {
      toast.success(`Проведено корректировок: ${r.data.adjustments}`);
      try { localStorage.removeItem(actualsKey(id)); } catch { /* не критично */ }
      qc.invalidateQueries({ queryKey: ["wh-check", id] });
      qc.invalidateQueries({ queryKey: ["wh-items"] });
      onChanged();
      setConfirmDone(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Ошибка"),
  });

  const exportSheet = async () => {
    const { data: blob } = await warehouseApi.exportInventory(id);
    downloadBlob(blob, `inventory-${id.slice(0, 8)}.xlsx`);
  };

  if (!data) return <div className="card p-12 text-center text-gray-400">Загрузка…</div>;

  const visible = onlyUncounted
    ? items.filter(it => (done ? it.actualQty === null : (actuals[it.itemId] ?? "") === ""))
    : items;
  const counted = items.filter(it => (done ? it.actualQty !== null : (actuals[it.itemId] ?? "") !== "")).length;

  return (
    <div className="space-y-4">
      {/* Сканирование */}
      {!done && canOperate && (
        <div className="card p-5 space-y-4">
          {!armed ? (
            <button onClick={async () => { await feedback.unlock(); setArmed(true); }}
              className="w-full py-6 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary-400 transition-colors">
              <ScanLine className="w-10 h-10 text-primary-600" />
              <span className="text-lg font-semibold">Начать пересчёт сканером</span>
              <span className="text-xs text-gray-500 dark:text-slate-400 max-w-sm text-center">
                Каждый скан прибавляет единицу к факту позиции. Сканируйте коробки подряд —
                попадать в поле не нужно. Факт сохраняется сам.
              </span>
            </button>
          ) : (
            <>
              <div className={`rounded-xl px-4 py-4 min-h-[76px] flex items-center gap-3 transition-colors ${
                banner?.kind === "success" ? "bg-emerald-500 text-white"
                : banner?.kind === "error" ? "bg-red-600 text-white"
                : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"}`}>
                {banner?.kind === "success" ? <CheckCircle2 className="w-7 h-7 flex-shrink-0" />
                  : banner?.kind === "error" ? <XCircle className="w-7 h-7 flex-shrink-0" />
                  : <ScanLine className="w-7 h-7 flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="text-lg font-bold leading-tight truncate">{banner ? banner.title : "Готов к пересчёту"}</div>
                  {banner?.detail && <div className="text-sm opacity-90 truncate">{banner.detail}</div>}
                </div>
                <div className="ml-auto text-right flex-shrink-0">
                  <div className="text-3xl font-bold tabular-nums">{counted}<span className="text-lg opacity-70">/{items.length}</span></div>
                  <div className="text-[11px] opacity-80">посчитано</div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pl-9" placeholder="Ввести артикул вручную" value={manual}
                    onChange={e => setManual(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && manual.trim()) { handleCode(manual.trim()); setManual(""); } }} />
                </div>
                <Button variant="secondary" disabled={!manual.trim()} onClick={() => { handleCode(manual.trim()); setManual(""); }}>
                  Посчитать
                </Button>
                <button onClick={() => setMuted(!muted)} className="btn-secondary" title="Звук">
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

            </>
          )}
        </div>
      )}

      {/* Ведомость */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900 dark:text-white">{data.check.warehouse?.name} — {done ? "завершена" : "ввод факта"}</h3>
          <div className="flex items-center gap-2">
            <Button variant={onlyUncounted ? "primary" : "secondary"} size="xs" icon={<Filter className="w-3.5 h-3.5" />}
              onClick={() => setOnlyUncounted(v => !v)}>
              Только непосчитанные
            </Button>
            <Button variant="secondary" size="xs" icon={<Download className="w-3.5 h-3.5" />} onClick={exportSheet}>Ведомость</Button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 sticky top-0"><tr>
              <th className="th">Позиция</th><th className="th text-right">Учёт</th><th className="th text-right w-28">Факт</th><th className="th text-right">Расхождение</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
              {visible.map(it => {
                const actual = done ? it.actualQty : (actuals[it.itemId] ?? "");
                const diff = actual !== "" && actual !== null ? Number(actual) - it.expectedQty : null;
                return (
                  <tr key={it.id}>
                    <td className="td font-medium text-gray-900 dark:text-white">
                      {it.name}
                      <span className="block text-[11px] font-mono text-gray-400">{it.sku}</span>
                    </td>
                    <td className="td text-right tabular-nums text-gray-500">{it.expectedQty}</td>
                    <td className="td text-right">
                      {done ? <span className="tabular-nums">{it.actualQty ?? "—"}</span> :
                        <input type="number" className="input py-1 text-right w-24" value={actuals[it.itemId] ?? ""}
                          onChange={e => setActuals(a => ({ ...a, [it.itemId]: e.target.value }))} />}
                    </td>
                    <td className={`td text-right tabular-nums font-medium ${diff ? (diff > 0 ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>
                      {diff !== null && diff !== 0 ? (diff > 0 ? "+" : "") + diff : "—"}
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr><td className="td text-center text-gray-400 py-8" colSpan={4}>
                  {onlyUncounted ? "Непосчитанных позиций не осталось" : "По складу нет позиций количественного учёта"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!done && canOperate && (
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100 dark:border-slate-800 flex-wrap">
            {/* Показывается всегда, а не только при включённом сканере: факт
                вводят и руками, и после перезагрузки страницы человек должен
                видеть, что часть значений ещё не на сервере */}
            <span className="text-xs mr-auto">
              {saveMut.isPending
                ? <span className="text-gray-500">Сохраняем…</span>
                : unsaved > 0
                  ? <span className="text-amber-600 dark:text-amber-400 font-semibold">Не сохранено строк: {unsaved} — сохранится само</span>
                  : <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Всё сохранено</span>}
            </span>
            <Button variant="secondary" loading={saveMut.isPending} disabled={unsaved === 0} onClick={() => saveMut.mutate()}>Сохранить факт</Button>
            <Button icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => setConfirmDone(true)}>Завершить</Button>
          </div>
        )}
      </div>

      {/* Завершение: раньше был системный confirm() — по нему трудно попасть
          пальцем, и браузер умеет его подавлять */}
      <Modal open={confirmDone} onClose={() => setConfirmDone(false)} title="Завершить инвентаризацию?">
        <div className="space-y-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div className="text-sm text-gray-600 dark:text-slate-300 space-y-2">
              <p>Расхождения будут проведены корректировочными движениями. Отменить это можно будет только сторнированием.</p>
              {items.length - counted > 0 && (
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Не посчитано позиций: {items.length - counted}. Их факт останется незаполненным, и корректировки по ним не пройдут.
                </p>
              )}
              {unsaved > 0 && <p className="font-semibold">Сначала будет сохранён факт по {unsaved} строкам.</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmDone(false)}>Отмена</Button>
            <Button loading={completeMut.isPending || saveMut.isPending}
              onClick={async () => {
                if (unsaved > 0) await saveMut.mutateAsync();
                completeMut.mutate();
              }}>
              Завершить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
