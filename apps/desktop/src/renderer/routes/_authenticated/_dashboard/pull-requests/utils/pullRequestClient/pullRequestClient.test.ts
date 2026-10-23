import { beforeEach, describe, expect, mock, test } from "bun:test";
import { cloudPullRequestRead } from "../fromCloudPullRequest/fixtures";
import {
	addPullRequestComment,
	canActOnPullRequest,
	mergePullRequest,
	type PullRequestGateways,
	type PullRequestTarget,
	readPullRequestContent,
	readPullRequestDiff,
	readPullRequestThreads,
	setPullRequestThreadResolution,
} from "./pullRequestClient";

const hostContent = {
	number: 12,
	url: "https://github.com/owner/repo/pull/12",
	title: "host title",
	state: "open",
	checks: [],
};
const cloud = {
	getPullRequestDetail: { query: mock(async () => cloudPullRequestRead()) },
	getPullRequestThreads: {
		query: mock(async () => ({ reviewThreads: [], fetchFailed: false })),
	},
	getPullRequestDiff: { query: mock(async () => ({ patch: "cloud diff" })) },
	addPullRequestComment: { mutate: mock(async () => ({ id: 1 })) },
	mergePullRequest: { mutate: mock(async () => ({ merged: true })) },
	setPullRequestThreadResolution: {
		mutate: mock(async () => ({ isResolved: true })),
	},
};
const host = {
	getContent: { query: mock(async () => hostContent) },
	getContentByRepo: {
		query: mock(async () => ({ ...hostContent, title: "repository title" })),
	},
	getThreads: {
		query: mock(async () => ({ reviewThreads: [], fetchFailed: true })),
	},
	getDiff: { query: mock(async () => ({ patch: "project diff" })) },
	getDiffByRepo: { query: mock(async () => ({ patch: "repo diff" })) },
	addComment: { mutate: mock(async () => ({ ok: true })) },
	mergePR: { mutate: mock(async () => ({})) },
	setThreadResolution: { mutate: mock(async () => ({})) },
};
const hostFor = mock((_hostUrl: string) => host);
const deps = {
	cloud: () => cloud,
	host: hostFor,
} as unknown as PullRequestGateways;

const target: PullRequestTarget = {
	organizationId: "org",
	repoFullName: "owner/repo",
	prNumber: 12,
	host: { hostUrl: "http://host.test", projectId: "project" },
};
const cannotAct = Object.assign(new Error("Connect GitHub"), {
	data: { code: "PRECONDITION_FAILED" },
});
const refused = Object.assign(new Error("not mergeable"), {
	data: { code: "CONFLICT" },
});

beforeEach(() => {
	for (const gateway of [cloud, host]) {
		for (const procedure of Object.values(gateway)) {
			for (const call of Object.values(procedure) as { mockClear(): void }[])
				call.mockClear();
		}
	}
	hostFor.mockClear();
});

