import type { AppRouter } from "@superset/trpc";
import { createTRPCReact } from "@trpc/react-query";

/**
 * tRPC React client for calling the Superset API directly over HTTP.
 */
export const trpc = createTRPCReact<AppRouter>();
