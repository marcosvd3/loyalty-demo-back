import { Injectable, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';

import { TenantConnectionService } from '../../infrastructure/database/tenant-connection.service';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from './schemas/customer.schema';

export type CreateCustomerData = Pick<
  Customer,
  'name' | 'lastName' | 'identificationNumber' | 'address' | 'phone' | 'email'
>;

/**
 * Los clientes viven en la base del tenant, no en la de control, así que el modelo se
 * resuelve por llamada y no con `@InjectModel`. Todos los métodos reciben el `dbName`
 * que sale del tenant resuelto.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly tenantConnection: TenantConnectionService) {}

  private model(dbName: string): Model<Customer> {
    return this.tenantConnection.getModel<Customer>(
      dbName,
      Customer.name,
      CustomerSchema,
    );
  }

  create(dbName: string, data: CreateCustomerData): Promise<CustomerDocument> {
    return this.model(dbName).create(data);
  }

  findAll(dbName: string): Promise<CustomerDocument[]> {
    return this.model(dbName).find().sort({ createdAt: -1 }).exec();
  }

  /** Punto de entrada del QR del cliente: lo que escanea el staff en cada compra. */
  async findByQrToken(
    dbName: string,
    qrToken: string,
  ): Promise<CustomerDocument> {
    const customer = await this.model(dbName).findOne({ qrToken }).exec();

    if (!customer) {
      throw new NotFoundException('QR de cliente inválido');
    }

    return customer;
  }
}
