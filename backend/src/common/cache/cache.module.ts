import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/** Global: кэш нужен разным модулям, импортировать его в каждый — лишний шум. */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
