import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SyncLog, SyncStatus } from './entities/sync-log.entity';
import { Asset, AssetStatus } from '../assets/entities/asset.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  OneCLookups, OneCProfile, SiteIndex, SyncPlan, SyncRecord, fieldCoverage, fromFileRecord,
  fromODataRecord, matchCandidates, matchValue, planSync, resolveProfile,
} from './one-c-mapping';
import { OneCClient, fetchOneC } from './one-c-client';

/** Сколько строк каждого списка отдавать в отчёте — остальное только счётчиком */
const SAMPLE = 50;

export const DRY_RUN_SOURCE = 'dry-run';

/**
 * Отчёт обмена. У пробного прогона это единственный результат: в учёт он
 * ничего не пишет. В базе не хранится — журнал держит только счётчики.
 */
export interface SyncReport {
  dryRun: boolean;
  profile?: string;
  entity?: string;
  matchField?: string;
  /** Записей справочника ОС получено из 1С (или строк файла) */
  fetched: number;
  skipped: { folder: number; deleted: number; noNumber: number };
  /** Какое поле 1С совпадает с нашими номерами — главное для первого запуска */
  candidates?: { field: string; present: number; matched: number }[];
  coverage?: { field: string; present: number }[];
  lookups?: { departments: number; persons: number; location: number; inventoryNumbers: number };
  warnings: string[];
  siteTotal: number;
  updates: number;
  unchanged: number;
  creates: number;
  conflicts: { inventoryNumber: string; reason: string }[];
  missingInOneC: number;
  /** Помечены на удаление в 1С, но есть на сайте. Сайт их не трогает */
  markedDeletedOnSite: { inventoryNumber: string; name: string }[];
  /** Сопоставлены по GUID, но номер в 1С другой. Номер не меняется автоматически */
  numberMismatch: { site: string; oneC: string }[];
  samples: {
    updates: { inventoryNumber: string; changes: { field: string; from: string | null; to: string }[] }[];
    creates: { inventoryNumber: string; name: string | null }[];
    missingInOneC: { inventoryNumber: string; name: string }[];
  };
}

