'use strict';
/**
 * Обмен с 1С: разбор ответа OData, сопоставление с учётом и сетевая часть
 * против эмулятора. Без базы и без запущенного приложения.
 *
 * Проверяется скомпилированный код, поэтому перед запуском нужна сборка:
 *
 *   npm run build && node --test test/one-c.mapping.test.js
 *
 * На боевой машине собирать в dist нельзя — из него работает живой процесс.
 * Там сборка идёт в сторону, а тест направляется на неё:
 *
 *   npx nest build -p tsconfig.deploy.json
 *   TEST_DIST=../dist-staging node --test test/one-c.mapping.test.js
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startEmulator, guid } = require('./odata-emulator');

const DIST = path.resolve(__dirname, process.env.TEST_DIST || '../dist');
const m = require(path.join(DIST, 'modules/sync/one-c-mapping'));
const { OneCClient, fetchOneC } = require(path.join(DIST, 'modules/sync/one-c-client'));

const ERP = m.PROFILES.erp;
const UPP = m.PROFILES.upp;

const site = (over = {}) => ({ id: over.id ?? `site-${Math.random()}`, inventoryNumber: 'X', ...over });
const lookups = (over = {}) => ({ ...m.emptyLookups(), ...over });

/* ---------------------------- профиль ---------------------------- */

test('профиль по умолчанию — ERP; справочник и поле сопоставления переопределяются', () => {
  assert.equal(m.resolveProfile({}).assetsEntity, 'Catalog_ОбъектыЭксплуатации');
  const p = m.resolveProfile({ ONE_C_PROFILE: 'UPP', ONE_C_MATCH_FIELD: 'Code', ONE_C_ASSETS_ENTITY: 'Catalog_Моё' });
  assert.equal(p.id, 'upp');
  assert.equal(p.matchField, 'Code');
  assert.equal(p.assetsEntity, 'Catalog_Моё');
});

test('неизвестный профиль — понятная ошибка, а не молчаливый ERP', () => {
  assert.throws(() => m.resolveProfile({ ONE_C_PROFILE: 'bp' }), /Неизвестный ONE_C_PROFILE «bp»/);
});

/* ------------------------- разбор записи ------------------------- */

test('ссылки на подразделение и МОЛ разворачиваются в имена через регистр', () => {
  const asset = guid(1), dept = guid(100), person = guid(200);
  const r = m.fromODataRecord(
    { Ref_Key: asset, Code: '00-000001', Description: 'Ноутбук', 'ИнвентарныйНомер': '00-001196', 'ЗаводскойНомер': 'SN1' },
    ERP,
    lookups({
      departments: new Map([[dept, 'Бухгалтерия']]),
      persons: new Map([[person, 'Иванов И.И.']]),
      location: new Map([[asset, { 'Местонахождение_Key': dept, 'МОЛ_Key': person }]]),
    }),
  );
  assert.deepEqual(r.record, {
    inventoryNumber: '00-001196', oneCGuid: asset, oneCId: '00-000001', name: 'Ноутбук',
    serialNumber: 'SN1', departmentName: 'Бухгалтерия', responsiblePerson: 'Иванов И.И.',
  });
});

test('неразвёрнутая ссылка не пишется GUID-ом в поле подразделения', () => {
  // Регистр есть, а справочник подразделений не прочитался — лучше пусто,
  // чем строка из цифр и дефисов в колонке «Подразделение»
  const asset = guid(1);
  const r = m.fromODataRecord(
    { Ref_Key: asset, 'ИнвентарныйНомер': 'A1' },
    ERP,
    lookups({ location: new Map([[asset, { 'Местонахождение_Key': guid(100) }]]) }),
  );
  assert.equal(r.record.departmentName, undefined);
});

test('пустая ссылка 1С (нулевой GUID) считается отсутствием значения', () => {
  const r = m.fromODataRecord(
    { Ref_Key: guid(1), 'ИнвентарныйНомер': 'A1' },
    ERP,
    lookups({ location: new Map([[guid(1), { 'Местонахождение_Key': '00000000-0000-0000-0000-000000000000' }]]) }),
  );
  assert.equal(r.record.departmentName, undefined);
});

test('группы и помеченные на удаление не становятся записями обмена', () => {
  assert.equal(m.fromODataRecord({ Ref_Key: guid(1), IsFolder: true, Code: 'G' }, ERP, lookups()).skip, 'folder');
  assert.equal(m.fromODataRecord({ Ref_Key: guid(2), DeletionMark: true, 'ИнвентарныйНомер': 'A' }, ERP, lookups()).skip, 'deleted');
  assert.equal(m.fromODataRecord({ Ref_Key: guid(3), Code: 'C' }, ERP, lookups()).skip, 'no-number');
});

test('УПП: инвентарный номер берётся из регистра, если в справочнике его нет', () => {
  const asset = guid(5);
  const r = m.fromODataRecord(
    { Ref_Key: asset, Code: '00000005', Description: 'Станок' },
    UPP,
    lookups({ inventoryNumbers: new Map([[asset, 'ИНВ-5']]) }),
  );
  assert.equal(r.record.inventoryNumber, 'ИНВ-5');
});

