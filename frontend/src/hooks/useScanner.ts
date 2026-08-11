"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createScanBuffer,
  type DropReason,
  type ScanBufferConfig,
  type ScanEmit,
} from "@/lib/scan-buffer";

/**
 * Приём кодов со сканера штрихкодов.
 *
 * Слушаем keydown на document, а НЕ ждём фокуса в скрытом поле. Почему так:
 *  • на Android фокус в текстовом поле поднимает экранную клавиатуру и
 *    съедает треть экрана;
 *  • подход «сфокусированное поле» требует возвращать фокус после каждого
 *    касания — это ровно тот баг, который здесь и чинится: на странице
 *    инвентаризации любое касание списка или таблицы навсегда уводило фокус,
 *    и сканы переставали доходить;
 *  • при перерисовке React фокус теряется, и скан в этот момент пропадает.
 * Так же советует и сама Zebra для веб-приложений в режиме Keystroke.
 *
 * Фаза capture — чтобы нас не перехватил обработчик модального окна.
 * preventDefault не вызываем: решать «это скан» на первом символе невозможно,
 * а нужды нет — ввод в текстовые поля мы и так пропускаем мимо.
 */

export interface ScanEvent extends ScanEmit {}

export interface DroppedScan {
  reason: DropReason;
  buffer: string;
  intervals: number[];
}

export interface UseScannerOptions {
  onScan: (event: ScanEvent) => void;
  /** Срабатывает в момент захвата, ДО любых обращений к серверу */
  onCapture?: (event: ScanEvent) => void;
  /** Отбракованный ввод — нужен отладочному экрану */
  onDropped?: (dropped: DroppedScan) => void;
  enabled?: boolean;
  config?: Partial<ScanBufferConfig>;
}

export interface UseScannerState {
  /** Фокус в поле для ручного ввода — приём приостановлен */
  suspended: boolean;
  lastScan: ScanEvent | null;
}

const TEXT_INPUT_TYPES = new Set([
  "text", "search", "number", "password", "email", "tel", "url", "date", "datetime-local", "time",
]);

/**
 * Ввод перехватываем везде, КРОМЕ полей, куда человек печатает руками.
 * Списки, кнопки, ячейки таблиц и всплывающие уведомления фокус не «крадут» —
 * в этом и состоит исправление.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.dataset.scanCapture !== undefined) return false; // поле явно участвует в сканировании
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type?.toLowerCase() || "text";
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

export function useScanner({
  onScan,
  onCapture,
  onDropped,
  enabled = true,
  config,
}: UseScannerOptions): UseScannerState {
  const [suspended, setSuspended] = useState(false);
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);

  // Через ссылки, чтобы смена обработчика не пересоздавала слушатель.
  // Присваивание — в эффекте, а не в теле: рендер под конкурентным React
  // может быть отброшен, и запись во время него оставила бы неверное значение.
  const onScanRef = useRef(onScan);
  const onCaptureRef = useRef(onCapture);
  const onDroppedRef = useRef(onDropped);
  useEffect(() => {
    onScanRef.current = onScan;
    onCaptureRef.current = onCapture;
    onDroppedRef.current = onDropped;
  });

  const configKey = JSON.stringify(config ?? {});

  const emit = useCallback((scan: ScanEvent) => {
    setLastScan(scan);
    onCaptureRef.current?.(scan);
    onScanRef.current(scan);
  }, []);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const buffer = createScanBuffer(config);
    let timer: number | undefined;

    const clear = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const apply = (result: ReturnType<typeof buffer.feedKey>) => {
      switch (result.action) {
        case "arm":
          clear();
          timer = window.setTimeout(() => {
            timer = undefined;
            apply(buffer.feedTimeout(performance.now()));
          }, Math.max(0, result.timeoutAt - performance.now()));
          break;
        case "emit":
          clear();
          emit(result.scan);
          break;
        case "drop":
          clear();
          onDroppedRef.current?.({
            reason: result.reason,
            buffer: result.buffer,
            intervals: result.intervals,
          });
          break;
        default:
          break;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      if (isTypingTarget(e.target)) {
        buffer.reset();
        clear();
        return;
      }
      apply(buffer.feedKey(e.key, e.timeStamp || performance.now()));
    };

    const syncSuspended = () => setSuspended(isTypingTarget(document.activeElement));

    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("focusin", syncSuspended);
    document.addEventListener("focusout", syncSuspended);
    syncSuspended();

    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("focusin", syncSuspended);
      document.removeEventListener("focusout", syncSuspended);
      clear();
    };
    // configKey сериализует config: объектный литерал в пропсах иначе
    // пересоздавал бы слушатель на каждый рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, configKey, emit]);

  return { suspended, lastScan };
}
