import type { RepositoryIdentity } from "@superset/shared/source-control";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PullRequestReviewThread } from "../../trpc/router/git/types";
import type { GitLabClient } from "./gitlab";

const gitLabUserSchema = z.object({
	username: z.string(),
	avatar_url: z.string().nullable().optional(),
});

export const gitLabMergeRequestSchema = z.object({
	iid: z.number().int().positive(),
	title: z.string(),
	description: z.string().nullable().optional(),
	web_url: z.string(),
	state: z.string(),
	draft: z.boolean().optional(),
	work_in_progress: z.boolean().optional(),
	sha: z.string().nullable().optional(),
	source_branch: z.string(),
	target_branch: z.string(),
	source_project_id: z.number().nullable().optional(),
	target_project_id: z.number().nullable().optional(),
	author: gitLabUserSchema.nullable().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	merged_at: z.string().nullable().optional(),
	changes_count: z.string().nullable().optional(),
	head_pipeline: z
		.object({
			id: z.number(),
			status: z.string(),
			web_url: z.string().optional(),
		})
		.nullable()
		.optional(),
	user: z.object({ can_merge: z.boolean().optional() }).nullable().optional(),
	detailed_merge_status: z.string().nullable().optional(),
	diff_refs: z
		.object({
			base_sha: z.string().nullable().optional(),
			start_sha: z.string().nullable().optional(),
			head_sha: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
});

export type GitLabMergeRequest = z.infer<typeof gitLabMergeRequestSchema>;

const gitLabJobSchema = z.object({
	id: z.number(),
	name: z.string(),
	status: z.string(),
	web_url: z.string().nullable().optional(),
	allow_failure: z.boolean().optional(),
});

const gitLabDiscussionSchema = z.object({
	id: z.string(),
	individual_note: z.boolean().optional(),
	notes: z.array(
		z.object({
			id: z.number(),
			body: z.string(),
			created_at: z.string(),
			resolvable: z.boolean().optional(),
			resolved: z.boolean().optional(),
			author: gitLabUserSchema.nullable().optional(),
			position: z
				.object({
					new_path: z.string().nullable().optional(),
					old_path: z.string().nullable().optional(),
					new_line: z.number().nullable().optional(),
					old_line: z.number().nullable().optional(),
				})
				.nullable()
				.optional(),
		}),
	),
});

const gitLabPageSize = 100;
const maxGitLabDetailPages = 20;

class GitLabPaginationLimitError extends Error {
	constructor(resource: string) {
		super(
			`This merge request has too many ${resource} to load safely. Open it in GitLab.`,
		);
	}
}

async function getGitLabPages<T>(
	client: GitLabClient,
	identity: RepositoryIdentity,
	endpoint: string,
	parse: (response: unknown) => T[],
	resource: string,
): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; page <= maxGitLabDetailPages; page += 1) {
		const pageEndpoint = `${endpoint}?per_page=${gitLabPageSize}${page === 1 ? "" : `&page=${page}`}`;
		const response = await client.api<unknown>(identity, pageEndpoint);
		const pageItems = parse(response);
		items.push(...pageItems);
		if (pageItems.length < gitLabPageSize) return items;
	}
	throw new GitLabPaginationLimitError(resource);
}

export function gitLabProjectApiPath(identity: RepositoryIdentity): string {
	return `/projects/${encodeURIComponent(String(identity.projectId ?? identity.repoPath))}`;
}

export function gitLabMergeRequestApiPath(
	identity: RepositoryIdentity,
	iid: number,
): string {
	return `${gitLabProjectApiPath(identity)}/merge_requests/${iid}`;
}

export function assertGitLabIdentity(
	identity: RepositoryIdentity,
	requested: { instance?: string; repoPath?: string },
): void {
	if (
		(requested.instance && requested.instance !== identity.instance) ||
		(requested.repoPath && requested.repoPath !== identity.repoPath)
	) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"The selected project now points to a different GitLab repository",
		});
	}
}

export function mapGitLabMergeRequestState(
	state: string,
): "open" | "closed" | "merged" {
	if (state === "merged") return "merged";
	return state === "opened" ? "open" : "closed";
}

export function mapGitLabPipelineStatus(
	status: string,
): "success" | "failure" | "pending" | "skipped" | "cancelled" {
	switch (status) {
		case "success":
			return "success";
		case "failed":
			return "failure";
		case "canceled":
			return "cancelled";
		case "skipped":
			return "skipped";
		default:
			return "pending";
	}
}

export function mapGitLabChecksStatus(
	status: string,
): "success" | "failure" | "pending" {
	const mapped = mapGitLabPipelineStatus(status);
	if (mapped === "cancelled" || mapped === "failure") return "failure";
	if (mapped === "skipped") return "pending";
	return mapped;
}

