import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsUUID, Min, IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateItemDto {
  @IsString() @IsNotEmpty() sku: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() isSerialized?: boolean;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ItemQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) lowStockOnly?: boolean;
  @IsOptional() @IsBoolean() @Type(() => Boolean) serializedOnly?: boolean;
}

export class CompatibilityDto {
  @IsArray() @IsUUID('all', { each: true }) compatibleItemIds: string[];
}
