import type { AppRouter } from "@superset/host-service/trpc";
import { createTRPCReact } from "@trpc/react-query";

export const workspaceTrpc = createTRPCReact<AppRouter>();