export async function getGitLabMergeRequest(
	client: GitLabClient,
	identity: RepositoryIdentity,
	iid: number,
): Promise<GitLabMergeRequest> {
	const response = await client.api<unknown>(
		identity,
		gitLabMergeRequestApiPath(identity, iid),
	);
	return gitLabMergeRequestSchema.parse(response);
}

export async function getGitLabMergeRequestContent(
	client: GitLabClient,
	identity: RepositoryIdentity,
	iid: number,
) {
	const mr = await getGitLabMergeRequest(client, identity, iid);
	const [jobsResult, projectResult, userResult] = await Promise.allSettled([
		mr.head_pipeline
			? getGitLabPages(
					client,
					identity,
					`${gitLabProjectApiPath(identity)}/pipelines/${mr.head_pipeline.id}/jobs`,
					(response) => z.array(gitLabJobSchema).parse(response),
					"pipeline jobs",
				)
			: Promise.resolve([]),
		client.api<{ merge_method?: string; squash_option?: string }>(
			identity,
			gitLabProjectApiPath(identity),
		),
		client.api<{ username?: string }>(identity, "/user"),
	]);
	if (
		jobsResult.status === "rejected" &&
		jobsResult.reason instanceof GitLabPaginationLimitError
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: jobsResult.reason.message,
		});
	}
	const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
	const project =
		projectResult.status === "fulfilled" ? projectResult.value : null;
	const currentUser =
		userResult.status === "fulfilled" ? userResult.value.username : null;
	const checks = jobs.map((job) => ({
		name: job.name,
		status: mapGitLabPipelineStatus(job.status),
		url: job.web_url ?? null,
		allowFailure: job.allow_failure ?? false,
		jobId: job.id,
	}));
	const checksStatus = mr.head_pipeline
		? mapGitLabChecksStatus(mr.head_pipeline.status)
		: "none";
	const canChange =
		mr.user?.can_merge === true ||
		(currentUser !== null && currentUser === mr.author?.username);
	const mergeMethods: Array<"merge" | "squash"> = [];
	if (project?.merge_method && project.squash_option) {
		if (project.squash_option !== "always") mergeMethods.push("merge");
		if (project.squash_option !== "never") mergeMethods.push("squash");
	}
	const canMerge =
		mr.user?.can_merge === true &&
		mr.state === "opened" &&
		!(mr.draft ?? mr.work_in_progress) &&
		mr.detailed_merge_status === "mergeable" &&
		mergeMethods.length > 0;
	return {
		provider: "gitlab" as const,
		instance: identity.instance,
		repoPath: identity.repoPath,
		number: mr.iid,
		title: mr.title,
		body: mr.description ?? "",
		url: mr.web_url,
		state: mapGitLabMergeRequestState(mr.state),
		branch: mr.source_branch,
		baseBranch: mr.target_branch,
		headRepositoryOwner: null,
		isCrossRepository: mr.source_project_id !== mr.target_project_id,
		author: mr.author?.username ?? null,
		authorAvatarUrl: mr.author?.avatar_url ?? null,
		isDraft: mr.draft ?? mr.work_in_progress ?? false,
		createdAt: mr.created_at,
		updatedAt: mr.updated_at,
		headSha: mr.sha ?? null,
		checks,
		checksStatus,
		capabilities: {
			canMerge,
			mergeMethods: canMerge ? mergeMethods : [],
			canClose: canChange && mr.state === "opened",
			canMarkReady: canChange && (mr.draft ?? mr.work_in_progress ?? false),
			canReply: currentUser !== null,
			canResolve: canChange,
		},
	};
}

export async function getGitLabMergeRequestThreads(
	client: GitLabClient,
	identity: RepositoryIdentity,
	iid: number,
): Promise<PullRequestReviewThread[]> {
	let discussions: z.infer<typeof gitLabDiscussionSchema>[];
	try {
		discussions = await getGitLabPages(
			client,
			identity,
			`${gitLabMergeRequestApiPath(identity, iid)}/discussions`,
			(response) => z.array(gitLabDiscussionSchema).parse(response),
			"discussions",
		);
	} catch (error) {
		if (error instanceof GitLabPaginationLimitError) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error.message,
			});
		}
		throw error;
	}
	return discussions.map((discussion) => {
		const first = discussion.notes[0];
		const position = first?.position;
		return {
			id: discussion.id,
			isResolved: first?.resolved ?? false,
			isOutdated: !position,
			diffSide: position?.old_line && !position.new_line ? "LEFT" : "RIGHT",
			line: position?.new_line ?? position?.old_line ?? null,
			path: position?.new_path ?? position?.old_path ?? "",
			comments: discussion.notes.map((note) => ({
				id: String(note.id),
				databaseId: note.id,
				author: {
					login: note.author?.username ?? "ghost",
					avatarUrl: note.author?.avatar_url ?? "",
				},
				body: note.body,
				createdAt: note.created_at,
			})),
		};
	});
}
