import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsString()
  @IsNotEmpty()
  MONGODB_URI: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL: string;

  @IsOptional()
  @IsUrl({ protocols: ['amqp', 'amqps'], require_tld: false })
  RABBITMQ_URL?: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Configuración de entorno inválida:\n${errors
        .map(
          (e) =>
            `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
        )
        .join('\n')}`,
    );
  }

  return validated;
}
