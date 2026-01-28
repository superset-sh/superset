import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { Webhooks } from "@octokit/webhooks";
import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";

export const webhooks = new Webhooks({ secret: env.GH_WEBHOOK_SECRET });

// Installation events
webhooks.on(
	"installation.deleted",
	async ({ payload }: EmitterWebhookEvent<"installation.deleted">) => {
		console.log(
			"[github/webhook] Installation deleted:",
			payload.installation.id,
		);
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

// Repository events
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
					repoId: String(repo.id),
					owner: owner ?? "",
					name: name ?? repo.name,
					fullName: repo.full_name,
					defaultBranch: "main",
					isPrivate: repo.private,
				})
				.onConflictDoNothing();
		}
	},
);

webhooks.on(
	"installation_repositories.removed",
	async ({
		payload,
	}: EmitterWebhookEvent<"installation_repositories.removed">) => {
		for (const repo of payload.repositories_removed) {
			console.log("[github/webhook] Repository removed:", repo.full_name);
			await db
				.delete(githubRepositories)
				.where(eq(githubRepositories.repoId, String(repo.id)));
		}
	},
);

// Pull request events
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

		await db
			.insert(githubPullRequests)
			.values({
				repositoryId: repo.id,
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
				checksStatus: "none", // Will be updated by check events
				mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
				closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
			})
			.onConflictDoUpdate({
				target: [githubPullRequests.repositoryId, githubPullRequests.prNumber],
				set: {
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

		await db
			.update(githubPullRequests)
			.set({
				state: pr.state,
				mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
				closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
				lastSyncedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(githubPullRequests.repositoryId, repo.id),
					eq(githubPullRequests.prNumber, pr.number),
				),
			);
	},
);

// Review events
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

		await db
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
			);
	},
);

// Check run events
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

			const checkIndex = currentChecks.findIndex(
				(c) => c.name === checkRun.name,
			);

			const newCheck = {
				name: checkRun.name,
				status: checkRun.status,
				conclusion: checkRun.conclusion,
				detailsUrl: checkRun.details_url ?? undefined,
			};

			if (checkIndex >= 0) {
				currentChecks[checkIndex] = newCheck;
			} else {
				currentChecks.push(newCheck);
			}

			// Compute checks status
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
