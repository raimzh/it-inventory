"use client";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { toast } from "@/store/toast.store";
import {
  loadAssetsByFilters, loadAssetsByIds,
  MAX_LABELS_PER_BATCH, CONFIRM_LABELS_FROM, type AssetFilters,
} from "@/lib/assets-print-source";
import type { Asset } from "@/types";
import { Printer, AlertTriangle } from "lucide-react";

interface Props {
  /** Отмеченные строки списка; пусто — печатаем всё по фильтрам */
  selectedIds: string[];
  filters: AssetFilters;
  /** Сколько ОС подходит под фильтры — из уже выполненного запроса списка */
  totalByFilters: number;
  /** Читаемая расшифровка фильтров, чтобы «по фильтру» не было котом в мешке */
  filtersLabel: string | null;
  onClose: () => void;
  onReady: (assets: Asset[], startNo: number, totalNo: number) => void;
}

/**
 * Что и с какой наклейки печатать.
 *
 * Печать пачки не запускается одним кликом из списка намеренно: четыре
 * сотни наклеек — это метр ленты, и промах стоит расходника. Отсюда же
 * порог подтверждения и жёсткий потолок.
 */
export function BulkLabelDialog({
  selectedIds, filters, totalByFilters, filtersLabel, onClose, onReady,
}: Props) {
  const bySelection = selectedIds.length > 0;
  const total = bySelection ? selectedIds.length : totalByFilters;

  const [startFrom, setStartFrom] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const start = Math.min(Math.max(1, startFrom || 1), Math.max(1, total));
  const willPrint = Math.max(0, total - start + 1);

  const tooMany = willPrint > MAX_LABELS_PER_BATCH;
  const needsConfirm = willPrint >= CONFIRM_LABELS_FROM;
  const blocked = willPrint === 0 || tooMany || (needsConfirm && !confirmed);

  const hint = useMemo(() => {
    if (willPrint === 0) return "Нечего печатать";
    if (start === 1) return `Будет напечатано ${willPrint} наклеек`;
    return `Будет напечатано ${willPrint} — с №${start} по №${total}`;
  }, [willPrint, start, total]);

  const prepare = async () => {
    setLoading(true);
    try {
      const all = bySelection
        ? await loadAssetsByIds(selectedIds)
        : await loadAssetsByFilters(filters);

      if (!all.length) { toast.error("Не удалось получить список ОС"); return; }
      // Срез — после сортировки: только тогда «начать с N-й» устойчиво
      onReady(all.slice(start - 1), start, all.length);
    } catch {
      toast.error("Не удалось загрузить ОС для печати");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Печать наклеек" size="md">
      <div className="space-y-4">
        <div className="text-sm text-gray-700 dark:text-slate-300">
          {bySelection ? (
            <>Отмечено строк: <b>{total}</b></>
          ) : (
            <>По текущему отбору: <b>{total}</b> ОС</>
          )}
          {!bySelection && filtersLabel && (
            <div className="text-xs text-gray-500 mt-1">Фильтры: {filtersLabel}</div>
          )}
          {!bySelection && !filtersLabel && (
            <div className="text-xs text-gray-500 mt-1">Фильтры не заданы — это все ОС</div>
          )}
        </div>

        <div>
          <label className="label">Начать с наклейки №</label>
          <input
            type="number" min={1} max={Math.max(1, total)} value={startFrom}
            onChange={e => setStartFrom(Number(e.target.value) || 1)}
            className="input w-32"
          />
          <p className="text-xs text-gray-500 mt-1.5">{hint}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Наклейки идут по возрастанию инвентарного номера — порядок одинаков
            при каждой печати. Если лента закончится, допечатайте остаток,
            указав здесь следующий номер.
          </p>
        </div>

        {tooMany && (
          <div className="flex gap-2 items-start text-xs text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              За раз можно напечатать не больше {MAX_LABELS_PER_BATCH}. Уточните
              отбор или печатайте частями, указав «Начать с №».
            </span>
          </div>
        )}

        {!tooMany && needsConfirm && (
          <label className="flex gap-2 items-start text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 rounded-xl px-3 py-2.5">
            <input
              type="checkbox" checked={confirmed} className="mt-0.5"
              onChange={e => setConfirmed(e.target.checked)}
            />
            <span>Да, печатать {willPrint} наклеек — это заметный расход ленты.</span>
          </label>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            icon={<Printer className="w-4 h-4" />}
            loading={loading} disabled={blocked}
            onClick={prepare}
          >
            Подготовить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
