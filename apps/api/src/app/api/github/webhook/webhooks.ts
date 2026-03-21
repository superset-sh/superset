import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { Webhooks } from "@octokit/webhooks";
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
	tasks,
} from "@superset/db/schema";
import { and, eq, like } from "drizzle-orm";

import { env } from "@/env";
import {
	type GitHubIssue,
	mapGithubIssueToTask,
	resolveGithubAssignee,
	resolveOrgTaskStatuses,
	upsertIssueTask,
} from "../lib/issue-sync";

export const webhooks = new Webhooks({ secret: env.GH_WEBHOOK_SECRET });

webhooks.on(
	"installation.deleted",
	async ({ payload }: EmitterWebhookEvent<"installation.deleted">) => {
		console.log(
			"[github/webhook] Installation deleted:",
			payload.installation.id,
		);

		const [installation] = await db
			.select()
			.from(githubInstallations)
			.where(
				eq(githubInstallations.installationId, String(payload.installation.id)),
			)
			.limit(1);

		if (installation) {
			await db
				.delete(tasks)
				.where(
					and(
						eq(tasks.organizationId, installation.organizationId),
						eq(tasks.externalProvider, "github"),
					),
				);
		}

		await db
			.delete(githubInstallations)
			.where(
				eq(githubInstallations.installationId, String(payload.installation.id)),
			);
	},
);

webhooks.on(
	"installation.suspend",
	async ({ payload }: EmitterWebhookEvent<"installation.suspend">) => {
		console.log(
			"[github/webhook] Installation suspended:",
			payload.installation.id,
		);
		await db
			.update(githubInstallations)
			.set({ suspended: true, suspendedAt: new Date() })
			.where(
				eq(githubInstallations.installationId, String(payload.installation.id)),
			);
	},
);

webhooks.on(
	"installation.unsuspend",
	async ({ payload }: EmitterWebhookEvent<"installation.unsuspend">) => {
		console.log(
			"[github/webhook] Installation unsuspended:",
			payload.installation.id,
		);
		await db
			.update(githubInstallations)
			.set({ suspended: false, suspendedAt: null })
			.where(
				eq(githubInstallations.installationId, String(payload.installation.id)),
			);
	},
);

webhooks.on(
	"installation_repositories.added",
	async ({
		payload,
	}: EmitterWebhookEvent<"installation_repositories.added">) => {
		const [installation] = await db
			.select()
			.from(githubInstallations)
			.where(
				eq(githubInstallations.installationId, String(payload.installation.id)),
			)
			.limit(1);

		if (!installation) {
			console.warn(
				"[github/webhook] Installation not found:",
				payload.installation.id,
			);
			return;
		}

		for (const repo of payload.repositories_added) {
			const [owner, name] = repo.full_name.split("/");
			console.log("[github/webhook] Repository added:", repo.full_name);

			await db
				.insert(githubRepositories)
				.values({
					installationId: installation.id,
					organizationId: installation.organizationId,
					repoId: String(repo.id),
					owner: owner ?? "",
					name: name ?? repo.name,
					fullName: repo.full_name,
					defaultBranch: "main",
					isPrivate: repo.private,
				})
				.onConflictDoUpdate({
					target: [githubRepositories.repoId],
					set: {
						installationId: installation.id,
						organizationId: installation.organizationId,
						owner: owner ?? "",
						name: name ?? repo.name,
						fullName: repo.full_name,
						isPrivate: repo.private,
						updatedAt: new Date(),
					},
				});
		}
	},
);

webhooks.on(
	"installation_repositories.removed",
	async ({
		payload,
	}: EmitterWebhookEvent<"installation_repositories.removed">) => {
		const [installation] = await db
			.select()
			.from(githubInstallations)
			.where(
				eq(githubInstallations.installationId, String(payload.installation.id)),
			)
			.limit(1);

		for (const repo of payload.repositories_removed) {
			console.log("[github/webhook] Repository removed:", repo.full_name);

			if (installation) {
				await db
					.delete(tasks)
					.where(
						and(
							eq(tasks.organizationId, installation.organizationId),
							eq(tasks.externalProvider, "github"),
							like(tasks.slug, `gh:${repo.full_name}#%`),
						),
					);
			}

			await db
				.delete(githubRepositories)
				.where(eq(githubRepositories.repoId, String(repo.id)));
		}
	},
);

