import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { HostServiceContext } from "../types";

const t = initTRPC
	.context<HostServiceContext>()
	.create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
	if (!ctx.isAuthenticated) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Invalid or missing authentication token.",
		});
	}
	return next({ ctx });
});

export type { AppRouter } from "./router";
