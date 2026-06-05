import { Controller, Post, Get, UseGuards, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('run')
  @Roles('admin', 'accountant')
  @ApiOperation({ summary: 'Запустить синхронизацию с 1С вручную' })
  runSync(@CurrentUser() user: any) {
    return this.syncService.runSync(user?.id, user?.fullName, 'manual');
  }

  @Post('import')
  @Roles('admin', 'accountant')
  @ApiOperation({ summary: 'Импорт из файла JSON/XML' })
  importFile(@Body() body: { data: any[] }, @CurrentUser() user: any) {
    return this.syncService.importFromFile(body.data, user?.id, user?.fullName);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Журнал синхронизаций' })
  getLogs(@Query('limit') limit = 20) { return this.syncService.getLogs(+limit); }

  @Get('last')
  @ApiOperation({ summary: 'Последняя успешная синхронизация' })
  getLastSync() { return this.syncService.getLastSync(); }
}
