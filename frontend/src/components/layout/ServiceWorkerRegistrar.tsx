"use client";
import { useEffect } from "react";

/**
 * Регистрация сервис-воркера (public/sw.js).
 *
 * Ничего не рисует — висит в корневом layout ради побочного эффекта.
 *
 * Регистрируется только в проде и только в защищённом контексте: по
 * http сервис-воркеры браузером запрещены (кроме localhost), а в dev от
 * него один вред — статика с хэшами попадёт в кэш и правки перестанут
 * доезжать до браузера. В dev воркер, наоборот, снимается: иначе он
 * останется от прод-сборки на том же localhost и будет часами отдавать
 * чужие файлы, а искать это будут в коде.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => void reg.unregister());
      }).catch(() => {});
      return;
    }

    if (!window.isSecureContext) return;

    // После load: регистрация тянет precache, и соревноваться за канал с
    // первой отрисовкой страницы ей незачем
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Молча: воркер — улучшение, а не условие работы. Ошибку видно
        // в DevTools, а баннер «не удалось зарегистрировать» кладовщику
        // ничего не говорит
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
