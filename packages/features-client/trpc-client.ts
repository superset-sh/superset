import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@superbuilder/features-server/app-router";

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

// Re-export from @trpc/client so consumers use the same copy
// (bun resolves different copies per package — using the same source prevents nominal type mismatches)
export { createTRPCClient, httpBatchLink } from "@trpc/client";
