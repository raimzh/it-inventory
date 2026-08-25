import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventorySession, SessionStatus } from './entities/inventory-session.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { Asset, AssetStatus } from '../assets/entities/asset.entity';
import { CheckItemDto, CreateSessionDto, ScanAssetDto } from './dto/inventory.dto';
import { parseScanCode } from '../../common/scan/parse-scan-code';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventorySession) private sessionRepo: Repository<InventorySession>,
    @InjectRepository(InventoryItem) private itemRepo: Repository<InventoryItem>,
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
  ) {}

  async getSessions(page = 1, limit = 20, status?: SessionStatus) {
    const qb = this.sessionRepo.createQueryBuilder('s')
      .leftJoinAndSelect('s.department', 'dept')
      .orderBy('s.createdAt', 'DESC');
    if (status) qb.where('s.status = :status', { status });
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async createSession(dto: CreateSessionDto, userId: string, userName: string) {
    const assets = await this.assetRepo.find(dto.departmentId ? { where: { departmentId: dto.departmentId, status: AssetStatus.ACTIVE } } : { where: { status: AssetStatus.ACTIVE } });
    // Поля перечислены поимённо, а не через `...dto`: сессия сама ведёт свой
    // статус, даты и счётчики, и принимать их из тела запроса нельзя.
    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        name: dto.name,
        description: dto.description,
        departmentId: dto.departmentId,
        createdBy: userId,
        createdByName: userName,
        totalAssets: assets.length,
      }),
    );

    if (assets.length > 0) {
      const items = assets.map(a => this.itemRepo.create({ sessionId: session.id, assetId: a.id, status: a.status }));
      await this.itemRepo.save(items, { chunk: 100 });
    }
    return this.sessionRepo.findOne({ where: { id: session.id }, relations: { department: true } });
  }

  async getSession(id: string) {
    const session = await this.sessionRepo.findOne({ where: { id }, relations: { department: true } });
    if (!session) throw new NotFoundException('Сессия не найдена');
    return session;
  }

  async getSessionItems(sessionId: string, page = 1, limit = 50, isChecked?: boolean) {
    const qb = this.itemRepo.createQueryBuilder('item')
      .leftJoinAndSelect('item.asset', 'asset')
      .where('item.sessionId = :sessionId', { sessionId });
    if (isChecked !== undefined) qb.andWhere('item.isChecked = :isChecked', { isChecked });
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async checkItem(sessionId: string, assetId: string, dto: CheckItemDto, userId: string, userName: string) {
    const item = await this.itemRepo.findOne({ where: { sessionId, assetId } });
    if (!item) throw new NotFoundException('Позиция не найдена в сессии');

    // Поля перечислены поимённо, а не через `...dto`: иначе телом запроса
    // можно было переставить позицию в чужую сессию или на другую ОС.
    // undefined TypeORM в UPDATE не включает, поэтому непришедший статус
    // оставляет прежний — как и было до валидации.
    await this.itemRepo.update(item.id, {
      status: dto.status,
      comment: dto.comment,
      locationFound: dto.locationFound,
      isChecked: true,
      checkedBy: userId,
      checkedByName: userName,
      checkedAt: new Date(),
    });

    await this.sessionRepo
      .createQueryBuilder()
      .update()
      .set({ checkedAssets: () => '(SELECT COUNT(*) FROM inventory_items WHERE session_id = :sid AND is_checked = true)' })
      .where('id = :sid', { sid: sessionId })
      .execute();

    return this.itemRepo.findOne({ where: { id: item.id }, relations: { asset: true } });
  }

  /**
   * Отметка по отсканированному коду.
   *
   * Принимает и голый инвентарный номер, и полезную нагрузку QR-этикетки
   * `INV:<номер>|ID:<uuid>`. Раньше разбора не было вовсе, и отсканированный
   * QR основного средства просто давал 404 — работал только ручной ввод.
   */
  async checkByInventoryNumber(sessionId: string, dto: ScanAssetDto, userId: string, userName: string) {
    const parsed = parseScanCode(dto.inventoryNumber);

    // Идентификатор с этикетки надёжнее номера: номер могли поменять.
    let asset = parsed.id ? await this.assetRepo.findOne({ where: { id: parsed.id } }) : null;

    if (asset && parsed.kind === 'asset' && asset.inventoryNumber !== parsed.key) {
      // Этикетку перепечатали или переклеили — доверяем идентификатору,
      // но это стоит увидеть в журнале.
      this.logger.warn(
        `Этикетка расходится с базой: на ней номер «${parsed.key}», в базе «${asset.inventoryNumber}» (ОС ${asset.id})`,
      );
    }

    if (!asset) asset = await this.assetRepo.findOne({ where: { inventoryNumber: parsed.key } });
    if (!asset) throw new NotFoundException(`ОС с номером ${parsed.key} не найдено`);

    return this.checkItem(sessionId, asset.id, dto, userId, userName);
  }

  // userId принимается, но кто закрыл сессию, нигде не сохраняется —
  // в сущности нет соответствующего поля. Оставлен в сигнатуре, чтобы не
  // трогать вызывающий код; завести поле стоит отдельной задачей
  async closeSession(id: string, _userId: string) {
    // Вызов ради проверки: getSession бросит, если сессии нет
    await this.getSession(id);
    await this.sessionRepo.update(id, { status: SessionStatus.CLOSED, endDate: new Date() });
    return this.getSession(id);
  }

  async getSessionStats(sessionId: string) {
    const total = await this.itemRepo.count({ where: { sessionId } });
    const checked = await this.itemRepo.count({ where: { sessionId, isChecked: true } });
    const notFound = await this.itemRepo.count({ where: { sessionId, status: AssetStatus.NOT_FOUND } });
    const repair = await this.itemRepo.count({ where: { sessionId, status: AssetStatus.REPAIR } });
    return { total, checked, unchecked: total - checked, notFound, repair, progress: total ? Math.round((checked / total) * 100) : 0 };
  }
}
