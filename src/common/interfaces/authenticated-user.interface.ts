import { Request } from 'express';

import { UserRole } from '../enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  /** Ausente para `platform_admin`, que no está atado a una tienda. */
  tenantId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
