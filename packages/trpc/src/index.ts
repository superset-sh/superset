// Root router and types
export type { AppRouter, RouterInputs, RouterOutputs } from "./root";
export { appRouter, createCaller } from "./root"; // tRPC utilities
export type { AgentCaller, TRPCContext } from "./trpc";
export {
	adminProcedure,
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "./trpc";
