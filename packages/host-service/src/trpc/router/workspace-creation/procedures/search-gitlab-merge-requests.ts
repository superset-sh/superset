import { randomUUID } from "node:crypto";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { GitLabClient } from "../../../../source-control/gitlab/gitlab";
import {
	type GitLabMergeRequest,
	getGitLabMergeRequest,
	gitLabMergeRequestSchema,
	gitLabProjectApiPath,
	mapGitLabChecksStatus,
	mapGitLabMergeRequestState,
} from "../../../../source-control/gitlab/merge-requests";
import { protectedProcedure } from "../../../index";
import { normalizeGitLabQuery } from "../normalize-gitlab-query";
import { resolveGitLabRepo } from "../shared/project-helpers";

const gitLabAuthorSchema = z
	.string()
	.trim()
	.regex(/^@?[\p{L}\p{N}_.-]+$/u, "Invalid GitLab username")
	.transform((author) => author.replace(/^@/, ""));

const searchInputSchema = z.object({
	projectId: z.string(),
	projectIds: z.array(z.string()).min(1).max(50).optional(),
	query: z.string().optional(),
	limit: z.number().int().min(1).max(100).optional(),
	includeClosed: z.boolean().optional(),
	mergedOnly: z.boolean().optional(),
	author: gitLabAuthorSchema.optional(),
	viewerRelationship: z
		.enum(["needs-review", "reviewed", "authored"])
		.optional(),
	page: z.number().int().min(1).optional(),
	cursor: z.string().optional(),
});

export interface GitLabMergeRequestSearchRow {
	projectId: string;
	provider: "gitlab";
	instance: string;
	repoPath: string;
	prNumber: number;
	title: string;
	url: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	authorAvatarUrl: string | null;
	updatedAt: string | null;
	checks: [];
	checksStatus: "none" | "pending" | "success" | "failure";
	additions: number | null;
	deletions: number | null;
	headRefName: string;
	baseRefName: string;
}

interface ProjectCursor {
	projectId: string;
	instance: string;
	repoPath: string;
	nextPage: number;
	exhausted: boolean;
	buffer: GitLabMergeRequestSearchRow[];
}

interface SearchCursor {
	signature: string;
	projects: ProjectCursor[];
}

interface ProjectSearchError {
	projectId: string;
	message: string;
}

const cursorCache = new Map<
	string,
	{ state: SearchCursor; expiresAt: number }
>();
const CURSOR_TTL_MS = 10 * 60_000;
const MAX_CURSORS = 64;

async function settledInBatches<T>(
	items: T[],
	map: (item: T) => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>[]> {
	const results: PromiseSettledResult<unknown>[] = [];
	for (let offset = 0; offset < items.length; offset += 4) {
		results.push(
			...(await Promise.allSettled(items.slice(offset, offset + 4).map(map))),
		);
	}
	return results;
}

function projectSearchError(
	projectId: string,
	error: unknown,
): ProjectSearchError {
	return {
		projectId,
		message:
			error instanceof TRPCError
				? error.message
				: "GitLab request failed for this project",
	};
}

function mapRow(
	projectId: string,
	identity: RepositoryIdentity,
	mergeRequest: GitLabMergeRequest,
): GitLabMergeRequestSearchRow {
	return {
		projectId,
		provider: "gitlab",
		instance: identity.instance,
		repoPath: identity.repoPath,
		prNumber: mergeRequest.iid,
		title: mergeRequest.title,
		url: mergeRequest.web_url,
		state: mapGitLabMergeRequestState(mergeRequest.state),
		isDraft: mergeRequest.draft ?? mergeRequest.work_in_progress ?? false,
		authorLogin: mergeRequest.author?.username ?? null,
		authorAvatarUrl: mergeRequest.author?.avatar_url ?? null,
		updatedAt: mergeRequest.updated_at ?? null,
		checks: [],
		checksStatus: mergeRequest.head_pipeline
			? mapGitLabChecksStatus(mergeRequest.head_pipeline.status)
			: "none",
		additions: null,
		deletions: null,
		headRefName: mergeRequest.source_branch,
		baseRefName: mergeRequest.target_branch,
	};
}

function decodeCursor(cursor: string, signature: string): SearchCursor {
	const cached = cursorCache.get(cursor);
	if (
		cached &&
		cached.expiresAt > Date.now() &&
		cached.state.signature === signature
	) {
		return structuredClone(cached.state);
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: "Invalid merge request cursor",
	});
}

