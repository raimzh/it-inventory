import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1. users.token_version — счётчик для отзыва refresh-токенов. Выход из системы
 *    или смена пароля увеличивают его, и все ранее выданные refresh-токены
 *    становятся недействительными без хранения списка токенов в БД.
 * 2. assets.version — версия записи для оптимистичной блокировки: защищает от
 *    ситуации, когда два редактора одновременно открыли карточку и правка
 *    второго молча затирает правку первого.
 */
export class RefreshTokensAndOptimisticLock1754500000000 implements MigrationInterface {
  name = 'RefreshTokensAndOptimisticLock1754500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1`);

    const appRole = process.env.DB_APP_ROLE;
    if (appRole && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appRole)) {
      await q.query(`DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "assets" TO "${appRole}";
          END IF;
        END $$`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "assets" DROP COLUMN IF EXISTS "version"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "token_version"`);
  }
}
