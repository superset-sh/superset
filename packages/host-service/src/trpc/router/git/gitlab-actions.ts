import type { ParsedRemote } from "@superset/shared/git-remote";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { projects, pullRequests, workspaces } from "../../../db/schema";
import { gitLabApiDeps } from "../../../runtime/git/gitlab-api";
import {
	encodeProjectPath,
	GitLabRestError,
	gitlabRest,
	gitlabRestPost,
	gitlabRestText,
} from "../../../runtime/repo-providers/gitlab/gitlab-rest";
import type { HostServiceContext } from "../../../types";
import {
	gitLabClient,
	invalidateGitLabReads,
} from "../pull-requests/procedures/gitlab-project";
import {
	type ResolvedRepo,
	resolveRepo,
} from "../workspace-creation/shared/project-helpers";

export const gitLabContextInput = {
	provider: z.enum(["github", "gitlab"]).optional(),
	host: z.string().optional(),
	projectId: z.string().optional(),
	workspaceId: z.string().optional(),
	expectedUrl: z.string().optional(),
};

interface ActionContext {
	provider?: "github" | "gitlab";
	host?: string;
	projectId?: string;
	workspaceId?: string;
	expectedUrl?: string;
	owner: string;
	repo: string;
	pullNumber: number;
}

function invalidIdentity() {
	return new TRPCError({
		code: "BAD_REQUEST",
		message:
			"GitLab merge request identity changed; refresh before trying this action",
	});
}

function canonicalHost(host: string): string {
	if (/[\s\\/?#@]/.test(host)) throw invalidIdentity();
	const url = new URL(`https://${host}`);
	if (!url.host || url.username || url.password || url.pathname !== "/")
		throw invalidIdentity();
	return url.host;
}

export async function gitLabActionContext(
	ctx: HostServiceContext,
	input: ActionContext,
) {
	if (
		input.provider === "github" ||
		(!input.provider &&
			!input.host &&
			!input.projectId &&
			!input.workspaceId &&
			!input.expectedUrl)
	)
		return null;
	let projectId = input.projectId;
	if (input.workspaceId) {
		const workspace = ctx.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, input.workspaceId) })
			.sync();
		if (
			!workspace?.projectId ||
			(projectId && projectId !== workspace.projectId)
		)
			throw invalidIdentity();
		projectId = workspace.projectId;
	}
	if (!projectId) throw invalidIdentity();
	let expected: URL | undefined;
	let host: string;
	try {
		expected = input.expectedUrl ? new URL(input.expectedUrl) : undefined;
		host = canonicalHost(input.host ?? expected?.host ?? "");
		if (
			expected &&
			(expected.protocol !== "https:" ||
				expected.username ||
				expected.password ||
				expected.search ||
				expected.hash ||
				expected.host !== host ||
				expected.pathname.replace(/\/$/, "") !==
					new URL(
						`/${input.owner}/${input.repo}/-/merge_requests/${input.pullNumber}`,
						expected.origin,
					).pathname)
		)
			throw invalidIdentity();
	} catch {
		throw invalidIdentity();
	}
	if (!Number.isSafeInteger(input.pullNumber) || input.pullNumber <= 0)
		throw invalidIdentity();
	const repo = await resolveRepo(ctx, projectId, {
		validateRemote(remote) {
			if (
				remote.host !== host ||
				remote.owner !== input.owner ||
				remote.name !== input.repo ||
				remote.provider === "github"
			)
				throw invalidIdentity();
		},
	});
	if (repo.provider !== "gitlab") throw invalidIdentity();
	return { repo, client: gitLabClient(ctx, repo) };
}

export interface GitLabPullRequestIdentity {
	projectId: string;
	repoHost: string;
	repoOwner: string;
	repoName: string;
	prNumber: number;
	url: string;
}

export async function gitLabWorkspaceContext(
	ctx: HostServiceContext,
	projectId: string | null,
	pr: GitLabPullRequestIdentity,
) {
	if (!projectId || projectId !== pr.projectId) throw invalidIdentity();
	const action = await gitLabActionContext(ctx, {
		provider: "gitlab",
		projectId,
		host: pr.repoHost,
		owner: pr.repoOwner,
		repo: pr.repoName,
		pullNumber: pr.prNumber,
		expectedUrl: pr.url,
	});
	if (!action) throw invalidIdentity();
	return action;
}

