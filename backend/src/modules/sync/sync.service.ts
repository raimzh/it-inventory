import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SyncLog, SyncStatus } from './entities/sync-log.entity';
import { Asset, AssetStatus } from '../assets/entities/asset.entity';
import { NotificationsService } from '../notifications/notifications.service';

interface OneCAsset {
  Ref_Key?: string;
  Code?: string;
  Description?: string;
  SerialNumber?: string;
  Department?: string;
  Location?: string;
  ResponsiblePerson?: string;
  CommissioningDate?: string;
  ResidualValue?: number;
  InitialValue?: number;
  Status?: string;
  Category?: string;
  Manufacturer?: string;
  Model?: string;
}

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

  @Cron(process.env.ONE_C_SYNC_CRON || '0 6 * * *')
  async scheduledSync() {
    this.logger.log('Scheduled 1C sync started');
    await this.runSync(null, null, 'scheduler');
  }

  async runSync(userId?: string, userName?: string, source = 'manual'): Promise<SyncLog> {
    if (this.isRunning) {
      const running = await this.syncLogRepo.findOne({ where: { status: SyncStatus.RUNNING }, order: { startedAt: 'DESC' } });
      if (running) return running;
    }

    this.isRunning = true;
    const log = await this.syncLogRepo.save(
      this.syncLogRepo.create({ status: SyncStatus.RUNNING, triggeredBy: userId, triggeredByName: userName, source }),
    );

    try {
      const oneCUrl = this.config.get('ONE_C_URL');
      if (!oneCUrl) {
        await this.syncLogRepo.update(log.id, {
          status: SyncStatus.ERROR, finishedAt: new Date(),
          errors: [{ message: '1C URL не настроен. Укажите ONE_C_URL в конфигурации.' }] as any,
        });
        return this.syncLogRepo.findOne({ where: { id: log.id } });
      }

      const assets = await this.fetchFrom1C(oneCUrl);
      const stats = await this.processAssets(assets, log.id);

      await this.syncLogRepo.update(log.id, {
        status: SyncStatus.SUCCESS, finishedAt: new Date(),
        recordsProcessed: assets.length,
        recordsCreated: stats.created,
        recordsUpdated: stats.updated,
        recordsSkipped: stats.skipped,
        errors: stats.errors,
      });

      if (stats.errors.length > 0) {
        await this.notifications.sendSyncErrorNotification(stats.errors);
      }
    } catch (err) {
      this.logger.error('Sync failed', err.stack);
      await this.syncLogRepo.update(log.id, {
        status: SyncStatus.ERROR, finishedAt: new Date(),
        errors: [{ message: err.message }],
      });
    } finally {
      this.isRunning = false;
    }

    return this.syncLogRepo.findOne({ where: { id: log.id } });
  }

  private async fetchFrom1C(baseUrl: string): Promise<OneCAsset[]> {
    const user = this.config.get('ONE_C_USER', '');
    const pass = this.config.get('ONE_C_PASSWORD', '');
    const headers: any = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (user) headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    const url = `${baseUrl}/Catalog_ОсновныеСредства?$format=json&$select=Ref_Key,Code,Description,ИнвентарныйНомер,Наименование,СерийныйНомер,Подразделение_Key,Местоположение,ОтветственноеЛицо,ДатаВводаВЭксплуатацию,ОстаточнаяСтоимость,ПервоначальнаяСтоимость,Статус`;

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`1C API error: ${resp.status} ${resp.statusText}`);

    const data = await resp.json();
    return data.value || [];
  }

  private async processAssets(assets: OneCAsset[], logId: string) {
    let created = 0, updated = 0, skipped = 0;
    const errors: any[] = [];

    for (const raw of assets) {
      try {
        const invNumber = raw.Code || raw['ИнвентарныйНомер'] || '';
        if (!invNumber) { skipped++; continue; }

        const existing = await this.assetRepo.findOne({ where: { inventoryNumber: invNumber } })
          || await this.assetRepo.findOne({ where: { oneCGuid: raw.Ref_Key } });

        const mapped: Partial<Asset> = {
          inventoryNumber: invNumber,
          name: raw.Description || raw['Наименование'] || invNumber,
          serialNumber: raw['СерийныйНомер'] || raw.SerialNumber,
          departmentName: raw['Подразделение'] || raw.Department,
          location: raw['Местоположение'] || raw.Location,
          responsiblePerson: raw['ОтветственноеЛицо'] || raw.ResponsiblePerson,
          commissioningDate: raw['ДатаВводаВЭксплуатацию'] ? new Date(raw['ДатаВводаВЭксплуатацию']) : undefined,
          residualValue: raw['ОстаточнаяСтоимость'] || raw.ResidualValue || 0,
          initialValue: raw['ПервоначальнаяСтоимость'] || raw.InitialValue || 0,
          oneCId: raw.Code,
          oneCGuid: raw.Ref_Key,
          lastSyncedAt: new Date(),
        };

        if (existing) {
          await this.assetRepo.update(existing.id, mapped);
          updated++;
        } else {
          await this.assetRepo.save(this.assetRepo.create({ ...mapped, status: AssetStatus.ACTIVE }));
          created++;
        }
      } catch (err) {
        errors.push({ inventoryNumber: raw.Code, error: err.message });
      }
    }

    return { created, updated, skipped, errors };
  }

  async getLogs(limit = 20) {
    return this.syncLogRepo.find({ order: { startedAt: 'DESC' }, take: limit });
  }

  async getLastSync() {
    return this.syncLogRepo.findOne({ where: { status: SyncStatus.SUCCESS }, order: { finishedAt: 'DESC' } });
  }

  async importFromFile(data: any[], userId?: string, userName?: string): Promise<SyncLog> {
    const log = await this.syncLogRepo.save(
      this.syncLogRepo.create({ status: SyncStatus.RUNNING, triggeredBy: userId, triggeredByName: userName, source: 'file' }),
    );

    const stats = await this.processAssets(data, log.id);
    await this.syncLogRepo.update(log.id, {
      status: stats.errors.length === data.length ? SyncStatus.ERROR : SyncStatus.SUCCESS,
      finishedAt: new Date(),
      recordsProcessed: data.length,
      recordsCreated: stats.created,
      recordsUpdated: stats.updated,
      recordsSkipped: stats.skipped,
      errors: stats.errors,
    });

    return this.syncLogRepo.findOne({ where: { id: log.id } });
  }
}
