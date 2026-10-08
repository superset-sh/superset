import { describe, expect, it } from "bun:test";
import { describePullRequestMergeStatus } from "./describePullRequestMergeStatus";

describe("describePullRequestMergeStatus", () => {
	const base = { state: "open" as const, isDraft: false, baseBranch: "main" };

	it("ranks the terminal states and draft before mergeability", () => {
		expect(
			describePullRequestMergeStatus({
				...base,
				state: "merged",
				mergeability: "conflicting",
			}).kind,
		).toBe("merged");
		expect(
			describePullRequestMergeStatus({ ...base, state: "closed" }).kind,
		).toBe("closed");
		expect(
			describePullRequestMergeStatus({
				...base,
				isDraft: true,
				mergeability: "mergeable",
			}).kind,
		).toBe("draft");
	});

	it("maps mergeability, naming the base on a conflict", () => {
		expect(
			describePullRequestMergeStatus({ ...base, mergeability: "mergeable" }),
		).toEqual({ tone: "success", kind: "mergeable" });
		expect(
			describePullRequestMergeStatus({ ...base, mergeability: "conflicting" }),
		).toEqual({ tone: "conflict", kind: "conflicting", baseBranch: "main" });
		expect(describePullRequestMergeStatus(base).kind).toBe("unknown");
	});
});
