import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { EventsPublisher } from './events.publisher';
import {
  NOTIFICATIONS_CLIENT,
  PASS_UPDATES_CLIENT,
} from './messaging.constants';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PASS_UPDATES_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('rabbitmq.url')],
            queue: config.getOrThrow<string>('rabbitmq.queues.passUpdates'),
            queueOptions: { durable: true },
          },
        }),
      },
      {
        name: NOTIFICATIONS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('rabbitmq.url')],
            queue: config.getOrThrow<string>('rabbitmq.queues.notifications'),
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  providers: [EventsPublisher],
  exports: [ClientsModule, EventsPublisher],
})
export class MessagingModule {}
