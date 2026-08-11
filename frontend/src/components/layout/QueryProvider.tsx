"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
      mutations: {
        // По умолчанию networkMode: "online" — без сети мутация уходит в
        // paused и не завершается НИ успехом, ни ошибкой. Оператор со
        // сканером получал бы тишину и не знал, повторять или нет.
        // "always" заставляет её честно упасть, и тогда звучит сигнал ошибки.
        networkMode: "always",
        // Повтор неидемпотентной операции — это задвоенное движение по складу.
        // Включать повтор можно только точечно и только там, где это безопасно.
        retry: 0,
      },
    },
  }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
