const DUPLICATE_KEY = 11000;

/**
 * Los índices `unique` son por base, así que un duplicate key solo puede ser un choque
 * dentro de la misma tienda.
 *
 * No distingue qué índice chocó: si hace falta el detalle para dar un mensaje al usuario,
 * leer `error.keyPattern`.
 */
export function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === DUPLICATE_KEY
  );
}
