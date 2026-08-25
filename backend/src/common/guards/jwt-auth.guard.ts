import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // info приходит от passport и здесь не нужен, но должен остаться в
  // сигнатуре: она задана базовым классом
  handleRequest(err: any, user: any, _info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Требуется авторизация');
    }
    return user;
  }
}
