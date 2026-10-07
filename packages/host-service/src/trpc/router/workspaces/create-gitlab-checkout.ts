import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { pullRequests } from "../../../db/schema";
import type { VerifiedGitLabCheckoutLink } from "../../../runtime/pull-requests/pull-requests";
import { GitLabRestError } from "../../../runtime/repo-providers/gitlab/gitlab-rest";
import type { HostServiceContext } from "../../../types";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import {
	assertExpectedGitlabRemote,
	type ExpectedGitlabPullRequest,
	type ExpectedGitlabWorkspaceIdentity,
	resolveExpectedGitlabPullRequest,
} from "../git/gitlab-actions";

export interface ExpectedGitlabBoundDelivery {
	expectedPullRequest: ExpectedGitlabPullRequest;
	initialWorkspace: ExpectedGitlabWorkspaceIdentity;
}

interface GitlabCheckoutOptions {
	currentPrId?: () => string | null;
	initialPrId?: string | null;
	expectedPullRequest?: ExpectedGitlabPullRequest;
}

import { gitLabClient } from "../pull-requests/procedures/gitlab-project";
import { requireLocalProject } from "../workspace-creation/shared/local-project";
import {
	type ResolvedRepo,
	resolveRepo,
} from "../workspace-creation/shared/project-helpers";
import { requireIndependentWorktree } from "../workspace-creation/shared/require-independent-worktree";
import type { GitEnvironmentCommandRunner } from "../workspace-creation/shared/types";
import { normalizeWorktreePath } from "../workspace-creation/shared/worktree-list";
import { refreshGitlabPrBranch } from "../workspace-creation/utils/pr-branch-materialize";

type VerifiedMetadata = Awaited<
	ReturnType<
		ReturnType<typeof gitLabClient>["fetchVerifiedPullRequestMetadata"]
	>
>;
export interface GitlabCheckout {
	organizationId: string;
	localProjectId: string;
	projectSelection: { repoPath: string; remoteName: string | null };
	projectIdentity?: VerifiedGitLabCheckoutLink["project"];
	repo: ResolvedRepo;
	metadata: VerifiedMetadata & {
		selectedOrganizationId: string;
		selectedRepositoryUrl: string;
		selectedRemoteName: string;
	};
}

export async function assertGitlabCheckoutCurrent(
	ctx: HostServiceContext,
	checkout: GitlabCheckout,
): Promise<void> {
	if (
		!ctx.isAuthenticated ||
		!ctx.organizationId ||
		ctx.organizationId !== checkout.organizationId
	)
		throw new TRPCError({ code: "UNAUTHORIZED" });
	try {
		const current = await resolveRepo(ctx, checkout.localProjectId);
		const project = requireLocalProject(ctx, checkout.localProjectId);
		if (
			current.provider !== "gitlab" ||
			current.host !== checkout.repo.host ||
			current.owner !== checkout.repo.owner ||
			current.name !== checkout.repo.name ||
			current.url !== checkout.repo.url ||
			current.remoteName !== checkout.repo.remoteName ||
			normalizeWorktreePath(current.repoPath) !==
				normalizeWorktreePath(checkout.repo.repoPath) ||
			normalizeWorktreePath(project.repoPath) !==
				normalizeWorktreePath(checkout.projectSelection.repoPath) ||
			(project.remoteName ?? null) !== checkout.projectSelection.remoteName
		)
			throw new Error("GitLab checkout selection changed");
	} catch (cause) {
		throw new TRPCError({ code: "CONFLICT", message: "CONFLICT", cause });
	}
}

