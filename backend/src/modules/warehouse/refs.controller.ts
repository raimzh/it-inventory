import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RefsService } from './refs.service';
import { CreateCategoryDto, CreateWarehouseDto } from './dto/refs.dto';
import { WH_MANAGE } from './warehouse.roles';

@ApiTags('warehouse-refs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse')
export class RefsController {
  constructor(private refs: RefsService) {}

  @Get('categories') categories() { return this.refs.listCategories(); }
  @Post('categories')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  createCategory(@Body() dto: CreateCategoryDto) { return this.refs.createCategory(dto); }
  @Patch('categories/:id')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  updateCategory(@Param('id') id: string, @Body() dto: any) { return this.refs.updateCategory(id, dto); }

  @Get('warehouses') warehouses() { return this.refs.listWarehouses(); }
  @Post('warehouses')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  createWarehouse(@Body() dto: CreateWarehouseDto) { return this.refs.createWarehouse(dto); }
  @Patch('warehouses/:id')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  updateWarehouse(@Param('id') id: string, @Body() dto: any) { return this.refs.updateWarehouse(id, dto); }
}
