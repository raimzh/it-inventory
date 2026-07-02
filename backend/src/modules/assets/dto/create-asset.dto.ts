import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AssetStatus } from '../entities/asset.entity';

export class CreateAssetDto {
  @ApiProperty() @IsString() inventoryNumber: string;
  @ApiProperty() @IsString() name: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() departmentName?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() responsiblePerson?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsDateString() commissioningDate?: string;
  @IsOptional() @IsNumber() residualValue?: number;
  @IsOptional() @IsNumber() initialValue?: number;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsString() oneCId?: string;
  @IsOptional() @IsString() oneCGuid?: string;
}

export class UpdateAssetDto {
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsString() responsiblePerson?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() departmentName?: string;
  @IsOptional() @IsString() category?: string;
}
