import * as Sentry from "@sentry/electron/main";
import { app } from "electron";

export function initSentry(): void {
	const dsn = process.env.SENTRY_DSN_DESKTOP;

	if (!dsn) {
		return;
	}

	Sentry.init({
		dsn,
		environment: process.env.NODE_ENV || "production",
		release: `superset-desktop@${app.getVersion()}`,
		tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
		sendDefaultPii: false,
	});
}
