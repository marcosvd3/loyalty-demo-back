import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantId } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PanelPassView, PassesService, PassView } from './passes.service';

@ApiTags('passes')
@Controller('passes')
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

  // Antes de la ruta pública: Express matchea por orden de registro y
  // `:tenantQrToken/:customerQrToken` también son dos segmentos, así que declarada después
  // se comería esta con `tenantQrToken = 'customers'`.
  @Get('customers/:id')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Pase de un cliente por su id, para pintar su tarjeta en el panel.',
  })
  getCustomerPass(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ): Promise<PanelPassView> {
    return this.passesService.getPassForCustomer(tenantId, id);
  }

  @Public()
  @Get(':tenantQrToken/:customerQrToken')
  @ApiOperation({
    summary: 'Pase del cliente: cartilla, sellos y código para escanear.',
  })
  getPass(
    @Param('tenantQrToken') tenantQrToken: string,
    @Param('customerQrToken') customerQrToken: string,
  ): Promise<PassView> {
    return this.passesService.getPass(tenantQrToken, customerQrToken);
  }

  @Public()
  @Get(':tenantQrToken/:customerQrToken/qr.svg')
  @Header('Content-Type', 'image/svg+xml')
  // Sin cache: el token no cambia, pero un pase revocado o una tienda suspendida tienen que
  // dejar de resolver en el próximo request y no cuando expire una copia intermedia.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'QR escaneable del pase, para el mostrador.' })
  renderCode(
    @Param('tenantQrToken') tenantQrToken: string,
    @Param('customerQrToken') customerQrToken: string,
  ): Promise<string> {
    return this.passesService.renderCodeSvg(tenantQrToken, customerQrToken);
  }
}
