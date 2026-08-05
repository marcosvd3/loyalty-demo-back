import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UserRole } from '../../common/enums';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId?: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);

    // Mismo error para usuario inexistente, contraseña incorrecta y cuenta desactivada:
    // distinguirlos permitiría enumerar cuentas del panel.
    if (
      !user ||
      !user.active ||
      !(await this.users.verifyPassword(user, password))
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Pide la contraseña actual aunque el token ya pruebe la identidad: un panel abierto en el
   * mostrador alcanzaría, si no, para que cualquiera se apropie de la cuenta.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);

    if (!(await this.users.verifyPassword(user, currentPassword))) {
      throw new UnauthorizedException('La contraseña actual no coincide');
    }

    await this.users.setPassword(user, newPassword);
  }
}
