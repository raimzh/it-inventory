"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { assetsApi, departmentsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { ASSET_STATUS_LABELS, AssetStatus, Department, ASSET_CATEGORIES } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import { ArrowLeft, AlertCircle } from "lucide-react";

const STATUSES = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];

interface AssetFormState {
  inventoryNumber: string;
  name: string;
  departmentId: string;
  serialNumber: string;
  location: string;
  responsiblePerson: string;
  ownerName: string;
  manufacturer: string;
  model: string;
  category: string;
  commissioningDate: string;
  initialValue: string;
  residualValue: string;
  status: AssetStatus;
  comment: string;
}

const EMPTY_FORM: AssetFormState = {
  inventoryNumber: "",
  name: "",
  departmentId: "",
  serialNumber: "",
  location: "",
  responsiblePerson: "",
  ownerName: "",
  manufacturer: "",
  model: "",
  category: "",
  commissioningDate: "",
  initialValue: "",
  residualValue: "",
  status: "active",
  comment: "",
};

export default function NewAssetPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [form, setForm] = useState<AssetFormState>(EMPTY_FORM);
  const [error, setError] = useState("");

  const { data: depts } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.getAll().then(r => r.data),
  });

  // Бэкенд: POST /assets → admin, accountant
  const canCreate = user && ["admin", "accountant"].includes(user.role);

  const createMutation = useMutation({
    mutationFn: () => {
      return assetsApi.create({
        inventoryNumber: form.inventoryNumber,
        name: form.name,
        departmentId: form.departmentId || undefined,
        serialNumber: form.serialNumber || undefined,
        location: form.location || undefined,
        responsiblePerson: form.responsiblePerson || undefined,
        ownerName: form.ownerName || undefined,
        manufacturer: form.manufacturer || undefined,
        model: form.model || undefined,
        category: form.category || undefined,
        commissioningDate: form.commissioningDate || undefined,
        initialValue: form.initialValue ? Number(form.initialValue) : undefined,
        residualValue: form.residualValue ? Number(form.residualValue) : undefined,
        status: form.status,
        comment: form.comment || undefined,
      });
    },
    onSuccess: ({ data }) => {
      toast.success("ОС создано");
      router.push(`/assets/${data.id}`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось создать ОС");
      setError(text);
      toast.error(text);
    },
  });

  const set = <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    createMutation.mutate();
  };

  if (!canCreate) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Новое ОС">
          <Button variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => router.back()}>
            Назад
          </Button>
        </Header>
        <div className="p-10 text-center text-gray-400">Недостаточно прав для добавления ОС</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Новое основное средство">
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => router.back()}>
          Назад
        </Button>
      </Header>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="card p-6 max-w-3xl space-y-5">
          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Инвентарный номер *</label>
              <input className="input" required value={form.inventoryNumber}
                onChange={e => set("inventoryNumber", e.target.value)} />
            </div>
            <div>
              <label className="label">Наименование *</label>
              <input className="input" required value={form.name}
                onChange={e => set("name", e.target.value)} />
            </div>

            <div>
              <label className="label">Подразделение</label>
              <select className="input" value={form.departmentId}
                onChange={e => set("departmentId", e.target.value)}>
                <option value="">Не выбрано</option>
                {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Серийный номер</label>
              <input className="input" value={form.serialNumber}
                onChange={e => set("serialNumber", e.target.value)} />
            </div>

            <div>
              <label className="label">Местоположение</label>
              <input className="input" value={form.location}
                onChange={e => set("location", e.target.value)} />
            </div>
            <div>
              <label className="label">Ответственный</label>
              <input className="input" value={form.responsiblePerson}
                onChange={e => set("responsiblePerson", e.target.value)} />
            </div>

            <div>
              <label className="label">Владелец</label>
              <input className="input" value={form.ownerName}
                onChange={e => set("ownerName", e.target.value)} />
            </div>
            <div>
              <label className="label">Статус</label>
              <select className="input" value={form.status}
                onChange={e => set("status", e.target.value as AssetStatus)}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Производитель</label>
              <input className="input" value={form.manufacturer}
                onChange={e => set("manufacturer", e.target.value)} />
            </div>
            <div>
              <label className="label">Модель</label>
              <input className="input" value={form.model}
                onChange={e => set("model", e.target.value)} />
            </div>

            <div>
              <label className="label">Категория</label>
              <select className="input" value={form.category}
                onChange={e => set("category", e.target.value)}>
                <option value="">Не выбрано</option>
                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Дата ввода в эксплуатацию</label>
              <input type="date" className="input" value={form.commissioningDate}
                onChange={e => set("commissioningDate", e.target.value)} />
            </div>

            <div>
              <label className="label">Первоначальная стоимость, ₸</label>
              <input type="number" step="0.01" className="input" value={form.initialValue}
                onChange={e => set("initialValue", e.target.value)} />
            </div>
            <div>
              <label className="label">Остаточная стоимость, ₸</label>
              <input type="number" step="0.01" className="input" value={form.residualValue}
                onChange={e => set("residualValue", e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className="label">Комментарий</label>
              <textarea className="input h-20 resize-none" value={form.comment}
                onChange={e => set("comment", e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Отмена</Button>
            <Button type="submit" loading={createMutation.isPending}>Создать</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
