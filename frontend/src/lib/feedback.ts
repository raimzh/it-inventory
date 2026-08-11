/**
 * Отдача оператору: звук и вибрация.
 *
 * Человек со сканером смотрит на полку, а не на экран, поэтому результат
 * должен быть слышен. Каналов три и они независимы, потому что в цеху каждый
 * по отдельности иногда не срабатывает: звук глушат наушники и шум, вибрацию
 * молча игнорируют часть прошивок Android, экран оператор не видит.
 * Третий канал — цветная плашка — живёт в компоненте.
 *
 * Сигналы различаются длительностью и КОЛИЧЕСТВОМ, а не только высотой:
 * так они разбираются на дешёвом динамике и при возрастной потере слуха.
 */

type Signal = 'capture' | 'success' | 'duplicate' | 'error';

interface Tone {
  freq: number;
  ms: number;
  type: OscillatorType;
  gain: number;
}

const TONES: Record<Signal, Tone[]> = {
  // Короткий тик в момент захвата — подтверждение ДО обращения к серверу
  capture: [{ freq: 1200, ms: 20, type: 'sine', gain: 0.06 }],
  success: [{ freq: 880, ms: 80, type: 'square', gain: 0.12 }],
  // Два коротких — «уже было»
  duplicate: [
    { freq: 660, ms: 60, type: 'square', gain: 0.12 },
    { freq: 660, ms: 60, type: 'square', gain: 0.12 },
  ],
  // Длинный и низкий — ни с чем не спутать
  error: [{ freq: 220, ms: 350, type: 'sawtooth', gain: 0.16 }],
};

const VIBRATION: Record<Signal, number | number[]> = {
  capture: 0,
  success: 40,
  duplicate: [30, 60, 30],
  error: [120, 80, 120],
};

let ctx: AudioContext | null = null;
let muted = false;
let vibrationOn = true;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

function playTone(context: AudioContext, tone: Tone, startAt: number) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = tone.type;
  osc.frequency.value = tone.freq;

  // Огибающая обязательна: резкий старт и стоп дают слышимый щелчок
  const end = startAt + tone.ms / 1000;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(tone.gain, startAt + 0.008);
  gain.gain.setValueAtTime(tone.gain, end - 0.015);
  gain.gain.linearRampToValueAtTime(0, end);

  osc.connect(gain).connect(context.destination);
  osc.start(startAt);
  osc.stop(end + 0.01);
}

function play(signal: Signal) {
  if (muted) return;
  const context = ensureContext();
  if (!context || context.state !== 'running') return;

  let at = context.currentTime;
  for (const tone of TONES[signal]) {
    playTone(context, tone, at);
    at += tone.ms / 1000 + 0.05; // пауза между сигналами в серии
  }
}

function vibrate(signal: Signal) {
  if (!vibrationOn) return;
  const pattern = VIBRATION[signal];
  if (!pattern || (Array.isArray(pattern) && pattern.length === 0)) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Часть прошивок Android просто игнорирует вызов — это нормально
  }
}

export const feedback = {
  /**
   * Разблокировка звука. Android Chrome не даёт запустить AudioContext вне
   * жеста пользователя, поэтому экраны сканирования показывают кнопку
   * «Начать сканирование»: одно нажатие в начале смены — и дальше слышно всё.
   */
  async unlock(): Promise<boolean> {
    const context = ensureContext();
    if (!context) return false;
    if (context.state !== 'running') {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }
    return context.state === 'running';
  },

  /** Готов ли звук. Если нет — экран обязан сказать об этом, а не молчать. */
  get audioReady(): boolean {
    return !muted && ctx?.state === 'running';
  },

  setMuted(value: boolean) {
    muted = value;
  },
  setVibration(value: boolean) {
    vibrationOn = value;
  },

  capture() {
    play('capture');
  },
  success() {
    play('success');
    vibrate('success');
  },
  duplicate() {
    play('duplicate');
    vibrate('duplicate');
  },
  error() {
    play('error');
    vibrate('error');
  },
};