export async function resolveGitlabCheckout(
	ctx: HostServiceContext,
	projectId: string,
	number: number,
	currentPrIdOrOptions?: (() => string | null) | GitlabCheckoutOptions,
	legacyInitialPrId?: string | null,
): Promise<GitlabCheckout | null> {
	const options =
		typeof currentPrIdOrOptions === "function"
			? { currentPrId: currentPrIdOrOptions, initialPrId: legacyInitialPrId }
			: currentPrIdOrOptions;
	const currentPrId = options?.currentPrId;
	const initialPrId = options?.initialPrId;
	const expected = options?.expectedPullRequest;
	if (!ctx.isAuthenticated || !ctx.organizationId)
		throw new TRPCError({ code: "UNAUTHORIZED" });
	const organizationId = ctx.organizationId;
	const selectedProject = requireLocalProject(ctx, projectId);
	const projectSelection = {
		repoPath: selectedProject.repoPath,
		remoteName: selectedProject.remoteName ?? null,
	};
	const initialRow =
		initialPrId != null
			? ctx.db
					.select()
					.from(pullRequests)
					.where(eq(pullRequests.id, initialPrId))
					.get()
			: null;
	const initialLink = initialRow
		? { projectId: initialRow.projectId, repoProvider: initialRow.repoProvider }
		: null;
	const resolved = expected
		? (
				await resolveExpectedGitlabPullRequest(ctx, expected, {
					projectId,
					pullNumber: number,
				})
			).repo
		: await resolveRepo(ctx, projectId, { allowNoPlatformRemote: true });
	if (expected && resolved) assertExpectedGitlabRemote(expected, resolved);
	if (!resolved) {
		if (!ctx.isAuthenticated || ctx.organizationId !== organizationId)
			throw new TRPCError({ code: "UNAUTHORIZED" });
		const currentProject = requireLocalProject(ctx, projectId);
		if (
			selectedProject.repoProvider === "gitlab" ||
			currentProject.repoProvider === "gitlab" ||
			normalizeWorktreePath(currentProject.repoPath) !==
				normalizeWorktreePath(projectSelection.repoPath) ||
			(currentProject.remoteName ?? null) !== projectSelection.remoteName
		)
			throw new TRPCError({ code: "CONFLICT" });
		if (
			initialPrId != null &&
			(!initialLink ||
				initialLink.projectId !== projectId ||
				initialLink.repoProvider !== "github")
		)
			throw new TRPCError({ code: "CONFLICT" });
		let linkedId: string | null | undefined;
		try {
			linkedId = currentPrId?.();
		} catch (cause) {
			throw new TRPCError({ code: "CONFLICT", cause });
		}
		if (linkedId != null) {
			const linked = ctx.db
				.select()
				.from(pullRequests)
				.where(eq(pullRequests.id, linkedId))
				.get();
			if (
				!linked ||
				linked.projectId !== projectId ||
				linked.repoProvider !== "github"
			)
				throw new TRPCError({ code: "CONFLICT" });
		}
		return null;
	}
	const repo = { ...resolved };
	if (repo.provider === "github") return null;
	if (repo.provider !== "gitlab") throw new TRPCError({ code: "BAD_REQUEST" });
	requireLocalProject(ctx, projectId);
	let metadata: VerifiedMetadata;
	try {
		metadata = await gitLabClient(ctx, repo).fetchVerifiedPullRequestMetadata(
			repo,
			number,
		);
	} catch (error) {
		if (error instanceof GitLabRestError) {
			const code =
				error.status === 401
					? "UNAUTHORIZED"
					: error.status === 403
						? "FORBIDDEN"
						: error.status === 404
							? "NOT_FOUND"
							: "BAD_GATEWAY";
			throw new TRPCError({
				code,
				message: code,
				cause: error,
				...(error.status === 401
					? {
							message: ctx.credentials.credentialRemedy(
								repo.host,
								error.message === `No GitLab token for host ${repo.host}`
									? "missing"
									: "rejected",
							),
						}
					: {}),
			});
		}
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "BAD_GATEWAY",
			cause: error,
		});
	}
	if (
		expected &&
		(metadata.number !== expected.pullNumber ||
			metadata.url !== expected.expectedUrl)
	)
		throw new TRPCError({ code: "CONFLICT" });
	const checkout: GitlabCheckout = {
		organizationId,
		localProjectId: projectId,
		projectSelection,
		projectIdentity: { ...selectedProject },
		repo,
		metadata: {
			...metadata,
			selectedOrganizationId: organizationId,
			selectedRepositoryUrl: `${repo.url}.git`,
			selectedRemoteName: repo.remoteName,
		},
	};
	await assertGitlabCheckoutCurrent(ctx, checkout);
	return checkout;
}

export function captureGitlabCheckoutWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): VerifiedGitLabCheckoutLink["workspace"] {
	const workspace = getLocalWorkspace(ctx.db, workspaceId);
	if (
		!workspace ||
		workspace.archivedAt != null ||
		workspace.type !== "worktree"
	)
		throw new TRPCError({ code: "CONFLICT" });
	return { ...workspace };
}

export async function linkGitlabCheckoutWorkspace(
	ctx: HostServiceContext,
	checkout: GitlabCheckout,
	workspace: VerifiedGitLabCheckoutLink["workspace"],
): Promise<string> {
	await assertGitlabCheckoutCurrent(ctx, checkout);
	if (
		!checkout.projectIdentity ||
		workspace.projectId !== checkout.localProjectId ||
		checkout.repo.provider !== "gitlab"
	)
		throw new TRPCError({ code: "CONFLICT" });
	try {
		const id =
			await ctx.runtime.pullRequests.linkWorkspaceToCheckoutPullRequest({
				workspaceId: workspace.id,
				projectId: checkout.localProjectId,
				pullRequest: checkout.metadata,
				verifiedCheckout: {
					repo: { ...checkout.repo, provider: "gitlab" },
					project: checkout.projectIdentity,
					workspace,
					isCurrent: () =>
						ctx.isAuthenticated &&
						ctx.organizationId === checkout.organizationId,
				},
			});
		if (!id) throw new Error("GitLab checkout association unavailable");
		return id;
	} catch (cause) {
		throw new TRPCError({ code: "CONFLICT", message: "CONFLICT", cause });
	}
}