function encodeCursor(cursor: SearchCursor): string {
	for (const [key, value] of cursorCache) {
		if (value.expiresAt <= Date.now()) cursorCache.delete(key);
	}
	while (cursorCache.size >= MAX_CURSORS) {
		const oldest = cursorCache.keys().next().value;
		if (!oldest) break;
		cursorCache.delete(oldest);
	}
	const token = randomUUID();
	cursorCache.set(token, {
		state: structuredClone(cursor),
		expiresAt: Date.now() + CURSOR_TTL_MS,
	});
	return token;
}

function isMissingRequest(error: unknown): boolean {
	return error instanceof Error && /(?:404|not found)/i.test(error.message);
}

export async function searchGitLabMergeRequestsPage(args: {
	client: GitLabClient;
	projects: Array<{ projectId: string; identity: RepositoryIdentity }>;
	query: string;
	limit: number;
	page: number;
	cursor?: string;
	includeClosed?: boolean;
	mergedOnly?: boolean;
	author?: string;
	viewerRelationship?: "needs-review" | "reviewed" | "authored";
}) {
	if (args.viewerRelationship === "reviewed") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"GitLab does not support the reviewed-by-me filter for project searches",
		});
	}
	const normalized = args.projects.map((project) => ({
		...project,
		search: normalizeGitLabQuery(args.query, project.identity, "merge_request"),
	}));
	const directProjects = normalized.filter(
		(project) => project.search.isDirectLookup,
	);
	if (
		directProjects.length === 0 &&
		normalized.some((project) => project.search.repoMismatch)
	) {
		return {
			pullRequests: [] as GitLabMergeRequestSearchRow[],
			totalCount: 0,
			hasNextPage: false,
			page: args.page,
			partialErrors: [] as ProjectSearchError[],
			repoMismatch: args.projects
				.map(
					(project) =>
						`${project.identity.instance}/${project.identity.repoPath}`,
				)
				.join(", "),
		};
	}
	const firstDirect = directProjects[0];
	if (firstDirect) {
		const iid = Number.parseInt(firstDirect.search.query, 10);
		const results = await settledInBatches(directProjects, async (project) => {
			const mr = await getGitLabMergeRequest(
				args.client,
				project.identity,
				iid,
			);
			if (!args.includeClosed && mr.state !== "opened") return null;
			if (args.mergedOnly && mr.state !== "merged") return null;
			if (args.author && mr.author?.username !== args.author) return null;
			return mapRow(project.projectId, project.identity, mr);
		});
		const rows: GitLabMergeRequestSearchRow[] = [];
		const partialErrors: ProjectSearchError[] = [];
		for (const [index, result] of results.entries()) {
			if (result.status === "fulfilled") {
				if (result.value)
					rows.push(result.value as GitLabMergeRequestSearchRow);
			} else if (!isMissingRequest(result.reason)) {
				const project = directProjects[index];
				if (project)
					partialErrors.push(
						projectSearchError(project.projectId, result.reason),
					);
			}
		}
		return {
			pullRequests: rows,
			totalCount: rows.length,
			hasNextPage: false,
			page: args.page,
			partialErrors,
		};
	}

	const signature = JSON.stringify({
		projects: args.projects.map((project) => [
			project.projectId,
			project.identity.instance,
			project.identity.repoPath,
		]),
		query: args.query,
		includeClosed: args.includeClosed,
		mergedOnly: args.mergedOnly,
		author: args.author,
		viewerRelationship: args.viewerRelationship,
	});
	const state: SearchCursor = args.cursor
		? decodeCursor(args.cursor, signature)
		: {
				signature,
				projects: args.projects.map((project) => ({
					projectId: project.projectId,
					instance: project.identity.instance,
					repoPath: project.identity.repoPath,
					nextPage: 1,
					exhausted: false,
					buffer: [],
				})),
			};
	const identityById = new Map(
		args.projects.map((project) => [project.projectId, project.identity]),
	);
	const rows: GitLabMergeRequestSearchRow[] = [];
	const partialErrors: ProjectSearchError[] = [];
	while (rows.length < args.limit) {
		const empty = state.projects.filter(
			(project) => !project.exhausted && project.buffer.length === 0,
		);
		for (let offset = 0; offset < empty.length; offset += 4) {
			await Promise.all(
				empty.slice(offset, offset + 4).map(async (project) => {
					const identity = identityById.get(project.projectId);
					if (!identity)
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Cursor project changed",
						});
					const params = new URLSearchParams({
						state: args.mergedOnly
							? "merged"
							: args.includeClosed
								? "all"
								: "opened",
						scope:
							args.viewerRelationship === "authored"
								? "created_by_me"
								: args.viewerRelationship === "needs-review"
									? "reviews_for_me"
									: "all",
						per_page: "30",
						page: String(project.nextPage),
						order_by: "updated_at",
						sort: "desc",
					});
					if (args.query)
						params.set("search", normalized[0]?.search.query ?? args.query);
					if (args.author) params.set("author_username", args.author);
					try {
						const result = await args.client.api<unknown>(
							identity,
							`${gitLabProjectApiPath(identity)}/merge_requests?${params}`,
						);
						const batch = z.array(gitLabMergeRequestSchema).parse(result);
						project.buffer = batch.map((mr) =>
							mapRow(project.projectId, identity, mr),
						);
						project.nextPage += 1;
						project.exhausted = batch.length < 30;
					} catch (error) {
						project.exhausted = true;
						partialErrors.push(projectSearchError(project.projectId, error));
					}
				}),
			);
		}
		const ready = state.projects.filter((project) => project.buffer.length > 0);
		if (ready.length === 0) break;
		ready.sort((left, right) => {
			const byTime = (right.buffer[0]?.updatedAt ?? "").localeCompare(
				left.buffer[0]?.updatedAt ?? "",
			);
			return byTime || left.projectId.localeCompare(right.projectId);
		});
		const next = ready[0]?.buffer.shift();
		if (!next) break;
		rows.push(next);
	}
	const hasNextPage = state.projects.some(
		(project) => project.buffer.length > 0 || !project.exhausted,
	);
	return {
		pullRequests: rows,
		totalCount: null,
		hasNextPage,
		page: args.page,
		partialErrors,
		nextCursor: hasNextPage ? encodeCursor(state) : null,
	};
}