export type GitLabAction = NonNullable<
	Awaited<ReturnType<typeof gitLabActionContext>>
>;

export function gitLabDiscussion(
	repo: { host: string; owner: string; name: string },
	threadId: string,
	number: number,
): string {
	const prefix = `gitlab:${encodeURIComponent(repo.host)}:${repo.owner}/${repo.name}:${number}:`;
	const discussion = threadId.startsWith(prefix)
		? threadId.slice(prefix.length)
		: "";
	if (!/^[\w-]+$/.test(discussion)) throw invalidIdentity();
	return discussion;
}

export async function replyToGitLabThread(
	ctx: HostServiceContext,
	action: GitLabAction,
	input: { threadId: string; commentId: number; body: string; number: number },
) {
	const discussion = gitLabDiscussion(
		action.repo,
		input.threadId,
		input.number,
	);
	const threads = await action.client.fetchReviewThreads(
		action.repo,
		input.number,
	);
	if (
		!threads.reviewThreads.some(
			(thread) =>
				thread.id === input.threadId &&
				thread.comments.some(
					(comment) => comment.databaseId === input.commentId,
				),
		)
	)
		throw invalidIdentity();
	const result = await gitlabRestPost<{ id: number }>(
		gitLabApiDeps(ctx.credentials, action.repo),
		`/projects/${encodeProjectPath(action.repo.owner, action.repo.name)}/merge_requests/${input.number}/discussions/${discussion}/notes`,
		{ body: input.body },
		"POST",
	);
	if (!Number.isSafeInteger(result.id) || result.id <= 0)
		throw new GitLabRestError(
			502,
			"GitLab returned an invalid reply identifier",
		);
	invalidateGitLabReads(action.repo, input.number);
	return { id: result.id };
}

