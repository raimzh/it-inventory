"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { useScanner, type DroppedScan, type ScanEvent } from "@/hooks/useScanner";
import { feedback } from "@/lib/feedback";
import { parseScanCode } from "@/lib/scan-code";
import { DEFAULT_SCAN_CONFIG } from "@/lib/scan-buffer";
import { installScanSimulator, simulateScan, SCAN_PROFILES, type ScanProfile } from "@/lib/scan-sim";
import { useScannerPrefs } from "@/store/scanner-prefs.store";
import { ScanLine, Volume2, VolumeX, Vibrate, Play } from "lucide-react";

/**
 * Отладка приёма сканов.
 *
 * Существует ради вопросов, на которые нельзя ответить без живого железа:
 * приходят ли нажатия с нормальным `key` (а не через IME), какова реальная
 * скорость набора у конкретной модели, шлёт ли Chainway Enter, работает ли
 * вибрация. Пороги распознавания настраиваются по этим замерам, а не наугад.
 *
 * Порядок: открыть на устройстве, нажать «Начать», отсканировать несколько
 * этикеток, прислать скриншот.
 */

interface RawKey {
  key: string;
  code: string;
  keyCode: number;
  at: number;
}

interface LogEntry {
  id: number;
  kind: "emit" | "drop";
  text: string;
  detail: string;
  intervals: number[];
}

