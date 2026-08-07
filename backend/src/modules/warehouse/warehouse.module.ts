import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { ItemCategory } from './entities/item-category.entity';
import { Item } from './entities/item.entity';
import { ItemCompatibility } from './entities/item-compatibility.entity';
import { Warehouse } from './entities/warehouse.entity';
import { StockUnit } from './entities/stock-unit.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { InventoryCheck } from './entities/inventory-check.entity';
import { InventoryCheckItem } from './entities/inventory-check-item.entity';

import { StockService } from './stock.service';
import { ItemsService } from './items.service';
import { EmployeesService } from './employees.service';
import { RefsService } from './refs.service';
import { InventoryCheckService } from './inventory-check.service';
import { WarehouseReportsService } from './warehouse-reports.service';

import { ItemsController } from './items.controller';
import { StockController } from './stock.controller';
import { RefsController } from './refs.controller';
import { EmployeesController } from './employees.controller';
import { InventoryCheckController } from './inventory-check.controller';
import { WarehouseReportsController } from './warehouse-reports.controller';

const ENTITIES = [
  Employee, ItemCategory, Item, ItemCompatibility, Warehouse,
  StockUnit, StockMovement, InventoryCheck, InventoryCheckItem,
];

@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  controllers: [
    ItemsController, StockController, RefsController,
    EmployeesController, InventoryCheckController, WarehouseReportsController,
  ],
  providers: [
    StockService, ItemsService, EmployeesService, RefsService,
    InventoryCheckService, WarehouseReportsService,
  ],
  exports: [StockService],
})
export class WarehouseModule {}
