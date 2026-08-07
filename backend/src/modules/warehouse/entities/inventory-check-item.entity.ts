import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { InventoryCheck } from './inventory-check.entity';
import { Item } from './item.entity';

@Entity({ name: 'inventory_check_items', synchronize: false })
export class InventoryCheckItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'check_id' })
  checkId: string;

  @ManyToOne(() => InventoryCheck, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'check_id' })
  check: InventoryCheck;

  @Column({ name: 'item_id' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'expected_qty', type: 'numeric', precision: 12, scale: 2, default: 0 })
  expectedQty: number;

  @Column({ name: 'actual_qty', type: 'numeric', precision: 12, scale: 2, nullable: true })
  actualQty: number | null;

  @Column({ type: 'text', nullable: true })
  note: string;
}
