import { Injectable, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';

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
 * Vista de listado. **Sin `qrToken` a propósito**: es la credencial con la que se acreditan
 * sellos y se canjean premios, así que no viaja en una respuesta que devuelve muchos
 * clientes de una. Para recuperarla hay un endpoint por cliente que entrega solo su QR.
 */
export interface CustomerSummary {
  id: string;
  name: string;
  lastName: string;
  identificationNumber: string;
  email: string;
  phone: string;
  status: string;
  createdAt: Date;
}

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

  /**
   * Búsqueda del mostrador: el staff tiene al cliente delante y teclea lo que este le
   * dicta. Cubre documento, correo, nombre y apellido en una sola caja porque en la caja no
   * hay tiempo de elegir un criterio.
   *
   * Sin índice de texto: los términos se escapan y se buscan como subcadena. Es una tienda,
   * no un padrón; el volumen no justifica mantener un índice de texto por base.
   */
  async search(
    dbName: string,
    term: string | undefined,
    limit: number,
  ): Promise<CustomerDocument[]> {
    const filter = term?.trim() ? this.buildSearchFilter(term.trim()) : {};

    return this.model(dbName)
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async findById(dbName: string, id: string): Promise<CustomerDocument> {
    const customer = await this.model(dbName).findById(id).exec();

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  toSummary(customer: CustomerDocument): CustomerSummary {
    return {
      id: customer._id,
      name: customer.name,
      lastName: customer.lastName,
      identificationNumber: customer.identificationNumber,
      email: customer.email,
      phone: customer.phone,
      status: customer.status,
      createdAt: customer.createdAt,
    };
  }

  private buildSearchFilter(term: string): Record<string, unknown> {
    // Sin escapar, un término con caracteres de regex se interpreta como patrón: una cédula
    // con puntos matchearía de más, y un '(' sin cerrar tira una excepción del driver.
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const like = { $regex: safe, $options: 'i' };

    return {
      $or: [
        { identificationNumber: like },
        { email: like },
        { name: like },
        { lastName: like },
      ],
    };
  }

  /**
   * QR del pase de un cliente, para el mostrador: es lo que se le muestra a quien perdió el
   * teléfono para que lo escanee con el nuevo y recupere su tarjeta.
   *
   * Va por `id` y no por el token, y en un endpoint aparte del listado, para que la
   * credencial no viaje en una respuesta que devuelve muchos clientes a la vez.
   */
  async renderPassQrSvg(dbName: string, id: string): Promise<string> {
    const customer = await this.findById(dbName, id);

    return QRCode.toString(customer.qrToken, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    });
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
