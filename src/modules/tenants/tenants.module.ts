import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Tenant.name, schema: TenantSchema }]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, TenantProvisioningService],
  exports: [TenantsService, TenantProvisioningService],
})
export class TenantsModule {}