export type SyncRunResult = SyncLog & { report?: SyncReport };

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private isRunning = false;

  constructor(
    @InjectRepository(SyncLog) private syncLogRepo: Repository<SyncLog>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Плановый обмен включается отдельным флагом, а не самим фактом наличия
   * адреса 1С. Иначе он начал бы писать в учёт в 06:00 следующего же утра
   * после того, как администратор впишет адрес, — до того, как кто-нибудь
   * посмотрит отчёт пробного прогона.
   */
  @Cron(process.env.ONE_C_SYNC_CRON || '0 6 * * *')
  async scheduledSync() {
    if (this.config.get('ONE_C_SYNC_ENABLED') !== 'true') return;
    this.logger.log('Scheduled 1C sync started');
    await this.runSync(undefined, undefined, 'scheduler');
  }

  async runSync(userId?: string, userName?: string, source = 'manual', dryRun = false): Promise<SyncRunResult> {
    if (this.isRunning) {
      const running = await this.syncLogRepo.findOne({ where: { status: SyncStatus.RUNNING }, order: { startedAt: 'DESC' } });
      if (running) return running;
    }

    this.isRunning = true;
    const log = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        status: SyncStatus.RUNNING, triggeredBy: userId, triggeredByName: userName,
        source: dryRun ? DRY_RUN_SOURCE : source,
      }),
    );

    let report: SyncReport | undefined;
    try {
      const oneCUrl = this.config.get('ONE_C_URL');
      if (!oneCUrl) {
        await this.syncLogRepo.update(log.id, {
          status: SyncStatus.ERROR, finishedAt: new Date(),
          errors: [{ message: '1C URL не настроен. Укажите ONE_C_URL в конфигурации.' }] as any,
        });
        return this.syncLogRepo.findOneOrFail({ where: { id: log.id } });
      }

      const profile = resolveProfile(process.env);
      const client = new OneCClient({
        baseUrl: oneCUrl,
        user: this.config.get('ONE_C_USER', ''),
        password: this.config.get('ONE_C_PASSWORD', ''),
      });
      const fetched = await fetchOneC(client, profile);

      const records: SyncRecord[] = [];
      const skipped = { folder: 0, deleted: 0, noNumber: 0 };
      const deletedRaw: any[] = [];
      for (const raw of fetched.rawAssets) {
        const r = fromODataRecord(raw, profile, fetched.lookups);
        if ('record' in r) { records.push(r.record); continue; }
        if (r.skip === 'folder') skipped.folder++;
        else if (r.skip === 'deleted') { skipped.deleted++; deletedRaw.push(raw); }
        else skipped.noNumber++;
      }

      const index = new SiteIndex(await this.loadSiteAssets());
      const plan = planSync(records, index);

      report = this.buildReport(plan, index, {
        dryRun, fetched: fetched.rawAssets.length, skipped, warnings: fetched.warnings,
      });
      report.profile = profile.title;
      report.entity = profile.assetsEntity;
      report.matchField = profile.matchField;
      report.candidates = matchCandidates(fetched.rawAssets, profile, fetched.lookups, index);
      report.coverage = fieldCoverage(fetched.rawAssets, profile);
      report.lookups = {
        departments: fetched.lookups.departments.size,
        persons: fetched.lookups.persons.size,
        location: fetched.lookups.location.size,
        inventoryNumbers: fetched.lookups.inventoryNumbers.size,
      };
      report.markedDeletedOnSite = this.deletedOnSite(deletedRaw, profile, fetched.lookups, index);

      const result = dryRun ? { created: 0, updated: 0, errors: [] as any[] } : await this.applyPlan(plan);

      await this.syncLogRepo.update(log.id, {
        status: SyncStatus.SUCCESS, finishedAt: new Date(),
        recordsProcessed: fetched.rawAssets.length,
        // У пробного прогона счётчики показывают, что БЫЛО БЫ сделано
        recordsCreated: dryRun ? plan.creates.length : result.created,
        recordsUpdated: dryRun ? plan.updates.length : result.updated,
        recordsSkipped: skipped.folder + skipped.deleted + skipped.noNumber + plan.conflicts.length,
        errors: [
          ...plan.conflicts.map(c => ({ inventoryNumber: c.inventoryNumber, error: c.reason })),
          ...fetched.warnings.map(w => ({ message: w })),
          ...result.errors,
        ],
      });

      if (!dryRun && result.errors.length > 0) {
        await this.notifications.sendSyncErrorNotification(result.errors);
      }
    } catch (err: any) {
      this.logger.error('Sync failed', err.stack);
      await this.syncLogRepo.update(log.id, {
        status: SyncStatus.ERROR, finishedAt: new Date(),
        errors: [{ message: err.message }],
      });
    } finally {
      this.isRunning = false;
    }

    const saved: SyncRunResult = await this.syncLogRepo.findOneOrFail({ where: { id: log.id } });
    if (report) saved.report = report;
    return saved;
  }

  /** Карточки сайта — только неудалённые: удалённые TypeORM отсеивает сам */
  private async loadSiteAssets() {
    return this.assetRepo.find({
      select: {
        id: true, inventoryNumber: true, oneCGuid: true, oneCId: true, name: true, serialNumber: true,
        departmentName: true, location: true, responsiblePerson: true, commissioningDate: true,
        residualValue: true, initialValue: true,
      },
    });
  }

  private buildReport(
    plan: SyncPlan,
    index: SiteIndex,
    base: { dryRun: boolean; fetched: number; skipped: SyncReport['skipped']; warnings: string[] },
  ): SyncReport {
    const numberMismatch = [...plan.updates, ...plan.unchanged]
      .filter(u => u.record.inventoryNumber.trim().toLowerCase() !== u.asset.inventoryNumber.trim().toLowerCase()
        && u.record.oneCGuid && u.asset.oneCGuid?.toLowerCase() === u.record.oneCGuid)
      .map(u => ({ site: u.asset.inventoryNumber, oneC: u.record.inventoryNumber }));

    return {
      ...base,
      siteTotal: index.assets.length,
      updates: plan.updates.length,
      unchanged: plan.unchanged.length,
      creates: plan.creates.length,
      conflicts: plan.conflicts.slice(0, SAMPLE),
      missingInOneC: plan.missingInOneC.length,
      markedDeletedOnSite: [],
      numberMismatch: numberMismatch.slice(0, SAMPLE),
      samples: {
        updates: plan.updates.slice(0, SAMPLE).map(u => ({ inventoryNumber: u.asset.inventoryNumber, changes: u.changes })),
        creates: plan.creates.slice(0, SAMPLE).map(c => ({ inventoryNumber: c.inventoryNumber, name: c.name ?? null })),
        missingInOneC: plan.missingInOneC.slice(0, SAMPLE).map(a => ({ inventoryNumber: a.inventoryNumber, name: a.name ?? '' })),
      },
    };
  }

  private deletedOnSite(deletedRaw: any[], profile: OneCProfile, lookups: OneCLookups, index: SiteIndex) {
    const out: { inventoryNumber: string; name: string }[] = [];
    for (const raw of deletedRaw) {
      const number = matchValue(raw, profile.matchField, profile, lookups) ?? '';
      const guid = typeof raw.Ref_Key === 'string' ? raw.Ref_Key.toLowerCase() : undefined;
      const asset = index.find({ inventoryNumber: number, oneCGuid: guid });
      if (asset) out.push({ inventoryNumber: asset.inventoryNumber, name: asset.name ?? '' });
      if (out.length >= SAMPLE) break;
    }
    return out;
  }

  /**
   * Запись плана в учёт. Каждая карточка — отдельно: ошибка одной не должна
   * оставить без обновления остальные, а попасть в журнал обязана.
   */
  private async applyPlan(plan: SyncPlan) {
    let created = 0, updated = 0;
    const errors: any[] = [];
    const now = new Date();

    for (const { asset, record, changes } of plan.updates) {
      try {
        const patch: Partial<Asset> = { lastSyncedAt: now };
        for (const c of changes) (patch as any)[c.field] = this.storedValue(c.field, (record as any)[c.field]);
        await this.assetRepo.update(asset.id, patch);
        updated++;
      } catch (err: any) {
        errors.push({ inventoryNumber: record.inventoryNumber, error: err.message });
      }
    }

    // Совпавшие без изменений — только отметка, что 1С их подтвердила
    const unchangedIds = plan.unchanged.map(u => u.asset.id);
    if (unchangedIds.length) await this.assetRepo.update({ id: In(unchangedIds) }, { lastSyncedAt: now });

    for (const record of plan.creates) {
      try {
        const fields: Partial<Asset> = { inventoryNumber: record.inventoryNumber, lastSyncedAt: now, status: AssetStatus.ACTIVE };
        for (const key of Object.keys(record) as (keyof SyncRecord)[]) {
          if (key === 'inventoryNumber' || record[key] === undefined) continue;
          (fields as any)[key] = this.storedValue(key as any, record[key]);
        }
        // У новой карточки наименование обязательно — здесь запасное
        // значение уместно: затирать нечего
        fields.name = fields.name ?? record.inventoryNumber;
        await this.assetRepo.save(this.assetRepo.create(fields));
        created++;
      } catch (err: any) {
        errors.push({ inventoryNumber: record.inventoryNumber, error: err.message });
      }
    }

    return { created, updated, errors };
  }

  /**
   * Дата в записи обмена — строка ГГГГ-ММ-ДД. В date-колонку она уходит
   * полуночью UTC: так день не съезжает в часовых поясах восточнее Гринвича.
   */
  private storedValue(field: string, value: unknown) {
    if (field === 'commissioningDate' && typeof value === 'string') return new Date(`${value}T00:00:00Z`);
    return value;
  }

  async getLogs(limit = 20) {
    return this.syncLogRepo.find({ order: { startedAt: 'DESC' }, take: limit });
  }

  /**
   * Пробный прогон в учёт ничего не пишет, поэтому «последней синхронизацией»
   * быть не может: дашборд показывал бы обмен, которого не было.
   */
  async getLastSync() {
    return this.syncLogRepo.findOne({
      where: { status: SyncStatus.SUCCESS, source: Not(DRY_RUN_SOURCE) },
      order: { finishedAt: 'DESC' },
    });
  }

  async importFromFile(data: any[], userId?: string, userName?: string): Promise<SyncLog> {
    const log = await this.syncLogRepo.save(
      this.syncLogRepo.create({ status: SyncStatus.RUNNING, triggeredBy: userId, triggeredByName: userName, source: 'file' }),
    );

    let skipped = 0;
    const records: SyncRecord[] = [];
    for (const raw of data) {
      const rec = fromFileRecord(raw ?? {});
      if (!rec.inventoryNumber) { skipped++; continue; }
      records.push(rec);
    }

    const plan = planSync(records, new SiteIndex(await this.loadSiteAssets()));
    const result = await this.applyPlan(plan);
    const errors = [
      ...plan.conflicts.map(c => ({ inventoryNumber: c.inventoryNumber, error: c.reason })),
      ...result.errors,
    ];

    await this.syncLogRepo.update(log.id, {
      status: errors.length === data.length ? SyncStatus.ERROR : SyncStatus.SUCCESS,
      finishedAt: new Date(),
      recordsProcessed: data.length,
      recordsCreated: result.created,
      recordsUpdated: result.updated,
      recordsSkipped: skipped + plan.conflicts.length,
      errors,
    });

    return this.syncLogRepo.findOneOrFail({ where: { id: log.id } });
  }
}