export async function bindGitlabCheckoutCredentials(
	ctx: HostServiceContext,
	git: GitEnvironmentCommandRunner,
	checkout: GitlabCheckout,
) {
	if (
		!ctx.isAuthenticated ||
		!ctx.organizationId ||
		checkout.organizationId !== ctx.organizationId
	)
		throw new TRPCError({ code: "UNAUTHORIZED" });
	await assertGitlabCheckoutCurrent(ctx, checkout);
	const gitRoot = (await git.raw(["rev-parse", "--show-toplevel"])).trim();
	if (
		!gitRoot ||
		normalizeWorktreePath(gitRoot) !==
			normalizeWorktreePath(checkout.repo.repoPath)
	)
		throw new TRPCError({ code: "CONFLICT" });
	const { env } = await ctx.credentials.getCredentials(
		checkout.metadata.selectedRepositoryUrl,
	);
	await assertGitlabCheckoutCurrent(ctx, checkout);
	git.env({
		...env,
		GIT_TERMINAL_PROMPT: "0",
		GIT_OPTIONAL_LOCKS: "0",
		LC_ALL: "C",
	});
}

export async function refreshGitlabWorkspace(
	ctx: HostServiceContext,
	git: GitEnvironmentCommandRunner,
	checkout: GitlabCheckout,
	workspace: {
		projectId: string | null;
		branch: string;
		worktreePath: string;
		pullRequestId?: string | null;
	},
	projectId: string,
) {
	if (workspace.projectId !== projectId)
		throw new TRPCError({ code: "CONFLICT" });
	let verifiedExistingCheckout = false;
	if (workspace.pullRequestId) {
		const linked = ctx.db
			.select()
			.from(pullRequests)
			.where(eq(pullRequests.id, workspace.pullRequestId))
			.get();
		if (
			!linked ||
			linked.projectId !== projectId ||
			linked.repoProvider !== "gitlab" ||
			linked.repoHost !== checkout.repo.host ||
			linked.repoOwner !== checkout.repo.owner ||
			linked.repoName !== checkout.repo.name ||
			linked.prNumber !== checkout.metadata.number
		)
			throw new TRPCError({ code: "CONFLICT" });
		verifiedExistingCheckout = true;
	}
	requireIndependentWorktree(checkout.repo.repoPath, workspace.worktreePath);
	const baseCommon = (await git.raw(["rev-parse", "--git-common-dir"])).trim();
	const workspaceCommon = (
		await git.raw([
			"-C",
			workspace.worktreePath,
			"rev-parse",
			"--git-common-dir",
		])
	).trim();
	if (
		!baseCommon ||
		!workspaceCommon ||
		normalizeWorktreePath(resolve(checkout.repo.repoPath, baseCommon)) !==
			normalizeWorktreePath(resolve(workspace.worktreePath, workspaceCommon))
	)
		throw new TRPCError({ code: "CONFLICT" });
	await bindGitlabCheckoutCredentials(ctx, git, checkout);
	try {
		await assertGitlabCheckoutCurrent(ctx, checkout);
		await refreshGitlabPrBranch({
			git,
			branch: workspace.branch,
			worktreePath: workspace.worktreePath,
			remoteName: checkout.repo.remoteName,
			pr: checkout.metadata,
			verifiedExistingCheckout,
		});
		git.assertHealthy?.();
	} catch (cause) {
		throw new TRPCError({ code: "CONFLICT", message: "CONFLICT", cause });
	}
}

export function captureExpectedGitlabWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
	selected?: VerifiedGitLabCheckoutLink["workspace"],
): ExpectedGitlabWorkspaceIdentity {
	const workspace = selected ?? getLocalWorkspace(ctx.db, workspaceId);
	if (
		!workspace ||
		workspace.id !== workspaceId ||
		("archivedAt" in workspace && workspace.archivedAt != null)
	)
		throw new TRPCError({ code: "CONFLICT" });
	if (!workspace.projectId || !workspace.pullRequestId)
		throw new TRPCError({ code: "CONFLICT" });
	return {
		id: workspace.id,
		projectId: workspace.projectId,
		createdAtMs: workspace.createdAt,
		type: workspace.type,
		worktreePath: workspace.worktreePath,
		branch: workspace.branch,
		pullRequestId: workspace.pullRequestId,
	};
}
