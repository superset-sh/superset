import * as Sentry from "@sentry/electron/renderer";
import { env } from "../env.renderer";

let sentryInitialized = false;

export function initSentry(): void {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}

	try {
		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			tracesSampleRate: 0.1,
			replaysSessionSampleRate: 0.1,
			replaysOnErrorSampleRate: 1.0,
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in renderer process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in renderer:", error);
	}
}
