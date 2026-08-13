// Root router and types
export type { AppRouter, RouterInputs, RouterOutputs } from "./root";
export { appRouter, createCaller } from "./root";
// Admin insight registry (canonical dashboard tiles)
export type { AdminInsightKey } from "./router/analytics/insight-registry";
export {
	ADMIN_INSIGHTS,
	POSTHOG_PROJECT_URL,
} from "./router/analytics/insight-registry";
// tRPC utilities
export {
	adminProcedure,
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "./trpc";
