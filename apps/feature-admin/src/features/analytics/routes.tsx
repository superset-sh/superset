import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { AnalyticsDashboardPage } from './pages';

export const ANALYTICS_ADMIN_PATH = '/analytics';

export function createAnalyticsAdminRoutes(parentRoute: AnyRoute) {
  const analyticsRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/analytics',
    component: AnalyticsDashboardPage,
  });

  return [analyticsRoute];
}
