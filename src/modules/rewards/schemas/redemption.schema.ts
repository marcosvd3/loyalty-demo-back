import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

import { RedemptionStatus } from '../../../common/enums';

export type RedemptionDocument = HydratedDocument<Redemption>;

/** Canje de un crédito por un premio. Junto con `visits` forma el ledger del saldo. */
@Schema({ timestamps: true })
export class Redemption {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true })
  customerId!: string;

  @Prop({ type: String, required: true, trim: true })
  walletId!: string;

  @Prop({ type: String, required: true, trim: true })
  rewardId!: string;

  /** Snapshot del nombre al momento del canje: el premio puede renombrarse o desactivarse
   *  y el historial tiene que seguir diciendo qué se entregó realmente. */
  @Prop({ required: true, trim: true })
  rewardName!: string;

  @Prop({
    type: String,
    enum: RedemptionStatus,
    default: RedemptionStatus.Redeemed,
  })
  status!: RedemptionStatus;

  /** Usuario del panel que confirmó el canje. Opcional en el schema por compatibilidad,
   *  pero siempre presente en la práctica: sin actor no hay forma de auditar. */
  @Prop({ type: String, required: false, trim: true })
  redeemedBy?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RedemptionSchema = SchemaFactory.createForClass(Redemption);

// Historial de canjes de un cliente y feed de canjes recientes de la tienda.
RedemptionSchema.index({ walletId: 1, createdAt: -1 });
RedemptionSchema.index({ createdAt: -1 });
