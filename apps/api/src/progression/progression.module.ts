import { Global, Module } from '@nestjs/common';
import { VillageService } from '../village/village.service';
import { ProgressionService } from './progression.service';

@Global()
@Module({
  providers: [ProgressionService, VillageService],
  exports: [ProgressionService, VillageService],
})
export class ProgressionModule {}
