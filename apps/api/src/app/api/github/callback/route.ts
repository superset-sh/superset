import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq, ne } from "drizzle-orm";

import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { githubApp } from "../octokit";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/github`;

/**
 * Callback handler for GitHub App installation.
 * GitHub redirects here after the user installs/configures the app.
 */
export async function GET(request: Request) {
	if (new URL(request.url).searchParams.get("setup_action") === "cancel") {
		return Response.redirect(`${settingsUrl}?error=installation_cancelled`);
	}

	const callback = await resolveCallback(request, {
		params: ["installation_id"],
		redirect: (error) => Response.redirect(`${settingsUrl}?error=${error}`),
	});
	if (callback instanceof Response) return callback;
	const { organizationId, userId, params } = callback;
	const installationId = params.installation_id;

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
				`${settingsUrl}?error=installation_fetch_failed`,
			);
		}

		const installation = installationResult.data;

		// Extract account info - account can be User or Enterprise
		const account = installation.account;
		const accountLogin =
			account && "login" in account ? account.login : (account?.name ?? "");
		const accountType =
			account && "type" in account ? account.type : "Organization";

		// If another organization already owns this installation_id, refuse to
		// silently take it over — we'd otherwise either crash on the
		// installation_id UNIQUE constraint or sever the other org's integration
		// without notice. Ask the user to disconnect on the existing org (or
		// uninstall in GitHub, which fires our uninstall webhook) first.
		const existingForInstallation =
			await db.query.githubInstallations.findFirst({
				where: and(
					eq(githubInstallations.installationId, String(installation.id)),
					ne(githubInstallations.organizationId, organizationId),
				),
				columns: { id: true },
			});

		if (existingForInstallation) {
			return Response.redirect(`${settingsUrl}?error=already_connected`);
		}

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
			return Response.redirect(`${settingsUrl}?error=save_failed`);
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
			return Response.redirect(`${settingsUrl}?warning=sync_queue_failed`);
		}

		return Response.redirect(`${settingsUrl}?success=github_installed`);
	} catch (error) {
		console.error("[github/callback] Unexpected error:", error);
		return Response.redirect(`${settingsUrl}?error=unexpected`);
	}
}
