import { createTRPCReact } from "@trpc/react-query";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { AppRouter } from "./routers";

function structuredCause(cause: unknown): Record<string, unknown> | undefined {
	if (
		cause &&
		typeof cause === "object" &&
		typeof (cause as { kind?: unknown }).kind === "string"
	) {
		// Rebuild as a plain object: tRPC wraps non-Error causes in an
		// UnknownCauseError whose custom fields superjson would otherwise drop.
		return { ...(cause as Record<string, unknown>) };
	}
	return undefined;
}

/**
 * Core tRPC initialization
 * This provides the base router and procedure builders used by all routers
 */
const t = initTRPC.context<TrpcContext>().create({
	transformer: superjson,
	isServer: true,
	// tRPC strips `cause` during serialization; pass kind-discriminated causes
	// through so the renderer can branch on them instead of parsing messages.
	errorFormatter({ shape, error }) {
		const cause = structuredCause(error.cause);
		return {
			...shape,
			data: {
				...shape.data,
				...(cause ? { cause } : {}),
			},
		};
	},
});

/**
 * Middleware that reports unhandled errors to Sentry.
 *
 * Contract: expected domain states are translated by routers/adapters into
 * non-500 TRPCErrors before they get here. Anything still
 * INTERNAL_SERVER_ERROR at this boundary is a bug and is always reported —
 * fix the missing translation at the throw site, never add a filter here.
 */
const sentryMiddleware = t.middleware(async ({ next, path, type }) => {
	const result = await next();

	if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
		const error = result.error;
		const originalError = error.cause instanceof Error ? error.cause : error;

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

	return result;
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure.use(sentryMiddleware);
export const trpc = createTRPCReact<AppRouter>();
