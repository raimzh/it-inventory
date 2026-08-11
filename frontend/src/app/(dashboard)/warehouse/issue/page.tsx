"use client";
import { useCallback, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/store/toast.store";
import { WarehouseItem, WarehouseRef, WarehouseEmployee, StockUnit } from "@/types";
import { IssueAct } from "@/components/warehouse/IssueAct";
import { useScanner } from "@/hooks/useScanner";
import { feedback } from "@/lib/feedback";
import { parseScanCode } from "@/lib/scan-code";
import {
  Search, Plus, Trash2, HandCoins, UserPlus, Printer, PackageSearch,
  ScanLine, CheckCircle2, XCircle, IdCard,
} from "lucide-react";

interface CartLine { item: WarehouseItem; quantity: number; unit?: StockUnit; }

const LAST_WAREHOUSE_KEY = "wh-last-warehouse";

export default function IssuePage() {
  const { data: whs } = useQuery<WarehouseRef[]>({ queryKey: ["wh-refs"], queryFn: () => warehouseApi.warehouses().then(r => r.data) });
  // Значение выводится, а не проставляется вызовом setState прямо в теле
  // компонента, как было раньше: это лишний каскад перерисовок.
  const [pickedWh, setPickedWh] = useState("");
  const remembered = typeof window !== "undefined" ? localStorage.getItem(LAST_WAREHOUSE_KEY) : null;
  const warehouseId = pickedWh
    || (remembered && whs?.some(w => w.id === remembered) ? remembered : "")
    || whs?.[0]?.id || "";

  const [employee, setEmployee] = useState<WarehouseEmployee | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [doc, setDoc] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const bannerTimer = useRef<number | undefined>(undefined);
  const [act, setAct] = useState<null | { employee: WarehouseEmployee; lines: CartLine[]; doc: string; date: string }>(null);

  const addLine = (line: CartLine) => setCart(c => [...c, line]);
  const removeLine = (i: number) => setCart(c => c.filter((_, idx) => idx !== i));

  const showBanner = useCallback((kind: "success" | "error", text: string) => {
    setBanner({ kind, text });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), kind === "success" ? 2200 : 5000);
  }, []);

  /** Скан бейджа: принимаем только ТОЧНОЕ совпадение табельного номера. */
  const resolveEmployee = useCallback(async (code: string) => {
    try {
      const { data: list } = await warehouseApi.listEmployees(code);
      // Поиск на сервере идёт по вхождению подстроки, поэтому строгое равенство
      // проверяем здесь: выдать имущество не тому человеку — реальная цена ошибки.
      const exact = (list as WarehouseEmployee[]).find(
        e => e.personnelNumber && e.personnelNumber.toLowerCase() === code.toLowerCase(),
      );
      if (!exact) {
        feedback.error();
        showBanner("error", `Табельный «${code}» не найден. Выберите сотрудника вручную.`);
        return;
      }
      setEmployee(exact);
      feedback.success();
      showBanner("success", `${exact.fullName}${exact.position ? ` · ${exact.position}` : ""}`);
    } catch {
      feedback.error();
      showBanner("error", "Не удалось найти сотрудника — проверьте связь");
    }
  }, [showBanner]);

  /** Код позиции (штрихкод, артикул или QR полки) — только количественный учёт. */
  const addByItemCode = useCallback(async (raw: string) => {
    try {
      const { data: item } = await warehouseApi.scanItem(raw);
      if (item.isSerialized) {
        feedback.error();
        showBanner("error", `«${item.name}» — поштучный учёт. Отсканируйте серийный номер самого экземпляра.`);
        return;
      }
      setCart(c => {
        const at = c.findIndex(l => l.item.id === item.id && !l.unit);
        if (at >= 0) {
          const next = [...c];
          next[at] = { ...next[at], quantity: next[at].quantity + 1 };
          feedback.success();
          showBanner("success", `${item.name} — теперь ${next[at].quantity} ${item.unit || ""}`.trim());
          return next;
        }
        feedback.success();
        showBanner("success", `${item.name} — добавлено 1 ${item.unit || ""}`.trim());
        return [...c, { item: { ...item, balance: item.balance ?? 0, belowMin: false, minStock: item.minStock ?? null }, quantity: 1 }];
      });
    } catch {
      feedback.error();
      showBanner("error", `Код «${raw}» не опознан: ни экземпляр, ни позиция`);
    }
  }, [showBanner]);

  /**
   * Разбор скана. Пока сотрудник не выбран — код читается как бейдж,
   * дальше — как позиция к выдаче. Так одним сканером проходится весь путь.
   */
  const handleCode = useCallback(async (raw: string) => {
    if (!employee) { await resolveEmployee(parseScanCode(raw).key); return; }

    const parsed = parseScanCode(raw);
    // Этикетка полки — заведомо позиция, экземпляр по ней искать незачем
    if (parsed.kind === "item") { await addByItemCode(raw); return; }

    try {
      const { data: unit } = await warehouseApi.scanUnit(raw);
      if (cart.some(l => l.unit?.id === unit.id)) {
        feedback.duplicate();
        showBanner("error", `S/N ${unit.serialNumber} — уже в корзине`);
        return;
      }
      if (unit.status !== "in_stock") {
        // Ради этого сообщения сканирование здесь и нужно: оператор сразу
        // видит не «нельзя», а У КОГО вещь.
        const where = unit.status === "issued"
          ? `уже выдан: ${unit.currentHolder?.fullName || "сотруднику"}`
          : unit.status === "in_repair" ? "числится в ремонте" : "числится списанным";
        feedback.error();
        showBanner("error", `S/N ${unit.serialNumber} — ${where}`);
        return;
      }
      if (warehouseId && unit.warehouseId && unit.warehouseId !== warehouseId) {
        feedback.error();
        showBanner("error", `S/N ${unit.serialNumber} числится за складом «${unit.warehouse?.name || "другим"}»`);
        return;
      }
      const item = unit.item || {};
      addLine({
        item: {
          id: unit.itemId, sku: item.sku || "", name: item.name || "Позиция", unit: item.unit || "шт",
          isSerialized: true, minStock: null, balance: 0, belowMin: false,
        },
        quantity: 1,
        unit,
      });
      feedback.success();
      showBanner("success", `${item.name || "Экземпляр"} · S/N ${unit.serialNumber}`);
    } catch (e: any) {
      // 404 от поиска экземпляра означает «такого серийника нет» —
      // возможно, отсканирована этикетка позиции количественного учёта
      if (e?.response?.status === 404) { await addByItemCode(raw); return; }
      feedback.error();
      showBanner("error", e?.friendlyMessage || "Не удалось разобрать код");
    }
  }, [employee, cart, warehouseId, resolveEmployee, addByItemCode, showBanner]);

  useScanner({ onScan: s => void handleCode(s.code), enabled: armed });

  const issueMut = useMutation({
    mutationFn: () => warehouseApi.issue({
      employeeId: employee!.id, warehouseId, documentNumber: doc || undefined,
      lines: cart.map(l => l.item.isSerialized ? { itemId: l.item.id, stockUnitId: l.unit!.id } : { itemId: l.item.id, quantity: l.quantity }),
    }),
    onSuccess: () => {
      try { localStorage.setItem(LAST_WAREHOUSE_KEY, warehouseId); } catch { /* не критично */ }
      toast.success(`Выдано позиций: ${cart.length}`);
      setAct({ employee: employee!, lines: cart, doc, date: new Date().toLocaleDateString("ru-RU") });
      setCart([]); setDoc("");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "Не удалось провести выдачу"),
  });

  const canIssue = employee && warehouseId && cart.length > 0;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Выдача сотруднику" />

      {/* Сканирование: один сканер проходит весь путь — сначала бейдж
          сотрудника, затем вещи. Что означает код, определяется тем,
          выбран ли уже сотрудник. */}
      <div className="px-6 pt-5">
        {!armed ? (
          <button onClick={async () => { await feedback.unlock(); setArmed(true); }}
            className="w-full py-4 flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 hover:border-primary-400 transition-colors">
            <ScanLine className="w-6 h-6 text-primary-600" />
            <span className="font-semibold">Включить сканер</span>
            <span className="text-xs text-gray-500 dark:text-slate-400">
              сначала бейдж сотрудника, потом серийные номера вещей
            </span>
          </button>
        ) : (
          <div className={`rounded-xl px-4 py-3 min-h-[64px] flex items-center gap-3 transition-colors ${
            banner?.kind === "success" ? "bg-emerald-500 text-white"
            : banner?.kind === "error" ? "bg-red-600 text-white"
            : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"}`}>
            {banner?.kind === "success" ? <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
              : banner?.kind === "error" ? <XCircle className="w-6 h-6 flex-shrink-0" />
              : employee ? <ScanLine className="w-6 h-6 flex-shrink-0" /> : <IdCard className="w-6 h-6 flex-shrink-0" />}
            <span className="font-semibold min-w-0 truncate">
              {banner ? banner.text
                : employee ? "Сканируйте вещи к выдаче" : "Отсканируйте бейдж сотрудника"}
            </span>
            {employee && (
              <span className="ml-auto text-sm opacity-90 flex-shrink-0">в корзине: {cart.length}</span>
            )}
          </div>
        )}
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Левая колонка: сотрудник + склад */}
        <div className="card p-5 space-y-4 h-fit">
          <div>
            <label className="label">Сотрудник</label>
            {employee ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary-50 dark:bg-primary-900/20">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{employee.fullName}</div>
                  <div className="text-xs text-gray-500">{employee.position || employee.department?.name || ""}</div>
                </div>
                <Button variant="ghost" size="xs" onClick={() => setEmployee(null)}>Сменить</Button>
              </div>
            ) : (
              <Button variant="secondary" className="w-full" icon={<Search className="w-4 h-4" />} onClick={() => setEmpOpen(true)}>
                Выбрать сотрудника
              </Button>
            )}
          </div>
          <div>
            <label className="label">Склад</label>
            <select className="input" value={warehouseId} onChange={e => setPickedWh(e.target.value)}>
              {whs?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Документ / заявка</label>
            <input className="input" value={doc} onChange={e => setDoc(e.target.value)} placeholder="№ заявки, необязательно" />
          </div>
        </div>

        {/* Правая колонка: корзина */}
        <div className="card p-5 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Корзина выдачи</h3>
            <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setPickOpen(true)}>Добавить позицию</Button>
          </div>
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-12 gap-2">
              <PackageSearch className="w-10 h-10 opacity-40" />
              <p className="text-sm">Добавьте позиции к выдаче</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">{l.item.name}</div>
                    <div className="text-xs text-gray-500">
                      {l.item.isSerialized ? `S/N ${l.unit?.serialNumber}` : `${l.quantity} ${l.item.unit}`}
                    </div>
                  </div>
                  <button className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => removeLine(i)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 mt-auto">
            {act && (
              <Button variant="secondary" icon={<Printer className="w-4 h-4" />} onClick={() => setAct({ ...act })}>Печать акта</Button>
            )}
            <Button icon={<HandCoins className="w-4 h-4" />} loading={issueMut.isPending} disabled={!canIssue} onClick={() => issueMut.mutate()}>
              Выдать{cart.length > 0 ? ` (${cart.length})` : ""}
            </Button>
          </div>
        </div>
      </div>

      {empOpen && <EmployeePicker onClose={() => setEmpOpen(false)} onPick={(e) => { setEmployee(e); setEmpOpen(false); }} />}
      {pickOpen && <ItemPicker warehouseId={warehouseId} onClose={() => setPickOpen(false)} onAdd={(l) => { addLine(l); setPickOpen(false); }} />}
      {act && <IssueAct data={act} onClose={() => setAct(null)} />}
    </div>
  );
}

