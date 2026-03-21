import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "@superset/db/schema";
import { Receiver } from "@upstash/qstash";
import { subDays } from "date-fns";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import {
	batchResolveGithubAssignees,
	mapGithubIssueToTask,
	resolveOrgTaskStatuses,
	upsertIssueTask,
} from "../../lib/issue-sync";
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

	const { installationDbId, organizationId } = parsed.data;

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

		const repos = await octokit.paginate(
			octokit.rest.apps.listReposAccessibleToInstallation,
			{ per_page: 100 },
		);

		console.log(`[github/initial-sync] Found ${repos.length} repositories`);

		for (const repo of repos) {
			await db
				.insert(githubRepositories)
				.values({
					installationId: installationDbId,
					organizationId,
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
						organizationId,
						owner: repo.owner.login,
						name: repo.name,
						fullName: repo.full_name,
						defaultBranch: repo.default_branch ?? "main",
						isPrivate: repo.private,
						updatedAt: new Date(),
					},
				});
		}

		const thirtyDaysAgo = subDays(new Date(), 30);

		for (const repo of repos) {
			const [dbRepo] = await db
				.select()
				.from(githubRepositories)
				.where(eq(githubRepositories.repoId, String(repo.id)))
				.limit(1);

			if (!dbRepo) continue;

			const prs: Awaited<ReturnType<typeof octokit.rest.pulls.list>>["data"] =
				[];

			for await (const response of octokit.paginate.iterator(
				octokit.rest.pulls.list,
				{
					owner: repo.owner.login,
					repo: repo.name,
					state: "all",
					sort: "updated",
					direction: "desc",
					per_page: 100,
				},
			)) {
				let reachedCutoff = false;
				for (const pr of response.data) {
					if (new Date(pr.updated_at) < thirtyDaysAgo) {
						reachedCutoff = true;
						break;
					}
					prs.push(pr);
				}
				if (reachedCutoff) break;
			}

			console.log(
				`[github/initial-sync] Found ${prs.length} PRs (last 30 days) for ${repo.full_name}`,
			);

			for (const pr of prs) {
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
						organizationId,
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
							organizationId: dbRepo.organizationId,
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

		// ----- Issue sync (for repos with issueSyncEnabled) -----
		const issueSyncRepos = await db
			.select()
			.from(githubRepositories)
			.where(
				and(
					eq(githubRepositories.installationId, installationDbId),
					eq(githubRepositories.issueSyncEnabled, true),
				),
			);

		if (issueSyncRepos.length > 0) {
			const { unstartedStatus, completedStatus } =
				await resolveOrgTaskStatuses(organizationId);

			if (!unstartedStatus || !completedStatus) {
				console.warn(
					"[github/initial-sync] Missing task statuses for issue sync:",
					{
						organizationId,
						hasUnstartedStatus: !!unstartedStatus,
						hasCompletedStatus: !!completedStatus,
					},
				);
			}

			for (const dbRepo of issueSyncRepos) {
				const issues: Array<{
					id: number;
					number: number;
					html_url: string;
					title: string;
					body?: string | null;
					created_at?: string;
					state: string;
					pull_request?: unknown;
					assignee?: {
						id: number;
						login: string;
						avatar_url: string;
					} | null;
					labels: Array<{ name?: string } | string>;
					closed_at?: string | null;
					updated_at: string;
				}> = [];

				for await (const response of octokit.paginate.iterator(
					octokit.rest.issues.listForRepo,
					{
						owner: dbRepo.owner,
						repo: dbRepo.name,
						state: "all",
						sort: "updated",
						direction: "desc",
						per_page: 100,
					},
				)) {
					let reachedCutoff = false;
					for (const issue of response.data) {
						if (new Date(issue.updated_at) < thirtyDaysAgo) {
							reachedCutoff = true;
							break;
						}
						// Skip PRs (GitHub's issues API includes PRs)
						if (issue.pull_request) continue;
						issues.push(issue as (typeof issues)[number]);
					}
					if (reachedCutoff) break;
				}

				console.log(
					`[github/initial-sync] Found ${issues.length} issues (last 30 days) for ${dbRepo.fullName}`,
				);

				// Batch-resolve assignees
				const uniqueAssigneeIds = [
					...new Set(
						issues
							.map((i) => i.assignee?.id)
							.filter((id): id is number => id != null),
					),
				];
				const assigneeMap = await batchResolveGithubAssignees(
					uniqueAssigneeIds,
					organizationId,
				);

				for (const issue of issues) {
					const isCompleted = issue.state === "closed";
					const statusId = isCompleted
						? completedStatus?.id
						: unstartedStatus?.id;

					if (!statusId) {
						console.warn(
							"[github/initial-sync] Skipping issue due to missing mapped status:",
							`${dbRepo.fullName}#${issue.number}`,
						);
						continue;
					}

					const assigneeUserId = issue.assignee
						? (assigneeMap.get(String(issue.assignee.id)) ?? null)
						: null;

					const mapping = mapGithubIssueToTask(issue, {
						organizationId,
						repoFullName: dbRepo.fullName,
						statusId,
						creatorId: installation.connectedByUserId,
						assigneeUserId,
						isCompleted,
					});

					await upsertIssueTask(mapping);
				}
			}
		}

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
