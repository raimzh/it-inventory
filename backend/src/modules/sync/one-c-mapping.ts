/**
 * Обмен с 1С: что брать из ответа OData и с какой карточкой ОС это сопоставить.
 *
 * Чистый модуль, без Nest, сети и базы. Вся логика, от которой зависит,
 * не испортит ли обмен учёт, проверяется тестами напрямую
 * (test/one-c.mapping.test.js). Сеть — в one-c-client.ts, запись в базу —
 * в sync.service.ts.
 *
 * Направление только одно: 1С -> сайт. Обмен пишет лишь поля, которыми
 * владеет 1С, и никогда не трогает то, что ведётся на сайте: владельца,
 * статусы, отметки инвентаризации.
 */
import { parseDateCell } from '../../common/excel/parse-date-cell';
import { stripLeadingZeros } from '../../common/scan/parse-scan-code';

/* ------------------------------------------------------------------ */
/* Профили конфигураций                                                */
/* ------------------------------------------------------------------ */

/** Регистр сведений, из среза последних которого берутся подразделение и МОЛ */
export interface LocationRegister {
  entity: string;
  /** Поле-ссылка на ОС в записи регистра */
  assetKey: string;
  departmentKey?: string;
  personKey?: string;
}

/** Регистр, в котором хранится инвентарный номер (так устроена УПП) */
export interface InventoryNumberRegister {
  entity: string;
  assetKey: string;
  field: string;
}

export interface OneCProfile {
  id: 'erp' | 'upp';
  title: string;
  /** Справочник основных средств */
  assetsEntity: string;
  /**
   * Поле, по которому запись 1С сопоставляется с нашим инвентарным номером.
   * Значение по умолчанию — предположение, его подтверждает пробный прогон:
   * в отчёте он сравнивает все кандидаты с реальными номерами на сайте.
   */
  matchField: string;
  serialField: string;
  departmentsEntity: string;
  personsEntity: string;
  locationRegister?: LocationRegister;
  inventoryNumberRegister?: InventoryNumberRegister;
}

/**
 * Имена сущностей — по типовым конфигурациям, но опубликованный состав OData
 * у конкретной базы может отличаться. Поэтому обмен НЕ просит у 1С конкретных
 * полей ($select не задаётся): неизвестное поле в $select 1С отклоняет весь
 * запрос, а так отсутствующее поле лишь попадает в отчёт о покрытии.
 */
export const PROFILES: Record<OneCProfile['id'], OneCProfile> = {
  // ERP 2.x и Комплексная автоматизация 2.x
  erp: {
    id: 'erp',
    title: '1С:ERP / КА 2',
    assetsEntity: 'Catalog_ОбъектыЭксплуатации',
    matchField: 'ИнвентарныйНомер',
    serialField: 'ЗаводскойНомер',
    departmentsEntity: 'Catalog_СтруктураПредприятия',
    personsEntity: 'Catalog_ФизическиеЛица',
    locationRegister: {
      entity: 'InformationRegister_МестонахождениеОС',
      assetKey: 'ОсновноеСредство_Key',
      departmentKey: 'Местонахождение_Key',
      personKey: 'МОЛ_Key',
    },
  },
  // УПП 1.3: справочник называется ОсновныеСредства, а инвентарный номер и
  // местонахождение живут в регистрах бухгалтерского учёта
  upp: {
    id: 'upp',
    title: '1С:УПП 1.3',
    assetsEntity: 'Catalog_ОсновныеСредства',
    matchField: 'ИнвентарныйНомер',
    serialField: 'ЗаводскойНомер',
    departmentsEntity: 'Catalog_ПодразделенияОрганизаций',
    personsEntity: 'Catalog_ФизическиеЛица',
    locationRegister: {
      entity: 'InformationRegister_МестонахождениеОСБухгалтерскийУчет',
      assetKey: 'ОсновноеСредство_Key',
      departmentKey: 'Местонахождение_Key',
      personKey: 'МОЛ_Key',
    },
    inventoryNumberRegister: {
      entity: 'InformationRegister_ПервоначальныеСведенияОСБухгалтерскийУчет',
      assetKey: 'ОсновноеСредство_Key',
      field: 'ИнвентарныйНомер',
    },
  },
};

/**
 * Профиль из окружения. Отдельно переопределяются только две вещи, которые
 * чаще всего отличаются у конкретной базы и выясняются пробным прогоном:
 * имя справочника и поле сопоставления.
 */
