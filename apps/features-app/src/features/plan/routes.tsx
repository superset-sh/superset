import { createRoute, type AnyRoute } from "@tanstack/react-router";
import { PricingPage } from "./pages/pricing-page";
import { PlanManagementPage } from "./pages/plan-management-page";

export const PRICING_PATH = "/pricing";
export const PLAN_PATH = "/plan";

/**
 * Plan Feature — Public Routes
 */
export function createPlanRoutes<T extends AnyRoute>(parentRoute: T) {
  const pricingRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: PRICING_PATH,
    component: PricingPage,
  });

  return [pricingRoute];
}

/**
 * Plan Feature — Auth Routes (로그인 필요)
 */
export function createPlanAuthRoutes<T extends AnyRoute>(parentRoute: T) {
  const planRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: PLAN_PATH,
    component: PlanManagementPage,
  });

  return [planRoute];
}
