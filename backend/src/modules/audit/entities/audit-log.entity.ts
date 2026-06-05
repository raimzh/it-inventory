import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true, length: 100 })
  username: string;

  @Column({ length: 100 })
  action: string;

  @Column({ nullable: true, length: 100 })
  resource: string;

  @Column({ name: 'resource_id', nullable: true, length: 255 })
  resourceId: string;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @Column({ name: 'ip_address', nullable: true, length: 50 })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
