import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { HydratedDocument } from 'mongoose';

import { CustomerStatus } from '../../../common/enums';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: String, default: createId, required: true })
  _id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ type: String, required: true, unique: true, trim: true })
  identificationNumber!: string;

  @Prop({ required: false, trim: true })
  address?: string;

  @Prop({ required: true, trim: true })
  phone!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: String, default: createId, required: true, unique: true })
  qrToken!: string;

  @Prop({ type: String, enum: CustomerStatus, default: CustomerStatus.Active })
  status!: CustomerStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
