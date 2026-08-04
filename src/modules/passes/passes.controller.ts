import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { PassesService, PassView } from './passes.service';

@ApiTags('passes')
@Controller('passes')
export class PassesController {
  constructor(private readonly passesService: PassesService) {}

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
