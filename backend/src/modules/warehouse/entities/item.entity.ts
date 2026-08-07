import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { ItemCategory } from './item-category.entity';

@Entity({ name: 'items', synchronize: false })
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  sku: string;

  @Column({ length: 500 })
  name: string;

  @Column({ name: 'category_id', nullable: true })
  categoryId: string;

  @ManyToOne(() => ItemCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: ItemCategory;

  @Column({ nullable: true, length: 255 })
  manufacturer: string;

  @Column({ nullable: true, length: 255 })
  model: string;

  @Column({ length: 20, default: 'шт' })
  unit: string;

  @Column({ name: 'is_serialized', default: false })
  isSerialized: boolean;

  @Column({ name: 'min_stock', type: 'numeric', precision: 12, scale: 2, nullable: true })
  minStock: number | null;

  @Column({ nullable: true, length: 100 })
  barcode: string;

  @Column({ name: 'image_url', nullable: true, length: 500 })
  imageUrl: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
