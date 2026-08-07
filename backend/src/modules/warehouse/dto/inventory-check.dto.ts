import { IsUUID, IsOptional, IsArray, ValidateNested, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckDto {
  @IsUUID() warehouseId: string;
}

class CheckItemInputDto {
  @IsUUID() itemId: string;
  @IsNumber() actualQty: number;
  @IsOptional() @IsString() note?: string;
}

export class SubmitCheckDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CheckItemInputDto) items: CheckItemInputDto[];
}
