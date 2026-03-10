import { createTRPCClient, httpBatchLink } from "@superbuilder/features-client/trpc-client";
import { getAuthHeaders } from "@/lib/trpc";
import type { AgentAppRouter } from "../../../../../agent-server/src/trpc/router";

const AGENT_URL =
  import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:3003";

/** agent-server 전용 tRPC vanilla client */
export const agentTrpc = createTRPCClient<AgentAppRouter>({
  links: [
    httpBatchLink({
      url: `${AGENT_URL}/trpc`,
      headers: getAuthHeaders,
    }),
  ],
});
