import { createRoute, useParams } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { AgentBuilderPage } from "../../pages/agent-builder-page";

/** /agent/new */
export const createAgentAdminNewRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent/new",
    component: () => <AgentBuilderPage />,
  });

/** /agent/$agentId/edit */
export const createAgentAdminEditRoute = <T extends AnyRoute>(
  parentRoute: T,
) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent/$agentId/edit",
    component: AgentEditWrapper,
  });

function AgentEditWrapper() {
  const params = useParams({ strict: false }) as { agentId?: string };
  return <AgentBuilderPage agentId={params.agentId} />;
}
