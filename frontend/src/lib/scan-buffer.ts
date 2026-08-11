/**
 * Распознавание ввода со сканера штрихкодов.
 *
 * Терминалы сбора данных (Zebra DataWedge в режиме Keystroke, Chainway
 * Keyboard Emulator в режиме Keyboard Input) отдают код как обычные нажатия
 * клавиш. Отличить их от человека можно по скорости: сканер выдаёт символы
 * быстрее ~30 мс, человек даже в рывке не быстрее ~60 мс.
 *
 * Завершение — по Enter ЛИБО по паузе. Только на Enter полагаться нельзя:
 * на части прошивок Chainway суффикс не передаётся вовсе.
 *
 * Здесь намеренно нет ни DOM, ни React: это чистый автомат, который можно
 * прогнать тестами без браузера. Иначе тайминги проверялись бы только ручным
 * тыком в живое железо. Всё, что связано с событиями, — в useScanner.
 */

export interface ScanBufferConfig {
  /** Предел интервала между символами, чтобы считать ввод машинным, мс */
  maxKeyIntervalMs: number;
  /** Какая доля интервалов должна уложиться в предел (0..1) */
  fastRatio: number;
  /** Короче этого код не рассматривается */
  minLength: number;
  /** Пауза, после которой код считается завершённым без Enter, мс */
  idleTerminatorMs: number;
  /** Окно подавления повторного чтения того же кода, мс */
  dedupeWindowMs: number;
}

export const DEFAULT_SCAN_CONFIG: ScanBufferConfig = {
  // 35 мс лежит в широкой «мёртвой зоне»: сканеры укладываются в 30,
  // человек не спускается ниже 60.
  maxKeyIntervalMs: 35,
  // Не требуем, чтобы УСПЕЛИ все интервалы: сборка мусора или перерисовка
  // React способны задержать одно событие на 50-80 мс. Требование «100%»
  // давало бы редкие пропуски скана — худший вид отказа, потому что
  // оператор не слышит ничего и не знает, повторять или нет.
  fastRatio: 0.75,
  minLength: 4,
  // Заметно больше худшего разрыва внутри очереди (~3×30 мс) и заметно
  // меньше того, с какой частотой человек способен жать курок.
  idleTerminatorMs: 90,
  dedupeWindowMs: 1200,
};

export type ScanTerminator = 'enter' | 'timeout';
export type DropReason = 'too-short' | 'too-slow' | 'duplicate';

export interface ScanEmit {
  code: string;
  terminator: ScanTerminator;
  /** Интервалы между символами — нужны отладочному экрану для настройки порогов */
  intervals: number[];
  at: number;
}

export type FeedResult =
  | { action: 'none' }
  /** Символ принят; вызывающий должен перевзвести таймер паузы на timeoutAt */
  | { action: 'arm'; timeoutAt: number }
  | { action: 'emit'; scan: ScanEmit }
  | { action: 'drop'; reason: DropReason; buffer: string; intervals: number[] };

/**
 * Клавиши-модификаторы не сбрасывают набор: в некоторых раскладках сканера
 * заглавной букве предшествует Shift. Всё остальное непечатное (Escape,
 * Backspace, стрелки) означает, что это не скан.
 */
const MODIFIERS = new Set(['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'AltGraph', 'Dead', 'Unidentified']);
const TERMINATORS = new Set(['Enter', 'NumpadEnter', 'Tab']);

/**
 * Ниже этого порога набранное считается случайным нажатием, а не отброшенным
 * сканом, и не сообщается вовсе.
 *
 * Иначе получается вот что: человек печатает с интервалом ~180 мс, пауза
 * завершения — 90 мс, поэтому КАЖДЫЙ символ успевает «истечь» в одиночку.
 * Каждый давал бы отбраковку, а страница — сигнал ошибки на каждое нажатие.
 * Проверено на живой странице: набор «привет как дела» дал пятнадцать
 * отбраковок подряд.
 */
const NOISE_FLOOR = 2;

export function createScanBuffer(cfg: Partial<ScanBufferConfig> = {}) {
  const config: ScanBufferConfig = { ...DEFAULT_SCAN_CONFIG, ...cfg };

  let buf: string[] = [];
  let intervals: number[] = [];
  let lastAt: number | null = null;
  let lastEmit: { code: string; at: number } | null = null;

  const reset = () => {
    buf = [];
    intervals = [];
    lastAt = null;
  };

  const isFastEnough = () => {
    if (intervals.length === 0) return false;
    const fast = intervals.filter(i => i <= config.maxKeyIntervalMs).length;
    return fast / intervals.length >= config.fastRatio;
  };

  const finish = (terminator: ScanTerminator, at: number): FeedResult => {
    const code = buf.join('');
    const captured = [...intervals];
    reset();

    // Подавление физического двойного чтения: удержанный курок, повторное
    // декодирование, гонка Enter и паузы. «Оператор отсканировал одно и то же
    // дважды» — совсем другое событие, оно определяется на странице по
    // накопленному состоянию и обязано быть слышно.
    if (lastEmit && lastEmit.code === code && at - lastEmit.at < config.dedupeWindowMs) {
      return { action: 'drop', reason: 'duplicate', buffer: code, intervals: captured };
    }

    lastEmit = { code, at };
    return { action: 'emit', scan: { code, terminator, intervals: captured, at } };
  };

  return {
    /** Одно нажатие клавиши. `at` — метка времени события, мс. */
    feedKey(key: string, at: number): FeedResult {
      if (MODIFIERS.has(key)) return { action: 'none' };

      if (TERMINATORS.has(key)) {
        if (buf.length === 0) return { action: 'none' };
        if (buf.length < config.minLength) {
          const code = buf.join('');
          const captured = [...intervals];
          // Длину запоминаем ДО сброса: после него buf — уже новый пустой массив
          const wasNoise = buf.length < NOISE_FLOOR;
          reset();
          if (wasNoise) return { action: 'none' };
          return { action: 'drop', reason: 'too-short', buffer: code, intervals: captured };
        }
        // Скорость при явном терминаторе не проверяем: на устройстве без
        // физической клавиатуры Enter при непустом наборе — это скан почти
        // наверняка, и строгость здесь только ломала бы Zebra на подтормаживании.
        return finish('enter', at);
      }

      if (key.length === 1) {
        if (lastAt !== null) intervals.push(at - lastAt);
        buf.push(key);
        lastAt = at;
        return { action: 'arm', timeoutAt: at + config.idleTerminatorMs };
      }

      reset();
      return { action: 'none' };
    },

    /** Сработала пауза — путь Chainway, где Enter может не прийти. */
    feedTimeout(at: number): FeedResult {
      if (buf.length === 0) return { action: 'none' };

      if (buf.length < config.minLength) {
        const code = buf.join('');
        const captured = [...intervals];
        const wasNoise = buf.length < NOISE_FLOOR;
        reset();
        if (wasNoise) return { action: 'none' };
        return { action: 'drop', reason: 'too-short', buffer: code, intervals: captured };
      }

      if (!isFastEnough()) {
        const code = buf.join('');
        const captured = [...intervals];
        reset();
        return { action: 'drop', reason: 'too-slow', buffer: code, intervals: captured };
      }

      return finish('timeout', at);
    },

    reset,
    peek: () => buf.join(''),
    config,
  };
}
