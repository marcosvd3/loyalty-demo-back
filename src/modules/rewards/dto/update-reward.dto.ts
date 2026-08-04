import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateRewardDto {
  @ApiPropertyOptional({ example: 'Café gratis' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Baja lógica: retira el premio del catálogo sin romper el historial.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
