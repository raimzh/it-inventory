"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { feedback } from "@/lib/feedback";

/**
 * Настройки отдачи оператору.
 *
 * Хранятся на устройстве: в цеху звук нужен, в кабинете он раздражает, и без
 * такой настройки человек просто выключит звук у всего планшета — а вместе с
 * ним и сигнал ошибки, ради которого всё и делалось.
 */
interface ScannerPrefsState {
  muted: boolean;
  vibration: boolean;
  setMuted: (value: boolean) => void;
  setVibration: (value: boolean) => void;
}

export const useScannerPrefs = create<ScannerPrefsState>()(
  persist(
    (set) => ({
      muted: false,
      vibration: true,
      setMuted: (muted) => {
        feedback.setMuted(muted);
        set({ muted });
      },
      setVibration: (vibration) => {
        feedback.setVibration(vibration);
        set({ vibration });
      },
    }),
    {
      name: "scanner-prefs",
      onRehydrateStorage: () => (state) => {
        // Сохранённые настройки нужно донести до самого модуля звука:
        // он ничего не знает про хранилище
        if (!state) return;
        feedback.setMuted(state.muted);
        feedback.setVibration(state.vibration);
      },
    },
  ),
);
