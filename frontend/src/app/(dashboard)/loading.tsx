import { Package } from "lucide-react";

/** Скелет загрузки для разделов дашборда (Suspense-фолбэк App Router). */
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-gray-50 dark:bg-slate-950">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-600 to-violet-600 flex items-center justify-center shadow-glow">
        <Package className="w-6 h-6 text-white" />
      </div>
      <div className="flex gap-1.5" role="status" aria-label="Загрузка">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-primary-400 dark:bg-primary-500 animate-bounceDot"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}
