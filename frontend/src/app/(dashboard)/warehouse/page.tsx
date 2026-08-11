"use client";
import { useCallback, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/store/auth.store";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/store/toast.store";
import { useScanner } from "@/hooks/useScanner";
import { feedback } from "@/lib/feedback";
import { parseScanCode } from "@/lib/scan-code";
import {
  WarehouseItem, ItemCategory, WarehouseRef, ITEM_UNITS,
} from "@/types";
import {
  Search, X, Plus, PackagePlus, AlertTriangle, ScanLine, CheckCircle2,
  XCircle, Loader2, Trash2, Keyboard,
} from "lucide-react";

const LAST_WAREHOUSE_KEY = "wh-last-warehouse";

export default function WarehousePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canManage = !!user && ["admin", "accountant"].includes(user.role);
  const canOperate = !!user && ["admin", "accountant", "inventorizer"].includes(user.role);

  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);
  const [categoryId, setCategoryId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const { data: items, isLoading } = useQuery<WarehouseItem[]>({
    queryKey: ["wh-items", debounced, categoryId, lowOnly],
    queryFn: () => warehouseApi.listItems({
      search: debounced || undefined, categoryId: categoryId || undefined, lowStockOnly: lowOnly || undefined,
    }).then(r => r.data),
  });
  const { data: cats } = useQuery<ItemCategory[]>({ queryKey: ["wh-cats"], queryFn: () => warehouseApi.categories().then(r => r.data) });

  const [showCreate, setShowCreate] = useState(false);
  const [receiptItem, setReceiptItem] = useState<WarehouseItem | null>(null);

  const hasFilters = !!(search || categoryId || lowOnly);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Склад — остатки">
        {canOperate && (
          <Button size="sm" variant="secondary" icon={<PackagePlus className="w-3.5 h-3.5" />} onClick={() => setReceiptItem(items?.[0] ?? null)}>
            Принять на склад
          </Button>
        )}
        {canManage && (
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowCreate(true)}>
            Новая позиция
          </Button>
        )}
      </Header>

      <div className="p-6 flex flex-col gap-4">
        <div className="card p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input className="input pl-10" placeholder="Поиск по названию или артикулу…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input w-56" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Все категории</option>
              {cats?.map(c => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 cursor-pointer select-none">
              <input type="checkbox" className="rounded border-gray-300 text-primary-600" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />
              Только с низким остатком
            </label>
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setSearch(""); setCategoryId(""); setLowOnly(false); }}>
                Сбросить
              </Button>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                <tr>
                  <th className="th">Артикул</th>
                  <th className="th">Наименование</th>
                  <th className="th hidden md:table-cell">Категория</th>
                  <th className="th hidden lg:table-cell">Учёт</th>
                  <th className="th text-right">Остаток</th>
                  <th className="th text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                {isLoading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i}><td className="td" colSpan={6}><div className="skeleton h-4 w-full" /></td></tr>
                  ))
                ) : !items?.length ? (
                  <tr><td className="td text-center text-gray-400 py-16" colSpan={6}>
                    {hasFilters ? "Ничего не найдено" : "Номенклатура пуста — добавьте позицию"}
                  </td></tr>
                ) : items.map(it => (
                  <tr key={it.id} className="tr-hover cursor-pointer" onClick={() => router.push(`/warehouse/${it.id}`)}>
                    <td className="td font-mono text-xs text-gray-500 dark:text-slate-400">{it.sku}</td>
                    <td className="td font-semibold text-gray-900 dark:text-white">
                      {it.name}
                      {it.belowMin && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3 h-3" /> ниже минимума
                        </span>
                      )}
                    </td>
                    <td className="td text-gray-500 dark:text-slate-400 hidden md:table-cell">{it.categoryName || "—"}</td>
                    <td className="td hidden lg:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${it.isSerialized ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                        {it.isSerialized ? "поштучный" : "количественный"}
                      </span>
                    </td>
                    <td className={`td text-right tabular-nums font-semibold ${it.belowMin ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-white"}`}>
                      {it.balance} <span className="text-xs text-gray-400 font-normal">{it.unit}</span>
                    </td>
                    <td className="td text-right" onClick={e => e.stopPropagation()}>
                      {canOperate && (
                        <Button variant="ghost" size="xs" icon={<PackagePlus className="w-3.5 h-3.5" />} onClick={() => setReceiptItem(it)}>
                          Принять
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreate && <CreateItemModal cats={cats || []} onClose={() => setShowCreate(false)} onDone={() => { qc.invalidateQueries({ queryKey: ["wh-items"] }); setShowCreate(false); }} />}
      {receiptItem && <ReceiptModal item={receiptItem} items={items || []} onClose={() => setReceiptItem(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["wh-items"] }); setReceiptItem(null); }} />}
    </div>
  );
}

