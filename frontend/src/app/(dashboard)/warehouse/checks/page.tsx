"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warehouseApi, downloadBlob } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import { InventoryCheck, WarehouseRef } from "@/types";
import { Plus, ClipboardCheck, Download, CheckCircle2 } from "lucide-react";

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
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full text-left px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 ${activeId === c.id ? "bg-primary-50 dark:bg-primary-900/20" : ""}`}>
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
          {activeId ? <ConductCheck id={activeId} canOperate={canOperate} onChanged={() => qc.invalidateQueries({ queryKey: ["wh-checks"] })} /> :
            <div className="card p-12 text-center text-gray-400">Выберите ведомость слева</div>}
        </div>
      </div>

      {createOpen && <CreateCheckModal onClose={() => setCreateOpen(false)} onDone={(id) => { qc.invalidateQueries({ queryKey: ["wh-checks"] }); setActiveId(id); setCreateOpen(false); }} />}
    </div>
  );
}

function CreateCheckModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { data: whs } = useQuery<WarehouseRef[]>({ queryKey: ["wh-refs"], queryFn: () => warehouseApi.warehouses().then(r => r.data) });
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => { if (whs && !warehouseId) setWarehouseId(whs[0]?.id || ""); }, [whs]);
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
          <select className="input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>{whs?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </div>
        <div className="flex gap-3 justify-end"><Button variant="secondary" onClick={onClose}>Отмена</Button><Button loading={mut.isPending} onClick={() => mut.mutate()}>Создать</Button></div>
      </div>
    </Modal>
  );
}

function ConductCheck({ id, canOperate, onChanged }: { id: string; canOperate: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ check: InventoryCheck; items: any[] }>({ queryKey: ["wh-check", id], queryFn: () => warehouseApi.getCheck(id).then(r => r.data) });
  const [actuals, setActuals] = useState<Record<string, string>>({});
  useEffect(() => { setActuals({}); }, [id]);

  const done = data?.check.status === "completed";

  const saveMut = useMutation({
    mutationFn: () => warehouseApi.submitCheck(id, data!.items.filter(it => actuals[it.itemId] !== undefined && actuals[it.itemId] !== "").map(it => ({ itemId: it.itemId, actualQty: Number(actuals[it.itemId]) }))),
    onSuccess: () => { toast.success("Факт сохранён"); qc.invalidateQueries({ queryKey: ["wh-check", id] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Ошибка"),
  });
  const completeMut = useMutation({
    mutationFn: () => warehouseApi.completeCheck(id),
    onSuccess: (r: any) => { toast.success(`Проведено корректировок: ${r.data.adjustments}`); qc.invalidateQueries({ queryKey: ["wh-check", id] }); qc.invalidateQueries({ queryKey: ["wh-items"] }); onChanged(); },
    onError: (e: any) => toast.error(e.response?.data?.message || "Ошибка"),
  });
  const exportSheet = async () => { const { data: blob } = await warehouseApi.exportInventory(id); downloadBlob(blob, `inventory-${id.slice(0, 8)}.xlsx`); };

  if (!data) return <div className="card p-12 text-center text-gray-400">Загрузка…</div>;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">{data.check.warehouse?.name} — {done ? "завершена" : "ввод факта"}</h3>
        <Button variant="secondary" size="xs" icon={<Download className="w-3.5 h-3.5" />} onClick={exportSheet}>Ведомость</Button>
      </div>
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800/50 sticky top-0"><tr>
            <th className="th">Позиция</th><th className="th text-right">Учёт</th><th className="th text-right w-28">Факт</th><th className="th text-right">Расхождение</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
            {data.items.map(it => {
              const actual = done ? it.actualQty : (actuals[it.itemId] ?? "");
              const diff = actual !== "" && actual !== null ? Number(actual) - it.expectedQty : null;
              return (
                <tr key={it.id}>
                  <td className="td font-medium text-gray-900 dark:text-white">{it.name}</td>
                  <td className="td text-right tabular-nums text-gray-500">{it.expectedQty}</td>
                  <td className="td text-right">
                    {done ? <span className="tabular-nums">{it.actualQty ?? "—"}</span> :
                      <input type="number" className="input py-1 text-right w-24" value={actuals[it.itemId] ?? ""} onChange={e => setActuals(a => ({ ...a, [it.itemId]: e.target.value }))} />}
                  </td>
                  <td className={`td text-right tabular-nums font-medium ${diff ? (diff > 0 ? "text-green-600" : "text-red-600") : "text-gray-400"}`}>{diff !== null && diff !== 0 ? (diff > 0 ? "+" : "") + diff : "—"}</td>
                </tr>
              );
            })}
            {!data.items.length && <tr><td className="td text-center text-gray-400 py-8" colSpan={4}>По складу нет позиций количественного учёта</td></tr>}
          </tbody>
        </table>
      </div>
      {!done && canOperate && (
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-gray-100 dark:border-slate-800">
          <Button variant="secondary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>Сохранить факт</Button>
          <Button icon={<CheckCircle2 className="w-4 h-4" />} loading={completeMut.isPending}
            onClick={() => { if (confirm("Завершить инвентаризацию? Расхождения будут проведены корректировками.")) completeMut.mutate(); }}>Завершить</Button>
        </div>
      )}
    </div>
  );
}
