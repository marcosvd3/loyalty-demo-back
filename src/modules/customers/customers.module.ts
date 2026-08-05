import { Module, forwardRef } from '@nestjs/common';

import { LoyaltyModule } from '../loyalty/loyalty.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

// Sin `MongooseModule.forFeature`: el modelo de Customer no se registra en la conexión
// raíz porque vive en la base de cada tenant, resuelta en runtime.
//
// `forwardRef` porque PassesModule importa a los dos y Tenants no depende de Customers:
// la referencia diferida evita que el orden de resolución importe si eso cambia.
//
// LoyaltyModule va directo: no depende de este, así que no hay ciclo. Visits y Rewards sí
// dependen, por eso sus colecciones se leen por schema y no inyectando sus services.
@Module({
  imports: [forwardRef(() => TenantsModule), LoyaltyModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
