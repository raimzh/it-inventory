import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { StockService } from './stock.service';
import { InventoryCheckService } from './inventory-check.service';

const MV_TYPE_LABELS: Record<string, string> = {
  receipt: 'Приём', issue: 'Выдача', return: 'Возврат',
  write_off: 'Списание', transfer: 'Перемещение', adjustment: 'Корректировка',
};

@Injectable()
export class WarehouseReportsService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private stock: StockService,
    private checks: InventoryCheckService,
  ) {}

  // ── Отчёты (данные) ───────────────────────────────────────────────────────

  /** Расход материалов по отделам и сотрудникам за период. */
  async consumptionByDepartment(dateFrom?: string, dateTo?: string) {
    const params: any[] = [];
    let period = '';
    if (dateFrom) { params.push(dateFrom); period += ` AND sm.created_at >= $${params.length}`; }
    if (dateTo) { params.push(dateTo); period += ` AND sm.created_at <= $${params.length}`; }
    return this.dataSource.query(
      `SELECT COALESCE(d.name, 'Без подразделения') AS department,
              e.full_name AS employee, i.name AS item, i.unit,
              SUM(-sm.quantity) AS "issuedQty"
       FROM stock_movements sm
       JOIN items i ON i.id = sm.item_id AND NOT i.is_serialized
       LEFT JOIN employees e ON e.id = sm.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE sm.type = 'issue' ${period}
       GROUP BY d.name, e.full_name, i.name, i.unit
       ORDER BY department, employee`, params)
      .then((rows) => rows.map((r: any) => ({ ...r, issuedQty: Number(r.issuedQty) })));
  }

  /** Позиции к закупу: ниже точки заказа + средний расход в месяц (за 6 мес). */
  async toPurchase() {
    return this.dataSource.query(
      `SELECT ls.item_id AS "itemId", ls.sku, ls.name, ls.min_stock AS "minStock",
              ls.total_balance AS "balance",
              ROUND(COALESCE(c.issued, 0) / 6.0, 1) AS "avgMonthly"
       FROM v_low_stock ls
       LEFT JOIN (
         SELECT item_id, SUM(-quantity) AS issued
         FROM stock_movements
         WHERE type = 'issue' AND created_at >= now() - interval '6 months'
         GROUP BY item_id
       ) c ON c.item_id = ls.item_id
       ORDER BY ls.name`)
      .then((rows) => rows.map((r: any) => ({
        ...r, minStock: Number(r.minStock), balance: Number(r.balance), avgMonthly: Number(r.avgMonthly),
      })));
  }

  /** Техника на руках с разбивкой по подразделениям. */
  async holdingsByDepartment() {
    return this.dataSource.query(
      `SELECT COALESCE(d.name, 'Без подразделения') AS department,
              e.full_name AS employee, i.name AS item,
              su.serial_number AS "serialNumber", su.inventory_number AS "inventoryNumber"
       FROM stock_units su
       JOIN items i ON i.id = su.item_id
       JOIN employees e ON e.id = su.current_holder_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE su.status = 'issued'
       ORDER BY department, employee, item`);
  }

  // ── Excel ─────────────────────────────────────────────────────────────────

  private styleHeader(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  }

  async exportJournalExcel(query: any): Promise<Buffer> {
    const { data } = await this.stock.journal({ ...query, limit: 10000, page: 1 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Журнал операций');
    ws.columns = [
      { header: 'Дата', key: 'date', width: 20 },
      { header: 'Операция', key: 'type', width: 16 },
      { header: 'Позиция', key: 'item', width: 40 },
      { header: 'Кол-во', key: 'qty', width: 10 },
      { header: 'Экземпляр', key: 'unit', width: 22 },
      { header: 'Сотрудник', key: 'employee', width: 28 },
      { header: 'Склад', key: 'warehouse', width: 20 },
      { header: 'Документ', key: 'doc', width: 18 },
      { header: 'Причина', key: 'reason', width: 30 },
    ];
    this.styleHeader(ws.getRow(1));
    data.forEach((mv: any) => {
      ws.addRow({
        date: new Date(mv.createdAt).toLocaleString('ru-RU'),
        type: MV_TYPE_LABELS[mv.type] || mv.type,
        item: mv.item?.name || '',
        qty: Number(mv.quantity),
        unit: mv.stockUnit?.serialNumber || '',
        employee: mv.employee?.fullName || '',
        warehouse: mv.warehouse?.name || '',
        doc: mv.documentNumber || '',
        reason: mv.reason || '',
      });
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async exportInventorySheet(checkId: string): Promise<Buffer> {
    const { check, items } = await this.checks.findOne(checkId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ведомость инвентаризации');
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `Ведомость инвентаризации — ${check.warehouse?.name || ''} от ${new Date(check.startedAt).toLocaleDateString('ru-RU')}`;
    ws.getCell('A1').font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.columns = [
      { header: '№', key: 'n', width: 5 },
      { header: 'Артикул', key: 'sku', width: 16 },
      { header: 'Наименование', key: 'name', width: 40 },
      { header: 'Учётный остаток', key: 'exp', width: 16 },
      { header: 'Факт', key: 'act', width: 12 },
      { header: 'Расхождение', key: 'diff', width: 14 },
    ];
    this.styleHeader(ws.getRow(3));
    items.forEach((it: any, i: number) => {
      const diff = it.actualQty !== null ? it.actualQty - it.expectedQty : null;
      const row = ws.addRow({
        n: i + 1, sku: it.sku, name: it.name,
        exp: it.expectedQty, act: it.actualQty ?? '', diff: diff ?? '',
      });
      if (diff !== null && diff !== 0) row.getCell('diff').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
