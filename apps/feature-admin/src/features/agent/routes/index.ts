import type { AnyRoute } from "@tanstack/react-router";
import { createAgentChatRoute } from "./auth/agent-chat";
import { createAgentAdminListRoute } from "./admin/agent-admin-list";
import {
  createAgentAdminNewRoute,
  createAgentAdminEditRoute,
} from "./admin/agent-admin-builder";
import { createAgentAdminUsageRoute } from "./admin/agent-admin-usage";

export const AGENT_PATH = "/agent";
export const AGENT_ADMIN_PATH = "/agent";

export function createAgentAuthRoutes<T extends AnyRoute>(parentRoute: T) {
  return [createAgentChatRoute(parentRoute)];
}

export function createAgentAdminRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createAgentAdminListRoute(parentRoute),
    createAgentAdminNewRoute(parentRoute),
    createAgentAdminEditRoute(parentRoute),
    createAgentAdminUsageRoute(parentRoute),
  ];
}
