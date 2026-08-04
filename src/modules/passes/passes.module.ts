import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { TenantsModule } from '../tenants/tenants.module';
import { PassesController } from './passes.controller';
import { PassesService } from './passes.service';

@Module({
  imports: [TenantsModule, CustomersModule, LoyaltyModule],
  controllers: [PassesController],
  providers: [PassesService],
  exports: [PassesService],
})
export class PassesModule {}
