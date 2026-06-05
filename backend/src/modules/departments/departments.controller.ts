import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private deptService: DepartmentsService) {}

  @Get() findAll() { return this.deptService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.deptService.findOne(id); }

  @Post()
  @UseGuards(RolesGuard) @Roles('admin')
  create(@Body() dto: { name: string; code?: string; parentId?: string }) { return this.deptService.create(dto); }

  @Patch(':id')
  @UseGuards(RolesGuard) @Roles('admin')
  update(@Param('id') id: string, @Body() dto: any) { return this.deptService.update(id, dto); }

  @Delete(':id')
  @UseGuards(RolesGuard) @Roles('admin')
  remove(@Param('id') id: string) { return this.deptService.remove(id); }
}
