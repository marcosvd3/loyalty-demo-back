import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../common/enums';
import { clampLimit } from '../../common/utils/pagination';
import { LoyaltyService, WalletView } from '../loyalty/loyalty.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  CustomerHistory,
  CustomersService,
  CustomerSummary,
  CustomerView,
  PageMeta,
} from './customers.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerDocument } from './schemas/customer.schema';

/** Ítem del listado: la ficha resumida más el saldo de su tarjeta. */
interface CustomerListItem extends CustomerSummary {
  /** `null` si el alta se cortó antes de crear la tarjeta. El primer scan la repara. */
  wallet: WalletView | null;
}

interface CustomerPage {
  data: CustomerListItem[];
  meta: PageMeta;
}

interface CustomerDetail extends CustomerHistory {
  customer: CustomerView;
  wallet: WalletView | null;
}

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly loyalty: LoyaltyService,
    private readonly tenants: TenantsService,
  ) {}

  // Sin `@Roles`: el staff de caja es quien atiende el mostrador, así que es exactamente
  // quien necesita encontrar al cliente que perdió el teléfono.
  @Get()
  @ApiOperation({
    summary:
      'Listar y buscar clientes por id, documento, correo, teléfono o nombre.',
  })
  @ApiQuery({ name: 'search', required: false })
  async search(
    @TenantId() tenantId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<CustomerPage> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const limit = clampLimit(query.limit);

    const { items, total } = await this.customersService.searchPage(
      dbName,
      query.search,
      query.page,
      limit,
    );

    return {
      data: await this.attachWallets(dbName, items),
      meta: {
        total,
        page: query.page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha del cliente con su tarjeta y su historial.' })
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<CustomerDetail> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const customer = await this.customersService.findById(dbName, id);
    const wallet = await this.loyalty.findWallet(dbName, customer._id);

    // Sin tarjeta no hay `walletId` por el que buscar, y tampoco puede haber movimientos:
    // visitas y canjes se escriben siempre después de resolverla.
    const history = wallet
      ? await this.customersService.findHistoryByWallet(dbName, wallet._id)
      : { visits: [], redemptions: [] };

    return {
      customer: this.customersService.toView(customer),
      wallet: wallet ? this.loyalty.toWalletView(wallet) : null,
      ...history,
    };
  }

  @Patch(':id')
  @Roles(UserRole.TenantOwner, UserRole.TenantManager)
  @ApiOperation({ summary: 'Editar la ficha de un cliente.' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const customer = await this.customersService.update(dbName, id, dto);

    return this.customersService.toView(customer);
  }

  /**
   * Baja lógica, no borrado: el cliente deja de sumar y de canjear, pero sus visitas y
   * canjes siguen siendo el ledger con el que la tienda audita los saldos que ya otorgó.
   */
  @Delete(':id')
  @Roles(UserRole.TenantOwner, UserRole.TenantManager)
  @ApiOperation({ summary: 'Dar de baja a un cliente.' })
  async remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<CustomerView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const customer = await this.customersService.deactivate(dbName, id);

    return this.customersService.toView(customer);
  }

  /**
   * Recuperación en el local: el cliente cambió de teléfono y el nuevo no tiene su
   * credencial guardada. El staff lo identifica en persona, abre esto y el cliente lo
   * escanea para volver a tener su tarjeta.
   *
   * Es el único camino de recuperación por diseño. Uno self-service que devuelva la
   * credencial a partir del documento sería regalarla: el documento no es un secreto y
   * además es enumerable, así que alcanzaría con iterar números para llevarse los premios
   * ajenos. Acá el factor es que la persona está parada frente a la caja.
   */
  @Get(':id/qr.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'QR del pase de un cliente, para recuperarlo en el local.',
  })
  async renderPassQr(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<string> {
    const dbName = await this.tenants.resolveDbName(tenantId);

    return this.customersService.renderPassQrSvg(dbName, id);
  }

  /** Una sola query para las tarjetas de toda la página, en vez de una por cliente. */
  private async attachWallets(
    dbName: string,
    customers: CustomerDocument[],
  ): Promise<CustomerListItem[]> {
    if (!customers.length) {
      return [];
    }

    const wallets = await this.loyalty.findWalletsByCustomers(
      dbName,
      customers.map((customer) => customer._id),
    );
    const byCustomer = new Map(
      wallets.map((wallet) => [wallet.customerId, wallet]),
    );

    return customers.map((customer) => {
      const wallet = byCustomer.get(customer._id);

      return {
        ...this.customersService.toSummary(customer),
        wallet: wallet ? this.loyalty.toWalletView(wallet) : null,
      };
    });
  }
}
