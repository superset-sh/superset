import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { normalizeGitLabQuery } from "../normalize-gitlab-query";
import { gitlabIssuesSearchInputSchema } from "../schemas";
import { resolveGitLabRepo } from "../shared/project-helpers";

type SearchInput = z.infer<typeof gitlabIssuesSearchInputSchema>;
type GitLabRepo = RepositoryIdentity & { repoPathLocal: string };
type ProjectRepo = { projectId: string; repo: GitLabRepo };

export interface GitLabIssueResult {
	projectId: string;
	issueNumber: number;
	title: string;
	url: string;
	state: "open" | "closed";
	authorLogin: string | null;
	updatedAt: string | null;
	body: string;
	provider: "gitlab";
	instance: string;
	repoPath: string;
	gitlabProjectId?: number;
}

export interface GitLabIssuesPage {
	issues: GitLabIssueResult[];
	totalCount?: number;
	hasNextPage: boolean;
	page: number;
	nextCursor?: string;
	repoMismatch?: string;
	partialErrors?: Array<{ projectId: string; message: string }>;
}

interface IssueApi {
	api<T>(identity: RepositoryIdentity, endpoint: string): Promise<T>;
}

const issueSchema = z.object({
	iid: z.number().int().positive(),
	title: z.string(),
	description: z.string().nullable().optional(),
	web_url: z.string().url(),
	state: z.string(),
	author: z.object({ username: z.string() }).nullable().optional(),
	updated_at: z.string().nullable().optional(),
	project_id: z.number().int().positive().optional(),
});

const API_PAGE_SIZE = 30;
const cursorSecret = randomBytes(32);

function repoKey(repo: RepositoryIdentity): string {
	return `${repo.instance.toLowerCase()}|${repo.repoPath.toLowerCase()}`;
}

function fingerprintFor(
	projectRepos: ProjectRepo[],
	input: SearchInput,
): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				projects: projectRepos.map(({ projectId, repo }) => [
					projectId,
					repoKey(repo),
				]),
				query: input.query?.trim() ?? "",
				includeClosed: input.includeClosed ?? false,
				limit: input.limit ?? API_PAGE_SIZE,
			}),
		)
		.digest("hex");
}

function invalidCursor(): TRPCError {
	return new TRPCError({
		code: "BAD_REQUEST",
		message: "GitLab issue search changed. Refresh the results.",
	});
}

function encodeCursor(
	fingerprint: string,
	consumed: Record<string, number>,
): string {
	const payload = Buffer.from(
		JSON.stringify({ fingerprint, consumed }),
	).toString("base64url");
	const signature = createHmac("sha256", cursorSecret)
		.update(payload)
		.digest("base64url");
	return `${payload}.${signature}`;
}

function decodeCursor(
	cursor: string | undefined,
	fingerprint: string,
): Record<string, number> {
	if (!cursor) return {};
	const parts = cursor.split(".");
	if (parts.length !== 2) throw invalidCursor();
	const payload = parts[0] ?? "";
	const expected = createHmac("sha256", cursorSecret).update(payload).digest();
	const actual = Buffer.from(parts[1] ?? "", "base64url");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
		throw invalidCursor();
	}
	try {
		const parsed = z
			.object({
				fingerprint: z.string(),
				consumed: z.record(z.string(), z.number().int().min(0).max(1_000_000)),
			})
			.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
		if (parsed.fingerprint === fingerprint) return parsed.consumed;
	} catch {
		throw invalidCursor();
	}
	throw invalidCursor();
}

async function mapSettledBounded<T, R>(
	items: T[],
	map: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(4, items.length) }, async () => {
			while (next < items.length) {
				const index = next++;
				const item = items[index];
				if (item === undefined) continue;
				try {
					results[index] = { status: "fulfilled", value: await map(item) };
				} catch (reason) {
					results[index] = { status: "rejected", reason };
				}
			}
		}),
	);
	return results;
}

function issuesEndpoint(repo: RepositoryIdentity): string {
	return `projects/${encodeURIComponent(String(repo.projectId ?? repo.repoPath))}/issues`;
}

function toResult(
	data: z.infer<typeof issueSchema>,
	projectRepo: ProjectRepo,
): GitLabIssueResult {
	return {
		projectId: projectRepo.projectId,
		issueNumber: data.iid,
		title: data.title,
		url: data.web_url,
		state: data.state === "opened" ? "open" : "closed",
		authorLogin: data.author?.username ?? null,
		updatedAt: data.updated_at ?? null,
		body: data.description ?? "",
		provider: "gitlab",
		instance: projectRepo.repo.instance,
		repoPath: projectRepo.repo.repoPath,
		gitlabProjectId: data.project_id ?? projectRepo.repo.projectId,
	};
}

function failureMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: "Could not load GitLab issues.";
}

async function resolveProjects(
	projectIds: string[],
	resolve: (projectId: string) => Promise<GitLabRepo>,
): Promise<{
	projectRepos: ProjectRepo[];
	partialErrors: Array<{ projectId: string; message: string }>;
}> {
	const uniqueIds = [...new Set(projectIds)];
	const settled = await mapSettledBounded(uniqueIds, resolve);
	const projectRepos: ProjectRepo[] = [];
	const partialErrors: Array<{ projectId: string; message: string }> = [];
	const seenRepos = new Set<string>();
	settled.forEach((result, index) => {
		const projectId = uniqueIds[index];
		if (projectId === undefined) return;
		if (result.status === "rejected") {
			partialErrors.push({ projectId, message: failureMessage(result.reason) });
			return;
		}
		const key = repoKey(result.value);
		if (seenRepos.has(key)) return;
		seenRepos.add(key);
		projectRepos.push({ projectId, repo: result.value });
	});
	if (projectRepos.length === 0) {
		const failure = settled.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (failure) throw failure.reason;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select at least one GitLab project to search.",
		});
	}
	return { projectRepos, partialErrors };
}

