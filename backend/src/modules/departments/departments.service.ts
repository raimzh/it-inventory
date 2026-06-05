import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(@InjectRepository(Department) private repo: Repository<Department>) {}

  findAll() { return this.repo.find({ order: { name: 'ASC' } }); }

  async findOne(id: string) {
    const dept = await this.repo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('Подразделение не найдено');
    return dept;
  }

  create(dto: { name: string; code?: string; parentId?: string }) {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: Partial<{ name: string; code: string; parentId: string }>) {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
