import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Asset } from './asset.entity';
import { User } from '../../users/entities/user.entity';

@Entity('asset_history')
export class AssetHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'asset_id' })
  assetId: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ length: 100 })
  field: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string;

  @Column({ name: 'changed_by', nullable: true })
  changedBy: string;

  @Column({ name: 'changed_by_name', nullable: true, length: 255 })
  changedByName: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changer: User;

  @Column({ length: 50, default: 'manual' })
  source: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
