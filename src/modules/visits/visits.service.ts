import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Model } from 'mongoose';

import { AmountMode, AmountSource, CustomerStatus } from '../../common/enums';
import { clampLimit } from '../../common/utils/pagination';
import { TenantConnectionService } from '../../infrastructure/database/tenant-connection.service';
import { EventsPublisher } from '../../infrastructure/messaging/events.publisher';
import { EventPatterns } from '../../infrastructure/messaging/messaging.constants';
import { CustomersService } from '../customers/customers.service';
import { calculateStampsEarned } from '../loyalty/engine/stamps.engine';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { LoyaltyProgramDocument } from '../loyalty/schemas/loyalty-program.schema';
import { WalletDocument } from '../loyalty/schemas/wallet.schema';
import { Visit, VisitDocument, VisitSchema } from './schemas/visit.schema';

export interface RegisterVisitData {
  customerQrToken: string;
  amountCents?: number;
  currency?: string;
  registeredBy: string;
}

/** Lo que el panel necesita para pintar el resultado del scan sin una segunda llamada. */
export interface VisitResult {
  visitId?: string;
  customer: { id: string; name: string; lastName: string };
  /** `false` cuando el scan cayó dentro del cooldown y no se acreditó nada. */
  stamped: boolean;
  reason?: 'cooldown';
  stampsEarned: number;
  stampBalance: number;
  stampsRequired: number;
  /** Cartillas completadas por este scan: dispara el "¡Premio desbloqueado!". */
  unlockedNow: number;
  /** Créditos disponibles: habilita el botón de canje. */
  availableRewards: number;
}

