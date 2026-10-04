import { beforeEach, describe, expect, mock, test } from "bun:test";

const getDiff = mock(async (_input: unknown) => ({ patch: "project diff" }));
const getDiffByRepo = mock(async (_input: unknown) => ({ patch: "repo diff" }));
const getPullRequestDiff = mock(async (_input: unknown) => ({
	patch: "api diff",
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		pullRequests: {
			getDiff: { query: getDiff },
			getDiffByRepo: { query: getDiffByRepo },
		},
	}),
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpcClient: {
		integration: {
			github: { getPullRequestDiff: { query: getPullRequestDiff } },
		},
	},
}));

const { fetchPullRequestDiff } = await import("../fetchPullRequestDiff");

const input = {
	projectId: null,
	hostUrl: "http://host.test",
	repoFullName: "other/repo",
	prNumber: 12,
	organizationId: "org",
};

beforeEach(() => {
	getDiff.mockReset().mockResolvedValue({ patch: "project diff" });
	getDiffByRepo.mockReset().mockResolvedValue({ patch: "repo diff" });
	getPullRequestDiff.mockReset().mockResolvedValue({ patch: "api diff" });
});

describe("fetchPullRequestDiff", () => {
	test("uses the PR repository when the workspace project does not match", async () => {
		expect(await fetchPullRequestDiff(input)).toEqual({ patch: "repo diff" });
		expect(getDiffByRepo).toHaveBeenCalledWith({
			repoFullName: "other/repo",
			prNumber: 12,
		});
		expect(getDiff).not.toHaveBeenCalled();
		expect(getPullRequestDiff).not.toHaveBeenCalled();
	});

	test("keeps the legacy endpoint for matching projects on older hosts", async () => {
		expect(
			await fetchPullRequestDiff({ ...input, projectId: "project" }),
		).toEqual({
			patch: "project diff",
		});
		expect(getDiff).toHaveBeenCalledWith({
			projectId: "project",
			prNumber: 12,
		});
		expect(getDiffByRepo).not.toHaveBeenCalled();
	});

	test("falls back when an older host does not expose the new procedure", async () => {
		getDiffByRepo.mockRejectedValue(new Error("No procedure found"));
		expect(await fetchPullRequestDiff(input)).toEqual({ patch: "api diff" });
		expect(getPullRequestDiff).toHaveBeenCalledWith({
			organizationId: "org",
			repoFullName: "other/repo",
			number: 12,
		});
	});

	test("fetches from the API when no host is available", async () => {
		expect(await fetchPullRequestDiff({ ...input, hostUrl: null })).toEqual({
			patch: "api diff",
		});
		expect(getDiffByRepo).not.toHaveBeenCalled();
	});

	test("falls back when the matching project's host is unreachable", async () => {
		getDiff.mockRejectedValue(new Error("Host offline"));
		expect(
			await fetchPullRequestDiff({ ...input, projectId: "project" }),
		).toEqual({
			patch: "api diff",
		});
	});

	test("does not require the GitHub App when gh succeeds", async () => {
		expect(
			await fetchPullRequestDiff({ ...input, organizationId: null }),
		).toEqual({
			patch: "repo diff",
		});
		expect(getPullRequestDiff).not.toHaveBeenCalled();
	});

	test("surfaces a failed fallback instead of showing an empty diff", async () => {
		getDiffByRepo.mockRejectedValue(new Error("Host offline"));
		getPullRequestDiff.mockRejectedValue(new Error("Repository access denied"));
		await expect(fetchPullRequestDiff(input)).rejects.toThrow(
			"Repository access denied",
		);
	});
});
