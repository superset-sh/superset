// Root router and types
export type { AppRouter, RouterInputs, RouterOutputs } from "./root";
export { appRouter, createCaller } from "./root";

// tRPC utilities
export {
	adminProcedure,
	authenticatedProcedure,
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	publicProcedure,
} from "./trpc";
