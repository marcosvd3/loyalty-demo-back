import { Module } from '@nestjs/common';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

// Sin `MongooseModule.forFeature`: el modelo de Customer no se registra en la conexión
// raíz porque vive en la base de cada tenant, resuelta en runtime.
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
