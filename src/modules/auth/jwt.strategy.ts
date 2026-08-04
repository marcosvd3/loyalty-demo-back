import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UserRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
    });
  }

  /**
   * Lo que devuelve acá es lo que queda en `request.user`, o sea lo que leen
   * `@CurrentUser()` y `@TenantId()`. El `tenantId` sale del claim firmado y de ningún
   * otro lado: es lo único que impide que un usuario opere sobre la base de otra tienda.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    };
  }
}