export interface VisitView {
  id: string;
  customerId: string;
  stampsEarned: number;
  unlockedRewards: number;
  amountCents?: number;
  currency?: string;
  registeredBy?: string;
  createdAt: Date;
}

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
    private readonly events: EventsPublisher,
  ) {}

  private model(dbName: string): Model<Visit> {
    return this.tenantConnection.getModel<Visit>(
      dbName,
      Visit.name,
      VisitSchema,
    );
  }

  /**
   * El scan del staff: del QR del cliente a los sellos acreditados.
   *
   * El `Visit` se inserta antes de tocar la tarjeta a propósito. Sin transacciones, si el
   * update de la tarjeta falla queda una visita sin acreditar: visible, contable y
   * reparable. Al revés quedarían sellos aplicados sin ningún rastro en el ledger, que no
   * hay forma de reconstruir. `wallet.lastVisitId` correlaciona ambos documentos.
   */
  async registerByQr(
    dbName: string,
    data: RegisterVisitData,
  ): Promise<VisitResult> {
    const customer = await this.customers.findByQrToken(
      dbName,
      data.customerQrToken,
    );

    if (customer.status !== CustomerStatus.Active) {
      throw new ConflictException('El cliente está inactivo');
    }

    const program = await this.loyalty.getProgram(dbName);

    if (!program.active) {
      throw new ConflictException('El programa de la tienda está pausado');
    }

    const amountSource = this.resolveAmountSource(program, data.amountCents);
    const wallet = await this.loyalty.ensureWallet(dbName, customer._id);
    const stampsEarned = calculateStampsEarned(program);

    const customerView = {
      id: customer._id,
      name: customer.name,
      lastName: customer.lastName,
    };

    // Chequeo barato para el caso común (el cajero escanea dos veces seguidas): evita
    // insertar una visita que después habría que borrar. No alcanza como garantía —dos
    // requests simultáneos lo pasan los dos— y por eso el cooldown real vive en el filtro
    // atómico de `creditVisit`.
    if (
      this.isWithinCooldown(wallet.lastVisitAt, program.visitCooldownSeconds)
    ) {
      return this.cooldownResult(customerView, wallet);
    }

    const visit = await this.model(dbName).create({
      customerId: customer._id,
      walletId: wallet._id,
      stampsEarned,
      amountCents: data.amountCents,
      // Sin monto no hay moneda que guardar: en modo `visits_only` el campo quedaría
      // describiendo un importe que no existe.
      currency: data.amountCents === undefined ? undefined : data.currency,
      amountSource,
      registeredBy: data.registeredBy,
    });

    const updated = await this.loyalty.creditVisit(
      dbName,
      wallet._id,
      stampsEarned,
      visit._id,
      program.visitCooldownSeconds,
    );

    if (!updated) {
      // Carrera: otro scan del mismo cliente entró entre el chequeo previo y este update.
      // La visita se borra porque nunca llegó a acreditarse; dejarla inflaría el ledger y
      // rompería la reconciliación contra `lifetimeStamps`.
      await this.model(dbName)
        .deleteOne({ _id: visit._id })
        .exec()
        .catch((error: unknown) => {
          // Si el borrado falla queda una visita sin acreditar. Se loguea para poder
          // limpiarla, pero no se le devuelve un 500 al cajero: desde su lado el resultado
          // sigue siendo el mismo, no se acreditó nada.
          this.logger.error(
            `Quedó una visita sin acreditar tras perder la carrera del cooldown: ${visit._id}`,
            error instanceof Error ? error.stack : String(error),
          );
        });

      return this.cooldownResult(customerView, wallet);
    }

    await this.model(dbName)
      .updateOne(
        { _id: visit._id },
        {
          unlockedRewards: updated.lastUnlockDelta,
          balanceAfter: updated.stampBalance,
        },
      )
      .exec()
      .catch((error: unknown) => {
        // El saldo ya está acreditado, que es lo que importa. Estos dos campos son solo
        // para auditoría, así que no se le falla el scan al cajero por ellos.
        this.logger.warn(
          `No se pudo completar la auditoría de la visita ${visit._id}: ${String(error)}`,
        );
      });

    // El payload lleva `dbName` y no `tenantId`: es lo que el consumidor necesita para
    // poder leer algo, ya que los schemas de tenant no guardan a qué tienda pertenecen.
    const payload = {
      dbName,
      customerId: customer._id,
      walletId: wallet._id,
      stampBalance: updated.stampBalance,
      stampsRequired: updated.stampsRequired,
      availableRewards: updated.availableRewards,
    };

    this.events.publishPassUpdate(EventPatterns.VisitRegistered, {
      ...payload,
      visitId: visit._id,
      stampsEarned,
    });
    this.events.publishPassUpdate(EventPatterns.BalanceChanged, payload);

    if (updated.lastUnlockDelta > 0) {
      this.events.publishNotification(EventPatterns.RewardUnlocked, {
        ...payload,
        unlockedNow: updated.lastUnlockDelta,
      });
    }

    return {
      visitId: visit._id,
      customer: customerView,
      stamped: true,
      stampsEarned,
      stampBalance: updated.stampBalance,
      stampsRequired: updated.stampsRequired,
      unlockedNow: updated.lastUnlockDelta,
      availableRewards: updated.availableRewards,
    };
  }

  private isWithinCooldown(
    lastVisitAt: Date | undefined,
    cooldownSeconds: number,
  ): boolean {
    if (!lastVisitAt || cooldownSeconds <= 0) {
      return false;
    }

    return Date.now() - lastVisitAt.getTime() < cooldownSeconds * 1000;
  }

  /**
   * Dentro del cooldown se devuelve 200 con `stamped: false`, no un error: un 409 en la
   * cara del cajero con el cliente delante provoca justamente el reintento que el cooldown
   * quiere evitar. El panel muestra el balance actual y nadie insiste.
   */
  private cooldownResult(
    customer: VisitResult['customer'],
    wallet: WalletDocument,
  ): VisitResult {
    return {
      customer,
      stamped: false,
      reason: 'cooldown',
      stampsEarned: 0,
      stampBalance: wallet.stampBalance,
      stampsRequired: wallet.stampsRequired,
      unlockedNow: 0,
      availableRewards: wallet.availableRewards,
    };
  }

  /**
   * El origen no se acepta por la red: dejar que el cliente HTTP se declare `Integration`
   * falsearía la trazabilidad del monto.
   */
  private resolveAmountSource(
    program: LoyaltyProgramDocument,
    amountCents?: number,
  ): AmountSource | undefined {
    switch (program.amountMode) {
      case AmountMode.VisitsOnly:
        if (amountCents !== undefined) {
          throw new BadRequestException('Esta tienda no registra montos');
        }
        return undefined;

      case AmountMode.ManualAmount:
        if (amountCents === undefined) {
          throw new BadRequestException('Falta el monto de la compra');
        }
        return AmountSource.Manual;

      case AmountMode.PosIntegration:
        throw new BadRequestException(
          'El modo de integración con POS todavía no está implementado',
        );
    }
  }

  findAll(dbName: string, limit?: number): Promise<VisitDocument[]> {
    return this.model(dbName)
      .find()
      .sort({ createdAt: -1, _id: -1 })
      .limit(clampLimit(limit))
      .exec();
  }

  findByCustomer(
    dbName: string,
    customerId: string,
    limit?: number,
  ): Promise<VisitDocument[]> {
    return this.model(dbName)
      .find({ customerId })
      .sort({ createdAt: -1 })
      .limit(clampLimit(limit))
      .exec();
  }

  toView(visit: VisitDocument): VisitView {
    return {
      id: visit._id,
      customerId: visit.customerId,
      stampsEarned: visit.stampsEarned,
      unlockedRewards: visit.unlockedRewards,
      amountCents: visit.amountCents,
      currency: visit.currency,
      registeredBy: visit.registeredBy,
      createdAt: visit.createdAt,
    };
  }
}
