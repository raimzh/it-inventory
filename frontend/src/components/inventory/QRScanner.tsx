"use client";
import { useEffect, useRef, useState } from "react";
// Тип берём отдельно от самой библиотеки: код грузится динамически,
// чтобы 300 КБ декодера не попадали в основной бандл страницы
import type { Html5Qrcode as Html5QrcodeInstance } from "html5-qrcode";
import { scanBoxSize } from "@/lib/scan-box";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

/**
 * Сканирование этикетки камерой планшета.
 *
 * Две вещи здесь неочевидны и обе уже ломали работу.
 *
 * 1. html5-qrcode бросает `Cannot stop, scanner is not running or paused.`
 *    СИНХРОННО, а не отклонённым промисом. Поэтому `.catch()` на нём не
 *    срабатывает, исключение улетает из useEffect и React показывает
 *    «Что-то пошло не так» вместо камеры. Останов обёрнут в safeStop.
 *
 * 2. Эффект НЕ зависит от onScan. Раньше зависел — а страница передаёт
 *    туда стрелку, то есть новую функцию на каждый рендер. Камера
 *    останавливалась и запускалась заново при любом обновлении страницы,
 *    причём останов приходился на момент, когда запуск ещё не завершился,
 *    и срабатывал пункт 1. Колбэк лежит в ref, эффект выполняется один раз.
 *
 * Рамка наведения — широкая, а не квадратная: на технике наклеены
 * линейные коды Code 128 с инвентарным номером (см. lib/code128.ts).
 * В квадрат 250x250 такая наклейка целиком помещается только издалека,
 * где разрешения уже не хватает, — именно так выглядит «штрихкод не
 * сканируется».
 */
export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  const divId = "qr-scanner-container";

  // Обновление ref вынесено в эффект: писать в ref во время рендера
  // React запрещает. Начальное значение уже положено в useRef, так что
  // колбэк доступен с первого кадра
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let scanner: Html5QrcodeInstance | null = null;
    let stopped = false;

    /** Остановить, не уронив страницу: см. пункт 1 в комментарии выше */
    const safeStop = () => {
      stopped = true;
      if (!scanner) return;
      try {
        const p = scanner.stop();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // уже остановлен или ещё не запущен — ничего делать не нужно
      }
      scanner = null;
    };

    import("html5-qrcode")
      .then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
        // Размонтировали, пока грузилась библиотека
        if (stopped) return;

        scanner = new Html5Qrcode(divId, {
          verbose: false,
          // Только нужные форматы: на этом планшете (Android 9) перебор
          // всех подряд заметно замедляет распознавание
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });

        return scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // Рамка под линейный код: широкая и невысокая. Функция, а
            // не числа, — чтобы считалось от реального размера кадра
            qrbox: scanBoxSize,
          },
          (decodedText: string) => {
            // Код отдаётся как есть, без разбора: форматов этикеток два
            // (INV:номер|ID:uuid у ОС и SKU:артикул|ID:uuid у склада), и
            // разбирает их parseScanCode. Своя копия логики здесь уже была
            // и понимала только первый формат
            onScanRef.current(decodedText);
            safeStop();
          },
          () => {}
        ).catch((err: unknown) => {
          const name = (err as { name?: string })?.name;
          if (name === "NotAllowedError") {
            setError("Доступ к камере запрещён. Разрешите камеру для сайта в настройках браузера.");
          } else if (name === "NotFoundError") {
            setError("Камера не найдена.");
          } else {
            setError(`Не удалось включить камеру: ${err}`);
          }
        });
      })
      .catch(() => setError("Библиотека сканирования не доступна"));

    return safeStop;
  }, []);

  return (
    <div className="text-center">
      {error ? (
        <div className="p-4 text-red-600 text-sm">{error}</div>
      ) : (
        <div id={divId} className="mx-auto w-full max-w-sm rounded-lg overflow-hidden" />
      )}
      <p className="text-xs text-gray-400 mt-3">Наведите камеру на код на наклейке</p>
      <button onClick={onClose} className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline">Отмена</button>
    </div>
  );
}
