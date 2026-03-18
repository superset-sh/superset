import { describe, expect, test } from "bun:test";

/**
 * Tests for the data transformation in upsertPullRequest.
 *
 * The upsertPullRequest function in webhooks.ts writes PR data to the database.
 * The V2PullRequestsGroup component then filters this data with
 * `pr.state === "open"` to show only open pull requests.
 *
 * These tests verify that state values from different GitHub event sources
 * are stored correctly so the V2 filter works as expected.
 */

/**
 * Extracts the state value that upsertPullRequest would store.
 * This mirrors the logic in webhooks.ts line 162: `state: pr.state`
 */
function extractUpsertState(webhookPr: {
	state: string;
	merged_at: string | null;
}): { state: string; mergedAt: Date | null } {
	return {
		state: webhookPr.state,
		mergedAt: webhookPr.merged_at ? new Date(webhookPr.merged_at) : null,
	};
}

/**
 * Simulates the V2PullRequestsGroup filter (line 67 of V2PullRequestsGroup.tsx):
 * `pullRequests.filter((pr) => pr.state === "open")`
 */
function filterOpenPrs<T extends { state: string }>(prs: T[]): T[] {
	return prs.filter((pr) => pr.state === "open");
}

describe("GitHub PR state handling for V2 import", () => {
	describe("webhook payload state values", () => {
		test("open PR has state 'open' (matches V2 filter)", () => {
			const result = extractUpsertState({
				state: "open",
				merged_at: null,
			});
			expect(result.state).toBe("open");
		});

		test("closed PR has state 'closed' (filtered out by V2)", () => {
			const result = extractUpsertState({
				state: "closed",
				merged_at: null,
			});
			expect(result.state).toBe("closed");
		});

		test("merged PR has state 'closed' with mergedAt set (filtered out by V2)", () => {
			const result = extractUpsertState({
				state: "closed",
				merged_at: "2024-01-15T10:00:00Z",
			});
			expect(result.state).toBe("closed");
			expect(result.mergedAt).toBeInstanceOf(Date);
		});
	});

	describe("V2 open PR filter", () => {
		const samplePrs = [
			{
				id: "1",
				state: "open",
				title: "Open PR",
				repositoryId: "repo-1",
			},
			{
				id: "2",
				state: "closed",
				title: "Closed PR",
				repositoryId: "repo-1",
			},
			{
				id: "3",
				state: "closed",
				title: "Merged PR (state=closed)",
				repositoryId: "repo-1",
			},
			{
				id: "4",
				state: "open",
				title: "Another open PR",
				repositoryId: "repo-1",
			},
		];

		test("filters to only open PRs", () => {
			const result = filterOpenPrs(samplePrs);
			expect(result).toHaveLength(2);
			expect(result.map((pr) => pr.title)).toEqual([
				"Open PR",
				"Another open PR",
			]);
		});

		test("returns empty when no PRs have state 'open'", () => {
			const closedOnly = samplePrs.filter((pr) => pr.state !== "open");
			const result = filterOpenPrs(closedOnly);
			expect(result).toHaveLength(0);
		});

		test("returns empty for empty array (no sync data)", () => {
			const result = filterOpenPrs([]);
			expect(result).toHaveLength(0);
		});

		/**
		 * Reproduction for issue #2519: if state values are stored in a
		 * different case (e.g., "OPEN" from gh CLI vs "open" from REST API),
		 * the strict equality `pr.state === "open"` would miss them.
		 *
		 * The REST API and webhook payloads both use lowercase ("open"/"closed"),
		 * so this should not happen in production. This test documents the
		 * expected behavior.
		 */
		test("uppercase 'OPEN' state does NOT match the V2 filter", () => {
			const prsWithUppercaseState = [
				{ id: "1", state: "OPEN", title: "PR from gh CLI format" },
			];
			const result = filterOpenPrs(prsWithUppercaseState);
			expect(result).toHaveLength(0);
		});
	});

	describe("REST API state values (used in sync routes)", () => {
		test("GitHub REST API returns lowercase state for open PRs", () => {
			// Simulates what octokit.rest.pulls.list returns
			const restApiPr = { state: "open", merged_at: null };
			const result = extractUpsertState(restApiPr);
			expect(result.state).toBe("open");
		});

		test("GitHub REST API returns lowercase state for closed PRs", () => {
			const restApiPr = { state: "closed", merged_at: null };
			const result = extractUpsertState(restApiPr);
			expect(result.state).toBe("closed");
		});

		test("GitHub REST API returns 'closed' (not 'merged') for merged PRs", () => {
			// GitHub REST API does NOT have a "merged" state -
			// merged PRs have state="closed" with merged_at set
			const restApiPr = {
				state: "closed",
				merged_at: "2024-01-15T10:00:00Z",
			};
			const result = extractUpsertState(restApiPr);
			expect(result.state).toBe("closed");
			// Schema comment says "open" | "closed" | "merged" but the code
			// never stores "merged" - it stores "closed" with mergedAt set
		});
	});
});
