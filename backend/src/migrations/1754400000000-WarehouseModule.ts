import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Модуль «Склад»: номенклатура, экземпляры, журнал движений (источник истины),
 * инвентаризации, справочники, представления остатков и целостность на уровне БД.
 *
 * Все объекты создаются только этой миграцией. Сущности склада помечены
 * `@Entity({ synchronize: false })`, поэтому dev-synchronize их не трогает.
 */
export class WarehouseModule1754400000000 implements MigrationInterface {
  name = 'WarehouseModule1754400000000';

  public async up(q: QueryRunner): Promise<void> {
    // ── Справочники ─────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "employees" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "full_name" varchar(255) NOT NULL,
        "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
        "position" varchar(255),
        "personnel_number" varchar(50),
        "email" varchar(255),
        "phone" varchar(50),
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_employees_department" ON "employees"("department_id")`);
    await q.query(`CREATE INDEX "idx_employees_active" ON "employees"("is_active")`);

    await q.query(`
      CREATE TABLE "item_categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "parent_id" uuid REFERENCES "item_categories"("id") ON DELETE SET NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true
      )`);

    await q.query(`
      CREATE TABLE "warehouses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "location" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true
      )`);

    await q.query(`
      CREATE TABLE "items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sku" varchar(100) NOT NULL,
        "name" varchar(500) NOT NULL,
        "category_id" uuid REFERENCES "item_categories"("id") ON DELETE SET NULL,
        "manufacturer" varchar(255),
        "model" varchar(255),
        "unit" varchar(20) NOT NULL DEFAULT 'шт',
        "is_serialized" boolean NOT NULL DEFAULT false,
        "min_stock" numeric(12,2),
        "barcode" varchar(100),
        "image_url" varchar(500),
        "notes" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_items_sku" UNIQUE ("sku")
      )`);
    await q.query(`CREATE INDEX "idx_items_category" ON "items"("category_id")`);
    await q.query(`CREATE INDEX "idx_items_active" ON "items"("is_active")`);

    await q.query(`
      CREATE TABLE "item_compatibility" (
        "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
        "compatible_item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
        PRIMARY KEY ("item_id", "compatible_item_id"),
        CONSTRAINT "chk_compat_not_self" CHECK ("item_id" <> "compatible_item_id")
      )`);

    await q.query(`
      CREATE TABLE "stock_units" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE RESTRICT,
        "serial_number" varchar(255) NOT NULL,
        "inventory_number" varchar(100),
        "status" varchar(20) NOT NULL DEFAULT 'in_stock'
          CONSTRAINT "chk_unit_status" CHECK ("status" IN ('in_stock','issued','in_repair','written_off')),
        "warehouse_id" uuid REFERENCES "warehouses"("id") ON DELETE SET NULL,
        "current_holder_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
        "purchase_date" date,
        "warranty_until" date,
        "purchase_price" numeric(15,2),
        "condition" varchar(20) NOT NULL DEFAULT 'new'
          CONSTRAINT "chk_unit_condition" CHECK ("condition" IN ('new','used','faulty')),
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_unit_item_serial" UNIQUE ("item_id", "serial_number")
      )`);
    await q.query(`CREATE INDEX "idx_units_item" ON "stock_units"("item_id")`);
    await q.query(`CREATE INDEX "idx_units_status" ON "stock_units"("status")`);
    await q.query(`CREATE INDEX "idx_units_holder" ON "stock_units"("current_holder_id") WHERE "current_holder_id" IS NOT NULL`);

    // ── Журнал движений — источник истины ───────────────────────────────────
    await q.query(`
      CREATE TABLE "stock_movements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE RESTRICT,
        "stock_unit_id" uuid REFERENCES "stock_units"("id") ON DELETE RESTRICT,
        "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
        "type" varchar(20) NOT NULL
          CONSTRAINT "chk_mv_type" CHECK ("type" IN ('receipt','issue','return','write_off','transfer','adjustment')),
        "quantity" numeric(12,2) NOT NULL CONSTRAINT "chk_mv_qty_nonzero" CHECK ("quantity" <> 0),
        "employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
        "document_number" varchar(100),
        "reason" text,
        "reversal_of" uuid REFERENCES "stock_movements"("id") ON DELETE RESTRICT,
        "performed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_mv_sign_type" CHECK (
          ("type" IN ('receipt','return') AND "quantity" > 0) OR
          ("type" IN ('issue','write_off') AND "quantity" < 0) OR
          ("type" IN ('transfer','adjustment'))
        ),
        CONSTRAINT "chk_mv_reason" CHECK ("type" NOT IN ('write_off','adjustment') OR "reason" IS NOT NULL)
      )`);
    await q.query(`CREATE INDEX "idx_sm_item_created" ON "stock_movements"("item_id","created_at")`);
    await q.query(`CREATE INDEX "idx_sm_employee" ON "stock_movements"("employee_id") WHERE "employee_id" IS NOT NULL`);
    await q.query(`CREATE INDEX "idx_sm_wh_created" ON "stock_movements"("warehouse_id","created_at")`);
    await q.query(`CREATE INDEX "idx_sm_unit" ON "stock_movements"("stock_unit_id") WHERE "stock_unit_id" IS NOT NULL`);

    // ── Инвентаризации ──────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE "inventory_checks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "performed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "status" varchar(20) NOT NULL DEFAULT 'in_progress'
          CONSTRAINT "chk_check_status" CHECK ("status" IN ('in_progress','completed','cancelled'))
      )`);
    await q.query(`
      CREATE TABLE "inventory_check_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "check_id" uuid NOT NULL REFERENCES "inventory_checks"("id") ON DELETE CASCADE,
        "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE RESTRICT,
        "expected_qty" numeric(12,2) NOT NULL DEFAULT 0,
        "actual_qty" numeric(12,2),
        "note" text
      )`);
    await q.query(`CREATE INDEX "idx_check_items_check" ON "inventory_check_items"("check_id")`);

    // ── Триггер валидации движений (целостность на уровне БД) ────────────────
    await q.query(`
      CREATE OR REPLACE FUNCTION fn_stock_movement_validate() RETURNS trigger AS $$
      DECLARE
        v_is_serialized boolean;
        v_balance numeric;
        v_unit_bal numeric;
      BEGIN
        SELECT is_serialized INTO v_is_serialized FROM items WHERE id = NEW.item_id;
        IF v_is_serialized IS NULL THEN
          RAISE EXCEPTION 'Позиция номенклатуры не найдена';
        END IF;

        IF v_is_serialized THEN
          -- Поштучный учёт: обязателен экземпляр, количество только +1/-1.
          IF NEW.stock_unit_id IS NULL THEN
            RAISE EXCEPTION 'Для поштучной позиции необходимо указать экземпляр';
          END IF;
          IF NEW.quantity NOT IN (1, -1) THEN
            RAISE EXCEPTION 'Для поштучной позиции количество может быть только +1 или -1';
          END IF;
          -- Доступность считаем по журналу экземпляра (баланс движений), а не по
          -- денормализованному статусу: журнал — источник истины.
          PERFORM pg_advisory_xact_lock(hashtext(NEW.stock_unit_id::text));
          SELECT COALESCE(SUM(quantity),0) INTO v_unit_bal
            FROM stock_movements WHERE stock_unit_id = NEW.stock_unit_id;
          IF NEW.quantity = -1 AND v_unit_bal < 1 THEN
            RAISE EXCEPTION 'Экземпляр не числится на складе и не может быть выдан/списан';
          END IF;
          IF NEW.quantity = 1 AND v_unit_bal > 0 THEN
            RAISE EXCEPTION 'Экземпляр уже числится на складе';
          END IF;
        ELSE
          -- Количественный учёт: экземпляр не указывается, остаток не уходит в минус.
          IF NEW.stock_unit_id IS NOT NULL THEN
            RAISE EXCEPTION 'Для количественной позиции экземпляр не указывается';
          END IF;
          IF NEW.quantity < 0 THEN
            -- сериализуем конкурентные списания по одной позиции+складу
            PERFORM pg_advisory_xact_lock(hashtext(NEW.item_id::text || ':' || NEW.warehouse_id::text));
            SELECT COALESCE(SUM(quantity),0) INTO v_balance
              FROM stock_movements
              WHERE item_id = NEW.item_id AND warehouse_id = NEW.warehouse_id;
            IF v_balance + NEW.quantity < 0 THEN
              RAISE EXCEPTION 'Недостаточно на складе: доступно %, требуется %', v_balance, abs(NEW.quantity);
            END IF;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`);
    await q.query(`
      CREATE TRIGGER trg_sm_validate BEFORE INSERT ON stock_movements
        FOR EACH ROW EXECUTE FUNCTION fn_stock_movement_validate()`);

    // ── Триггер неизменяемости проведённых движений ─────────────────────────
    await q.query(`
      CREATE OR REPLACE FUNCTION fn_stock_movement_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Проведённые движения нельзя изменять или удалять; используйте сторнирующее движение';
      END;
      $$ LANGUAGE plpgsql`);
    await q.query(`
      CREATE TRIGGER trg_sm_immutable BEFORE UPDATE OR DELETE ON stock_movements
        FOR EACH ROW EXECUTE FUNCTION fn_stock_movement_immutable()`);

    // ── Представления ───────────────────────────────────────────────────────
    // Остаток по позиции+складу: сумма движений (количественный) либо число
    // экземпляров in_stock (поштучный). Колонки остатка нигде нет — только вью.
    await q.query(`
      CREATE VIEW v_stock_balance AS
      SELECT
        i.id AS item_id, i.sku, i.name, i.unit, i.is_serialized, i.min_stock,
        b.warehouse_id, w.name AS warehouse_name,
        b.balance,
        (i.min_stock IS NOT NULL AND b.balance < i.min_stock) AS below_min
      FROM items i
      JOIN LATERAL (
        SELECT sm.warehouse_id, SUM(sm.quantity) AS balance
          FROM stock_movements sm
          WHERE sm.item_id = i.id AND NOT i.is_serialized
          GROUP BY sm.warehouse_id
        UNION ALL
        SELECT su.warehouse_id, COUNT(*)::numeric AS balance
          FROM stock_units su
          WHERE su.item_id = i.id AND i.is_serialized AND su.status = 'in_stock'
          GROUP BY su.warehouse_id
      ) b ON true
      LEFT JOIN warehouses w ON w.id = b.warehouse_id`);

    await q.query(`
      CREATE VIEW v_low_stock AS
      SELECT i.id AS item_id, i.sku, i.name, i.min_stock,
             COALESCE(bal.total, 0) AS total_balance
      FROM items i
      LEFT JOIN (
        SELECT item_id, SUM(balance) AS total FROM v_stock_balance GROUP BY item_id
      ) bal ON bal.item_id = i.id
      WHERE i.is_active AND i.min_stock IS NOT NULL AND COALESCE(bal.total, 0) < i.min_stock`);

    // Техника на руках у сотрудника (поштучные экземпляры со статусом issued).
    // Расход материалов за период считается параметризованным запросом в сервисе.
    await q.query(`
      CREATE VIEW v_employee_holdings AS
      SELECT e.id AS employee_id, e.full_name,
             su.id AS stock_unit_id, su.item_id, i.name AS item_name,
             su.serial_number, su.inventory_number
      FROM employees e
      JOIN stock_units su ON su.current_holder_id = e.id AND su.status = 'issued'
      JOIN items i ON i.id = su.item_id`);

    // ── Начальные данные ────────────────────────────────────────────────────
    await q.query(`INSERT INTO "warehouses" ("name", "location") VALUES ('Основной склад', 'Главный офис')`);

    // Корневые категории
    await q.query(`
      INSERT INTO "item_categories" ("name", "sort_order") VALUES
        ('Расходные материалы', 10),
        ('Периферия', 20),
        ('Компьютерная техника', 30),
        ('Печать', 40),
        ('Сетевое оборудование', 50),
        ('Комплектующие', 60),
        ('Кабели и переходники', 70)`);
    // Дочерние категории (parent по имени)
    const child = async (name: string, parent: string, sort: number) =>
      q.query(
        `INSERT INTO "item_categories" ("name","parent_id","sort_order")
         SELECT $1, id, $3 FROM "item_categories" WHERE name = $2 AND parent_id IS NULL`,
        [name, parent, sort],
      );
    await child('Картриджи', 'Расходные материалы', 1);
    await child('Бумага', 'Расходные материалы', 2);
    await child('Батарейки', 'Расходные материалы', 3);
    await child('Мыши', 'Периферия', 1);
    await child('Клавиатуры', 'Периферия', 2);
    await child('Наушники', 'Периферия', 3);
    await child('Веб-камеры', 'Периферия', 4);
    await child('ПК', 'Компьютерная техника', 1);
    await child('Ноутбуки', 'Компьютерная техника', 2);
    await child('Мониторы', 'Компьютерная техника', 3);
    await child('Принтеры', 'Печать', 1);
    await child('МФУ', 'Печать', 2);

    // ── Права роли приложения ───────────────────────────────────────────────
    // Миграция выполняется привилегированной ролью; приложение ходит в БД
    // ограниченной ролью (DB_APP_ROLE, напр. itinv_app) — выдаём ей DML на
    // новые таблицы и SELECT на представления. Guard: только если роль есть.
    const appRole = process.env.DB_APP_ROLE;
    if (appRole && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appRole)) {
      const tables = [
        'employees', 'item_categories', 'warehouses', 'items', 'item_compatibility',
        'stock_units', 'stock_movements', 'inventory_checks', 'inventory_check_items',
      ];
      const views = ['v_stock_balance', 'v_low_stock', 'v_employee_holdings'];
      await q.query(`DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON ${tables.map(t => `"${t}"`).join(', ')} TO "${appRole}";
            GRANT SELECT ON ${views.join(', ')} TO "${appRole}";
          END IF;
        END $$`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW IF EXISTS v_employee_holdings`);
    await q.query(`DROP VIEW IF EXISTS v_low_stock`);
    await q.query(`DROP VIEW IF EXISTS v_stock_balance`);
    await q.query(`DROP TRIGGER IF EXISTS trg_sm_immutable ON stock_movements`);
    await q.query(`DROP TRIGGER IF EXISTS trg_sm_validate ON stock_movements`);
    await q.query(`DROP FUNCTION IF EXISTS fn_stock_movement_immutable()`);
    await q.query(`DROP FUNCTION IF EXISTS fn_stock_movement_validate()`);
    await q.query(`DROP TABLE IF EXISTS "inventory_check_items"`);
    await q.query(`DROP TABLE IF EXISTS "inventory_checks"`);
    await q.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await q.query(`DROP TABLE IF EXISTS "stock_units"`);
    await q.query(`DROP TABLE IF EXISTS "item_compatibility"`);
    await q.query(`DROP TABLE IF EXISTS "items"`);
    await q.query(`DROP TABLE IF EXISTS "warehouses"`);
    await q.query(`DROP TABLE IF EXISTS "item_categories"`);
    await q.query(`DROP TABLE IF EXISTS "employees"`);
  }
}
