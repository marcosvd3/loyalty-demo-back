import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'clave123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
