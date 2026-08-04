import { LoyaltyProgram } from '../schemas/loyalty-program.schema';

/** Sellos que otorga un scan. Hoy es fijo por visita, sin depender del monto. */
export function calculateStampsEarned(
  program: Pick<LoyaltyProgram, 'stampsPerVisit'>,
): number {
  return program.stampsPerVisit;
}
