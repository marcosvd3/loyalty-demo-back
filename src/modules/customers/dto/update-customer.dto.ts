import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CustomerStatus } from '../../../common/enums';

/**
 * Edición de la ficha desde el panel. Mismas reglas que el alta pública, con todo opcional.
 *
 * El `qrToken` no está y no debe estar: es la credencial con la que se acreditan sellos y se
 * canjean premios, así que regenerarla desde un formulario de edición dejaría al cliente sin
 * su tarjeta en el teléfono sin que nadie lo haya pedido.
 */
export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'Marcos' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'Gomez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: 'V-12345678' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  identificationNumber?: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: '+58 412 1234567' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'marcos@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({
    enum: CustomerStatus,
    description:
      'Reactivar un cliente dado de baja. La baja se hace con DELETE /customers/:id.',
  })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
