import type { AnyRoute } from "@tanstack/react-router";
import { createAgentChatRoute } from "./auth/agent-chat";

export const AGENT_PATH = "/agent";

export function createAgentAuthRoutes<T extends AnyRoute>(parentRoute: T) {
  return [createAgentChatRoute(parentRoute)];
}
