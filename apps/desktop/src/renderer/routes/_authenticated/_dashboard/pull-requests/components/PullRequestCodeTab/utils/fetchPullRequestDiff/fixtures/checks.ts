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
		expect(getPullRequestDiff).not.toHaveBeenCalled();
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
		getDiffByRepo.mockRejectedValue(new Error("Host offline"));
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

test("tries repository gh after project lookup fails, without requiring the API", async () => {
	getDiff.mockRejectedValue(new Error("Project not set up"));
	expect(
		await fetchPullRequestDiff({
			...input,
			projectId: "project",
			organizationId: null,
		}),
	).toEqual({ patch: "repo diff" });
	expect(getDiff).toHaveBeenCalledTimes(1);
	expect(getDiffByRepo).toHaveBeenCalledTimes(1);
	expect(getPullRequestDiff).not.toHaveBeenCalled();
});
test("an empty legacy diff is success, not a reason to fall back", async () => {
	getDiff.mockResolvedValue({ patch: "" });
	expect(
		await fetchPullRequestDiff({ ...input, projectId: "project" }),
	).toEqual({ patch: "" });
	expect(getDiffByRepo).not.toHaveBeenCalled();
	expect(getPullRequestDiff).not.toHaveBeenCalled();
});
test("legacy project-only requests work without repository metadata or an organization", async () => {
	expect(
		await fetchPullRequestDiff({
			...input,
			projectId: "project",
			repoFullName: null,
			organizationId: null,
		}),
	).toEqual({ patch: "project diff" });
	expect(getDiffByRepo).not.toHaveBeenCalled();
	expect(getPullRequestDiff).not.toHaveBeenCalled();
});
test("keeps the project error when no repository fallback is possible", async () => {
	const error = new Error("Project missing");
	getDiff.mockRejectedValue(error);
	await expect(
		fetchPullRequestDiff({
			...input,
			projectId: "project",
			repoFullName: null,
		}),
	).rejects.toBe(error);
	expect(getDiffByRepo).not.toHaveBeenCalled();
	expect(getPullRequestDiff).not.toHaveBeenCalled();
});
test("keeps the repository error when the organization is unavailable", async () => {
	const error = new Error("gh denied");
	getDiffByRepo.mockRejectedValue(error);
	await expect(
		fetchPullRequestDiff({ ...input, organizationId: null }),
	).rejects.toBe(error);
	expect(getPullRequestDiff).not.toHaveBeenCalled();
});
test("rejects missing fallback identity without issuing an API request", async () => {
	for (const missing of [{ organizationId: null }, { repoFullName: null }]) {
		await expect(
			fetchPullRequestDiff({ ...input, hostUrl: null, ...missing }),
		).rejects.toThrow("No GitHub repository");
	}
	expect(getPullRequestDiff).not.toHaveBeenCalled();
});

test("retains the repository gh failure when the cloud fallback also fails", async () => {
	const hostError = new Error("gh: diff exceeds the maximum number of lines");
	const cloudError = new Error("Not Found - installation access token");
	getDiffByRepo.mockRejectedValueOnce(hostError);
	getPullRequestDiff.mockRejectedValueOnce(cloudError);
	await expect(fetchPullRequestDiff(input)).rejects.toMatchObject({
		name: "AggregateError",
		message: `${hostError.message}\n${cloudError.message}`,
		errors: [hostError, cloudError],
	});
});

test("preserves the original cloud error when an older host lacks the endpoint", async () => {
	const hostError = Object.assign(new Error("Unsupported procedure"), {
		data: { code: "NOT_FOUND" },
	});
	const cloudError = new Error("Repository access denied");
	getDiffByRepo.mockRejectedValueOnce(hostError);
	getPullRequestDiff.mockRejectedValueOnce(cloudError);
	await expect(fetchPullRequestDiff(input)).rejects.toBe(cloudError);
});

test("preserves the original cloud error when no host was tried", async () => {
	const cloudError = new Error("Repository access denied");
	getPullRequestDiff.mockRejectedValueOnce(cloudError);
	await expect(fetchPullRequestDiff({ ...input, hostUrl: null })).rejects.toBe(
		cloudError,
	);
	expect(getDiffByRepo).not.toHaveBeenCalled();
});
