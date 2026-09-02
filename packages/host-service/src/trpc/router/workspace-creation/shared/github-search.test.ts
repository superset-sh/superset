import { describe, expect, test } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { GitCredentialProvider } from "../../../../runtime/git/types";
import {
	buildSearchQuery,
	chunkProjectRepos,
	collectChunkResults,
	GITHUB_SEARCH_QUERY_MAX_LENGTH,
	githubRateLimitError,
	githubRequestError,
	isGithubAuthError,
	isGithubNotFoundError,
	isGithubRateLimitError,
	mergeByUpdatedAtDesc,
	type ProjectRepo,
	projectIdForSearchItem,
	resolveProjectRepos,
} from "./github-search";

function projectRepo(
	projectId: string,
	owner: string,
	name: string,
): ProjectRepo {
	return { projectId, repo: { owner, name, repoPath: `/tmp/${name}` } };
}

describe("chunkProjectRepos", () => {
	test("keeps all repos in one chunk when the query fits", () => {
		const repos = [
			projectRepo("a", "octocat", "hello"),
			projectRepo("b", "octocat", "world"),
		];
		const chunks = chunkProjectRepos(repos, "is:pr is:open fix bug");
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toHaveLength(2);
	});

	test("splits when repo qualifiers would push the query past 256 chars", () => {
		const longName = "n".repeat(110);
		const repos = [
			projectRepo("a", "octo-long", longName),
			projectRepo("b", "octo-long", `${longName}2`),
		];
		const qualifiers = "is:pr is:open find me";
		const chunks = chunkProjectRepos(repos, qualifiers);
		expect(chunks).toHaveLength(2);
		for (const chunk of chunks) {
			expect(buildSearchQuery(chunk, qualifiers).length).toBeLessThanOrEqual(
				GITHUB_SEARCH_QUERY_MAX_LENGTH,
			);
		}
	});

	test("a single repo exceeding the limit still gets its own chunk", () => {
		const repos = [projectRepo("a", "o", "n".repeat(300))];
		const chunks = chunkProjectRepos(repos, "is:pr");
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toHaveLength(1);
	});

	test("packs exactly up to the boundary", () => {
		// Qualifiers are "repo:o/<name>", sized so the joined query is
		// exactly 256 chars (fits); one more char must split.
		const repos = [
			projectRepo("a", "o", "n".repeat(120)), // qualifier length 127
			projectRepo("b", "o", "n".repeat(121)), // qualifier length 128
		];
		expect(buildSearchQuery(repos, "")).toHaveLength(256);
		expect(chunkProjectRepos(repos, "")).toHaveLength(1);
		expect(chunkProjectRepos(repos, "q")).toHaveLength(2);
	});
});

describe("projectIdForSearchItem", () => {
	const chunk = [
		projectRepo("a", "octocat", "hello"),
		projectRepo("b", "octocat", "world"),
	];

	test("matches repository_url case-insensitively", () => {
		expect(
			projectIdForSearchItem(
				chunk,
				"https://api.github.com/repos/OctoCat/World",
			),
		).toBe("b");
	});

	test("returns null for repos outside the chunk", () => {
		expect(
			projectIdForSearchItem(chunk, "https://api.github.com/repos/some/other"),
		).toBeNull();
	});

	test("returns null when repository_url is missing in a multi-repo chunk", () => {
		expect(projectIdForSearchItem(chunk, undefined)).toBeNull();
	});

	test("single-repo chunks attribute without repository_url", () => {
		expect(
			projectIdForSearchItem([projectRepo("a", "octocat", "hello")], undefined),
		).toBe("a");
	});
});

describe("mergeByUpdatedAtDesc", () => {
	test("merges lists newest-first with null timestamps last", () => {
		const merged = mergeByUpdatedAtDesc([
			[
				{ id: 1, updatedAt: "2026-08-01T00:00:00Z" },
				{ id: 2, updatedAt: null },
			],
			[{ id: 3, updatedAt: "2026-08-02T00:00:00Z" }],
		]);
		expect(merged.map((item) => item.id)).toEqual([3, 1, 2]);
	});

	test("is stable for equal timestamps", () => {
		const merged = mergeByUpdatedAtDesc([
			[{ id: 1, updatedAt: "2026-08-01T00:00:00Z" }],
			[{ id: 2, updatedAt: "2026-08-01T00:00:00Z" }],
		]);
		expect(merged.map((item) => item.id)).toEqual([1, 2]);
	});
});

describe("rate-limit error detection", () => {
	test("matches gh CLI failure text without a status", () => {
		expect(
			isGithubRateLimitError(
				new Error("HTTP 403: API rate limit exceeded for user ID 1"),
			),
		).toBe(true);
	});

	test("matches gh CLI stderr", () => {
		expect(
			isGithubRateLimitError(
				Object.assign(new Error("Command failed: gh api search/issues"), {
					stderr: "gh: API rate limit exceeded (HTTP 403)",
				}),
			),
		).toBe(true);
	});

	test("matches REST 403/429 with rate-limit messages only", () => {
		expect(
			isGithubRateLimitError(
				Object.assign(new Error("API rate limit exceeded"), { status: 403 }),
			),
		).toBe(true);
		expect(
			isGithubRateLimitError(
				Object.assign(new Error("API rate limit exceeded"), { status: 429 }),
			),
		).toBe(true);
		// 500 mentioning rate limits is not a rate-limit response.
		expect(
			isGithubRateLimitError(
				Object.assign(new Error("API rate limit exceeded"), { status: 500 }),
			),
		).toBe(false);
		expect(isGithubRateLimitError(new Error("Validation Failed"))).toBe(false);
	});

	test("appends the reset time from X-RateLimit-Reset when parseable", () => {
		const epoch = 1_765_000_000;
		const error = githubRateLimitError(
			Object.assign(new Error("API rate limit exceeded"), {
				status: 403,
				response: { headers: { "x-ratelimit-reset": String(epoch) } },
			}),
		);
		expect(error.code).toBe("TOO_MANY_REQUESTS");
		expect(error.message).toBe(
			`GitHub API rate limit exceeded. Try again in a few minutes. Rate limit resets at ${new Date(epoch * 1000).toISOString()}.`,
		);
	});

	test("omits the reset suffix when no reset time is parseable", () => {
		const error = githubRateLimitError(new Error("rate limit exceeded"));
		expect(error.message).toBe(
			"GitHub API rate limit exceeded. Try again in a few minutes.",
		);
	});
});

