import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
