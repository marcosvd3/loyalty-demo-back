import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  rabbitmqConfig,
  redisConfig,
  validateEnv,
} from './config';
import { CacheModule } from './infrastructure/cache/cache.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { HealthModule } from './modules/health/health.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PassesModule } from './modules/passes/passes.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { VisitsModule } from './modules/visits/visits.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, redisConfig, rabbitmqConfig, jwtConfig],
      validate: validateEnv,
    }),
    DatabaseModule,
    CacheModule,
    MessagingModule,

    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    CustomersModule,
    EnrollmentModule,
    LoyaltyModule,
    VisitsModule,
    RewardsModule,
    PromotionsModule,
    PassesModule,
    NotificationsModule,
  ],
  // El orden importa: JwtAuthGuard puebla `request.user` y RolesGuard lo lee. Registrarlos
  // acá invierte el default a fail-closed, así que `@Public()` pasa a ser la excepción
  // explícita en vez de decoración.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
