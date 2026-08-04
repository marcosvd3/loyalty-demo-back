import { Module } from '@nestjs/common';

import { TenantsModule } from '../tenants/tenants.module';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

// Sin `MongooseModule.forFeature`: LoyaltyProgram y Wallet viven en la base de cada tenant,
// resuelta en runtime por TenantConnectionService.
@Module({
  imports: [TenantsModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
