import { registerAs } from '@nestjs/config';

export default registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  enabled: process.env.RABBITMQ_ENABLED !== 'false',
  exchange: process.env.RABBITMQ_EXCHANGE ?? 'loyalty.events',
  queues: {
    passUpdates: process.env.RABBITMQ_QUEUE_PASS_UPDATES ?? 'pass.updates',
    notifications:
      process.env.RABBITMQ_QUEUE_NOTIFICATIONS ?? 'notifications.send',
  },
}));
