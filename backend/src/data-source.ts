import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';

// Загружаем backend/.env для CLI-запусков миграций (в приложении это делает @nestjs/config).
loadEnv();

/**
 * Отдельный DataSource для TypeORM CLI (миграции).
 * Использует те же переменные окружения, что и app.module.ts.
 * Запуск по скомпилированному dist: `typeorm migration:run -d dist/data-source.js`.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'it_inventory',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
