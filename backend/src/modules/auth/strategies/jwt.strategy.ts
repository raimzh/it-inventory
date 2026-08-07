import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

/**
 * Токен из куки `access_token`.
 *
 * Нужен там, где браузер не может отправить заголовок Authorization: теги
 * <img>, <a download> и прочие прямые загрузки. Разбираем заголовок Cookie
 * вручную, чтобы не тащить cookie-parser ради одной строки.
 */
const fromCookie: JwtFromRequestFunction = (req: Request) => {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === 'access_token') {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      // Порядок важен: явный заголовок приоритетнее куки
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromCookie,
      ]),
      ignoreExpiration: false,
      // Без значения по умолчанию: дефолтный секрет в публичном коде = подделка токенов.
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException('Пользователь не найден или заблокирован');
    return user;
  }
}
