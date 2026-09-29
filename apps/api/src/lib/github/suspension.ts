import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { githubApp } from "@/app/api/github/octokit";

export type SuspendOutcome = "suspended" | "gone" | "rate_limited" | "failed";

/**
 * Suspends the App on one installation. GitHub then delivers no webhooks and
 * issues no tokens for it, so the organization's traffic stops at GitHub.
 */
export async function suspendInstallation(installation: {
	id: string;
	installationId: string;
}): Promise<SuspendOutcome> {
	const installationId = Number(installation.installationId);
	try {
		await githubApp.octokit.request(
			"PUT /app/installations/{installation_id}/suspended",
			{ installation_id: installationId },
		);
	} catch (error) {
		const status = (error as { status?: number }).status;
		if (status === 404) {
			// Uninstalled at GitHub without the webhook reaching us.
			await db
				.delete(githubInstallations)
				.where(eq(githubInstallations.id, installation.id));
			return "gone";
		}
		if (status === 429 || isRateLimitExhausted(error)) return "rate_limited";
		console.error(
			`[github/suspension] suspend failed for installation ${installationId}:`,
			error,
		);
		return "failed";
	}
	await db
		.update(githubInstallations)
		.set({ suspended: true, suspendedAt: new Date() })
		.where(eq(githubInstallations.id, installation.id));
	return "suspended";
}

/**
 * Whether the App itself suspended this installation. Asked of GitHub rather
 * than the row, because the install callback clears the row's flag while
 * GitHub still holds the suspension. A suspension the account's own admins
 * placed has a User actor, not a Bot, and is theirs to lift. A row marked
 * suspended that GitHub delivers for already is corrected on the way.
 */
export async function appPlacedSuspension(installation: {
	id: string;
	installationId: string;
}): Promise<boolean> {
	const { data: remote } = await githubApp.octokit.request(
		"GET /app/installations/{installation_id}",
		{ installation_id: Number(installation.installationId) },
	);
	if (!remote.suspended_at) {
		await db
			.update(githubInstallations)
			.set({ suspended: false, suspendedAt: null })
			.where(eq(githubInstallations.id, installation.id));
		return false;
	}
	return remote.suspended_by?.type === "Bot";
}

export async function liftSuspension(installation: {
	id: string;
	installationId: string;
}): Promise<boolean> {
	if (!(await appPlacedSuspension(installation))) return false;
	await githubApp.octokit.request(
		"DELETE /app/installations/{installation_id}/suspended",
		{ installation_id: Number(installation.installationId) },
	);
	await db
		.update(githubInstallations)
		.set({ suspended: false, suspendedAt: null })
		.where(eq(githubInstallations.id, installation.id));
	return true;
}

function isRateLimitExhausted(error: unknown): boolean {
	const failure = error as {
		status?: number;
		response?: { headers?: Record<string, string> };
	};
	return (
		failure.status === 403 &&
		failure.response?.headers?.["x-ratelimit-remaining"] === "0"
	);
}
