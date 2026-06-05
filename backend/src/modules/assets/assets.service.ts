import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { Asset, AssetStatus } from './entities/asset.entity';
import { AssetHistory } from './entities/asset-history.entity';
import { AssetFile } from './entities/asset-file.entity';
import { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';
import { QueryAssetsDto } from './dto/query-assets.dto';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(AssetHistory) private historyRepo: Repository<AssetHistory>,
    @InjectRepository(AssetFile) private fileRepo: Repository<AssetFile>,
  ) {}

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
    const asset = this.assetRepo.create(dto);
    const saved = await this.assetRepo.save(asset);

    // Generate QR code data URL
    const qrData = `INV:${saved.inventoryNumber}|ID:${saved.id}`;
    await this.assetRepo.update(saved.id, { qrCode: qrData });

    if (userId) {
      await this.historyRepo.save({
        assetId: saved.id, field: 'created', oldValue: null,
        newValue: saved.inventoryNumber, changedBy: userId, changedByName: userName, source: 'manual',
      });
    }
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateAssetDto, userId?: string, userName?: string): Promise<Asset> {
    const asset = await this.findOne(id);
    const changedFields: AssetHistory[] = [];

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined && asset[key] !== value) {
        changedFields.push({
          assetId: id, field: key,
          oldValue: String(asset[key] ?? ''),
          newValue: String(value ?? ''),
          changedBy: userId, changedByName: userName, source: 'manual',
        } as AssetHistory);
      }
    }

    await this.assetRepo.update(id, dto as any);
    if (changedFields.length) await this.historyRepo.save(changedFields);

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.assetRepo.delete(id);
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

  async generateQrCode(id: string): Promise<string> {
    const asset = await this.findOne(id);
    const qrData = `INV:${asset.inventoryNumber}|ID:${asset.id}`;
    return QRCode.toDataURL(qrData, { width: 256, margin: 2 });
  }

  async getDashboardStats() {
    const total = await this.assetRepo.count();
    const byStatus = await this.assetRepo.createQueryBuilder('a')
      .select('a.status', 'status').addSelect('COUNT(*)', 'count')
      .groupBy('a.status').getRawMany();
    const byDepartment = await this.assetRepo.createQueryBuilder('a')
      .select('a.departmentName', 'department').addSelect('COUNT(*)', 'count')
      .groupBy('a.departmentName').orderBy('count', 'DESC').limit(10).getRawMany();
    const totalValue = await this.assetRepo.createQueryBuilder('a')
      .select('SUM(a.residualValue)', 'total').getRawOne();

    return { total, byStatus, byDepartment, totalResidualValue: totalValue?.total || 0 };
  }

  async bulkUpdate(ids: string[], dto: UpdateAssetDto, userId?: string, userName?: string) {
    const results = await Promise.all(ids.map(id => this.update(id, dto, userId, userName)));
    return { updated: results.length };
  }
}
