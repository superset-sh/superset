import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { projects, pullRequests, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("pullRequests router integration", () => {
	let host: TestHost;
	let repo: GitFixture;

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("getByWorkspaces returns [] for empty input", async () => {
		const result = await host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: [],
		});
		expect(result.workspaces).toEqual([]);
	});

	test("getByWorkspaces returns null pullRequest for workspace with no PR linked", async () => {
		const projectId = randomUUID();
		const workspaceId = randomUUID();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "feature/x",
			})
			.run();

		const result = await host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: [workspaceId],
		});
		expect(result.workspaces).toHaveLength(1);
		expect(result.workspaces[0].workspaceId).toBe(workspaceId);
		expect(result.workspaces[0].pullRequest).toBeNull();
	});

	test("getByWorkspaces hydrates linked pull request fields", async () => {
		const projectId = randomUUID();
		const workspaceId = randomUUID();
		const pullRequestId = randomUUID();
		host.db
			.insert(projects)
			.values({
				id: projectId,
				repoPath: repo.repoPath,
				repoOwner: "octocat",
				repoName: "hello",
				repoProvider: "github",
			})
			.run();
		host.db
			.insert(pullRequests)
			.values({
				id: pullRequestId,
				projectId,
				repoProvider: "github",
				repoOwner: "octocat",
				repoName: "hello",
				prNumber: 42,
				url: "https://github.com/octocat/hello/pull/42",
				title: "do the thing",
				state: "open",
				headBranch: "feature/x",
				headSha: "deadbeef",
				checksStatus: "success",
				checksJson: "[]",
			})
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "feature/x",
				pullRequestId,
			})
			.run();

		const result = await host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: [workspaceId],
		});
		expect(result.workspaces[0].pullRequest).toMatchObject({
			number: 42,
			title: "do the thing",
			url: "https://github.com/octocat/hello/pull/42",
		});
	});

	test("refreshByWorkspaces is a no-op for empty input", async () => {
		const result = await host.trpc.pullRequests.refreshByWorkspaces.mutate({
			workspaceIds: [],
		});
		expect(result).toEqual({ ok: true });
	});
});
