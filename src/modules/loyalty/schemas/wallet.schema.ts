import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

import { LoyaltyMechanic } from '../../../common/enums';

export type WalletDocument = HydratedDocument<Wallet>;

/**
 * Tarjeta del cliente: una por cliente, garantizada por el índice único de `customerId`.
 *
 * Es un documento aparte de `Customer` a propósito: separa el documento caliente (se
 * escribe en cada scan) del que tiene los datos personales (casi nunca cambia), permite
 * reiniciar cartillas sin tocar la ficha del cliente, y es el lugar natural de la identidad
 * del pase de wallet cuando se implemente el módulo `passes`.
 *
 * El saldo es un contador, no una derivación de `visits`: es la única forma de hacer un
 * decremento condicional atómico (`availableRewards >= 1`) sin transacciones, que es lo que
 * impide el doble canje. `visits` y `redemptions` son el ledger inmutable para auditarlo.
 */
@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  /** `Customer._id` de esta misma base. Sin `ref`: los modelos se compilan por conexión en
   *  runtime, así que `populate` dependería de qué modelos ya se compilaron antes. */
  @Prop({ type: String, required: true, unique: true, trim: true })
  customerId!: string;

  /** Copia de `LoyaltyProgram.mechanic` al crear la tarjeta: si la tienda cambia de
   *  mecánica, los saldos viejos no se reinterpretan solos. */
  @Prop({
    type: String,
    enum: LoyaltyMechanic,
    default: LoyaltyMechanic.Stamps,
  })
  mechanic!: LoyaltyMechanic;

  /**
   * Snapshot de `LoyaltyProgram.stampsRequired` al crear la tarjeta. El pipeline del scan
   * lee este campo y no el del programa, así que cambiar el umbral en el panel no altera
   * ninguna cartilla en curso: un cliente con 9/10 no pasa de golpe a tener premio si la
   * tienda baja el umbral a 8, ni pierde el suyo si lo sube.
   */
  @Prop({ type: Number, required: true, min: 1 })
  stampsRequired!: number;

  /** Posición en la cartilla actual: cíclico entre 0 y `stampsRequired - 1`. */
  @Prop({ type: Number, default: 0, min: 0 })
  stampBalance!: number;

  /** Créditos disponibles para canjear. Materializado, no calculado: una vez acreditado,
   *  ningún cambio de configuración se lo puede quitar al cliente. */
  @Prop({ type: Number, default: 0, min: 0 })
  availableRewards!: number;

  /** Monótonos: nunca decrecen. Son lo que permite reconciliar contra el ledger, cosa que
   *  los cíclicos no pueden por sí solos. */
  @Prop({ type: Number, default: 0, min: 0 })
  lifetimeStamps!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  lifetimeRewards!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalVisits!: number;

  /** Se lee para el cooldown: está en el mismo documento que el scan ya va a escribir, así
   *  que no cuesta una query extra contra `visits`. */
  @Prop({ type: Date, required: false })
  lastVisitAt?: Date;

  /** Correlación con la última visita: si el proceso se cae entre el insert del `Visit` y
   *  el update de la tarjeta, es lo que permite detectar cuál quedó sin acreditar. */
  @Prop({ type: String, required: false, trim: true })
  lastVisitId?: string;

  /** Créditos que otorgó el último scan. Efímero: lo escribe el pipeline para poder leerlo
   *  de la post-imagen. Se declara acá para que `strict` no lo descarte. */
  @Prop({ type: Number, default: 0, min: 0 })
  lastUnlockDelta!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
