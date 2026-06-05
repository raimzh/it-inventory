"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, backupApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { User, UserRole, USER_ROLE_LABELS } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";
import { Plus, Shield, HardDrive, Download, Users, Pencil, ShieldOff, ShieldCheck } from "lucide-react";

const ROLES = Object.entries(USER_ROLE_LABELS) as [UserRole, string][];

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "red",
  accountant: "blue",
  inventorizer: "yellow",
  viewer: "gray",
};

export default function AdminPage() {
  const { user: currentUser } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"users" | "backup">("users");
  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    username: "", email: "", password: "", fullName: "",
    role: "viewer" as UserRole, department: "",
  });

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-gray-400">Доступ только для администраторов</p>
        </div>
      </div>
    );
  }

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => usersApi.getAll().then(r => r.data),
  });
  const { data: backups } = useQuery({
    queryKey: ["backups"],
    queryFn: () => backupApi.list().then(r => r.data),
    enabled: tab === "backup",
  });

  const createUserMutation = useMutation({
    mutationFn: () => editUser ? usersApi.update(editUser.id, form) : usersApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setUserModal(false); setEditUser(null); },
  });

  const toggleUserMutation = useMutation({
    mutationFn: (u: User) => usersApi.update(u.id, { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const backupMutation = useMutation({
    mutationFn: () => backupApi.create(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });

  const openCreate = () => {
    setEditUser(null);
    setForm({ username: "", email: "", password: "", fullName: "", role: "viewer", department: "" });
    setUserModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ username: u.username, email: u.email, password: "", fullName: u.fullName, role: u.role, department: u.department || "" });
    setUserModal(true);
  };

  const TABS = [
    { key: "users" as const, label: "Пользователи", icon: Users },
    { key: "backup" as const, label: "Резервные копии", icon: HardDrive },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Администрирование" />

      <div className="p-6 space-y-5">
        {/* Tabs */}
        <div className="tabs-container">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-item flex items-center gap-1.5 ${tab === t.key ? "active" : ""}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {users?.length || 0} пользователей в системе
              </p>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
                Добавить пользователя
              </Button>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                    <tr>
                      {["ФИО", "Логин", "Email", "Роль", "Подразделение", "Активен", "Последний вход", "Действия"].map(h => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {usersLoading ? (
                      <tr><td colSpan={8} className="td py-10 text-center text-gray-400">Загрузка...</td></tr>
                    ) : users?.map(u => (
                      <tr key={u.id} className={`tr-hover ${!u.isActive ? "opacity-50" : ""}`}>
                        <td className="td font-semibold text-gray-900 dark:text-white">{u.fullName}</td>
                        <td className="td font-mono text-xs text-gray-500 dark:text-slate-400">{u.username}</td>
                        <td className="td text-gray-500">{u.email}</td>
                        <td className="td">
                          <Badge color={ROLE_COLORS[u.role] || "gray"}>
                            {USER_ROLE_LABELS[u.role]}
                          </Badge>
                        </td>
                        <td className="td text-gray-500">{u.department || "—"}</td>
                        <td className="td">
                          <span className={`text-xs font-semibold ${u.isActive ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                            {u.isActive ? "Да" : "Нет"}
                          </span>
                        </td>
                        <td className="td text-xs text-gray-400 dark:text-slate-500 tabular-nums">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ru-RU") : "Никогда"}
                        </td>
                        <td className="td">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="xs" icon={<Pencil className="w-3 h-3" />} onClick={() => openEdit(u)}>
                              Изменить
                            </Button>
                            {u.id !== currentUser?.id && (
                              <Button
                                variant="ghost" size="xs"
                                icon={u.isActive ? <ShieldOff className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                                onClick={() => toggleUserMutation.mutate(u)}
                              >
                                {u.isActive ? "Блок." : "Разбл."}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Backup tab */}
        {tab === "backup" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Резервные копии базы данных
              </p>
              <Button
                size="sm"
                loading={backupMutation.isPending}
                icon={<HardDrive className="w-3.5 h-3.5" />}
                onClick={() => backupMutation.mutate()}
              >
                Создать резервную копию
              </Button>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                    <tr>
                      {["Файл", "Размер", "Создан", "Действия"].map(h => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {backups?.map((b: any) => (
                      <tr key={b.filename} className="tr-hover">
                        <td className="td font-mono text-xs text-gray-600 dark:text-slate-300">{b.filename}</td>
                        <td className="td text-gray-500 tabular-nums">{(b.size / 1024 / 1024).toFixed(2)} МБ</td>
                        <td className="td text-xs text-gray-400 tabular-nums">{new Date(b.createdAt).toLocaleString("ru-RU")}</td>
                        <td className="td">
                          <a
                            href={backupApi.download(b.filename)}
                            download
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Скачать
                          </a>
                        </td>
                      </tr>
                    ))}
                    {!backups?.length && (
                      <tr><td colSpan={4} className="td py-10 text-center text-gray-400">Нет резервных копий</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User modal */}
      <Modal
        open={userModal}
        onClose={() => setUserModal(false)}
        title={editUser ? "Редактировать пользователя" : "Новый пользователь"}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">ФИО *</label>
            <input className="input" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
          </div>
          <div>
            <label className="label">Логин *</label>
            <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} disabled={!!editUser} />
          </div>
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Пароль {editUser ? "(оставьте пустым)" : "*"}</label>
            <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label className="label">Роль</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Подразделение</label>
            <input className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={() => setUserModal(false)}>Отмена</Button>
          <Button loading={createUserMutation.isPending} onClick={() => createUserMutation.mutate()}>
            {editUser ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
