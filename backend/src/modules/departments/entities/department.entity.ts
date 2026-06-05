import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  name: string;

  @Column({ unique: true, nullable: true, length: 50 })
  code: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId: string;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Department;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
