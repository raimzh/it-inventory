import { Injectable } from '@nestjs/common';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

/**
 * Метрики в формате Prometheus.
 *
 * Держим отдельный Registry, а не глобальный: так метрики не «протекают»
 * между тестами и повторными инициализациями модуля.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Число HTTP-запросов',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Длительность обработки HTTP-запроса',
    labelNames: ['method', 'route', 'status'] as const,
    // Границы под веб-интерфейс: интересует доля ответов быстрее 100 мс
    // и хвост медленнее секунды
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 10],
    registers: [this.registry],
  });

  constructor() {
    // Память, событийный цикл, дескрипторы, GC — без них по метрикам приложения
    // не отличить «медленный запрос» от «процессу не хватает ресурсов»
    collectDefaultMetrics({ register: this.registry, prefix: 'itinv_' });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
