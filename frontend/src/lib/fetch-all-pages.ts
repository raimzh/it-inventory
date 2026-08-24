/**
 * Постраничный сбор всех записей.
 *
 * Нужен потому, что бэкенд намеренно ограничивает выборку сотней записей
 * за запрос (`@Max(100)` в query-assets.dto с пометкой «не даём вытащить
 * всю таблицу одним запросом»). Ослаблять этот барьер ради одной кнопки
 * печати неправильно: `/assets` дёргает не только она, а снятое
 * ограничение обратно уже не вернут. Четыре запроса по сто — доли
 * секунды, и только по явному действию пользователя.
 *
 * Без axios и без React: так модуль покрывается тестами напрямую.
 */

export interface Page<T> {
  data: T[];
  total: number;
  totalPages: number;
}

interface Options<T> {
  /**
   * Потолок на число записей. Страховка не от бэкенда, а от собственного
   * интерфейса: печать четырёх сотен наклеек уже ощутима, а рост таблицы
   * должен упираться в понятное сообщение, а не в зависшую вкладку.
   */
  maxItems: number;
  /** Ранний выход: например, когда все отмеченные строки уже найдены */
  stop?: (collected: T[]) => boolean;
}

export async function fetchAllPages<T>(
  loadPage: (page: number) => Promise<Page<T>>,
  { maxItems, stop }: Options<T>,
): Promise<T[]> {
  const collected: T[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await loadPage(page);
    totalPages = Math.max(1, res.totalPages || 1);

    // Пустая страница в пределах totalPages означает, что состав изменился
    // между запросами. Продолжать нечего, а цикл иначе не закончится
    if (!res.data.length) break;

    collected.push(...res.data);

    if (collected.length >= maxItems) return collected.slice(0, maxItems);
    if (stop?.(collected)) break;

    page++;
  }

  return collected;
}
