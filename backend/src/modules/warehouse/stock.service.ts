import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Item } from './entities/item.entity';
import { StockUnit } from './entities/stock-unit.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { parseScanCode } from '../../common/scan/parse-scan-code';

// ── Формы входных данных (валидируемые DTO — на уровне контроллеров) ─────────
export interface ReceiptUnitInput {
  serialNumber: string;
  inventoryNumber?: string;
  condition?: 'new' | 'used' | 'faulty';
  purchasePrice?: number;
  purchaseDate?: string;
  warrantyUntil?: string;
  notes?: string;
}
export interface ReceiptInput {
  itemId: string;
  warehouseId: string;
  quantity?: number;              // для количественного учёта
  units?: ReceiptUnitInput[];     // для поштучного учёта
  documentNumber?: string;
}
export interface IssueLine {
  itemId: string;
  quantity?: number;              // количественный учёт
  stockUnitId?: string;           // поштучный учёт
}
export interface IssueInput {
  employeeId: string;
  warehouseId: string;
  documentNumber?: string;
  lines: IssueLine[];
}
export interface ReturnLine {
  stockUnitId?: string;           // поштучный: конкретный экземпляр
  itemId?: string;                // количественный (напр. мелкая периферия)
  quantity?: number;
  condition?: 'new' | 'used' | 'faulty';
}
export interface ReturnInput {
  employeeId: string;
  warehouseId: string;
  documentNumber?: string;
  lines: ReturnLine[];
}
export interface WriteOffInput {
  itemId: string;
  warehouseId: string;
  quantity?: number;              // количественный
  stockUnitId?: string;           // поштучный
  reason: string;                 // обязательна (enforced БД)
  documentNumber?: string;
}

