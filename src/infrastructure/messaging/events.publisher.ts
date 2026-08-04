import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  EventPattern,
  NOTIFICATIONS_CLIENT,
  PASS_UPDATES_CLIENT,
} from './messaging.constants';

/**
 * Publicación de eventos de dominio.
 *
 * Existe por dos motivos que se contradicen entre sí y hay que resolver en un solo lugar:
 * `ClientProxy.emit()` devuelve un observable frío, así que sin suscribirse no sale nada y
 * el evento se pierde en silencio; pero esperar la publicación acopla el scan a RabbitMQ, y
 * si el broker está caído el cajero no podría cargar sellos.
 *
 * La política es fire-and-forget: se suscribe para que el mensaje salga, y se traga el
 * error para que publicar nunca pueda fallar la operación de negocio.
 */
@Injectable()
export class EventsPublisher {
  private readonly logger = new Logger(EventsPublisher.name);

  private readonly enabled: boolean;

  constructor(
    @Inject(PASS_UPDATES_CLIENT) private readonly passUpdates: ClientProxy,
    @Inject(NOTIFICATIONS_CLIENT) private readonly notifications: ClientProxy,
    config: ConfigService,
  ) {
    this.enabled = config.getOrThrow<boolean>('rabbitmq.enabled');

    if (!this.enabled) {
      this.logger.warn(
        'RabbitMQ deshabilitado: los eventos de dominio no se publican.',
      );
    }
  }

  /** Actualizaciones del pase en la wallet del cliente. */
  publishPassUpdate(pattern: EventPattern, payload: object): void {
    this.publish(this.passUpdates, pattern, payload);
  }

  /** Correo y push. */
  publishNotification(pattern: EventPattern, payload: object): void {
    this.publish(this.notifications, pattern, payload);
  }

  private publish(
    client: ClientProxy,
    pattern: EventPattern,
    payload: object,
  ): void {
    // Sin broker configurado, emitir solo genera un intento de conexión fallido por evento.
    // Se corta acá y no en el módulo para que los clientes sigan inyectables sin ramas.
    if (!this.enabled) {
      return;
    }

    void firstValueFrom(client.emit(pattern, payload)).catch(
      (error: unknown) => {
        this.logger.error(`No se pudo publicar ${pattern}: ${String(error)}`);

        // `ClientRMQ.connect()` cortocircuita con `if (this.client) return
        // this.connectionPromise`, así que una primera conexión fallida deja cacheada una
        // promesa rechazada y TODOS los eventos siguientes fallan aunque el broker vuelva.
        // Es el caso real de arrancar la API antes que RabbitMQ. `close()` limpia el
        // cliente para que la próxima publicación reconecte.
        const closing: unknown = client.close();
        void Promise.resolve(closing).catch(() => undefined);
      },
    );
  }
}
