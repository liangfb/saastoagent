import { Module } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { PolicyEngineService } from './policy-engine.service';

@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService, PolicyEngineService],
  exports: [PolicyEngineService],
})
export class PoliciesModule {}
