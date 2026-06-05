"use client";
import { useEffect, useRef, useState } from "react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const divId = "qr-scanner-container";

  useEffect(() => {
    let scanner: any;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      scanner = new Html5Qrcode(divId);
      scannerRef.current = scanner;
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // Parse INV:XXX|ID:YYY format
          const match = decodedText.match(/INV:([^|]+)/);
          const invNumber = match ? match[1] : decodedText;
          onScan(invNumber);
          scanner.stop();
        },
        () => {}
      ).catch((err: any) => setError(`Ошибка камеры: ${err}`));
    }).catch(() => setError("Библиотека сканирования не доступна"));

    return () => { if (scannerRef.current) scannerRef.current.stop().catch(() => {}); };
  }, [onScan]);

  return (
    <div className="text-center">
      {error ? (
        <div className="p-4 text-red-600 text-sm">{error}</div>
      ) : (
        <div id={divId} className="mx-auto w-full max-w-sm rounded-lg overflow-hidden" />
      )}
      <p className="text-xs text-gray-400 mt-3">Наведите камеру на QR-код ОС</p>
      <button onClick={onClose} className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline">Отмена</button>
    </div>
  );
}