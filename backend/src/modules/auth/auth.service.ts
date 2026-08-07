import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectRepository(User) private usersRepository: Repository<User>,
  ) {}

  /** Секрет для refresh-токенов отдельный: утечка access-токена не даёт продлевать сессию. */
  private refreshSecret(): string {
    return this.config.get<string>('REFRESH_TOKEN_SECRET')
      || this.config.getOrThrow<string>('JWT_SECRET') + ':refresh';
  }

  private signRefreshToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, tv: user.tokenVersion ?? 0 },
      { secret: this.refreshSecret(), expiresIn: this.config.get('REFRESH_EXPIRES_IN', '7d') },
    );
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username OR user.email = :username', { username })
      .getOne();

    if (!user || !user.isActive) return null;
    const isValid = await user.validatePassword(password);
    if (!isValid) return null;

    await this.usersRepository.update(user.id, { lastLoginAt: new Date() });
    const { passwordHash, ...result } = user;
    return result as User;
  }

  async login(user: User) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.signRefreshToken(user),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        department: user.department,
      },
    };
  }

  /**
   * Обмен refresh-токена на новую пару.
   *
   * Отзыв построен на tokenVersion: выход из системы или смена пароля
   * увеличивают счётчик, и все ранее выданные токены перестают подходить.
   * Отдельного детектирования повторного использования одного токена нет —
   * для этого потребовалось бы хранить выданные токены в БД.
   */
  async refresh(refreshToken: string) {
    let payload: { sub: string; tv: number };
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException('Сессия истекла, войдите заново');
    }

    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('Пользователь не найден или заблокирован');
    // Отзыв: после выхода/смены пароля версия увеличена и старые токены не подходят
    if ((user.tokenVersion ?? 0) !== payload.tv) {
      throw new UnauthorizedException('Сессия недействительна, войдите заново');
    }
    return this.login(user);
  }

  /** Выход: увеличиваем версию — все выданные refresh-токены пользователя становятся недействительны. */
  async logout(userId: string) {
    await this.usersRepository.increment({ id: userId }, 'tokenVersion', 1);
    return { success: true };
  }

  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }
}
