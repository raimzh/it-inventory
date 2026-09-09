"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { preferencesApi } from "@/lib/api";
import {
  ColumnConfig, DEFAULT_CONFIG,
  toggleColumn, moveColumn, reorderColumns,
} from "@/lib/table-columns";

/**
 * Настройка колонок таблицы ОС.
 *
 * Хранится на сервере, привязанной к пользователю: терминал на складе
 * делят несколько человек, и настройка кладовщика не должна менять вид
 * таблицы у бухгалтера, а сам кладовщик должен увидеть свой вид с любого
 * рабочего места.
 *
 * Копия в браузере при этом остаётся — как кэш, а не как хранилище:
 *
 *   • таблица рисуется сразу, не мигая стандартным набором колонок,
 *     пока идёт запрос к серверу;
 *   • при недоступной сети (Wi-Fi на складе не образцовый) настройка
 *     продолжает работать, а изменения уедут на сервер при следующем
 *     удачном сохранении.
 *
 * Правило разрешения расхождений простое: при загрузке выигрывает сервер.
 * Он один общий для всех устройств, а локальная копия — снимок, который
 * мог устареть, пока человек работал с другого компьютера.
 */
const PREF_KEY = "asset-table-columns";

/** Задержка перед отправкой: стрелки перестановки нажимают подряд */
const SAVE_DEBOUNCE_MS = 600;

interface TableColumnsState {
  /** Ключ — идентификатор пользователя; «anon» до входа в систему */
  byUser: Record<string, ColumnConfig>;
  /** У кого настройка уже прочитана с сервера — чтобы не запрашивать повторно */
  hydrated: Record<string, boolean>;
  hydrate: (userId: string) => Promise<void>;
  toggle: (userId: string, key: string) => void;
  move: (userId: string, key: string, direction: -1 | 1) => void;
  reorder: (userId: string, fromKey: string, toKey: string) => void;
  reset: (userId: string) => void;
}

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Отложенная отправка на сервер.
 *
 * Сбой намеренно только логируется: настройка колонок не та вещь, ради
 * которой стоит показывать пользователю ошибку и тем более откатывать
 * его действие. Локальная копия уже сохранена, следующее изменение
 * увезёт всё разом.
 */
function saveLater(userId: string, config: ColumnConfig) {
  clearTimeout(timers[userId]);
  timers[userId] = setTimeout(() => {
    preferencesApi.set(PREF_KEY, config).catch(err => {
      console.warn("[columns] настройка не сохранена на сервере:", err?.message ?? err);
    });
  }, SAVE_DEBOUNCE_MS);
}

export const useTableColumns = create<TableColumnsState>()(
  persist(
    (set, get) => {
      const apply = (userId: string, fn: (config: ColumnConfig) => ColumnConfig) => {
        const next = fn(get().byUser[userId] ?? DEFAULT_CONFIG);
        set(s => ({ byUser: { ...s.byUser, [userId]: next } }));
        saveLater(userId, next);
      };

      return {
        byUser: {},
        hydrated: {},

        hydrate: async (userId) => {
          if (get().hydrated[userId]) return;
          // Помечаем сразу: страница и окно настройки монтируются вместе,
          // и без этого ушло бы два одинаковых запроса
          set(s => ({ hydrated: { ...s.hydrated, [userId]: true } }));

          try {
            const { data } = await preferencesApi.get(PREF_KEY);
            if (data?.value) {
              set(s => ({ byUser: { ...s.byUser, [userId]: data.value as ColumnConfig } }));
              return;
            }

            // На сервере пусто, а локально настройка есть — значит, она
            // осталась с тех пор, когда хранили только в браузере.
            // Переносим, иначе при первом же входе с другого устройства
            // человек молча потеряет свою настройку
            const local = get().byUser[userId];
            if (local) await preferencesApi.set(PREF_KEY, local);
          } catch {
            // Сети нет — работаем с локальной копией. Помеченный hydrated
            // снимаем, чтобы попробовать снова при следующем заходе
            set(s => ({ hydrated: { ...s.hydrated, [userId]: false } }));
          }
        },

        toggle: (userId, key) => apply(userId, c => toggleColumn(c, key)),
        move: (userId, key, direction) => apply(userId, c => moveColumn(c, key, direction)),
        reorder: (userId, fromKey, toKey) => apply(userId, c => reorderColumns(c, fromKey, toKey)),

        reset: (userId) => {
          // Именно удаление записи, а не запись значений по умолчанию: так
          // пользователь позже подхватит колонки, которых на момент сброса
          // ещё не существовало
          set(s => {
            const byUser = { ...s.byUser };
            delete byUser[userId];
            return { byUser };
          });
          clearTimeout(timers[userId]);
          preferencesApi.remove(PREF_KEY).catch(err => {
            console.warn("[columns] сброс не доехал до сервера:", err?.message ?? err);
          });
        },
      };
    },
    {
      name: PREF_KEY,
      version: 1,
      // hydrated — состояние текущей вкладки, а не настройка. Сохранив его,
      // мы бы навсегда решили, что с сервером уже свериться успели
      partialize: (s) => ({ byUser: s.byUser }),
      merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
    },
  ),
);
