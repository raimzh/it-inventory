import { IsString, IsEmail, IsEnum, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @IsOptional() @IsBoolean() telegramNotifications?: boolean;
}
