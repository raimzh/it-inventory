import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Department } from '../../departments/entities/department.entity';

export enum SessionStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}

@Entity('inventory_sessions')
export class InventorySession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.OPEN })
  status: SessionStatus;

  @Column({ name: 'start_date', type: 'timestamptz', default: () => 'NOW()' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate: Date;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @Column({ name: 'created_by_name', nullable: true, length: 255 })
  createdByName: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ name: 'total_assets', default: 0 })
  totalAssets: number;

  @Column({ name: 'checked_assets', default: 0 })
  checkedAssets: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
