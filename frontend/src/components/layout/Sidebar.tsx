"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Package, ClipboardCheck, BarChart2,
  RefreshCw, Settings, LogOut, X, ChevronRight, Warehouse, HandCoins, ScrollText,
} from "lucide-react";
import { USER_ROLE_LABELS } from "@/types";
import { useSidebar } from "./SidebarContext";

const navGroups = [
  {
    label: "Основное",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Дашборд", roles: [] as string[] },
      { href: "/assets", icon: Package, label: "Основные средства", roles: [] as string[] },
      { href: "/inventory", icon: ClipboardCheck, label: "Инвентаризация", roles: [] as string[] },
      { href: "/reports", icon: BarChart2, label: "Отчёты", roles: [] as string[] },
    ],
  },
  {
    label: "Склад",
    items: [
      { href: "/warehouse", icon: Warehouse, label: "Остатки", roles: [] as string[] },
      { href: "/warehouse/issue", icon: HandCoins, label: "Выдача", roles: ["admin", "accountant", "inventorizer"] },
      { href: "/warehouse/movements", icon: ScrollText, label: "Журнал операций", roles: [] as string[] },
      { href: "/warehouse/reports", icon: BarChart2, label: "Отчёты склада", roles: [] as string[] },
      { href: "/warehouse/checks", icon: ClipboardCheck, label: "Инвентаризация склада", roles: ["admin", "accountant", "inventorizer"] },
    ],
  },
  {
    label: "Управление",
    items: [
      { href: "/sync", icon: RefreshCw, label: "Синхронизация с 1С", roles: ["admin", "accountant"] },
      { href: "/admin", icon: Settings, label: "Администрирование", roles: ["admin"] },
    ],
  },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => { logout(); router.push("/login"); };

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const roleLabel = user?.role
    ? USER_ROLE_LABELS[user.role as keyof typeof USER_ROLE_LABELS] || user.role
    : "";

  const initials = user?.fullName
    ? user.fullName.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-full bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-[18px] border-b border-gray-100 dark:border-slate-800">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600 to-violet-600 flex items-center justify-center shadow-glow-sm">
          <Package className="w-[18px] h-[18px] text-white" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">IT Inventory</div>
          <div className="text-[11px] text-gray-400 dark:text-slate-500 leading-tight">Учёт основных средств</div>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors lg:hidden">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item =>
            item.roles.length === 0 || (user && item.roles.includes(user.role))
          );
          if (!visibleItems.length) return null;
          return (
            <div key={group.label}>
              <p className="px-3 mb-2 text-[10px] font-bold text-gray-300 dark:text-slate-600 uppercase tracking-widest">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href}
                      className={`sidebar-link ${active ? "active" : ""}`}>
                      <item.icon
                        className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active ? "text-primary-600 dark:text-primary-400" : ""}`}
                        strokeWidth={active ? 2 : 1.75}
                      />
                      <span className="flex-1">{item.label}</span>
                      {active && <ChevronRight className="w-3.5 h-3.5 opacity-30" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors group">
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold tracking-wide">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{user?.fullName}</div>
            <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{roleLabel}</div>
          </div>
          {/* coarse: кнопка показывалась только по наведению — с сенсорного
              экрана она была недостижима в принципе */}
          <button onClick={handleLogout} title="Выйти"
            className="p-1.5 coarse:p-3 rounded-lg text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 coarse:opacity-100">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex h-screen sticky top-0">
        <SidebarContent />
      </div>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={close}
          />
          <div className="relative flex animate-slideInLeft h-full">
            <SidebarContent onClose={close} />
          </div>
        </div>
      )}
    </>
  );
}
