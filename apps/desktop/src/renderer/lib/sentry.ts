import { SENTRY_IGNORE_ERRORS } from "@superset/shared/sentry";
import { env } from "../env.renderer";

let sentryInitialized = false;

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
				return event;
			},
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in renderer process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in renderer:", error);
	}
}
