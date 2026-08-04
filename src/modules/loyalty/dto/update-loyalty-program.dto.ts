import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { AmountMode, LoyaltyMechanic } from '../../../common/enums';

export class UpdateLoyaltyProgramDto {
  @ApiPropertyOptional({ example: 'Tarjeta de Cafetería Central' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: LoyaltyMechanic })
  @IsOptional()
  @IsEnum(LoyaltyMechanic)
  mechanic?: LoyaltyMechanic;

  @ApiPropertyOptional({ enum: AmountMode })
  @IsOptional()
  @IsEnum(AmountMode)
  amountMode?: AmountMode;

  // Los `@Max` no son cosmética. `@IsInt()` acepta 1e21, y el pipeline del scan hace
  // aritmética con estos valores: un `stampsPerVisit` por encima de 2^53 rompe la precisión
  // de los contadores, y un `visitCooldownSeconds` enorme produce una fecha inválida que
  // hace fallar el casteo del filtro y deja la tienda con 500 en todos los scans.
  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  stampsPerVisit?: number;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: 1000,
    description:
      'Solo afecta a las tarjetas nuevas: las existentes conservan el umbral con el que nacieron.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  stampsRequired?: number;

  @ApiPropertyOptional({
    example: 120,
    minimum: 0,
    maximum: 86400,
    description: '0 desactiva el cooldown.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  visitCooldownSeconds?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
