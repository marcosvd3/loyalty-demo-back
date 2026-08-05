import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'clave123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword!: string;

  @ApiProperty({ example: 'clave-nueva-123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
