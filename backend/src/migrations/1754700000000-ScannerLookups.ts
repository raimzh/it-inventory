import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Индексы под поиск по отсканированному коду.
 *
 * Терминал сбора данных обращается к базе на каждый скан, а искали мы по
 * колонкам без индексов: items.barcode, stock_units.serial_number,
 * employees.personnel_number, assets.serial_number. На пустой базе это
 * незаметно, при реальных объёмах — последовательный просмотр таблицы
 * на каждое нажатие курка.
 *
 * Где стоит УНИКАЛЬНОСТЬ, там она и есть смысл, а не перестраховка:
 * поиск делается через findOne, и дубликат штрихкода молча вернул бы
 * произвольную из совпавших строк. На складе это выдача не той детали,
 * а по табельному номеру — оформление имущества на не того человека.
 *
 * Индексы частичные (WHERE ... IS NOT NULL): NULL-ы уникальности не мешают,
 * но место и время на обновление занимают, а незаполненных штрихкодов
 * и табельных номеров заведомо много.
 */
export class ScannerLookups1754700000000 implements MigrationInterface {
  name = 'ScannerLookups1754700000000';

  public async up(q: QueryRunner): Promise<void> {
    // Уникальные индексы упадут на существующих дублях. Падение правильное,
    // но пусть оно объясняет, что именно чинить, а не выдаёт код ошибки.
    await q.query(`
      DO $$
      DECLARE d text;
      BEGIN
        SELECT string_agg(barcode || ' (' || c || ' шт.)', ', ') INTO d
          FROM (SELECT barcode, count(*) c FROM items
                 WHERE barcode IS NOT NULL GROUP BY 1 HAVING count(*) > 1) t;
        IF d IS NOT NULL THEN
          RAISE EXCEPTION 'Штрихкоды позиций должны быть уникальными, но повторяются: %. Устраните дубли и повторите миграцию.', d;
        END IF;
      END $$`);

    await q.query(`
      DO $$
      DECLARE d text;
      BEGIN
        SELECT string_agg(personnel_number || ' (' || c || ' шт.)', ', ') INTO d
          FROM (SELECT personnel_number, count(*) c FROM employees
                 WHERE personnel_number IS NOT NULL GROUP BY 1 HAVING count(*) > 1) t;
        IF d IS NOT NULL THEN
          RAISE EXCEPTION 'Табельные номера должны быть уникальными, но повторяются: %. Устраните дубли и повторите миграцию.', d;
        END IF;
      END $$`);

    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_items_barcode"
        ON "items" ("barcode") WHERE "barcode" IS NOT NULL`);

    // Уникальность серийного номера остаётся в пределах позиции
    // (uq_unit_item_serial). Здесь нужен именно сквозной поиск: оператор
    // сканирует серийник, не зная и не выбирая заранее позицию.
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_units_serial"
        ON "stock_units" ("serial_number")`);

    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_units_inventory_number"
        ON "stock_units" ("inventory_number") WHERE "inventory_number" IS NOT NULL`);

    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_employees_personnel_number"
        ON "employees" ("personnel_number") WHERE "personnel_number" IS NOT NULL`);

    // У ОС ищут по серийному номеру, когда стёрлась инвентарная наклейка.
    // Только среди неудалённых — как и uq_assets_inventory_number_active.
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_assets_serial_number"
        ON "assets" ("serial_number") WHERE "deleted_at" IS NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_assets_serial_number"`);
    await q.query(`DROP INDEX IF EXISTS "uq_employees_personnel_number"`);
    await q.query(`DROP INDEX IF EXISTS "idx_units_inventory_number"`);
    await q.query(`DROP INDEX IF EXISTS "idx_units_serial"`);
    await q.query(`DROP INDEX IF EXISTS "uq_items_barcode"`);
  }
}
