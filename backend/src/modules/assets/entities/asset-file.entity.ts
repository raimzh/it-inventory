import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Asset } from './asset.entity';
import { User } from '../../users/entities/user.entity';

@Entity('asset_files')
export class AssetFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'asset_id' })
  assetId: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset: Asset;

  @Column({ length: 255 })
  filename: string;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', nullable: true, length: 100 })
  mimeType: string;

  @Column({ nullable: true })
  size: number;

  @Column({ length: 50, default: 'photo' })
  type: string;

  @Column({ name: 'uploaded_by', nullable: true })
  uploadedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
