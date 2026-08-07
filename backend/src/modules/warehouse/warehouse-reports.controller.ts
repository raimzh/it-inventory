import { Controller, Get, Query, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WarehouseReportsService } from './warehouse-reports.service';

@ApiTags('warehouse-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse/reports')
export class WarehouseReportsController {
  constructor(private reports: WarehouseReportsService) {}

  @Get('consumption')
  consumption(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.reports.consumptionByDepartment(dateFrom, dateTo);
  }

  @Get('to-purchase') toPurchase() { return this.reports.toPurchase(); }

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
