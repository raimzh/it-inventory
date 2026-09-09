"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth.store";
import { useTableColumns } from "@/store/table-columns.store";
import {
  resolveOrder, visibleColumns, isCustomized, BREAKPOINT_HINT,
} from "@/lib/table-columns";
import { GripVertical, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";

/**
 * Настройка колонок таблицы ОС.
 *
 * Порядок меняется двумя способами намеренно. Перетаскивание удобнее мышью,
 * но встроенный в браузер механизм перетаскивания на сенсорных экранах не
 * работает вовсе, а половина работы идёт с терминалов сбора данных. Поэтому
 * рядом всегда есть стрелки — они же выручают при работе с клавиатуры.
 */
export function ColumnSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const userId = useAuthStore(s => s.user?.id) ?? "anon";
  const config = useTableColumns(s => s.byUser[userId]);
  const toggle = useTableColumns(s => s.toggle);
  const move = useTableColumns(s => s.move);
  const reorder = useTableColumns(s => s.reorder);
  const reset = useTableColumns(s => s.reset);

  const [dragKey, setDragKey] = useState<string | null>(null);

  const columns = resolveOrder(config?.order);
  const visible = new Set(visibleColumns(config).map(c => c.key));
  const lastOne = visible.size <= 1;

  return (
    <Modal open={open} onClose={onClose} title="Настроить колонки" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Скрытые колонки убираются из таблицы и из фильтров, но данные
          остаются на месте. Настройка сохраняется для вас и не меняет вид
          таблицы у других.
        </p>

        <ul className="flex flex-col gap-1">
          {columns.map((col, i) => {
            const on = visible.has(col.key);
            return (
              <li
                key={col.key}
                draggable
                onDragStart={() => setDragKey(col.key)}
                onDragEnd={() => setDragKey(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragKey && dragKey !== col.key) reorder(userId, dragKey, col.key);
                  setDragKey(null);
                }}
                className={[
                  "flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors",
                  "border-gray-100 dark:border-slate-800",
                  dragKey === col.key
                    ? "opacity-50 border-primary-300 dark:border-primary-700"
                    : "hover:bg-gray-50 dark:hover:bg-slate-800/50",
                ].join(" ")}
              >
                <GripVertical className="w-4 h-4 text-gray-300 dark:text-slate-600 cursor-grab shrink-0" />

                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-sm truncate ${on
                    ? "text-gray-800 dark:text-slate-200"
                    : "text-gray-400 dark:text-slate-500"}`}
                  >
                    {col.label}
                  </span>
                  {BREAKPOINT_HINT[col.breakpoint] && (
                    <span className="text-[11px] text-gray-400 dark:text-slate-500">
                      видна {BREAKPOINT_HINT[col.breakpoint]}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`Поднять «${col.label}»`}
                    disabled={i === 0}
                    onClick={() => move(userId, col.key, -1)}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-25 disabled:hover:text-gray-400"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Опустить «${col.label}»`}
                    disabled={i === columns.length - 1}
                    onClick={() => move(userId, col.key, 1)}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-25 disabled:hover:text-gray-400"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Последнюю видимую колонку скрыть нельзя: пустая таблица
                    выглядит как поломка, а вернуть колонку было бы неоткуда */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Скрыть" : "Показать"} «${col.label}»`}
                  disabled={on && lastOne}
                  title={on && lastOne ? "Хотя бы одна колонка должна остаться" : undefined}
                  onClick={() => toggle(userId, col.key)}
                  className={[
                    "relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                    on ? "bg-primary-600" : "bg-gray-200 dark:bg-slate-700",
                  ].join(" ")}
                >
                  {/* left-0 обязателен. Без него absolute считается от
                      статической позиции, а button центрирует содержимое —
                      кружок уезжал вправо и вылезал за дорожку на треть
                      своей ширины */}
                  <span
                    className={[
                      "absolute left-0 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform",
                      on ? "translate-x-[1.125rem]" : "translate-x-0.5",
                    ].join(" ")}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-3 justify-between items-center pt-1">
          <Button
            variant="ghost" size="sm"
            disabled={!isCustomized(config)}
            onClick={() => reset(userId)}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Сбросить настройки
          </Button>
          <Button onClick={onClose}>Готово</Button>
        </div>
      </div>
    </Modal>
  );
}
