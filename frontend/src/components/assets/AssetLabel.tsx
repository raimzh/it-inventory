"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { code128Svg } from "@/lib/code128";
import { buildLabelPrintCss } from "@/lib/label-print";
import { Printer, X } from "lucide-react";

interface Props {
  asset: { inventoryNumber: string; name: string };
  onClose: () => void;
}

/**
 * Инвентаризационная наклейка ОС.
 *
 * Раскладка повторяет наклейки, которые уже наклеены на технику:
 * слева поле под логотип, справа сверху вниз — наименование,
 * крупный инвентарный номер, линейный штрихкод.
 *
 * Штрихкод, а не QR: сканеры уже читают линейный код с инвентарным
 * номером со старых наклеек, и новые должны читаться так же. Код несёт
 * ровно инвентарный номер — parseScanCode разбирает его как `plain`,
 * а страницы ищут по нему в своём указателе.
 *
 * Размеры заданы в миллиметрах, а не классами Tailwind: печать должна
 * попадать в физическую этикетку 58×40 мм, а не масштабироваться по экрану.
 *
 * Разметка выносится порталом прямо в body. Это нужно ради печати:
 * скрыть остальную страницу через `visibility: hidden` недостаточно —
 * скрытые элементы остаются в потоке, и длинная карточка ОС нарезается
 * на десяток страниц, из которых заполнена только первая. `display: none`
 * убирает их из потока совсем, но применить его к соседям на каждом
 * уровне вложенности можно, только когда наклейка — прямой ребёнок body.
 */

/** Физический размер этикетки в рулоне */
const LABEL_W_MM = 58;
const LABEL_H_MM = 40;
/** Ширина поля под логотип слева */
const LOGO_STRIP_MM = 8;
/**
 * Логотип лежит в `frontend/public/`. Если файла не окажется, картинка
 * скрывается по onError и наклейка печатается без логотипа, а не с
 * пустым местом на месте битого изображения.
 */
const LOGO_SRC = "/KTMS_LOGO_ORIGINAL.png";

const PORTAL_ID = "asset-label-portal";

const PRINT_CSS = `
  /* Штрихкод тянется на всю отведённую полосу: сам SVG задаёт размер
     в модулях, здесь он подгоняется под миллиметры */
  #asset-label svg { width: 100%; height: 100%; display: block; }
${buildLabelPrintCss({ portalId: PORTAL_ID, widthMm: LABEL_W_MM, heightMm: LABEL_H_MM })}`;

export function AssetLabel({ asset, onClose }: Props) {
  // createPortal требует document, которого нет при серверном рендере.
  // Ленивый инициализатор, а не эффект: наклейка монтируется по клику,
  // так что дорисовывать её вторым рендером незачем
  const [container] = useState<HTMLElement | null>(
    () => (typeof document === "undefined" ? null : document.body),
  );

  // Штрихкод не зависит от перерисовок — считаем один раз на номер
  const barcode = useMemo(
    () => code128Svg(asset.inventoryNumber, { height: 60 }),
    [asset.inventoryNumber],
  );

  if (!container) return null;

  return createPortal(
    <div id={PORTAL_ID}>
      <style>{PRINT_CSS}</style>

      <div className="no-print fixed inset-0 z-[60] bg-black/50" onClick={onClose} />

      <div className="label-shell fixed z-[61] left-1/2 -translate-x-1/2 top-8 bg-white text-black rounded-xl shadow-2xl">
        <div className="no-print flex justify-between items-center px-5 py-3 border-b gap-4">
          <span className="font-semibold">Наклейка ОС</span>
          <div className="flex gap-2">
            <Button size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>Печать</Button>
            <Button size="sm" variant="ghost" icon={<X className="w-4 h-4" />} onClick={onClose}>Закрыть</Button>
          </div>
        </div>

        <div className="label-pad p-4">
          <div
            id="asset-label"
            style={{
              width: `${LABEL_W_MM}mm`,
              height: `${LABEL_H_MM}mm`,
              display: "flex",
              alignItems: "stretch",
              background: "#fff",
              color: "#000",
              padding: "1.5mm",
              boxSizing: "border-box",
              fontFamily: "Arial, Helvetica, sans-serif",
            }}
          >
            {/* Логотип развёрнут снизу вверх, как на уже наклеенных этикетках */}
            <div
              style={{
                width: `${LOGO_STRIP_MM}mm`,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element --
                  печатный макет фиксированного размера: оптимизировать нечего */}
              <img
                src={LOGO_SRC}
                alt=""
                onError={e => { e.currentTarget.style.visibility = "hidden"; }}
                style={{
                  transform: "rotate(-90deg)",
                  // До поворота ширина идёт вдоль высоты этикетки, а высота —
                  // поперёк, по узкой полосе. Пределы заданы соответственно
                  maxWidth: `${LABEL_H_MM - 5}mm`,
                  maxHeight: `${LOGO_STRIP_MM - 1}mm`,
                  objectFit: "contain",
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.5mm" }}>
              {/* Наименование: две строки максимум, дальше обрезается —
                  на 58 мм длинное название иначе вытесняет номер */}
              <div
                style={{
                  fontSize: "2.6mm",
                  lineHeight: 1.15,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                }}
              >
                {asset.name}
              </div>

              {/* Инвентарный номер — главное, что читают глазами */}
              <div
                style={{
                  fontSize: "7mm",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "0.2mm",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                {asset.inventoryNumber}
              </div>

              <div
                style={{ marginTop: "auto", height: "9mm", width: "100%" }}
                // Штрихкод — доверенный SVG, собранный здесь же из
                // инвентарного номера, а не пришедший извне
                dangerouslySetInnerHTML={{ __html: barcode }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    container,
  );
}
