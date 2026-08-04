/** Roles dentro del panel. `platform_admin` es global; el resto vive dentro de un tenant. */
export enum UserRole {
  PlatformAdmin = 'platform_admin',
  TenantOwner = 'tenant_owner',
  TenantManager = 'tenant_manager',
  TenantStaff = 'tenant_staff',
}

/** Estado de una tienda dentro de la plataforma. `Suspended` corta el acceso al dashboard
 *  sin borrar su base. */
export enum TenantStatus {
  Active = 'Active',
  Suspended = 'Suspended',
}

/** Estado de la ficha de un cliente dentro de una tienda. */
export enum CustomerStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

/** Mecánicas de fidelización configurables por tienda. */
export enum LoyaltyMechanic {
  Stamps = 'stamps',
  Points = 'points',
  Coupons = 'coupons',
  Tiers = 'tiers',
}

/** Modo de registro del monto de compra elegido por la tienda. */
export enum AmountMode {
  /** Modo A: cada scan es una visita, sin monto. */
  VisitsOnly = 'visits_only',
  /** Modo B1: la tienda escribe el monto en el panel. */
  ManualAmount = 'manual_amount',
  /** Modo B2: el monto llega desde el POS/facturación. Fase futura. */
  PosIntegration = 'pos_integration',
}

/** Origen del monto de una visita. Se persiste desde el día 1 para que B2 quepa después. */
export enum AmountSource {
  Manual = 'manual',
  Integration = 'integration',
}

/** Estado de un canje. `Cancelled` es la marcha atrás del staff: devuelve el crédito. */
export enum RedemptionStatus {
  Redeemed = 'Redeemed',
  Cancelled = 'Cancelled',
}

export enum PassPlatform {
  Apple = 'apple',
  Google = 'google',
}

export enum NotificationChannel {
  Email = 'email',
  WalletPush = 'wallet_push',
}
