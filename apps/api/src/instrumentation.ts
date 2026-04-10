import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("../sentry.server.config");

		// Seed the `superset-cli` OAuth client row so first-time CLI
		// logins find it waiting in the DB. Idempotent: safe on every
		// restart and safe under concurrent Next.js workers (unique
		// constraint on `clientId` + `onConflictDoNothing`).
		try {
			const { seedSupersetCliOAuthClient } = await import(
				"@superset/db/seed-oauth-clients"
			);
			await seedSupersetCliOAuthClient();
		} catch (error) {
			// Don't crash API startup on seed failure — log and continue.
			// The CLI's first-login flow will surface a clearer error if
			// the row is actually missing.
			console.error(
				"[instrumentation] Failed to seed superset-cli OAuth client:",
				error,
			);
		}
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
