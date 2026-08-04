import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export class RegisterVisitDto {
  @ApiProperty({
    description:
      'Token del QR del pase del cliente. Va en el body y no en la URL para que no quede en logs, en el Referer ni en el historial del navegador.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  customerQrToken!: string;

  @ApiPropertyOptional({
    example: 12500,
    description:
      'Monto en centavos. Solo si la tienda tiene amountMode = manual_amount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217.' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
