import { Controller, Get, Query, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// Выгрузка всей базы ОС в Excel — не операция «на посмотреть»,
// поэтому отчёты и экспорт доступны только ролям, которые ведут учёт.
const REPORT_ROLES = ['admin', 'accountant', 'inventorizer'];
const EXPORT_ROLES = ['admin', 'accountant'];

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('missing')
  @Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Отчёт: отсутствующие ОС' })
  getMissing(@Query('departmentId') departmentId?: string) {
    return this.reportsService.getMissingAssetsReport(departmentId);
  }

  @Get('by-department')
  @Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Отчёт по подразделениям' })
  getDepartmentReport() { return this.reportsService.getDepartmentReport(); }

  @Get('owner-history')
  @Roles(...REPORT_ROLES)
  getOwnerHistory(@Query('assetId') assetId?: string) {
    return this.reportsService.getOwnerHistoryReport(assetId);
  }

  @Get('export/assets')
  @Roles(...EXPORT_ROLES)
  @ApiOperation({ summary: 'Экспорт ОС в Excel' })
  async exportAssets(@Res() res: Response) {
    const buffer = await this.reportsService.exportAssetsExcel();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="assets-${new Date().toISOString().slice(0,10)}.xlsx"`,
    });
    res.end(buffer);
  }

  @Get('export/inventory/:sessionId')
  @Roles(...EXPORT_ROLES)
  @ApiOperation({ summary: 'Экспорт инвентаризационной ведомости' })
  async exportInventory(@Param('sessionId') sessionId: string, @Res() res: Response) {
    const buffer = await this.reportsService.exportInventorySheet(sessionId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventory-${sessionId.slice(0,8)}.xlsx"`,
    });
    res.end(buffer);
  }
}