describe("resolveProjectRepos", () => {
	const webRepo: ProjectRepo["repo"] = {
		owner: "octocat",
		name: "web",
		repoPath: "/tmp/web",
	};
	const apiRepo: ProjectRepo["repo"] = {
		owner: "octocat",
		name: "api",
		repoPath: "/tmp/api",
	};
	const resolve = async (projectId: string) => {
		if (projectId === "web") return webRepo;
		if (projectId === "api") return apiRepo;
		throw new Error(`Repository ${projectId} has no GitHub remote`);
	};

	test("batch requests skip unresolvable projects", async () => {
		expect(
			await resolveProjectRepos(["web", "no-remote", "api"], true, resolve),
		).toEqual([
			{ projectId: "web", repo: webRepo },
			{ projectId: "api", repo: apiRepo },
		]);
	});

	test("batch requests surface the failure when nothing resolves", async () => {
		expect(resolveProjectRepos(["no-remote"], true, resolve)).rejects.toThrow(
			"no GitHub remote",
		);
	});

	test("single-project requests propagate resolution errors", async () => {
		expect(resolveProjectRepos(["no-remote"], false, resolve)).rejects.toThrow(
			"no GitHub remote",
		);
	});
});

describe("collectChunkResults", () => {
	const rateLimited = () =>
		Object.assign(new Error("API rate limit exceeded for user"), {
			status: 403,
		});

	test("keeps the chunks that answered and reports the failures", async () => {
		const settled = await Promise.allSettled([
			Promise.resolve("web"),
			Promise.reject(
				new Error("Validation Failed: repositories cannot be searched"),
			),
			Promise.resolve("api"),
		]);
		const { results, failures } = collectChunkResults(settled);
		expect(results).toEqual(["web", "api"]);
		expect(failures).toHaveLength(1);
	});

	test("surfaces the failure when every chunk failed", async () => {
		const settled = await Promise.allSettled([
			Promise.reject(new Error("Connect Timeout Error")),
			Promise.reject(new Error("Bad credentials")),
		]);
		expect(() => collectChunkResults(settled)).toThrow("Connect Timeout Error");
	});

	test("surfaces a rate limit even when other chunks answered", async () => {
		const settled = await Promise.allSettled([
			Promise.resolve("web"),
			Promise.reject(rateLimited()),
		]);
		expect(() => collectChunkResults(settled)).toThrow("rate limit exceeded");
	});
});

describe("auth error detection", () => {
	test("matches Octokit 401s and gh bad-credentials text", () => {
		expect(
			isGithubAuthError(
				Object.assign(
					new Error("Bad credentials - https://docs.github.com/rest"),
					{ status: 401 },
				),
			),
		).toBe(true);
		expect(
			isGithubAuthError(
				Object.assign(new Error("Command failed: gh api search/issues"), {
					stderr: "gh: Bad credentials (HTTP 401)",
				}),
			),
		).toBe(true);
		expect(isGithubAuthError(new Error("HTTP 401: Unauthorized"))).toBe(true);
		expect(isGithubAuthError(new Error("Validation Failed"))).toBe(false);
		expect(
			isGithubAuthError(
				Object.assign(new Error("rate limit exceeded"), { status: 403 }),
			),
		).toBe(false);
	});
});

describe("githubRequestError", () => {
	const credentials: GitCredentialProvider = {
		getCredentials: async () => ({ env: {} }),
		getToken: async () => null,
		credentialRemedy: () => "REMEDY",
	};

	test("a 401 carries the provider's remedy", () => {
		const error = githubRequestError(
			Object.assign(new Error("Bad credentials"), { status: 401 }),
			credentials,
		) as TRPCError;
		expect(error.code).toBe("UNAUTHORIZED");
		expect(error.message).toBe("REMEDY");
	});

	test("a rate limit stays a rate limit", () => {
		const error = githubRequestError(
			Object.assign(new Error("API rate limit exceeded"), { status: 403 }),
			credentials,
		) as TRPCError;
		expect(error.code).toBe("TOO_MANY_REQUESTS");
	});

	test("anything else passes through untouched", () => {
		const original = new Error("Validation Failed");
		expect(githubRequestError(original, credentials)).toBe(original);
	});
});

describe("isGithubNotFoundError", () => {
	test("matches Octokit 404s and gh could-not-resolve text", () => {
		expect(
			isGithubNotFoundError(
				Object.assign(new Error("Not Found"), { status: 404 }),
			),
		).toBe(true);
		expect(
			isGithubNotFoundError(
				new Error(
					"GraphQL: Could not resolve to a PullRequest with the number of 9. (repository.pullRequest)",
				),
			),
		).toBe(true);
		expect(isGithubNotFoundError(new Error("rate limit exceeded"))).toBe(false);
	});
});
