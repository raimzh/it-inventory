"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ColumnConfig, DEFAULT_CONFIG,
  toggleColumn, moveColumn, reorderColumns,
} from "@/lib/table-columns";

/**
 * Настройка колонок таблицы ОС.
 *
 * Хранится по пользователю, а не одной записью на устройство: терминал на
 * складе делят несколько человек, и настройка кладовщика не должна менять
 * вид таблицы у бухгалтера.
 *
 * Хранилище — браузер, как у label-prefs и scanner-prefs. Отсюда следует
 * ограничение, о котором стоит знать: настройка привязана к устройству, и
 * тот же пользователь на другом компьютере получит вид по умолчанию.
 * Ради переноса между устройствами понадобилась бы таблица настроек в
 * базе и пара эндпоинтов; для выбора колонок это несоразмерно.
 *
 * Вся логика слияния и переупорядочивания — в lib/table-columns.ts, чтобы
 * её можно было проверить тестами без React.
 */
interface TableColumnsState {
  /** Ключ — идентификатор пользователя; «anon» до входа в систему */
  byUser: Record<string, ColumnConfig>;
  toggle: (userId: string, key: string) => void;
  move: (userId: string, key: string, direction: -1 | 1) => void;
  reorder: (userId: string, fromKey: string, toKey: string) => void;
  reset: (userId: string) => void;
}

const apply = (
  state: TableColumnsState,
  userId: string,
  fn: (config: ColumnConfig) => ColumnConfig,
): Partial<TableColumnsState> => ({
  byUser: { ...state.byUser, [userId]: fn(state.byUser[userId] ?? DEFAULT_CONFIG) },
});

export const useTableColumns = create<TableColumnsState>()(
  persist(
    (set) => ({
      byUser: {},
      toggle: (userId, key) => set(s => apply(s, userId, c => toggleColumn(c, key))),
      move: (userId, key, direction) => set(s => apply(s, userId, c => moveColumn(c, key, direction))),
      reorder: (userId, fromKey, toKey) => set(s => apply(s, userId, c => reorderColumns(c, fromKey, toKey))),
      reset: (userId) => set(s => {
        // Именно удаление записи, а не запись значений по умолчанию: так
        // пользователь позже подхватит новые колонки, которых на момент
        // сброса ещё не существовало
        const byUser = { ...s.byUser };
        delete byUser[userId];
        return { byUser };
      }),
    }),
    {
      name: "asset-table-columns",
      version: 1,
      merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
    },
  ),
);
