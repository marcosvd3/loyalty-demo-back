import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'loyalty',
  // TTL por defecto del cache, en milisegundos (cache-manager v7 usa ms).
  ttl: parseInt(process.env.CACHE_TTL_MS ?? '60000', 10),
}));
