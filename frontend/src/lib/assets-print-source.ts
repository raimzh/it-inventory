import { assetsApi } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { Asset } from "@/types";

/**
 * Выборка ОС для печати пачки наклеек.
 *
 * Порядок печати задаётся явно — по возрастанию инвентарного номера.
 * Это не косметика: по умолчанию список сортируется по `createdAt DESC`,
 * а импортированная из Excel пачка получает практически одинаковое время
 * создания. Порядок между запросами страниц тогда невоспроизводим —
 * страницы пересекаются и теряют строки. Инвентарный номер уникален и
 * входит в разрешённые поля сортировки на бэкенде.
 *
 * И только при устойчивом порядке имеет смысл «начать со 151-й»: иначе
 * 151-я наклейка каждый раз разная.
 */

/** За раз бэкенд отдаёт не больше сотни (@Max(100) в query-assets.dto) */
const PAGE_SIZE = 100;

/** Потолок пачки — см. пояснение к maxItems в fetch-all-pages */
export const MAX_LABELS_PER_BATCH = 500;

/** Порог, после которого печать просит отдельного подтверждения */
export const CONFIRM_LABELS_FROM = 100;

export interface AssetFilters {
  search?: string;
  status?: string;
  departmentId?: string;
  category?: string;
}

const ORDER = { sortBy: "inventoryNumber", sortOrder: "ASC", limit: PAGE_SIZE } as const;

/** Все ОС, подходящие под текущие фильтры списка */
export function loadAssetsByFilters(filters: AssetFilters): Promise<Asset[]> {
  return fetchAllPages<Asset>(
    page => assetsApi
      .getAll({
        ...ORDER,
        page,
        search: filters.search || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
        category: filters.category || undefined,
      })
      .then(r => r.data),
    { maxItems: MAX_LABELS_PER_BATCH },
  );
}

/**
 * ОС по отмеченным строкам.
 *
 * Фильтры намеренно не применяются: галки могли ставиться на разных
 * страницах и при других фильтрах, а список хранит id, а не сами записи,
 * и объектов на руках может не быть. Обход прекращается, как только
 * найдены все отмеченные — типичный случай в один-два запроса.
 */
export async function loadAssetsByIds(ids: string[]): Promise<Asset[]> {
  if (!ids.length) return [];
  const want = new Set(ids);

  const all = await fetchAllPages<Asset>(
    page => assetsApi.getAll({ ...ORDER, page }).then(r => r.data),
    {
      // Обход прекращается, как только отмеченные набрались: считаем по
      // всему собранному, а не накапливаем отдельно — так проще и без
      // повторной проверки уже найденных
      maxItems: MAX_LABELS_PER_BATCH * 4,
      stop: collected => collected.filter(a => want.has(a.id)).length >= want.size,
    },
  );

  // Порядок уже задан сортировкой запроса, отбор его не нарушает
  return all.filter(a => want.has(a.id));
}
