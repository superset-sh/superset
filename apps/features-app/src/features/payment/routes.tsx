import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { ProductsPage, MySubscriptionPage, CreditsPage } from './pages';

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

  // /payment/credits
  const creditsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/payment/credits',
    component: CreditsPage,
  });

  return [subscriptionRoute, creditsRoute];
}
