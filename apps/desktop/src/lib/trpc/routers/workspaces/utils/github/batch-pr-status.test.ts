import { describe, expect, test } from "bun:test";
import {
	type GHGraphQLPRNode,
	GHGraphQLPRNodeSchema,
	GHPRResponseSchema,
	normalizeGraphQLPR,
} from "./types";

describe("GHGraphQLPRNodeSchema", () => {
	test("parses a full GraphQL PR node", () => {
		const raw = {
			number: 42,
			title: "Add batch PR fetching",
			url: "https://github.com/org/repo/pull/42",
			state: "OPEN",
			isDraft: false,
			mergedAt: null,
			additions: 150,
			deletions: 20,
			headRefOid: "abc123def456",
			headRefName: "feat/batch-pr",
			headRepository: { name: "repo" },
			headRepositoryOwner: { login: "org" },
			isCrossRepository: false,
			reviewDecision: "APPROVED",
			commits: {
				nodes: [
					{
						commit: {
							statusCheckRollup: {
								contexts: {
									nodes: [
										{
											__typename: "CheckRun",
											name: "CI",
											conclusion: "SUCCESS",
											detailsUrl: "https://ci.example.com/1",
											status: "COMPLETED",
										},
										{
											__typename: "StatusContext",
											context: "deploy/preview",
											state: "SUCCESS",
											targetUrl: "https://preview.example.com",
										},
									],
								},
							},
						},
					},
				],
			},
			reviewRequests: {
				nodes: [
					{
						requestedReviewer: {
							__typename: "User",
							login: "reviewer1",
						},
					},
					{
						requestedReviewer: {
							__typename: "Team",
							slug: "core-team",
							name: "Core Team",
						},
					},
				],
			},
		};

		const result = GHGraphQLPRNodeSchema.safeParse(raw);
		expect(result.success).toBe(true);
	});

	test("parses a minimal GraphQL PR node", () => {
		const raw = {
			number: 1,
			title: "Fix typo",
			url: "https://github.com/org/repo/pull/1",
			state: "MERGED",
			isDraft: false,
			mergedAt: "2026-03-01T00:00:00Z",
			additions: 1,
			deletions: 1,
			headRefOid: "deadbeef",
			headRefName: "fix/typo",
			headRepository: null,
			headRepositoryOwner: null,
			reviewDecision: null,
			commits: null,
			reviewRequests: null,
		};

		const result = GHGraphQLPRNodeSchema.safeParse(raw);
		expect(result.success).toBe(true);
	});

	test("rejects a CheckRun node with missing __typename", () => {
		const raw = {
			number: 1,
			title: "Bad",
			url: "https://github.com/org/repo/pull/1",
			state: "OPEN",
			isDraft: false,
			mergedAt: null,
			additions: 0,
			deletions: 0,
			headRefOid: "aaa",
			headRefName: "fix/bad",
			commits: {
				nodes: [
					{
						commit: {
							statusCheckRollup: {
								contexts: {
									nodes: [
										{ name: "CI", conclusion: "SUCCESS", status: "COMPLETED" },
									],
								},
							},
						},
					},
				],
			},
		};

		const result = GHGraphQLPRNodeSchema.safeParse(raw);
		expect(result.success).toBe(false);
	});
});

