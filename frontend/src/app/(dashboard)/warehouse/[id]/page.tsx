"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, notFound } from "next/navigation";
import { warehouseApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import {
  ItemCard, StockUnit, WarehouseRef,
  MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_COLORS, UNIT_STATUS_LABELS, UNIT_CONDITION_LABELS,
  MovementType, StockUnitStatus,
} from "@/types";
import { ArrowLeft, Trash2, AlertTriangle, Boxes, History, Link2, Package, QrCode } from "lucide-react";
import { ItemLabel } from "@/components/warehouse/ItemLabel";

export default function ItemCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canOperate = !!user && ["admin", "accountant", "inventorizer"].includes(user.role);

  const { data, isLoading } = useQuery<ItemCard>({
    queryKey: ["wh-card", id], queryFn: () => warehouseApi.getItem(id).then(r => r.data),
  });
  const [writeOff, setWriteOff] = useState(false);
  const [label, setLabel] = useState<{ qr: string } | null>(null);

  const qrMutation = useMutation({
    mutationFn: () => warehouseApi.itemQrCode(id).then(r => r.data),
    onSuccess: (data: any) => setLabel({ qr: data.qr }),
    onError: () => toast.error("Не удалось получить QR-код"),
  });

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" /></div>;
  if (!data) notFound();
  const { item, balances, movements, compatibility, units } = data;
  const total = balances.reduce((s, b) => s + b.balance, 0);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Карточка позиции">
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => router.push("/warehouse")}>Назад</Button>
        <Button variant="secondary" size="sm" icon={<QrCode className="w-3.5 h-3.5" />} loading={qrMutation.isPending} onClick={() => qrMutation.mutate()}>
          Этикетка
        </Button>
        {canOperate && <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setWriteOff(true)}>Списать</Button>}
      </Header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Инфо + остатки */}
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-primary-500" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{item.name}</h2>
                <p className="text-xs font-mono text-gray-400">{item.sku}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <Row k="Категория" v={item.category?.name} />
              <Row k="Учёт" v={item.isSerialized ? "поштучный" : "количественный"} />
              <Row k="Единица" v={item.unit} />
              <Row k="Производитель" v={item.manufacturer} />
              <Row k="Модель" v={item.model} />
              <Row k="Точка заказа" v={item.minStock != null ? `${item.minStock} ${item.unit}` : "не отслеживается"} />
            </dl>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Boxes className="w-4 h-4 text-gray-400" /> Остатки по складам</h3>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-3 tabular-nums">{total} <span className="text-base font-normal text-gray-400">{item.unit}</span></div>
            <div className="space-y-1.5">
              {balances.length ? balances.map(b => (
                <div key={b.warehouseId} className="flex justify-between text-sm py-1 border-t border-gray-50 dark:border-slate-800">
                  <span className="text-gray-600 dark:text-slate-400">{b.warehouseName}</span>
                  <span className={`tabular-nums font-medium ${b.belowMin ? "text-amber-600" : ""}`}>{b.balance} {b.belowMin && <AlertTriangle className="inline w-3 h-3" />}</span>
                </div>
              )) : <p className="text-sm text-gray-400">Нет на складе</p>}
            </div>
          </div>

          {compatibility.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-gray-400" /> Совместимые модели</h3>
              <div className="space-y-1.5">
                {compatibility.map(c => (
                  <button key={c.id} onClick={() => router.push(`/warehouse/${c.id}`)} className="w-full flex justify-between text-sm py-1.5 hover:text-primary-600 border-t border-gray-50 dark:border-slate-800">
                    <span>{c.name}</span><span className="tabular-nums text-gray-400">{c.balance} шт</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Экземпляры + история */}
        <div className="lg:col-span-2 space-y-5">
          {item.isSerialized && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800"><h3 className="font-semibold text-gray-900 dark:text-white">Экземпляры ({units.length})</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800/50"><tr>
                    <th className="th">Серийный №</th><th className="th">Инв. №</th><th className="th">Статус</th><th className="th">Состояние</th><th className="th">Где / у кого</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {units.map(u => (
                      <tr key={u.id}>
                        <td className="td font-mono text-xs">{u.serialNumber}</td>
                        <td className="td text-gray-500">{u.inventoryNumber || "—"}</td>
                        <td className="td"><UnitBadge status={u.status} /></td>
                        <td className="td text-gray-500">{UNIT_CONDITION_LABELS[u.condition]}</td>
                        <td className="td text-gray-500">{u.status === "issued" ? (u.currentHolder?.fullName || "—") : (u.warehouse?.name || "—")}</td>
                      </tr>
                    ))}
                    {!units.length && <tr><td className="td text-center text-gray-400 py-8" colSpan={5}>Нет экземпляров</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800"><h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><History className="w-4 h-4 text-gray-400" /> История движений</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800/50"><tr>
                  <th className="th">Дата</th><th className="th">Операция</th><th className="th text-right">Кол-во</th><th className="th">Сотрудник</th><th className="th">Документ</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {movements.map(mv => (
                    <tr key={mv.id}>
                      <td className="td text-gray-500 text-xs">{new Date(mv.createdAt).toLocaleString("ru-RU")}</td>
                      <td className="td"><MvBadge type={mv.type} /></td>
                      <td className={`td text-right tabular-nums font-medium ${Number(mv.quantity) < 0 ? "text-red-600" : "text-green-600"}`}>{Number(mv.quantity) > 0 ? "+" : ""}{mv.quantity}</td>
                      <td className="td text-gray-500">{mv.employee?.fullName || "—"}</td>
                      <td className="td text-gray-500">{mv.documentNumber || (mv.reason ? <span title={mv.reason}>причина…</span> : "—")}</td>
                    </tr>
                  ))}
                  {!movements.length && <tr><td className="td text-center text-gray-400 py-8" colSpan={5}>Движений нет</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {writeOff && <WriteOffModal card={data} onClose={() => setWriteOff(false)} onDone={() => { qc.invalidateQueries({ queryKey: ["wh-card", id] }); qc.invalidateQueries({ queryKey: ["wh-items"] }); setWriteOff(false); }} />}
      {label && <ItemLabel item={item} qr={label.qr} onClose={() => setLabel(null)} />}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return <div className="flex justify-between gap-3"><dt className="text-gray-400">{k}</dt><dd className="text-gray-700 dark:text-slate-300 text-right">{v}</dd></div>;
}
function MvBadge({ type }: { type: MovementType }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full ${MOVEMENT_TYPE_COLORS[type]}`}>{MOVEMENT_TYPE_LABELS[type]}</span>;
}
function UnitBadge({ status }: { status: StockUnitStatus }) {
  const c: Record<StockUnitStatus, string> = {
    in_stock: "bg-green-100 text-green-700", issued: "bg-blue-100 text-blue-700",
    in_repair: "bg-amber-100 text-amber-700", written_off: "bg-gray-100 text-gray-500",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${c[status]}`}>{UNIT_STATUS_LABELS[status]}</span>;
}

function WriteOffModal({ card, onClose, onDone }: { card: ItemCard; onClose: () => void; onDone: () => void }) {
  const { item, balances, units } = card;
  const [warehouseId, setWarehouseId] = useState(balances[0]?.warehouseId || "");
  const [qty, setQty] = useState("1");
  const [unitId, setUnitId] = useState("");
  const [reason, setReason] = useState("");
  const inStockUnits = units.filter(u => u.status === "in_stock");

  const mut = useMutation({
    mutationFn: () => warehouseApi.writeOff(item.isSerialized
      ? { itemId: item.id, warehouseId: units.find(u => u.id === unitId)?.warehouse?.id || warehouseId, stockUnitId: unitId, reason }
      : { itemId: item.id, warehouseId, quantity: Number(qty), reason }),
    onSuccess: () => { toast.success("Списано"); onDone(); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Не удалось списать"),
  });

  return (
    <Modal open onClose={onClose} title="Списание">
      <div className="space-y-4">
        {item.isSerialized ? (
          <div><label className="label">Экземпляр</label>
            <select className="input" value={unitId} onChange={e => setUnitId(e.target.value)}>
              <option value="">— выберите —</option>
              {inStockUnits.map(u => <option key={u.id} value={u.id}>S/N {u.serialNumber}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Склад</label>
              <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                {balances.map(b => <option key={b.warehouseId} value={b.warehouseId}>{b.warehouseName} ({b.balance})</option>)}
              </select>
            </div>
            <div><label className="label">Количество</label><input type="number" className="input" value={qty} onChange={e => setQty(e.target.value)} /></div>
          </div>
        )}
        <div><label className="label">Причина списания *</label><textarea className="input h-20" value={reason} onChange={e => setReason(e.target.value)} placeholder="Израсходовано / вышло из строя / …" /></div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button variant="danger" loading={mut.isPending} disabled={!reason.trim() || (item.isSerialized ? !unitId : !(Number(qty) > 0))} onClick={() => mut.mutate()}>Списать</Button>
        </div>
      </div>
    </Modal>
  );
}
