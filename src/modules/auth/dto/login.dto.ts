import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: 'clave123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