// ── Выбор сотрудника (поиск + создание) ──────────────────────────────────────
function EmployeePicker({ onClose, onPick }: { onClose: () => void; onPick: (e: WarehouseEmployee) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const { data: emps, refetch } = useQuery<WarehouseEmployee[]>({
    queryKey: ["wh-emps", debounced], queryFn: () => warehouseApi.listEmployees(debounced || undefined).then(r => r.data),
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const createMut = useMutation({
    mutationFn: () => warehouseApi.createEmployee({ fullName: name }),
    onSuccess: (r: any) => { toast.success("Сотрудник добавлен"); onPick(r.data); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Ошибка"),
  });
  return (
    <Modal open onClose={onClose} title="Выбор сотрудника">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input autoFocus className="input pl-10" placeholder="Поиск по ФИО или табельному…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="max-h-64 overflow-auto divide-y divide-gray-100 dark:divide-slate-800 border border-gray-100 dark:border-slate-800 rounded-xl">
          {emps?.length ? emps.map(e => (
            <button key={e.id} onClick={() => onPick(e)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800">
              <div className="font-medium text-gray-900 dark:text-white">{e.fullName}</div>
              <div className="text-xs text-gray-500">{e.position || e.department?.name || ""}</div>
            </button>
          )) : <div className="px-4 py-6 text-center text-sm text-gray-400">Не найдено</div>}
        </div>
        {creating ? (
          <div className="flex gap-2">
            <input autoFocus className="input" placeholder="ФИО нового сотрудника" value={name} onChange={e => setName(e.target.value)} />
            <Button loading={createMut.isPending} disabled={!name.trim()} onClick={() => createMut.mutate()}>Добавить</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" icon={<UserPlus className="w-4 h-4" />} onClick={() => setCreating(true)}>Добавить нового сотрудника</Button>
        )}
      </div>
    </Modal>
  );
}

// ── Выбор позиции для корзины ────────────────────────────────────────────────
function ItemPicker({ warehouseId, onClose, onAdd }: { warehouseId: string; onClose: () => void; onAdd: (l: CartLine) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const { data: items } = useQuery<WarehouseItem[]>({
    queryKey: ["wh-items-pick", debounced], queryFn: () => warehouseApi.listItems({ search: debounced || undefined }).then(r => r.data),
  });
  const [selected, setSelected] = useState<WarehouseItem | null>(null);
  const [qty, setQty] = useState("1");
  const [unitId, setUnitId] = useState("");
  const { data: units } = useQuery<StockUnit[]>({
    queryKey: ["wh-avail", selected?.id], enabled: !!selected?.isSerialized,
    queryFn: () => warehouseApi.availableUnits(selected!.id).then(r => r.data),
  });

  const add = () => {
    if (!selected) return;
    if (selected.isSerialized) {
      const u = units?.find(x => x.id === unitId);
      if (!u) { toast.error("Выберите экземпляр"); return; }
      onAdd({ item: selected, quantity: 1, unit: u });
    } else {
      const q = Number(qty);
      if (!(q > 0)) { toast.error("Укажите количество"); return; }
      if (q > selected.balance) { toast.error(`На складе только ${selected.balance} ${selected.unit}`); return; }
      onAdd({ item: selected, quantity: q });
    }
  };

  return (
    <Modal open onClose={onClose} title="Добавить позицию">
      <div className="space-y-3">
        {!selected ? (
          <>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input autoFocus className="input pl-10" placeholder="Поиск позиции…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="max-h-72 overflow-auto divide-y divide-gray-100 dark:divide-slate-800 border border-gray-100 dark:border-slate-800 rounded-xl">
              {items?.filter(i => i.balance > 0 || i.isSerialized).map(i => (
                <button key={i.id} onClick={() => { setSelected(i); setUnitId(""); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 flex justify-between items-center">
                  <span className="font-medium text-gray-900 dark:text-white">{i.name}</span>
                  <span className="text-xs text-gray-500 tabular-nums">{i.balance} {i.unit}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/50">
              <div className="font-semibold text-gray-900 dark:text-white">{selected.name}</div>
              <div className="text-xs text-gray-500">Доступно: {selected.balance} {selected.unit}</div>
            </div>
            {selected.isSerialized ? (
              <div>
                <label className="label">Экземпляр</label>
                <select className="input" value={unitId} onChange={e => setUnitId(e.target.value)}>
                  <option value="">— выберите —</option>
                  {units?.map(u => <option key={u.id} value={u.id}>S/N {u.serialNumber}{u.inventoryNumber ? ` · инв. ${u.inventoryNumber}` : ""}</option>)}
                </select>
                {units && units.length === 0 && <p className="text-xs text-amber-600 mt-1">Нет доступных экземпляров на складе</p>}
              </div>
            ) : (
              <div><label className="label">Количество ({selected.unit})</label><input autoFocus type="number" className="input" value={qty} onChange={e => setQty(e.target.value)} /></div>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setSelected(null)}>← Назад</Button>
              <Button onClick={add}>Добавить в корзину</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
