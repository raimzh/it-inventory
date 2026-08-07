-- ═══════════════════════════════════════════════════════════════════════════
-- Отдельная роль приложения для IT Inventory вместо суперпользователя postgres
--
-- Зачем: сейчас backend ходит в базу ролью postgres — это суперпользователь
-- всего кластера. Утечка .env или SQL-инъекция дают полный контроль над всеми
-- базами на сервере, включая ktms. Роль itinv_app ограничена своей базой.
--
-- Приложение работает с synchronize: true (TypeORM правит схему при старте),
-- поэтому роли нужны права на изменение схемы. Даём их через ВЛАДЕНИЕ
-- объектами в пределах базы it_inventory — вне её роль бессильна.
--
-- ЗАПУСК (в PowerShell от имени администратора):
--   1) задайте пароль в строке CREATE ROLE ниже;
--   2) & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d it_inventory -f sql\create-itinv-role.sql
--   3) впишите тот же пароль в backend\.env: DB_USER=itinv_app, DB_PASSWORD=...
--   4) перезапустите приложение.
--
-- Скрипт идемпотентен: повторный запуск не ломает уже настроенное.
-- ═══════════════════════════════════════════════════════════════════════════

\echo '--- 1. Роль приложения ---'

-- ЗАМЕНИТЕ пароль ниже. Сгенерировать можно так:
--   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itinv_app') THEN
    CREATE ROLE itinv_app LOGIN PASSWORD 'ЗАМЕНИТЕ_ЭТОТ_ПАРОЛЬ'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    RAISE NOTICE 'роль itinv_app создана';
  ELSE
    RAISE NOTICE 'роль itinv_app уже существует — пароль не меняю';
  END IF;
END $$;

\echo '--- 2. Передача владения базой и схемой ---'

ALTER DATABASE it_inventory OWNER TO itinv_app;
ALTER SCHEMA   public       OWNER TO itinv_app;

\echo '--- 3. Передача владения объектами схемы public ---'

-- REASSIGN OWNED здесь НЕ используется намеренно: он затрагивает и разделяемые
-- объекты кластера, то есть мог бы переназначить владельца ЧУЖИХ баз (включая
-- ktms). Перебираем объекты только этой схемы.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT tablename AS o FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO itinv_app', r.o); n := n + 1;
  END LOOP;
  FOR r IN SELECT sequencename AS o FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO itinv_app', r.o); n := n + 1;
  END LOOP;
  FOR r IN SELECT viewname AS o FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO itinv_app', r.o); n := n + 1;
  END LOOP;
  FOR r IN SELECT matviewname AS o FROM pg_matviews WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER MATERIALIZED VIEW public.%I OWNER TO itinv_app', r.o); n := n + 1;
  END LOOP;
  RAISE NOTICE 'передано объектов: %', n;
END $$;

\echo '--- 4. Проверка: не осталось ли объектов за postgres ---'

SELECT 'таблица' AS вид, tablename AS объект, tableowner AS владелец
  FROM pg_tables  WHERE schemaname='public' AND tableowner <> 'itinv_app'
UNION ALL
SELECT 'представление', viewname, viewowner
  FROM pg_views   WHERE schemaname='public' AND viewowner  <> 'itinv_app';
-- Пустой результат = всё передано.

\echo '--- 5. Итог ---'

SELECT rolname AS роль, rolsuper AS суперпользователь, rolcreatedb AS может_создавать_бд,
       rolcreaterole AS может_создавать_роли, rolreplication AS репликация
  FROM pg_roles WHERE rolname = 'itinv_app';
-- Ожидается: суперпользователь = f, остальные флаги = f.
