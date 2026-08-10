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
		beforeSend(event) {
			const exception = event.exception?.values?.[0];
			if (exception?.type === "TunnelLifecycleError") return null;
			// Client hung up during the async auth that runs before the WS
			// handshake: Bun's node:ws shim then calls server.upgrade() with the
			// already-released Request and throws. The client is gone either way.
			if (exception?.value === "upgrade requires a Request object") return null;
			return event;
		},
		integrations: [
			Sentry.onUncaughtExceptionIntegration({
				exitEvenIfOtherHandlersAreRegistered: false,
			}),
		],
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
