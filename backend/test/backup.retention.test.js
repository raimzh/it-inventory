'use strict';
/**
 * Ротация резервных копий: срок хранения и защита от удаления лишнего.
 *
 *   npm run test:backup-retention
 *
 * Это единственное место в системе, которое необратимо удаляет данные, и
 * оно не было покрыто ничем. Мина была в значении настройки:
 * BACKUP_RETENTION_DAYS=0 давало границу, равную текущему моменту, и ночная
 * задача сносила все копии, включая свою собственную. Узнают о таком ровно
 * в тот момент, когда копия понадобилась.
 *
 * Ни базы, ни поднятого приложения: cleanOldBackups обращается только к
 * this.config, this.logger и файловой системе. Метод берётся с прототипа с
 * подставным this — тот же приём, что в users.remove.fallback.test.js.
 *
 * Каталог всегда создаётся во временной папке и никогда не берётся из
 * BACKUP_DIR: ошибка здесь означала бы удаление боевых копий.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Берём собранный dist, а не .ts: в CI Node 20, снимать типы с исходника
// умеет только Node 22+
const {
  BackupService, resolveRetentionDays,
} = require('../dist/modules/backup/backup.service');

const DAY = 24 * 3600 * 1000;
const dirs = [];

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-rotation-'));
  dirs.push(d);
  return d;
}

after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

/** Имя в том же формате, что строит сервис: ISO с заменой двоеточий и точек */
const nameFor = ageDays =>
  `backup-${new Date(Date.now() - ageDays * DAY).toISOString().replace(/[:.]/g, '-')}.sql`;

/** Файл заданного возраста. Содержимое неважно, важна только mtime */
function put(dir, name, ageDays) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, '-- dump\n');
  const t = (Date.now() - ageDays * DAY) / 1000;
  fs.utimesSync(p, t, t);
  return name;
}

/** Сервис с подставными config и logger — контейнер зависимостей не поднимаем */
function service(env = {}) {
  const logs = { log: [], error: [] };
  const self = {
    config: { get: (k, d) => (env[k] !== undefined ? env[k] : d) },
    logger: {
      log: m => logs.log.push(String(m)),
      warn: m => logs.log.push(String(m)),
      error: (m, s) => logs.error.push(String(m) + (s ? ' ' + s : '')),
    },
  };
  return {
    logs,
    clean: (dir, keep) => BackupService.prototype.cleanOldBackups.call(self, dir, keep),
    warnMirror: dir => BackupService.prototype.warnIfMirrorCrowded.call(self, dir),
  };
}

/** Файл заданного размера — для проверки порога по объёму архива */
function putSized(dir, name, bytes) {
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes));
  return name;
}

const listing = dir => fs.readdirSync(dir).sort();

// --- Разбор значения ------------------------------------------------------

test('не заданное и пустое значение дают срок по умолчанию', () => {
  for (const v of [undefined, null, '', '   ']) {
    const p = resolveRetentionDays(v);
    assert.equal(p.enabled, true);
    assert.equal(p.days, 750, 'умолчание должно совпадать с принятым решением');
  }
});

test('ноль означает бессрочное хранение, а не удаление всего', () => {
  // Прежний код на нуле давал границу, равную «сейчас», и сносил вообще
  // все копии. Подмена смысла на противоположный — худшее, что могло
  // случиться именно с этой настройкой
  const p = resolveRetentionDays('0');
  assert.equal(p.enabled, false, 'ничего не удаляем');
  assert.equal(p.invalid, false, 'это осознанный режим, а не ошибка');
});

test('отрицательный срок отключает ротацию и считается ошибкой', () => {
  for (const v of ['-1', '-750']) {
    const p = resolveRetentionDays(v);
    assert.equal(p.enabled, false);
    assert.equal(p.invalid, true, 'такое надо показать в журнале как ошибку');
  }
});

test('мусор не превращается молча в правдоподобный срок', () => {
  // parseInt от «30d» это 30, а от «30.5» тоже 30 — опечатка в .env тихо
  // становилась бы рабочей настройкой. Поэтому Number, а не parseInt
  for (const v of ['abc', '30d', '30.5', 'NaN', 'Infinity', '1,5']) {
    const p = resolveRetentionDays(v);
    assert.equal(p.enabled, false, `${v} не должно включать удаление`);
    assert.equal(p.invalid, true);
  }
});

test('значение может прийти числом, а не строкой', () => {
  // ConfigService отдаёт не обязательно строку
  const p = resolveRetentionDays(750);
  assert.equal(p.enabled, true);
  assert.equal(p.days, 750);
});

