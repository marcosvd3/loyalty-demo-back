import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { TenantsService } from '../tenants/tenants.service';
import { UpdateLoyaltyProgramDto } from './dto/update-loyalty-program.dto';
import {
  LoyaltyProgramView,
  LoyaltyService,
  WalletView,
} from './loyalty.service';

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly tenants: TenantsService,
  ) {}

  @Get('program')
  @ApiOperation({ summary: 'Configuración de la mecánica de la tienda.' })
  async getProgram(@TenantId() tenantId: string): Promise<LoyaltyProgramView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const program = await this.loyaltyService.getProgram(dbName);

    return this.loyaltyService.toProgramView(program);
  }

  // Sin `PlatformAdmin`: no tiene `tenantId`, así que `resolveDbName` lo rechazaría igual.
  // Listarlo prometería un acceso que la arquitectura no puede dar.
  @Patch('program')
  @Roles(UserRole.TenantOwner, UserRole.TenantManager)
  @ApiOperation({ summary: 'Editar la mecánica de la tienda.' })
  async updateProgram(
    @TenantId() tenantId: string,
    @Body() dto: UpdateLoyaltyProgramDto,
  ): Promise<LoyaltyProgramView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const program = await this.loyaltyService.updateProgram(dbName, dto);

    return this.loyaltyService.toProgramView(program);
  }

  @Get('wallets/:customerId')
  @ApiOperation({ summary: 'Tarjeta de un cliente.' })
  async getWallet(
    @TenantId() tenantId: string,
    @Param('customerId') customerId: string,
  ): Promise<WalletView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const wallet = await this.loyaltyService.getWallet(dbName, customerId);

    return this.loyaltyService.toWalletView(wallet);
  }
}
