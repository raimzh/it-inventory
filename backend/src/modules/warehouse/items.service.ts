import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as QRCode from 'qrcode';
import { Item } from './entities/item.entity';
import { StockUnit } from './entities/stock-unit.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { ItemCompatibility } from './entities/item-compatibility.entity';
import { CreateItemDto, UpdateItemDto, ItemQueryDto } from './dto/item.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private itemRepo: Repository<Item>,
    @InjectRepository(StockUnit) private unitRepo: Repository<StockUnit>,
    @InjectRepository(StockMovement) private mvRepo: Repository<StockMovement>,
    @InjectRepository(ItemCompatibility) private compatRepo: Repository<ItemCompatibility>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  /** Список номенклатуры с суммарным остатком по всем складам и флагом низкого остатка. */
  async list(query: ItemQueryDto) {
    const params: any[] = [];
    const where: string[] = ['i.is_active = true'];
    if (query.search) {
      params.push(`%${query.search}%`);
      where.push(`(i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length})`);
    }
    if (query.categoryId) { params.push(query.categoryId); where.push(`i.category_id = $${params.length}`); }
    if (query.serializedOnly) where.push('i.is_serialized = true');

    let sql = `
      SELECT i.id, i.sku, i.name, i.unit, i.is_serialized AS "isSerialized",
             i.min_stock AS "minStock", i.manufacturer, i.model, i.category_id AS "categoryId",
             c.name AS "categoryName",
             COALESCE(b.total, 0) AS balance,
             (i.min_stock IS NOT NULL AND COALESCE(b.total,0) < i.min_stock) AS "belowMin"
      FROM items i
      LEFT JOIN item_categories c ON c.id = i.category_id
      LEFT JOIN (SELECT item_id, SUM(balance) total FROM v_stock_balance GROUP BY item_id) b ON b.item_id = i.id
      WHERE ${where.join(' AND ')}`;
    if (query.lowStockOnly) sql += ` AND i.min_stock IS NOT NULL AND COALESCE(b.total,0) < i.min_stock`;
    sql += ` ORDER BY i.name`;

    const rows = await this.dataSource.query(sql, params);
    return rows.map((r: any) => ({ ...r, balance: Number(r.balance), minStock: r.minStock !== null ? Number(r.minStock) : null }));
  }

  /** Карточка позиции: остатки по складам, история движений, совместимость, экземпляры. */
  async card(id: string) {
    const item = await this.itemRepo.findOne({ where: { id }, relations: { category: true } });
    if (!item) throw new NotFoundException('Позиция не найдена');

    const balances = await this.dataSource.query(
      `SELECT warehouse_id AS "warehouseId", warehouse_name AS "warehouseName",
              balance, below_min AS "belowMin"
       FROM v_stock_balance WHERE item_id = $1`, [id]);

    const movements = await this.mvRepo.find({
      where: { itemId: id },
      relations: { warehouse: true, employee: true, stockUnit: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const compatibility = await this.dataSource.query(
      `SELECT ci.compatible_item_id AS "id", i.sku, i.name, i.is_serialized AS "isSerialized",
              COALESCE((SELECT SUM(balance) FROM v_stock_balance WHERE item_id = i.id),0) AS balance
       FROM item_compatibility ci JOIN items i ON i.id = ci.compatible_item_id
       WHERE ci.item_id = $1`, [id]);

    const units = item.isSerialized
      ? await this.unitRepo.find({
          where: { itemId: id },
          relations: { warehouse: true, currentHolder: true },
          order: { createdAt: 'DESC' },
        })
      : [];

    return {
      item,
      balances: balances.map((b: any) => ({ ...b, balance: Number(b.balance) })),
      movements,
      compatibility: compatibility.map((c: any) => ({ ...c, balance: Number(c.balance) })),
      units,
    };
  }

  /**
   * QR-код позиции для этикетки на полку или коробку.
   *
   * В коде артикул, а не только идентификатор: даже если сканера под рукой
   * не окажется, человек прочитает артикул глазами и найдёт позицию поиском.
   */
  async generateItemQr(id: string): Promise<{ item: Item; qr: string; payload: string }> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Позиция не найдена');
    const payload = `SKU:${item.sku}|ID:${item.id}`;
    const qr = await QRCode.toDataURL(payload, { width: 256, margin: 2 });
    return { item, qr, payload };
  }

  /** Поиск позиции по отсканированному коду: штрихкод, артикул или QR. */
  async findByCode(code: string): Promise<Item> {
    const value = code.trim();
    // Код из нашего QR имеет вид SKU:...|ID:...
    const fromQr = /^SKU:([^|]+)\|ID:(.+)$/.exec(value);
    const sku = fromQr ? fromQr[1] : value;

    const item = await this.itemRepo.findOne({
      where: [{ barcode: value }, { sku }],
      relations: { category: true },
    });
    if (!item) throw new NotFoundException(`Позиция по коду «${value}» не найдена`);
    return item;
  }

  /** Доступные к выдаче экземпляры (поштучный учёт). */
  async availableUnits(itemId: string) {
    return this.unitRepo.find({
      where: { itemId, status: 'in_stock' },
      relations: { warehouse: true },
      order: { serialNumber: 'ASC' },
    });
  }

  async create(dto: CreateItemDto) {
    const exists = await this.itemRepo.findOne({ where: { sku: dto.sku } });
    if (exists) throw new BadRequestException(`Артикул «${dto.sku}» уже существует`);
    const item = this.itemRepo.create(dto as any);
    return this.itemRepo.save(item);
  }

  async update(id: string, dto: UpdateItemDto) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Позиция не найдена');
    await this.itemRepo.update(id, dto as any);
    return this.itemRepo.findOne({ where: { id } });
  }

  async remove(id: string) {
    // Мягкое удаление — позиция могла участвовать в движениях
    await this.itemRepo.update(id, { isActive: false });
  }

  /** Заменить набор совместимых позиций (двунаправленно). */
  async setCompatibility(itemId: string, compatibleIds: string[]) {
    await this.dataSource.transaction(async (m) => {
      await m.delete(ItemCompatibility, { itemId });
      for (const cid of compatibleIds) {
        if (cid === itemId) continue;
        await m.query(
          `INSERT INTO item_compatibility (item_id, compatible_item_id) VALUES ($1,$2), ($2,$1)
           ON CONFLICT DO NOTHING`, [itemId, cid]);
      }
    });
    return this.card(itemId);
  }
}
