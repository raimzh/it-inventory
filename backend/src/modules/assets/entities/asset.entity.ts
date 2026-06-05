import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Department } from '../../departments/entities/department.entity';
import { User } from '../../users/entities/user.entity';

export enum AssetStatus {
  ACTIVE = 'active',
  NOT_FOUND = 'not_found',
  TRANSFERRED = 'transferred',
  REPAIR = 'repair',
  DECOMMISSIONED = 'decommissioned',
}

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inventory_number', unique: true, length: 100 })
  inventoryNumber: string;

  @Column({ length: 500 })
  name: string;

  @Column({ name: 'serial_number', nullable: true, length: 255 })
  serialNumber: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'department_name', nullable: true, length: 255 })
  departmentName: string;

  @Column({ nullable: true, length: 500 })
  location: string;

  @Column({ name: 'responsible_person', nullable: true, length: 255 })
  responsiblePerson: string;

  @Column({ name: 'owner_id', nullable: true })
  ownerId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'owner_name', nullable: true, length: 255 })
  ownerName: string;

  @Column({ name: 'commissioning_date', type: 'date', nullable: true })
  commissioningDate: Date;

  @Column({ name: 'decommission_date', type: 'date', nullable: true })
  decommissionDate: Date;

  @Column({ name: 'residual_value', type: 'decimal', precision: 15, scale: 2, default: 0 })
  residualValue: number;

  @Column({ name: 'initial_value', type: 'decimal', precision: 15, scale: 2, default: 0 })
  initialValue: number;

  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.ACTIVE })
  status: AssetStatus;

  @Column({ nullable: true, length: 255 })
  category: string;

  @Column({ nullable: true, length: 255 })
  manufacturer: string;

  @Column({ nullable: true, length: 255 })
  model: string;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ name: 'one_c_id', nullable: true, length: 255 })
  oneCId: string;

  @Column({ name: 'one_c_guid', nullable: true, length: 255 })
  oneCGuid: string;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  @Column({ name: 'qr_code', nullable: true, length: 255 })
  qrCode: string;

  @Column({ nullable: true, length: 255 })
  barcode: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
