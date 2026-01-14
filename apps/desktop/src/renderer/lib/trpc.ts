import type { AppRouter } from "@superset/trpc";
import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";

/**
 * HTTP API tRPC client for communicating with the Superset API.
 * Uses bearer auth and talks to NEXT_PUBLIC_API_URL.
 * For Electron IPC communication, use `electronTrpc` instead.
 */
export const trpc = createTRPCReact<AppRouter>();
export type RouterOutputs = inferRouterOutputs<AppRouter>;
