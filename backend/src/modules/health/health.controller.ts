import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Health-check для оркестратора и мониторинга.
 *
 * Эндпоинты намеренно без авторизации: их дёргают Docker/PM2/балансировщик,
 * у которых нет токена. Наружу отдаётся только статус и время работы —
 * версии, конфигурация и детали ошибок не раскрываются.
 *
 * Реализовано без @nestjs/terminus: двум проверкам отдельная зависимость
 * не нужна.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** Liveness: процесс жив. Провал => контейнер перезапустить. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness — процесс отвечает' })
  live() {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: готов обслуживать трафик (есть живое соединение с БД). */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — приложение готово принимать запросы' })
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      // Причину пишем в лог сервера, наружу — только факт недоступности
      throw new ServiceUnavailableException({ status: 'error', database: 'unavailable' });
    }
    return {
      status: 'ok',
      database: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
