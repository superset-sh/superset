import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { AgentDeskCustomerPage } from "./agent-desk-customer-page";
import { AgentDeskOperatorPage } from "./agent-desk-operator-page";
import { AgentDeskChatPage } from "./agent-desk-chat-page";
import { AgentDeskTerminalPage } from "./agent-desk-terminal-page";
import { AgentDeskDesignerListPage } from "./agent-desk-designer-list-page";
import { AgentDeskDesignerPage } from "./agent-desk-designer-page";

// ============================================================================
// Route Paths
// ============================================================================

export const AGENT_DESK_PATH = "/agent-desk";
export const AGENT_DESK_OPERATOR_PATH = "/agent-desk/operator";
export const AGENT_DESK_DESIGNER_LIST_PATH = "/agent-desk/designer";
export const AGENT_DESK_DESIGNER_PATH = "/agent-desk/designer/$sessionId";
export const AGENT_DESK_TERMINAL_PATH = "/agent-desk/$sessionId/terminal";

// ============================================================================
// Route Definitions
// ============================================================================

export const createAgentDeskCustomerRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent-desk",
    component: AgentDeskCustomerPage,
  });

export const createAgentDeskOperatorRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent-desk/operator",
    component: AgentDeskOperatorPage,
  });

export const createAgentDeskDesignerListRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent-desk/designer",
    component: AgentDeskDesignerListPage,
  });

export const createAgentDeskDesignerRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent-desk/designer/$sessionId",
    component: AgentDeskDesignerPage,
  });

export const createAgentDeskChatRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent-desk/$sessionId",
    component: AgentDeskChatPage,
  });

export const createAgentDeskTerminalRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent-desk/$sessionId/terminal",
    component: AgentDeskTerminalPage,
    validateSearch: (search: Record<string, unknown>) => ({
      autoStart: search.autoStart === true || search.autoStart === "true",
    }),
  });

// ============================================================================
// Route Groups
// ============================================================================

export function createAgentDeskRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createAgentDeskCustomerRoute(parentRoute),
    createAgentDeskOperatorRoute(parentRoute),
    createAgentDeskDesignerListRoute(parentRoute),
    createAgentDeskChatRoute(parentRoute),
    createAgentDeskTerminalRoute(parentRoute),
  ];
}

/**
 * 디자이너 라우트는 AppShellAgent 탭 레이아웃 밖에서 독립 렌더링.
 * AppShellAgent는 <Outlet />을 사용하지 않으므로 appLayoutRoute 하위에 등록하면 렌더링 안 됨.
 */
export function createAgentDeskStandaloneRoutes<T extends AnyRoute>(parentRoute: T) {
  return [
    createAgentDeskDesignerRoute(parentRoute),
  ];
}
