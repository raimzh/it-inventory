"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, notFound } from "next/navigation";
import Image from "next/image";
import { assetsApi, departmentsApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ASSET_STATUS_LABELS, AssetStatus, Asset, Department, ASSET_CATEGORIES } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import { ArrowLeft, Pencil, QrCode, History, Paperclip, Calendar, Clock, Trash2, AlertCircle, Printer } from "lucide-react";
import { AssetLabel } from "@/components/assets/AssetLabel";

const STATUSES = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][];
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const FIELD_LABELS: Record<string, string> = {
  ownerId: "Владелец (ID)",
  ownerName: "Владелец",
  responsiblePerson: "Ответственный",
  status: "Статус",
  location: "Местоположение",
  comment: "Комментарий",
  departmentId: "Подразделение",
  departmentName: "Подразделение",
  category: "Категория",
  created: "Создано",
};

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [editModal, setEditModal] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [printLabel, setPrintLabel] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Asset>>({});

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => assetsApi.getOne(id).then(r => r.data),
  });
  const { data: history } = useQuery({
    queryKey: ["asset-history", id],
    queryFn: () => assetsApi.getHistory(id).then(r => r.data),
  });
  const { data: files } = useQuery({
    queryKey: ["asset-files", id],
    queryFn: () => assetsApi.getFiles(id).then(r => r.data),
  });
  const { data: qrCode } = useQuery({
    queryKey: ["asset-qr", id],
    queryFn: () => assetsApi.getQrCode(id).then(r => r.data),
    enabled: qrModal || printLabel,
  });
  const { data: depts } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.getAll().then(r => r.data),
  });

  const [editError, setEditError] = useState("");
  const updateMutation = useMutation({
    mutationFn: (data: Partial<Asset>) => assetsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset", id] });
      qc.invalidateQueries({ queryKey: ["asset-history", id] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setEditModal(false);
      setEditError("");
      toast.success("Изменения сохранены");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось сохранить изменения");
      setEditError(text);
      toast.error(text);
      // 409 — карточку изменил другой пользователь. Подтягиваем свежие данные,
      // чтобы человек увидел актуальное состояние и не сохранял поверх вслепую.
      if (err.response?.status === 409) {
        qc.invalidateQueries({ queryKey: ["asset", id] });
      }
    },
  });

  const [deleteError, setDeleteError] = useState("");
  const deleteMutation = useMutation({
    mutationFn: () => assetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("ОС удалено");
      router.push("/assets");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось удалить ОС");
      setDeleteError(text);
      toast.error(text);
    },
  });

  const openEdit = () => {
    if (!asset) return;
    setEditError("");
    setEditForm({
      status: asset.status, ownerName: asset.ownerName, responsiblePerson: asset.responsiblePerson,
      location: asset.location, comment: asset.comment, departmentId: asset.departmentId || "",
      category: asset.category || "",
      // Версия на момент открытия формы — сервер отвергнет сохранение,
      // если за это время карточку успел изменить кто-то другой
      version: asset.version,
    });
    setEditModal(true);
  };

  const canEdit = user && ["admin", "accountant", "inventorizer"].includes(user.role);
  const canDelete = user && user.role === "admin";

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!asset) {
    notFound();
  }

  const fields: [string, string | null][] = [
    ["Серийный номер", asset.serialNumber || null],
    ["Подразделение", asset.departmentName || null],
    ["Местоположение", asset.location || null],
    ["Ответственный", asset.responsiblePerson || null],
    ["Владелец", asset.ownerName || null],
    ["Производитель", asset.manufacturer || null],
    ["Модель", asset.model || null],
    ["Категория", asset.category || null],
    ["Дата ввода", asset.commissioningDate ? new Date(asset.commissioningDate).toLocaleDateString("ru-RU") : null],
    ["Первоначальная стоимость", asset.initialValue ? `${Number(asset.initialValue).toLocaleString("ru-RU")} ₽` : null],
    ["Остаточная стоимость", `${Number(asset.residualValue).toLocaleString("ru-RU")} ₽`],
    ["Последняя синхронизация с 1С", asset.lastSyncedAt ? new Date(asset.lastSyncedAt).toLocaleString("ru-RU") : "Не синхронизировано"],
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Карточка ОС">
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => router.back()}>
          Назад
        </Button>
        {canEdit && (
          <Button size="sm" icon={<Pencil className="w-3.5 h-3.5" />} onClick={openEdit}>
            Редактировать
          </Button>
        )}
        <Button variant="secondary" size="sm" icon={<QrCode className="w-3.5 h-3.5" />} onClick={() => setQrModal(true)}>
          QR-код
        </Button>
        <Button variant="secondary" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => setPrintLabel(true)}>
          Печать наклейки
        </Button>
        {canDelete && (
          <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleteModal(true)}>
            Удалить
          </Button>
        )}
      </Header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Main info */}
          <div className="card p-6">
            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{asset.name}</h2>
                <p className="text-sm font-mono text-gray-400 dark:text-slate-500 mt-1">{asset.inventoryNumber}</p>
              </div>
              <AssetStatusBadge status={asset.status} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{label}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{value || "—"}</p>
                </div>
              ))}
            </div>
            {asset.comment && (
              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">Комментарий</p>
                <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{asset.comment}</p>
              </div>
            )}
          </div>

          {/* History */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">История изменений</h3>
            </div>
            {history?.length ? (
              <div className="space-y-0 max-h-72 overflow-y-auto">
                {history.map((h: any, i: number) => (
                  <div key={h.id} className={`flex items-start gap-3 py-3 text-sm ${i < history.length - 1 ? "border-b border-gray-50 dark:border-slate-800/60" : ""}`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div>
                        <span className="font-semibold text-gray-700 dark:text-slate-300">{FIELD_LABELS[h.field] || h.field}: </span>
                        {h.oldValue && (
                          <><span className="text-red-500 line-through text-xs">{h.oldValue}</span>{" → "}</>
                        )}
                        <span className="text-green-600 dark:text-green-400 font-medium">{h.newValue || "пусто"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                        <span>{h.changedByName || "Система"}</span>
                        <span>·</span>
                        <span>{new Date(h.createdAt).toLocaleString("ru-RU")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-6 text-center">История пуста</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Paperclip className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Файлы</h3>
            </div>
            {files?.filter((f: any) => f.type === "photo").length ? (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {files.filter((f: any) => f.type === "photo").map((f: any) => (
                  <div key={f.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800">
                    {/* Файл отдаёт приложение с проверкой прав, а не открытый /uploads.
                        unoptimized: оптимизатор Next обращается к источнику сам,
                        без куки пользователя, и авторизацию бы не прошёл. */}
                    <Image
                      src={`/api/assets/${id}/files/${f.id}/download`}
                      alt={f.originalName}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 50vw, 200px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-3">Нет фотографий</p>
            )}
            {canEdit && (
              <label className="btn-secondary cursor-pointer text-xs w-full py-2">
                <input type="file" className="hidden" accept="image/*,application/pdf" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const fd = new FormData(); fd.append("file", file);
                  await assetsApi.uploadFile(id, fd, file.type.startsWith("image/") ? "photo" : "document");
                  qc.invalidateQueries({ queryKey: ["asset-files", id] });
                }} />
                + Прикрепить файл
              </label>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Создано</p>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{new Date(asset.createdAt).toLocaleString("ru-RU")}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Изменено</p>
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{new Date(asset.updatedAt).toLocaleString("ru-RU")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Редактировать ОС" size="lg">
        {editError && (
          <div className="flex items-start gap-3 p-3.5 mb-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {editError}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Статус</label>
            <select className="input" value={editForm.status || ""} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as AssetStatus }))}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Подразделение</label>
            <select className="input" value={editForm.departmentId || ""} onChange={e => setEditForm(f => ({ ...f, departmentId: e.target.value }))}>
              <option value="">Не выбрано</option>
              {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Категория</label>
            <select className="input" value={editForm.category || ""} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
              <option value="">Не выбрано</option>
              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              {editForm.category && !ASSET_CATEGORIES.includes(editForm.category as any) && (
                <option value={editForm.category}>{editForm.category}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Местоположение</label>
            <input className="input" value={editForm.location || ""} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div>
            <label className="label">Ответственный</label>
            <input className="input" value={editForm.responsiblePerson || ""} onChange={e => setEditForm(f => ({ ...f, responsiblePerson: e.target.value }))} />
          </div>
          <div>
            <label className="label">Владелец</label>
            <input className="input" value={editForm.ownerName || ""} onChange={e => setEditForm(f => ({ ...f, ownerName: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Комментарий</label>
            <textarea className="input h-20 resize-none" value={editForm.comment || ""} onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={() => setEditModal(false)}>Отмена</Button>
          <Button loading={updateMutation.isPending} onClick={() => {
            const { departmentId, ...rest } = editForm;
            updateMutation.mutate(departmentId ? { ...rest, departmentId } : rest);
          }}>Сохранить</Button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={deleteModal} onClose={() => { setDeleteModal(false); setDeleteError(""); }} title="Удалить ОС" size="sm">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Вы действительно хотите удалить <span className="font-semibold">{asset.name}</span> (инв. № {asset.inventoryNumber})?
          Это действие необратимо.
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
          Если ОС загружается из 1С, она может появиться снова при следующей синхронизации.
        </p>
        {deleteError && (
          <div className="flex items-start gap-3 p-3.5 mt-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
            <Trash2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {deleteError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={() => { setDeleteModal(false); setDeleteError(""); }}>Отмена</Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={() => { setDeleteError(""); deleteMutation.mutate(); }}>
            Удалить
          </Button>
        </div>
      </Modal>

      {/* QR modal */}
      <Modal open={qrModal} onClose={() => setQrModal(false)} title="QR-код" size="sm">
        <div className="text-center">
          {qrCode ? (
            <>
              <div className="inline-block p-3 rounded-2xl bg-white border border-gray-100 dark:border-slate-700 shadow-sm mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element --
                    QR приходит как base64 data-URL: оптимизировать нечего,
                    next/image потребовал бы unoptimized и ничего не дал бы */}
                <img src={qrCode} alt="QR-код основного средства" className="w-44 h-44" />
              </div>
              <p className="text-xs text-gray-400 font-mono mb-4">{asset.inventoryNumber}</p>
              <Button variant="secondary" size="sm" onClick={() => {
                const a = document.createElement("a"); a.href = qrCode;
                a.download = `qr-${asset.inventoryNumber}.png`; a.click();
              }}>Скачать PNG</Button>
            </>
          ) : (
            <div className="h-52 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </Modal>

      {printLabel && qrCode && (
        <AssetLabel asset={asset} qr={qrCode} onClose={() => setPrintLabel(false)} />
      )}
    </div>
  );
}
