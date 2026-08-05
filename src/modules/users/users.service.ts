import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';

import { UserRole } from '../../common/enums';
import { isDuplicateKey } from '../../common/utils/mongo-errors';
import { User, UserDocument } from './schemas/user.schema';

const BCRYPT_ROUNDS = 10;

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tenantId?: string;
}

export type UpdateUserData = Partial<Pick<User, 'name' | 'role' | 'active'>>;

export interface UserView {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(data: CreateUserData): Promise<UserDocument> {
    const { password, ...rest } = data;

    try {
      return await this.userModel.create({
        ...rest,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      });
    } catch (error) {
      // El índice de correo es único en toda la base de control, no por tienda: una cuenta
      // del panel entra al login sin decir a qué tienda pertenece, así que el correo tiene
      // que resolver a un usuario solo.
      if (isDuplicateKey(error)) {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }

      throw error;
    }
  }

  /** Devuelve `null` en vez de lanzar: el login no debe distinguir usuario inexistente
   *  de contraseña incorrecta. */
  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  /** Ascendente por fecha: el owner que creó el seed queda primero y el equipo se lee en el
   *  orden en que se fue sumando. */
  findAllByTenant(tenantId: string): Promise<UserDocument[]> {
    return this.userModel.find({ tenantId }).sort({ createdAt: 1 }).exec();
  }

  /**
   * Toda operación del ABM entra por acá. El filtro por `tenantId` es lo que impide operar
   * sobre la cuenta de otra tienda, y el 404 —en vez de 403— evita que un id ajeno se pueda
   * usar para confirmar que existe.
   */
  async findByIdInTenant(id: string, tenantId: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ _id: id, tenantId }).exec();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async updateInTenant(
    id: string,
    tenantId: string,
    actorId: string,
    data: UpdateUserData,
  ): Promise<UserDocument> {
    // Solo un owner llega hasta acá, así que prohibirle tocar su propio rol y su propio
    // estado garantiza que la tienda nunca se quede sin un owner activo que la administre.
    if (
      id === actorId &&
      (data.role !== undefined || data.active !== undefined)
    ) {
      throw new ForbiddenException(
        'No se puede cambiar el rol ni desactivar la propia cuenta',
      );
    }

    const user = await this.userModel
      .findOneAndUpdate({ _id: id, tenantId }, data, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  verifyPassword(user: UserDocument, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * No invalida los tokens ya emitidos: no hay lista de revocación, así que una sesión
   * abierta sigue viva hasta que vence, como mucho 15 minutos después del cambio.
   */
  async setPassword(user: UserDocument, password: string): Promise<void> {
    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await user.save();
  }

  toUserView(user: UserDocument): UserView {
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    };
  }
}
