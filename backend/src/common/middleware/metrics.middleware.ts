import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../../modules/metrics/metrics.service';

/**
 * Считает длительность и коды ответов.
 *
 * Именно middleware, а не интерцептор: guard-ы отрабатывают раньше
 * интерцепторов, поэтому отказы авторизации (401/403) в метрики не попадали бы —
 * а это как раз то, за чем стоит следить.
 *
 * Замер снимается по событию `finish`: в момент ошибки фильтр исключений ещё
 * не выставил код, и все сбои записывались бы как 200.
 *
 * Метка маршрута — ШАБЛОН (/assets/:id), а не конкретный путь: иначе каждый
 * идентификатор ОС породил бы отдельный временной ряд, и их число росло бы
 * вместе с числом записей в базе.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const started = process.hrtime.bigint();

    res.once('finish', () => {
      // req.route заполняется при сопоставлении маршрута — к моменту finish
      // оно уже известно; для несуществующих путей остаётся unknown
      const route = (req as any).route?.path || 'unknown';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      this.metrics.httpRequests.inc(labels);
      this.metrics.httpDuration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
    });

    next();
  }
}
