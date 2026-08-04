import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PassesService } from './passes.service';

@ApiTags('passes')
@Controller('passes')
export class PassesController {
  constructor(private readonly passesService: PassesService) {}
}
