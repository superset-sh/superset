/**
 * tRPC Client Configuration
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { TOKEN_STORAGE_KEY } from "@superbuilder/features-client/core/auth";
import { getSessionHeaders } from "@superbuilder/features-client/core/logger/client";
import type { AppRouter } from "@superbuilder/features-server/app-router";

import { env } from "./env";

// 공유 tRPC Context에서 re-export
export { TRPCProvider, useTRPC, useTRPCClient } from "@superbuilder/features-client/trpc-client";

export const API_URL = env.VITE_API_URL ?? "http://localhost:3002";
const TRPC_URL = `${API_URL}/trpc`;

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    const token = raw ? JSON.parse(raw) : null;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore parse errors
  }

  Object.assign(headers, getSessionHeaders());

  return headers;
}

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      headers: getAuthHeaders,
    }),
  ],
});

export function createTRPCQueryClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: TRPC_URL,
        headers: getAuthHeaders,
      }),
    ],
  });
}
