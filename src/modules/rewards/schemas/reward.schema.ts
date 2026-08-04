import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

export type RewardDocument = HydratedDocument<Reward>;

/**
 * Catálogo de premios de la tienda, en su propia base.
 *
 * Sin campo de costo: con la mecánica de cartilla, completar `stampsRequired` sellos
 * acredita un crédito y todo premio del catálogo cuesta exactamente ese crédito. El
 * catálogo define *qué* se puede elegir, no *cuánto* cuesta. Costos distintos por premio
 * serían mecánica de puntos, que es una fase aparte.
 */
@Schema({ timestamps: true })
export class Reward {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: false, trim: true })
  description?: string;

  /** Baja lógica. Nunca se borra físicamente: el `_id` queda referenciado en canjes
   *  históricos, y a futuro en promociones y eventos en vuelo. */
  @Prop({ type: Boolean, default: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RewardSchema = SchemaFactory.createForClass(Reward);
