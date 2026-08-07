"use client";
import { useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { assetsApi, syncApi } from "@/lib/api";
import { Header } from "@/components/layout/Header";
import { ASSET_STATUS_LABELS, DashboardStats } from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Package, CheckCircle2, AlertCircle, TrendingUp,
  RefreshCw, Clock,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  not_found: "#ef4444",
  transferred: "#3b82f6",
  repair: "#f59e0b",
  decommissioned: "#6b7280",
};

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--tooltip-bg, #fff)",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)",
  padding: "8px 12px",
};

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
  loading?: boolean;
}

function StatCard({ title, value, sub, icon: Icon, iconBg, iconColor, valueColor, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="card p-5 space-y-4">
        <div className="skeleton h-9 w-9 rounded-xl" />
        <div className="space-y-2">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-4 w-32 rounded-lg" />
        </div>
      </div>
    );
  }
  return (
    <div className="card p-5 hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`stat-icon ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={2} />
        </div>
      </div>
      <div className={`text-3xl font-bold tracking-tight ${valueColor || "text-gray-900 dark:text-white"}`}>
        {value}
      </div>
      <div className="text-sm font-medium text-gray-500 dark:text-slate-400 mt-1">{title}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// memo: тултип пересоздаётся recharts при каждом движении мыши над графиком
const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 dark:text-slate-200 mb-1">{label}</p>
      <p className="text-primary-600 dark:text-primary-400 font-bold">{payload[0].value} ОС</p>
    </div>
  );
});

export default function DashboardPage() {
  const { data: statsData, isLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => assetsApi.getStats().then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: lastSync } = useQuery({
    queryKey: ["last-sync"],
    queryFn: () => syncApi.getLastSync().then(r => r.data),
    refetchInterval: 120_000,
  });

  const stats = statsData;
  const active = stats?.byStatus?.find(s => s.status === "active");
  const notFound = stats?.byStatus?.find(s => s.status === "not_found");

  // Пересчитываем только при смене данных: без этого новые массивы на каждый
  // рендер заставляли recharts перерисовывать оба графика целиком.
  const pieData = useMemo(() => stats?.byStatus?.map(s => ({
    name: ASSET_STATUS_LABELS[s.status as keyof typeof ASSET_STATUS_LABELS] || s.status,
    value: parseInt(s.count),
    color: STATUS_COLORS[s.status] || "#6b7280",
  })) || [], [stats?.byStatus]);

  const deptData = useMemo(() => (stats?.byDepartment || []).slice(0, 8).map(d => ({
    name: d.department || "Без подразделения",
    count: parseInt(d.count),
  })), [stats?.byDepartment]);

  const lastSyncTime = lastSync?.finishedAt
    ? new Date(lastSync.finishedAt).toLocaleString("ru-RU")
    : "Никогда";

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Дашборд" />

      <div className="p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Всего ОС"
            value={stats?.total ?? "—"}
            icon={Package}
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconColor="text-slate-600 dark:text-slate-300"
            loading={isLoading}
          />
          <StatCard
            title="В наличии"
            value={active?.count ?? "—"}
            icon={CheckCircle2}
            iconBg="bg-green-50 dark:bg-green-950/40"
            iconColor="text-green-600 dark:text-green-400"
            valueColor="text-green-600 dark:text-green-400"
            loading={isLoading}
          />
          <StatCard
            title="Не найдено"
            value={notFound?.count ?? "—"}
            icon={AlertCircle}
            iconBg="bg-red-50 dark:bg-red-950/40"
            iconColor="text-red-500 dark:text-red-400"
            valueColor="text-red-500 dark:text-red-400"
            loading={isLoading}
          />
          <StatCard
            title="Остаточная стоимость"
            value={stats ? `${Number(stats.totalResidualValue).toLocaleString("ru-RU")} ₽` : "—"}
            icon={TrendingUp}
            iconBg="bg-primary-50 dark:bg-primary-950/40"
            iconColor="text-primary-600 dark:text-primary-400"
            loading={isLoading}
          />
        </div>

        {/* Sync status banner */}
        <div className="card px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${lastSync ? "bg-green-500" : "bg-gray-300"} ${lastSync?.status === "running" ? "animate-pulse" : ""}`} />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Синхронизация с 1С</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Последняя: {lastSyncTime}
              </p>
            </div>
          </div>
          {lastSync?.status && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              lastSync.status === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              <RefreshCw className="w-3 h-3" />
              {lastSync.status === "success" ? "Успешно" : lastSync.status}
            </span>
          )}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie chart */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-5">Статусы ОС</h3>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-6 flex-wrap">
                <PieChart width={168} height={168}>
                  <Pie
                    data={pieData}
                    cx={79}
                    cy={79}
                    innerRadius={48}
                    outerRadius={74}
                    dataKey="value"
                    strokeWidth={0}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="space-y-2.5 flex-1 min-w-0">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="text-xs text-gray-600 dark:text-slate-400 flex-1 truncate">{item.name}</span>
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-10 text-center">Нет данных</p>
            )}
          </div>

          {/* Bar chart */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-5">ОС по подразделениям</h3>
            {deptData.length > 0 ? (
              <ResponsiveContainer width="100%" height={192}>
                <BarChart
                  data={deptData}
                  layout="vertical"
                  margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    width={130}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgb(124 58 237 / 0.06)" }} />
                  <Bar dataKey="count" fill="#7c3aed" radius={[0, 6, 6, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-10 text-center">Нет данных</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
