import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AssetStatus } from '../../assets/entities/asset.entity';

/**
 * Тела запросов инвентаризации.
 *
 * До появления этих классов контроллер принимал инлайновые объектные литералы.
 * Глобальный ValidationPipe({whitelist:true}) отбрасывает лишние поля только
 * при наличии метаданных класса, поэтому у литералов тело проходило в сервис
 * как есть — а сервис делал `update(id, {...dto})`. Через это можно было
 * подменить, например, sessionId и assetId у отмеченной позиции.
 *
 * Поля намеренно необязательные там, где они были необязательными и раньше:
 * задача классов — проверять значения, а не менять поведение.
 */

export class CreateSessionDto {
  @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class CheckItemDto {
  // Не обязателен: если статус не прислан, он остаётся прежним, а позиция
  // просто помечается проверенной — так эндпоинт вёл себя и до валидации.
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() @MaxLength(5000) comment?: string;
  @IsOptional() @IsString() @MaxLength(500) locationFound?: string;
}

export class ScanAssetDto {
  /**
   * Имя поля историческое: сюда приходит и голый инвентарный номер, и полезная
   * нагрузка QR-этикетки вида `INV:<номер>|ID:<uuid>` — разбирает её
   * parseScanCode в сервисе. Переименовывать нельзя: фронтенд уже шлёт
   * `inventoryNumber`.
   */
  @IsString() @IsNotEmpty() @MaxLength(300) inventoryNumber: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsString() @MaxLength(5000) comment?: string;
  @IsOptional() @IsString() @MaxLength(500) locationFound?: string;
}
