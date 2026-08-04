import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';

import { LoyaltyMechanic } from '../../common/enums';
import { isDuplicateKey } from '../../common/utils/mongo-errors';
import { TenantConnectionService } from '../../infrastructure/database/tenant-connection.service';
import {
  LOYALTY_PROGRAM_ID,
  LoyaltyProgram,
  LoyaltyProgramDocument,
  LoyaltyProgramSchema,
} from './schemas/loyalty-program.schema';
import { Wallet, WalletDocument, WalletSchema } from './schemas/wallet.schema';

export type ProgramSettings = Partial<
  Pick<
    LoyaltyProgram,
    | 'name'
    | 'mechanic'
    | 'amountMode'
    | 'stampsPerVisit'
    | 'stampsRequired'
    | 'visitCooldownSeconds'
    | 'active'
  >
>;

export interface LoyaltyProgramView {
  name: string;
  mechanic: string;
  amountMode: string;
  stampsPerVisit: number;
  stampsRequired: number;
  visitCooldownSeconds: number;
  active: boolean;
}

export interface WalletView {
  id: string;
  customerId: string;
  stampBalance: number;
  stampsRequired: number;
  availableRewards: number;
  lifetimeStamps: number;
  lifetimeRewards: number;
  totalVisits: number;
  lastVisitAt?: Date;
}

/**
 * Programa y tarjetas viven en la base del tenant, así que el modelo se resuelve por
 * llamada y todos los métodos reciben el `dbName` del tenant resuelto.
 */
@Injectable()
export class LoyaltyService {
  constructor(private readonly tenantConnection: TenantConnectionService) {}

  private programModel(dbName: string): Model<LoyaltyProgram> {
    return this.tenantConnection.getModel<LoyaltyProgram>(
      dbName,
      LoyaltyProgram.name,
      LoyaltyProgramSchema,
    );
  }

  private walletModel(dbName: string): Model<Wallet> {
    return this.tenantConnection.getModel<Wallet>(
      dbName,
      Wallet.name,
      WalletSchema,
    );
  }

  /**
   * No auto-crea: si una tienda llegara sin programa, es preferible que el scan falle con
   * un mensaje claro a que acredite sellos bajo una mecánica que nadie configuró.
   */
  async getProgram(dbName: string): Promise<LoyaltyProgramDocument> {
    const program = await this.programModel(dbName)
      .findById(LOYALTY_PROGRAM_ID)
      .exec();

    if (!program) {
      throw new NotFoundException('La tienda no tiene un programa configurado');
    }

    return program;
  }

