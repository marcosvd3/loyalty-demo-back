import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';

import { UserRole } from '../../common/enums';
import { User, UserDocument } from './schemas/user.schema';

const BCRYPT_ROUNDS = 10;

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tenantId?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(data: CreateUserData): Promise<UserDocument> {
    const { password, ...rest } = data;

    return this.userModel.create({
      ...rest,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    });
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

  verifyPassword(user: UserDocument, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}
