import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

import { TenantStatus } from '../../../common/enums';

export type TenantDocument = HydratedDocument<Tenant>;

/**
 * Identidad visual con la que el front pinta la landing del QR. Vive acá y no en la base
 * del tenant porque la landing se resuelve por `qrToken` contra la base de control: leerla
 * de la base de la tienda obligaría a abrir esa conexión solo para pintar un encabezado.
 */
@Schema({ _id: false })
export class TenantBranding {
  /** Solo la ubicación: el binario se sirve aparte (hoy estático, después Bunny/S3). */
  @Prop({ trim: true })
  logoUrl?: string;
}

export const TenantBrandingSchema =
  SchemaFactory.createForClass(TenantBranding);

/**
 * Vive en la base de control, no en la del tenant: resolver `qrToken -> tenant -> dbName`
 * ocurre antes de saber a qué base conectarse.
 */
@Schema({ timestamps: true })
export class Tenant {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Base de datos propia de la tienda. Se persiste en vez de derivarse del `_id` para
   *  poder migrar una tienda de base sin romper las referencias. */
  @Prop({ required: true, unique: true, trim: true })
  dbName!: string;

  /**
   * Token opaco del QR estático del local: resuelve a la landing pública de registro.
   * Separado del `_id` para poder rotarlo si el QR se filtra sin perder las referencias.
   */
  @Prop({ type: String, default: createId, required: true, unique: true })
  qrToken!: string;

  @Prop({ type: String, enum: TenantStatus, default: TenantStatus.Active })
  status!: TenantStatus;

  @Prop({ type: TenantBrandingSchema, default: () => ({}) })
  branding!: TenantBranding;

  // Sin `@Prop`: los crea `timestamps: true`. Se declaran para que existan en el tipo,
  // porque mongoose solo los infiere en schemas literales, no en los basados en clase.
  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
