import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreference } from './entities/user-preference.entity';

/**
 * Настройки интерфейса пользователя.
 *
 * Ключ приходит из адреса, поэтому проверяется по белому списку: иначе
 * таблица превратилась бы в свалку произвольных ключей, куда любой
 * авторизованный клиент пишет что угодно и сколько угодно.
 */
const ALLOWED_KEYS = ['asset-table-columns'];

/**
 * Потолок на размер значения. Настройка колонок весит сотни байт;
 * мегабайтам здесь взяться неоткуда, а без ограничения таблица —
 * готовое место для складывания мусора.
 */
const MAX_VALUE_BYTES = 16 * 1024;

@Injectable()
export class PreferencesService {
  constructor(
    @InjectRepository(UserPreference)
    private readonly repo: Repository<UserPreference>,
  ) {}

  private assertKey(key: string) {
    if (!ALLOWED_KEYS.includes(key)) {
      throw new BadRequestException(`Неизвестная настройка: ${key}`);
    }
  }

  /** Значение настройки или null, если пользователь её не менял. */
  async get(userId: string, key: string): Promise<unknown | null> {
    this.assertKey(key);
    const row = await this.repo.findOne({ where: { userId, key } });
    return row ? row.value : null;
  }

  /**
   * Записать настройку.
   *
   * Через upsert по паре (пользователь, ключ), а не «найти и обновить»:
   * одна и та же учётная запись легко открыта в двух вкладках, и гонка
   * между проверкой и вставкой упиралась бы в уникальный индекс.
   */
  async set(userId: string, key: string, value: unknown): Promise<void> {
    this.assertKey(key);

    if (value === undefined || value === null) {
      throw new BadRequestException('Пустое значение настройки');
    }
    const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (size > MAX_VALUE_BYTES) {
      throw new BadRequestException(`Настройка слишком велика: ${size} байт`);
    }

    await this.repo.upsert({ userId, key, value }, ['userId', 'key']);
  }

  /** Сброс: запись удаляется, и клиент возвращается к значениям по умолчанию. */
  async remove(userId: string, key: string): Promise<void> {
    this.assertKey(key);
    await this.repo.delete({ userId, key });
  }
}
