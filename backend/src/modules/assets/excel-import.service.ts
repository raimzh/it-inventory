import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Asset, AssetStatus } from './entities/asset.entity';
import { AssetHistory } from './entities/asset-history.entity';
import { ImportLog } from './entities/import-log.entity';
import { AssetsService } from './assets.service';

// ─── Column mapping (Excel header → entity field) ────────────────────────────
const COLUMN_MAP: Record<string, keyof Asset | string> = {
  'Инв. номер':            'inventoryNumber',
  'Наименование':          'name',
  'Серийный номер':        'serialNumber',
  'Подразделение':         'departmentName',
  'Местонахождение':       'location',
  'Ответственный':         'responsiblePerson',
  'МОЛ':                   'ownerName',
  'Дата ввода':            'commissioningDate',
  'Первонач. стоимость':   'initialValue',
  'Остат. стоимость':      'residualValue',
  'Статус':                'status',
  'Категория':             'category',
  'Производитель':         'manufacturer',
  'Модель':                'model',
  'Примечание':            'comment',
};

const REQUIRED_COLS = ['Инв. номер', 'Наименование'];

const STATUS_MAP: Record<string, AssetStatus> = {
  'active':        AssetStatus.ACTIVE,
  'в наличии':     AssetStatus.ACTIVE,
  'активен':       AssetStatus.ACTIVE,
  'not_found':     AssetStatus.NOT_FOUND,
  'не найдено':    AssetStatus.NOT_FOUND,
  'transferred':   AssetStatus.TRANSFERRED,
  'передан':       AssetStatus.TRANSFERRED,
  'repair':        AssetStatus.REPAIR,
  'ремонт':        AssetStatus.REPAIR,
  'decommissioned':AssetStatus.DECOMMISSIONED,
  'списан':        AssetStatus.DECOMMISSIONED,
};

export interface PreviewRow {
  rowNum: number;
  action: 'create' | 'update' | 'skip' | 'error';
  inventoryNumber: string;
  name: string;
  departmentName?: string;
  responsiblePerson?: string;
  residualValue?: number;
  status?: string;
  error?: string;
  // NOTE: 'raw' intentionally NOT included — it would bloat the response payload
}

export interface PreviewResult {
  totalRows: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  rows: PreviewRow[];
  headers: string[];
}

@Injectable()
export class ExcelImportService {
  constructor(
    @InjectRepository(Asset)   private assetRepo: Repository<Asset>,
    @InjectRepository(AssetHistory) private historyRepo: Repository<AssetHistory>,
    @InjectRepository(ImportLog) private logRepo: Repository<ImportLog>,
    @InjectDataSource() private dataSource: DataSource,
    private assetsService: AssetsService,
  ) {}

  // ─── Generate template ────────────────────────────────────────────────────
  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'IT Inventory';

    const ws = wb.addWorksheet('Основные средства');

    // Header row
    const headers = Object.keys(COLUMN_MAP);
    const headerRow = ws.addRow(headers);

    // Style header
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B21A8' } };
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    ws.getRow(1).height = 30;

