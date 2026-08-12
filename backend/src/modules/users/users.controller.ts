import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Список пользователей' })
  findAll(@Query('role') role?: string, @Query('search') search?: string, @Query('isActive') isActive?: string) {
    return this.usersService.findAll({ role, search, isActive: isActive !== undefined ? isActive === 'true' : undefined });
  }

  @Get('stats')
  @Roles('admin')
  getStats() { return this.usersService.getStats(); }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id') id: string) { return this.usersService.findOne(id); }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Создать пользователя' })
  create(@Body() dto: CreateUserDto) { return this.usersService.create(dto); }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) { return this.usersService.update(id, dto); }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Убрать пользователя',
    description: 'Удаляет полностью, если за учётной записью не осталось следов; ' +
      'иначе деактивирует и возвращает, что именно на неё ссылается.',
  })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.remove(id, user?.id);
  }
}
