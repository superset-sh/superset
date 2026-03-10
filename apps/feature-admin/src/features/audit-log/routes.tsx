import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { AuditLogPage } from './pages';

export const AUDIT_LOG_ADMIN_PATH = '/audit-log';

export function createAuditLogAdminRoutes(parentRoute: AnyRoute) {
  const auditLogRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/audit-log',
    component: AuditLogPage,
  });

  return [auditLogRoute];
}
