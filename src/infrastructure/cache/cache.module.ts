import KeyvRedis from '@keyv/redis';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: config.get<number>('redis.ttl'),
        stores: [
          new KeyvRedis(config.getOrThrow<string>('redis.url'), {
            namespace: config.get<string>('redis.keyPrefix'),
          }),
        ],
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
