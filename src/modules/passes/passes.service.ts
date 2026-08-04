import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

import { CustomersService } from '../customers/customers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { TenantsService } from '../tenants/tenants.service';

export interface PassView {
  tenantName: string;
  logoUrl?: string;
  /** Nombre visible de la cartilla, el que configura la tienda en su programa. */
  programName: string;
  customerName: string;
  stampsRequired: number;
  earnedStamps: number;
  availableRewards: number;
  /** El `qrToken` del cliente: es lo que la tienda escanea para acreditar la visita. */
  code: string;
}

/**
 * Vista pública del pase del cliente.
 *
 * Pide los dos tokens y no solo el del cliente porque los clientes viven en la base de su
 * tienda: sin el token del local no hay forma de saber contra qué base resolver, salvo
 * recorriendo todas. El front los tiene a ambos — llega por la landing del QR de la tienda
 * y guarda el del cliente al registrarse.
 *
 * Es público por diseño: el `qrToken` del cliente ya es la credencial que la tienda escanea,
 * así que quien lo tiene puede usar el pase de todos modos. Lo que no puede existir es un
 * camino que devuelva ese token a partir de un dato adivinable como el email.
 */
@Injectable()
export class PassesService {
  constructor(
    private readonly tenants: TenantsService,
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async getPass(
    tenantQrToken: string,
    customerQrToken: string,
  ): Promise<PassView> {
    const tenant = await this.tenants.findByQrToken(tenantQrToken);
    const customer = await this.customers.findByQrToken(
      tenant.dbName,
      customerQrToken,
    );

    // `ensureWallet` y no `getWallet`: el alta crea cliente y tarjeta sin transacción, así
    // que un enrollment cortado a la mitad deja al cliente sin tarjeta. Abrir el pase la
    // repara igual que lo hace el primer scan, en vez de mostrar un 404 que el cliente no
    // puede resolver.
    const wallet = await this.loyalty.ensureWallet(tenant.dbName, customer._id);
    const program = await this.loyalty.getProgram(tenant.dbName);

    return {
      tenantName: tenant.name,
      logoUrl: tenant.branding?.logoUrl,
      programName: program.name,
      customerName: customer.name,
      // El total sale de la tarjeta y no del programa: es el snapshot con el que nació y
      // con el que el scan la acredita, así que es el único que no miente si la tienda
      // cambió el umbral con cartillas en curso.
      stampsRequired: wallet.stampsRequired,
      earnedStamps: wallet.stampBalance,
      availableRewards: wallet.availableRewards,
      code: customer.qrToken,
    };
  }

  /**
   * QR del pase, para que la tienda lo escanee en el mostrador.
   *
   * Encodea el token pelado y no una URL porque es lo que `POST /visits` espera en
   * `customerQrToken`: envolverlo en un enlace obligaría a la caja a recortarlo.
   *
   * Corrección 'M' y no 'H' como el cartel del local: acá el QR se muestra en la pantalla
   * de un teléfono, sin desgaste que recuperar, y subir el nivel solo agrega módulos que a
   * ese tamaño achican cada celda y lo vuelven más difícil de leer.
   */
  async renderCodeSvg(
    tenantQrToken: string,
    customerQrToken: string,
  ): Promise<string> {
    const tenant = await this.tenants.findByQrToken(tenantQrToken);
    const customer = await this.customers.findByQrToken(
      tenant.dbName,
      customerQrToken,
    );

    return QRCode.toString(customer.qrToken, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    });
  }
}