    // Example rows
    const examples = [
      ['ОС-000001', 'Ноутбук Dell Latitude 5520', 'SN123456', 'IT-отдел', 'Кабинет 301',
       'Иванов И.И.', 'Иванов И.И.', '2023-01-15', 95000, 82000, 'В наличии', 'Компьютерная техника', 'Dell', 'Latitude 5520', ''],
      ['ОС-000002', 'МФУ Xerox WorkCentre', 'WC-7845-001', 'Бухгалтерия', 'Кабинет 102',
       'Петрова А.В.', 'Петрова А.В.', '2022-06-01', 55000, 43000, 'В наличии', 'Оргтехника', 'Xerox', 'WorkCentre 7845', ''],
    ];
    examples.forEach(row => {
      const r = ws.addRow(row);
      r.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
      });
    });

    // Column widths
    const widths = [14, 40, 20, 25, 25, 20, 20, 14, 20, 18, 14, 22, 16, 20, 25];
    headers.forEach((_, i) => { ws.getColumn(i + 1).width = widths[i] || 18; });

    // Instructions sheet
    const info = wb.addWorksheet('Инструкция');
    info.addRow(['Инструкция по заполнению шаблона']).getCell(1).font = { bold: true, size: 14 };
    info.addRow([]);
    info.addRow(['Поле', 'Обязательное', 'Описание']).eachCell(c => { c.font = { bold: true }; });
    [
      ['Инв. номер', 'Да', 'Уникальный инвентарный номер ОС'],
      ['Наименование', 'Да', 'Наименование основного средства'],
      ['Серийный номер', 'Нет', 'Серийный номер или артикул'],
      ['Подразделение', 'Нет', 'Название подразделения'],
      ['Местонахождение', 'Нет', 'Фактическое местонахождение'],
      ['Ответственный', 'Нет', 'ФИО ответственного лица'],
      ['МОЛ', 'Нет', 'Материально-ответственное лицо'],
      ['Дата ввода', 'Нет', 'Дата ввода в эксплуатацию (ГГГГ-ММ-ДД)'],
      ['Первонач. стоимость', 'Нет', 'Первоначальная стоимость в рублях'],
      ['Остат. стоимость', 'Нет', 'Остаточная стоимость в рублях'],
      ['Статус', 'Нет', 'В наличии / Не найдено / Передан / Ремонт / Списан'],
      ['Категория', 'Нет', 'Категория ОС (Компьютерная техника, Мебель…)'],
      ['Производитель', 'Нет', 'Производитель'],
      ['Модель', 'Нет', 'Модель устройства'],
      ['Примечание', 'Нет', 'Дополнительные комментарии'],
    ].forEach(r => info.addRow(r));
    info.getColumn(1).width = 24;
    info.getColumn(2).width = 15;
    info.getColumn(3).width = 50;

    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }

  // ─── Parse sheet into raw rows ────────────────────────────────────────────
  private async parseSheet(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
    const wb = new ExcelJS.Workbook();
    try {
      // Cast needed: newer @types/node types Buffer<ArrayBufferLike> which
      // is incompatible with ExcelJS's older Buffer type definition.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as any)(buffer);
    } catch (e: any) {
      // ExcelJS only supports .xlsx/.xlsm. Old .xls (BIFF) files may fail here.
      throw new BadRequestException(
        'Не удалось прочитать файл. Убедитесь, что файл имеет формат .xlsx (не повреждён и не защищён паролем).',
      );
    }

    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel файл не содержит листов');

    // Read headers from row 1
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    const colIndexMap: Record<number, string> = {};

    headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const header = String(cell.value ?? '').trim();
      headers.push(header);
      colIndexMap[colNum] = header;
    });

    // Validate required columns
    for (const req of REQUIRED_COLS) {
      if (!headers.includes(req)) {
        throw new BadRequestException(`Отсутствует обязательная колонка: «${req}»`);
      }
    }

    // Read data rows
    const rows: Record<string, any>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const obj: Record<string, any> = { __rowNum: rowNum };
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const header = colIndexMap[colNum];
        if (header) {
          let val = cell.value;
          if (val && typeof val === 'object' && 'result' in val) val = (val as any).result;
          if (val && typeof val === 'object' && 'text' in val) val = (val as any).text;
          obj[header] = val;
        }
      });
      // Skip completely empty rows
      const nonEmpty = Object.entries(obj)
        .filter(([k]) => k !== '__rowNum')
        .some(([, v]) => v !== null && v !== undefined && v !== '');
      if (nonEmpty) rows.push(obj);
    });

    return { headers, rows };
  }

  // ─── Map raw row to asset DTO ─────────────────────────────────────────────
  private mapRow(raw: Record<string, any>): Partial<Asset> & { _error?: string } {
    const dto: any = {};

    for (const [excelCol, entityField] of Object.entries(COLUMN_MAP)) {
      const raw_val = raw[excelCol];
      if (raw_val === null || raw_val === undefined || raw_val === '') continue;

      let val: any = raw_val;

      if (entityField === 'commissioningDate' || entityField === 'decommissionDate') {
        if (val instanceof Date) {
          dto[entityField] = val.toISOString().split('T')[0];
        } else {
          const str = String(val).trim();
          const parsed = new Date(str);
          dto[entityField] = isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        }
        continue;
      }

      if (entityField === 'residualValue' || entityField === 'initialValue') {
        const num = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
        dto[entityField] = isNaN(num) ? 0 : num;
        continue;
      }

      if (entityField === 'status') {
        const key = String(val).toLowerCase().trim();
        dto[entityField] = STATUS_MAP[key] ?? AssetStatus.ACTIVE;
        continue;
      }

      dto[entityField] = String(val).trim();
    }

    return dto;
  }

  // ─── Preview ──────────────────────────────────────────────────────────────
  async preview(buffer: Buffer): Promise<PreviewResult> {
    const { headers, rows } = await this.parseSheet(buffer);

    // Fetch all existing inventory numbers in one query
    const existingAssets = await this.assetRepo.find({ select: ['inventoryNumber', 'id'] });
    const existingMap = new Map(existingAssets.map(a => [a.inventoryNumber, a]));

    const seen = new Set<string>(); // track duplicates within the file
    const result: PreviewRow[] = [];
    let createCount = 0, updateCount = 0, skipCount = 0, errorCount = 0;

    for (const raw of rows) {
      const rowNum = raw.__rowNum as number;
      const invNum = String(raw['Инв. номер'] ?? '').trim();
      const name   = String(raw['Наименование'] ?? '').trim();

      if (!invNum) {
        result.push({ rowNum, action: 'error', inventoryNumber: '', name, error: 'Пустой инвентарный номер' });
        errorCount++; continue;
      }
      if (!name) {
        result.push({ rowNum, action: 'error', inventoryNumber: invNum, name: '', error: 'Пустое наименование' });
        errorCount++; continue;
      }

      const mapped = this.mapRow(raw);

      if (seen.has(invNum)) {
        result.push({ rowNum, action: 'skip', inventoryNumber: invNum, name, error: 'Дубликат в файле' });
        skipCount++; continue;
      }
      seen.add(invNum);

      const action = existingMap.has(invNum) ? 'update' : 'create';
      if (action === 'create') createCount++; else updateCount++;

      result.push({
        rowNum, action, inventoryNumber: invNum, name,
        departmentName: mapped.departmentName as string | undefined,
        responsiblePerson: mapped.responsiblePerson as string | undefined,
        residualValue: mapped.residualValue as number | undefined,
        status: mapped.status as string | undefined,
      });
    }

    return {
      totalRows: rows.length,
      createCount, updateCount, skipCount, errorCount,
      rows: result.slice(0, 200), // send max 200 rows to preview
      headers: Object.keys(COLUMN_MAP),
    };
  }

  // ─── Import ───────────────────────────────────────────────────────────────
  async importData(
    buffer: Buffer, fileName: string,
    userId?: string, userName?: string,
  ): Promise<ImportLog> {
    const { rows } = await this.parseSheet(buffer);

    let createdCount = 0, updatedCount = 0, skippedCount = 0, errorCount = 0;
    const errors: string[] = [];

    // Use transaction for atomicity
    await this.dataSource.transaction(async manager => {
      const assetRepo   = manager.getRepository(Asset);
      const historyRepo = manager.getRepository(AssetHistory);

      const seen = new Set<string>();

      for (const raw of rows) {
        const rowNum = raw.__rowNum as number;
        const invNum = String(raw['Инв. номер'] ?? '').trim();
        const name   = String(raw['Наименование'] ?? '').trim();

        if (!invNum || !name) {
          errors.push(`Строка ${rowNum}: пропущены обязательные поля`);
          errorCount++; continue;
        }
        if (seen.has(invNum)) {
          skippedCount++; continue;
        }
        seen.add(invNum);

        try {
          const mapped = this.mapRow(raw);
          const existing = await assetRepo.findOne({ where: { inventoryNumber: invNum } });

          if (existing) {
            // Update
            await assetRepo.update(existing.id, mapped as any);
            if (userId) {
              await historyRepo.save({
                assetId: existing.id, field: 'excel_import',
                oldValue: existing.name, newValue: name,
                changedBy: userId, changedByName: userName, source: 'excel',
              });
            }
            updatedCount++;
          } else {
            // Create
            // Explicit cast to Asset (not Asset[]) so TypeScript picks the
            // single-entity overload of save() and knows saved.id exists.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const asset = assetRepo.create(mapped as any) as unknown as Asset;
            const saved = await assetRepo.save(asset);
            await assetRepo.update(saved.id, {
              qrCode: `INV:${saved.inventoryNumber}|ID:${saved.id}`,
            });
            if (userId) {
              await historyRepo.save({
                assetId: saved.id, field: 'created', oldValue: null,
                newValue: invNum, changedBy: userId, changedByName: userName, source: 'excel',
              } as Partial<AssetHistory>);
            }
            createdCount++;
          }
        } catch (e: any) {
          errors.push(`Строка ${rowNum} (${invNum}): ${e.message}`);
          errorCount++;
        }
      }
    });

    const status: 'success' | 'partial' | 'failed' =
      errorCount === 0 ? 'success'
      : createdCount + updatedCount > 0 ? 'partial'
      : 'failed';

    // Импорт изменил состав ОС — сбрасываем кэш статистики дашборда
    if (createdCount + updatedCount > 0) this.assetsService.invalidateStatsCache();

    const log = this.logRepo.create({
      userId, userName, fileName,
      totalRows: rows.length,
      createdCount, updatedCount, skippedCount, errorCount,
      errors: errors.length ? JSON.stringify(errors.slice(0, 50)) : null,
      status,
    } as Partial<ImportLog>) as unknown as ImportLog;
    return this.logRepo.save(log);
  }

  // ─── Import logs ──────────────────────────────────────────────────────────
  async getLogs(limit = 20) {
    return this.logRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
