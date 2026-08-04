import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

import { UserRole } from '../../../common/enums';

export type UserDocument = HydratedDocument<User>;

/**
 * Cuenta del panel. Vive en la base de control junto a `tenants`: el login ocurre antes
 * de saber a qué base del tenant conectarse, y `platform_admin` no pertenece a ninguna.
 */
@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: UserRole, required: true })
  role!: UserRole;

  /**
   * Tienda a la que pertenece. Ausente para `platform_admin`, que es global.
   * Es la única fuente del tenant en un request autenticado: nunca se acepta por la red.
   */
  @Prop({ type: String, required: false, trim: true })
  tenantId?: string;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
