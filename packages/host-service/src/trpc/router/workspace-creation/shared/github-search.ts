import { TRPCError } from "@trpc/server";
import type { GitCredentialProvider } from "../../../../runtime/git/types";
import type { ResolvedGithubRepo } from "./project-helpers";

/** A requested project paired with the repo its local remote points at. */
export interface ProjectRepo {
	projectId: string;
	repo: ResolvedGithubRepo;
}

// GitHub rejects Search API queries longer than 256 characters, so
// multi-repo searches must chunk their `repo:` qualifiers.
export const GITHUB_SEARCH_QUERY_MAX_LENGTH = 256;

/**
 * Resolve every requested project to its GitHub repo. Single-project
 * requests propagate resolution errors (the caller asked about exactly that
 * repo); batch requests skip unresolvable projects (e.g. no GitHub remote)
 * so one misconfigured repo cannot blank every other repository's results —
 * unless nothing resolves, in which case the first failure surfaces.
 */
export async function resolveProjectRepos(
	projectIds: string[],
	isBatch: boolean,
	resolve: (projectId: string) => Promise<ResolvedGithubRepo>,
): Promise<ProjectRepo[]> {
	if (!isBatch) {
		const projectId = projectIds[0];
		if (projectId === undefined) return [];
		return [{ projectId, repo: await resolve(projectId) }];
	}
	const settled = await Promise.allSettled(
		projectIds.map(async (projectId) => ({
			projectId,
			repo: await resolve(projectId),
		})),
	);
	const resolved = settled.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : [],
	);
	if (resolved.length === 0 && settled.length > 0) {
		const firstFailure = settled.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (firstFailure) throw firstFailure.reason;
	}
	return resolved;
}

export function buildSearchQuery(
	chunk: ProjectRepo[],
	qualifiers: string,
): string {
	return [
		...chunk.map(({ repo }) => `repo:${repo.owner}/${repo.name}`),
		qualifiers,
	]
		.filter(Boolean)
		.join(" ");
}

/**
 * Split repos into chunks whose final query (`repo:` qualifiers plus
 * `qualifiers`) stays within GitHub's 256-char search-query limit. A single
 * repo that exceeds the limit on its own still gets a chunk — GitHub
 * rejects that query exactly as it would today.
 */
