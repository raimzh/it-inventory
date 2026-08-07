-- Очистка тестовых данных модуля «Склад» (после отладки).
--
-- Что УДАЛЯЕТСЯ:  журнал движений, экземпляры, инвентаризации,
--                 тестовые позиции номенклатуры (SKU: SMOKE-*, TEST-*, BUM-A4)
--                 и тестовые сотрудники (ФИО содержит «смоук»/«тест»).
-- Что СОХРАНЯЕТСЯ: справочник категорий (19 шт.), склады, реальные позиции и сотрудники.
--
-- Почему TRUNCATE, а не DELETE: на stock_movements висит триггер
-- trg_sm_immutable, запрещающий DELETE/UPDATE строк журнала. TRUNCATE не вызывает
-- строковые триггеры — это единственный штатный способ обнулить журнал целиком.
-- Именно поэтому очистка возможна только вручную из psql, а не через приложение.
--
-- Запуск (роль-владелец схемы, напр. itinv_app):
--   psql -h localhost -U itinv_app -d it_inventory -f backend\sql\reset-warehouse-test-data.sql
--
-- Всё выполняется в транзакции: при ошибке изменения не применятся.

\echo '== ДО очистки =='
SELECT 'stock_movements' AS table, COUNT(*) FROM stock_movements
UNION ALL SELECT 'stock_units', COUNT(*) FROM stock_units
UNION ALL SELECT 'inventory_checks', COUNT(*) FROM inventory_checks
UNION ALL SELECT 'items', COUNT(*) FROM items
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'item_categories', COUNT(*) FROM item_categories
UNION ALL SELECT 'warehouses', COUNT(*) FROM warehouses;

BEGIN;

-- 1. Журнал, экземпляры и инвентаризации — полностью.
--    Перечислены одной командой: между ними есть внешние ключи.
TRUNCATE TABLE
    stock_movements,
    stock_units,
    inventory_check_items,
    inventory_checks
  RESTART IDENTITY;

-- 2. Тестовая номенклатура (движений на неё уже нет — очищены выше).
DELETE FROM item_compatibility
 WHERE item_id IN (SELECT id FROM items WHERE sku LIKE 'SMOKE-%' OR sku LIKE 'TEST-%' OR sku = 'BUM-A4')
    OR compatible_item_id IN (SELECT id FROM items WHERE sku LIKE 'SMOKE-%' OR sku LIKE 'TEST-%' OR sku = 'BUM-A4');

DELETE FROM items
 WHERE sku LIKE 'SMOKE-%' OR sku LIKE 'TEST-%' OR sku = 'BUM-A4';

-- 3. Тестовые сотрудники.
DELETE FROM employees
 WHERE full_name ILIKE '%смоук%' OR full_name ILIKE '%тест%';

COMMIT;

\echo '== ПОСЛЕ очистки =='
SELECT 'stock_movements' AS table, COUNT(*) FROM stock_movements
UNION ALL SELECT 'stock_units', COUNT(*) FROM stock_units
UNION ALL SELECT 'inventory_checks', COUNT(*) FROM inventory_checks
UNION ALL SELECT 'items', COUNT(*) FROM items
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'item_categories', COUNT(*) FROM item_categories
UNION ALL SELECT 'warehouses', COUNT(*) FROM warehouses;
