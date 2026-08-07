import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Присваивает каждому запросу идентификатор и возвращает его в заголовке.
 * Пользователь видит id на экране ошибки, и по нему в логах находится ровно
 * та запись — без этого разбор инцидента сводится к угадыванию по времени.
 *
 * Если запрос пришёл через nginx с уже выставленным X-Request-Id, он
 * сохраняется, чтобы цепочка не разрывалась.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
