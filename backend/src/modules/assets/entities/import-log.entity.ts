import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('import_logs')
export class ImportLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'user_name', nullable: true, length: 255 })
  userName: string;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'total_rows', default: 0 })
  totalRows: number;

  @Column({ name: 'created_count', default: 0 })
  createdCount: number;

  @Column({ name: 'updated_count', default: 0 })
  updatedCount: number;

  @Column({ name: 'skipped_count', default: 0 })
  skippedCount: number;

  @Column({ name: 'error_count', default: 0 })
  errorCount: number;

  @Column({ type: 'text', nullable: true })
  errors: string; // JSON array of error strings

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: 'success' | 'partial' | 'failed';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
