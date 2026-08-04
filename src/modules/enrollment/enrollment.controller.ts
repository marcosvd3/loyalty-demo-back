import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import {
  EnrolledCustomer,
  EnrollmentService,
  EnrollmentTenantInfo,
} from './enrollment.service';

@ApiTags('enrollment')
@Controller('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Public()
  @Get(':tenantQrToken')
  @ApiOperation({
    summary: 'Tienda a la que apunta el QR, para pintar el form.',
  })
  getTenantInfo(
    @Param('tenantQrToken') tenantQrToken: string,
  ): Promise<EnrollmentTenantInfo> {
    return this.enrollmentService.getTenantInfo(tenantQrToken);
  }

  @Public()
  @Post(':tenantQrToken')
  @ApiOperation({ summary: 'Alta de un cliente en la tienda del QR.' })
  register(
    @Param('tenantQrToken') tenantQrToken: string,
    @Body() dto: RegisterCustomerDto,
  ): Promise<EnrolledCustomer> {
    return this.enrollmentService.register(tenantQrToken, dto);
  }
}
