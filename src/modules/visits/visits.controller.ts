import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { TenantsService } from '../tenants/tenants.service';
import { RegisterVisitDto } from './dto/register-visit.dto';
import { VisitResult, VisitsService, VisitView } from './visits.service';

@ApiTags('visits')
@ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(
    private readonly visitsService: VisitsService,
    private readonly tenants: TenantsService,
  ) {}

  // 200 y no el 201 por defecto de Nest: dentro del cooldown el scan no crea ninguna
  // visita, así que el status no puede prometer que sí. El panel lee `stamped`.
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar una visita escaneando el QR del pase del cliente.',
  })
  async register(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterVisitDto,
  ): Promise<VisitResult> {
    const dbName = await this.tenants.resolveDbName(tenantId);

    return this.visitsService.registerByQr(dbName, {
      ...dto,
      registeredBy: userId,
    });
  }

  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Visitas recientes de la tienda.' })
  async findAll(
    @TenantId() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<VisitView[]> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const visits = await this.visitsService.findAll(dbName, limit);

    return visits.map((visit) => this.visitsService.toView(visit));
  }

  @Get('customers/:customerId')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Visitas de un cliente.' })
  async findByCustomer(
    @TenantId() tenantId: string,
    @Param('customerId') customerId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<VisitView[]> {
    const dbName = await this.tenants.resolveDbName(tenantId);
    const visits = await this.visitsService.findByCustomer(
      dbName,
      customerId,
      limit,
    );

    return visits.map((visit) => this.visitsService.toView(visit));
  }
}
