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

/**
 * Middleware that captures errors with Sentry
 */
const sentryMiddleware = t.middleware(async ({ next, path, type }) => {
	const result = await next();

	if (!result.ok) {
		try {
			const Sentry = await import("@sentry/electron/main");
			const error = result.error;

			// Get the original error if it's wrapped in a TRPCError
			const originalError = error.cause instanceof Error ? error.cause : error;

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

	return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(sentryMiddleware);
export const trpc = createTRPCReact<AppRouter>();
