import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';

import { CustomerStatus } from '../../common/enums';
import { isDuplicateKey } from '../../common/utils/mongo-errors';
import { TenantConnectionService } from '../../infrastructure/database/tenant-connection.service';
import {
  Redemption,
  RedemptionSchema,
} from '../rewards/schemas/redemption.schema';
import type { RedemptionView } from '../rewards/rewards.service';
import { Visit, VisitSchema } from '../visits/schemas/visit.schema';
import type { VisitView } from '../visits/visits.service';
import {
  Customer,
  CustomerDocument,
  CustomerSchema,
} from './schemas/customer.schema';

export type CreateCustomerData = Pick<
  Customer,
  'name' | 'lastName' | 'identificationNumber' | 'address' | 'phone' | 'email'
>;

export type UpdateCustomerData = Partial<CreateCustomerData> & {
  status?: CustomerStatus;
};

/** Visitas y canjes que se muestran en la ficha. El historial completo sale de `/visits`. */
const HISTORY_LIMIT = 20;

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

/** La ficha completa. Suma la dirección, que no entra en el listado. */
export interface CustomerView extends CustomerSummary {
  address?: string;
  updatedAt: Date;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Movimientos recientes de la tarjeta de un cliente, para la ficha del panel. */
export interface CustomerHistory {
  visits: VisitView[];
  redemptions: RedemptionView[];
}

/**
 * Los clientes viven en la base del tenant, no en la de control, así que el modelo se
 * resuelve por llamada y no con `@InjectModel`. Todos los métodos reciben el `dbName`
 * que sale del tenant resuelto.
 *
 * Lee `visits` y `redemptions` importando sus schemas —objetos planos— y no sus services:
 * ambos módulos ya dependen de este, así que inyectarlos cerraría un ciclo. Mismo criterio
 * que `TenantProvisioningService`.
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

  private visitModel(dbName: string): Model<Visit> {
    return this.tenantConnection.getModel<Visit>(
      dbName,
      Visit.name,
      VisitSchema,
    );
  }

  private redemptionModel(dbName: string): Model<Redemption> {
    return this.tenantConnection.getModel<Redemption>(
      dbName,
      Redemption.name,
      RedemptionSchema,
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

  /**
   * Listado del panel: la misma búsqueda, pero con el total para poder paginar.
   *
   * El `countDocuments` va en paralelo con la página porque son independientes. Puede quedar
   * desfasado del `data` si alguien se registra entre las dos queries; para un contador de
   * paginador eso es irrelevante y no justifica una transacción.
   */
  async searchPage(
    dbName: string,
    term: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: CustomerDocument[]; total: number }> {
    const filter = term?.trim() ? this.buildSearchFilter(term.trim()) : {};
    const model = this.model(dbName);

    const [items, total] = await Promise.all([
      model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      model.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async update(
    dbName: string,
    id: string,
    data: UpdateCustomerData,
  ): Promise<CustomerDocument> {
    try {
      const customer = await this.model(dbName)
        .findByIdAndUpdate(id, data, { new: true, runValidators: true })
        .exec();

      if (!customer) {
        throw new NotFoundException('Cliente no encontrado');
      }

      return customer;
    } catch (error) {
      // `email` e `identificationNumber` son únicos por base: el choque es con otro cliente
      // de esta misma tienda, no con uno de otra.
      if (isDuplicateKey(error)) {
        throw new ConflictException(
          'Ya hay otro cliente con ese correo o documento en la tienda',
        );
      }

      throw error;
    }
  }

  /**
   * Baja lógica. No borra: `visits` y `redemptions` son el ledger con el que se audita el
   * saldo, y quedarían apuntando a un cliente inexistente. `Inactive` ya corta el scan y el
   * canje con 409, así que la baja es efectiva sin romper el historial de la tienda.
   *
   * Se revierte con `PATCH { status: 'Active' }`.
   */
  async deactivate(dbName: string, id: string): Promise<CustomerDocument> {
    return this.update(dbName, id, { status: CustomerStatus.Inactive });
  }

  /**
   * Historial de la ficha. Va por `walletId` y no por `customerId` porque ese es el índice
   * que tienen las dos colecciones (`{ walletId, createdAt }`); por `customerId` sería un
   * collection scan.
   */
  async findHistoryByWallet(
    dbName: string,
    walletId: string,
  ): Promise<CustomerHistory> {
    const [visits, redemptions] = await Promise.all([
      this.visitModel(dbName)
        .find({ walletId })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .exec(),
      this.redemptionModel(dbName)
        .find({ walletId })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .exec(),
    ]);

    return {
      visits: visits.map((visit) => ({
        id: visit._id,
        customerId: visit.customerId,
        stampsEarned: visit.stampsEarned,
        unlockedRewards: visit.unlockedRewards,
        amountCents: visit.amountCents,
        currency: visit.currency,
        registeredBy: visit.registeredBy,
        createdAt: visit.createdAt,
      })),
      redemptions: redemptions.map((redemption) => ({
        id: redemption._id,
        customerId: redemption.customerId,
        rewardId: redemption.rewardId,
        rewardName: redemption.rewardName,
        status: redemption.status,
        redeemedBy: redemption.redeemedBy,
        createdAt: redemption.createdAt,
      })),
    };
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

  toView(customer: CustomerDocument): CustomerView {
    return {
      ...this.toSummary(customer),
      address: customer.address,
      updatedAt: customer.updatedAt,
    };
  }

  private buildSearchFilter(term: string): Record<string, unknown> {
    // Sin escapar, un término con caracteres de regex se interpreta como patrón: una cédula
    // con puntos matchearía de más, y un '(' sin cerrar tira una excepción del driver.
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const like = { $regex: safe, $options: 'i' };

    return {
      $or: [
        // El id va exacto: es un cuid2 que nadie teclea de memoria, se pega entero desde el
        // panel o desde un log. Como subcadena solo agregaría falsos positivos.
        { _id: term },
        { identificationNumber: like },
        { email: like },
        { phone: like },
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
