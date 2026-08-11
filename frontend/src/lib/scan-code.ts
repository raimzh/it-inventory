/**
 * Разбор кода с этикетки на стороне браузера.
 *
 * Повторяет backend/src/common/scan/parse-scan-code.ts. Дублирование
 * намеренное: страница должна понимать, что именно отсканировали, ещё до
 * обращения к серверу — по этому решается, в какой эндпоинт идти и можно ли
 * ответить оператору мгновенно из локального указателя.
 *
 * Форматы этикеток менять нельзя — они уже наклеены на физические предметы.
 */

const ASSET_RE = /^INV:([^|]+)\|ID:(.+)$/;
const ITEM_RE = /^SKU:([^|]+)\|ID:(.+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanKind = 'asset' | 'item' | 'plain';

export interface ParsedScan {
  kind: ScanKind;
  /** Инвентарный номер, артикул либо сам код целиком */
  key: string;
  /** Идентификатор записи, если этикетка его несла и он корректен */
  id?: string;
  raw: string;
}

function build(kind: ScanKind, key: string, rawId: string | undefined, raw: string): ParsedScan {
  const id = rawId && UUID_RE.test(rawId.trim()) ? rawId.trim().toLowerCase() : undefined;
  return { kind, key: key.trim(), id, raw };
}

export function parseScanCode(input: string): ParsedScan {
  const raw = (input ?? '').trim();

  const asset = ASSET_RE.exec(raw);
  if (asset) return build('asset', asset[1], asset[2], raw);

  const item = ITEM_RE.exec(raw);
  if (item) return build('item', item[1], item[2], raw);

  return { kind: 'plain', key: raw, raw };
}
