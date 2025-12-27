import { env } from "../env.main";

let sentryInitialized = false;

export async function initSentry(): Promise<void> {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		// Dynamic import to avoid bundler issues
		const Sentry = await import("@sentry/electron/main");

		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0.1,
			sendDefaultPii: false,
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in main process");
	} catch (error) {
		console.error("[sentry] Failed to initialize:", error);
	}
}
