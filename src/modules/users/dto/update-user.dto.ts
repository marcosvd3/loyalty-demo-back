import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { TENANT_ROLES, UserRole } from '../../../common/enums';

/** El correo no se edita: es la identidad con la que la cuenta entra al panel. */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ana Pérez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: TENANT_ROLES })
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({
    description:
      'Baja lógica: le corta el acceso al panel sin borrar la cuenta, que queda referenciada ' +
      'en las visitas y canjes que registró.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
