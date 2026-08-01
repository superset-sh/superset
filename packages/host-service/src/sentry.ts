import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(options: { organizationId?: string }): void {
	if (initialized) return;
	const dsn = process.env.SENTRY_DSN;
	if (!dsn) return;
	Sentry.init({
		dsn,
		tracesSampleRate: 0,
		// safety.ts keeps the process alive through uncaught exceptions; Sentry
		// must capture them without re-introducing the exit.
		integrations: [
			Sentry.onUncaughtExceptionIntegration({
				exitEvenIfOtherHandlersAreRegistered: false,
			}),
		],
		initialScope: {
			tags: {
				service: "host-service",
				...(options.organizationId
					? { organization_id: options.organizationId }
					: {}),
			},
		},
	});
	initialized = true;
}

export async function captureFatalStartupError(error: unknown): Promise<void> {
	if (!initialized) return;
	Sentry.captureException(error);
	try {
		await Sentry.flush(2_000);
	} catch {
		// Best-effort — the process is exiting either way.
	}
}
