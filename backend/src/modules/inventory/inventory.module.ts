import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventorySession } from './entities/inventory-session.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { Asset } from '../assets/entities/asset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventorySession, InventoryItem, Asset])],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