// ── Модалка: новая позиция номенклатуры ──────────────────────────────────────
function CreateItemModal({ cats, onClose, onDone }: { cats: ItemCategory[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ sku: "", name: "", categoryId: "", unit: "шт", isSerialized: false, minStock: "", manufacturer: "", model: "" });
  const set = (k: string, v: any) => setF(s => ({ ...s, [k]: v }));
  const mut = useMutation({
    mutationFn: () => warehouseApi.createItem({
      sku: f.sku, name: f.name, categoryId: f.categoryId || undefined, unit: f.unit,
      isSerialized: f.isSerialized, minStock: f.minStock ? Number(f.minStock) : undefined,
      manufacturer: f.manufacturer || undefined, model: f.model || undefined,
    }),
    onSuccess: () => { toast.success("Позиция создана"); onDone(); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Не удалось создать позицию"),
  });
  return (
    <Modal open onClose={onClose} title="Новая позиция номенклатуры">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Артикул *</label><input className="input" value={f.sku} onChange={e => set("sku", e.target.value)} /></div>
          <div><label className="label">Единица</label>
            <select className="input" value={f.unit} onChange={e => set("unit", e.target.value)}>{ITEM_UNITS.map(u => <option key={u}>{u}</option>)}</select>
          </div>
        </div>
        <div><label className="label">Наименование *</label><input className="input" value={f.name} onChange={e => set("name", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Категория</label>
            <select className="input" value={f.categoryId} onChange={e => set("categoryId", e.target.value)}>
              <option value="">Не выбрано</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Точка заказа (мин. остаток)</label><input type="number" className="input" value={f.minStock} onChange={e => set("minStock", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Производитель</label><input className="input" value={f.manufacturer} onChange={e => set("manufacturer", e.target.value)} /></div>
          <div><label className="label">Модель</label><input className="input" value={f.model} onChange={e => set("model", e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none p-3 rounded-xl bg-gray-50 dark:bg-slate-800/50">
          <input type="checkbox" className="rounded border-gray-300 text-primary-600" checked={f.isSerialized} onChange={e => set("isSerialized", e.target.checked)} />
          <span><b>Поштучный учёт</b> — у каждого экземпляра свой серийный номер (техника, оборудование). Иначе — количественный (расходники).</span>
        </label>
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button loading={mut.isPending} disabled={!f.sku || !f.name} onClick={() => mut.mutate()}>Создать</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Модалка: приём на склад ──────────────────────────────────────────────────

/** Состояние проверки серийного номера в наборе */
type SerialState = "checking" | "free" | "taken" | "unchecked";
interface ScannedSerial {
  serial: string;
  state: SerialState;
  detail?: string;
}

function ReceiptModal({ item, items, onClose, onDone }: { item: WarehouseItem; items: WarehouseItem[]; onClose: () => void; onDone: () => void }) {
  const { data: whs } = useQuery<WarehouseRef[]>({ queryKey: ["wh-refs"], queryFn: () => warehouseApi.warehouses().then(r => r.data) });
  const [itemId, setItemId] = useState(item.id);
  const current = items.find(i => i.id === itemId) || item;

  // Склад запоминается: оператор весь день принимает на один и тот же.
  // Значение выводится, а не проставляется эффектом или (как было раньше)
  // вызовом setState прямо во время рендера.
  const [pickedWh, setPickedWh] = useState("");
  const remembered = typeof window !== "undefined" ? localStorage.getItem(LAST_WAREHOUSE_KEY) : null;
  const warehouseId = pickedWh
    || (remembered && whs?.some(w => w.id === remembered) ? remembered : "")
    || whs?.[0]?.id || "";

  const [doc, setDoc] = useState("");
  const [qty, setQty] = useState(0);
  const [batch, setBatch] = useState<ScannedSerial[]>([]);
  const [manual, setManual] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const bannerTimer = useRef<number | undefined>(undefined);

  const showBanner = useCallback((kind: "success" | "error", text: string) => {
    setBanner({ kind, text });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), kind === "success" ? 2000 : 4500);
  }, []);

  /**
   * Проверка серийного номера на лету.
   *
   * Приём проводится ОДНОЙ транзакцией на весь набор, поэтому один уже занятый
   * номер валит партию целиком — при двухстах позициях это означает начать
   * заново. Атомарность правильная и остаётся, а занятые номера ловятся здесь,
   * до отправки. 404 от эндпоинта — это хорошая новость: такого экземпляра
   * ещё нет.
   */
  const checkSerial = useCallback(async (serial: string) => {
    const mark = (state: SerialState, detail?: string) =>
      setBatch(b => b.map(x => (x.serial === serial ? { ...x, state, detail } : x)));
    try {
      const { data: unit } = await warehouseApi.scanUnit(serial);
      const where =
        unit.status === "issued" ? `уже выдан: ${unit.currentHolder?.fullName || "сотруднику"}`
        : unit.status === "in_stock" ? `уже на складе${unit.warehouse?.name ? ` «${unit.warehouse.name}»` : ""}`
        : unit.status === "written_off" ? "числится списанным"
        : unit.status === "in_repair" ? "числится в ремонте"
        : "уже заведён";
      mark("taken", where);
      feedback.error();
      showBanner("error", `${serial} — ${where}`);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) mark("free");
      else if (status === 409) { mark("taken", "подходит нескольким позициям"); feedback.error(); }
      else mark("unchecked", "проверить не удалось");
    }
  }, [showBanner]);

  const bump = useCallback(() => {
    setQty(q => {
      const next = q + 1;
      feedback.success();
      showBanner("success", `+1 → ${next} ${current.unit || ""}`.trim());
      return next;
    });
  }, [current.unit, showBanner]);

  /** Разбор скана: смысл кода зависит от режима учёта позиции. */
  const handleCode = useCallback(async (raw: string) => {
    const parsed = parseScanCode(raw);
    const code = parsed.key;

    if (!current.isSerialized) {
      // Количественный учёт: скан этикетки позиции = +1.
      // Артикул и идентификатор сверяем на месте, а штрихкод приходится
      // разрешать на сервере: список позиций отдаёт проекцию без barcode.
      if (parsed.id === current.id || code.toLowerCase() === current.sku?.toLowerCase()) {
        bump();
        return;
      }
      try {
        const { data: found } = await warehouseApi.scanItem(raw);
        if (found.id === current.id) bump();
        else {
          feedback.error();
          showBanner("error", `Это «${found.name}», а принимаем «${current.name}». Смените позицию в списке выше.`);
        }
      } catch {
        feedback.error();
        showBanner("error", `${code} — позиция по такому коду не найдена`);
      }
      return;
    }

    // Поштучный учёт: ждём серийный номер экземпляра, а не полочную этикетку
    if (parsed.kind === "item" || code.toLowerCase() === current.sku?.toLowerCase()) {
      feedback.error();
      showBanner("error", "Это этикетка позиции. Отсканируйте серийный номер самого экземпляра.");
      return;
    }
    if (batch.some(b => b.serial.toLowerCase() === code.toLowerCase())) {
      feedback.duplicate();
      showBanner("error", `${code} — уже в этой партии`);
      return;
    }

    setBatch(b => [...b, { serial: code, state: "checking" }]);
    feedback.success();
    showBanner("success", `${code} — добавлен, проверяем…`);
    void checkSerial(code);
  }, [current, batch, checkSerial, showBanner, bump]);

  useScanner({
    onScan: s => void handleCode(s.code),
    enabled: true,
    // Окно подавления повтора зависит от режима учёта, потому что повторный
    // скан значит РАЗНОЕ. При поштучном учёте серийный номер уникален, и
    // второе чтение того же — это дребезг или ошибка, его надо гасить.
    // При количественном повторный скан той же этикетки — это способ
    // пересчитать одинаковые коробки, и длинное окно просто мешает работать.
    config: { dedupeWindowMs: current.isSerialized ? 1200 : 400 },
  });

  const mut = useMutation({
    mutationFn: () => warehouseApi.receipt(current.isSerialized
      ? { itemId, warehouseId, documentNumber: doc || undefined, units: batch.map(b => ({ serialNumber: b.serial })) }
      : { itemId, warehouseId, documentNumber: doc || undefined, quantity: qty }),
    onSuccess: (r: any) => {
      try { localStorage.setItem(LAST_WAREHOUSE_KEY, warehouseId); } catch { /* не критично */ }
      toast.success(`Принято на склад: ${r.data.count} шт.`);
      onDone();
    },
    onError: (e: any) => toast.error(e?.friendlyMessage || e.response?.data?.message || "Не удалось принять"),
  });

  const taken = batch.filter(b => b.state === "taken").length;
  const checking = batch.filter(b => b.state === "checking").length;
  const canSubmit = !!warehouseId && (current.isSerialized ? batch.length > 0 && taken === 0 && checking === 0 : qty > 0);

  return (
    <Modal open onClose={onClose} title="Принять на склад">
      <div className="space-y-4">
        <div><label className="label">Позиция</label>
          <select className="input" value={itemId} onChange={e => { setItemId(e.target.value); setBatch([]); setQty(0); }}>
            {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.isSerialized ? "поштучно" : "кол-во"})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Склад</label>
            <select className="input" value={warehouseId} onChange={e => setPickedWh(e.target.value)}>
              {whs?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div><label className="label">Накладная / документ</label><input className="input" value={doc} onChange={e => setDoc(e.target.value)} /></div>
        </div>

        {/* Плашка результата скана */}
        <div className={`rounded-xl px-4 py-3 min-h-[60px] flex items-center gap-3 text-sm transition-colors ${
          banner?.kind === "success" ? "bg-emerald-500 text-white"
          : banner?.kind === "error" ? "bg-red-600 text-white"
          : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"}`}>
          {banner?.kind === "success" ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            : banner?.kind === "error" ? <XCircle className="w-5 h-5 flex-shrink-0" />
            : <ScanLine className="w-5 h-5 flex-shrink-0" />}
          <span className="font-semibold">
            {banner ? banner.text
              : current.isSerialized ? "Сканируйте серийные номера подряд" : "Сканируйте этикетку — каждый скан прибавит единицу"}
          </span>
        </div>

        {current.isSerialized ? (
          <div>
            <label className="label">
              Серийные номера ({batch.length})
              {taken > 0 && <span className="ml-2 text-red-600 dark:text-red-400">занятых: {taken} — приём не пройдёт</span>}
            </label>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
              {batch.map(b => (
                <span key={b.serial} className={`inline-flex items-center gap-1.5 pl-3 pr-1 py-1 coarse:min-h-11 rounded-xl text-sm font-mono border ${
                  b.state === "taken" ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
                  : b.state === "checking" ? "bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500"
                  : b.state === "unchecked" ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"}`}>
                  {b.state === "checking" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {b.serial}
                  {b.detail && <span className="text-[11px] not-italic opacity-80">({b.detail})</span>}
                  <button onClick={() => setBatch(x => x.filter(y => y.serial !== b.serial))}
                    className="p-1.5 coarse:p-2 rounded-lg hover:bg-black/10" aria-label={`Убрать ${b.serial}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              {!batch.length && <span className="text-sm text-gray-400 px-2 py-1">Пока пусто</span>}
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Количество ({current.unit})</label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setQty(q => Math.max(0, q - 1))}>−</Button>
              <input type="number" className="input text-center w-28 text-lg font-bold" value={qty}
                onChange={e => setQty(Math.max(0, Number(e.target.value) || 0))} />
              <Button variant="secondary" onClick={() => setQty(q => q + 1)}>+</Button>
            </div>
          </div>
        )}

        {/* Ручной ввод — для стёртых наклеек */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Keyboard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder={current.isSerialized ? "Серийный номер вручную" : "Артикул вручную"}
              value={manual} onChange={e => setManual(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && manual.trim()) { handleCode(manual.trim()); setManual(""); } }} />
          </div>
          <Button variant="secondary" disabled={!manual.trim()} onClick={() => { handleCode(manual.trim()); setManual(""); }}>
            Добавить
          </Button>
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button loading={mut.isPending} disabled={!canSubmit} onClick={() => mut.mutate()}>
            Принять{current.isSerialized && batch.length ? ` (${batch.length})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
