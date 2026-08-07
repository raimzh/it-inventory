import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Хранилище счётчиков rate-limit.
 *
 * Штатное хранилище держит счётчики в памяти процесса: при двух инстансах
 * лимит «5 попыток входа в минуту» превращается в 10, при четырёх — в 20.
 * При заданном REDIS_HOST счётчики общие, и лимит соблюдается на весь кластер.
 *
 * Без Redis поведение прежнее (счётчики в памяти) — для одного процесса
 * этого достаточно.
 *
 * Реализует интерфейс ThrottlerStorage: increment вызывается на каждый запрос
 * и возвращает текущее число обращений и время до сброса.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private redis: Redis | null = null;
  private memory = new Map<string, { totalHits: number; expiresAt: number; blockedUntil: number }>();

  constructor(host?: string, port = 6379, password?: string) {
    if (!host) return;
    this.redis = new Redis({
      host, port, password: password || undefined,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    this.redis.on('error', (e) => this.logger.warn(`Redis недоступен: ${e.message}`));
    this.logger.log(`Счётчики rate-limit хранятся в Redis (${host})`);
  }

  async increment(
    key: string,
    ttlMs: number,
    limit: number,
    blockDurationMs: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;

    if (this.redis) {
      try {
        // INCR + PEXPIRE одной транзакцией: счётчик и его срок жизни
        // выставляются вместе, иначе ключ мог остаться вечным
        const [[, hits]] = (await this.redis
          .multi()
          .incr(redisKey)
          .pexpire(redisKey, ttlMs, 'NX')
          .exec()) as [[Error | null, number], ...unknown[]];

        const ttl = await this.redis.pttl(redisKey);
        const timeToExpire = Math.max(0, Math.ceil(ttl / 1000));
        const isBlocked = hits > limit;

        if (isBlocked && blockDurationMs > ttl) {
          await this.redis.pexpire(redisKey, blockDurationMs);
        }
        return {
          totalHits: hits,
          timeToExpire,
          isBlocked,
          timeToBlockExpire: isBlocked ? timeToExpire : 0,
        };
      } catch {
        // Отказ Redis не должен закрывать доступ к приложению —
        // продолжаем со счётчиками в памяти этого процесса
      }
    }

    const now = Date.now();
    const rec = this.memory.get(redisKey);
    if (!rec || rec.expiresAt <= now) {
      this.memory.set(redisKey, { totalHits: 1, expiresAt: now + ttlMs, blockedUntil: 0 });
      return { totalHits: 1, timeToExpire: Math.ceil(ttlMs / 1000), isBlocked: false, timeToBlockExpire: 0 };
    }
    rec.totalHits += 1;
    const isBlocked = rec.totalHits > limit;
    if (isBlocked && rec.blockedUntil <= now) rec.blockedUntil = now + blockDurationMs;
    const timeToExpire = Math.ceil((rec.expiresAt - now) / 1000);
    return {
      totalHits: rec.totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil((rec.blockedUntil - now) / 1000) : 0,
    };
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
