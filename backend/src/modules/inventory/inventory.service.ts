import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventorySession, SessionStatus } from './entities/inventory-session.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { Asset, AssetStatus } from '../assets/entities/asset.entity';

@Injectable()
export class InventoryService {
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

  async createSession(dto: { name: string; description?: string; departmentId?: string }, userId: string, userName: string) {
    const assets = await this.assetRepo.find(dto.departmentId ? { where: { departmentId: dto.departmentId, status: AssetStatus.ACTIVE } } : { where: { status: AssetStatus.ACTIVE } });
    const session = await this.sessionRepo.save(
      this.sessionRepo.create({ ...dto, createdBy: userId, createdByName: userName, totalAssets: assets.length }),
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

  async checkItem(sessionId: string, assetId: string, dto: { status: AssetStatus; comment?: string; locationFound?: string }, userId: string, userName: string) {
    let item = await this.itemRepo.findOne({ where: { sessionId, assetId } });
    if (!item) throw new NotFoundException('Позиция не найдена в сессии');

    await this.itemRepo.update(item.id, {
      ...dto, isChecked: true, checkedBy: userId, checkedByName: userName, checkedAt: new Date(),
    });

    await this.sessionRepo
      .createQueryBuilder()
      .update()
      .set({ checkedAssets: () => '(SELECT COUNT(*) FROM inventory_items WHERE session_id = :sid AND is_checked = true)' })
      .where('id = :sid', { sid: sessionId })
      .execute();

    return this.itemRepo.findOne({ where: { id: item.id }, relations: { asset: true } });
  }

  async checkByInventoryNumber(sessionId: string, inventoryNumber: string, dto: any, userId: string, userName: string) {
    const asset = await this.assetRepo.findOne({ where: { inventoryNumber } });
    if (!asset) throw new NotFoundException(`ОС с номером ${inventoryNumber} не найдено`);
    return this.checkItem(sessionId, asset.id, dto, userId, userName);
  }

  async closeSession(id: string, userId: string) {
    const session = await this.getSession(id);
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
