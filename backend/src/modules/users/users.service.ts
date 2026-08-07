import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async findAll(filters?: { role?: string; isActive?: boolean; search?: string }) {
    const qb = this.repo.createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.email', 'user.fullName', 'user.role',
        'user.department', 'user.isActive', 'user.lastLoginAt', 'user.createdAt']);

    if (filters?.role) qb.andWhere('user.role = :role', { role: filters.role });
    if (filters?.isActive !== undefined) qb.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    if (filters?.search) {
      qb.andWhere('(user.fullName ILIKE :s OR user.username ILIKE :s OR user.email ILIKE :s)',
        { s: `%${filters.search}%` });
    }

    return qb.orderBy('user.createdAt', 'DESC').getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.repo.findOne({ where: [{ username: dto.username }, { email: dto.email }] });
    if (exists) throw new ConflictException('Пользователь с таким именем или email уже существует');

    const user = this.repo.create({
      ...dto,
      passwordHash: await bcrypt.hash(dto.password, 12),
    });
    return this.repo.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (dto.password) {
      (dto as any).passwordHash = await bcrypt.hash(dto.password, 12);
      delete dto.password;
      // Смена пароля обесценивает ранее выданные refresh-токены —
      // иначе старая сессия продолжала бы жить после компрометации.
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
    Object.assign(user, dto);
    return this.repo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.repo.update(id, { isActive: false });
  }

  async getStats() {
    const total = await this.repo.count();
    const active = await this.repo.count({ where: { isActive: true } });
    const byRole = await this.repo.createQueryBuilder('u')
      .select('u.role', 'role').addSelect('COUNT(*)', 'count')
      .groupBy('u.role').getRawMany();
    return { total, active, inactive: total - active, byRole };
  }
}
