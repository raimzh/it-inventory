/**
 * Состав и порядок колонок таблицы ОС.
 *
 * Чистый модуль без React и zustand: всю логику слияния сохранённой
 * настройки с текущим набором колонок можно проверить тестами, а стор
 * (store/table-columns.store.ts) остаётся тонкой обёрткой над ней.
 *
 * Главная тонкость здесь — слияние. Сохранённая у пользователя настройка
 * живёт в браузере годами, а набор колонок в коде меняется. Поэтому:
 *
 *   • колонка, которой в коде больше нет, из сохранённого порядка
 *     выбрасывается — иначе таблица пыталась бы рисовать несуществующее;
 *   • колонка, появившаяся в коде позже, ВСТАВЛЯЕТСЯ на своё место по
 *     умолчанию, а не пропадает и не уезжает в конец. Пользователь,
 *     однажды открывший настройку, иначе никогда не увидел бы новых
 *     колонок и решил бы, что их не добавили.
 *
 * Тот же урок, что с версионированием label-prefs.
 */

/** С какой ширины экрана колонка появляется. */
export type Breakpoint = "always" | "md" | "lg" | "xl";

export interface AssetColumn {
  key: string;
  label: string;
  breakpoint: Breakpoint;
  /** Числовые колонки выравниваются вправо */
  align?: "right";
  /**
   * Фильтр, который теряет смысл без этой колонки. Скрытая колонка
   * убирает и его: фильтровать по тому, чего не видно на экране, —
   * верный способ получить «куда делись записи».
   */
  filter?: "status" | "department" | "category";
}

/**
 * Порядок по умолчанию. Он же определяет, куда встанет колонка,
 * добавленная в код после того, как пользователь сохранил свою настройку.
 *
 * Точки перелома оставлены прежними, чтобы на узких экранах таблица
 * вела себя как раньше: сначала скрывается наименее нужное.
 */
export const ASSET_COLUMNS: AssetColumn[] = [
  { key: "inventoryNumber", label: "Инв. номер", breakpoint: "always" },
  { key: "name", label: "Наименование", breakpoint: "always" },
  { key: "category", label: "Категория", breakpoint: "lg", filter: "category" },
  { key: "departmentName", label: "Подразделение", breakpoint: "md", filter: "department" },
  { key: "responsiblePerson", label: "Ответственный", breakpoint: "lg" },
  { key: "ownerName", label: "Владелец", breakpoint: "md" },
  { key: "location", label: "Местоположение", breakpoint: "lg" },
  { key: "residualValue", label: "Стоимость, ₸", breakpoint: "xl", align: "right" },
  { key: "status", label: "Статус", breakpoint: "always", filter: "status" },
  { key: "actions", label: "Действия", breakpoint: "always" },
];

/**
 * Классы Tailwind должны присутствовать в коде целыми строками — сборщик
 * ищет их поиском по исходникам и склеенное на лету `hidden ${bp}:table-cell`
 * просто не попадёт в стили.
 */