export function chunkProjectRepos(
	projectRepos: ProjectRepo[],
	qualifiers: string,
): ProjectRepo[][] {
	const chunks: ProjectRepo[][] = [];
	let current: ProjectRepo[] = [];
	let currentLength = 0;
	const suffixLength = qualifiers.length > 0 ? qualifiers.length + 1 : 0;
	for (const projectRepo of projectRepos) {
		const qualifier = `repo:${projectRepo.repo.owner}/${projectRepo.repo.name}`;
		const addedLength =
			current.length === 0 ? qualifier.length : qualifier.length + 1;
		if (
			current.length > 0 &&
			currentLength + addedLength + suffixLength >
				GITHUB_SEARCH_QUERY_MAX_LENGTH
		) {
			chunks.push(current);
			current = [projectRepo];
			currentLength = qualifier.length;
		} else {
			current.push(projectRepo);
			currentLength += addedLength;
		}
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

/**
 * Keep the chunks that answered. A chunk fails on its own terms — GitHub
 * rejects the whole query when it names a repo the token cannot see, a
 * request times out — and one such failure must not blank the repos that
 * did answer. The failure only surfaces when every chunk failed, so a total
 * outage still reports rather than returning a silently empty page.
 */
export function collectChunkResults<T>(settled: PromiseSettledResult<T>[]): {
	results: T[];
	failures: unknown[];
} {
	const results = settled.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : [],
	);
	const failures = settled.flatMap((result) =>
		result.status === "rejected" ? [result.reason] : [],
	);
	for (const failure of failures) {
		// A rate limit is account-wide, not per-chunk: keeping a partial page
		// would hide why the rest is missing and would flap between polls.
		if (isGithubRateLimitError(failure)) throw failure;
	}
	if (results.length === 0 && failures.length > 0) throw failures[0];
	return { results, failures };
}

// REST search items carry `repository_url` like
// https://api.github.com/repos/<owner>/<name>.
const REPOSITORY_URL_RE = /\/repos\/([^/]+)\/([^/]+)\/?$/;

/**
 * Attribute a search item to the requested project it belongs to. A
 * single-repo chunk is already scoped by its `repo:` qualifier; multi-repo
 * chunks match the item's `repository_url` case-insensitively. Returns null
 * when the item maps to no requested project (callers drop it).
 */
export function projectIdForSearchItem(
	chunk: ProjectRepo[],
	repositoryUrl: string | undefined,
): string | null {
	if (chunk.length === 1) return chunk[0]?.projectId ?? null;
	const match = repositoryUrl?.match(REPOSITORY_URL_RE);
	if (!match) return null;
	const key = `${match[1]}/${match[2]}`.toLowerCase();
	for (const { projectId, repo } of chunk) {
		if (`${repo.owner}/${repo.name}`.toLowerCase() === key) return projectId;
	}
	return null;
}

/**
 * Merge per-chunk result pages into one list sorted by `updatedAt` desc.
 * The sort is stable, so ties (and missing timestamps, which sort last)
 * keep their incoming order.
 */
export function mergeByUpdatedAtDesc<T extends { updatedAt: string | null }>(
	itemLists: T[][],
): T[] {
	return itemLists.flat().sort((a, b) => {
		const left = a.updatedAt ?? "";
		const right = b.updatedAt ?? "";
		if (left === right) return 0;
		return left < right ? 1 : -1;
	});
}

export function formatRepoList(projectRepos: ProjectRepo[]): string {
	return projectRepos
		.map(({ repo }) => `${repo.owner}/${repo.name}`)
		.join(", ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function errorText(error: unknown): string {
	if (typeof error === "string") return error;
	if (!isRecord(error)) return "";
	const parts: string[] = [];
	if (typeof error.message === "string") parts.push(error.message);
	// execFile errors carry the gh CLI's stderr separately from `message`.
	if (typeof error.stderr === "string") parts.push(error.stderr);
	return parts.join("\n");
}

/**
 * REST rate-limit failures are 403/429 responses whose message mentions
 * "rate limit"; gh CLI failures surface the same text without a status.
 */
export function isGithubRateLimitError(error: unknown): boolean {
	if (!/rate limit/i.test(errorText(error))) return false;
	const status =
		isRecord(error) && typeof error.status === "number" ? error.status : null;
	return status === null || status === 403 || status === 429;
}

function parseRateLimitReset(error: unknown): Date | null {
	if (isRecord(error) && isRecord(error.response)) {
		const headers = error.response.headers;
		if (isRecord(headers)) {
			const header = headers["x-ratelimit-reset"];
			const epoch =
				typeof header === "number"
					? header
					: typeof header === "string"
						? Number.parseInt(header, 10)
						: Number.NaN;
			if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000);
		}
	}
	const match = errorText(error).match(/x-ratelimit-reset[:=\s]+(\d{9,11})/i);
	const epochText = match?.[1];
	if (epochText) return new Date(Number.parseInt(epochText, 10) * 1000);
	return null;
}

export function githubRateLimitError(error: unknown): TRPCError {
	const resetAt = parseRateLimitReset(error);
	const resetSuffix = resetAt
		? ` Rate limit resets at ${resetAt.toISOString()}.`
		: "";
	return new TRPCError({
		code: "TOO_MANY_REQUESTS",
		message: `GitHub API rate limit exceeded. Try again in a few minutes.${resetSuffix}`,
		cause: error,
	});
}

/**
 * Rejected-credential failures: Octokit throws a 401 RequestError ("Bad
 * credentials"); the gh CLI prints the same text (or "HTTP 401") with no
 * status field.
 */
export function isGithubAuthError(error: unknown): boolean {
	if (isRecord(error) && error.status === 401) return true;
	return /bad credentials|\bHTTP 401\b/i.test(errorText(error));
}

/**
 * Classify a search failure for the client. A raw "Bad credentials" reads
 * like a broken GitHub App integration, so a 401 has to say which
 * credential GitHub refused and where that credential lives (#6832).
 * Anything unrecognized passes through untouched.
 */
export function githubRequestError(
	error: unknown,
	credentials: GitCredentialProvider,
): unknown {
	if (isGithubRateLimitError(error)) return githubRateLimitError(error);
	if (isGithubAuthError(error)) {
		return new TRPCError({
			code: "UNAUTHORIZED",
			message: credentials.credentialRemedy("github.com", "rejected"),
			cause: error,
		});
	}
	return error;
}

/**
 * Multi-repo direct lookups skip repos that simply don't have the number:
 * Octokit throws a 404; gh prints "Could not resolve to a PullRequest…".
 */
export function isGithubNotFoundError(error: unknown): boolean {
	if (isRecord(error) && error.status === 404) return true;
	return /could not resolve to|\bnot found\b|HTTP 404/i.test(errorText(error));
}
