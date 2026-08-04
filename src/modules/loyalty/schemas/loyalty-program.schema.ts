import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { AmountMode, LoyaltyMechanic } from '../../../common/enums';

export type LoyaltyProgramDocument = HydratedDocument<LoyaltyProgram>;

/** `_id` fijo del singleton. Ver el comentario de la clase. */
export const LOYALTY_PROGRAM_ID = 'program';

/**
 * Configuración de la mecánica de una tienda. Vive en la base del tenant y no en el
 * documento `Tenant` de la base de control: es dato de dominio que la tienda edita desde su
 * panel, no metadata de alta en la plataforma.
 *
 * Documento único por base. A diferencia del resto de los schemas, el `_id` no es un cuid2
 * sino la constante `'program'`: eso garantiza el singleton estructuralmente (no hace falta
 * un índice ni un chequeo en el service) y hace que el upsert del provisioning sea trivial.
 */
@Schema({ timestamps: true })
export class LoyaltyProgram {
  @Prop({ type: String, default: LOYALTY_PROGRAM_ID, required: true })
  _id!: string;

  /** Nombre visible de la tarjeta; es lo que se imprime en el pase de wallet. */
  @Prop({ required: true, trim: true })
  name!: string;

  /** Hoy solo `Stamps` está implementado. El campo existe para que el engine ramifique
   *  cuando entren Points/Tiers sin migrar datos. */
  @Prop({
    type: String,
    enum: LoyaltyMechanic,
    default: LoyaltyMechanic.Stamps,
  })
  mechanic!: LoyaltyMechanic;

  /** Modo A / B1 / B2: decide si el scan acepta monto de compra. */
  @Prop({ type: String, enum: AmountMode, default: AmountMode.VisitsOnly })
  amountMode!: AmountMode;

  /** Sellos que otorga cada scan. */
  @Prop({ type: Number, default: 1, min: 1 })
  stampsPerVisit!: number;

  /**
   * Tamaño de la cartilla: el "N" del "3/10" que muestra el pase. Al completarla se
   * acredita un crédito y la cartilla vuelve a 0.
   *
   * `min: 1` no es cosmético: el pipeline del scan hace `$mod` contra este valor y un 0
   * revienta en runtime del lado del servidor.
   */
  @Prop({ type: Number, default: 10, min: 1 })
  stampsRequired!: number;

  /** Anti doble-scan: segundos mínimos entre visitas del mismo cliente. 0 = desactivado. */
  @Prop({ type: Number, default: 120, min: 0 })
  visitCooldownSeconds!: number;

  /** Pausar el programa sin borrarlo: los scans se rechazan, los datos quedan. */
  @Prop({ type: Boolean, default: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const LoyaltyProgramSchema =
  SchemaFactory.createForClass(LoyaltyProgram);