export const BREAKPOINT_CLASS: Record<Breakpoint, string> = {
  always: "",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export const BREAKPOINT_HINT: Record<Breakpoint, string> = {
  always: "",
  md: "с планшета",
  lg: "с ноутбука",
  xl: "с широких экранов",
};

/**
 * Колонки, скрытые по умолчанию: поле заполнено у единиц записей из 380, а
 * таблица и без них упирается в ширину экрана. Кому нужно — включит.
 *
 * Скрытие «Категории» убирает и фильтр по категории — так устроено
 * намеренно (см. AssetColumn.filter). При трёх заполненных записях из 380
 * этот фильтр и так ничего не отбирал, но знать об этом стоит.
 */
export const DEFAULT_HIDDEN = ["category", "responsiblePerson", "location"];

/**
 * Версия набора скрытых по умолчанию колонок.
 *
 * Нужна вот зачем. Сохранённая настройка хранит СПИСОК скрытых колонок,
 * а не «пользуюсь стандартным набором». Поэтому у того, кто однажды
 * открывал окно настройки, лежит hidden: ["location"], и новый набор по
 * умолчанию его таблицу не изменит: правка выглядела бы сделанной, а на
 * складе колонки остались бы на месте.
 *
 * Версия позволяет дослать новые скрытия один раз. Цена честная и её
 * надо назвать: если человек СОЗНАТЕЛЬНО включил «Ответственного», при
 * переходе на версию 2 колонка у него скроется. Он включит её снова — и
 * больше она не пропадёт, потому что версия в его настройке станет
 * текущей. Одноразовая неприятность, которую видно и легко отменить.
 */
export const DEFAULT_HIDDEN_VERSION = 2;

/**
 * Что добавилось в скрытое по умолчанию в каждой версии.
 *
 * Только добавления: «показать обратно» здесь не выражается — вернуть
 * колонку всем насильно значило бы перебить чужой выбор без возможности
 * отличить его от значения по умолчанию.
 */
const HIDDEN_SINCE: Record<number, readonly string[]> = {
  2: ["category", "responsiblePerson"],
};

export interface ColumnConfig {
  /** Ключи в порядке отображения */
  order: string[];
  /** Ключи скрытых колонок */
  hidden: string[];
  /**
   * Версия набора скрытого по умолчанию, под которую настройка приведена.
   * Отсутствует у настроек, сохранённых до появления версий, — такие
   * считаются первой версией.
   */
  hiddenVersion?: number;
}

export const DEFAULT_CONFIG: ColumnConfig = {
  order: ASSET_COLUMNS.map(c => c.key),
  hidden: [...DEFAULT_HIDDEN],
  hiddenVersion: DEFAULT_HIDDEN_VERSION,
};

const byKey = new Map(ASSET_COLUMNS.map(c => [c.key, c]));

/**
 * Сохранённый порядок, приведённый к текущему набору колонок.
 *
 * Возвращает ВСЕ колонки — и видимые, и скрытые: окно настройки должно
 * показывать полный список, иначе скрытую колонку нечем будет вернуть.
 */
export function resolveOrder(saved?: readonly string[] | null): AssetColumn[] {
  if (!saved || !saved.length) return [...ASSET_COLUMNS];

  const seen = new Set<string>();
  const result: AssetColumn[] = [];
  for (const key of saved) {
    const col = byKey.get(key);
    // Неизвестный ключ — колонку убрали из кода; пропускаем молча
    if (col && !seen.has(key)) {
      seen.add(key);
      result.push(col);
    }
  }

  // Колонки, появившиеся после сохранения, встают рядом со своим соседом
  // по умолчанию, а не в конец списка.
  //
  // Вставлять по индексу из списка по умолчанию нельзя: у пользователя
  // свой порядок, и такой индекс попадает в произвольное место, разрывая
  // сохранённые соседства. Поэтому ищем последнюю из колонок, которые в
  // наборе по умолчанию идут ПЕРЕД новой, и встаём сразу за ней.
  ASSET_COLUMNS.forEach((col, defaultIndex) => {
    if (seen.has(col.key)) return;

    const predecessors = ASSET_COLUMNS.slice(0, defaultIndex).map(c => c.key);
    let at = 0;
    for (let i = result.length - 1; i >= 0; i--) {
      if (predecessors.includes(result[i].key)) { at = i + 1; break; }
    }

    result.splice(at, 0, col);
    seen.add(col.key);
  });

  return result;
}

/**
 * Сохранённая настройка, приведённая к текущему коду: порядок — к набору
 * колонок, скрытое — к текущей версии скрытого по умолчанию.
 *
 * Применяется и при ЧТЕНИИ, а не только при записи. Иначе новое скрытие
 * доезжало бы до человека лишь после того, как он сам что-нибудь
 * переключит, — то есть у большинства никогда.
 */
export function migrateConfig(config?: Partial<ColumnConfig> | null): ColumnConfig {
  const order = resolveOrder(config?.order).map(c => c.key);
  const hidden = new Set((config?.hidden ?? DEFAULT_HIDDEN).filter(k => byKey.has(k)));

  // Настройки нет вовсе — DEFAULT_HIDDEN выше уже дал текущий набор,
  // досылать ничего не нужно
  const from = config ? (config.hiddenVersion ?? 1) : DEFAULT_HIDDEN_VERSION;
  for (let v = from + 1; v <= DEFAULT_HIDDEN_VERSION; v++) {
    for (const key of HIDDEN_SINCE[v] ?? []) if (byKey.has(key)) hidden.add(key);
  }

  return {
    order,
    // В порядке отображения, а не в порядке добавления: так список
    // скрытого читается так же, как таблица
    hidden: order.filter(k => hidden.has(k)),
    hiddenVersion: DEFAULT_HIDDEN_VERSION,
  };
}

/** Колонки, которые попадут в таблицу, в нужном порядке. */
export function visibleColumns(config?: Partial<ColumnConfig> | null): AssetColumn[] {
  const { order, hidden } = migrateConfig(config);
  const hiddenSet = new Set(hidden);
  return order.map(k => byKey.get(k)!).filter(c => !hiddenSet.has(c.key));
}

/** Фильтры, которые имеет смысл показывать при текущем наборе колонок. */
export function activeFilters(config?: Partial<ColumnConfig> | null): Set<string> {
  const set = new Set<string>();
  for (const col of visibleColumns(config)) if (col.filter) set.add(col.filter);
  return set;
}

/**
 * Показать/скрыть колонку.
 *
 * Последнюю видимую колонку скрыть нельзя: пустая таблица выглядит как
 * поломка, а вернуть колонку было бы уже неоткуда, кроме сброса настроек.
 */
export function toggleColumn(config: Partial<ColumnConfig> | null | undefined, key: string): ColumnConfig {
  const next = migrateConfig(config);
  if (!byKey.has(key)) return next;

  const hidden = new Set(next.hidden);
  if (hidden.has(key)) {
    hidden.delete(key);
  } else {
    if (next.order.filter(k => !hidden.has(k)).length <= 1) return next;
    hidden.add(key);
  }
  return { ...next, hidden: next.order.filter(k => hidden.has(k)) };
}

/** Сдвинуть колонку на одну позицию: -1 вверх, 1 вниз. */
export function moveColumn(
  config: Partial<ColumnConfig> | null | undefined,
  key: string,
  direction: -1 | 1,
): ColumnConfig {
  const next = migrateConfig(config);
  const from = next.order.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= next.order.length) return next;

  const order = [...next.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...next, order };
}

/** Перенести колонку на место другой — для перетаскивания мышью. */
export function reorderColumns(
  config: Partial<ColumnConfig> | null | undefined,
  fromKey: string,
  toKey: string,
): ColumnConfig {
  const next = migrateConfig(config);
  const from = next.order.indexOf(fromKey);
  const to = next.order.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return next;

  const order = [...next.order];
  order.splice(to, 0, ...order.splice(from, 1));
  return { ...next, order };
}

/** Отличается ли настройка от стандартной — чтобы не предлагать пустой сброс. */
export function isCustomized(config?: Partial<ColumnConfig> | null): boolean {
  const next = migrateConfig(config);
  const sameOrder = next.order.join() === DEFAULT_CONFIG.order.join();
  const sameHidden = [...next.hidden].sort().join() === [...DEFAULT_CONFIG.hidden].sort().join();
  return !(sameOrder && sameHidden);
}
