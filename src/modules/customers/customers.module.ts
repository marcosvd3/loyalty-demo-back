import { Module, forwardRef } from '@nestjs/common';

import { TenantsModule } from '../tenants/tenants.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

// Sin `MongooseModule.forFeature`: el modelo de Customer no se registra en la conexión
// raíz porque vive en la base de cada tenant, resuelta en runtime.
//
// `forwardRef` porque PassesModule importa a los dos y Tenants no depende de Customers:
// la referencia diferida evita que el orden de resolución importe si eso cambia.
@Module({
  imports: [forwardRef(() => TenantsModule)],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
