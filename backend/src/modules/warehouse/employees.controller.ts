import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/refs.dto';
import { WH_OPERATE, WH_MANAGE } from './warehouse.roles';

@ApiTags('warehouse-employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse/employees')
export class EmployeesController {
  constructor(private employees: EmployeesService) {}

  @Get() list(@Query('search') search?: string) { return this.employees.list(search); }
  @Get(':id') findOne(@Param('id') id: string) { return this.employees.findOne(id); }
  @Get(':id/holdings')
  holdings(@Param('id') id: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.employees.holdings(id, dateFrom, dateTo);
  }

  @Post()
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  create(@Body() dto: CreateEmployeeDto) { return this.employees.create(dto); }

  @Patch(':id')
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) { return this.employees.update(id, dto); }

  @Delete(':id')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  remove(@Param('id') id: string) { return this.employees.remove(id); }
}