export function gitLabJobId(
	repo: { host: string; owner: string; name: string },
	detailsUrl: string,
): string {
	let job: string;
	try {
		if (/[\s\\]/.test(detailsUrl)) throw invalidIdentity();
		const rawPath = detailsUrl.match(/^https:\/\/[^/?#]+([^?#]*)/)?.[1];
		if (
			!rawPath ||
			rawPath.split("/").some((part) => {
				const decoded = decodeURIComponent(part);
				return decoded === "." || decoded === "..";
			})
		)
			throw invalidIdentity();
		const url = new URL(detailsUrl);
		const prefix = new URL(
			`/${repo.owner}/${repo.name}/-/jobs/`,
			`https://${repo.host}`,
		).pathname;
		job = url.pathname.startsWith(prefix)
			? url.pathname.slice(prefix.length)
			: "";
		if (
			url.origin !== `https://${repo.host}` ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			!/^[1-9]\d*$/.test(job) ||
			!Number.isSafeInteger(Number(job))
		)
			throw invalidIdentity();
	} catch {
		throw invalidIdentity();
	}
	return job;
}

export async function gitLabJobLogs(
	ctx: HostServiceContext,
	action: GitLabAction,
	detailsUrl: string,
	prNumber?: number,
) {
	const deps = gitLabApiDeps(ctx.credentials, action.repo);
	let project = encodeProjectPath(action.repo.owner, action.repo.name);
	let job: string;
	try {
		job = gitLabJobId(action.repo, detailsUrl);
	} catch (error) {
		if (!prNumber) throw error;
		const metadata = await action.client.fetchVerifiedPullRequestMetadata(
			action.repo,
			prNumber,
		);
		if (
			!metadata.isCrossRepository ||
			!metadata.sourceProjectId ||
			!metadata.headRepositoryOwner ||
			!metadata.headRepositoryName
		)
			throw invalidIdentity();
		const source = {
			host: action.repo.host,
			owner: metadata.headRepositoryOwner,
			name: metadata.headRepositoryName,
		};
		job = gitLabJobId(source, detailsUrl);
		project = metadata.sourceProjectId;
		deps.mergeRequest = prNumber;
		if (!deps.request) {
			const pipeline = await gitlabRest<{
				pipeline?: { project_id: number; sha: string };
			}>(deps, `/projects/${project}/jobs/${job}`);
			if (
				pipeline.pipeline?.project_id !== Number(project) ||
				pipeline.pipeline.sha !== metadata.headRefOid
			)
				throw invalidIdentity();
		}
	}
	const path = `/projects/${project}/jobs/${job}/trace`;
	return { logs: await gitlabRestText(deps, path) };
}

export const expectedGitlabPullRequestSchema = z
	.object({
		provider: z.literal("gitlab"),
		projectId: z.string().min(1),
		host: z.string().min(1),
		owner: z.string().min(1),
		repo: z.string().min(1),
		pullNumber: z.number().int().positive().refine(Number.isSafeInteger),
		expectedUrl: z.string().min(1),
	})
	.superRefine((value, context) => {
		try {
			normalizeExpectedGitlab(value);
		} catch {
			context.addIssue({ code: "custom", message: invalidIdentity().message });
		}
	})
	.transform(normalizeExpectedGitlab);

export type ExpectedGitlabPullRequest = z.infer<
	typeof expectedGitlabPullRequestSchema
>;

function normalizeExpectedGitlab(input: {
	provider: "gitlab";
	projectId: string;
	host: string;
	owner: string;
	repo: string;
	pullNumber: number;
	expectedUrl: string;
}) {
	try {
		const authority = /^https:\/\/([^/?#]+)/i.exec(input.expectedUrl)?.[1];
		if (input.host.includes("%") || (authority && /[%@]/.test(authority)))
			throw invalidIdentity();
		const host = canonicalHost(input.host);
		const parts = [...input.owner.split("/"), input.repo];
		if (
			input.provider !== "gitlab" ||
			!input.projectId ||
			!Number.isSafeInteger(input.pullNumber) ||
			input.pullNumber <= 0 ||
			parts.some(
				(part) =>
					!part || part === "." || part === ".." || /[%\\/?#@\s]/.test(part),
			) ||
			/[\s\\]/.test(input.expectedUrl)
		)
			throw invalidIdentity();
		const url = new URL(input.expectedUrl);
		const path = `/${parts.map(encodeURIComponent).join("/")}/-/merge_requests/${input.pullNumber}`;
		const rawPath = input.expectedUrl.match(/^https:\/\/[^/?#]+([^?#]*)/)?.[1];
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.host !== host ||
			url.pathname !== path ||
			rawPath !== path
		)
			throw invalidIdentity();
		return { ...input, host, expectedUrl: `https://${host}${path}` };
	} catch {
		throw invalidIdentity();
	}
}

export function assertExpectedGitlabRemote(
	expected: ExpectedGitlabPullRequest,
	remote: ParsedRemote,
): void {
	const identity = normalizeExpectedGitlab(expected);
	if (
		remote.provider === "github" ||
		remote.host !== identity.host ||
		remote.owner !== identity.owner ||
		remote.name !== identity.repo
	)
		throw invalidIdentity();
}

export interface ExpectedGitlabSelection {
	expected: ExpectedGitlabPullRequest;
	organizationId: string;
	repo: ResolvedRepo;
	project: {
		id: string;
		createdAtMs: number;
		repoPath: string;
		remoteName: string | null;
		repoProvider: string | null;
		repoUrl: string | null;
	};
}

export async function resolveExpectedGitlabPullRequest(
	ctx: HostServiceContext,
	expected: ExpectedGitlabPullRequest,
	requested?: { projectId: string; pullNumber: number },
): Promise<ExpectedGitlabSelection> {
	const identity = normalizeExpectedGitlab(expected);
	if (
		requested &&
		(requested.projectId !== identity.projectId ||
			requested.pullNumber !== identity.pullNumber)
	)
		throw invalidIdentity();
	const organizationId = ctx.organizationId;
	if (!ctx.isAuthenticated || !organizationId)
		throw new TRPCError({ code: "UNAUTHORIZED" });
	const read = () =>
		ctx.db.query.projects
			.findFirst({
				where: and(
					eq(projects.id, identity.projectId),
					isNull(projects.deletedAt),
				),
			})
			.sync();
	const initial = read();
	if (!initial?.repoPath) throw invalidIdentity();
	const project = {
		id: initial.id,
		createdAtMs: initial.createdAt,
		repoPath: initial.repoPath,
		remoteName: initial.remoteName,
		repoProvider: initial.repoProvider,
		repoUrl: initial.repoUrl,
	};
	const repo = await resolveRepo(ctx, identity.projectId, {
		validateRemote(remote) {
			assertExpectedGitlabRemote(identity, remote);
		},
	});
	if (!ctx.isAuthenticated || ctx.organizationId !== organizationId)
		throw new TRPCError({ code: "UNAUTHORIZED" });
	const current = read();
	if (
		!current ||
		current.createdAt !== project.createdAtMs ||
		current.repoPath !== project.repoPath ||
		current.remoteName !== project.remoteName ||
		current.repoProvider !== project.repoProvider ||
		current.repoUrl !== project.repoUrl ||
		repo.provider !== "gitlab"
	)
		throw invalidIdentity();
	return { expected: identity, organizationId, repo, project };
}

export interface ExpectedGitlabWorkspaceIdentity {
	id: string;
	projectId: string;
	createdAtMs: number;
	type: string;
	worktreePath: string;
	branch: string;
	pullRequestId: string;
}
export interface ExpectedGitlabDeliveryPermit {
	isValid(): boolean;
}

export async function acquireExpectedGitlabDelivery(
	ctx: HostServiceContext,
	workspaceId: string,
	expected: ExpectedGitlabPullRequest,
	initial: ExpectedGitlabWorkspaceIdentity,
): Promise<ExpectedGitlabDeliveryPermit | null> {
	const identity = normalizeExpectedGitlab(expected);
	if (initial.id !== workspaceId || initial.projectId !== identity.projectId)
		return null;
	const read = () =>
		ctx.db
			.select({
				id: workspaces.id,
				projectId: workspaces.projectId,
				createdAtMs: workspaces.createdAt,
				type: workspaces.type,
				worktreePath: workspaces.worktreePath,
				branch: workspaces.branch,
				pullRequestId: workspaces.pullRequestId,
				prCreatedAt: pullRequests.createdAt,
			})
			.from(workspaces)
			.innerJoin(pullRequests, eq(workspaces.pullRequestId, pullRequests.id))
			.where(
				and(
					eq(workspaces.id, workspaceId),
					eq(workspaces.projectId, identity.projectId),
					isNull(workspaces.archivedAt),
					eq(pullRequests.projectId, identity.projectId),
					eq(pullRequests.repoProvider, "gitlab"),
					eq(pullRequests.repoHost, identity.host),
					eq(pullRequests.repoOwner, identity.owner),
					eq(pullRequests.repoName, identity.repo),
					eq(pullRequests.prNumber, identity.pullNumber),
					eq(pullRequests.url, identity.expectedUrl),
				),
			)
			.get();
	const matches = (row: ReturnType<typeof read>) =>
		row &&
		row.id === initial.id &&
		row.projectId === initial.projectId &&
		row.createdAtMs === initial.createdAtMs &&
		row.type === initial.type &&
		row.worktreePath === initial.worktreePath &&
		row.branch === initial.branch &&
		row.pullRequestId === initial.pullRequestId;
	const before = read();
	if (!matches(before)) return null;
	const selection = await resolveExpectedGitlabPullRequest(ctx, identity);
	const isValid = () => {
		const row = read();
		const project = ctx.db.query.projects
			.findFirst({
				where: and(
					eq(projects.id, identity.projectId),
					isNull(projects.deletedAt),
				),
			})
			.sync();
		return !!(
			ctx.isAuthenticated &&
			ctx.organizationId === selection.organizationId &&
			matches(row) &&
			row?.prCreatedAt === before?.prCreatedAt &&
			project &&
			project.createdAt === selection.project.createdAtMs &&
			project.repoPath === selection.project.repoPath &&
			project.remoteName === selection.project.remoteName &&
			project.repoProvider === selection.project.repoProvider &&
			project.repoUrl === selection.project.repoUrl
		);
	};
	return isValid() ? { isValid } : null;
}
