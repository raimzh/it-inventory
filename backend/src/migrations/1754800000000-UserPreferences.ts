import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Настройки интерфейса, привязанные к пользователю.
 *
 * До этого состав колонок таблицы ОС жил в localStorage: настройка была
 * своя у каждого пользователя, но привязана к устройству — тот же человек
 * на другом компьютере видел вид по умолчанию.
 *
 * Хранилище «ключ — значение», а не колонка под каждую настройку: их
 * состав меняется вместе с интерфейсом, и заводить миграцию ради нового
 * переключателя несоразмерно. Проверку допустимых ключей делает
 * приложение (PreferencesService), чтобы таблица не превратилась в
 * свалку произвольных имён.
 *
 * ON DELETE CASCADE обязателен: настройки без пользователя — мусор,
 * который иначе накапливался бы после каждого удаления учётной записи и
 * вдобавок мешал бы самому удалению внешним ключом.
 */
export class UserPreferences1754800000000 implements MigrationInterface {
  name = 'UserPreferences1754800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "key"        varchar(100) NOT NULL,
        "value"      jsonb NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Уникальность пары — не перестраховка, а условие работы upsert:
    // сохранение идёт через ON CONFLICT именно по ней. Без индекса
    // две открытые вкладки одного пользователя наплодили бы дубликатов,
    // и какая из настроек прочитается — стало бы делом случая.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_preferences_user_key"
        ON "user_preferences" ("user_id", "key")
    `);

    // Роль приложения владельцем схемы не является, права выдаются явно
    const appRole = process.env.DB_APP_ROLE;
    if (appRole) {
      await q.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "user_preferences" TO "${appRole}"`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "uq_user_preferences_user_key"`);
    await q.query(`DROP TABLE IF EXISTS "user_preferences"`);
  }
}
