import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InventoryCheck } from './entities/inventory-check.entity';
import { InventoryCheckItem } from './entities/inventory-check-item.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { CreateCheckDto, SubmitCheckDto } from './dto/inventory-check.dto';

/**
 * Складская инвентаризация. Ведомость строится с ожидаемыми остатками (из журнала).
 * По завершении расхождения проводятся движениями adjustment — остаток не правится напрямую.
 */
@Injectable()
export class InventoryCheckService {
  constructor(
    @InjectRepository(InventoryCheck) private checkRepo: Repository<InventoryCheck>,
    @InjectRepository(InventoryCheckItem) private itemRepo: Repository<InventoryCheckItem>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  list() {
    return this.checkRepo.find({ relations: { warehouse: true }, order: { startedAt: 'DESC' } });
  }

  async findOne(id: string) {
    const check = await this.checkRepo.findOne({ where: { id }, relations: { warehouse: true } });
    if (!check) throw new NotFoundException('Инвентаризация не найдена');
    // barcode выбирается ради работы со сканером: без него код с полочной
    // этикетки не сопоставить со строкой ведомости на стороне браузера,
    // и на каждый скан пришлось бы ходить на сервер.
    const items = await this.dataSource.query(
      `SELECT ci.id, ci.item_id AS "itemId", i.sku, i.name, i.unit, i.barcode,
              i.is_serialized AS "isSerialized",
              ci.expected_qty AS "expectedQty", ci.actual_qty AS "actualQty", ci.note
       FROM inventory_check_items ci JOIN items i ON i.id = ci.item_id
       WHERE ci.check_id = $1 ORDER BY i.name`, [id]);
    return { check, items: items.map((r: any) => ({ ...r, expectedQty: Number(r.expectedQty), actualQty: r.actualQty !== null ? Number(r.actualQty) : null })) };
  }

  /** Создать инвентаризацию: снимок ожидаемых остатков по складу (только количественный учёт). */
  async create(dto: CreateCheckDto, performedBy?: string) {
    // Из транзакции возвращается только идентификатор, а читаем мы ПОСЛЕ
    // её завершения. Раньше findOne вызывался внутри: он ходит через
    // this.checkRepo, то есть мимо транзакции, и не видел ещё не
    // зафиксированную запись — бросал «Инвентаризация не найдена», отчего
    // откатывалось создание целиком. Складская инвентаризация из-за этого
    // не создавалась вообще никогда.
    const id = await this.dataSource.transaction(async (m) => {
      const check = await m.save(m.create(InventoryCheck, { warehouseId: dto.warehouseId, performedBy, status: 'in_progress' }));
      const balances = await m.query(
        `SELECT item_id, balance FROM v_stock_balance
         WHERE warehouse_id = $1 AND NOT is_serialized`, [dto.warehouseId]);
      for (const b of balances) {
        await m.insert(InventoryCheckItem, { checkId: check.id, itemId: b.item_id, expectedQty: b.balance });
      }
      return check.id;
    });
    return this.findOne(id);
  }

  /** Ввести фактические количества. */
  async submit(id: string, dto: SubmitCheckDto) {
    const check = await this.checkRepo.findOne({ where: { id } });
    if (!check) throw new NotFoundException('Инвентаризация не найдена');
    if (check.status !== 'in_progress') throw new BadRequestException('Инвентаризация уже завершена');
    for (const it of dto.items) {
      await this.itemRepo.update({ checkId: id, itemId: it.itemId } as any, { actualQty: it.actualQty, note: it.note });
    }
    return this.findOne(id);
  }

  /** Завершить: расхождения (факт − ожидание) провести движениями adjustment. */
  async complete(id: string, performedBy?: string) {
    const check = await this.checkRepo.findOne({ where: { id } });
    if (!check) throw new NotFoundException('Инвентаризация не найдена');
    if (check.status !== 'in_progress') throw new BadRequestException('Инвентаризация уже завершена');

    return this.dataSource.transaction(async (m) => {
      const items = await m.find(InventoryCheckItem, { where: { checkId: id } });
      let adjustments = 0;
      for (const it of items) {
        if (it.actualQty === null || it.actualQty === undefined) continue;
        const diff = Number(it.actualQty) - Number(it.expectedQty);
        if (diff === 0) continue;
        await m.insert(StockMovement, {
          itemId: it.itemId, warehouseId: check.warehouseId,
          type: 'adjustment', quantity: diff,
          reason: `Корректировка по инвентаризации (факт ${it.actualQty} vs учёт ${it.expectedQty})`,
          performedBy,
        });
        adjustments++;
      }
      await m.update(InventoryCheck, id, { status: 'completed', finishedAt: new Date() });
      return { adjustments };
    });
  }
}
