export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

/**
 * Acota el `limit` de un listado.
 *
 * No alcanza con un valor por defecto en el parámetro: ese solo cubre `undefined`, y en
 * MongoDB `limit(0)` significa *sin límite*, así que un `?limit=0` traería la colección
 * entera. `visits` crece una fila por scan, o sea que es la diferencia entre una lista y
 * un OOM.
 */
export function clampLimit(limit?: number): number {
  if (!limit || limit < 1) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(limit, MAX_LIST_LIMIT);
}
