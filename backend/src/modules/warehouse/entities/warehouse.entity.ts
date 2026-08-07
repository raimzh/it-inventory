import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'warehouses', synchronize: false })
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true, length: 500 })
  location: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
