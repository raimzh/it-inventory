import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Item } from './item.entity';
import { StockUnit } from './stock-unit.entity';
import { Warehouse } from './warehouse.entity';
import { Employee } from './employee.entity';

export type MovementType = 'receipt' | 'issue' | 'return' | 'write_off' | 'transfer' | 'adjustment';

/**
 * Журнал движений — источник истины. Строки только добавляются: правка и удаление
 * запрещены триггером БД. Ошибка исправляется сторнирующим движением (reversalOf).
 */
@Entity({ name: 'stock_movements', synchronize: false })
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  // type указан явно: для union-типа (string | null) TypeScript эмитит в
  // метаданные Object, и TypeORM не может вывести тип колонки сам.
  @Column({ name: 'stock_unit_id', type: 'uuid', nullable: true })
  stockUnitId: string | null;

  @ManyToOne(() => StockUnit, { nullable: true })
  @JoinColumn({ name: 'stock_unit_id' })
  stockUnit: StockUnit;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ length: 20 })
  type: MovementType;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  quantity: number;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'document_number', nullable: true, length: 100 })
  documentNumber: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'reversal_of', type: 'uuid', nullable: true })
  reversalOf: string | null;

  @Column({ name: 'performed_by', nullable: true })
  performedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
