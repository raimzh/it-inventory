import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { InventorySession } from './inventory-session.entity';
import { Asset, AssetStatus } from '../../assets/entities/asset.entity';
import { User } from '../../users/entities/user.entity';

@Entity('inventory_items')
@Unique(['sessionId', 'assetId'])
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => InventorySession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: InventorySession;

  @Column({ name: 'asset_id' })
  assetId: string;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.ACTIVE })
  status: AssetStatus;

  @Column({ name: 'is_checked', default: false })
  isChecked: boolean;

  @Column({ name: 'checked_by', nullable: true })
  checkedBy: string;

  @Column({ name: 'checked_by_name', nullable: true, length: 255 })
  checkedByName: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'checked_by' })
  checker: User;

  @Column({ name: 'checked_at', type: 'timestamptz', nullable: true })
  checkedAt: Date;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ name: 'location_found', nullable: true, length: 500 })
  locationFound: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
