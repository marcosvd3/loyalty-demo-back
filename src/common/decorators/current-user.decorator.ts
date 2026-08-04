import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../interfaces/authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return field ? request.user?.[field] : request.user;
  },
);

/** Atajo para el tenant del usuario autenticado; toda query de dominio debe filtrar por él. */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user?.tenantId;
  },
);