test('файл импорта сохраняет прежний формат: номер из Code', () => {
  const r = m.fromFileRecord({ Code: 'F-1', 'ИнвентарныйНомер': 'другой', 'ДатаВводаВЭксплуатацию': '20.06.2023', 'ОстаточнаяСтоимость': 0 });
  assert.equal(r.inventoryNumber, 'F-1');
  assert.equal(r.commissioningDate, '2023-06-20');
  assert.equal(r.residualValue, 0, 'явный ноль — значение, а не пропуск');
});

/* ------------------------- сопоставление ------------------------- */

test('GUID важнее номера: переименованная в 1С ОС находит свою карточку', () => {
  const a = site({ id: 'a', inventoryNumber: 'OLD-1', oneCGuid: guid(1) });
  const b = site({ id: 'b', inventoryNumber: 'NEW-1' });
  const idx = new m.SiteIndex([a, b]);
  assert.equal(idx.find({ inventoryNumber: 'NEW-1', oneCGuid: guid(1) }).id, 'a');
});

test('номер с нулями находит карточку без нулей и наоборот', () => {
  const idx = new m.SiteIndex([site({ id: 'a', inventoryNumber: '6838' }), site({ id: 'b', inventoryNumber: '000010891' })]);
  assert.equal(idx.find({ inventoryNumber: '000006838' }).id, 'a');
  assert.equal(idx.find({ inventoryNumber: '10891' }).id, 'b');
});

test('номера с разделителем не нормализуются: 00-001196 ≠ 1196', () => {
  const idx = new m.SiteIndex([site({ id: 'a', inventoryNumber: '00-001196' })]);
  assert.equal(idx.find({ inventoryNumber: '1196' }), undefined);
});

test('неоднозначный номер без нулей не сопоставляется ни с одной карточкой', () => {
  // `9079` и `009079` — разные карточки; угадывать, какая из них `0009079`, нельзя
  const idx = new m.SiteIndex([site({ id: 'a', inventoryNumber: '9079' }), site({ id: 'b', inventoryNumber: '009079' })]);
  assert.equal(idx.find({ inventoryNumber: '0009079' }), undefined);
  assert.equal(idx.find({ inventoryNumber: '9079' }).id, 'a', 'точное совпадение по-прежнему работает');
});

test('план: обновление только изменившихся полей, отсутствующие поля не затираются', () => {
  const a = site({ id: 'a', inventoryNumber: 'A', name: 'Старое', serialNumber: 'SN', residualValue: '100.00', ownerName: 'Петров' });
  const plan = m.planSync([{ inventoryNumber: 'A', name: 'Новое' }], new m.SiteIndex([a]));
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0].changes, [{ field: 'name', from: 'Старое', to: 'Новое' }]);
});

test('план: совпадение без изменений — не обновление', () => {
  const a = site({ id: 'a', inventoryNumber: 'A', name: 'Имя', residualValue: '0.00' });
  const plan = m.planSync([{ inventoryNumber: 'A', name: 'Имя', residualValue: 0 }], new m.SiteIndex([a]));
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unchanged.length, 1);
});

test('план: владелец и прочие поля сайта в сравнение не входят', () => {
  assert.ok(!m.SYNCED_FIELDS.includes('ownerName'));
  assert.ok(!m.SYNCED_FIELDS.includes('status'));
  assert.ok(!m.SYNCED_FIELDS.includes('inventoryNumber'), 'номер автоматически не меняется');
});

test('план: две записи на одну карточку — конфликт, а не двойное обновление', () => {
  const a = site({ id: 'a', inventoryNumber: '6838' });
  const plan = m.planSync([{ inventoryNumber: '6838' }, { inventoryNumber: '0006838' }], new m.SiteIndex([a]));
  assert.equal(plan.conflicts.length, 1);
  assert.match(plan.conflicts[0].reason, /ту же карточку 6838/);
});

test('план: повтор нового номера в выгрузке — один create и конфликт', () => {
  const plan = m.planSync([{ inventoryNumber: 'N1' }, { inventoryNumber: 'N1' }], new m.SiteIndex([]));
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.conflicts.length, 1);
});

test('план: карточки сайта, которых нет в 1С, только перечисляются', () => {
  const plan = m.planSync([], new m.SiteIndex([site({ id: 'a', inventoryNumber: 'A' })]));
  assert.equal(plan.missingInOneC.length, 1);
  assert.equal(plan.updates.length + plan.creates.length, 0);
});

