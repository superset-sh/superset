import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { AgentChatPage } from "../../pages/agent-chat-page";

export const createAgentChatRoute = <T extends AnyRoute>(parentRoute: T) =>
  createRoute({
    getParentRoute: () => parentRoute,
    path: "/agent",
    component: AgentChatPage,
  });
