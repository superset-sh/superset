import { db } from "@superset/db/client";
import { githubInstallations, githubPullRequests } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { installationOctokit } from "../../../lib/sandbox/clone-token";
import { protectedProcedure, userError } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";
import {
	type PullRequestDetail,
	toChecks,
	toChecksStatus,
	toPullRequestState,
	toReviewDecision,
} from "./pull-request-shape";
import { listGithubRepositories } from "./trigger-options";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export const githubRouter = {
	getInstallation: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: {
					id: true,
					accountLogin: true,
					accountType: true,
					suspended: true,
					lastSyncedAt: true,
					createdAt: true,
				},
			});

			return installation ?? null;
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await db
				.delete(githubInstallations)
				.where(eq(githubInstallations.organizationId, input.organizationId))
				.returning({ id: githubInstallations.id });

			if (result.length === 0) {
				return { success: false, error: "No installation found" };
			}

			return { success: true };
		}),

	triggerSync: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});

			if (!installation) {
				throw userError({
					code: "NOT_FOUND",
					message: "GitHub installation not found",
					i18nKey: "serverError.integration.githubInstallationNotFound",
				});
			}

			const syncUrl = `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`;
			const syncBody = {
				installationDbId: installation.id,
				organizationId: input.organizationId,
			};

			// In development, call the sync endpoint directly (QStash can't reach localhost)
			if (env.NODE_ENV === "development") {
				fetch(syncUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(syncBody),
				}).catch((error) => {
					console.error("[github/triggerSync] Dev sync failed:", error);
				});
			} else {
				await qstash.publishJSON({
					url: syncUrl,
					body: syncBody,
					retries: 3,
				});
			}

			return { success: true };
		}),

	listRepositories: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			return listGithubRepositories(input.organizationId, ctx.session.user.id);
		}),

	listPullRequests: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repositoryId: z.string().uuid().optional(),
				state: z.enum(["open", "closed", "all"]).optional().default("open"),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// Reachable repositories only. A pull request row carries its title,
			// branch and author, so listing one from a repository the caller
			// cannot read would describe that repository to them anyway.
			const repos = await listGithubRepositories(
				input.organizationId,
				ctx.session.user.id,
			);
			const repoIds = repos
				.filter((repo) => !input.repositoryId || repo.id === input.repositoryId)
				.map((repo) => repo.id);

			if (repoIds.length === 0) {
				return [];
			}

			const conditions = [inArray(githubPullRequests.repositoryId, repoIds)];

			if (input.state !== "all") {
				conditions.push(eq(githubPullRequests.state, input.state));
			}

			return db.query.githubPullRequests.findMany({
				where: and(...conditions),
				with: {
					repository: {
						columns: {
							id: true,
							fullName: true,
							owner: true,
							name: true,
						},
					},
				},
				orderBy: [desc(githubPullRequests.updatedAt)],
				limit: 100,
			});
		}),

	listOrganizationPullRequests: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const repoIds = (
				await listGithubRepositories(input.organizationId, ctx.session.user.id)
			).map((repo) => repo.id);
			if (repoIds.length === 0) {
				return [];
			}

			return db.query.githubPullRequests.findMany({
				where: and(
					eq(githubPullRequests.organizationId, input.organizationId),
					inArray(githubPullRequests.repositoryId, repoIds),
				),
				orderBy: [desc(githubPullRequests.updatedAt)],
				limit: 100,
			});
		}),

	/**
	 * One pull request per (repository, head branch) ref for sidebar chips:
	 * an open one wins, else the most recently updated. A repository the App
	 * is not installed on has no entry; `hasInstallation` lets a client fall
	 * back to a host it can reach.
	 */
	getByBranches: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				refs: z
					.array(
						z.object({
							repoFullName: z.string().min(1),
							headBranch: z.string().min(1),
						}),
					)
					.max(500),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});
			if (!installation) {
				return { hasInstallation: false, pullRequests: [] };
			}
			if (input.refs.length === 0) {
				return { hasInstallation: true, pullRequests: [] };
			}

			const repos = await listGithubRepositories(
				input.organizationId,
				ctx.session.user.id,
			);
			const repoByFullName = new Map(
				repos.map((repo) => [repo.fullName.toLowerCase(), repo]),
			);
			const fullNameByRepoId = new Map(
				repos.map((repo) => [repo.id, repo.fullName]),
			);

			const pairs = new Map<string, { repoId: string; headBranch: string }>();
			for (const ref of input.refs) {
				const repo = repoByFullName.get(ref.repoFullName.toLowerCase());
				if (!repo) continue;
				// The table has no head-repository owner, so a fork's `main` would
				// match a checkout of this repository's default branch.
				if (ref.headBranch === repo.defaultBranch) continue;
				pairs.set(`${repo.id}\n${ref.headBranch}`, {
					repoId: repo.id,
					headBranch: ref.headBranch,
				});
			}
			if (pairs.size === 0) {
				return { hasInstallation: true, pullRequests: [] };
			}

			const rows = await db
				.select({
					repositoryId: githubPullRequests.repositoryId,
					headBranch: githubPullRequests.headBranch,
					number: githubPullRequests.prNumber,
					url: githubPullRequests.url,
					title: githubPullRequests.title,
					state: githubPullRequests.state,
					isDraft: githubPullRequests.isDraft,
					reviewDecision: githubPullRequests.reviewDecision,
					checksStatus: githubPullRequests.checksStatus,
					checks: githubPullRequests.checks,
					mergedAt: githubPullRequests.mergedAt,
					updatedAt: githubPullRequests.updatedAt,
				})
				.from(githubPullRequests)
				.where(
					and(
						eq(githubPullRequests.organizationId, input.organizationId),
						// Exact pairs, so no requested ref can be crowded out of the
						// limit by another ref's rows.
						sql`(${githubPullRequests.repositoryId}, ${githubPullRequests.headBranch}) IN (${sql.join(
							[...pairs.values()].map(
								(pair) => sql`(${pair.repoId}::uuid, ${pair.headBranch})`,
							),
							sql`, `,
						)})`,
					),
				)
				.orderBy(desc(githubPullRequests.updatedAt))
				.limit(2_000);

			// Rows arrive newest first, so the first open PR per ref is the newest
			// open one, and the first row of any state is the newest overall.
			const bestByRef = new Map<string, (typeof rows)[number]>();
			for (const row of rows) {
				const key = `${row.repositoryId}\n${row.headBranch}`;
				const existing = bestByRef.get(key);
				if (!existing || (existing.state !== "open" && row.state === "open")) {
					bestByRef.set(key, row);
				}
			}

			return {
				hasInstallation: true,
				pullRequests: [...bestByRef.values()].map((row) => ({
					repoFullName: fullNameByRepoId.get(row.repositoryId) ?? "",
					headBranch: row.headBranch,
					number: row.number,
					url: row.url,
					title: row.title,
					state: toPullRequestState(row.state, row.mergedAt),
					isDraft: row.isDraft,
					reviewDecision: toReviewDecision(row.reviewDecision),
					checksStatus: toChecksStatus(row.checksStatus),
					checks: toChecks(row.checks),
					updatedAt: row.updatedAt,
				})),
			};
		}),

	/**
	 * One pull request by its own identity, repository and number, for a
	 * detail pane that has no host in the loop: the webhook row supplies
	 * everything but the description, which comes from GitHub with the
	 * installation's token.
	 */
	getPullRequest: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repoFullName: z.string().min(1),
				number: z.number().int().positive(),
			}),
		)
		.query(async ({ ctx, input }): Promise<PullRequestDetail> => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
			});
			if (!installation) {
				throw userError({
					code: "PRECONDITION_FAILED",
					message: "GitHub installation not found",
					i18nKey: "serverError.integration.githubInstallationNotFound",
				});
			}
			// Resolved through the gated listing rather than the table: this
			// answers with the installation's token, so a repository the caller
			// cannot read would otherwise hand them its title, body and author.
			// Unreachable reads as "not installed" — the refusal must not confirm
			// that a private repository exists.
			const repos = await listGithubRepositories(
				input.organizationId,
				ctx.session.user.id,
			);
			const wanted = input.repoFullName.toLowerCase();
			const repo = repos.find((row) => row.fullName.toLowerCase() === wanted);
			if (!repo) {
				throw userError({
					code: "NOT_FOUND",
					message: `${input.repoFullName} is not a repository the GitHub App is installed on`,
					i18nKey: "serverError.integration.repositoryNotInstalled",
					params: { repoFullName: input.repoFullName },
				});
			}
			const [owner, name] = repo.fullName.split("/");
			const [row, octokit] = await Promise.all([
				db.query.githubPullRequests.findFirst({
					where: and(
						eq(githubPullRequests.repositoryId, repo.id),
						eq(githubPullRequests.prNumber, input.number),
					),
				}),
				installationOctokit(installation.installationId),
			]);
			const { data: pr } = await octokit.request(
				"GET /repos/{owner}/{repo}/pulls/{pull_number}",
				{ owner: owner ?? "", repo: name ?? "", pull_number: input.number },
			);
			return {
				repoFullName: repo.fullName,
				number: pr.number,
				url: pr.html_url,
				title: pr.title,
				body: pr.body ?? "",
				state: toPullRequestState(pr.state, pr.merged_at),
				isDraft: pr.draft ?? false,
				author: pr.user
					? { login: pr.user.login, avatarUrl: pr.user.avatar_url ?? null }
					: null,
				head: {
					ref: pr.head.ref,
					repoFullName: pr.head.repo?.full_name ?? null,
				},
				base: { ref: pr.base.ref },
				reviewDecision: toReviewDecision(row?.reviewDecision ?? null),
				checksStatus: toChecksStatus(row?.checksStatus ?? "none"),
				checks: toChecks(row?.checks ?? null),
				createdAt: pr.created_at,
				updatedAt: pr.updated_at,
			};
		}),

	getStats: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});

			if (!installation) {
				return {
					repositoryCount: 0,
					openPullRequestCount: 0,
					pendingChecksCount: 0,
					failedChecksCount: 0,
				};
			}

			const repos = await listGithubRepositories(
				input.organizationId,
				ctx.session.user.id,
			);

			if (repos.length === 0) {
				return {
					repositoryCount: 0,
					openPullRequestCount: 0,
					pendingChecksCount: 0,
					failedChecksCount: 0,
				};
			}

			const repoIds = repos.map((r) => r.id);

			// Get open PRs
			const openPrs = await db.query.githubPullRequests.findMany({
				where: and(
					eq(githubPullRequests.state, "open"),
					inArray(githubPullRequests.repositoryId, repoIds),
				),
				columns: {
					id: true,
					checksStatus: true,
				},
			});

			const pendingChecksCount = openPrs.filter(
				(pr) => pr.checksStatus === "pending",
			).length;
			const failedChecksCount = openPrs.filter(
				(pr) => pr.checksStatus === "failure",
			).length;

			return {
				repositoryCount: repos.length,
				openPullRequestCount: openPrs.length,
				pendingChecksCount,
				failedChecksCount,
			};
		}),
} satisfies TRPCRouterRecord;
