/**
 * Чтение из стандартного интерфейса OData 1С.
 *
 * Только GET: направление обмена 1С -> сайт, и пользователь обмена в 1С
 * заведён с правами на чтение. Модуль без Nest — тест подставляет свой
 * сервер-эмулятор через baseUrl.
 */
import {
  OneCLookups, OneCProfile, emptyLookups,
} from './one-c-mapping';

export interface OneCClientOptions {
  baseUrl: string;
  user?: string;
  password?: string;
  /** Тайм-аут одного запроса, мс */
  timeoutMs?: number;
  /** Размер страницы при постраничной загрузке */
  pageSize?: number;
}

export class OneCHttpError extends Error {
  constructor(readonly entity: string, readonly status: number, detail: string) {
    super(`1С ответила ${status} на ${entity}${detail ? `: ${detail}` : ''}`);
  }
}

/**
 * Значения параметров кодируются выборочно: `$` в именах параметров и
 * запятые в списках остаются как есть — так их ждёт 1С, — а кириллица и
 * пробелы кодируются.
 */
function buildUrl(base: string, entity: string, params: Record<string, string | number>): string {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURI(String(v))}`).join('&');
  return `${base.replace(/\/+$/, '')}/${encodeURI(entity)}?${qs}`;
}

export class OneCClient {
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly pageSize: number;

  constructor(private readonly opts: OneCClientOptions) {
    this.headers = { Accept: 'application/json' };
    if (opts.user) {
      this.headers.Authorization = 'Basic ' + Buffer.from(`${opts.user}:${opts.password ?? ''}`).toString('base64');
    }
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.pageSize = opts.pageSize ?? 500;
  }

  private async get(entity: string, params: Record<string, string | number>): Promise<any[]> {
    const url = buildUrl(this.opts.baseUrl, entity, { $format: 'json', ...params });
    const resp = await fetch(url, { headers: this.headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!resp.ok) {
      // 1С кладёт причину в тело (odata.error.message.value) — без неё
      // «400» ничего не говорит человеку, который будет разбирать журнал
      let detail = '';
      try {
        const body: any = await resp.json();
        detail = body?.['odata.error']?.message?.value ?? '';
      } catch { /* тело не JSON — оставляем статус */ }
      throw new OneCHttpError(entity, resp.status, String(detail).slice(0, 300));
    }
    const body: any = await resp.json();
    return Array.isArray(body?.value) ? body.value : [];
  }

  /**
   * Вся сущность постранично. Порядок по Ref_Key обязателен: без него
   * $skip на меняющейся выборке пропускает или повторяет записи.
   */
  async fetchAll(entity: string, extra: Record<string, string> = {}): Promise<any[]> {
    const all: any[] = [];
    for (let skip = 0; ; skip += this.pageSize) {
      const page = await this.get(entity, { $orderby: 'Ref_Key', $top: this.pageSize, $skip: skip, ...extra });
      all.push(...page);
      if (page.length < this.pageSize) return all;
      // Предохранитель от бесконечного цикла, если сервер игнорирует $skip
      if (all.length > 200_000) throw new Error(`${entity}: больше 200 000 записей — похоже, 1С игнорирует $skip`);
    }
  }

  /** Срез последних периодического регистра сведений — без постраничности */
  async sliceLast(entity: string): Promise<any[]> {
    return this.get(`${entity}/SliceLast()`, {});
  }
}

export interface OneCFetchResult {
  rawAssets: any[];
  lookups: OneCLookups;
  /**
   * Вспомогательные сущности, которые не удалось прочитать. Обмен при этом
   * не падает: без регистра местонахождения карточки обновятся без
   * подразделения и МОЛ, а человек увидит причину в отчёте.
   */
  warnings: string[];
}

const nameMap = (rows: any[]) => {
  const m = new Map<string, string>();
  for (const r of rows) {
    const key = typeof r.Ref_Key === 'string' ? r.Ref_Key.toLowerCase() : undefined;
    const name = typeof r.Description === 'string' ? r.Description.trim() : '';
    if (key && name) m.set(key, name);
  }
  return m;
};

/**
 * Всё, что нужно для обмена. Справочник ОС обязателен — без него обмена
 * нет. Остальное — по возможности, с предупреждением.
 */
export async function fetchOneC(client: OneCClient, profile: OneCProfile): Promise<OneCFetchResult> {
  const warnings: string[] = [];
  const lookups = emptyLookups();

  const optional = async <T>(what: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await run();
    } catch (err: any) {
      warnings.push(`${what}: ${err.message}`);
      return undefined;
    }
  };

  const rawAssets = await client.fetchAll(profile.assetsEntity);

  const [departments, persons, location, invNumbers] = await Promise.all([
    optional('подразделения', () => client.fetchAll(profile.departmentsEntity, { $select: 'Ref_Key,Description' })),
    optional('физлица', () => client.fetchAll(profile.personsEntity, { $select: 'Ref_Key,Description' })),
    profile.locationRegister
      ? optional('местонахождение ОС', () => client.sliceLast(profile.locationRegister!.entity))
      : Promise.resolve(undefined),
    profile.inventoryNumberRegister
      ? optional('инвентарные номера', () => client.sliceLast(profile.inventoryNumberRegister!.entity))
      : Promise.resolve(undefined),
  ]);

  if (departments) lookups.departments = nameMap(departments);
  if (persons) lookups.persons = nameMap(persons);

  if (location && profile.locationRegister) {
    const key = profile.locationRegister.assetKey;
    for (const row of location) {
      const asset = typeof row[key] === 'string' ? row[key].toLowerCase() : undefined;
      if (asset) lookups.location.set(asset, row);
    }
  }

  if (invNumbers && profile.inventoryNumberRegister) {
    const { assetKey, field } = profile.inventoryNumberRegister;
    for (const row of invNumbers) {
      const asset = typeof row[assetKey] === 'string' ? row[assetKey].toLowerCase() : undefined;
      const value = typeof row[field] === 'string' ? row[field].trim() : '';
      if (asset && value) lookups.inventoryNumbers.set(asset, value);
    }
  }

  return { rawAssets, lookups, warnings };
}
