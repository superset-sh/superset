import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { getAuthHeaders } from "@/lib/trpc";
import type { AgentAppRouter } from "@superbuilder/features-agent-server/trpc-router";

const AGENT_URL =
  import.meta.env.VITE_AGENT_SERVER_URL ?? "http://localhost:3003";

/** agent-server 전용 tRPC vanilla client
 * NOTE: agent-server는 zod v3, features-app은 zod v4를 사용하여
 * tRPC 라우터 타입이 'never'로 추론됨. agent-server가 zod v4로 마이그레이션될 때까지
 * any 캐스팅으로 우회.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const agentTrpc: any = createTRPCClient<AgentAppRouter>({
  links: [
    httpBatchLink({
      url: `${AGENT_URL}/trpc`,
      headers: getAuthHeaders,
    }),
  ],
});
