import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Мягкое удаление основных средств.
 *
 * Раньше удаление стирало карточку вместе со всей историей изменений
 * (asset_history удаляется каскадом). Восстановить, что происходило с
 * оборудованием, после этого было нельзя — а это ровно то, ради чего система
 * и ведётся. Теперь запись помечается датой удаления и исчезает из выборок,
 * но сама история остаётся.
 *
 * Уникальность инвентарного номера переводится на частичный индекс: номер
 * удалённой карточки должен освобождаться, иначе повторно завести ОС с тем
 * же номером стало бы невозможно.
 */
export class SoftDeleteAssets1754600000000 implements MigrationInterface {
  name = 'SoftDeleteAssets1754600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`);

    // Прежнее ограничение уникальности не различает удалённые записи
    await q.query(`ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "UQ_assets_inventory_number"`);
    await q.query(`
      DO $$
      DECLARE c text;
      BEGIN
        SELECT conname INTO c FROM pg_constraint
         WHERE conrelid = 'assets'::regclass AND contype = 'u'
           AND pg_get_constraintdef(oid) ILIKE '%inventory_number%'
         LIMIT 1;
        IF c IS NOT NULL THEN
          EXECUTE format('ALTER TABLE assets DROP CONSTRAINT %I', c);
        END IF;
      END $$`);

    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_assets_inventory_number_active"
        ON "assets" ("inventory_number") WHERE "deleted_at" IS NULL`);

    // Выборки почти всегда идут только по неудалённым
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_assets_deleted_at" ON "assets" ("deleted_at")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_assets_deleted_at"`);
    await q.query(`DROP INDEX IF EXISTS "uq_assets_inventory_number_active"`);
    // Возвращаем сплошную уникальность: перед этим удалённые записи нужно
    // либо очистить, либо переименовать, иначе ограничение не создастся
    await q.query(`DELETE FROM "assets" WHERE "deleted_at" IS NOT NULL`);
    await q.query(`ALTER TABLE "assets" ADD CONSTRAINT "UQ_assets_inventory_number" UNIQUE ("inventory_number")`);
    await q.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
