import { createRoute, type AnyRoute } from '@tanstack/react-router';
import {
  ProductsPage,
  MySubscriptionPage,
  AdminPaymentPage,
  PlanManagementPage,
  CreditManagementPage,
  ModelPricingPage,
  SubscribersPage,
} from './pages';

// 경로 상수
export const PAYMENT_ADMIN_PATH = "/payment";
export const PAYMENT_ADMIN_PLANS_PATH = "/payment/plans";
export const PAYMENT_ADMIN_SUBSCRIBERS_PATH = "/payment/subscribers";
export const PAYMENT_ADMIN_CREDITS_PATH = "/payment/credits";
export const PAYMENT_ADMIN_PRICING_PATH = "/payment/pricing";

/**
 * Public Payment Routes
 */
export function createPaymentRoutes(rootRoute: AnyRoute) {
  // /payment/products
  const productsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/payment/products',
    component: ProductsPage,
  });

  return [productsRoute];
}

/**
 * Auth Payment Routes (로그인 필요)
 */
export function createPaymentAuthRoutes(rootRoute: AnyRoute) {
  // /payment/subscription
  const subscriptionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/payment/subscription',
    component: MySubscriptionPage,
  });

  return [subscriptionRoute];
}

/**
 * Admin Payment Routes
 */
export function createPaymentAdminRoutes(parentRoute: AnyRoute) {
  // /payment — 대시보드
  const adminPaymentRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/payment',
    component: AdminPaymentPage,
  });

  // /payment/plans — 플랜 관리
  const plansRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/payment/plans',
    component: PlanManagementPage,
  });

  // /payment/credits — 크레딧 관리
  const creditsRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/payment/credits',
    component: CreditManagementPage,
  });

  // /payment/subscribers — 구독자 관리
  const subscribersRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/payment/subscribers',
    component: SubscribersPage,
  });

  // /payment/pricing — 모델 가격 설정
  const pricingRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/payment/pricing',
    component: ModelPricingPage,
  });

  return [adminPaymentRoute, plansRoute, subscribersRoute, creditsRoute, pricingRoute];
}