describe("normalizeGraphQLPR", () => {
	const basePRNode: GHGraphQLPRNode = {
		number: 42,
		title: "Test PR",
		url: "https://github.com/org/repo/pull/42",
		state: "OPEN",
		isDraft: false,
		mergedAt: null,
		additions: 100,
		deletions: 50,
		headRefOid: "abc123",
		headRefName: "feat/test",
		headRepository: { name: "repo" },
		headRepositoryOwner: { login: "org" },
		isCrossRepository: false,
		reviewDecision: "APPROVED",
		commits: null,
		reviewRequests: null,
	};

	test("converts basic fields", () => {
		const result = normalizeGraphQLPR(basePRNode);

		expect(result.number).toBe(42);
		expect(result.title).toBe("Test PR");
		expect(result.url).toBe("https://github.com/org/repo/pull/42");
		expect(result.state).toBe("OPEN");
		expect(result.isDraft).toBe(false);
		expect(result.additions).toBe(100);
		expect(result.deletions).toBe(50);
		expect(result.headRefOid).toBe("abc123");
		expect(result.headRefName).toBe("feat/test");
		expect(result.headRepository).toEqual({ name: "repo" });
		expect(result.headRepositoryOwner).toEqual({ login: "org" });
		expect(result.reviewDecision).toBe("APPROVED");
	});

	test("normalizes statusCheckRollup from nested GraphQL to flat array", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			commits: {
				nodes: [
					{
						commit: {
							statusCheckRollup: {
								contexts: {
									nodes: [
										{
											__typename: "CheckRun",
											name: "CI Build",
											conclusion: "SUCCESS",
											detailsUrl: "https://ci.example.com",
											status: "COMPLETED",
										},
										{
											__typename: "StatusContext",
											context: "deploy/staging",
											state: "PENDING",
											targetUrl: "https://staging.example.com",
										},
									],
								},
							},
						},
					},
				],
			},
		};

		const result = normalizeGraphQLPR(node);
		expect(result.statusCheckRollup).toHaveLength(2);

		const checkRun = result.statusCheckRollup?.[0];
		expect(checkRun?.name).toBe("CI Build");
		expect(checkRun?.conclusion).toBe("SUCCESS");
		expect(checkRun?.detailsUrl).toBe("https://ci.example.com");

		const statusCtx = result.statusCheckRollup?.[1];
		expect(statusCtx?.context).toBe("deploy/staging");
		expect(statusCtx?.state).toBe("PENDING");
		expect(statusCtx?.targetUrl).toBe("https://staging.example.com");
	});

	test("returns null statusCheckRollup when commits is null", () => {
		const result = normalizeGraphQLPR(basePRNode);
		expect(result.statusCheckRollup).toBeNull();
	});

	test("normalizes reviewRequests from nested GraphQL", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			reviewRequests: {
				nodes: [
					{
						requestedReviewer: {
							__typename: "User",
							login: "alice",
						},
					},
					{
						requestedReviewer: {
							__typename: "Team",
							slug: "backend",
							name: "Backend Team",
						},
					},
					null,
				],
			},
		};

		const result = normalizeGraphQLPR(node);
		expect(result.reviewRequests).toHaveLength(2);
		expect(result.reviewRequests?.[0]).toEqual({
			login: "alice",
			type: "User",
		});
		expect(result.reviewRequests?.[1]).toEqual({
			slug: "backend",
			name: "Backend Team",
			type: "Team",
		});
	});

	test("produces a shape compatible with GHPRResponseSchema", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			reviewDecision: "CHANGES_REQUESTED",
			commits: {
				nodes: [
					{
						commit: {
							statusCheckRollup: {
								contexts: {
									nodes: [
										{
											__typename: "CheckRun",
											name: "lint",
											conclusion: "FAILURE",
											detailsUrl: "https://ci.example.com/lint",
											status: "COMPLETED",
										},
									],
								},
							},
						},
					},
				],
			},
			reviewRequests: {
				nodes: [
					{
						requestedReviewer: {
							__typename: "User",
							login: "bob",
						},
					},
				],
			},
		};

		const normalized = normalizeGraphQLPR(node);
		const parseResult = GHPRResponseSchema.safeParse(normalized);
		expect(parseResult.success).toBe(true);
	});

	test("handles null reviewDecision", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			reviewDecision: null,
		};
		const result = normalizeGraphQLPR(node);
		expect(result.reviewDecision).toBeNull();
	});

	test("handles draft PR", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			isDraft: true,
			state: "OPEN",
		};
		const result = normalizeGraphQLPR(node);
		expect(result.isDraft).toBe(true);
		expect(result.state).toBe("OPEN");
	});

	test("handles merged PR with mergedAt timestamp", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			state: "MERGED",
			mergedAt: "2026-03-27T12:00:00Z",
		};
		const result = normalizeGraphQLPR(node);
		expect(result.state).toBe("MERGED");
		expect(result.mergedAt).toBe("2026-03-27T12:00:00Z");
	});

	test("filters out null entries in statusCheckRollup contexts", () => {
		const node: GHGraphQLPRNode = {
			...basePRNode,
			commits: {
				nodes: [
					{
						commit: {
							statusCheckRollup: {
								contexts: {
									nodes: [
										null,
										{
											__typename: "CheckRun",
											name: "test",
											conclusion: "SUCCESS",
											status: "COMPLETED",
										},
										null,
									],
								},
							},
						},
					},
				],
			},
		};

		const result = normalizeGraphQLPR(node);
		expect(result.statusCheckRollup).toHaveLength(1);
		expect(result.statusCheckRollup?.[0]?.name).toBe("test");
	});
});
