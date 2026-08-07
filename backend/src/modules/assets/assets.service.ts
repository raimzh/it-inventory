import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { Asset, AssetStatus } from './entities/asset.entity';
import { AssetHistory } from './entities/asset-history.entity';
import { AssetFile } from './entities/asset-file.entity';
import { Department } from '../departments/entities/department.entity';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';
import { QueryAssetsDto } from './dto/query-assets.dto';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(AssetHistory) private historyRepo: Repository<AssetHistory>,
    @InjectRepository(AssetFile) private fileRepo: Repository<AssetFile>,
    @InjectRepository(Department) private departmentRepo: Repository<Department>,
    @InjectDataSource() private dataSource: DataSource,
    private cache: CacheService,
  ) {}

  // Кэш статистики дашборда. TTL ограничивает устаревание сверху, а явная
  // инвалидация сбрасывает его сразу после любой мутации ОС — пользователь
  // видит свежие цифры мгновенно. Хранилище общее (Redis, если настроен),
  // иначе при нескольких инстансах сброс на одном не виден остальным.
  private static readonly STATS_CACHE_KEY = 'assets:stats';
  private static readonly STATS_TTL_MS = 20_000;

  invalidateStatsCache() {
    // Намеренно не ждём: сброс кэша не должен задерживать ответ на операцию
    void this.cache.invalidate(AssetsService.STATS_CACHE_KEY);
  }

  private async syncDepartmentName<T extends { departmentId?: string; departmentName?: string }>(dto: T): Promise<T> {
    if (dto.departmentId !== undefined && dto.departmentName === undefined) {
      const dept = dto.departmentId ? await this.departmentRepo.findOne({ where: { id: dto.departmentId } }) : null;
      dto.departmentName = dept?.name ?? null as any;
    }
    return dto;
  }

  async findAll(query: QueryAssetsDto) {
    const { search, inventoryNumber, departmentId, ownerId, status, category, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = query;
    const skip = (page - 1) * limit;

    const qb = this.assetRepo.createQueryBuilder('asset')
      .leftJoinAndSelect('asset.department', 'department')
      .leftJoinAndSelect('asset.owner', 'owner');

    if (search) {
      qb.andWhere('(asset.name ILIKE :s OR asset.inventoryNumber ILIKE :s OR asset.serialNumber ILIKE :s OR asset.responsiblePerson ILIKE :s)',
        { s: `%${search}%` });
    }
    if (inventoryNumber) qb.andWhere('asset.inventoryNumber ILIKE :inv', { inv: `%${inventoryNumber}%` });
    if (departmentId) qb.andWhere('asset.departmentId = :deptId', { deptId: departmentId });
    if (ownerId) qb.andWhere('asset.ownerId = :ownerId', { ownerId });
    if (status) qb.andWhere('asset.status = :status', { status });
    if (category) qb.andWhere('asset.category ILIKE :cat', { cat: `%${category}%` });

    const allowedSort = ['createdAt', 'updatedAt', 'inventoryNumber', 'name', 'status', 'residualValue'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    qb.orderBy(`asset.${safeSort}`, sortOrder).skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string): Promise<Asset> {
    const asset = await this.assetRepo.findOne({
      where: { id },
      relations: ['department', 'owner'],
    });
    if (!asset) throw new NotFoundException('ОС не найдено');
    return asset;
  }

  async findByInventoryNumber(inventoryNumber: string): Promise<Asset | null> {
    return this.assetRepo.findOne({ where: { inventoryNumber } });
  }

  async create(dto: CreateAssetDto, userId?: string, userName?: string): Promise<Asset> {
    await this.syncDepartmentName(dto);
    const asset = this.assetRepo.create(dto);
    let saved: Asset;
    try {
      saved = await this.assetRepo.save(asset);
    } catch (e: any) {
      // 23505 = unique_violation (инвентарный номер уже существует)
      if (e?.code === '23505') {
        throw new BadRequestException(
          `ОС с инвентарным номером «${dto.inventoryNumber}» уже существует.`,
        );
      }
      throw e;
    }

    // Generate QR code data URL
    const qrData = `INV:${saved.inventoryNumber}|ID:${saved.id}`;
    await this.assetRepo.update(saved.id, { qrCode: qrData });

    if (userId) {
      await this.historyRepo.save({
        assetId: saved.id, field: 'created', oldValue: null,
        newValue: saved.inventoryNumber, changedBy: userId, changedByName: userName, source: 'manual',
      } as Partial<AssetHistory>);
    }
    this.invalidateStatsCache();
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateAssetDto, userId?: string, userName?: string): Promise<Asset> {
    await this.syncDepartmentName(dto);
    // Версия не является полем данных — вынимаем её до сравнения изменений
    const { version: clientVersion, ...changes } = dto as UpdateAssetDto & { version?: number };

    // Всё в одной транзакции: запись ОС и запись истории должны попасть
    // в базу вместе, иначе история разъезжается с фактическим состоянием.
    return this.dataSource.transaction(async (m) => {
      // Блокируем строку на время проверки версии, чтобы два параллельных
      // сохранения не прошли проверку одновременно.
      const asset = await m.findOne(Asset, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!asset) throw new NotFoundException('ОС не найдено');

      if (clientVersion !== undefined && Number(clientVersion) !== asset.version) {
        throw new ConflictException(
          'Карточку уже изменил другой пользователь. Обновите страницу, чтобы увидеть актуальные данные, и повторите правку.',
        );
      }

      const changedFields: AssetHistory[] = [];
      for (const [key, value] of Object.entries(changes)) {
        const current = (asset as Record<string, any>)[key];
        if (value !== undefined && current !== value) {
          changedFields.push({
            assetId: id, field: key,
            oldValue: String(current ?? ''),
            newValue: String(value ?? ''),
            changedBy: userId, changedByName: userName, source: 'manual',
          } as AssetHistory);
        }
      }

      await m.update(Asset, id, { ...(changes as any), version: asset.version + 1 });
      if (changedFields.length) await m.save(AssetHistory, changedFields);

      this.invalidateStatsCache();
      return m.findOneOrFail(Asset, { where: { id }, relations: ['department', 'owner'] });
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.assetRepo.delete(id);
    } catch (e: any) {
      // 23503 = foreign_key_violation (например, ОС включена в сессию инвентаризации)
      if (e?.code === '23503') {
        throw new BadRequestException(
          'Невозможно удалить ОС: оно используется в инвентаризации. Сначала удалите связанные записи.',
        );
      }
      throw e;
    }
    this.invalidateStatsCache();
  }

  async getHistory(assetId: string) {
    return this.historyRepo.find({
      where: { assetId },
      order: { createdAt: 'DESC' },
    });
  }

  async getFiles(assetId: string) {
    return this.fileRepo.find({ where: { assetId }, order: { createdAt: 'DESC' } });
  }

  async addFile(assetId: string, file: Express.Multer.File, type: string, userId: string): Promise<AssetFile> {
    const assetFile = this.fileRepo.create({
      assetId, filename: file.filename, originalName: file.originalname,
      mimeType: file.mimetype, size: file.size, type, uploadedBy: userId,
    });
    return this.fileRepo.save(assetFile);
  }

  async removeFile(fileId: string): Promise<void> {
    await this.fileRepo.delete(fileId);
  }

  /**
   * Путь к вложению на диске по идентификатору записи.
   *
   * Имя файла берётся ИЗ БАЗЫ, а не из URL, поэтому подставить сюда «../»
   * нельзя в принципе. Дополнительно проверяем, что итоговый путь не покидает
   * каталог загрузок — на случай испорченных данных.
   */
  async getFilePath(fileId: string): Promise<{ file: AssetFile; path: string }> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('Файл не найден');

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const resolved = path.resolve(uploadDir, path.basename(file.filename));
    if (path.relative(uploadDir, resolved).startsWith('..')) {
      throw new BadRequestException('Недопустимый путь к файлу');
    }
    if (!fs.existsSync(resolved)) throw new NotFoundException('Файл отсутствует на диске');
    return { file, path: resolved };
  }

  async generateQrCode(id: string): Promise<string> {
    const asset = await this.findOne(id);
    const qrData = `INV:${asset.inventoryNumber}|ID:${asset.id}`;
    return QRCode.toDataURL(qrData, { width: 256, margin: 2 });
  }

  async getDashboardStats() {
    const cached = await this.cache.get<any>(AssetsService.STATS_CACHE_KEY);
    if (cached) return cached;

    const total = await this.assetRepo.count();
    const byStatus = await this.assetRepo.createQueryBuilder('a')
      .select('a.status', 'status').addSelect('COUNT(*)', 'count')
      .groupBy('a.status').getRawMany();
    const byDepartment = await this.assetRepo.createQueryBuilder('a')
      .select('a.departmentName', 'department').addSelect('COUNT(*)', 'count')
      .groupBy('a.departmentName').orderBy('count', 'DESC').limit(10).getRawMany();
    const totalValue = await this.assetRepo.createQueryBuilder('a')
      .select('SUM(a.residualValue)', 'total').getRawOne();

    const data = { total, byStatus, byDepartment, totalResidualValue: totalValue?.total || 0 };
    await this.cache.set(AssetsService.STATS_CACHE_KEY, data, AssetsService.STATS_TTL_MS);
    return data;
  }

  async bulkUpdate(ids: string[], dto: UpdateAssetDto, userId?: string, userName?: string) {
    if (!ids?.length) return { updated: 0 };
    await this.syncDepartmentName(dto);

    // 1 SELECT вместо N findOne — грузим все затронутые ОС разом
    const assets = await this.assetRepo.find({ where: { id: In(ids) } });
    if (!assets.length) return { updated: 0 };

    // Историю изменений собираем в памяти, сравнивая с загруженными значениями
    const history: AssetHistory[] = [];
    for (const asset of assets) {
      for (const [key, value] of Object.entries(dto)) {
        if (value !== undefined && (asset as any)[key] !== value) {
          history.push({
            assetId: asset.id, field: key,
            oldValue: String((asset as any)[key] ?? ''),
            newValue: String(value ?? ''),
            changedBy: userId, changedByName: userName, source: 'manual',
          } as AssetHistory);
        }
      }
    }

    // 1 UPDATE ... WHERE id IN (...) + 1 batch INSERT истории
    await this.assetRepo.update({ id: In(assets.map(a => a.id)) }, dto as any);
    if (history.length) await this.historyRepo.save(history);

    this.invalidateStatsCache();
    return { updated: assets.length };
  }
}
