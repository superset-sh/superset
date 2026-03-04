import { db } from "@superset/db/client";
import type { GithubConfig } from "@superset/db/schema";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
	integrationConnections,
	tasks,
} from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import {
	mapGithubIssueToTask,
	resolveTaskStatusIds,
} from "../../lib/map-issue-to-task";
import { githubApp } from "../../octokit";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	installationDbId: z.string().uuid(),
	organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");

	// Skip signature verification in development (QStash can't reach localhost)
	const isDev = env.NODE_ENV === "development";

	if (!isDev) {
		if (!signature) {
			return Response.json({ error: "Missing signature" }, { status: 401 });
		}

		const isValid = await receiver
			.verify({
				body,
				signature,
				url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
			})
			.catch((error) => {
				console.error(
					"[github/initial-sync] Signature verification failed:",
					error,
				);
				return false;
			});

		if (!isValid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	}

	let bodyData: unknown;
	try {
		bodyData = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(bodyData);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const { installationDbId } = parsed.data;

	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.id, installationDbId))
		.limit(1);

	if (!installation) {
		return Response.json(
			{ error: "Installation not found", skipped: true },
			{ status: 404 },
		);
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

		console.log(`[github/initial-sync] Found ${repos.length} repositories`);

		// Upsert repositories
		for (const repo of repos) {
			await db
				.insert(githubRepositories)
				.values({
					installationId: installationDbId,
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
				`[github/initial-sync] Found ${prs.length} PRs for ${repo.full_name}`,
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
						additions: 0, // Not available in list response
						deletions: 0, // Not available in list response
						changedFiles: 0, // Not available in list response
						reviewDecision: null, // Will be updated by webhooks
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

		const { organizationId } = parsed.data;
		const connection = await db.query.integrationConnections.findFirst({
			where: and(
				eq(integrationConnections.organizationId, organizationId),
				eq(integrationConnections.provider, "github"),
			),
			columns: { config: true },
		});

		const config = connection?.config as GithubConfig | null;
		const syncIssues = config?.syncIssues !== false;

		if (syncIssues) {
			const statusIds = await resolveTaskStatusIds({ organizationId });

			if (!statusIds) {
				console.warn(
					"[github/initial-sync] Missing unstarted/completed status types, skipping issue sync",
				);
			} else {
				for (const repo of repos) {
					const issues = await octokit.paginate(
						octokit.rest.issues.listForRepo,
						{
							owner: repo.owner.login,
							repo: repo.name,
							state: "open",
							per_page: 100,
						},
					);

					// Filter out pull requests (GitHub issues API includes PRs)
					const realIssues = issues.filter(
						(issue) => !("pull_request" in issue && issue.pull_request),
					);

					console.log(
						`[github/initial-sync] Found ${realIssues.length} issues for ${repo.full_name}`,
					);

					for (const issue of realIssues) {
						const statusId =
							issue.state === "closed"
								? statusIds.completedStatusId
								: statusIds.unstartedStatusId;

						const taskData = mapGithubIssueToTask({
							issue: {
								id: issue.id,
								number: issue.number,
								title: issue.title,
								body: issue.body,
								html_url: issue.html_url,
								state: issue.state,
								assignee: issue.assignee
									? {
											login: issue.assignee.login,
											email:
												"email" in issue.assignee
													? (issue.assignee.email as string | null)
													: null,
										}
									: null,
								labels: issue.labels,
							},
							repoName: repo.name,
							statusId,
							assigneeId: null,
						});

						await db
							.insert(tasks)
							.values({
								...taskData,
								organizationId,
								creatorId: installation.connectedByUserId,
								priority: "none",
							})
							.onConflictDoUpdate({
								target: [
									tasks.organizationId,
									tasks.externalProvider,
									tasks.externalId,
								],
								set: { ...taskData, syncError: null },
							});
					}
				}
			}
		}

		// Update installation lastSyncedAt
		await db
			.update(githubInstallations)
			.set({ lastSyncedAt: new Date() })
			.where(eq(githubInstallations.id, installationDbId));

		console.log("[github/initial-sync] Sync completed successfully");
		return Response.json({ success: true });
	} catch (error) {
		console.error("[github/initial-sync] Sync failed:", error);
		return Response.json(
			{ error: error instanceof Error ? error.message : "Sync failed" },
			{ status: 500 },
		);
	}
}
