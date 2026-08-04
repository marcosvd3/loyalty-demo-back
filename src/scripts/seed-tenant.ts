import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { UserRole } from '../common/enums';
import { LoyaltyService } from '../modules/loyalty/loyalty.service';
import { RewardsService } from '../modules/rewards/rewards.service';
import { TenantProvisioningService } from '../modules/tenants/tenant-provisioning.service';
import { TenantsService } from '../modules/tenants/tenants.service';
import { UsersService } from '../modules/users/users.service';

const USAGE =
  'Uso: npm run seed:tenant -- "<nombre de la tienda>" <email del owner> <contraseña>';

/**
 * Alta de una tienda completa: registro en la base de control, creación e indexado de su
 * base, programa de sellos por defecto, un premio y la cuenta del panel.
 *
 * El script es el orquestador y no `TenantsService.create`: hacer que el plano de control
 * escriba en la base del tenant invertiría la dirección de dependencia y convertiría el
 * alta en una operación sobre dos bases sin transacción posible.
 */
async function bootstrap(): Promise<void> {
  const [name, email, password] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const tenant = await app.get(TenantsService).create(name);

    // Antes que cualquier otra escritura: crea la base y sus índices de forma explícita, en
    // vez de dejar que nazcan durante el primer request real.
    await app.get(TenantProvisioningService).provision(tenant.dbName);

    const program = await app.get(LoyaltyService).ensureProgram(tenant.dbName, {
      name: `Tarjeta de ${name}`,
    });

    await app.get(RewardsService).create(tenant.dbName, {
      name: 'Premio de la casa',
      description: 'Configurable desde el panel.',
    });

    const user = await app.get(UsersService).create({
      email,
      password,
      name: `Owner de ${name}`,
      role: UserRole.TenantOwner,
      tenantId: tenant._id,
    });

    console.log(`Tenant creado: ${tenant.name}`);
    console.log(`  id             : ${tenant._id}`);
    console.log(`  base           : ${tenant.dbName}`);
    console.log(`  qrToken        : ${tenant.qrToken}`);
    console.log(`  cartilla       : ${program.stampsRequired} sellos`);
    console.log(`  cooldown       : ${program.visitCooldownSeconds}s`);
    console.log(`  owner del panel: ${user.email}`);
  } finally {
    await app.close();
  }
}

void bootstrap();
