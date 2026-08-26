import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SyncLog, SyncStatus } from './entities/sync-log.entity';
import { Asset, AssetStatus } from '../assets/entities/asset.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { parseDateCell } from '../../common/excel/parse-date-cell';

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
  // В зависимости от конфигурации базы 1С отдаёт реквизиты либо латиницей
  // (стандартные), либо русскими именами («ИнвентарныйНомер» и т.п.),
  // поэтому доступ по произвольному ключу здесь легитимен.
  [key: string]: any;
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
    await this.runSync(undefined, undefined, 'scheduler');
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
        return this.syncLogRepo.findOneOrFail({ where: { id: log.id } });
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
    } catch (err: any) {
      this.logger.error('Sync failed', err.stack);
      await this.syncLogRepo.update(log.id, {
        status: SyncStatus.ERROR, finishedAt: new Date(),
        errors: [{ message: err.message }],
      });
    } finally {
      this.isRunning = false;
    }

    return this.syncLogRepo.findOneOrFail({ where: { id: log.id } });
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

  private async processAssets(assets: OneCAsset[], _logId: string) {
    let created = 0, updated = 0, skipped = 0;
    const errors: any[] = [];

    for (const raw of assets) {
      try {
        const invNumber = raw.Code || raw['ИнвентарныйНомер'] || '';
        if (!invNumber) { skipped++; continue; }

        const existing = await this.assetRepo.findOne({ where: { inventoryNumber: invNumber } })
          || await this.assetRepo.findOne({ where: { oneCGuid: raw.Ref_Key } });

        // Поля, которых в выгрузке нет, остаются undefined: TypeORM не
        // включает их в UPDATE, и прежнее значение сохраняется. Раньше
        // наименование и стоимости имели запасные значения — `|| invNumber`
        // и `|| 0`, — и обмен затирал ими то, что уже было в учёте:
        // выгрузка без стоимости обнуляла остаточную у всех записей,
        // а выгрузка без наименования подменяла его инвентарным номером.
        const name = raw.Description || raw['Наименование'];
        const residual = raw['ОстаточнаяСтоимость'] ?? raw.ResidualValue;
        const initial = raw['ПервоначальнаяСтоимость'] ?? raw.InitialValue;
        const commissioning = parseDateCell(raw['ДатаВводаВЭксплуатацию'] ?? raw.CommissioningDate);

        const mapped: Partial<Asset> = {
          inventoryNumber: invNumber,
          serialNumber: raw['СерийныйНомер'] || raw.SerialNumber,
          departmentName: raw['Подразделение'] || raw.Department,
          location: raw['Местоположение'] || raw.Location,
          responsiblePerson: raw['ОтветственноеЛицо'] || raw.ResponsiblePerson,
          oneCId: raw.Code,
          oneCGuid: raw.Ref_Key,
          lastSyncedAt: new Date(),
        };
        if (name) mapped.name = name;
        if (residual !== undefined && residual !== null) mapped.residualValue = residual;
        if (initial !== undefined && initial !== null) mapped.initialValue = initial;
        // Дата разбирается тем же модулем, что и импорт из Excel: 1С отдаёт
        // и ISO, и ДД.ММ.ГГГГ, а `new Date` на втором формате либо не
        // понимает вовсе, либо молча подставляет другую дату
        if (commissioning) mapped.commissioningDate = new Date(`${commissioning}T00:00:00Z`);

        if (existing) {
          await this.assetRepo.update(existing.id, mapped);
          updated++;
        } else {
          // У новой записи наименование обязательно — здесь запасное
          // значение уместно: затирать нечего
          await this.assetRepo.save(this.assetRepo.create({
            ...mapped, name: mapped.name ?? invNumber, status: AssetStatus.ACTIVE,
          }));
          created++;
        }
      } catch (err: any) {
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

    return this.syncLogRepo.findOneOrFail({ where: { id: log.id } });
  }
}
