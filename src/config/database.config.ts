import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/loyalty',
  /** Base de control: registro de tenants y cuentas del panel. */
  dbName: process.env.MONGODB_DB_NAME,
  /** Prefijo de las bases por tienda: `<prefijo>_<tenantId>`. */
  tenantDbPrefix: process.env.MONGODB_TENANT_DB_PREFIX ?? 'tenant',
}));
