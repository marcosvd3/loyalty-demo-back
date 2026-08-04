import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Model } from 'mongoose';

import { CustomerStatus, RedemptionStatus } from '../../common/enums';
import { clampLimit } from '../../common/utils/pagination';
import { TenantConnectionService } from '../../infrastructure/database/tenant-connection.service';
import { EventsPublisher } from '../../infrastructure/messaging/events.publisher';
import { EventPatterns } from '../../infrastructure/messaging/messaging.constants';
import { CustomersService } from '../customers/customers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  Redemption,
  RedemptionDocument,
  RedemptionSchema,
} from './schemas/redemption.schema';
import { Reward, RewardDocument, RewardSchema } from './schemas/reward.schema';

export type CreateRewardData = Pick<Reward, 'name' | 'description'>;
export type UpdateRewardData = Partial<
  CreateRewardData & Pick<Reward, 'active'>
>;

export interface RedeemRewardData {
  customerQrToken: string;
  redeemedBy: string;
}

export interface RewardView {
  id: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface RedemptionResult {
  redemptionId: string;
  customer: { id: string; name: string; lastName: string };
  rewardName: string;
  /** Créditos que le quedan al cliente después del canje. */
  availableRewards: number;
  /** La cartilla en curso no se toca: los sellos sobrantes no se pierden. */
  stampBalance: number;
  stampsRequired: number;
}

export interface RedemptionView {
  id: string;
  customerId: string;
  rewardId: string;
  rewardName: string;
  status: RedemptionStatus;
  redeemedBy?: string;
  createdAt: Date;
}

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
    private readonly events: EventsPublisher,
  ) {}

  private rewardModel(dbName: string): Model<Reward> {
    return this.tenantConnection.getModel<Reward>(
      dbName,
      Reward.name,
      RewardSchema,
    );
  }

  private redemptionModel(dbName: string): Model<Redemption> {
    return this.tenantConnection.getModel<Redemption>(
      dbName,
      Redemption.name,
      RedemptionSchema,
    );
  }

  create(dbName: string, data: CreateRewardData): Promise<RewardDocument> {
    return this.rewardModel(dbName).create(data);
  }

  findAll(dbName: string, onlyActive = false): Promise<RewardDocument[]> {
    return this.rewardModel(dbName)
      .find(onlyActive ? { active: true } : {})
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(dbName: string, id: string): Promise<RewardDocument> {
    const reward = await this.rewardModel(dbName).findById(id).exec();

    if (!reward) {
      throw new NotFoundException('Premio no encontrado');
    }

    return reward;
  }

  async update(
    dbName: string,
    id: string,
    data: UpdateRewardData,
  ): Promise<RewardDocument> {
    const reward = await this.rewardModel(dbName)
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();

    if (!reward) {
      throw new NotFoundException('Premio no encontrado');
    }

    return reward;
  }

  /**
   * Canje de un crédito por un premio del catálogo.
   *
   * El débito va primero porque es el paso que puede fallar por concurrencia: registrar el
   * canje antes dejaría, si el débito falla, un canje asentado que nunca se cobró. Y como
   * no hay transacciones, si el registro falla después de debitar se compensa devolviendo
   * el crédito.
   */
  async redeem(
    dbName: string,
    rewardId: string,
    data: RedeemRewardData,
  ): Promise<RedemptionResult> {
    const customer = await this.customers.findByQrToken(
      dbName,
      data.customerQrToken,
    );
    // Mismo criterio que el scan: si dar de baja a un cliente no cortara también el canje,
    // una baja por fraude seguiría dejándole gastar todo lo acumulado.
    if (customer.status !== CustomerStatus.Active) {
      throw new ConflictException('El cliente está inactivo');
    }

    const reward = await this.findById(dbName, rewardId);

    if (!reward.active) {
      throw new ConflictException('El premio no está disponible');
    }

    const walletBefore = await this.loyalty.getWallet(dbName, customer._id);
    const wallet = await this.loyalty.redeemCredit(dbName, walletBefore._id);

    if (!wallet) {
      throw new ConflictException('El cliente no tiene premios disponibles');
    }

    // El id se genera acá para poder deshacer el registro aunque el `create` falle del lado
    // del cliente después de que el write se haya commiteado.
    const redemptionId = createId();
    let redemption: RedemptionDocument;

    try {
      redemption = await this.redemptionModel(dbName).create({
        _id: redemptionId,
        customerId: customer._id,
        walletId: wallet._id,
        rewardId: reward._id,
        rewardName: reward.name,
        redeemedBy: data.redeemedBy,
      });
    } catch (error) {
      await this.compensateRedemption(dbName, wallet._id, redemptionId, error);
      throw error;
    }

    const payload = {
      dbName,
      customerId: customer._id,
      walletId: wallet._id,
      redemptionId: redemption._id,
      rewardName: reward.name,
      availableRewards: wallet.availableRewards,
      stampBalance: wallet.stampBalance,
    };

    this.events.publishPassUpdate(EventPatterns.RewardRedeemed, payload);
    this.events.publishNotification(EventPatterns.RewardRedeemed, payload);

    return {
      redemptionId: redemption._id,
      customer: {
        id: customer._id,
        name: customer.name,
        lastName: customer.lastName,
      },
      rewardName: reward.name,
      availableRewards: wallet.availableRewards,
      stampBalance: wallet.stampBalance,
      stampsRequired: wallet.stampsRequired,
    };
  }

  /**
   * Deshace un canje cuyo registro falló, después de haber debitado el crédito.
   *
   * Borra primero y devuelve el crédito solo si el borrado salió bien. El orden importa:
   * un `create` puede fallar del lado del cliente (timeout de socket) con el write ya
   * commiteado, y en ese caso devolver el crédito sin borrar el registro le regalaría al
   * cliente un canje gratis. Si el borrado tampoco se puede confirmar, se prefiere que el
   * cliente pierda el crédito antes que duplicarlo, y se loguea para repararlo a mano.
   *
   * Nunca relanza: su excepción taparía la causa real del fallo del canje.
   */
  private async compensateRedemption(
    dbName: string,
    walletId: string,
    redemptionId: string,
    cause: unknown,
  ): Promise<void> {
    try {
      await this.redemptionModel(dbName)
        .deleteOne({ _id: redemptionId })
        .exec();
      await this.loyalty.refundCredit(dbName, walletId);
    } catch (error) {
      this.logger.error(
        `Crédito debitado sin canje registrado. wallet=${walletId} ` +
          `redemption=${redemptionId} causa=${String(cause)}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  findRedemptions(
    dbName: string,
    limit?: number,
  ): Promise<RedemptionDocument[]> {
    return this.redemptionModel(dbName)
      .find()
      .sort({ createdAt: -1 })
      .limit(clampLimit(limit))
      .exec();
  }

  toRewardView(reward: RewardDocument): RewardView {
    return {
      id: reward._id,
      name: reward.name,
      description: reward.description,
      active: reward.active,
    };
  }

  toRedemptionView(redemption: RedemptionDocument): RedemptionView {
    return {
      id: redemption._id,
      customerId: redemption.customerId,
      rewardId: redemption.rewardId,
      rewardName: redemption.rewardName,
      status: redemption.status,
      redeemedBy: redemption.redeemedBy,
      createdAt: redemption.createdAt,
    };
  }
}
