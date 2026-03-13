import type { AppRouter } from "@superset/host-service";
import { createTRPCReact } from "@trpc/react-query";

/**
 * tRPC React client for workspace-level host service communication.
 * Each workspace connects to its org's host service over HTTP.
 * Used for reads: git.status, github.getUser, health.info, etc.
 */
export const workspaceTrpc = createTRPCReact<AppRouter>();
