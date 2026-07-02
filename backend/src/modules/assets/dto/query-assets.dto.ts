import { IsOptional, IsString, IsEnum, IsNumber, IsIn, Min, Max } from 'class-validator';
import { AssetStatus } from '../entities/asset.entity';

export class QueryAssetsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() inventoryNumber?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() @Min(1) page?: number = 1;
  // Max 100 — не даём вытащить всю таблицу одним запросом
  @IsOptional() @IsNumber() @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsString() sortBy?: string = 'createdAt';
  @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
