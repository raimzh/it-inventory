import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Счётчик лимитов по личности, а не только по адресу.
 *
 * Зачем: терминалы сбора данных приходят с одного участка сети, а часть
 * установок вообще прячет их за общим шлюзом. Чистый учёт по IP означает,
 * что один оператор, промахнувшийся паролем, блокирует вход всей смене.
 *
 * Приоритет ключа:
 *   1) идентификатор пользователя — если запрос уже аутентифицирован;
 *   2) логин из тела — на входе пользователя ещё нет, но защищаем мы
 *      конкретную учётную запись, а не адрес: перебор одного пароля
 *      с разных устройств должен упираться в общий счётчик;
 *   3) адрес — всё остальное.
 *
 * Адрес к этому моменту уже настоящий: в main.ts включено `trust proxy`,
 * без которого все запросы приходили с адреса прокси-роута Next.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.id;
    if (typeof userId === 'string' && userId) return `user:${userId}`;

    const username = req.body?.username;
    if (typeof username === 'string' && username.trim()) {
      return `login:${username.trim().toLowerCase()}`;
    }

    return `ip:${req.ip ?? 'unknown'}`;
  }
}
