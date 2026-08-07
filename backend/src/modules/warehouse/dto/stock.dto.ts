import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, Min, IsArray, ValidateNested, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptUnitDto {
  @IsString() @IsNotEmpty() serialNumber: string;
  @IsOptional() @IsString() inventoryNumber?: string;
  @IsOptional() @IsIn(['new', 'used', 'faulty']) condition?: 'new' | 'used' | 'faulty';
  @IsOptional() @IsNumber() purchasePrice?: number;
  @IsOptional() @IsString() purchaseDate?: string;
  @IsOptional() @IsString() warrantyUntil?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReceiptDto {
  @IsUUID() itemId: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiptUnitDto) units?: ReceiptUnitDto[];
  @IsOptional() @IsString() documentNumber?: string;
}

class IssueLineDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsUUID() stockUnitId?: string;
}

export class IssueDto {
  @IsUUID() employeeId: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsString() documentNumber?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => IssueLineDto) lines: IssueLineDto[];
}

class ReturnLineDto {
  @IsOptional() @IsUUID() stockUnitId?: string;
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsIn(['new', 'used', 'faulty']) condition?: 'new' | 'used' | 'faulty';
}

export class ReturnDto {
  @IsUUID() employeeId: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsString() documentNumber?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnLineDto) lines: ReturnLineDto[];
}

export class WriteOffDto {
  @IsUUID() itemId: string;
  @IsUUID() warehouseId: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsUUID() stockUnitId?: string;
  @IsString() @IsNotEmpty() reason: string;
  @IsOptional() @IsString() documentNumber?: string;
}

export class ReverseDto {
  @IsOptional() @IsString() reason?: string;
}

export class MovementQueryDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsIn(['receipt', 'issue', 'return', 'write_off', 'transfer', 'adjustment']) type?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) page?: number = 1;
  @IsOptional() @IsNumber() @Type(() => Number) @Min(1) limit?: number = 50;
}
