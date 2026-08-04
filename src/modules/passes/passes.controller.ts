import { Controller, Get, Param } from '@nestjs/common';
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
}
