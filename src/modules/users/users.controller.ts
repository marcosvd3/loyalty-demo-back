import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  TenantId,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { TenantsService } from '../tenants/tenants.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService, UserView } from './users.service';

/**
 * ABM de las cuentas del panel de una tienda.
 *
 * Los usuarios viven en la base de control, no en la del tenant, así que acá no hay
 * `resolveDbName`: el aislamiento lo da filtrar por el `tenantId` del token en cada query.
 * `assertActive` cumple el resto del control de acceso — una tienda suspendida tampoco
 * administra su equipo.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenants: TenantsService,
  ) {}

  // El manager ve el equipo porque necesita saber quién registró cada visita o canje, pero
  // solo el owner lo modifica.
  @Get()
  @Roles(UserRole.TenantOwner, UserRole.TenantManager)
  @ApiOperation({ summary: 'Cuentas del panel de la tienda.' })
  async findAll(@TenantId() tenantId: string): Promise<UserView[]> {
    await this.tenants.assertActive(tenantId);
    const users = await this.usersService.findAllByTenant(tenantId);

    return users.map((user) => this.usersService.toUserView(user));
  }

  @Post()
  @Roles(UserRole.TenantOwner)
  @ApiOperation({ summary: 'Crear una cuenta del panel para la tienda.' })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateUserDto,
  ): Promise<UserView> {
    await this.tenants.assertActive(tenantId);
    const user = await this.usersService.create({ ...dto, tenantId });

    return this.usersService.toUserView(user);
  }

  @Patch(':id')
  @Roles(UserRole.TenantOwner)
  @ApiOperation({ summary: 'Editar nombre, rol o estado de una cuenta.' })
  async update(
    @TenantId() tenantId: string,
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserView> {
    await this.tenants.assertActive(tenantId);
    const user = await this.usersService.updateInTenant(
      id,
      tenantId,
      actorId,
      dto,
    );

    return this.usersService.toUserView(user);
  }

  /**
   * Reset por parte del owner, sin pedir la contraseña actual: no hay envío de correo, así
   * que es el único camino de vuelta para alguien que perdió la suya. El cambio de la propia
   * contraseña va por `POST /auth/change-password`, que sí la exige.
   */
  @Post(':id/password')
  @Roles(UserRole.TenantOwner)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Asignar una contraseña nueva a una cuenta.' })
  async resetPassword(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.tenants.assertActive(tenantId);
    const user = await this.usersService.findByIdInTenant(id, tenantId);

    await this.usersService.setPassword(user, dto.newPassword);
  }
}
