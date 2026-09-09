import { Controller, Get, Put, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PreferencesService } from './preferences.service';

/**
 * Настройки интерфейса текущего пользователя.
 *
 * Идентификатор пользователя берётся ТОЛЬКО из токена и никогда из
 * запроса. Приняв его параметром, мы отдали бы любому авторизованному
 * возможность читать и переписывать настройки чужой учётной записи —
 * ущерб небольшой, но это ровно та дыра, которую потом никто не ищет.
 *
 * Ролей нет намеренно: свои настройки интерфейса меняет кто угодно,
 * включая роль «только просмотр».
 */
@ApiTags('preferences')
@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get(':key')
  @ApiOperation({ summary: 'Значение настройки или null' })
  async get(@CurrentUser() user: any, @Param('key') key: string) {
    return { value: await this.service.get(user.id, key) };
  }

  @Put(':key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Сохранить настройку' })
  async set(@CurrentUser() user: any, @Param('key') key: string, @Body() body: { value: unknown }) {
    await this.service.set(user.id, key, body?.value);
  }

  @Delete(':key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Сбросить настройку к значениям по умолчанию' })
  async remove(@CurrentUser() user: any, @Param('key') key: string) {
    await this.service.remove(user.id, key);
  }
}
