import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { TenantsService, TenantSummary } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(UserRole.PlatformAdmin)
  @ApiOperation({ summary: 'Tiendas dadas de alta en la plataforma.' })
  async findAll(): Promise<TenantSummary[]> {
    const tenants = await this.tenantsService.findAll();

    return tenants.map((tenant) => this.tenantsService.toSummary(tenant));
  }

  @Get(':id/qr.svg')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'QR imprimible del local, listo para el cartel.' })
  renderQr(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<string> {
    // El QR encodea la URL de alta de la tienda: servirlo por id sin restricción dejaría
    // que cualquier usuario del panel imprima el cartel de otra tienda.
    if (user.role !== UserRole.PlatformAdmin && user.tenantId !== id) {
      throw new ForbiddenException('La tienda no pertenece al usuario');
    }

    return this.tenantsService.renderQrSvg(id);
  }
}