// --- Реальное удаление ----------------------------------------------------

test('копия старше срока удаляется, свежая остаётся', async () => {
  const dir = tmpDir();
  put(dir, nameFor(751), 751);
  const fresh = put(dir, nameFor(749), 749);

  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  const res = await svc.clean(dir);

  assert.deepEqual(listing(dir), [fresh]);
  assert.equal(res.deleted, 1);
  assert.equal(res.kept, 1);
  assert.equal(res.failed, 0);
});

test('граница срока: чуть новее остаётся, чуть старее удаляется', async () => {
  // Запас в минуту, а не в секунду: на части файловых систем время
  // округляется, и посекундная граница однажды заставила бы тест мигать
  const dir = tmpDir();
  const minute = 1 / (24 * 60);
  const inside = put(dir, 'backup-2020-01-01T00-00-00-000Z.sql', 750 - minute);
  put(dir, 'backup-2020-01-02T00-00-00-000Z.sql', 750 + minute);

  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  await svc.clean(dir);

  assert.deepEqual(listing(dir), [inside]);
});

test('при сроке 0 не удаляется ничего, даже очень старое', async () => {
  const dir = tmpDir();
  const before = [
    put(dir, 'backup-2020-01-01T00-00-00-000Z.sql', 2000),
    put(dir, 'backup-2021-01-01T00-00-00-000Z.sql', 1000),
    put(dir, nameFor(1), 1),
  ].sort();

  const svc = service({ BACKUP_RETENTION_DAYS: '0' });
  const res = await svc.clean(dir);

  assert.deepEqual(listing(dir), before, 'ни один файл не должен пропасть');
  assert.equal(res.skipped, true);
  assert.equal(res.deleted, 0);
  assert.equal(svc.logs.error.length, 0, 'бессрочное хранение — не ошибка');
});

test('при неверном значении ничего не удаляется, и это видно в журнале', async () => {
  for (const bad of ['-1', 'abc']) {
    const dir = tmpDir();
    const before = [put(dir, 'backup-2020-01-01T00-00-00-000Z.sql', 2000)];

    const svc = service({ BACKUP_RETENTION_DAYS: bad });
    const res = await svc.clean(dir);

    assert.deepEqual(listing(dir), before, `${bad} не должно вычистить каталог`);
    assert.equal(res.skipped, true);
    assert.ok(svc.logs.error.length > 0, 'молчать про отключённую ротацию нельзя');
  }
});

test('только что созданная копия не удаляется ни при каких настройках', async () => {
  // Страховка на случай ошибки в арифметике окна: копию, ради которой
  // уборка и запускалась, потерять нельзя
  const dir = tmpDir();
  const justMade = put(dir, nameFor(0), 5000); // дата намеренно подделана в прошлое

  const svc = service({ BACKUP_RETENTION_DAYS: '1' });
  const res = await svc.clean(dir, justMade);

  assert.deepEqual(listing(dir), [justMade]);
  assert.equal(res.deleted, 0);
});

test('посторонние файлы в каталоге не трогаются', async () => {
  // Фильтр по маске — единственное, что отделяет уборку копий от
  // «удалим всё старое в каталоге»
  const dir = tmpDir();
  for (const n of ['readme.txt', 'dump.sql', 'backup-old.sql.gz', '.gitkeep']) {
    put(dir, n, 5000);
  }
  put(dir, 'backup-2020-01-01T00-00-00-000Z.sql', 5000);

  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  const res = await svc.clean(dir);

  assert.deepEqual(listing(dir), ['.gitkeep', 'backup-old.sql.gz', 'dump.sql', 'readme.txt']);
  assert.equal(res.deleted, 1);
});

test('зашифрованные копии ротируются наравне с обычными', async () => {
  // На боевом стенде шифрование включено: не подхвати маска .enc — уборка
  // была бы полностью фиктивной, а каталог рос бы вечно
  const dir = tmpDir();
  put(dir, 'backup-2020-01-01T00-00-00-000Z.sql.enc', 2000);

  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  const res = await svc.clean(dir);

  assert.deepEqual(listing(dir), []);
  assert.equal(res.deleted, 1);
});

// --- Метод не бросает никогда ---------------------------------------------

