import * as Sentry from "@sentry/nextjs";
import { logBootSummary } from "./lib/boot-summary";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("../sentry.server.config");
		logBootSummary();
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
