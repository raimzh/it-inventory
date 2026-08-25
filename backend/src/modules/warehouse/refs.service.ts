import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemCategory } from './entities/item-category.entity';
import { Warehouse } from './entities/warehouse.entity';
import { CreateCategoryDto, CreateWarehouseDto } from './dto/refs.dto';

/** Справочники склада: категории номенклатуры и места хранения. */
@Injectable()
export class RefsService {
  constructor(
    @InjectRepository(ItemCategory) private catRepo: Repository<ItemCategory>,
    @InjectRepository(Warehouse) private whRepo: Repository<Warehouse>,
  ) {}

  listCategories() {
    return this.catRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
  }
  createCategory(dto: CreateCategoryDto) {
    return this.catRepo.save(this.catRepo.create(dto as any));
  }
  async updateCategory(id: string, dto: Partial<CreateCategoryDto> & { isActive?: boolean }) {
    await this.catRepo.update(id, dto as any);
    return this.catRepo.findOne({ where: { id } });
  }

  listWarehouses() {
    return this.whRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }
  createWarehouse(dto: CreateWarehouseDto) {
    return this.whRepo.save(this.whRepo.create(dto as any));
  }
  async updateWarehouse(id: string, dto: Partial<CreateWarehouseDto> & { isActive?: boolean }) {
    await this.whRepo.update(id, dto as any);
    return this.whRepo.findOne({ where: { id } });
  }
}
