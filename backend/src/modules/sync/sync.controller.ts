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

  /**
   * `?dryRun=true` — пробный прогон: та же загрузка из 1С и то же
   * сопоставление, но без записи. Возвращает отчёт: что совпало, что
   * создалось бы и изменилось бы, по какому полю 1С совпадают номера.
   * Первый обмен с базой 1С делается только после него.
   */
  @Post('run')
  @Roles('admin', 'accountant')
  @ApiOperation({ summary: 'Запустить синхронизацию с 1С вручную (dryRun=true — без записи)' })
  runSync(@CurrentUser() user: any, @Query('dryRun') dryRun?: string) {
    return this.syncService.runSync(user?.id, user?.fullName, 'manual', dryRun === 'true');
  }

  @Post('import')
  @Roles('admin', 'accountant')
  @ApiOperation({ summary: 'Импорт из файла JSON/XML' })
  importFile(@Body() body: { data: any[] }, @CurrentUser() user: any) {
    return this.syncService.importFromFile(body.data, user?.id, user?.fullName);
  }

  // Журнал содержит тексты ошибок интеграции и подробности обмена с 1С —
  // это операционные данные, не для всех.
  @Get('logs')
  @Roles('admin', 'accountant')
  @ApiOperation({ summary: 'Журнал синхронизаций' })
  getLogs(@Query('limit') limit = 20) { return this.syncService.getLogs(+limit); }

  // Ролей намеренно нет: отдаёт только время и статус последнего обмена,
  // и это показывает дашборд всем пользователям.
  @Get('last')
  @ApiOperation({ summary: 'Последняя успешная синхронизация' })
  getLastSync() { return this.syncService.getLastSync(); }
}
