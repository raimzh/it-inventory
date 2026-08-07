import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ItemsService } from './items.service';
import { CreateItemDto, UpdateItemDto, ItemQueryDto, CompatibilityDto } from './dto/item.dto';
import { WH_MANAGE } from './warehouse.roles';

@ApiTags('warehouse-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse/items')
export class ItemsController {
  constructor(private items: ItemsService) {}

  @Get() list(@Query() query: ItemQueryDto) { return this.items.list(query); }
  @Get(':id') card(@Param('id') id: string) { return this.items.card(id); }
  @Get(':id/available-units') available(@Param('id') id: string) { return this.items.availableUnits(id); }

  @Post()
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  create(@Body() dto: CreateItemDto) { return this.items.create(dto); }

  @Patch(':id')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) { return this.items.update(id, dto); }

  @Delete(':id')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  remove(@Param('id') id: string) { return this.items.remove(id); }

  @Put(':id/compatibility')
  @UseGuards(RolesGuard) @Roles(...WH_MANAGE)
  setCompat(@Param('id') id: string, @Body() dto: CompatibilityDto) {
    return this.items.setCompatibility(id, dto.compatibleItemIds);
  }
}
