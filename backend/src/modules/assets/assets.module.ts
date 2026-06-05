import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { Asset } from './entities/asset.entity';
import { AssetHistory } from './entities/asset-history.entity';
import { AssetFile } from './entities/asset-file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetHistory, AssetFile])],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
