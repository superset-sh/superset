import type { Subscription } from '@superbuilder/drizzle';

/**
 * 구독 상태 타입
 */
export type SubscriptionStatus =
  | 'on_trial'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'unpaid'
  | 'cancelled'
  | 'expired';

/**
 * 구독 + 제품 정보
 */
export interface SubscriptionWithProduct extends Subscription {
  product?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
  };
}

/**
 * 구독 통계
 */
export interface SubscriptionStats {
  total: number;
  active: number;
  cancelled: number;
  expired: number;
  paused: number;
  trial: number;
  mrr: number; // Monthly Recurring Revenue (cents)
  arr: number; // Annual Recurring Revenue (cents)
  byPlan: Array<{ planName: string; count: number; percentage: number }>;
}

/**
 * 구독 업데이트 옵션
 */
export interface UpdateSubscriptionOptions {
  variantId?: string;
  billingAnchor?: number;
  pause?: {
    mode: 'void' | 'free';
    resumesAt?: string;
  } | null;
}

/**
 * 구독 취소 옵션
 */
export interface CancelSubscriptionOptions {
  invoiceImmediately?: boolean;
  disableProrations?: boolean;
}
