import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/loyalty',
  /** Base de control: registro de tenants y cuentas del panel. */
  dbName: process.env.MONGODB_DB_NAME,
  /** Prefijo de las bases por tienda: `<prefijo>_<tenantId>`. */
  tenantDbPrefix: process.env.MONGODB_TENANT_DB_PREFIX ?? 'tenant',
  /**
   * El default del driver es 100. Cada socket contra Atlas es TLS y se paga en memoria,
   * así que en instancias chicas el pool solo compite con el heap: `useDb` comparte este
   * pool entre todos los tenants, con lo cual 10 alcanzan para el tráfico de la demo.
   */
  maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE ?? '10', 10),
}));