test('ошибка на одном файле не срывает уборку остальных', async () => {
  // Каталог с именем копии: удаление на нём падает и на Windows, и на Linux —
  // переносимый способ вызвать сбой
  const dir = tmpDir();
  const stuckPath = path.join(dir, 'backup-2020-01-01T00-00-00-000Z.sql');
  fs.mkdirSync(stuckPath);
  const t = (Date.now() - 2000 * DAY) / 1000;
  fs.utimesSync(stuckPath, t, t);
  put(dir, 'backup-2021-01-01T00-00-00-000Z.sql', 2000);

  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  let res;
  await assert.doesNotReject(async () => { res = await svc.clean(dir); });

  assert.equal(res.deleted, 1, 'второй файл всё равно должен быть убран');
  assert.equal(res.failed, 1);
  assert.ok(fs.existsSync(stuckPath), 'проблемный элемент остался на месте');
});

test('несуществующий каталог не роняет уборку', async () => {
  // На этом инварианте держится вызов в createBackup: сбой уборки не должен
  // выдавать уже созданную копию за провал
  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  let res;
  await assert.doesNotReject(async () => {
    res = await svc.clean(path.join(tmpDir(), 'нет-такого-каталога'));
  });
  assert.equal(res.failed, 1);
});

test('пустой каталог обрабатывается без ошибок', async () => {
  const svc = service({ BACKUP_RETENTION_DAYS: '750' });
  const res = await svc.clean(tmpDir());
  assert.deepEqual(res, { deleted: 0, kept: 0, failed: 0, skipped: false });
});

// --- Предупреждение о разрастании архива ----------------------------------
//
// Зеркало не чистится никогда, поэтому однажды упрётся в квоту облачного
// хранилища. Само исчерпание квоты из Node не увидеть: OneDrive перестаёт
// синхронизировать молча, а copyFileSync отчитывается успехом. Всё, до чего
// можно дотянуться, — объём самого архива, и предупредить заранее.

test('превышение порога попадает в журнал', () => {
  const dir = tmpDir();
  putSized(dir, 'backup-2020-01-01T00-00-00-000Z.sql.enc', 3 * 1024 * 1024);

  // Порог в мегабайтах задать нельзя, поэтому берём долю гигабайта
  const svc = service({ BACKUP_MIRROR_WARN_GB: String(2 / 1024) });
  svc.warnMirror(dir);

  assert.equal(svc.logs.log.length, 1, 'ожидается ровно одно предупреждение');
  assert.match(svc.logs.log[0], /Архив копий/);
  assert.match(svc.logs.log[0], /синхронизировать копии молча/,
    'запись должна называть настоящую опасность, а не только цифру');
});

test('ниже порога журнал молчит', () => {
  // Ложные тревоги приводят к тому, что журнал перестают читать
  const dir = tmpDir();
  putSized(dir, 'backup-2020-01-01T00-00-00-000Z.sql.enc', 1024);

  const svc = service({ BACKUP_MIRROR_WARN_GB: '2' });
  svc.warnMirror(dir);

  assert.equal(svc.logs.log.length, 0);
  assert.equal(svc.logs.error.length, 0);
});

test('ноль и мусор выключают проверку', () => {
  const dir = tmpDir();
  putSized(dir, 'backup-2020-01-01T00-00-00-000Z.sql.enc', 3 * 1024 * 1024);

  for (const v of ['0', '-1', 'abc', '']) {
    const svc = service({ BACKUP_MIRROR_WARN_GB: v });
    svc.warnMirror(dir);
    assert.equal(svc.logs.log.length, 0, `${v} должно выключать предупреждение`);
  }
});

test('считается весь каталог, а не только копии', () => {
  // В архиве может лежать что угодно — квоту занимает всё вместе
  const dir = tmpDir();
  putSized(dir, 'backup-2020-01-01T00-00-00-000Z.sql.enc', 1024 * 1024);
  putSized(dir, 'посторонний.zip', 3 * 1024 * 1024);

  const svc = service({ BACKUP_MIRROR_WARN_GB: String(3.5 / 1024) });
  svc.warnMirror(dir);

  assert.equal(svc.logs.log.length, 1, 'посторонние файлы тоже занимают квоту');
});

test('недоступный каталог не роняет копирование', () => {
  // Оценка объёма — вспомогательная задача: её сбой не должен помешать
  // ни дублированию, ни созданию копии
  const svc = service({ BACKUP_MIRROR_WARN_GB: '2' });
  assert.doesNotThrow(() => svc.warnMirror(path.join(tmpDir(), 'нет-такого')));
  assert.ok(svc.logs.error.length > 0, 'но в журнале след остаться должен');
});