test('кандидаты: видно, по какому полю 1С совпадают номера', () => {
  // Типичная ловушка: код элемента в 1С не равен инвентарному номеру.
  // Сопоставление по Code создало бы дубли всех карточек
  const raws = [
    { Ref_Key: guid(1), Code: '00-000001', 'ИнвентарныйНомер': '00-001196' },
    { Ref_Key: guid(2), Code: '00-000002', 'ИнвентарныйНомер': '00-001285' },
    { Ref_Key: guid(3), IsFolder: true, Code: '00-001196' },
  ];
  const idx = new m.SiteIndex([site({ id: 'a', inventoryNumber: '00-001196' }), site({ id: 'b', inventoryNumber: '00-001285' })]);
  const byField = Object.fromEntries(m.matchCandidates(raws, ERP, lookups(), idx).map(c => [c.field, c]));
  assert.equal(byField['ИнвентарныйНомер'].matched, 2);
  assert.equal(byField.Code.matched, 0, 'группа справочника не должна засчитываться');
});

/* ---------------------- сеть против эмулятора --------------------- */

const emulators = [];
after(async () => { await Promise.all(emulators.map(e => e.close())); });

async function emulator(opts) {
  const e = await startEmulator(opts);
  emulators.push(e);
  return e;
}

test('постраничная загрузка забирает все записи и упорядочивает по Ref_Key', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ Ref_Key: guid(7 - i), Code: String(i) }));
  const e = await emulator({ entities: { 'Catalog_ОбъектыЭксплуатации': rows } });
  const all = await new OneCClient({ baseUrl: e.url, pageSize: 3 }).fetchAll('Catalog_ОбъектыЭксплуатации');
  assert.equal(all.length, 7);
  assert.equal(e.requests.length, 3, '3 + 3 + 1');
  assert.ok(e.requests.every(r => r.params.$orderby === 'Ref_Key' && r.params.$format === 'json'));
});

test('справочник ОС запрашивается без $select — неизвестное поле не роняет обмен', async () => {
  const e = await emulator({ entities: { 'Catalog_ОбъектыЭксплуатации': [] } });
  await new OneCClient({ baseUrl: e.url }).fetchAll('Catalog_ОбъектыЭксплуатации');
  assert.equal(e.requests[0].params.$select, undefined);
});

test('Basic-авторизация уходит в заголовке', async () => {
  const auth = 'Basic ' + Buffer.from('itinv_sync:секрет').toString('base64');
  const e = await emulator({ auth, entities: { 'Catalog_ОбъектыЭксплуатации': [{ Ref_Key: guid(1) }] } });
  const ok = await new OneCClient({ baseUrl: e.url, user: 'itinv_sync', password: 'секрет' }).fetchAll('Catalog_ОбъектыЭксплуатации');
  assert.equal(ok.length, 1);
  await assert.rejects(
    new OneCClient({ baseUrl: e.url, user: 'itinv_sync', password: 'не тот' }).fetchAll('Catalog_ОбъектыЭксплуатации'),
    /401.*Не пройдена аутентификация/,
  );
});

test('ошибка 1С приходит с текстом из odata.error, а не голым статусом', async () => {
  const e = await emulator({ entities: {} });
  await assert.rejects(new OneCClient({ baseUrl: e.url }).fetchAll('Catalog_ОбъектыЭксплуатации'), /404.*Не найден сегмент/);
});

test('недоступный регистр — предупреждение, а справочник ОС всё равно загружен', async () => {
  const e = await emulator({
    entities: {
      'Catalog_ОбъектыЭксплуатации': [{ Ref_Key: guid(1), 'ИнвентарныйНомер': 'A' }],
      'Catalog_СтруктураПредприятия': [{ Ref_Key: guid(100), Description: 'Склад' }],
      'Catalog_ФизическиеЛица': [],
    },
    failing: { 'InformationRegister_МестонахождениеОС/SliceLast()': 400 },
  });
  const r = await fetchOneC(new OneCClient({ baseUrl: e.url }), ERP);
  assert.equal(r.rawAssets.length, 1);
  assert.equal(r.lookups.departments.get(guid(100)), 'Склад');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /местонахождение ОС: 1С ответила 400/);
});

test('без справочника ОС обмен падает — молча продолжать без данных нельзя', async () => {
  const e = await emulator({ entities: {} });
  await assert.rejects(fetchOneC(new OneCClient({ baseUrl: e.url }), ERP), /Catalog_ОбъектыЭксплуатации/);
});

test('срез последних регистра раскладывается по GUID ОС', async () => {
  const e = await emulator({
    entities: {
      'Catalog_ОбъектыЭксплуатации': [],
      'Catalog_СтруктураПредприятия': [],
      'Catalog_ФизическиеЛица': [],
      'InformationRegister_МестонахождениеОС/SliceLast()': [
        { 'ОсновноеСредство_Key': guid(1).toUpperCase(), 'Местонахождение_Key': guid(100), 'МОЛ_Key': guid(200) },
      ],
    },
  });
  const r = await fetchOneC(new OneCClient({ baseUrl: e.url }), ERP);
  assert.equal(r.lookups.location.get(guid(1))['МОЛ_Key'], guid(200), 'ключ приводится к нижнему регистру');
  assert.equal(r.warnings.length, 0);
});
