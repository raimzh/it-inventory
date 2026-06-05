import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SyncStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  ERROR = 'error',
}

@Entity('sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SyncStatus, default: SyncStatus.PENDING })
  status: SyncStatus;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'NOW()' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date;

  @Column({ name: 'records_processed', default: 0 })
  recordsProcessed: number;

  @Column({ name: 'records_created', default: 0 })
  recordsCreated: number;

  @Column({ name: 'records_updated', default: 0 })
  recordsUpdated: number;

  @Column({ name: 'records_skipped', default: 0 })
  recordsSkipped: number;

  @Column({ type: 'jsonb', default: '[]' })
  errors: any[];

  @Column({ name: 'triggered_by', nullable: true })
  triggeredBy: string;

  @Column({ name: 'triggered_by_name', nullable: true, length: 255 })
  triggeredByName: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'triggered_by' })
  triggerer: User;

  @Column({ length: 50, default: 'scheduler' })
  source: string;
}
