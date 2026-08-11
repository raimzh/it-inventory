import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Asset, AssetStatus } from '../assets/entities/asset.entity';
import { AssetHistory } from '../assets/entities/asset-history.entity';
import { InventorySession } from '../inventory/entities/inventory-session.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Asset) private assetRepo: Repository<Asset>,
    @InjectRepository(AssetHistory) private historyRepo: Repository<AssetHistory>,
    @InjectRepository(InventorySession) private sessionRepo: Repository<InventorySession>,
    @InjectRepository(InventoryItem) private itemRepo: Repository<InventoryItem>,
  ) {}

  async getMissingAssetsReport(departmentId?: string) {
    const qb = this.assetRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.department', 'dept')
      .where('a.status = :status', { status: AssetStatus.NOT_FOUND });
    if (departmentId) qb.andWhere('a.departmentId = :departmentId', { departmentId });
    return qb.orderBy('a.updatedAt', 'DESC').getMany();
  }

  async getDepartmentReport() {
    return this.assetRepo.createQueryBuilder('a')
      .select('a.departmentName', 'department')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN a.status = :active THEN 1 ELSE 0 END)', 'active')
      .addSelect('SUM(CASE WHEN a.status = :notFound THEN 1 ELSE 0 END)', 'notFound')
      .addSelect('SUM(a.residualValue)', 'totalValue')
      .setParameters({ active: AssetStatus.ACTIVE, notFound: AssetStatus.NOT_FOUND })
      .groupBy('a.departmentName')
      .orderBy('total', 'DESC')
      .getRawMany();
  }

  async getOwnerHistoryReport(assetId?: string) {
    const qb = this.historyRepo.createQueryBuilder('h')
      .leftJoinAndSelect('h.asset', 'asset')
      .where('h.field IN (:...fields)', { fields: ['ownerId', 'ownerName', 'responsiblePerson'] });
    if (assetId) qb.andWhere('h.assetId = :assetId', { assetId });
    return qb.orderBy('h.createdAt', 'DESC').getMany();
  }

  async exportAssetsExcel(filters?: any): Promise<Buffer> {
    const assets = await this.assetRepo.find({
      relations: { department: true, owner: true },
      order: { inventoryNumber: 'ASC' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Основные средства');

    ws.columns = [
      { header: 'Инв. номер', key: 'inventoryNumber', width: 15 },
      { header: 'Наименование', key: 'name', width: 40 },
      { header: 'Серийный номер', key: 'serialNumber', width: 20 },
      { header: 'Подразделение', key: 'departmentName', width: 25 },
      { header: 'Местоположение', key: 'location', width: 25 },
      { header: 'Ответственный', key: 'responsiblePerson', width: 25 },
      { header: 'Владелец', key: 'ownerName', width: 25 },
      { header: 'Дата ввода', key: 'commissioningDate', width: 15 },
      { header: 'Остаточная стоимость', key: 'residualValue', width: 20 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Комментарий', key: 'comment', width: 30 },
    ];

    const statusLabels: Record<string, string> = {
      active: 'В наличии', not_found: 'Не найдено', transferred: 'Передано',
      repair: 'На ремонте', decommissioned: 'Списано',
    };

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    assets.forEach(a => {
      ws.addRow({
        inventoryNumber: a.inventoryNumber,
        name: a.name,
        serialNumber: a.serialNumber || '',
        departmentName: a.departmentName || '',
        location: a.location || '',
        responsiblePerson: a.responsiblePerson || '',
        ownerName: a.ownerName || '',
        commissioningDate: a.commissioningDate ? new Date(a.commissioningDate).toLocaleDateString('ru-RU') : '',
        residualValue: a.residualValue || 0,
        status: statusLabels[a.status] || a.status,
        comment: a.comment || '',
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async exportInventorySheet(sessionId: string): Promise<Buffer> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    const items = await this.itemRepo.find({
      where: { sessionId },
      relations: { asset: true },
      order: { asset: { inventoryNumber: 'ASC' } } as any,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Инвентаризационная ведомость');

    ws.mergeCells('A1:K1');
    ws.getCell('A1').value = `Инвентаризационная ведомость: ${session?.name || ''}`;
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.addRow([]);

    ws.columns = [
      { header: '№', key: 'num', width: 5 },
      { header: 'Инв. номер', key: 'inventoryNumber', width: 15 },
      { header: 'Наименование', key: 'name', width: 40 },
      { header: 'Подразделение', key: 'department', width: 25 },
      { header: 'Местоположение', key: 'location', width: 25 },
      { header: 'Ответственный', key: 'responsible', width: 25 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Проверено', key: 'checked', width: 12 },
      { header: 'Проверил', key: 'checkedBy', width: 25 },
      { header: 'Дата проверки', key: 'checkedAt', width: 18 },
      { header: 'Комментарий', key: 'comment', width: 30 },
    ];

    ws.getRow(3).font = { bold: true };
    ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const statusLabels: Record<string, string> = {
      active: 'В наличии', not_found: 'Не найдено', transferred: 'Передано',
      repair: 'На ремонте', decommissioned: 'Списано',
    };

    items.forEach((item, i) => {
      const row = ws.addRow({
        num: i + 1,
        inventoryNumber: item.asset?.inventoryNumber || '',
        name: item.asset?.name || '',
        department: item.asset?.departmentName || '',
        location: item.locationFound || item.asset?.location || '',
        responsible: item.asset?.responsiblePerson || '',
        status: statusLabels[item.status] || item.status,
        checked: item.isChecked ? 'Да' : 'Нет',
        checkedBy: item.checkedByName || '',
        checkedAt: item.checkedAt ? new Date(item.checkedAt).toLocaleString('ru-RU') : '',
        comment: item.comment || '',
      });
      if (!item.isChecked) row.getCell('checked').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
      if (item.status === 'not_found') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
