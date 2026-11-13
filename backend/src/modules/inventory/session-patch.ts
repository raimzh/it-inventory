import { UpdateSessionDto } from './dto/inventory.dto';

/**
 * Что именно правка меняет в сессии — решение вынесено сюда, отдельно от
 * базы и от Nest, чтобы его можно было проверить тестами без поднятого
 * приложения (как `parse-scan-code`).
 *
 * Решение не сводится к «скопировать поля». Валидатор DTO пропускает
 * название из одних пробелов, а пустое тело после whitelist-отсева
 * выглядит как обычный успешный запрос — и то и другое надо отличать от
 * настоящей правки.
 */
export interface SessionPatch {
  name?: string;
  description?: string;
}

export type SessionPatchResult =
  | { ok: true; patch: SessionPatch }
  /** Менять нечего: поля не переданы либо отброшены валидацией */
  | { ok: false; reason: 'empty' }
  /** Название из пробелов: в списке такую сессию не опознать */
  | { ok: false; reason: 'blank-name' };

export function buildSessionPatch(dto: UpdateSessionDto): SessionPatchResult {
  const patch: SessionPatch = {};

  if (dto.name !== undefined) patch.name = dto.name.trim();
  // Описание не обрезаем до пустоты принудительно: очистка — осмысленное
  // действие, и пустая строка здесь допустимое значение
  if (dto.description !== undefined) patch.description = dto.description;

  if (Object.keys(patch).length === 0) return { ok: false, reason: 'empty' };
  if (patch.name === '') return { ok: false, reason: 'blank-name' };

  return { ok: true, patch };
}