function upsertPullRequest(
	repo: { id: string; organizationId: string },
	pr: {
		number: number;
		node_id: string;
		head: { ref: string; sha: string };
		base: { ref: string };
		title: string;
		html_url: string;
		user: { login?: string; avatar_url?: string } | null;
		state: string;
		draft?: boolean;
		additions?: number;
		deletions?: number;
		changed_files?: number;
		merged_at: string | null;
		closed_at: string | null;
	},
) {
	return db
		.insert(githubPullRequests)
		.values({
			repositoryId: repo.id,
			organizationId: repo.organizationId,
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
			additions: pr.additions ?? 0,
			deletions: pr.deletions ?? 0,
			changedFiles: pr.changed_files ?? 0,
			checksStatus: "none",
			mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
			closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
		})
		.onConflictDoUpdate({
			target: [githubPullRequests.repositoryId, githubPullRequests.prNumber],
			set: {
				organizationId: repo.organizationId,
				headBranch: pr.head.ref,
				headSha: pr.head.sha,
				baseBranch: pr.base.ref,
				title: pr.title,
				state: pr.state,
				isDraft: pr.draft ?? false,
				additions: pr.additions ?? 0,
				deletions: pr.deletions ?? 0,
				changedFiles: pr.changed_files ?? 0,
				mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
				closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
				lastSyncedAt: new Date(),
				updatedAt: new Date(),
			},
		});
}

webhooks.on(
	[
		"pull_request.opened",
		"pull_request.synchronize",
		"pull_request.edited",
		"pull_request.reopened",
		"pull_request.ready_for_review",
		"pull_request.converted_to_draft",
	],
	async ({
		payload,
	}: EmitterWebhookEvent<
		| "pull_request.opened"
		| "pull_request.synchronize"
		| "pull_request.edited"
		| "pull_request.reopened"
		| "pull_request.ready_for_review"
		| "pull_request.converted_to_draft"
	>) => {
		const { pull_request: pr, repository } = payload;

		const [repo] = await db
			.select()
			.from(githubRepositories)
			.where(eq(githubRepositories.repoId, String(repository.id)))
			.limit(1);

		if (!repo) {
			console.warn("[github/webhook] Repository not found:", repository.id);
			return;
		}

		console.log(
			`[github/webhook] PR ${payload.action}:`,
			`${repository.full_name}#${pr.number}`,
		);

		await upsertPullRequest(repo, pr);
	},
);

webhooks.on(
	"pull_request.closed",
	async ({ payload }: EmitterWebhookEvent<"pull_request.closed">) => {
		const { pull_request: pr, repository } = payload;

		const [repo] = await db
			.select()
			.from(githubRepositories)
			.where(eq(githubRepositories.repoId, String(repository.id)))
			.limit(1);

		if (!repo) {
			console.warn("[github/webhook] Repository not found:", repository.id);
			return;
		}

		console.log(
			"[github/webhook] PR closed:",
			`${repository.full_name}#${pr.number}`,
		);

		await upsertPullRequest(repo, pr);
	},
);

webhooks.on(
	"pull_request_review.submitted",
	async ({ payload }: EmitterWebhookEvent<"pull_request_review.submitted">) => {
		const { review, pull_request: pr, repository } = payload;

		const [repo] = await db
			.select()
			.from(githubRepositories)
			.where(eq(githubRepositories.repoId, String(repository.id)))
			.limit(1);

		if (!repo) {
			console.warn("[github/webhook] Repository not found:", repository.id);
			return;
		}

		const reviewDecision =
			review.state === "approved"
				? "APPROVED"
				: review.state === "changes_requested"
					? "CHANGES_REQUESTED"
					: null;

		if (!reviewDecision) return;

		console.log(
			`[github/webhook] PR review ${review.state}:`,
			`${repository.full_name}#${pr.number}`,
		);

		const result = await db
			.update(githubPullRequests)
			.set({
				reviewDecision,
				lastSyncedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(githubPullRequests.repositoryId, repo.id),
					eq(githubPullRequests.prNumber, pr.number),
				),
			)
			.returning({ id: githubPullRequests.id });

		if (result.length === 0) {
			console.log(
				`[github/webhook] PR not found for review, upserting:`,
				`${repository.full_name}#${pr.number}`,
			);
			await upsertPullRequest(repo, pr);
			await db
				.update(githubPullRequests)
				.set({ reviewDecision })
				.where(
					and(
						eq(githubPullRequests.repositoryId, repo.id),
						eq(githubPullRequests.prNumber, pr.number),
					),
				);
		}
	},
);

