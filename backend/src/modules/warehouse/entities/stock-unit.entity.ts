import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Item } from './item.entity';
import { Warehouse } from './warehouse.entity';
import { Employee } from './employee.entity';

export type StockUnitStatus = 'in_stock' | 'issued' | 'in_repair' | 'written_off';
export type StockUnitCondition = 'new' | 'used' | 'faulty';

/** Экземпляр для поштучного учёта (is_serialized = true). */
@Entity({ name: 'stock_units', synchronize: false })
export class StockUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'serial_number', length: 255 })
  serialNumber: string;

  @Column({ name: 'inventory_number', nullable: true, length: 100 })
  inventoryNumber: string;

  @Column({ length: 20, default: 'in_stock' })
  status: StockUnitStatus;

  @Column({ name: 'warehouse_id', nullable: true })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'current_holder_id', nullable: true })
  currentHolderId: string;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'current_holder_id' })
  currentHolder: Employee;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate: Date;

  @Column({ name: 'warranty_until', type: 'date', nullable: true })
  warrantyUntil: Date;

  @Column({ name: 'purchase_price', type: 'numeric', precision: 15, scale: 2, nullable: true })
  purchasePrice: number | null;

  @Column({ length: 20, default: 'new' })
  condition: StockUnitCondition;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