  /** Idempotente y único camino de creación del singleton. Lo usa el provisioning. */
  async ensureProgram(
    dbName: string,
    settings: ProgramSettings & { name: string },
  ): Promise<LoyaltyProgramDocument> {
    const existing = await this.programModel(dbName)
      .findById(LOYALTY_PROGRAM_ID)
      .exec();

    if (existing) {
      return existing;
    }

    try {
      return await this.programModel(dbName).create({
        _id: LOYALTY_PROGRAM_ID,
        ...settings,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }

      // Otro provisioning creó el singleton entre el findById y el create. El `_id` fijo
      // es lo que convierte la carrera en un duplicate key en vez de dos programas.
      return this.getProgram(dbName);
    }
  }

  async updateProgram(
    dbName: string,
    settings: ProgramSettings,
  ): Promise<LoyaltyProgramDocument> {
    // Mismo criterio que `AmountMode.PosIntegration` en el scan: aceptar una mecánica que
    // el motor no implementa dejaría a la tienda viendo "points" en el panel mientras los
    // scans siguen aplicando sellos, y a las tarjetas nuevas naciendo con el campo
    // mintiendo sobre cómo se calculó su saldo.
    if (settings.mechanic && settings.mechanic !== LoyaltyMechanic.Stamps) {
      throw new BadRequestException(
        `La mecánica "${settings.mechanic}" todavía no está implementada`,
      );
    }

    const program = await this.programModel(dbName)
      .findByIdAndUpdate(LOYALTY_PROGRAM_ID, settings, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!program) {
      throw new NotFoundException('La tienda no tiene un programa configurado');
    }

    return program;
  }

  async getWallet(dbName: string, customerId: string): Promise<WalletDocument> {
    const wallet = await this.walletModel(dbName)
      .findOne({ customerId })
      .exec();

    if (!wallet) {
      throw new NotFoundException('El cliente todavía no tiene tarjeta');
    }

    return wallet;
  }

  /**
   * Get-or-create. Se llama tanto en el alta del cliente como al inicio de cada scan: sin
   * transacciones, si el enrollment se cae después de crear el `Customer`, el primer scan
   * repara solo.
   *
   * En dos pasos y no con `upsert` porque el `_id` tiene default por función, que es
   * justamente el caso donde mongoose se vuelve impredecible con `setDefaultsOnInsert`.
   * La carrera la resuelve el índice único de `customerId`.
   */
  async ensureWallet(
    dbName: string,
    customerId: string,
  ): Promise<WalletDocument> {
    const model = this.walletModel(dbName);
    const existing = await model.findOne({ customerId }).exec();

    if (existing) {
      return existing;
    }

    const program = await this.getProgram(dbName);

    try {
      return await model.create({
        customerId,
        mechanic: program.mechanic,
        stampsRequired: program.stampsRequired,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }

      // Otro request creó la tarjeta entre el findOne y el create.
      return this.getWallet(dbName, customerId);
    }
  }

  /**
   * Acredita una visita en un único write atómico.
   *
   * El pipeline de agregación es lo que evita el bug clásico: incrementar, releer y
   * decidir `if (balance >= required)` en el código deja que dos scans concurrentes desde 9
   * sellos lean 10 y 11, pasen ambos la condición, y acrediten dos premios por una cartilla.
   * Acá el cruce se calcula server-side sobre el valor ya incrementado, así que es correcto
   * bajo cualquier concurrencia y con cualquier `stampsPerVisit`.
   *
   * El cooldown va en el filtro y no en un `findOne` previo: separados, dos requests con
   * 200 ms de diferencia pasarían los dos. Devuelve `null` si el filtro no matcheó.
   */
  creditVisit(
    dbName: string,
    walletId: string,
    stamps: number,
    visitId: string,
    cooldownSeconds: number,
  ): Promise<WalletDocument | null> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - cooldownSeconds * 1000);

    return this.walletModel(dbName)
      .findOneAndUpdate(
        {
          _id: walletId,
          $or: [
            { lastVisitAt: { $exists: false } },
            { lastVisitAt: null },
            { lastVisitAt: { $lte: cutoff } },
          ],
        },
        [
          {
            $set: {
              stampBalance: { $add: ['$stampBalance', stamps] },
              lifetimeStamps: { $add: ['$lifetimeStamps', stamps] },
              totalVisits: { $add: ['$totalVisits', 1] },
              lastVisitAt: now,
              lastVisitId: visitId,
            },
          },
          {
            // Este stage evalúa contra la salida del anterior: `$stampBalance` ya viene
            // incrementado, así que el floor de la división es la cantidad de cartillas
            // completadas por este scan.
            $set: {
              lastUnlockDelta: {
                $floor: { $divide: ['$stampBalance', '$stampsRequired'] },
              },
              availableRewards: {
                $add: [
                  '$availableRewards',
                  { $floor: { $divide: ['$stampBalance', '$stampsRequired'] } },
                ],
              },
              lifetimeRewards: {
                $add: [
                  '$lifetimeRewards',
                  { $floor: { $divide: ['$stampBalance', '$stampsRequired'] } },
                ],
              },
              stampBalance: { $mod: ['$stampBalance', '$stampsRequired'] },
            },
          },
        ],
        // `updatePipeline` es obligatorio desde mongoose 9 para aceptar un array como
        // update; sin él tira MongooseError antes de llegar al driver.
        { new: true, updatePipeline: true },
      )
      .exec();
  }

  /**
   * Débito condicionado: el `$gte: 1` va dentro del update, así que si dos cajas canjean a
   * la vez la segunda recibe `null`. No hace falta lock ni read-then-write.
   */
  redeemCredit(
    dbName: string,
    walletId: string,
  ): Promise<WalletDocument | null> {
    return this.walletModel(dbName)
      .findOneAndUpdate(
        { _id: walletId, availableRewards: { $gte: 1 } },
        { $inc: { availableRewards: -1 } },
        { new: true },
      )
      .exec();
  }

  /** Compensación del canje cuando el registro falla después de haber debitado. */
  async refundCredit(dbName: string, walletId: string): Promise<void> {
    await this.walletModel(dbName)
      .updateOne({ _id: walletId }, { $inc: { availableRewards: 1 } })
      .exec();
  }

  toProgramView(program: LoyaltyProgramDocument): LoyaltyProgramView {
    return {
      name: program.name,
      mechanic: program.mechanic,
      amountMode: program.amountMode,
      stampsPerVisit: program.stampsPerVisit,
      stampsRequired: program.stampsRequired,
      visitCooldownSeconds: program.visitCooldownSeconds,
      active: program.active,
    };
  }

  toWalletView(wallet: WalletDocument): WalletView {
    return {
      id: wallet._id,
      customerId: wallet.customerId,
      stampBalance: wallet.stampBalance,
      stampsRequired: wallet.stampsRequired,
      availableRewards: wallet.availableRewards,
      lifetimeStamps: wallet.lifetimeStamps,
      lifetimeRewards: wallet.lifetimeRewards,
      totalVisits: wallet.totalVisits,
      lastVisitAt: wallet.lastVisitAt,
    };
  }
}
