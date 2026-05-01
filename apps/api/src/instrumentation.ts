import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("../sentry.server.config");
		const { seedCliOAuthClient } = await import(
			"@superset/auth/seed-cli-oauth-client"
		);
		try {
			await seedCliOAuthClient();
		} catch (error) {
			console.error("[instrumentation] Failed to seed CLI OAuth client", error);
		}
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
