export const PASS_UPDATES_CLIENT = Symbol('PASS_UPDATES_CLIENT');
export const NOTIFICATIONS_CLIENT = Symbol('NOTIFICATIONS_CLIENT');

/** Patrones de eventos publicados a RabbitMQ. */
export const EventPatterns = {
  CustomerEnrolled: 'customer.enrolled',
  VisitRegistered: 'visit.registered',
  BalanceChanged: 'balance.changed',
  RewardUnlocked: 'reward.unlocked',
  RewardRedeemed: 'reward.redeemed',
  PromotionDispatched: 'promotion.dispatched',
} as const;

export type EventPattern = (typeof EventPatterns)[keyof typeof EventPatterns];
