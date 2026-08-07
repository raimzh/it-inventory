"use client";
import { useEffect } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

/**
 * Error Boundary уровня приложения: перехватывает ошибку рендера на любой
 * странице, чтобы вместо белого экрана пользователь видел понятное сообщение
 * и мог продолжить работу.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В консоль — чтобы ошибку было видно при разборе инцидента
    console.error("Ошибка страницы:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
      <div className="card max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mb-5">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          Что-то пошло не так
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
          Страница не смогла отобразиться. Попробуйте обновить — если ошибка
          повторяется, сообщите администратору.
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-gray-400 mb-5">
            Код ошибки: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary">
            <RotateCw className="w-4 h-4" /> Повторить
          </button>
          <a href="/dashboard" className="btn-secondary">
            <Home className="w-4 h-4" /> На главную
          </a>
        </div>
      </div>
    </div>
  );
}