@Injectable()
export class StockService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Экземпляр по отсканированному коду — серийному или инвентарному номеру.
   *
   * Нужен там, где оператор сканирует сам прибор, а не полку: при выдаче это
   * убирает выбор экземпляра из выпадающего списка, при приёмке — позволяет
   * поймать занятый серийник до отправки партии (receipt проводится одной
   * транзакцией, и один занятый номер иначе роняет всю партию).
   *
   * Возвращается вместе с держателем: оператору важно не «занято», а «у кого».
   */
  async findUnitByCode(code: string): Promise<StockUnit> {
    const parsed = parseScanCode(code);
    const repo = this.dataSource.getRepository(StockUnit);

    const matches = await repo.find({
      where: [{ serialNumber: parsed.key }, { inventoryNumber: parsed.key }],
      relations: { item: true, warehouse: true, currentHolder: true },
    });

    if (matches.length === 0) {
      throw new NotFoundException(`Экземпляр по коду «${parsed.raw}» не найден`);
    }

    // Серийный номер уникален только в пределах позиции (uq_unit_item_serial),
    // а сканируют его, не выбирая позицию заранее. Совпадений может оказаться
    // несколько — выбирать за оператора нельзя, это выдача не той вещи.
    if (matches.length > 1) {
      throw new ConflictException({
        message: `Код «${parsed.raw}» подходит нескольким экземплярам — уточните позицию`,
        candidates: matches.map(u => ({
          id: u.id,
          serialNumber: u.serialNumber,
          itemId: u.itemId,
          itemName: u.item?.name,
          status: u.status,
        })),
      });
    }

    return matches[0];
  }

  /**
   * Выполнить в транзакции. Без manager — открывается своя транзакция.
   * С внешним manager (составная операция/тест) — оборачиваем в SAVEPOINT, чтобы
   * ошибка одной операции не «роняла» всю внешнюю транзакцию.
   */
  private async tx<T>(fn: (m: EntityManager) => Promise<T>, manager?: EntityManager): Promise<T> {
    if (!manager) return this.dataSource.transaction(fn);
    const sp = 'sp_' + Math.random().toString(36).slice(2, 10);
    await manager.query(`SAVEPOINT ${sp}`);
    try {
      const result = await fn(manager);
      await manager.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (e) {
      await manager.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw e;
    }
  }

  private async getItem(m: EntityManager, itemId: string): Promise<Item> {
    const item = await m.findOne(Item, { where: { id: itemId } });
    if (!item) throw new NotFoundException('Позиция номенклатуры не найдена');
    return item;
  }

  private mapPgError(e: any): never {
    // Понятные сообщения из констрейнтов/триггеров БД
    const msg: string = e?.message || '';
    if (e?.code === '23505' && /uq_unit_item_serial/.test(msg)) {
      throw new BadRequestException('Такой серийный номер уже заведён для этой позиции');
    }
    // Триггеры бросают RAISE EXCEPTION с русским текстом — пробрасываем как 400
    if (e?.code === 'P0001' || /Недостаточно на складе|Экземпляр|поштучной|количественной/.test(msg)) {
      throw new BadRequestException(msg || 'Недопустимая операция со складом');
    }
    throw e;
  }

  // ── Журнал операций (с фильтрами и пагинацией) ────────────────────────────
  async journal(query: {
    itemId?: string; employeeId?: string; warehouseId?: string; type?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 50, 200);
    const qb = this.dataSource.getRepository(StockMovement).createQueryBuilder('mv')
      .leftJoinAndSelect('mv.item', 'item')
      .leftJoinAndSelect('mv.warehouse', 'warehouse')
      .leftJoinAndSelect('mv.employee', 'employee')
      .leftJoinAndSelect('mv.stockUnit', 'unit');
    if (query.itemId) qb.andWhere('mv.itemId = :itemId', { itemId: query.itemId });
    if (query.employeeId) qb.andWhere('mv.employeeId = :employeeId', { employeeId: query.employeeId });
    if (query.warehouseId) qb.andWhere('mv.warehouseId = :warehouseId', { warehouseId: query.warehouseId });
    if (query.type) qb.andWhere('mv.type = :type', { type: query.type });
    if (query.dateFrom) qb.andWhere('mv.createdAt >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('mv.createdAt <= :dt', { dt: query.dateTo });
    qb.orderBy('mv.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Остаток: сумма движений по журналу (источник истины) ──────────────────
  async balanceOf(itemId: string, warehouseId?: string, manager?: EntityManager): Promise<number> {
    const m = manager ?? this.dataSource.manager;
    const rows = warehouseId
      ? await m.query(
          'SELECT COALESCE(SUM(quantity),0) AS bal FROM stock_movements WHERE item_id=$1 AND warehouse_id=$2',
          [itemId, warehouseId],
        )
      : await m.query(
          'SELECT COALESCE(SUM(quantity),0) AS bal FROM stock_movements WHERE item_id=$1',
          [itemId],
        );
    return Number(rows[0].bal);
  }

  private async insertMovement(m: EntityManager, mv: Partial<StockMovement>): Promise<StockMovement> {
    const res = await m.insert(StockMovement, mv);
    return m.findOneOrFail(StockMovement, { where: { id: res.identifiers[0].id } });
  }

  // ── Приём на склад ────────────────────────────────────────────────────────
  async receipt(dto: ReceiptInput, performedBy?: string, manager?: EntityManager) {
    return this.tx(async (m) => {
      const item = await this.getItem(m, dto.itemId);
      try {
        if (item.isSerialized) {
          if (!dto.units?.length) {
            throw new BadRequestException('Для поштучной позиции укажите серийные номера принимаемых экземпляров');
          }
          const created: StockMovement[] = [];
          for (const u of dto.units) {
            if (!u.serialNumber?.trim()) throw new BadRequestException('Серийный номер обязателен');
            const unitRes = await m.insert(StockUnit, {
              itemId: item.id,
              serialNumber: u.serialNumber.trim(),
              inventoryNumber: u.inventoryNumber,
              status: 'in_stock',
              warehouseId: dto.warehouseId,
              condition: u.condition ?? 'new',
              purchasePrice: u.purchasePrice ?? null,
              purchaseDate: u.purchaseDate ? new Date(u.purchaseDate) : null,
              warrantyUntil: u.warrantyUntil ? new Date(u.warrantyUntil) : null,
              notes: u.notes,
            } as any);
            const unitId = unitRes.identifiers[0].id;
            created.push(await this.insertMovement(m, {
              itemId: item.id, stockUnitId: unitId, warehouseId: dto.warehouseId,
              type: 'receipt', quantity: 1, documentNumber: dto.documentNumber, performedBy,
            }));
          }
          return { movements: created, count: created.length };
        } else {
          const qty = Number(dto.quantity);
          if (!qty || qty <= 0) throw new BadRequestException('Количество прихода должно быть больше нуля');
          const mv = await this.insertMovement(m, {
            itemId: item.id, warehouseId: dto.warehouseId,
            type: 'receipt', quantity: qty, documentNumber: dto.documentNumber, performedBy,
          });
          return { movements: [mv], count: 1 };
        }
      } catch (e) { this.mapPgError(e); }
    }, manager);
  }

  // ── Выдача сотруднику (корзина, одна операция) ────────────────────────────
  async issue(dto: IssueInput, performedBy?: string, manager?: EntityManager) {
    if (!dto.lines?.length) throw new BadRequestException('Добавьте хотя бы одну позицию к выдаче');
    return this.tx(async (m) => {
      const movements: StockMovement[] = [];
      try {
        for (const line of dto.lines) {
          const item = await this.getItem(m, line.itemId);
          if (item.isSerialized) {
            if (!line.stockUnitId) {
              throw new BadRequestException(`«${item.name}»: выберите конкретный экземпляр для выдачи`);
            }
            const mv = await this.insertMovement(m, {
              itemId: item.id, stockUnitId: line.stockUnitId, warehouseId: dto.warehouseId,
              type: 'issue', quantity: -1, employeeId: dto.employeeId,
              documentNumber: dto.documentNumber, performedBy,
            });
            await m.update(StockUnit, line.stockUnitId, {
              status: 'issued', currentHolderId: dto.employeeId, warehouseId: null as any,
            });
            movements.push(mv);
          } else {
            const qty = Number(line.quantity);
            if (!qty || qty <= 0) throw new BadRequestException(`«${item.name}»: укажите количество больше нуля`);
            const mv = await this.insertMovement(m, {
              itemId: item.id, warehouseId: dto.warehouseId,
              type: 'issue', quantity: -qty, employeeId: dto.employeeId,
              documentNumber: dto.documentNumber, performedBy,
            });
            movements.push(mv);
          }
        }
        return { movements, count: movements.length };
      } catch (e) { this.mapPgError(e); }
    }, manager);
  }

  // ── Возврат ───────────────────────────────────────────────────────────────
  async returnItems(dto: ReturnInput, performedBy?: string, manager?: EntityManager) {
    if (!dto.lines?.length) throw new BadRequestException('Добавьте хотя бы одну позицию к возврату');
    return this.tx(async (m) => {
      const movements: StockMovement[] = [];
      try {
        for (const line of dto.lines) {
          if (line.stockUnitId) {
            const unit = await m.findOne(StockUnit, { where: { id: line.stockUnitId } });
            if (!unit) throw new NotFoundException('Экземпляр не найден');
            const mv = await this.insertMovement(m, {
              itemId: unit.itemId, stockUnitId: unit.id, warehouseId: dto.warehouseId,
              type: 'return', quantity: 1, employeeId: dto.employeeId,
              documentNumber: dto.documentNumber, performedBy,
            });
            const newCondition = line.condition ?? unit.condition;
            await m.update(StockUnit, unit.id, {
              status: newCondition === 'faulty' ? 'in_repair' : 'in_stock',
              currentHolderId: null as any, warehouseId: dto.warehouseId, condition: newCondition,
            });
            movements.push(mv);
          } else {
            if (!line.itemId) throw new BadRequestException('Не указана позиция возврата');
            const qty = Number(line.quantity);
            if (!qty || qty <= 0) throw new BadRequestException('Количество возврата должно быть больше нуля');
            const mv = await this.insertMovement(m, {
              itemId: line.itemId, warehouseId: dto.warehouseId,
              type: 'return', quantity: qty, employeeId: dto.employeeId,
              documentNumber: dto.documentNumber, performedBy,
            });
            movements.push(mv);
          }
        }
        return { movements, count: movements.length };
      } catch (e) { this.mapPgError(e); }
    }, manager);
  }

  // ── Списание ──────────────────────────────────────────────────────────────
  async writeOff(dto: WriteOffInput, performedBy?: string, manager?: EntityManager) {
    if (!dto.reason?.trim()) throw new BadRequestException('Причина списания обязательна');
    return this.tx(async (m) => {
      const item = await this.getItem(m, dto.itemId);
      try {
        if (item.isSerialized) {
          if (!dto.stockUnitId) throw new BadRequestException('Укажите экземпляр для списания');
          const mv = await this.insertMovement(m, {
            itemId: item.id, stockUnitId: dto.stockUnitId, warehouseId: dto.warehouseId,
            type: 'write_off', quantity: -1, reason: dto.reason, documentNumber: dto.documentNumber, performedBy,
          });
          await m.update(StockUnit, dto.stockUnitId, {
            status: 'written_off', currentHolderId: null as any, warehouseId: null as any,
          });
          return { movements: [mv], count: 1 };
        } else {
          const qty = Number(dto.quantity);
          if (!qty || qty <= 0) throw new BadRequestException('Количество списания должно быть больше нуля');
          const mv = await this.insertMovement(m, {
            itemId: item.id, warehouseId: dto.warehouseId,
            type: 'write_off', quantity: -qty, reason: dto.reason, documentNumber: dto.documentNumber, performedBy,
          });
          return { movements: [mv], count: 1 };
        }
      } catch (e) { this.mapPgError(e); }
    }, manager);
  }

  // ── Сторнирование (исправление ошибки без правки журнала) ──────────────────
  async reverse(movementId: string, performedBy?: string, reason?: string, manager?: EntityManager) {
    return this.tx(async (m) => {
      const orig = await m.findOne(StockMovement, { where: { id: movementId } });
      if (!orig) throw new NotFoundException('Движение не найдено');
      const already = await m.findOne(StockMovement, { where: { reversalOf: movementId } });
      if (already) throw new BadRequestException('Это движение уже сторнировано');

      const item = await this.getItem(m, orig.itemId);
      // Поштучный: поддерживаем сторно только исходящих (issue/write_off) —
      // возвращаем экземпляр на склад. Сторно прихода делается списанием.
      if (item.isSerialized && Number(orig.quantity) > 0) {
        throw new BadRequestException('Сторно прихода/возврата поштучной позиции не поддерживается — используйте списание');
      }
      try {
        const rev = await this.insertMovement(m, {
          itemId: orig.itemId, stockUnitId: orig.stockUnitId, warehouseId: orig.warehouseId,
          type: 'adjustment', quantity: -Number(orig.quantity),
          employeeId: orig.employeeId, reason: reason || `Сторнирование операции ${orig.type}`,
          reversalOf: orig.id, performedBy,
        });
        if (item.isSerialized && orig.stockUnitId) {
          // Исходящее сторнируется → экземпляр снова на складе
          await m.update(StockUnit, orig.stockUnitId, {
            status: 'in_stock', currentHolderId: null as any, warehouseId: orig.warehouseId,
          });
        }
        return rev;
      } catch (e) { this.mapPgError(e); }
    }, manager);
  }
}
