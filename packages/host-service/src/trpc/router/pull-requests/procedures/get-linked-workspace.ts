import { existsSync } from "node:fs";
import { parseGitRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { projects, pullRequests, workspaces } from "../../../../db/schema";
import { protectedProcedure } from "../../../index";
import {
	expectedGitlabPullRequestSchema,
	resolveExpectedGitlabPullRequest,
} from "../../git/gitlab-actions";
import {
	resolveGithubRepo,
	resolveRepo,
} from "../../workspace-creation/shared/project-helpers";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
	findPullRequestRowsByProject,
	type LinkedPullRequestRow,
} from "../shared/linked-workspaces";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	expectedPullRequest: expectedGitlabPullRequestSchema.optional(),
});

function storedNativeRepo(
	ctx: { db: import("../../../../db").HostDb },
	projectId: string,
) {
	const project = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	const remote =
		project?.repoProvider === "gitlab" && project.repoUrl
			? parseGitRemote(project.repoUrl)
			: null;
	return remote && remote.provider !== "github"
		? { ...remote, provider: "gitlab" as const }
		: null;
}
function missingCheckout(
	ctx: { db: import("../../../../db").HostDb },
	projectId: string,
	error?: unknown,
) {
	if (
		error !== undefined &&
		(!(error instanceof TRPCError) ||
			!["BAD_REQUEST", "PRECONDITION_FAILED"].includes(error.code))
	)
		return false;
	const project = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	return !!project && (!project.repoPath || !existsSync(project.repoPath));
}

/**
 * Whichever live, non-archived workspace currently points at this PR, if
 * any. Used by the Code tab's "+" comment composer to decide whether to
 * send a prompt into an already-open workspace or spin up a new one. When
 * the project's repository cannot be resolved (checkout gone, remote
 * unreachable) the rows the project wrote itself still answer, so an
 * existing link is never mistaken for "none".
 */
export function createGetLinkedWorkspace(
	resolveRepository: typeof resolveRepo = resolveRepo,
	resolveExpected: typeof resolveExpectedGitlabPullRequest = resolveExpectedGitlabPullRequest,
) {
	return protectedProcedure
		.input(getLinkedWorkspaceInputSchema)
		.query(async ({ ctx, input }) => {
			if (input.expectedPullRequest) {
				let expected = expectedGitlabPullRequestSchema.parse(
					input.expectedPullRequest,
				);
				if (
					expected.projectId !== input.projectId ||
					expected.pullNumber !== input.prNumber
				)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Merge request does not match the selected project",
					});
				try {
					expected = (
						await resolveExpected(ctx, expected, {
							projectId: input.projectId,
							pullNumber: input.prNumber,
						})
					).expected;
				} catch (error) {
					const stored = storedNativeRepo(ctx, input.projectId);
					if (!missingCheckout(ctx, input.projectId, error)) throw error;
					if (
						!stored ||
						stored.host !== expected.host ||
						stored.owner !== expected.owner ||
						stored.name !== expected.repo
					)
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"Stored repository does not match the expected merge request",
							cause: error,
						});
				}
				const workspace = ctx.db
					.select({ id: workspaces.id })
					.from(workspaces)
					.innerJoin(
						pullRequests,
						eq(workspaces.pullRequestId, pullRequests.id),
					)
					.where(
						and(
							eq(workspaces.projectId, input.projectId),
							eq(pullRequests.projectId, input.projectId),
							eq(pullRequests.repoProvider, "gitlab"),
							eq(pullRequests.repoHost, expected.host),
							eq(pullRequests.repoOwner, expected.owner),
							eq(pullRequests.repoName, expected.repo),
							eq(pullRequests.prNumber, input.prNumber),
							eq(pullRequests.url, expected.expectedUrl),
							isNull(workspaces.archivedAt),
						),
					)
					.orderBy(
						desc(
							sql`coalesce(${workspaces.lastActivityAt}, ${workspaces.updatedAt})`,
						),
						desc(workspaces.createdAt),
					)
					.get();
				return {
					workspaceId: workspace?.id ?? null,
					validatedPullRequest: expected,
				};
			}

			const hasGitlab = ctx.db
				.select({ id: pullRequests.id })
				.from(pullRequests)
				.where(
					and(
						eq(pullRequests.projectId, input.projectId),
						eq(pullRequests.prNumber, input.prNumber),
						eq(pullRequests.repoProvider, "gitlab"),
					),
				)
				.get();
			const claimedGitlab =
				ctx.db.query.projects
					.findFirst({
						columns: { repoProvider: true },
						where: eq(projects.id, input.projectId),
					})
					.sync()?.repoProvider === "gitlab";
			let selected:
				| Awaited<ReturnType<typeof resolveRepo>>
				| ReturnType<typeof storedNativeRepo> = null;
			if (hasGitlab || claimedGitlab) {
				try {
					selected = await resolveRepository(ctx, input.projectId);
				} catch (error) {
					if (!missingCheckout(ctx, input.projectId, error)) throw error;
					selected = storedNativeRepo(ctx, input.projectId);
				}
			}
			if (selected?.provider === "gitlab") {
				const workspace = ctx.db
					.select({ id: workspaces.id })
					.from(workspaces)
					.innerJoin(
						pullRequests,
						eq(workspaces.pullRequestId, pullRequests.id),
					)
					.where(
						and(
							eq(workspaces.projectId, input.projectId),
							eq(pullRequests.projectId, input.projectId),
							eq(pullRequests.prNumber, input.prNumber),
							eq(pullRequests.repoProvider, "gitlab"),
							eq(pullRequests.repoHost, selected.host),
							eq(pullRequests.repoOwner, selected.owner),
							eq(pullRequests.repoName, selected.name),
							eq(
								pullRequests.url,
								`${selected.url}/-/merge_requests/${input.prNumber}`,
							),
							isNull(workspaces.archivedAt),
						),
					)
					.orderBy(
						desc(
							sql`coalesce(${workspaces.lastActivityAt}, ${workspaces.updatedAt})`,
						),
						desc(workspaces.createdAt),
					)
					.get();
				return { workspaceId: workspace?.id ?? null };
			}
			if (selected?.provider === "unknown") {
				await resolveGithubRepo(ctx, input.projectId);
			}
			let rows: LinkedPullRequestRow[];
			try {
				const repo = await resolveGithubRepo(ctx, input.projectId);
				rows = findPullRequestRows(ctx.db, repo, input.prNumber);
			} catch {
				rows = findPullRequestRowsByProject(
					ctx.db,
					input.projectId,
					input.prNumber,
				);
			}
			const [workspaceId = null] = findLinkedWorkspaceIds(
				ctx.db,
				rows.map((row) => row.id),
			);
			return { workspaceId };
		});
}

export const getLinkedWorkspace = createGetLinkedWorkspace();
