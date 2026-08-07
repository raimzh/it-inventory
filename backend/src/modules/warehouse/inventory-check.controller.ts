import { Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InventoryCheckService } from './inventory-check.service';
import { CreateCheckDto, SubmitCheckDto } from './dto/inventory-check.dto';
import { WH_OPERATE } from './warehouse.roles';

@ApiTags('warehouse-checks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse/checks')
export class InventoryCheckController {
  constructor(private checks: InventoryCheckService) {}

  @Get() list() { return this.checks.list(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.checks.findOne(id); }

  @Post()
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  create(@Body() dto: CreateCheckDto, @CurrentUser() user: any) { return this.checks.create(dto, user?.id); }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  submit(@Param('id') id: string, @Body() dto: SubmitCheckDto) { return this.checks.submit(id, dto); }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  complete(@Param('id') id: string, @CurrentUser() user: any) { return this.checks.complete(id, user?.id); }
}
