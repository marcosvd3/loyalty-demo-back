import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentUser,
  TenantId,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { TenantsService } from '../tenants/tenants.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { RedeemRewardDto } from './dto/redeem-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import {
  RedemptionResult,
  RedemptionView,
  RewardsService,
  RewardView,
} from './rewards.service';

@ApiTags('rewards')
@ApiBearerAuth()
@Controller('rewards')
export class RewardsController {
  constructor(
    private readonly rewardsService: RewardsService,
    private readonly tenants: TenantsService,
  ) {}

  @Get()
  @ApiQuery({ name: 'onlyActive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Catálogo de premios de la tienda.' })
  async findAll(
    @TenantId() tenantId: string,
    @Query('onlyActive', new ParseBoolPipe({ optional: true }))
    onlyActive?: boolean,
  ): Promise<RewardView[]> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const rewards = await this.rewardsService.findAll(dbName, onlyActive);

    return rewards.map((reward) => this.rewardsService.toRewardView(reward));
  }

  // Antes de cualquier `GET :id`: Express matchea por orden de registro, así que una ruta
  // paramétrica declarada arriba se comería este path.
  @Get('redemptions')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Canjes recientes de la tienda.' })
  async findRedemptions(
    @TenantId() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<RedemptionView[]> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const redemptions = await this.rewardsService.findRedemptions(
      dbName,
      limit,
    );

    return redemptions.map((redemption) =>
      this.rewardsService.toRedemptionView(redemption),
    );
  }

  // Sin `PlatformAdmin`: no tiene `tenantId`, así que `resolveDbName` lo rechazaría igual.
  @Post()
  @Roles(UserRole.TenantOwner, UserRole.TenantManager)
  @ApiOperation({ summary: 'Agregar un premio al catálogo.' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateRewardDto,
  ): Promise<RewardView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const reward = await this.rewardsService.create(dbName, dto);

    return this.rewardsService.toRewardView(reward);
  }

  @Patch(':id')
  @Roles(UserRole.TenantOwner, UserRole.TenantManager)
  @ApiOperation({ summary: 'Editar o dar de baja un premio.' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRewardDto,
  ): Promise<RewardView> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const reward = await this.rewardsService.update(dbName, id, dto);

    return this.rewardsService.toRewardView(reward);
  }

  @Post(':rewardId/redemptions')
  @ApiOperation({ summary: 'Canjear un crédito del cliente por este premio.' })
  async redeem(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('rewardId') rewardId: string,
    @Body() dto: RedeemRewardDto,
  ): Promise<RedemptionResult> {
    const dbName = await this.tenants.resolveDbName(tenantId);

    return this.rewardsService.redeem(dbName, rewardId, {
      customerQrToken: dto.customerQrToken,
      redeemedBy: userId,
    });
  }
}
