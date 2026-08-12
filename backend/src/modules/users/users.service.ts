import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
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

  /**
   * Ссылающиеся на users таблицы берутся из схемы, а не перечисляются здесь.
   * Список менялся уже трижды по ходу развития проекта, и забытая таблица
   * означала бы либо отказ на ровном месте, либо — что хуже — молча
   * потерянные данные (см. ниже про SET NULL).
   */
  private async userReferences(id: string): Promise<Record<string, number>> {
    const fks: { table: string; column: string }[] = await this.repo.manager.query(`
      SELECT tc.table_name AS table, kcu.column_name AS column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'`);

    if (!fks.length) return {};

    // Один запрос вместо N: считаем сразу по всем таблицам
    const parts = fks.map(f => `SELECT '${f.table}.${f.column}' AS ref, count(*)::int AS n FROM "${f.table}" WHERE "${f.column}" = $1`);
    const rows: { ref: string; n: number }[] = await this.repo.manager.query(parts.join(' UNION ALL '), [id]);

    const found: Record<string, number> = {};
    for (const r of rows) if (r.n > 0) found[r.ref] = r.n;
    return found;
  }

  /**
   * Убрать пользователя.
   *
   * Если за учётной записью не осталось ни одного следа — удаляем полностью.
   * Если следы есть — только деактивируем: история изменений, журнал аудита и
   * отметки инвентаризации должны сохранить, кто именно их сделал, иначе
   * система перестаёт быть учётной.
   *
   * ВАЖНО про SET NULL: две связи (движения склада, ведомости) при удалении
   * не выдали бы ошибку, а молча обнулили бы исполнителя. Поэтому наличие
   * ссылок проверяется до удаления, а не перекладывается на внешние ключи.
   */
  async remove(id: string, actingUserId?: string): Promise<{ deleted: boolean; references?: Record<string, number> }> {
    const user = await this.findOne(id);

    if (actingUserId && actingUserId === id) {
      throw new ConflictException('Нельзя убрать собственную учётную запись');
    }

    // Без единого администратора система становится неуправляемой,
    // и починить это через интерфейс уже нельзя
    if (user.role === UserRole.ADMIN && user.isActive) {
      const otherAdmins = await this.repo.count({
        where: { role: UserRole.ADMIN, isActive: true, id: Not(id) },
      });
      if (otherAdmins === 0) {
        throw new ConflictException('Это последний активный администратор — сначала назначьте другого');
      }
    }

    const references = await this.userReferences(id);
    if (Object.keys(references).length > 0) {
      await this.repo.update(id, { isActive: false });
      return { deleted: false, references };
    }

    await this.repo.delete(id);
    return { deleted: true };
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
