import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { ExcelImportService } from './excel-import.service';
import { Asset } from './entities/asset.entity';
import { AssetHistory } from './entities/asset-history.entity';
import { AssetFile } from './entities/asset-file.entity';
import { ImportLog } from './entities/import-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetHistory, AssetFile, ImportLog])],
  controllers: [AssetsController],
  providers: [AssetsService, ExcelImportService],
  exports: [AssetsService, ExcelImportService],
})
export class AssetsModule {}
