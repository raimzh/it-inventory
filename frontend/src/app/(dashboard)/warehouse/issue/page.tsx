"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/store/toast.store";
import { WarehouseItem, WarehouseRef, WarehouseEmployee, StockUnit } from "@/types";
import { IssueAct } from "@/components/warehouse/IssueAct";
import { Search, Plus, Trash2, HandCoins, UserPlus, Printer, PackageSearch } from "lucide-react";

interface CartLine { item: WarehouseItem; quantity: number; unit?: StockUnit; }

export default function IssuePage() {
  const { data: whs } = useQuery<WarehouseRef[]>({ queryKey: ["wh-refs"], queryFn: () => warehouseApi.warehouses().then(r => r.data) });
  const [warehouseId, setWarehouseId] = useState("");
  if (whs && !warehouseId && whs[0]) setWarehouseId(whs[0].id);

  const [employee, setEmployee] = useState<WarehouseEmployee | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [doc, setDoc] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [act, setAct] = useState<null | { employee: WarehouseEmployee; lines: CartLine[]; doc: string; date: string }>(null);

  const addLine = (line: CartLine) => setCart(c => [...c, line]);
  const removeLine = (i: number) => setCart(c => c.filter((_, idx) => idx !== i));

  const issueMut = useMutation({
    mutationFn: () => warehouseApi.issue({
      employeeId: employee!.id, warehouseId, documentNumber: doc || undefined,
      lines: cart.map(l => l.item.isSerialized ? { itemId: l.item.id, stockUnitId: l.unit!.id } : { itemId: l.item.id, quantity: l.quantity }),
    }),
    onSuccess: () => {
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
            <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
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
