import type * as SentryMain from "@sentry/electron/main";
import { app } from "electron";
import { env } from "../env.main";

let sentryInitialized = false;
let sentryModule: typeof import("@sentry/electron/main") | undefined;
let sentryCaptureFailed = false;

function isSentryEnabled(): boolean {
	return (
		env.NODE_ENV === "production" && app.isPackaged && !!env.SENTRY_DSN_DESKTOP
	);
}

async function getSentryMain(): Promise<
	typeof import("@sentry/electron/main") | undefined
> {
	if (sentryModule) return sentryModule;

	try {
		// Dynamic import to avoid bundler issues
		sentryModule = await import("@sentry/electron/main");
		return sentryModule;
	} catch (error) {
		console.error("[sentry] Failed to load module:", error);
		return;
	}
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export async function initSentry(): Promise<void> {
	if (sentryInitialized) return;

	if (!isSentryEnabled()) {
		if (
			env.NODE_ENV === "production" &&
			app.isPackaged &&
			!env.SENTRY_DSN_DESKTOP
		) {
			console.warn("[sentry] Disabled: SENTRY_DSN_DESKTOP is not set");
		}
		return;
	}

	try {
		const Sentry = await getSentryMain();
		if (!Sentry) return;

		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			release: `desktop@${app.getVersion()}`,
			tracesSampleRate: 0.1,
			sendDefaultPii: false,
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in main process");
	} catch (error) {
		console.error("[sentry] Failed to initialize:", error);
	}
}

export async function captureSentryException(
	error: unknown,
	context?: Parameters<typeof SentryMain.captureException>[1],
): Promise<void> {
	const normalizedError = toError(error);

	try {
		await initSentry();
		if (!sentryInitialized) return;
		const Sentry = await getSentryMain();
		if (!Sentry) return;
		Sentry.captureException(normalizedError, context);
	} catch (captureError) {
		if (sentryCaptureFailed) return;
		sentryCaptureFailed = true;
		console.error("[sentry] Failed to capture exception:", captureError);
	}
}
