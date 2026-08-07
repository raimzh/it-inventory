import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Кэш с общим хранилищем.
 *
 * При нескольких инстансах приложения кэш в памяти процесса расходится:
 * один инстанс сбросил статистику после изменения ОС, остальные продолжают
 * отдавать старые цифры до истечения TTL. Поэтому при заданном REDIS_HOST
 * используется Redis — тогда сброс виден всем инстансам сразу.
 *
 * Если Redis не настроен (типичный запуск на одной машине), работает
 * равноценный кэш в памяти: заводить внешнюю зависимость ради одного
 * процесса незачем.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private memory = new Map<string, { value: unknown; expires: number }>();

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('REDIS_HOST');
    if (!host) {
      this.logger.log('Redis не настроен — кэш работает в памяти процесса');
      return;
    }
    this.redis = new Redis({
      host,
      port: Number(this.config.get('REDIS_PORT', 6379)),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      // Недоступность кэша не должна ронять запросы: при отказе просто
      // считаем данные заново из БД
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    this.redis.on('error', (e) => this.logger.warn(`Redis недоступен: ${e.message}`));
    this.logger.log(`Кэш использует Redis (${host})`);
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null; // отказ кэша — не ошибка запроса
      }
    }
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expires <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'PX', ttlMs);
      } catch {
        /* отказ кэша игнорируем */
      }
      return;
    }
    this.memory.set(key, { value, expires: Date.now() + ttlMs });
  }

  /** Сброс по префиксу — например, всей статистики после изменения ОС. */
  async invalidate(prefix: string): Promise<void> {
    if (this.redis) {
      try {
        // scanStream, а не KEYS: KEYS блокирует Redis на время обхода
        const stream = this.redis.scanStream({ match: `${prefix}*`, count: 100 });
        const keys: string[] = [];
        for await (const batch of stream) keys.push(...(batch as string[]));
        if (keys.length) await this.redis.del(...keys);
      } catch {
        /* отказ кэша игнорируем */
      }
      return;
    }
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
