import { IsString, IsNotEmpty, IsOptional, IsUUID, IsBoolean, IsInt } from 'class-validator';

export class CreateEmployeeDto {
  @IsString() @IsNotEmpty() fullName: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() personnelNumber?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}
export class UpdateEmployeeDto extends CreateEmployeeDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateWarehouseDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() location?: string;
}

export class CreateCategoryDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}
