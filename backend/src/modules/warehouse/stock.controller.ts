import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StockService } from './stock.service';
import { ReceiptDto, IssueDto, ReturnDto, WriteOffDto, ReverseDto, MovementQueryDto } from './dto/stock.dto';
import { WH_OPERATE } from './warehouse.roles';

@ApiTags('warehouse-stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse')
export class StockController {
  constructor(private stock: StockService) {}

  // Объявлено до остальных маршрутов намеренно: путь со статическими
  // сегментами не должен перекрываться параметрическим (та же ловушка,
  // что описана в items.controller.ts у scan/:code).
  @Get('stock/units/scan/:code')
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  @ApiOperation({ summary: 'Экземпляр по серийному или инвентарному номеру' })
  scanUnit(@Param('code') code: string) { return this.stock.findUnitByCode(code); }

  @Get('movements')
  @ApiOperation({ summary: 'Журнал операций' })
  journal(@Query() query: MovementQueryDto) { return this.stock.journal(query); }

  @Post('stock/receipt')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  @ApiOperation({ summary: 'Принять на склад' })
  receipt(@Body() dto: ReceiptDto, @CurrentUser() user: any) { return this.stock.receipt(dto, user?.id); }

  @Post('stock/issue')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  @ApiOperation({ summary: 'Выдать сотруднику' })
  issue(@Body() dto: IssueDto, @CurrentUser() user: any) { return this.stock.issue(dto, user?.id); }

  @Post('stock/return')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  @ApiOperation({ summary: 'Принять возврат' })
  returnItems(@Body() dto: ReturnDto, @CurrentUser() user: any) { return this.stock.returnItems(dto, user?.id); }

  @Post('stock/write-off')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  @ApiOperation({ summary: 'Списать' })
  writeOff(@Body() dto: WriteOffDto, @CurrentUser() user: any) { return this.stock.writeOff(dto, user?.id); }

  @Post('movements/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles(...WH_OPERATE)
  @ApiOperation({ summary: 'Сторнировать движение' })
  reverse(@Param('id') id: string, @Body() dto: ReverseDto, @CurrentUser() user: any) {
    return this.stock.reverse(id, user?.id, dto.reason);
  }
}
