import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { TenantsModule } from '../tenants/tenants.module';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  imports: [TenantsModule, CustomersModule, LoyaltyModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
