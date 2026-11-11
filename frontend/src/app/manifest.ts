import type { MetadataRoute } from "next";

/**
 * Манифест для ярлыка на планшете.
 *
 * Нужен ради `display: standalone`: добавленный на рабочий стол ярлык
 * открывается без адресной строки и вкладок, как обычное приложение.
 * Без манифеста Chrome делает просто закладку, которая запускается в
 * браузере со всей его обвязкой — на планшете, где инвентаризацию ведут
 * одной рукой, это отъедает половину экрана и путает кладовщика.
 *
 * `start_url` ведёт сразу на инвентаризацию, а не на дашборд: ярлык
 * заводится ради обхода кабинетов со сканером, и лишний переход при
 * каждом запуске здесь не нужен.
 *
 * Значки квадратные и отдельные от логотипа KTMS: тот широкий
 * (3049x1000), и Android обрезал бы его по центру, оставив кусок
 * надписи.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IT Inventory — Учёт основных средств",
    short_name: "Инвентаризация",
    description: "Учёт основных средств: инвентаризация со сканером, склад, отчёты",
    start_url: "/inventory",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0e1a",
    theme_color: "#7c3aed",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable — чтобы Android вписал значок в свою форму, а не
      // обвёл белой рамкой поверх фиолетового фона
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
