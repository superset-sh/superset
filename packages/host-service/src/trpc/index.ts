import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { HostServiceContext } from "../types";
import { isTeardownFailureCause, type TeardownFailureCause } from "./error-types";

const t = initTRPC.context<HostServiceContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		const teardownFailure: TeardownFailureCause | undefined =
			isTeardownFailureCause(error.cause) ? error.cause : undefined;
		return {
			...shape,
			data: {
				...shape.data,
				teardownFailure,
			},
		};
	},
});

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
export type { TeardownFailureCause } from "./error-types";
