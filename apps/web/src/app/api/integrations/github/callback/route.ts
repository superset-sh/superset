import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";
import { githubApp } from "../octokit";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const stateSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
});

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

	const parsed = stateSchema.safeParse(
		JSON.parse(Buffer.from(state, "base64url").toString("utf-8")),
	);

	if (!parsed.success) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/github?error=invalid_state`,
		);
	}

	const { organizationId, userId } = parsed.data;

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
				url: `${env.NEXT_PUBLIC_WEB_URL}/api/integrations/github/jobs/initial-sync`,
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
