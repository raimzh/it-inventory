import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Warehouse } from './warehouse.entity';
import { InventoryCheckItem } from './inventory-check-item.entity';

export type InventoryCheckStatus = 'in_progress' | 'completed' | 'cancelled';

/** Складская инвентаризация. Расхождения по завершении проводятся движениями adjustment. */
@Entity({ name: 'inventory_checks', synchronize: false })
export class InventoryCheck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date;

  @Column({ name: 'performed_by', nullable: true })
  performedBy: string;

  @Column({ length: 20, default: 'in_progress' })
  status: InventoryCheckStatus;

  @OneToMany(() => InventoryCheckItem, (i) => i.check)
  items: InventoryCheckItem[];
}
