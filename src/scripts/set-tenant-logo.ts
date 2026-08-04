import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { TenantsService } from '../modules/tenants/tenants.service';

const USAGE =
  'Uso: npm run set:logo -- "<id o nombre de la tienda>" <url del logo>';

/**
 * Carga provisional del logo hasta que el panel tenga su uploader. Acepta el nombre además
 * del id porque el id solo queda en la salida del seed y el nombre es lo que se recuerda.
 */
async function bootstrap(): Promise<void> {
  const [target, logoUrl] = process.argv.slice(2);

  if (!target || !logoUrl) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const tenants = app.get(TenantsService);
    const matches = (await tenants.findAll()).filter(
      (tenant) => tenant._id === target || tenant.name === target,
    );

    if (matches.length === 0) {
      console.error(`No hay ninguna tienda con id o nombre "${target}"`);
      process.exitCode = 1;
      return;
    }

    // El nombre no es único en el schema: sin este corte, un homónimo haría que el logo
    // caiga en una tienda arbitraria según el orden de `findAll`.
    if (matches.length > 1) {
      console.error(`Hay ${matches.length} tiendas llamadas "${target}":`);
      matches.forEach((tenant) => console.error(`  ${tenant._id}`));
      console.error('Volvé a correrlo con el id.');
      process.exitCode = 1;
      return;
    }

    const tenant = await tenants.updateBranding(matches[0]._id, { logoUrl });

    console.log(`Logo actualizado: ${tenant.name}`);
    console.log(`  id      : ${tenant._id}`);
    console.log(`  logoUrl : ${tenant.branding.logoUrl}`);
  } finally {
    await app.close();
  }
}

void bootstrap();
