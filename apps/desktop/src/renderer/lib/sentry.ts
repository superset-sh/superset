import * as Sentry from "@sentry/electron/renderer";
import { env } from "../env.renderer";

export function initSentry(): void {
	if (!env.SENTRY_DSN_DESKTOP) {
		return;
	}

	Sentry.init({
		dsn: env.SENTRY_DSN_DESKTOP,
		environment: env.NODE_ENV,
		tracesSampleRate: env.NODE_ENV === "development" ? 1.0 : 0.1,
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0,
	});
}
