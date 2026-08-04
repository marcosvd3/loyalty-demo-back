import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RedeemRewardDto {
  @ApiProperty({
    description:
      'Token del QR del pase del cliente. Va en el body y no en la URL para que no quede en logs ni en el historial del navegador.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  customerQrToken!: string;
}
