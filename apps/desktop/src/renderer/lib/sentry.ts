import { SENTRY_IGNORE_ERRORS } from "@superset/shared/sentry";
import { createSentryEventThrottle } from "@superset/shared/sentry-throttle";
import { env } from "../env.renderer";

let sentryInitialized = false;

// Shared across the process: the point is to notice a repeat, which needs one
// instance rather than one per call.
const throttleRepeats = createSentryEventThrottle();

export async function initSentry(): Promise<void> {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		// Dynamic import to avoid bundler issues
		const Sentry = await import("@sentry/electron/renderer");

		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0,
			ignoreErrors: SENTRY_IGNORE_ERRORS,
			// tRPC failures are reported by the main-process middleware with full
			// server context; renderer copies (unhandled query/mutation promises)
			// duplicate them with worse stacks.
			beforeSend(event, hint) {
				const original = hint.originalException;
				if (original instanceof Error && original.name === "TRPCClientError") {
					return null;
				}
				return throttleRepeats(event);
			},
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in renderer process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in renderer:", error);
	}
}
