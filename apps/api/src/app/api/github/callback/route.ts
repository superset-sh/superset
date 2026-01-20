import { db } from "@superset/db/client";
import { githubInstallations, members } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";
import { githubApp } from "../octokit";

const qstash = new Client({ token: env.QSTASH_TOKEN });

/**
 * Callback handler for GitHub App installation.
 * GitHub redirects here after the user installs/configures the app.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const installationId = url.searchParams.get("installation_id");
	const setupAction = url.searchParams.get("setup_action");
	const state = url.searchParams.get("state");

	if (setupAction === "cancel") {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=installation_cancelled`,
		);
	}

	if (!installationId || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=missing_params`,
		);
	}

	// Verify signed state (prevents forgery)
	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=invalid_state`,
		);
	}

	const { organizationId, userId } = stateData;

	// Re-verify membership at callback time (defense-in-depth)
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		console.error("[github/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=unauthorized`,
		);
	}

	try {
		const octokit = await githubApp.getInstallationOctokit(
			Number(installationId),
		);

		const installationResult = await octokit
			.request("GET /app/installations/{installation_id}", {
				installation_id: Number(installationId),
			})
			.catch((error: Error) => {
				console.error("[github/callback] Failed to fetch installation:", error);
				return null;
			});

		if (!installationResult) {
			return Response.redirect(
				`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=installation_fetch_failed`,
			);
		}

		const installation = installationResult.data;

		// Extract account info - account can be User or Enterprise
		const account = installation.account;
		const accountLogin =
			account && "login" in account ? account.login : (account?.name ?? "");
		const accountType =
			account && "type" in account ? account.type : "Organization";

		// Save the installation to our database
		const [savedInstallation] = await db
			.insert(githubInstallations)
			.values({
				organizationId,
				connectedByUserId: userId,
				installationId: String(installation.id),
				accountLogin,
				accountType,
				permissions: installation.permissions as Record<string, string>,
			})
			.onConflictDoUpdate({
				target: [githubInstallations.organizationId],
				set: {
					connectedByUserId: userId,
					installationId: String(installation.id),
					accountLogin,
					accountType,
					permissions: installation.permissions as Record<string, string>,
					suspended: false,
					suspendedAt: null, // Clear suspension if reinstalling
					updatedAt: new Date(),
				},
			})
			.returning();

		if (!savedInstallation) {
			return Response.redirect(
				`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=save_failed`,
			);
		}

		// Queue initial sync job
		try {
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
				body: {
					installationDbId: savedInstallation.id,
					organizationId,
				},
				retries: 3,
			});
		} catch (error) {
			console.error(
				"[github/callback] Failed to queue initial sync job:",
				error,
			);
			return Response.redirect(
				`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?warning=sync_queue_failed`,
			);
		}

		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?success=github_installed`,
		);
	} catch (error) {
		console.error("[github/callback] Unexpected error:", error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=unexpected`,
		);
	}
}
