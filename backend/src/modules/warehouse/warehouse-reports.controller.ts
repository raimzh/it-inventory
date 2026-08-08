import { Controller, Get, Post, Query, Param, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WarehouseReportsService } from './warehouse-reports.service';
import { LowStockService } from './low-stock.service';
import { WH_MANAGE } from './warehouse.roles';

@ApiTags('warehouse-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse/reports')
export class WarehouseReportsController {
  constructor(
    private reports: WarehouseReportsService,
    private lowStock: LowStockService,
  ) {}

  @Get('consumption')
  consumption(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.reports.consumptionByDepartment(dateFrom, dateTo);
  }

  @Get('to-purchase') toPurchase() { return this.reports.toPurchase(); }

  /**
   * Разослать сводку по позициям к закупу немедленно.
   * Нужен, чтобы проверить настройку почты, не дожидаясь расписания.
   */
  @Post('notify-low-stock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(...WH_MANAGE)
  @ApiOperation({ summary: 'Разослать уведомление о позициях к закупу' })
  notifyLowStock() { return this.lowStock.notifyLowStock(); }

  @Get('holdings') holdings() { return this.reports.holdingsByDepartment(); }

  @Get('export/journal')
  async exportJournal(@Query() query: any, @Res() res: Response) {
    const buf = await this.reports.exportJournalExcel(query);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="warehouse-journal.xlsx"',
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Get('export/inventory/:checkId')
  async exportInventory(@Param('checkId') checkId: string, @Res() res: Response) {
    const buf = await this.reports.exportInventorySheet(checkId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventory-${checkId}.xlsx"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }
}
