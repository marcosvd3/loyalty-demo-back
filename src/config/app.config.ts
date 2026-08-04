import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim()),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  /**
   * Origen del front público, no de la API: es lo que se encodea en el QR de la tienda
   * y lo que abre la cámara del cliente. Sin barra final.
   */
  publicUrl: (process.env.APP_PUBLIC_URL ?? 'http://localhost:4200').replace(
    /\/+$/,
    '',
  ),
  /**
   * Segmento que va **después** del token en la URL del QR: `/{qrToken}{enrollPath}`.
   *
   * El token va primero porque identifica al tenant y es lo que decide con qué
   * configuración y estilos se pinta todo lo que cuelga de él. Tiene que coincidir con la
   * ruta declarada en el router del front: el QR ya impreso no se puede corregir, así que
   * un cambio acá invalida los carteles que estén en la calle.
   */
  enrollPath: process.env.APP_ENROLL_PATH ?? '/register',
}));
