import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(User) private usersRepository: Repository<User>,
  ) {}

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

  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }
}
