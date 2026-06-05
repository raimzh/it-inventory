import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssetStatus } from '../assets/entities/asset.entity';
import { SessionStatus } from './entities/inventory-session.entity';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('sessions')
  getSessions(@Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: SessionStatus) {
    return this.inventoryService.getSessions(+page, +limit, status);
  }

  @Post('sessions')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant', 'inventorizer')
  createSession(@Body() dto: { name: string; description?: string; departmentId?: string }, @CurrentUser() user: any) {
    return this.inventoryService.createSession(dto, user.id, user.fullName);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) { return this.inventoryService.getSession(id); }

  @Get('sessions/:id/stats')
  getSessionStats(@Param('id') id: string) { return this.inventoryService.getSessionStats(id); }

  @Get('sessions/:id/items')
  getItems(@Param('id') id: string, @Query('page') page = 1, @Query('limit') limit = 50, @Query('isChecked') isChecked?: string) {
    const checked = isChecked !== undefined ? isChecked === 'true' : undefined;
    return this.inventoryService.getSessionItems(id, +page, +limit, checked);
  }

  @Patch('sessions/:sessionId/items/:assetId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant', 'inventorizer')
  checkItem(
    @Param('sessionId') sessionId: string,
    @Param('assetId') assetId: string,
    @Body() dto: { status: AssetStatus; comment?: string; locationFound?: string },
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.checkItem(sessionId, assetId, dto, user.id, user.fullName);
  }

  @Post('sessions/:sessionId/scan')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant', 'inventorizer')
  scanByInventoryNumber(
    @Param('sessionId') sessionId: string,
    @Body() dto: { inventoryNumber: string; status?: AssetStatus; comment?: string },
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.checkByInventoryNumber(sessionId, dto.inventoryNumber, dto, user.id, user.fullName);
  }

  @Post('sessions/:id/close')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  closeSession(@Param('id') id: string, @CurrentUser() user: any) {
    return this.inventoryService.closeSession(id, user.id);
  }
}
