"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/store/auth.store";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/store/toast.store";
import {
  WarehouseItem, ItemCategory, WarehouseRef, ITEM_UNITS,
} from "@/types";
import { Search, X, Plus, PackagePlus, Warehouse as WhIcon, AlertTriangle } from "lucide-react";

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
function ReceiptModal({ item, items, onClose, onDone }: { item: WarehouseItem; items: WarehouseItem[]; onClose: () => void; onDone: () => void }) {
  const { data: whs } = useQuery<WarehouseRef[]>({ queryKey: ["wh-refs"], queryFn: () => warehouseApi.warehouses().then(r => r.data) });
  const [itemId, setItemId] = useState(item.id);
  const current = items.find(i => i.id === itemId) || item;
  const [warehouseId, setWarehouseId] = useState("");
  const [doc, setDoc] = useState("");
  const [qty, setQty] = useState("1");
  const [serials, setSerials] = useState("");

  if (whs && !warehouseId && whs[0]) setWarehouseId(whs[0].id);

  const mut = useMutation({
    mutationFn: () => warehouseApi.receipt(current.isSerialized
      ? { itemId, warehouseId, documentNumber: doc || undefined, units: serials.split("\n").map(s => s.trim()).filter(Boolean).map(s => ({ serialNumber: s })) }
      : { itemId, warehouseId, documentNumber: doc || undefined, quantity: Number(qty) }),
    onSuccess: (r: any) => { toast.success(`Принято на склад: ${r.data.count} шт.`); onDone(); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Не удалось принять"),
  });

  const serialCount = serials.split("\n").map(s => s.trim()).filter(Boolean).length;

  return (
    <Modal open onClose={onClose} title="Принять на склад">
      <div className="space-y-4">
        <div><label className="label">Позиция</label>
          <select className="input" value={itemId} onChange={e => setItemId(e.target.value)}>
            {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.isSerialized ? "поштучно" : "кол-во"})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Склад</label>
            <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              {whs?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div><label className="label">Накладная / документ</label><input className="input" value={doc} onChange={e => setDoc(e.target.value)} /></div>
        </div>
        {current.isSerialized ? (
          <div>
            <label className="label">Серийные номера — по одному в строке ({serialCount})</label>
            <textarea className="input h-32 font-mono text-sm" placeholder={"SN-0001\nSN-0002"} value={serials} onChange={e => setSerials(e.target.value)} />
          </div>
        ) : (
          <div><label className="label">Количество ({current.unit})</label><input type="number" className="input" value={qty} onChange={e => setQty(e.target.value)} /></div>
        )}
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button loading={mut.isPending} disabled={!warehouseId || (current.isSerialized ? serialCount === 0 : !(Number(qty) > 0))} onClick={() => mut.mutate()}>
            Принять
          </Button>
        </div>
      </div>
    </Modal>
  );
}
