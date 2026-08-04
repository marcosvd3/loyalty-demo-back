import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { TenantId } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { clampLimit } from '../../common/utils/pagination';
import { TenantsService } from '../tenants/tenants.service';
import { CustomersService, CustomerSummary } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly tenants: TenantsService,
  ) {}

  // Sin `@Roles`: el staff de caja es quien atiende el mostrador, así que es exactamente
  // quien necesita encontrar al cliente que perdió el teléfono.
  @Get()
  @ApiOperation({ summary: 'Buscar clientes por documento, correo o nombre.' })
  @ApiQuery({ name: 'search', required: false })
  async search(
    @TenantId() tenantId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<CustomerSummary[]> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const customers = await this.customersService.search(
      dbName,
      query.search,
      clampLimit(query.limit),
    );

    return customers.map((customer) =>
      this.customersService.toSummary(customer),
    );
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
  @ApiOperation({ summary: 'QR del pase de un cliente, para recuperarlo en el local.' })
  async renderPassQr(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<string> {
    const dbName = await this.tenants.resolveDbName(tenantId);

    return this.customersService.renderPassQrSvg(dbName, id);
  }
}
