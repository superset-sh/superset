import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		// Load .env from monorepo root before importing modules that validate env vars
		if (process.env.NODE_ENV !== "production") {
			const { join } = await import("node:path");
			const { config: dotenvConfig } = await import("dotenv");
			dotenvConfig({ path: join(process.cwd(), "../../.env"), override: true });
		}
		await import("../sentry.server.config");
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
