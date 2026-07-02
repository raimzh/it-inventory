"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, backupApi, departmentsApi, auditApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { User, UserRole, USER_ROLE_LABELS, Department } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import { useRouter } from "next/navigation";
import { Plus, Shield, HardDrive, Download, Users, Pencil, ShieldOff, ShieldCheck, Building2, Trash2, AlertCircle, ScrollText } from "lucide-react";

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
  const [tab, setTab] = useState<"users" | "departments" | "backup" | "audit">("users");
  const [userModal, setUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    username: "", email: "", password: "", fullName: "",
    role: "viewer" as UserRole, department: "",
  });

  // Подразделения
  const [deptModal, setDeptModal] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", code: "" });
  const [deptError, setDeptError] = useState("");

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

  const [userError, setUserError] = useState("");
  const createUserMutation = useMutation({
    mutationFn: () => editUser ? usersApi.update(editUser.id, form) : usersApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(editUser ? "Пользователь обновлён" : "Пользователь создан");
      setUserModal(false); setEditUser(null); setUserError("");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось сохранить пользователя");
      setUserError(text);
      toast.error(text);
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: (u: User) => usersApi.update(u.id, { isActive: !u.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Статус пользователя изменён"); },
    onError: () => toast.error("Не удалось изменить статус пользователя"),
  });

  const backupMutation = useMutation({
    mutationFn: () => backupApi.create(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["backups"] }); toast.success("Резервная копия создана"); },
    onError: () => toast.error("Не удалось создать резервную копию"),
  });

  const { data: departments, isLoading: deptsLoading } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.getAll().then(r => r.data),
    enabled: tab === "departments",
  });

  const saveDeptMutation = useMutation({
    mutationFn: () => {
      const payload = { name: deptForm.name.trim(), code: deptForm.code.trim() || undefined };
      return editDept ? departmentsApi.update(editDept.id, payload) : departmentsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success(editDept ? "Подразделение обновлено" : "Подразделение создано");
      setDeptModal(false); setEditDept(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось сохранить подразделение. Возможно, название или код уже используются.");
      setDeptError(text);
      toast.error(text);
    },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: (id: string) => departmentsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast.success("Подразделение удалено"); },
    onError: (err: any) => {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : (msg || "Не удалось удалить подразделение. Возможно, к нему привязаны основные средства."));
    },
  });

  const openCreateDept = () => {
    setEditDept(null);
    setDeptForm({ name: "", code: "" });
    setDeptError("");
    setDeptModal(true);
  };

  const openEditDept = (d: Department) => {
    setEditDept(d);
    setDeptForm({ name: d.name, code: d.code || "" });
    setDeptError("");
    setDeptModal(true);
  };

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditApi.getLogs({ limit: 100 }).then(r => r.data),
    enabled: tab === "audit",
  });

  const openCreate = () => {
    setEditUser(null);
    setUserError("");
    setForm({ username: "", email: "", password: "", fullName: "", role: "viewer", department: "" });
    setUserModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setUserError("");
    setForm({ username: u.username, email: u.email, password: "", fullName: u.fullName, role: u.role, department: u.department || "" });
    setUserModal(true);
  };

  const TABS = [
    { key: "users" as const, label: "Пользователи", icon: Users },
    { key: "departments" as const, label: "Подразделения", icon: Building2 },
    { key: "backup" as const, label: "Резервные копии", icon: HardDrive },
    { key: "audit" as const, label: "Журнал аудита", icon: ScrollText },
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

        {/* Departments tab */}
        {tab === "departments" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {departments?.length || 0} подразделений в системе
              </p>
              <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreateDept}>
                Добавить подразделение
              </Button>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                    <tr>
                      {["Наименование", "Код", "Создано", "Действия"].map(h => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {deptsLoading ? (
                      <tr><td colSpan={4} className="td py-10 text-center text-gray-400">Загрузка...</td></tr>
                    ) : departments?.length ? departments.map(d => (
                      <tr key={d.id} className="tr-hover">
                        <td className="td font-semibold text-gray-900 dark:text-white">{d.name}</td>
                        <td className="td font-mono text-xs text-gray-500 dark:text-slate-400">{d.code || "—"}</td>
                        <td className="td text-xs text-gray-400 dark:text-slate-500 tabular-nums">
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString("ru-RU") : "—"}
                        </td>
                        <td className="td">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="xs" icon={<Pencil className="w-3 h-3" />} onClick={() => openEditDept(d)}>
                              Изменить
                            </Button>
                            <Button
                              variant="ghost" size="xs"
                              icon={<Trash2 className="w-3 h-3" />}
                              onClick={() => {
                                if (confirm(`Удалить подразделение «${d.name}»?`)) deleteDeptMutation.mutate(d.id);
                              }}
                            >
                              Удалить
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="td py-10 text-center text-gray-400">Подразделения не добавлены</td></tr>
                    )}
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

        {/* Audit log tab */}
        {tab === "audit" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Журнал действий пользователей{auditData?.total ? ` · всего ${auditData.total}` : ""}
            </p>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                    <tr>
                      {["Время", "Пользователь", "Действие", "Ресурс", "IP"].map(h => (
                        <th key={h} className="th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {auditLoading ? (
                      <tr><td colSpan={5} className="td py-10 text-center text-gray-400">Загрузка...</td></tr>
                    ) : auditData?.data?.length ? auditData.data.map((log: any) => (
                      <tr key={log.id} className="tr-hover">
                        <td className="td text-xs text-gray-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString("ru-RU")}
                        </td>
                        <td className="td text-gray-700 dark:text-slate-300">{log.username || "—"}</td>
                        <td className="td font-mono text-xs text-gray-600 dark:text-slate-400">{log.action}</td>
                        <td className="td text-gray-500 dark:text-slate-400">
                          {log.resource || "—"}{log.resourceId ? <span className="text-gray-300 dark:text-slate-600"> · {String(log.resourceId).slice(0, 8)}</span> : null}
                        </td>
                        <td className="td text-xs text-gray-400 dark:text-slate-500 font-mono">{log.ipAddress || "—"}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="td py-10 text-center text-gray-400">Записи аудита отсутствуют</td></tr>
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
        {userError && (
          <div className="flex items-start gap-3 p-3.5 mb-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {userError}
          </div>
        )}
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

      {/* Department modal */}
      <Modal
        open={deptModal}
        onClose={() => setDeptModal(false)}
        title={editDept ? "Редактировать подразделение" : "Новое подразделение"}
      >
        <div className="space-y-4">
          {deptError && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {deptError}
            </div>
          )}
          <div>
            <label className="label">Наименование *</label>
            <input
              className="input"
              value={deptForm.name}
              onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Бухгалтерия"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Код</label>
            <input
              className="input"
              value={deptForm.code}
              onChange={e => setDeptForm(f => ({ ...f, code: e.target.value }))}
              placeholder="ACC"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={() => setDeptModal(false)}>Отмена</Button>
          <Button
            loading={saveDeptMutation.isPending}
            disabled={!deptForm.name.trim()}
            onClick={() => { setDeptError(""); saveDeptMutation.mutate(); }}
          >
            {editDept ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