export function resolveProfile(env: Record<string, string | undefined>): OneCProfile {
  const id = (env.ONE_C_PROFILE || 'erp').trim().toLowerCase();
  const base = PROFILES[id as OneCProfile['id']];
  if (!base) {
    throw new Error(`Неизвестный ONE_C_PROFILE «${id}». Допустимо: ${Object.keys(PROFILES).join(', ')}`);
  }
  return {
    ...base,
    assetsEntity: env.ONE_C_ASSETS_ENTITY?.trim() || base.assetsEntity,
    matchField: env.ONE_C_MATCH_FIELD?.trim() || base.matchField,
  };
}

/* ------------------------------------------------------------------ */
/* Запись обмена                                                       */
/* ------------------------------------------------------------------ */

/**
 * Запись в общем виде — к нему приводятся и ответ OData, и файл импорта.
 * Поле undefined значит «в выгрузке не было» и НЕ затирает значение на сайте.
 */
export interface SyncRecord {
  inventoryNumber: string;
  oneCGuid?: string;
  oneCId?: string;
  name?: string;
  serialNumber?: string;
  departmentName?: string;
  location?: string;
  responsiblePerson?: string;
  /** ГГГГ-ММ-ДД */
  commissioningDate?: string;
  residualValue?: number;
  initialValue?: number;
}

/** Поля карточки, которыми владеет 1С. Всё остальное обмен не трогает */
export const SYNCED_FIELDS = [
  'name', 'serialNumber', 'departmentName', 'location', 'responsiblePerson',
  'commissioningDate', 'residualValue', 'initialValue', 'oneCId', 'oneCGuid',
] as const;
export type SyncedField = typeof SYNCED_FIELDS[number];

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

const text = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

const ref = (v: unknown): string | undefined => {
  const s = text(v);
  return s && s !== EMPTY_GUID ? s.toLowerCase() : undefined;
};

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Строка файла импорта (POST /sync/import) — прежний формат, поведение
 * сохранено: номер берётся из `Code`, затем из `ИнвентарныйНомер`.
 */
export function fromFileRecord(raw: Record<string, any>): SyncRecord {
  const commissioning = parseDateCell(raw['ДатаВводаВЭксплуатацию'] ?? raw.CommissioningDate);
  return {
    inventoryNumber: text(raw.Code) ?? text(raw['ИнвентарныйНомер']) ?? '',
    oneCId: text(raw.Code),
    oneCGuid: ref(raw.Ref_Key),
    name: text(raw.Description) ?? text(raw['Наименование']),
    serialNumber: text(raw['СерийныйНомер']) ?? text(raw.SerialNumber),
    departmentName: text(raw['Подразделение']) ?? text(raw.Department),
    location: text(raw['Местоположение']) ?? text(raw.Location),
    responsiblePerson: text(raw['ОтветственноеЛицо']) ?? text(raw.ResponsiblePerson),
    commissioningDate: commissioning ?? undefined,
    residualValue: num(raw['ОстаточнаяСтоимость'] ?? raw.ResidualValue),
    initialValue: num(raw['ПервоначальнаяСтоимость'] ?? raw.InitialValue),
  };
}

/** Справочники и срезы регистров, загруженные до разбора записей */
export interface OneCLookups {
  /** GUID подразделения -> наименование */
  departments: Map<string, string>;
  /** GUID физлица -> ФИО */
  persons: Map<string, string>;
  /** GUID ОС -> последняя запись регистра местонахождения */
  location: Map<string, Record<string, any>>;
  /** GUID ОС -> инвентарный номер из регистра (УПП) */
  inventoryNumbers: Map<string, string>;
}

export const emptyLookups = (): OneCLookups => ({
  departments: new Map(), persons: new Map(), location: new Map(), inventoryNumbers: new Map(),
});

/** Почему запись 1С не превратилась в запись обмена */
export type ODataSkip = 'folder' | 'deleted' | 'no-number';

/**
 * Номер для сопоставления по указанному полю. Поле `ИнвентарныйНомер` в
 * профиле УПП берётся из регистра, а не из справочника.
 */
export function matchValue(raw: Record<string, any>, field: string, profile: OneCProfile, lookups: OneCLookups): string | undefined {
  const own = text(raw[field]);
  if (own) return own;
  if (profile.inventoryNumberRegister && field === profile.inventoryNumberRegister.field) {
    const guid = ref(raw.Ref_Key);
    return guid ? text(lookups.inventoryNumbers.get(guid)) : undefined;
  }
  return undefined;
}

