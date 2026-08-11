import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { CacheModule } from './common/cache/cache.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AssetsModule } from './modules/assets/assets.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SyncModule } from './modules/sync/sync.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BackupModule } from './modules/backup/backup.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MetricsMiddleware } from './common/middleware/metrics.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 10 }],
        // Счётчики в общем хранилище: иначе при нескольких инстансах лимит
        // умножается на их число (см. RedisThrottlerStorage)
        storage: new RedisThrottlerStorage(
          config.get<string>('REDIS_HOST'),
          Number(config.get('REDIS_PORT', 6379)),
          config.get<string>('REDIS_PASSWORD'),
        ),
      }),
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'inventory'),
        password: config.get('DB_PASSWORD', 'changeme'),
        database: config.get('DB_NAME', 'it_inventory'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        // Кто применяет миграции — зависит от развёртывания:
        //  • локально под PM2 роль приложения (itinv_app) не имеет прав DDL,
        //    поэтому миграции прогоняются вручную привилегированной ролью:
        //    `npm run migration:run`. Здесь RUN_MIGRATIONS не задаётся.
        //  • в Docker/облаке владелец схемы — сам пользователь приложения, и
        //    без автопрогона контейнер поднимется на пустой базе (симптом:
        //    «column ... does not exist»). Там RUN_MIGRATIONS=true.
        migrationsRun: config.get('RUN_MIGRATIONS') === 'true',
        // В продакшене схему не трогаем. При synchronize TypeORM приводит базу
        // к описанию сущностей на каждом старте: переименование поля означает
        // удаление старой колонки вместе с данными, и миграций для отката нет.
        // Сущности склада помечены `synchronize:false` — их ведёт только миграция.
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    UsersModule,
    AssetsModule,
    InventoryModule,
    SyncModule,
    ReportsModule,
    BackupModule,
    AuditModule,
    NotificationsModule,
    DepartmentsModule,
    WarehouseModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    // Глобальный аудит действий (POST/PUT/PATCH/DELETE) аутентифицированных пользователей
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Метрики после присвоения request-id, но раньше guard-ов: так в статистику
    // попадают и отказы авторизации. /metrics и /health исключены — их дёргает
    // мониторинг, и в статистике приложения они только шум.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer
      .apply(MetricsMiddleware)
      .exclude('metrics', 'metrics/*path', 'health', 'health/*path')
      .forRoutes('*');
  }
}
