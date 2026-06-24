import { describe, expect, it } from "bun:test";
import type { Octokit } from "@octokit/rest";
import { GitHubProviderClient } from "./github-provider-client";

const repo = { owner: "acme", name: "widget" };
const head = { owner: "acme", repo: "widget", branch: "feature" };

function fakeOctokit(): Octokit {
	return {
		rest: {
			pulls: {
				list: async () => ({ data: [] }),
				listReviews: async () => ({ data: [] }),
			},
			checks: { listForRef: async () => ({ data: { check_runs: [] } }) },
			repos: { listCommitStatusesForRef: async () => ({ data: [] }) },
		},
	} as unknown as Octokit;
}

describe("GitHubProviderClient orchestration", () => {
	it("uses gh first and does not touch Octokit when gh succeeds", async () => {
		let githubCalls = 0;
		const client = new GitHubProviderClient({
			execGh: async () => [],
			github: async () => {
				githubCalls++;
				return fakeOctokit();
			},
		});
		expect(await client.fetchPullRequestByHead(repo, head)).toBeNull();
		expect(githubCalls).toBe(0);
	});

	it("falls back to Octokit when gh throws", async () => {
		let githubCalls = 0;
		const client = new GitHubProviderClient({
			execGh: async () => {
				throw new Error("gh not authed");
			},
			github: async () => {
				githubCalls++;
				return fakeOctokit();
			},
		});
		expect(await client.fetchPullRequestByHead(repo, head)).toBeNull();
		expect(await client.fetchChecks(repo, "deadbeef")).toEqual([]);
		await client.fetchReviewDecision(repo, 1, "open");
		expect(githubCalls).toBe(3);
	});

	it("exposes provider + host identity", () => {
		const client = new GitHubProviderClient({
			execGh: async () => [],
			github: async () => fakeOctokit(),
		});
		expect(client.provider).toBe("github");
		expect(client.host).toBe("github.com");
	});

	// Contract: when BOTH gh and Octokit fail, the client propagates (does not
	// swallow). The caller (PullRequestRuntimeManager, wired in 2b-2) keeps the
	// outer try/catch that swallows, preserving the original behavior.
	it("propagates the Octokit error when both gh and Octokit fail", async () => {
		const client = new GitHubProviderClient({
			execGh: async () => {
				throw new Error("gh not authed");
			},
			github: async () => {
				throw new Error("token expired");
			},
		});
		await expect(client.fetchChecks(repo, "deadbeef")).rejects.toThrow(
			"token expired",
		);
	});
});

// ---------------------------------------------------------------------------
// fetchReviewState (§6 no-reduction model)
// ---------------------------------------------------------------------------

describe("GitHubProviderClient.fetchReviewState", () => {
	it("returns { provider: 'github', reviewDecision } pass-through without reduction", async () => {
		// gh CLI reviews endpoint returns an array of review objects.
		// One APPROVED review → mapReviewDecision produces "APPROVED".
		const client = new GitHubProviderClient({
			execGh: async () => [
				{
					user: { login: "alice" },
					state: "APPROVED",
					submitted_at: "2024-01-01T00:00:00Z",
				},
			],
			github: async () => {
				throw new Error("Octokit must not be called");
			},
		});

		const result = await client.fetchReviewState(repo, 42, "open");
		expect(result.provider).toBe("github");
		expect(result).toEqual({ provider: "github", reviewDecision: "APPROVED" });
	});

	it("falls back to Octokit for reviewDecision when gh fails, still wraps verbatim", async () => {
		// Make gh fail so Octokit path is taken; confirm the wrapper still works.
		let octokitCalled = false;
		const client = new GitHubProviderClient({
			execGh: async () => {
				throw new Error("gh not authed");
			},
			github: async () => {
				octokitCalled = true;
				return {
					rest: {
						pulls: {
							// fetchPullRequestReviewDecision uses listReviews — empty → REVIEW_REQUIRED
							listReviews: async () => ({ data: [] }),
						},
						checks: {
							listForRef: async () => ({ data: { check_runs: [] } }),
						},
						repos: {
							listCommitStatusesForRef: async () => ({ data: [] }),
						},
					},
				} as unknown as import("@octokit/rest").Octokit;
			},
		});

		const result = await client.fetchReviewState(repo, 42, "open");
		expect(octokitCalled).toBe(true);
		expect(result.provider).toBe("github");
		// No reviews → "REVIEW_REQUIRED" for an open PR
		expect(result).toEqual({
			provider: "github",
			reviewDecision: "REVIEW_REQUIRED",
		});
	});

	it("does not synthesize a cross-provider verdict — no 'approved' boolean field", async () => {
		const client = new GitHubProviderClient({
			// No reviews → mapReviewDecision returns "REVIEW_REQUIRED"
			execGh: async () => [],
			github: async () => {
				throw new Error("Octokit must not be called");
			},
		});

		const result = await client.fetchReviewState(repo, 1, "open");
		// The discriminated union must NOT have any synthesized field
		expect("approved" in result).toBe(false);
		expect("verdict" in result).toBe(false);
		// Must carry provider-native data unchanged
		expect(result.provider).toBe("github");
	});

	it("propagates CHANGES_REQUESTED verbatim without coercion", async () => {
		const client = new GitHubProviderClient({
			execGh: async () => [
				{
					user: { login: "bob" },
					state: "CHANGES_REQUESTED",
					submitted_at: "2024-01-01T00:00:00Z",
				},
			],
			github: async () => {
				throw new Error("Octokit must not be called");
			},
		});

		const result = await client.fetchReviewState(repo, 7, "open");
		expect(result).toEqual({
			provider: "github",
			reviewDecision: "CHANGES_REQUESTED",
		});
	});
});
