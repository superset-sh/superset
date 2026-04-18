import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { HostServiceContext } from "../types";
import {
	isProjectNotSetupCause,
	isTeardownFailureCause,
	type ProjectNotSetupCause,
	type TeardownFailureCause,
} from "./error-types";

const t = initTRPC.context<HostServiceContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		// tRPC wraps non-Error `cause` values via getCauseFromUnknown() into a
		// synthetic UnknownCauseError that carries the original fields as own
		// properties. Superjson then serializes it as an Error (message/stack
		// only) and drops our fields. Re-build a plain object so the wire
		// format keeps `kind`, `exitCode`, `outputTail`, etc.
		const teardownFailure: TeardownFailureCause | undefined =
			isTeardownFailureCause(error.cause)
				? {
						kind: "TEARDOWN_FAILED",
						exitCode: error.cause.exitCode,
						signal: error.cause.signal,
						timedOut: error.cause.timedOut,
						outputTail: error.cause.outputTail,
					}
				: undefined;
		const projectNotSetup: ProjectNotSetupCause | undefined =
			isProjectNotSetupCause(error.cause)
				? {
						kind: "PROJECT_NOT_SETUP",
						projectId: error.cause.projectId,
					}
				: undefined;
		return {
			...shape,
			data: {
				...shape.data,
				teardownFailure,
				projectNotSetup,
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

export type {
	ProjectNotSetupCause,
	TeardownFailureCause,
} from "./error-types";
export type { AppRouter } from "./router";
