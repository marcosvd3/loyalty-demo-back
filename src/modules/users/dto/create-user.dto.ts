import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { TENANT_ROLES, UserRole } from '../../../common/enums';

/**
 * No lleva `tenantId`: la tienda sale del token de quien crea la cuenta. Aceptarlo por el
 * body dejaría a un owner sembrar usuarios dentro de otra tienda.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'mostrador@cafeteria.com' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({
    example: 'clave123',
    description:
      'Contraseña inicial. La define quien crea la cuenta y el usuario la cambia después ' +
      'con POST /auth/change-password.',
  })
  @IsString()
  @MinLength(8)
  // bcrypt trunca a 72 bytes: aceptar más daría por válidos caracteres que no se verifican.
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: 'Ana Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: TENANT_ROLES, example: UserRole.TenantStaff })
  @IsIn(TENANT_ROLES)
  role!: UserRole;
}
