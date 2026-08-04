import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Cuerpo del formulario público de alta al que lleva el QR de la tienda. */
export class RegisterCustomerDto {
  @ApiProperty({ example: 'Marcos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'Gomez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: 'V-12345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  identificationNumber!: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  address?: string;

  @ApiProperty({ example: '+58 412 1234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ example: 'marcos@example.com' })
  @IsEmail()
  @MaxLength(160)
  email!: string;
}
