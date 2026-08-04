import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createId } from '@paralleldrive/cuid2';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';

import { TenantStatus } from '../../common/enums';
import {
  Tenant,
  TenantBranding,
  TenantDocument,
} from './schemas/tenant.schema';

export interface TenantSummary {
  id: string;
  name: string;
  status: TenantStatus;
  /** URL ya armada que encodea el QR del local. El front no la construye. */
  enrollUrl: string;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    private readonly config: ConfigService,
  ) {}

  async create(name: string): Promise<TenantDocument> {
    // El id se genera acá en vez de dejarlo al default del schema porque el nombre de la
    // base se deriva de él y hace falta antes de insertar.
    const _id = createId();
    const prefix = this.config.getOrThrow<string>('database.tenantDbPrefix');

    return this.tenantModel.create({ _id, name, dbName: `${prefix}_${_id}` });
  }

  findAll(): Promise<TenantDocument[]> {
    return this.tenantModel.find().sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<TenantDocument> {
    const tenant = await this.tenantModel.findById(id).exec();

    if (!tenant) {
      throw new NotFoundException('Tienda no encontrada');
    }

    return tenant;
  }

  /** Merge y no reemplazo: permite tocar un campo del branding sin borrar el resto. */
  async updateBranding(
    id: string,
    branding: Partial<TenantBranding>,
  ): Promise<TenantDocument> {
    const tenant = await this.findById(id);

    tenant.set('branding', { ...tenant.branding, ...branding });

    return tenant.save();
  }

  /**
   * Único puente entre el plano de control y el de dominio. El `tenantId` tiene que venir
   * del claim del JWT y nunca de la red: `TenantConnectionService.getConnection` hace
   * `useDb` sin validar, así que un `dbName` elegido por el cliente leería la base de
   * control. `findById` no filtra por estado, por eso la comprobación va acá.
   */
  async resolveDbName(tenantId: string | undefined): Promise<string> {
    if (!tenantId) {
      throw new ForbiddenException('El usuario no pertenece a una tienda');
    }

    const tenant = await this.findById(tenantId);

    if (tenant.status !== TenantStatus.Active) {
      throw new ForbiddenException('Tienda suspendida');
    }

    return tenant.dbName;
  }

  /** Apunta al front público, no a la API: la abre la cámara del cliente. */
  buildEnrollUrl(tenant: Tenant): string {
    const base = this.config.getOrThrow<string>('app.publicUrl');
    const path = this.config.getOrThrow<string>('app.enrollPath');

    // El token va antes del segmento de la vista: todo lo que cuelga de él pertenece a esa
    // tienda, incluida la configuración con la que el front se pinta.
    return `${base}/${tenant.qrToken}${path}`;
  }

  toSummary(tenant: TenantDocument): TenantSummary {
    return {
      id: tenant._id,
      name: tenant.name,
      status: tenant.status,
      enrollUrl: this.buildEnrollUrl(tenant),
    };
  }

  /**
   * SVG en vez de PNG porque el destino es impresión: escala a cualquier tamaño de
   * cartel sin pixelarse. Corrección 'H' (30% recuperable) para que siga leyéndose
   * con el sticker rayado o con un logo encima.
   */
  async renderQrSvg(id: string): Promise<string> {
    const tenant = await this.findById(id);

    return QRCode.toString(this.buildEnrollUrl(tenant), {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
    });
  }

  /** Punto de entrada del QR de la tienda: del token al tenant y su base. */
  async findByQrToken(qrToken: string): Promise<TenantDocument> {
    const tenant = await this.tenantModel
      .findOne({ qrToken, status: TenantStatus.Active })
      .exec();

    if (!tenant) {
      throw new NotFoundException('QR de tienda inválido o tienda suspendida');
    }

    return tenant;
  }
}
