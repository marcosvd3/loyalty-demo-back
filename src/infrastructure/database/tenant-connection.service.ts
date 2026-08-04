import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Schema } from 'mongoose';

/**
 * Acceso a las bases por tenant. Cada tienda tiene su propia base dentro del mismo
 * cluster; la conexión raíz apunta a la base de control (`tenants`, `users`).
 */
@Injectable()
export class TenantConnectionService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * `useCache: true` es lo que hace viable este modelo: reusa el objeto Connection por
   * nombre de base y comparte el pool del cluster, así que N tenants no son N pools.
   */
  getConnection(dbName: string): Connection {
    return this.connection.useDb(dbName, { useCache: true });
  }

  getModel<T>(dbName: string, name: string, schema: Schema<T>): Model<T> {
    const connection = this.getConnection(dbName);
    // mongoose lanza OverwriteModelError si se re-registra un nombre ya compilado en esa
    // conexión, así que se devuelve el cacheado cuando existe.
    const cached = connection.models[name] as Model<T> | undefined;
    return cached ?? connection.model<T>(name, schema);
  }
}
