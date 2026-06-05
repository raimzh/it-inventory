import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Asset } from '../assets/entities/asset.entity';
import { AssetHistory } from '../assets/entities/asset-history.entity';
import { InventorySession } from '../inventory/entities/inventory-session.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetHistory, InventorySession, InventoryItem])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
