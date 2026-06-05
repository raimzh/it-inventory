import { IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { AssetStatus } from '../entities/asset.entity';

export class QueryAssetsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() inventoryNumber?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() @Min(1) page?: number = 1;
  @IsOptional() @IsNumber() @Min(1) limit?: number = 20;
  @IsOptional() @IsString() sortBy?: string = 'createdAt';
  @IsOptional() @IsString() sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