export default function ScanDebugPage() {
  const [ready, setReady] = useState(false);
  const [audioOk, setAudioOk] = useState(false);
  const [rawKeys, setRawKeys] = useState<RawKey[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [last, setLast] = useState<ScanEvent | null>(null);
  const nextId = useRef(1);
  const { muted, vibration, setMuted, setVibration } = useScannerPrefs();

  const push = (entry: Omit<LogEntry, "id">) =>
    setLog(prev => [{ ...entry, id: nextId.current++ }, ...prev].slice(0, 20));

  const { suspended } = useScanner({
    onScan: (scan) => {
      setLast(scan);
      const parsed = parseScanCode(scan.code);
      feedback.success();
      push({
        kind: "emit",
        text: scan.code,
        detail: `завершение: ${scan.terminator === "enter" ? "Enter" : "пауза"} · тип этикетки: ${parsed.kind}${parsed.id ? " · id есть" : ""}`,
        intervals: scan.intervals,
      });
    },
    onDropped: (d: DroppedScan) => {
      const why = { "too-short": "слишком короткий", "too-slow": "слишком медленно (похоже на набор руками)", duplicate: "повтор того же кода" }[d.reason];
      feedback.error();
      push({ kind: "drop", text: d.buffer || "(пусто)", detail: `отброшено: ${why}`, intervals: d.intervals });
    },
  });

  // Сырые нажатия — отдельно от автомата: именно здесь видно, приходит ли
  // ввод через IME (key === "Unidentified", keyCode 229), из-за чего весь
  // подход с прослушиванием document перестал бы работать.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setRawKeys(prev => [...prev.slice(-39), { key: e.key, code: e.code, keyCode: e.keyCode, at: e.timeStamp }]);
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  useEffect(() => installScanSimulator(), []);

  const start = async () => {
    setAudioOk(await feedback.unlock());
    setReady(true);
    try {
      // Экран не должен гаснуть посреди пересчёта
      await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<unknown> } }).wakeLock?.request("screen");
    } catch {
      // Не поддерживается или отказано — не повод мешать работе
    }
  };

  const stats = useMemo(() => {
    const all = log.flatMap(l => l.intervals);
    if (!all.length) return null;
    const sorted = [...all].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      count: all.length,
      min: Math.round(sorted[0]),
      median: Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2),
      max: Math.round(sorted[sorted.length - 1]),
      overLimit: all.filter(i => i > DEFAULT_SCAN_CONFIG.maxKeyIntervalMs).length,
    };
  }, [log]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Header title="Отладка сканера" />

      <div className="p-5 space-y-4 overflow-y-auto">
        {!ready ? (
          <button onClick={start} className="card w-full p-8 flex flex-col items-center gap-3 text-center">
            <ScanLine className="w-12 h-12 text-primary-600" />
            <span className="text-xl font-semibold">Начать</span>
            <span className="text-sm text-gray-500 dark:text-slate-400 max-w-md">
              Одно нажатие включает звук — браузер на Android иначе его не разрешает — и не даёт экрану гаснуть.
              После этого сканируйте этикетки подряд.
            </span>
          </button>
        ) : (
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <span className={`text-sm font-semibold ${audioOk ? "text-emerald-600" : "text-amber-600"}`}>
              {audioOk ? "Звук включён" : "Звук не включился — сигналов слышно не будет"}
            </span>
            <button onClick={() => setMuted(!muted)} className="btn-secondary" aria-label="Звук">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {muted ? "Звук выключен" : "Звук включён"}
            </button>
            <button onClick={() => setVibration(!vibration)} className="btn-secondary">
              <Vibrate className="w-4 h-4" />
              {vibration ? "Вибрация включена" : "Вибрация выключена"}
            </button>
            {suspended && (
              <span className="text-sm font-semibold text-amber-600">Курсор в поле ввода — приём приостановлен</span>
            )}
          </div>
        )}

        {/* Проверка сигналов */}
        <div className="card p-4">
          <div className="label mb-2">Проверка сигналов</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => feedback.capture()}>Захват</Button>
            <Button size="sm" variant="secondary" onClick={() => feedback.success()}>Успех</Button>
            <Button size="sm" variant="secondary" onClick={() => feedback.duplicate()}>Повтор</Button>
            <Button size="sm" variant="secondary" onClick={() => feedback.error()}>Ошибка</Button>
            <Button size="sm" variant="secondary" onClick={() => navigator.vibrate?.(200)}>Только вибрация</Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
            Сигналы различаются длительностью и количеством, а не только высотой — чтобы разбирались в шуме.
          </p>
        </div>

        {/* Имитация без железа */}
        <div className="card p-4">
          <div className="label mb-2">Имитация ввода (без сканера)</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SCAN_PROFILES) as ScanProfile[]).map(p => (
              <Button key={p} size="sm" variant="secondary" icon={<Play className="w-3.5 h-3.5" />}
                onClick={() => simulateScan(p === "human" ? "привет как дела" : "4600051000057", p)}>
                {SCAN_PROFILES[p].label}
              </Button>
            ))}
          </div>
        </div>

        {/* Замеры */}
        <div className="card p-4">
          <div className="label mb-2">Интервалы между символами</div>
          {stats ? (
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-gray-500 dark:text-slate-400">замеров:</span> <b>{stats.count}</b></div>
              <div><span className="text-gray-500 dark:text-slate-400">мин:</span> <b>{stats.min} мс</b></div>
              <div><span className="text-gray-500 dark:text-slate-400">медиана:</span> <b>{stats.median} мс</b></div>
              <div><span className="text-gray-500 dark:text-slate-400">макс:</span> <b>{stats.max} мс</b></div>
              <div>
                <span className="text-gray-500 dark:text-slate-400">выше порога {DEFAULT_SCAN_CONFIG.maxKeyIntervalMs} мс:</span>{" "}
                <b className={stats.overLimit ? "text-amber-600" : "text-emerald-600"}>{stats.overLimit}</b>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">Отсканируйте что-нибудь — здесь появятся замеры.</p>
          )}
          {last && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 font-mono break-all">
              последний скан: {last.intervals.map(i => Math.round(i)).join(" · ")} мс
            </p>
          )}
        </div>

        {/* Разобранные сканы */}
        <div className="card p-4">
          <div className="label mb-2">Что распозналось</div>
          {log.length === 0 && <p className="text-sm text-gray-500 dark:text-slate-400">Пока пусто.</p>}
          <div className="space-y-1.5">
            {log.map(entry => (
              <div key={entry.id} className={`rounded-lg px-3 py-2 text-sm ${entry.kind === "emit"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                : "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200"}`}>
                <div className="font-mono font-semibold break-all">{entry.text}</div>
                <div className="text-xs opacity-80">{entry.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Сырые нажатия */}
        <div className="card p-4">
          <div className="label mb-2">Сырые нажатия</div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
            Если здесь <code>key</code> равен <code>Unidentified</code> или <code>keyCode</code> равен 229 — ввод идёт
            через экранную клавиатуру, и подход придётся менять. Ожидаются обычные символы.
          </p>
          <div className="font-mono text-xs bg-gray-50 dark:bg-slate-800/60 rounded-lg p-3 max-h-48 overflow-y-auto break-all">
            {rawKeys.length === 0
              ? <span className="text-gray-400">—</span>
              : rawKeys.map((k, i) => (
                  <span key={i} className={k.key === "Unidentified" || k.keyCode === 229 ? "text-red-600 font-bold" : ""}>
                    {k.key === " " ? "␣" : k.key}
                    {i < rawKeys.length - 1 ? " " : ""}
                  </span>
                ))}
          </div>
        </div>

        <div className="card p-4 text-xs text-gray-500 dark:text-slate-400 space-y-1">
          <div className="label mb-1">Текущие пороги</div>
          <div>интервал не более {DEFAULT_SCAN_CONFIG.maxKeyIntervalMs} мс · доля быстрых от {DEFAULT_SCAN_CONFIG.fastRatio}</div>
          <div>пауза-завершение {DEFAULT_SCAN_CONFIG.idleTerminatorMs} мс · минимум {DEFAULT_SCAN_CONFIG.minLength} символа</div>
          <div>подавление повтора {DEFAULT_SCAN_CONFIG.dedupeWindowMs} мс</div>
        </div>
      </div>
    </div>
  );
}
