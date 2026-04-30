import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";
import { seedPullRequest, seedWorkspace } from "../helpers/seed";

describe("pullRequests router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("getByWorkspaces returns [] for empty input", async () => {
		const result = await scenario.host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: [],
		});
		expect(result.workspaces).toEqual([]);
	});

	test("getByWorkspaces returns null pullRequest for workspace with no PR linked", async () => {
		const { id: workspaceId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: scenario.repo.repoPath,
			branch: "feature/x",
		});

		const result = await scenario.host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: [workspaceId],
		});
		expect(result.workspaces).toHaveLength(1);
		expect(result.workspaces[0].workspaceId).toBe(workspaceId);
		expect(result.workspaces[0].pullRequest).toBeNull();
	});

	test("getByWorkspaces hydrates linked pull request fields", async () => {
		const { id: pullRequestId } = seedPullRequest(scenario.host, {
			projectId: scenario.projectId,
			prNumber: 42,
			title: "do the thing",
			headBranch: "feature/x",
		});
		const { id: workspaceId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: scenario.repo.repoPath,
			branch: "feature/x",
			pullRequestId,
		});

		const result = await scenario.host.trpc.pullRequests.getByWorkspaces.query({
			workspaceIds: [workspaceId],
		});
		expect(result.workspaces[0].pullRequest).toMatchObject({
			number: 42,
			title: "do the thing",
			url: "https://github.com/octocat/hello/pull/42",
		});
	});

	test("refreshByWorkspaces is a no-op for empty input", async () => {
		const result =
			await scenario.host.trpc.pullRequests.refreshByWorkspaces.mutate({
				workspaceIds: [],
			});
		expect(result).toEqual({ ok: true });
	});
});
