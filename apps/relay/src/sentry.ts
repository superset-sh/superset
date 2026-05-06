import * as Sentry from "@sentry/node";
import { env } from "./env";

let initialized = false;

export function initSentry(): void {
	if (initialized) return;
	if (!env.RELAY_SENTRY_DSN) return;
	Sentry.init({
		dsn: env.RELAY_SENTRY_DSN,
		release: process.env.FLY_IMAGE_REF,
		environment: process.env.FLY_APP_NAME ?? "relay-local",
		tracesSampleRate: 0,
		initialScope: {
			tags: {
				region: env.FLY_REGION,
				machine_id: env.FLY_MACHINE_ID,
			},
		},
	});
	initialized = true;
}

export function captureSentryException(
	error: unknown,
	context?: Record<string, unknown>,
): void {
	if (!initialized) return;
	Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function captureSentryMessage(
	message: string,
	level: "info" | "warning" | "error" = "warning",
	context?: Record<string, unknown>,
): void {
	if (!initialized) return;
	Sentry.captureMessage(message, {
		level,
		...(context ? { extra: context } : {}),
	});
}
