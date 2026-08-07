'use strict';
/**
 * Запускалка очистки тестовых данных склада — без psql.
 * Берёт SQL из backend/sql/reset-warehouse-test-data.sql и доступы из backend/.env
 * (через dist/data-source.js), печатает счётчики до и после.
 *
 *   cd backend && node scripts/reset-warehouse-test-data.js
 *
 * Требует собранного dist: npm run build
 */
const fs = require('fs');
const path = require('path');
const { AppDataSource } = require('../dist/data-source.js');

const SQL_FILE = path.join(__dirname, '..', 'sql', 'reset-warehouse-test-data.sql');

const COUNTS = `
  SELECT 'stock_movements' AS t, COUNT(*)::int AS c FROM stock_movements
  UNION ALL SELECT 'stock_units', COUNT(*)::int FROM stock_units
  UNION ALL SELECT 'inventory_checks', COUNT(*)::int FROM inventory_checks
  UNION ALL SELECT 'inventory_check_items', COUNT(*)::int FROM inventory_check_items
  UNION ALL SELECT 'items', COUNT(*)::int FROM items
  UNION ALL SELECT 'employees', COUNT(*)::int FROM employees
  UNION ALL SELECT 'item_categories', COUNT(*)::int FROM item_categories
  UNION ALL SELECT 'warehouses', COUNT(*)::int FROM warehouses`;

const show = (rows) => rows.forEach((r) => console.log('   ' + r.t.padEnd(24) + r.c));

(async () => {
  await AppDataSource.initialize();
  try {
    console.log('== ДО очистки ==');
    show(await AppDataSource.query(COUNTS));

    // Убираем psql-директивы (\echo) — драйвер их не понимает
    const sql = fs.readFileSync(SQL_FILE, 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('\\'))
      .join('\n');

    await AppDataSource.query(sql);

    console.log('== ПОСЛЕ очистки ==');
    show(await AppDataSource.query(COUNTS));
    console.log('\nГотово: тестовые данные удалены, справочники сохранены.');
  } finally {
    await AppDataSource.destroy();
  }
})().catch((e) => {
  console.error('ОШИБКА:', e.message);
  process.exit(1);
});
