"use client";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/store/auth.store";
import { USER_ROLE_LABELS } from "@/types";
import { Sun, Moon, Menu } from "lucide-react";
import { useSidebar } from "./SidebarContext";

interface HeaderProps {
  title: string;
  children?: React.ReactNode;
}

export function Header({ title, children }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-40 glass border-b border-gray-100 dark:border-slate-800 px-5 py-3.5">
      <div className="flex items-center gap-3">
        {/* Mobile menu */}
        <button
          onClick={toggle}
          className="lg:hidden flex-shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all -ml-1"
          aria-label="Меню"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Title */}
        <h1 className="flex-1 min-w-0 text-[17px] font-bold text-gray-900 dark:text-white tracking-tight truncate">
          {title}
        </h1>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {children}

          {user && (
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-900/40">
              {USER_ROLE_LABELS[user.role as keyof typeof USER_ROLE_LABELS] || user.role}
            </span>
          )}

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
            title="Переключить тему"
          >
            {theme === "dark"
              ? <Sun className="w-[18px] h-[18px]" />
              : <Moon className="w-[18px] h-[18px]" />
            }
          </button>
        </div>
      </div>
    </header>
  );
}
