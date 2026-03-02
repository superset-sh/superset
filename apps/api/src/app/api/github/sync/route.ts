import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { githubApp } from "../octokit";

const bodySchema = z.object({
	organizationId: z.string().uuid(),
});

/**
 * Manual sync endpoint for development.
 * In production, use the QStash-triggered initial-sync job.
 */
export async function POST(request: Request) {
	// Only allow in development
	if (env.NODE_ENV !== "development") {
		return Response.json(
			{ error: "This endpoint is only available in development" },
			{ status: 403 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { organizationId } = parsed.data;

	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId))
		.limit(1);

	if (!installation) {
		return Response.json({ error: "Installation not found" }, { status: 404 });
	}

	try {
		const octokit = await githubApp.getInstallationOctokit(
			Number(installation.installationId),
		);

		// Fetch all repositories
		const repos = await octokit.paginate(
			octokit.rest.apps.listReposAccessibleToInstallation,
			{ per_page: 100 },
		);

		console.log(`[github/sync] Found ${repos.length} repositories`);

		// Upsert repositories
		for (const repo of repos) {
			await db
				.insert(githubRepositories)
				.values({
					installationId: installation.id,
					repoId: String(repo.id),
					owner: repo.owner.login,
					name: repo.name,
					fullName: repo.full_name,
					defaultBranch: repo.default_branch ?? "main",
					isPrivate: repo.private,
				})
				.onConflictDoUpdate({
					target: [githubRepositories.repoId],
					set: {
						owner: repo.owner.login,
						name: repo.name,
						fullName: repo.full_name,
						defaultBranch: repo.default_branch ?? "main",
						isPrivate: repo.private,
						updatedAt: new Date(),
					},
				});
		}

		// Fetch PRs for each repository
		for (const repo of repos) {
			const [dbRepo] = await db
				.select()
				.from(githubRepositories)
				.where(eq(githubRepositories.repoId, String(repo.id)))
				.limit(1);

			if (!dbRepo) continue;

			const prs = await octokit.paginate(octokit.rest.pulls.list, {
				owner: repo.owner.login,
				repo: repo.name,
				state: "open",
				per_page: 100,
			});

			console.log(
				`[github/sync] Found ${prs.length} PRs for ${repo.full_name}`,
			);

			for (const pr of prs) {
				// Get CI checks
				const { data: checksData } = await octokit.rest.checks.listForRef({
					owner: repo.owner.login,
					repo: repo.name,
					ref: pr.head.sha,
				});

				const checks = checksData.check_runs.map(
					(c: (typeof checksData.check_runs)[number]) => ({
						name: c.name,
						status: c.status,
						conclusion: c.conclusion,
						detailsUrl: c.details_url ?? undefined,
					}),
				);

				// Compute checks status
				let checksStatus = "none";
				if (checks.length > 0) {
					const hasFailure = checks.some(
						(c: {
							name: string;
							status: string;
							conclusion: string | null;
							detailsUrl?: string;
						}) => c.conclusion === "failure" || c.conclusion === "timed_out",
					);
					const hasPending = checks.some(
						(c: {
							name: string;
							status: string;
							conclusion: string | null;
							detailsUrl?: string;
						}) => c.status !== "completed",
					);

					checksStatus = hasFailure
						? "failure"
						: hasPending
							? "pending"
							: "success";
				}

				await db
					.insert(githubPullRequests)
					.values({
						repositoryId: dbRepo.id,
						prNumber: pr.number,
						nodeId: pr.node_id,
						headBranch: pr.head.ref,
						headSha: pr.head.sha,
						baseBranch: pr.base.ref,
						title: pr.title,
						url: pr.html_url,
						authorLogin: pr.user?.login ?? "unknown",
						authorAvatarUrl: pr.user?.avatar_url ?? null,
						state: pr.state,
						isDraft: pr.draft ?? false,
						additions: 0,
						deletions: 0,
						changedFiles: 0,
						reviewDecision: null,
						checksStatus,
						checks,
						mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
						closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
					})
					.onConflictDoUpdate({
						target: [
							githubPullRequests.repositoryId,
							githubPullRequests.prNumber,
						],
						set: {
							headSha: pr.head.sha,
							title: pr.title,
							state: pr.state,
							isDraft: pr.draft ?? false,
							checksStatus,
							checks,
							mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
							closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
							lastSyncedAt: new Date(),
							updatedAt: new Date(),
						},
					});
			}
		}

		// Update installation lastSyncedAt
		await db
			.update(githubInstallations)
			.set({ lastSyncedAt: new Date() })
			.where(eq(githubInstallations.id, installation.id));

		console.log("[github/sync] Sync completed successfully");
		return Response.json({
			success: true,
			repositoriesCount: repos.length,
		});
	} catch (error) {
		console.error("[github/sync] Sync failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Sync failed" },
			{ status: 500 },
		);
	}
}
