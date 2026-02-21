import { createTRPCReact } from "@trpc/react-query";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "./routers";
import { NotGitRepoError } from "./routers/workspaces/utils/git";

/**
 * Core tRPC initialization
 * This provides the base router and procedure builders used by all routers
 */
const t = initTRPC.create({
	transformer: superjson,
	isServer: true,
});

/**
 * Middleware that captures errors with Sentry
 */
const sentryMiddleware = t.middleware(async ({ next, path, type }) => {
	const result = await next();

	if (!result.ok) {
		// Only report unexpected server errors to Sentry.
		// Expected user-facing errors (BAD_REQUEST, NOT_FOUND, PRECONDITION_FAILED, etc.)
		// are handled by the client and don't indicate bugs.
		if (result.error.code === "INTERNAL_SERVER_ERROR") {
			const error = result.error;

			// Get the original error if it's wrapped in a TRPCError
			const originalError = error.cause instanceof Error ? error.cause : error;

			// Don't report expected user conditions to Sentry
			if (originalError instanceof NotGitRepoError) {
				return result;
			}

			try {
				const Sentry = await import("@sentry/electron/main");

				Sentry.captureException(originalError, {
					tags: {
						trpc_path: path,
						trpc_type: type,
						trpc_code: error.code,
					},
					extra: {
						trpc_message: error.message,
					},
				});
			} catch {
				// Sentry not available
			}
		}
	}

	return result;
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure.use(sentryMiddleware);
export const trpc = createTRPCReact<AppRouter>();
