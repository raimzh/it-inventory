import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/refs.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private repo: Repository<Employee>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  list(search?: string) {
    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.department', 'dept')
      .where('e.isActive = true');
    if (search) qb.andWhere('(e.fullName ILIKE :s OR e.personnelNumber ILIKE :s)', { s: `%${search}%` });
    return qb.orderBy('e.fullName', 'ASC').getMany();
  }

  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id }, relations: ['department'] });
    if (!e) throw new NotFoundException('Сотрудник не найден');
    return e;
  }

  create(dto: CreateEmployeeDto) {
    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    await this.repo.update(id, dto as any);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.repo.update(id, { isActive: false });
  }

  /** Карточка: техника на руках + расход материалов за период. */
  async holdings(id: string, dateFrom?: string, dateTo?: string) {
    const employee = await this.findOne(id);

    const onHand = await this.dataSource.query(
      `SELECT stock_unit_id AS "stockUnitId", item_id AS "itemId", item_name AS "itemName",
              serial_number AS "serialNumber", inventory_number AS "inventoryNumber"
       FROM v_employee_holdings WHERE employee_id = $1 ORDER BY item_name`, [id]);

    const params: any[] = [id];
    let period = '';
    if (dateFrom) { params.push(dateFrom); period += ` AND sm.created_at >= $${params.length}`; }
    if (dateTo) { params.push(dateTo); period += ` AND sm.created_at <= $${params.length}`; }

    // Расход материалов (количественный учёт) за период — сумма выданного
    const consumables = await this.dataSource.query(
      `SELECT i.id AS "itemId", i.name AS "itemName", i.unit,
              SUM(-sm.quantity) AS "issuedQty"
       FROM stock_movements sm
       JOIN items i ON i.id = sm.item_id
       WHERE sm.employee_id = $1 AND sm.type = 'issue' AND NOT i.is_serialized ${period}
       GROUP BY i.id, i.name, i.unit
       ORDER BY "issuedQty" DESC`, params);

    return {
      employee,
      onHand,
      consumables: consumables.map((c: any) => ({ ...c, issuedQty: Number(c.issuedQty) })),
    };
  }
}
