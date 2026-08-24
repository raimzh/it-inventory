"use client";
import { memo, useMemo } from "react";
import { code128Svg } from "@/lib/code128";
import type { LabelPrefs } from "@/store/label-prefs.store";

interface Props {
  asset: { inventoryNumber: string; name: string };
  prefs: LabelPrefs;
}

/**
 * Логотип лежит в public. Если файла не окажется, картинка скрывается
 * по onError и наклейка печатается без него, а не с битым изображением.
 */
const LOGO_SRC = "/KTMS_LOGO_ORIGINAL.png";

/**
 * Сама наклейка — только разметка, без портала, печати и настроек.
 *
 * Вынесена отдельно, потому что её печатают в двух режимах: по одной с
 * карточки ОС и пачкой из списка. Копия макета быстро разъехалась бы:
 * он выверен по месту (миллиметры, поворот логотипа на −90°, обрезка
 * названия двумя строками), и правка в одном месте прошла бы мимо
 * другого. Ровно так уже случилось с CSS печати, который пришлось
 * чинить дважды, прежде чем вынести в lib/label-print.
 *
 * Настройки приходят пропом, а не читаются из стора внутри: в пачке из
 * четырёх сотен наклеек это дало бы столько же подписок на zustand и
 * столько же перерисовок на каждое нажатие «+» в панели макета.
 *
 * Класс, а не id: в пачке идентификатор перестал бы быть уникальным.
 */
export const AssetLabelCard = memo(function AssetLabelCard({ asset, prefs: p }: Props) {
  // Штрихкод зависит только от номера. Сохранённая ссылка на строку важна
  // не для скорости счёта, а для dangerouslySetInnerHTML: при неизменном
  // __html React не переустанавливает разметку, и правка полей макета не
  // заставляет браузер разбирать SVG заново
  const barcode = useMemo(
    () => code128Svg(asset.inventoryNumber, { height: 60 }),
    [asset.inventoryNumber],
  );

  return (
    <div
      className="asset-label"
      style={{
        width: `${p.widthMm}mm`,
        height: `${p.heightMm}mm`,
        display: "flex",
        alignItems: "stretch",
        background: "#fff",
        color: "#000",
        paddingTop: `${p.padTopMm}mm`,
        paddingRight: `${p.padRightMm}mm`,
        paddingBottom: `${p.padBottomMm}mm`,
        paddingLeft: `${p.padLeftMm}mm`,
        boxSizing: "border-box",
        // Сдвиг компенсирует смещение подачи у принтера
        position: "relative",
        left: `${p.offsetXMm}mm`,
        top: `${p.offsetYMm}mm`,
        // Длинное наименование обрезается, а не выталкивает штрихкод
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
        outline: p.showFrame ? "1px dashed #94a3b8" : "none",
      }}
    >
      {p.logoStripMm > 0 && (
        <div
          style={{
            width: `${p.logoStripMm}mm`,
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
              maxWidth: `${Math.max(0, p.heightMm - p.padTopMm - p.padBottomMm)}mm`,
              maxHeight: `${Math.max(0, p.logoStripMm - 0.5)}mm`,
              objectFit: "contain",
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.5mm" }}>
        <div
          style={{
            fontSize: `${p.nameFontMm}mm`,
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
            fontSize: `${p.numberFontMm}mm`,
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
          style={{ marginTop: "auto", height: `${p.barcodeHeightMm}mm`, width: "100%" }}
          // Штрихкод — доверенный SVG, собранный здесь же из
          // инвентарного номера, а не пришедший извне
          dangerouslySetInnerHTML={{ __html: barcode }}
        />
      </div>
    </div>
  );
});