/**
 * Запись справочника ОС из OData -> запись обмена.
 *
 * Группы справочника пропускаются всегда. Помеченные на удаление тоже не
 * пишутся: в направлении 1С -> сайт пометка — это сигнал, а не команда, и
 * решать про списание на сайте должен человек по отчёту пробного прогона.
 */
export function fromODataRecord(
  raw: Record<string, any>,
  profile: OneCProfile,
  lookups: OneCLookups,
): { record: SyncRecord } | { skip: ODataSkip; ref?: string; code?: string } {
  const guid = ref(raw.Ref_Key);
  const code = text(raw.Code);
  if (raw.IsFolder === true) return { skip: 'folder', ref: guid, code };
  if (raw.DeletionMark === true) return { skip: 'deleted', ref: guid, code };

  const inventoryNumber = matchValue(raw, profile.matchField, profile, lookups);
  if (!inventoryNumber) return { skip: 'no-number', ref: guid, code };

  const loc = guid ? lookups.location.get(guid) : undefined;
  const reg = profile.locationRegister;
  const deptKey = reg?.departmentKey ? ref(loc?.[reg.departmentKey]) : undefined;
  const personKey = reg?.personKey ? ref(loc?.[reg.personKey]) : undefined;

  return {
    record: {
      inventoryNumber,
      oneCGuid: guid,
      oneCId: code,
      name: text(raw.Description),
      serialNumber: text(raw[profile.serialField]),
      // Ссылка, которую не удалось развернуть в имя, НЕ пишется как GUID:
      // строка из нулей и дефисов в колонке «Подразделение» хуже пустой
      departmentName: deptKey ? lookups.departments.get(deptKey) : undefined,
      responsiblePerson: personKey ? lookups.persons.get(personKey) : undefined,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Сопоставление с учётом на сайте                                     */
/* ------------------------------------------------------------------ */

/** То, что нужно знать о карточке на сайте для сопоставления и сравнения */
export interface SiteAsset {
  id: string;
  inventoryNumber: string;
  oneCGuid?: string | null;
  name?: string | null;
  serialNumber?: string | null;
  departmentName?: string | null;
  location?: string | null;
  responsiblePerson?: string | null;
  oneCId?: string | null;
  commissioningDate?: string | Date | null;
  residualValue?: string | number | null;
  initialValue?: string | number | null;
}

const normKey = (v: string) => v.trim().toLowerCase();

/** Индекс карточек: по GUID 1С, по номеру и по номеру без ведущих нулей */
export class SiteIndex {
  private byGuid = new Map<string, SiteAsset>();
  private byNumber = new Map<string, SiteAsset>();
  private byBare = new Map<string, SiteAsset>();

  constructor(readonly assets: SiteAsset[]) {
    for (const a of assets) {
      if (a.oneCGuid) this.byGuid.set(a.oneCGuid.toLowerCase(), a);
      const key = normKey(a.inventoryNumber);
      this.byNumber.set(key, a);
      const bare = stripLeadingZeros(key);
      // Номер без нулей может совпасть у двух разных карточек (`9079` и
      // `009079`) — тогда такой ключ неоднозначен и не используется вовсе
      if (this.byBare.has(bare) && this.byBare.get(bare) !== a) this.byBare.set(bare, null as any);
      else this.byBare.set(bare, a);
    }
  }

  /**
   * GUID важнее номера — тот же принцип, что у этикеток: номер могут
   * переименовать, а объект останется тем же.
   */
  find(r: { inventoryNumber: string; oneCGuid?: string }): SiteAsset | undefined {
    if (r.oneCGuid) {
      const g = this.byGuid.get(r.oneCGuid.toLowerCase());
      if (g) return g;
    }
    const key = normKey(r.inventoryNumber);
    return this.byNumber.get(key) ?? this.byBare.get(stripLeadingZeros(key)) ?? undefined;
  }
}

const dateOnly = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/** Значения поля на сайте и в 1С, приведённые к сравнимому виду */
function comparable(field: SyncedField, v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (field === 'residualValue' || field === 'initialValue') {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : undefined;
  }
  if (field === 'commissioningDate') return dateOnly(v);
  if (field === 'oneCGuid') return String(v).toLowerCase();
  return String(v).trim();
}

export interface FieldChange { field: SyncedField; from: string | null; to: string }

/**
 * Что изменится в карточке. Поле, которого нет в записи (undefined),
 * пропускается: обмен не затирает то, чего в выгрузке не было.
 */
export function diffRecord(site: SiteAsset, rec: SyncRecord): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of SYNCED_FIELDS) {
    const incoming = comparable(field, (rec as any)[field]);
    if (incoming === undefined) continue;
    const current = comparable(field, (site as any)[field]);
    if (current !== incoming) changes.push({ field, from: current ?? null, to: incoming });
  }
  return changes;
}

export interface SyncPlan {
  updates: { asset: SiteAsset; record: SyncRecord; changes: FieldChange[] }[];
  /** Совпали, менять нечего */
  unchanged: { asset: SiteAsset; record: SyncRecord }[];
  creates: SyncRecord[];
  /** Номер встретился в выгрузке повторно, или две записи указали на одну карточку */
  conflicts: { inventoryNumber: string; reason: string }[];
  /** Карточки на сайте, которых нет в выгрузке. Не удаляются — только показываются */
  missingInOneC: SiteAsset[];
}

/**
 * План обмена: что обновить, что создать, что показать человеку.
 * Ничего не пишет — ровно это и показывает пробный прогон.
 */
export function planSync(records: SyncRecord[], index: SiteIndex): SyncPlan {
  const plan: SyncPlan = { updates: [], unchanged: [], creates: [], conflicts: [], missingInOneC: [] };
  const claimed = new Map<string, string>(); // id карточки -> номер записи, которая её заняла
  const seenNew = new Set<string>();

  for (const record of records) {
    const asset = index.find(record);
    if (asset) {
      const prev = claimed.get(asset.id);
      if (prev !== undefined) {
        plan.conflicts.push({
          inventoryNumber: record.inventoryNumber,
          reason: `указывает на ту же карточку ${asset.inventoryNumber}, что и запись ${prev}`,
        });
        continue;
      }
      claimed.set(asset.id, record.inventoryNumber);
      const changes = diffRecord(asset, record);
      if (changes.length) plan.updates.push({ asset, record, changes });
      else plan.unchanged.push({ asset, record });
      continue;
    }

    const key = stripLeadingZeros(normKey(record.inventoryNumber));
    if (seenNew.has(key)) {
      plan.conflicts.push({ inventoryNumber: record.inventoryNumber, reason: 'номер повторяется в выгрузке 1С' });
      continue;
    }
    seenNew.add(key);
    plan.creates.push(record);
  }

  plan.missingInOneC = index.assets.filter(a => !claimed.has(a.id));
  return plan;
}

/* ------------------------------------------------------------------ */
/* Разведка: какое поле 1С совпадает с нашими номерами                 */
/* ------------------------------------------------------------------ */

/**
 * Для каждого поля-кандидата — сколько карточек на сайте нашлось бы по нему.
 * Отвечает на главный вопрос первого запуска: по какому полю сопоставлять.
 * Ошибка здесь не ломает обмен, а тихо плодит дубли.
 */
export function matchCandidates(
  rawRecords: Record<string, any>[],
  profile: OneCProfile,
  lookups: OneCLookups,
  index: SiteIndex,
): { field: string; present: number; matched: number }[] {
  const fields = Array.from(new Set([profile.matchField, 'Code', 'ИнвентарныйНомер']));
  return fields.map(field => {
    let present = 0;
    const matched = new Set<string>();
    for (const raw of rawRecords) {
      if (raw.IsFolder === true) continue;
      const value = matchValue(raw, field, profile, lookups);
      if (!value) continue;
      present++;
      // Только по номеру, без GUID: проверяется само поле
      const a = index.find({ inventoryNumber: value });
      if (a) matched.add(a.id);
    }
    return { field, present, matched: matched.size };
  });
}

/** Сколько записей справочника ОС содержат каждое из ожидаемых полей */
export function fieldCoverage(rawRecords: Record<string, any>[], profile: OneCProfile): { field: string; present: number }[] {
  const fields = ['Ref_Key', 'Code', 'Description', profile.matchField, profile.serialField];
  return Array.from(new Set(fields)).map(field => ({
    field,
    present: rawRecords.filter(r => text(r[field]) !== undefined).length,
  }));
}
