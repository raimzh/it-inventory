import { IsString, IsEmail, IsEnum, IsOptional, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty() @IsString() username: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiProperty() @IsString() fullName: string;
  @ApiProperty({ enum: UserRole, default: UserRole.VIEWER })
  @IsEnum(UserRole) role: UserRole;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @IsOptional() @IsBoolean() telegramNotifications?: boolean;
}
