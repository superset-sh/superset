import { describe, expect, test } from "bun:test";
import type { GitHubStatus } from "@superset/local-db";
import { categorizePR } from "./map-pr-state";

function makeStatus(
	overrides: Partial<{
		pr: Partial<NonNullable<GitHubStatus["pr"]>> | null;
	}> = {},
): GitHubStatus {
	const base: GitHubStatus = {
		repoUrl: "https://github.com/org/repo",
		branchExistsOnRemote: true,
		lastRefreshed: Date.now(),
		pr: null,
	};

	if (overrides.pr === null || overrides.pr === undefined) {
		return { ...base, pr: overrides.pr ?? null };
	}

	return {
		...base,
		pr: {
			number: 1,
			title: "test",
			url: "https://github.com/org/repo/pull/1",
			state: "open",
			additions: 0,
			deletions: 0,
			reviewDecision: "pending",
			checksStatus: "none",
			checks: [],
			...overrides.pr,
		},
	};
}

describe("mapPRState", () => {
	test("returns no-pr when pr is null", () => {
		expect(categorizePR(makeStatus({ pr: null }))).toBe("no-pr");
	});

	test("returns draft for draft PRs", () => {
		expect(categorizePR(makeStatus({ pr: { state: "draft" } }))).toBe("draft");
	});

	test("returns in-review for open PRs without approval", () => {
		expect(
			categorizePR(
				makeStatus({ pr: { state: "open", reviewDecision: "pending" } }),
			),
		).toBe("in-review");
	});

	test("returns in-review for open PRs with changes requested", () => {
		expect(
			categorizePR(
				makeStatus({
					pr: { state: "open", reviewDecision: "changes_requested" },
				}),
			),
		).toBe("in-review");
	});

	test("returns approved for open PRs with approved review", () => {
		expect(
			categorizePR(
				makeStatus({ pr: { state: "open", reviewDecision: "approved" } }),
			),
		).toBe("approved");
	});

	test("returns merged for merged PRs", () => {
		expect(categorizePR(makeStatus({ pr: { state: "merged" } }))).toBe(
			"merged",
		);
	});

	test("returns closed for closed PRs", () => {
		expect(categorizePR(makeStatus({ pr: { state: "closed" } }))).toBe(
			"closed",
		);
	});

	test("does not return approved for draft PRs even with approved review", () => {
		expect(
			categorizePR(
				makeStatus({ pr: { state: "draft", reviewDecision: "approved" } }),
			),
		).toBe("draft");
	});
});
