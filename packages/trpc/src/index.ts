// Root router and types
export type { AppRouter, RouterInputs, RouterOutputs } from "./root";
export { appRouter, createCaller } from "./root";

// tRPC utilities
export {
	adminProcedure,
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "./trpc";

// Admin insight registry (canonical dashboard tiles)
export type { AdminInsightKey } from "./router/analytics/insight-registry";
export { ADMIN_INSIGHTS } from "./router/analytics/insight-registry";