export const searchGitLabMergeRequests = protectedProcedure
	.input(searchInputSchema)
	.query(async ({ ctx, input }) => {
		const projectIds = input.projectIds ?? [input.projectId];
		const resolved = await settledInBatches(projectIds, async (projectId) => ({
			projectId,
			identity: await resolveGitLabRepo(ctx, projectId),
		}));
		const projects = resolved.flatMap((result) =>
			result.status === "fulfilled"
				? [result.value as { projectId: string; identity: RepositoryIdentity }]
				: [],
		);
		if (projects.length === 0) {
			const firstFailure = resolved.find(
				(result) => result.status === "rejected",
			);
			if (firstFailure?.status === "rejected") throw firstFailure.reason;
		}
		const result = await searchGitLabMergeRequestsPage({
			client: ctx.gitlab,
			projects,
			query: input.query?.trim() ?? "",
			limit: input.limit ?? 30,
			page: input.page ?? 1,
			cursor: input.cursor,
			includeClosed: input.includeClosed,
			mergedOnly: input.mergedOnly,
			author: input.author,
			viewerRelationship: input.viewerRelationship,
		});
		return {
			...result,
			partialErrors: [
				...resolved.flatMap((entry, index) => {
					const projectId = projectIds[index];
					return entry.status === "rejected" && projectId
						? [projectSearchError(projectId, entry.reason)]
						: [];
				}),
				...result.partialErrors,
			],
		};
	});
