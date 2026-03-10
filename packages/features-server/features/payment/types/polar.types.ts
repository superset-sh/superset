import type { NormalizedWebhookEventType } from './normalized.types';

/**
 * Polar webhook event name -> normalized event name mapping
 * Polar uses dot-separated event names (e.g. 'subscription.created')
 */
export const POLAR_EVENT_MAP: Record<string, NormalizedWebhookEventType> = {
  'subscription.created': 'subscription_created',
  'subscription.active': 'subscription_updated',
  'subscription.updated': 'subscription_updated',
  'subscription.canceled': 'subscription_cancelled',
  'subscription.revoked': 'subscription_expired',
  'subscription.uncanceled': 'subscription_resumed',
  'subscription.past_due': 'subscription_updated',
  'order.created': 'order_created',
  'order.refunded': 'order_refunded',
  'order.paid': 'order_created',
};

/**
 * Polar SDK SubscriptionStatus -> normalized SubscriptionStatus mapping
 */
export const POLAR_STATUS_MAP: Record<string, string> = {
  active: 'active',
  canceled: 'cancelled',
  incomplete: 'past_due',
  incomplete_expired: 'expired',
  trialing: 'on_trial',
  past_due: 'past_due',
  unpaid: 'unpaid',
};
