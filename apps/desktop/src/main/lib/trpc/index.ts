import { createTRPCReact } from "@trpc/react-query";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "./routers";

/**
 * Core tRPC initialization
 * This provides the base router and procedure builders used by all routers
 */
const t = initTRPC.create({
	transformer: superjson,
	isServer: true,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const trpc = createTRPCReact<AppRouter>();
