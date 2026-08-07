"use client";
import { useToastStore } from "@/store/toast.store";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

const STYLES = {
  success: {
    icon: CheckCircle2,
    cls: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900/60 text-green-800 dark:text-green-200",
    iconCls: "text-green-500",
  },
  error: {
    icon: XCircle,
    cls: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200",
    iconCls: "text-red-500",
  },
  info: {
    icon: Info,
    cls: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-200",
    iconCls: "text-blue-500",
  },
} as const;

export function Toaster() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2.5 w-[min(90vw,360px)]">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            role="alert"
            className={`flex items-start gap-3 p-3.5 rounded-xl border shadow-lg animate-slideInLeft ${s.cls}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${s.iconCls}`} />
            <p className="text-sm font-medium flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
