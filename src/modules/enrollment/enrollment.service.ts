import { ConflictException, Injectable } from '@nestjs/common';

import { isDuplicateKey } from '../../common/utils/mongo-errors';
import { CustomersService } from '../customers/customers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { TenantsService } from '../tenants/tenants.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';

export interface EnrollmentTenantInfo {
  name: string;
  /** Ausente mientras la tienda no haya cargado logo: el front cae al encabezado de texto. */
  logoUrl?: string;
}

export interface EnrolledCustomer {
  id: string;
  name: string;
  lastName: string;
  email: string;
  /** Token del QR personal: es lo que el staff escanea en cada compra. */
  qrToken: string;
}

/**
 * Alta pública de clientes. Une los dos planos: resuelve el QR de la tienda contra la
 * base de control y escribe el cliente en la base de esa tienda.
 */
@Injectable()
export class EnrollmentService {
  constructor(
    private readonly tenants: TenantsService,
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** Datos para pintar el formulario antes de enviarlo. */
  async getTenantInfo(tenantQrToken: string): Promise<EnrollmentTenantInfo> {
    const tenant = await this.tenants.findByQrToken(tenantQrToken);

    return { name: tenant.name, logoUrl: tenant.branding?.logoUrl };
  }

  async register(
    tenantQrToken: string,
    dto: RegisterCustomerDto,
  ): Promise<EnrolledCustomer> {
    const tenant = await this.tenants.findByQrToken(tenantQrToken);

    try {
      const customer = await this.customers.create(tenant.dbName, dto);

      // Sin transacciones, el par (Customer, Wallet) no es atómico. `ensureWallet` es
      // idempotente y el scan la vuelve a llamar, así que un alta que se corte acá se
      // repara sola en la primera visita.
      await this.loyalty.ensureWallet(tenant.dbName, customer._id);

      return {
        id: customer._id,
        name: customer.name,
        lastName: customer.lastName,
        email: customer.email,
        qrToken: customer.qrToken,
      };
    } catch (error) {
      // Los índices únicos (email, identificationNumber) son por base, así que esto solo
      // choca dentro de la misma tienda: la misma persona puede registrarse en otra sin
      // conflicto.
      if (isDuplicateKey(error)) {
        throw new ConflictException('Ya estás registrado en esta tienda');
      }

      throw error;
    }
  }
}
