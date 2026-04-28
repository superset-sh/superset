import * as Sentry from "@sentry/node";

export interface InitHostServiceSentryOptions {
	dsn?: string;
	environment?: string;
	release?: string;
	tracesSampleRate?: number;
}

export function initHostServiceSentry(
	options: InitHostServiceSentryOptions,
): boolean {
	const { dsn, environment, release, tracesSampleRate = 0.1 } = options;
	if (!dsn) return false;

	Sentry.init({
		dsn,
		environment,
		release,
		tracesSampleRate,
		sendDefaultPii: false,
	});

	return true;
}

export function captureHostServiceException(error: unknown): void {
	Sentry.captureException(error);
}
