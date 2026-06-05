import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  async log(data: Partial<AuditLog>) {
    return this.repo.save(this.repo.create(data));
  }

  async findAll(filters?: { userId?: string; action?: string; resource?: string; limit?: number; page?: number }) {
    const { userId, action, resource, limit = 50, page = 1 } = filters || {};
    const qb = this.repo.createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC');
    if (userId) qb.andWhere('log.userId = :userId', { userId });
    if (action) qb.andWhere('log.action ILIKE :action', { action: `%${action}%` });
    if (resource) qb.andWhere('log.resource = :resource', { resource });
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }
}
