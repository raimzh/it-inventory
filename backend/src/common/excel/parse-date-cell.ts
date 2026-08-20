/**
 * Разбор даты из ячейки Excel.
 *
 * Вынесено из excel-import.service отдельным модулем без декораторов,
 * чтобы разбор можно было покрыть тестом напрямую: Node снимает типы
 * сам, но на декораторах NestJS спотыкается.
 *
 * Своя реализация вместо `new Date(строка)` потому, что на формате
 * ДД.ММ.ГГГГ — а именно так пишет выгрузка и отдаёт 1С — конструктор
 * ведёт себя двумя разными плохими способами: «20.06.2023» он не
 * понимает вовсе, а «04.01.2026» молча толкует как ММ.ДД и выдаёт
 * 31.03.2026. Второе опаснее: дата не теряется, а подменяется, и в
 * учёт попадает правдоподобная, но неверная.
 *
 * Возвращает ГГГГ-ММ-ДД либо null, если дату разобрать нельзя.
 */
export function parseDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  // Ячейка с датой приходит из ExcelJS готовым Date в UTC. Локальные
  // getMonth/getDate сдвинули бы её на сутки в минусовых часовых поясах
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  // ДД.ММ.ГГГГ, ДД/ММ/ГГГГ, ДД-ММ-ГГГГ
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(str);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // Отсекаем несуществующие даты вроде 31.02: Date их «донормирует»
    const check = new Date(`${iso}T00:00:00Z`);
    if (isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) return null;
    return iso;
  }

  // ГГГГ-ММ-ДД — однозначен, разбираем как есть
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (ymd) {
    const check = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00Z`);
    if (isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== `${ymd[1]}-${ymd[2]}-${ymd[3]}`) return null;
    return check.toISOString().slice(0, 10);
  }

  return null;
}
