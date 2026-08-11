/**
 * Разбор того, что пришло со сканера.
 *
 * В системе исторически два формата этикеток, и они РАЗНЫЕ:
 *   основные средства — `INV:<инв. номер>|ID:<uuid>`  (assets.service.generateQrCode)
 *   позиции склада    — `SKU:<артикул>|ID:<uuid>`     (items.service.generateItemQr)
 *
 * Форматы намеренно не унифицируются: этикетки уже напечатаны и наклеены на
 * физические предметы. Унифицируется разбор — этот модуль.
 *
 * Идентификатор из этикетки важнее человекочитаемого ключа: артикул или
 * инвентарный номер могут переименовать, а запись останется той же. Поэтому
 * вызывающий код должен искать сначала по `id`, и только затем по `key`.
 */

const ASSET_RE = /^INV:([^|]+)\|ID:(.+)$/;
const ITEM_RE = /^SKU:([^|]+)\|ID:(.+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ScanKind = 'asset' | 'item' | 'plain';

export interface ParsedScan {
  /** `plain` — обычный штрихкод или номер, набранный вручную */
  kind: ScanKind;
  /** Инвентарный номер, артикул либо сам код целиком */
  key: string;
  /** UUID записи, если этикетка его несла и он корректен */
  id?: string;
  /** Исходная строка без обрамляющих пробелов */
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

  // Непонятная этикетка — не повод отказывать: ключом становится сам код.
  // Так продолжают работать самодельные и повреждённые наклейки, где
  // хвост `|ID:` не читается.
  return { kind: 'plain', key: raw, raw };
}
