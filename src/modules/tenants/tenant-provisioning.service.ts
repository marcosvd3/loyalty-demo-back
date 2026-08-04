import { Injectable, Logger } from '@nestjs/common';
import { Model, Schema } from 'mongoose';

import { TenantConnectionService } from '../../infrastructure/database/tenant-connection.service';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import {
  LoyaltyProgram,
  LoyaltyProgramSchema,
} from '../loyalty/schemas/loyalty-program.schema';
import { Wallet, WalletSchema } from '../loyalty/schemas/wallet.schema';
import {
  Redemption,
  RedemptionSchema,
} from '../rewards/schemas/redemption.schema';
import { Reward, RewardSchema } from '../rewards/schemas/reward.schema';
import { Visit, VisitSchema } from '../visits/schemas/visit.schema';

/** Colecciones que componen la base de una tienda. */
const TENANT_SCHEMAS: Array<[string, Schema]> = [
  [Customer.name, CustomerSchema],
  [LoyaltyProgram.name, LoyaltyProgramSchema],
  [Wallet.name, WalletSchema],
  [Reward.name, RewardSchema],
  [Redemption.name, RedemptionSchema],
  [Visit.name, VisitSchema],
];

/**
 * Creación de la base de una tienda.
 *
 * Importa los schemas del dominio (objetos planos, sin dependencia de DI hacia sus módulos)
 * en vez de sus services, así que no invierte la dirección de dependencia del plano de
 * control.
 *
 * Existe porque `autoIndex` construiría los índices durante la primera request de cada tipo
 * —o sea, en medio de un scan con el cliente esperando en el mostrador—, y porque si esa
 * construcción falla la promesa interna de mongoose rechaza sin que nadie la atrape, lo que
 * en Node 22 tumba el proceso entero.
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(private readonly tenantConnection: TenantConnectionService) {}

  /** Idempotente: `syncIndexes` sobre una base ya provisionada no hace nada. */
  async provision(dbName: string): Promise<void> {
    const models = TENANT_SCHEMAS.map(([name, schema]) =>
      this.tenantConnection.getModel(dbName, name, schema),
    );

    await Promise.all(
      models.map((model: Model<unknown>) => model.syncIndexes()),
    );

    this.logger.log(`Índices sincronizados en ${dbName}`);
  }
}
