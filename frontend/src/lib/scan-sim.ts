/**
 * Имитация ввода со сканера — чтобы проверять экраны без физического ТСД.
 *
 * Рассыпает строку в события keydown с заданным интервалом. Профили
 * соответствуют реальным устройствам, включая отсутствие Enter у Chainway.
 *
 * Доступно только вне продакшена. Подключается на отладочном экране, оттуда
 * же можно дёрнуть из консоли браузера:
 *
 *   __scan('4600051000057')                 // профиль Zebra
 *   __scan('4600051000057', 'chainway')     // без Enter, завершение по паузе
 *   __scan('привет', 'human')               // НЕ должно распознаться
 */

export type ScanProfile = "zebra" | "chainway" | "human";

const PROFILES: Record<ScanProfile, { intervalMs: number; enter: boolean; label: string }> = {
  zebra: { intervalMs: 15, enter: true, label: "Zebra — быстро, с Enter" },
  chainway: { intervalMs: 15, enter: false, label: "Chainway — быстро, без Enter" },
  human: { intervalMs: 180, enter: false, label: "человек — медленно, распознаваться не должно" },
};

export const SCAN_PROFILES = PROFILES;

function press(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export async function simulateScan(code: string, profile: ScanProfile = "zebra"): Promise<void> {
  const { intervalMs, enter } = PROFILES[profile];
  for (const ch of code) {
    press(ch);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  if (enter) press("Enter");
}

/** Вешает __scan на window. Вызывать только вне продакшена. */
export function installScanSimulator(): () => void {
  if (typeof window === "undefined") return () => {};
  (window as unknown as Record<string, unknown>).__scan = simulateScan;
  return () => {
    delete (window as unknown as Record<string, unknown>).__scan;
  };
}
