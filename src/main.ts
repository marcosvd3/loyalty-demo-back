import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const port = config.getOrThrow<number>('app.port');
  const apiPrefix = config.getOrThrow<string>('app.apiPrefix');

  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow<string[]>('app.corsOrigins'),
    credentials: true,
  });

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.get<boolean>('app.swaggerEnabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Loyalty API')
      .setDescription(
        'API de la plataforma de fidelización white-label multi-tenant.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // El host va explícito: Render enruta al contenedor por su IP interna, así que escuchar
  // solo en loopback haría que el health check nunca llegue y el deploy quede en 'live' falso.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