webhooks.on(
	["check_run.created", "check_run.completed", "check_run.rerequested"],
	async ({
		payload,
	}: EmitterWebhookEvent<
		"check_run.created" | "check_run.completed" | "check_run.rerequested"
	>) => {
		const { check_run: checkRun, repository } = payload;

		const [repo] = await db
			.select()
			.from(githubRepositories)
			.where(eq(githubRepositories.repoId, String(repository.id)))
			.limit(1);

		if (!repo) {
			console.warn("[github/webhook] Repository not found:", repository.id);
			return;
		}

		for (const pr of checkRun.pull_requests) {
			const [currentPr] = await db
				.select()
				.from(githubPullRequests)
				.where(
					and(
						eq(githubPullRequests.repositoryId, repo.id),
						eq(githubPullRequests.prNumber, pr.number),
					),
				)
				.limit(1);

			if (!currentPr) continue;

			const currentChecks =
				(currentPr.checks as Array<{
					name: string;
					status: string;
					conclusion: string | null;
					detailsUrl?: string;
				}>) ?? [];

			const newCheck = {
				name: checkRun.name,
				status: checkRun.status,
				conclusion: checkRun.conclusion,
				detailsUrl: checkRun.details_url ?? undefined,
			};

			const checkIndex = currentChecks.findIndex(
				(c) => c.name === checkRun.name,
			);

			if (checkIndex >= 0) {
				currentChecks[checkIndex] = newCheck;
			} else {
				currentChecks.push(newCheck);
			}

			const hasFailure = currentChecks.some(
				(c) =>
					c.conclusion === "failure" ||
					c.conclusion === "timed_out" ||
					c.conclusion === "action_required",
			);
			const hasPending = currentChecks.some((c) => c.status !== "completed");

			const checksStatus = hasFailure
				? "failure"
				: hasPending
					? "pending"
					: currentChecks.length > 0
						? "success"
						: "none";

			console.log(
				`[github/webhook] Check ${checkRun.status}/${checkRun.conclusion}:`,
				`${repository.full_name}#${pr.number} - ${checkRun.name}`,
			);

			await db
				.update(githubPullRequests)
				.set({
					checks: currentChecks,
					checksStatus,
					lastSyncedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(githubPullRequests.id, currentPr.id));
		}
	},
);

// ---------------------------------------------------------------------------
// Issue events → upsert as Superset tasks
// ---------------------------------------------------------------------------

async function upsertIssueAsTask(
	repository: { id: number; full_name: string },
	issue: GitHubIssue,
	action: string,
) {
	// Look up the DB repo
	const [repo] = await db
		.select()
		.from(githubRepositories)
		.where(eq(githubRepositories.repoId, String(repository.id)))
		.limit(1);

	if (!repo) {
		console.warn("[github/webhook] Repository not found:", repository.id);
		return;
	}

	// Guard: only sync if the repo opted in
	if (!repo.issueSyncEnabled) return;

	// Guard: GitHub fires issue events for PRs too — skip those
	if (issue.pull_request) return;

	// Look up the installation to get orgId and creatorId
	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.id, repo.installationId))
		.limit(1);

	if (!installation) {
		console.warn("[github/webhook] Installation not found for repo:", repo.id);
		return;
	}

	const organizationId = installation.organizationId;

	// Resolve status
	const { unstartedStatus, completedStatus } =
		await resolveOrgTaskStatuses(organizationId);

	const isCompleted = issue.state === "closed" || action === "closed";
	const statusId = isCompleted ? completedStatus?.id : unstartedStatus?.id;

	if (!statusId) {
		console.warn(
			"[github/webhook] No matching task status found for org:",
			organizationId,
		);
		return;
	}

	// Resolve assignee
	const assigneeUserId = issue.assignee
		? await resolveGithubAssignee(issue.assignee.id, organizationId)
		: null;

	console.log(
		`[github/webhook] Issue ${action}:`,
		`${repository.full_name}#${issue.number}`,
	);

	const mapping = mapGithubIssueToTask(issue, {
		organizationId,
		repoFullName: repo.fullName,
		statusId,
		creatorId: installation.connectedByUserId,
		assigneeUserId,
		isCompleted,
	});

	await upsertIssueTask(mapping);
}

webhooks.on(
	[
		"issues.opened",
		"issues.edited",
		"issues.closed",
		"issues.reopened",
		"issues.assigned",
		"issues.unassigned",
		"issues.labeled",
		"issues.unlabeled",
	],
	async ({
		payload,
	}: EmitterWebhookEvent<
		| "issues.opened"
		| "issues.edited"
		| "issues.closed"
		| "issues.reopened"
		| "issues.assigned"
		| "issues.unassigned"
		| "issues.labeled"
		| "issues.unlabeled"
	>) => {
		await upsertIssueAsTask(payload.repository, payload.issue, payload.action);
	},
);

webhooks.on(
	"issues.deleted",
	async ({ payload }: EmitterWebhookEvent<"issues.deleted">) => {
		const [repo] = await db
			.select()
			.from(githubRepositories)
			.where(eq(githubRepositories.repoId, String(payload.repository.id)))
			.limit(1);

		if (!repo || !repo.issueSyncEnabled) return;

		const [installation] = await db
			.select()
			.from(githubInstallations)
			.where(eq(githubInstallations.id, repo.installationId))
			.limit(1);

		if (!installation) return;

		console.log(
			"[github/webhook] Issue deleted:",
			`${payload.repository.full_name}#${payload.issue.number}`,
		);

		await db
			.update(tasks)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(tasks.organizationId, installation.organizationId),
					eq(tasks.externalProvider, "github"),
					eq(tasks.externalId, String(payload.issue.id)),
				),
			);
	},
);
