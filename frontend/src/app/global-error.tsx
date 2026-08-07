"use client";
import { useEffect } from "react";

/**
 * Последний рубеж: срабатывает, когда падает сам корневой layout.
 * Заменяет собой всю разметку документа, поэтому обязан содержать <html>/<body>
 * и не может полагаться на стили приложения — они могли не загрузиться.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Критическая ошибка приложения:", error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <div
            style={{
              width: 56, height: 56, margin: "0 auto 20px", borderRadius: 16,
              background: "#fee2e2", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 28,
            }}
            aria-hidden="true"
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Приложение не запустилось</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px", lineHeight: 1.5 }}>
            Произошла критическая ошибка. Попробуйте обновить страницу — если это
            не помогает, сообщите администратору.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", margin: "0 0 20px" }}>
              Код ошибки: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#fff",
              background: "#7c3aed", border: "none", borderRadius: 12, cursor: "pointer",
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
