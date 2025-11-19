import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "main/lib/trpc/routers";

// Create tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();