export async function searchGitLabIssuesForProjects(
	input: SearchInput,
	deps: {
		resolve: (projectId: string) => Promise<GitLabRepo>;
		client: IssueApi;
	},
): Promise<GitLabIssuesPage> {
	const page = input.page ?? 1;
	if (page > 1 && !input.cursor) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"GitLab issue search needs a continuation cursor for later pages.",
		});
	}
	const { projectRepos, partialErrors } = await resolveProjects(
		input.projectIds ?? [input.projectId],
		deps.resolve,
	);
	const query = input.query?.trim() ?? "";
	const normalized = projectRepos.map((projectRepo) => ({
		projectRepo,
		value: normalizeGitLabQuery(query, projectRepo.repo, "issue"),
	}));
	const directEntries = normalized.filter(({ value }) => value.isDirectLookup);
	if (
		directEntries.length === 0 &&
		normalized.some(({ value }) => value.repoMismatch)
	) {
		return {
			issues: [],
			hasNextPage: false,
			totalCount: 0,
			page,
			repoMismatch: projectRepos
				.map(({ repo }) => `${repo.instance}/${repo.repoPath}`)
				.join(", "),
			...(partialErrors.length > 0 ? { partialErrors } : {}),
		};
	}

	const targets =
		directEntries.length > 0
			? directEntries.map(({ projectRepo }) => projectRepo)
			: projectRepos;
	const fingerprint = fingerprintFor(targets, input);
	const consumed = decodeCursor(input.cursor, fingerprint);
	const limit = input.limit ?? API_PAGE_SIZE;

	if (directEntries.length > 0) {
		const iid = Number.parseInt(directEntries[0]?.value.query ?? "", 10);
		const settled = await mapSettledBounded(targets, async (target) => {
			const params = new URLSearchParams({
				scope: "all",
				per_page: "1",
			});
			params.append("iids[]", String(iid));
			const raw = await deps.client.api<unknown>(
				target.repo,
				`${issuesEndpoint(target.repo)}?${params}`,
			);
			const data = z.array(issueSchema).parse(raw)[0];
			return data ? toResult(data, target) : null;
		});
		const issues: GitLabIssueResult[] = [];
		settled.forEach((result, index) => {
			const target = targets[index];
			if (!target) return;
			if (result.status === "rejected") {
				partialErrors.push({
					projectId: target.projectId,
					message: failureMessage(result.reason),
				});
			} else if (
				result.value &&
				(input.includeClosed || result.value.state === "open")
			) {
				issues.push(result.value);
			}
		});
		if (settled.every((result) => result.status === "rejected")) {
			const failure = settled.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (failure) throw failure.reason;
		}
		issues.sort((left, right) =>
			(right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
		);
		return {
			issues,
			totalCount: issues.length,
			hasNextPage: false,
			page,
			...(partialErrors.length > 0 ? { partialErrors } : {}),
		};
	}

	const settled = await mapSettledBounded(targets, async (target) => {
		const offset = consumed[target.projectId] ?? 0;
		const sourcePage = Math.floor(offset / API_PAGE_SIZE) + 1;
		const skip = offset % API_PAGE_SIZE;
		const params = new URLSearchParams({
			scope: "all",
			state: input.includeClosed ? "all" : "opened",
			order_by: "updated_at",
			sort: "desc",
			per_page: String(API_PAGE_SIZE),
			page: String(sourcePage),
		});
		if (query) params.set("search", query);
		const raw = await deps.client.api<unknown>(
			target.repo,
			`${issuesEndpoint(target.repo)}?${params}`,
		);
		const items = z.array(issueSchema).parse(raw);
		return {
			items: items.slice(skip).map((item) => toResult(item, target)),
			pageFull: items.length === API_PAGE_SIZE,
		};
	});
	const candidates: GitLabIssueResult[] = [];
	settled.forEach((result, index) => {
		const target = targets[index];
		if (!target) return;
		if (result.status === "rejected") {
			partialErrors.push({
				projectId: target.projectId,
				message: failureMessage(result.reason),
			});
		} else {
			candidates.push(...result.value.items);
		}
	});
	if (settled.every((result) => result.status === "rejected")) {
		const failure = settled.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (failure) throw failure.reason;
	}
	candidates.sort((left, right) =>
		(right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
	);
	const issues = candidates.slice(0, limit);
	const nextConsumed = { ...consumed };
	for (const issue of issues) {
		nextConsumed[issue.projectId] = (nextConsumed[issue.projectId] ?? 0) + 1;
	}
	const hasNextPage =
		candidates.length > issues.length ||
		settled.some(
			(result) => result.status === "fulfilled" && result.value.pageFull,
		);
	return {
		issues,
		hasNextPage,
		page,
		...(hasNextPage
			? { nextCursor: encodeCursor(fingerprint, nextConsumed) }
			: {}),
		...(partialErrors.length > 0 ? { partialErrors } : {}),
	};
}

export const searchGitLabIssues = protectedProcedure
	.input(gitlabIssuesSearchInputSchema)
	.query(async ({ ctx, input }) =>
		searchGitLabIssuesForProjects(input, {
			resolve: (projectId) => resolveGitLabRepo(ctx, projectId),
			client: ctx.gitlab,
		}),
	);
