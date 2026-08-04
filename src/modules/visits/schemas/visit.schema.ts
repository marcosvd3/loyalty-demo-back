import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

import { AmountSource } from '../../../common/enums';

export type VisitDocument = HydratedDocument<Visit>;

/**
 * Registro de un scan y mitad del ledger del saldo (la otra es `redemptions`).
 *
 * Los campos de acreditación (`stampsEarned`, `amountCents`) son inmutables una vez
 * escritos: la única escritura posterior completa `unlockedRewards` y `balanceAfter`, que
 * son de auditoría. El único borrado es el de una visita que perdió la carrera del cooldown
 * y nunca llegó a acreditarse.
 */
@Schema({ timestamps: true })
export class Visit {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true })
  customerId!: string;

  /** Denormalizado: permite reconciliar el saldo de una tarjeta con un solo `$match`, sin
   *  resolver antes el cliente. */
  @Prop({ type: String, required: true, trim: true })
  walletId!: string;

  /** Snapshot de `stampsPerVisit`: si la tienda cambia la regla, el historial no miente
   *  sobre lo que se otorgó ese día. */
  @Prop({ type: Number, required: true, min: 0 })
  stampsEarned!: number;

  /** Cartillas que completó esta visita. Casi siempre 0 o 1. */
  @Prop({ type: Number, default: 0, min: 0 })
  unlockedRewards!: number;

  /** Posición en la cartilla después de acreditar, para poder auditar sin recalcular. */
  @Prop({ type: Number, required: false, min: 0 })
  balanceAfter?: number;

  /**
   * Monto en la unidad menor de la moneda (centavos), nunca decimal: los Double acumulan
   * error en las sumas de reportes y migrar montos a posteriori es carísimo.
   * Ausente en modo `visits_only`.
   */
  @Prop({ type: Number, required: false, min: 0 })
  amountCents?: number;

  /** ISO 4217. */
  @Prop({ type: String, required: false, trim: true, uppercase: true })
  currency?: string;

  /** Se persiste desde el día 1 aunque hoy solo exista `Manual`, para que la integración
   *  con POS entre sin migración. */
  @Prop({ type: String, enum: AmountSource, required: false })
  amountSource?: AmountSource;

  /** Usuario del panel que escaneó. No es backfilleable: sin actor no hay forma de
   *  detectar a un empleado que se regala sellos. */
  @Prop({ type: String, required: false, trim: true })
  registeredBy?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const VisitSchema = SchemaFactory.createForClass(Visit);

// Timeline de un cliente en el panel.
VisitSchema.index({ walletId: 1, createdAt: -1 });
// Feed de actividad de la tienda. El `_id` desempata: los cuid2 no son monótonos y
// `createdAt` tiene precisión de ms, así que sin esto la paginación por cursor salta filas.
VisitSchema.index({ createdAt: -1, _id: -1 });
