import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRewardDto {
  @ApiProperty({ example: 'Café gratis' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Cualquier café de la carta, tamaño chico.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