describe("reads", () => {
	test("the cloud answers first, as the viewer, without touching the host", async () => {
		expect(await readPullRequestContent(target, deps)).toMatchObject({
			title: "cloud title",
		});
		expect(cloud.getPullRequestDetail.query).toHaveBeenCalledWith({
			organizationId: "org",
			repoFullName: "owner/repo",
			number: 12,
			activity: true,
		});
		expect(hostFor).not.toHaveBeenCalled();
	});

	test("a cloud that cannot act yields to the project's host, then the repository", async () => {
		cloud.getPullRequestDetail.query.mockRejectedValueOnce(cannotAct);
		expect(await readPullRequestContent(target, deps)).toMatchObject({
			title: "host title",
		});
		expect(host.getContent.query).toHaveBeenCalledWith({
			projectId: "project",
			prNumber: 12,
		});

		cloud.getPullRequestDetail.query.mockRejectedValueOnce(
			new Error(
				'No procedure found on path "integration.github.getPullRequestDetail"',
			),
		);
		expect(
			await readPullRequestContent(
				{ ...target, host: { hostUrl: "http://host.test", projectId: null } },
				deps,
			),
		).toMatchObject({ title: "repository title" });
		expect(host.getContentByRepo.query).toHaveBeenCalledWith({
			repoFullName: "owner/repo",
			prNumber: 12,
		});
	});

	test("without an organization the host is the only source", async () => {
		expect(
			await readPullRequestContent({ ...target, organizationId: null }, deps),
		).toMatchObject({ title: "host title" });
		expect(cloud.getPullRequestDetail.query).not.toHaveBeenCalled();
	});

	test("a quiet cloud miss is dropped from the error; two real failures are both reported", async () => {
		cloud.getPullRequestDetail.query.mockRejectedValueOnce(cannotAct);
		host.getContent.query.mockRejectedValueOnce(new Error("gh offline"));
		host.getContentByRepo.query.mockRejectedValueOnce(new Error("gh offline"));
		await expect(readPullRequestContent(target, deps)).rejects.toThrow(
			"gh offline",
		);

		cloud.getPullRequestDetail.query.mockRejectedValueOnce(
			new Error("Access denied"),
		);
		host.getContent.query.mockRejectedValueOnce(new Error("gh offline"));
		host.getContentByRepo.query.mockRejectedValueOnce(new Error("gh offline"));
		const error = await readPullRequestContent(target, deps).catch((e) => e);
		expect(error).toBeInstanceOf(AggregateError);
		expect(error.message).toBe("Access denied\ngh offline\ngh offline");
	});

	test("nothing to read from is an error, not empty content", async () => {
		await expect(
			readPullRequestContent(
				{
					organizationId: null,
					repoFullName: "owner/repo",
					prNumber: 12,
					host: null,
				},
				deps,
			),
		).rejects.toThrow("No GitHub repository available");
	});

	test("threads and diff follow the same order", async () => {
		expect(await readPullRequestThreads(target, deps)).toEqual({
			reviewThreads: [],
			fetchFailed: false,
		});
		expect(await readPullRequestDiff(target, deps)).toEqual({
			patch: "cloud diff",
		});
		cloud.getPullRequestThreads.query.mockRejectedValueOnce(cannotAct);
		cloud.getPullRequestDiff.query.mockRejectedValueOnce(cannotAct);
		expect(await readPullRequestThreads(target, deps)).toEqual({
			reviewThreads: [],
			fetchFailed: true,
		});
		expect(await readPullRequestDiff(target, deps)).toEqual({
			patch: "project diff",
		});
	});
});

describe("writes", () => {
	test("post as the viewer through the cloud", async () => {
		await addPullRequestComment(target, "hello", deps);
		expect(cloud.addPullRequestComment.mutate).toHaveBeenCalledWith({
			organizationId: "org",
			repoFullName: "owner/repo",
			number: 12,
			body: "hello",
		});
		expect(host.addComment.mutate).not.toHaveBeenCalled();
	});

	test("fall back to the host's gh only when the cloud could not act at all", async () => {
		cloud.mergePullRequest.mutate.mockRejectedValueOnce(cannotAct);
		await mergePullRequest(target, { mergeMethod: "squash" }, deps);
		expect(host.mergePR.mutate).toHaveBeenCalledWith({
			projectId: "project",
			prNumber: 12,
			mergeMethod: "squash",
		});

		cloud.mergePullRequest.mutate.mockRejectedValueOnce(refused);
		await expect(
			mergePullRequest(target, { mergeMethod: "squash" }, deps),
		).rejects.toBe(refused);
		expect(host.mergePR.mutate).toHaveBeenCalledTimes(1);
	});

	test("a host without the project cannot stand in, except for thread resolution", async () => {
		const noProject = {
			...target,
			host: { hostUrl: "http://host.test", projectId: null },
		};
		cloud.addPullRequestComment.mutate.mockRejectedValueOnce(cannotAct);
		await expect(addPullRequestComment(noProject, "x", deps)).rejects.toBe(
			cannotAct,
		);
		cloud.setPullRequestThreadResolution.mutate.mockRejectedValueOnce(
			cannotAct,
		);
		await setPullRequestThreadResolution(
			noProject,
			{ threadId: "T1", resolved: true },
			deps,
		);
		expect(host.setThreadResolution.mutate).toHaveBeenCalledWith({
			threadId: "T1",
			resolved: true,
		});
	});

	test("acting needs a repository the cloud can name or a project on a host", () => {
		expect(canActOnPullRequest(target)).toBe(true);
		expect(
			canActOnPullRequest({ ...target, organizationId: null, host: null }),
		).toBe(false);
		expect(
			canActOnPullRequest({
				...target,
				organizationId: null,
				host: { hostUrl: "http://host.test", projectId: "project" },
			}),
		).toBe(true);
	});
});
