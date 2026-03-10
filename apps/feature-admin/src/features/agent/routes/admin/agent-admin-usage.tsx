import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { AgentUsagePage } from "../../pages/agent-usage-page";

export const createAgentAdminUsageRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent/usage",
    component: AgentUsagePage,
  });
