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
   * Ruta del front que recibe el token del QR y pinta el formulario de alta. Tiene que
   * coincidir con la ruta declarada en el router del front: el QR ya impreso no se puede
   * corregir, así que un cambio acá invalida los carteles en la calle.
   */
  enrollPath: process.env.APP_ENROLL_PATH ?? '/e',
}));
