import { beforeEach, describe, expect, mock, test } from "bun:test";
import { cloudPullRequestRead } from "../toPullRequestDetail/fixtures";
import {
	mergePullRequest,
	type PullRequestGateways,
	type PullRequestTarget,
	readPullRequestDetail,
	setPullRequestThreadResolution,
} from "./pullRequestClient";

function gateway() {
	return {
		status: { query: mock(async () => ({ available: false })) },
		getPullRequestDetail: { query: mock(async () => cloudPullRequestRead()) },
		getPullRequestThreads: {
			query: mock(async () => ({ reviewThreads: [], fetchFailed: false })),
		},
		getPullRequestDiff: { query: mock(async () => ({ patch: "" })) },
		addPullRequestComment: { mutate: mock(async () => ({})) },
		replyToPullRequestThread: { mutate: mock(async () => ({})) },
		setPullRequestThreadResolution: { mutate: mock(async () => ({})) },
		mergePullRequest: { mutate: mock(async () => ({})) },
		setPullRequestState: { mutate: mock(async () => ({})) },
		setPullRequestDraft: { mutate: mock(async () => ({})) },
	};
}

let local = gateway();
let cloud = gateway();
const deps = {
	local: () => local,
	cloud: () => cloud,
} as unknown as PullRequestGateways;
const target: PullRequestTarget = {
	organizationId: "org",
	repoFullName: "owner/repo",
	prNumber: 12,
};

beforeEach(() => {
	local = gateway();
	cloud = gateway();
});

describe("who acts on GitHub", () => {
	test("the login on this machine, when there is one", async () => {
		local.status.query.mockResolvedValue({ available: true });
		await mergePullRequest(target, { mergeMethod: "squash" }, deps);
		expect(local.mergePullRequest.mutate).toHaveBeenCalledWith({
			repoFullName: "owner/repo",
			number: 12,
			mergeMethod: "squash",
		});
		expect(cloud.mergePullRequest.mutate).not.toHaveBeenCalled();
	});

	test("the Superset connection otherwise, by organization", async () => {
		expect((await readPullRequestDetail(target, deps)).title).toBe(
			"cloud title",
		);
		expect(cloud.getPullRequestDetail.query).toHaveBeenCalledWith({
			organizationId: "org",
			repoFullName: "owner/repo",
			number: 12,
			activity: true,
		});
		expect(local.getPullRequestDetail.query).not.toHaveBeenCalled();
	});

	test("a refusal is final: nothing retries it under another identity", async () => {
		local.status.query.mockResolvedValue({ available: true });
		const refused = Object.assign(new Error("Not allowed"), {
			data: { code: "FORBIDDEN" },
		});
		local.setPullRequestThreadResolution.mutate.mockRejectedValueOnce(refused);
		await expect(
			setPullRequestThreadResolution(
				target,
				{ threadId: "T1", resolved: true },
				deps,
			),
		).rejects.toBe(refused);
		expect(cloud.setPullRequestThreadResolution.mutate).not.toHaveBeenCalled();
	});

	test("a pull request with no known repository cannot be acted on", async () => {
		await expect(
			readPullRequestDetail({ ...target, repoFullName: null }, deps),
		).rejects.toThrow("repository is unknown");
	});
});
