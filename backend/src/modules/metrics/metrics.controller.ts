import { Controller, Get, Header, ForbiddenException, Req } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * Отдаёт метрики для Prometheus.
 *
 * Без токена — иначе его пришлось бы хранить в конфигурации Prometheus, — но
 * и не в открытый доступ: метрики раскрывают внутреннее устройство (маршруты,
 * нагрузка, память). Поэтому доступ только из частных сетей; при развёртывании
 * за обратным прокси эндпоинт дополнительно закрывается на его уровне.
 */
@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private metrics: MetricsService,
    private config: ConfigService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Метрики в формате Prometheus' })
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Req() req: Request): Promise<string> {
    if (!this.isAllowed(req.ip)) {
      throw new ForbiddenException('Метрики доступны только из внутренней сети');
    }
    return this.metrics.metrics();
  }

  /** Разрешаем локальные и частные адреса (RFC1918) плюс подсети Docker. */
  private isAllowed(ip?: string): boolean {
    if (this.config.get('METRICS_PUBLIC') === 'true') return true;
    if (!ip) return false;
    const addr = ip.replace(/^::ffff:/, '');
    return (
      addr === '127.0.0.1' ||
      addr === '::1' ||
      /^10\./.test(addr) ||
      /^192\.168\./.test(addr) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(addr)
    );
  }
}
