import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
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

	test("getLinkedWorkspace prefers a live workspace over a more recent shelved one", async () => {
		const { id: pullRequestId } = seedPullRequest(scenario.host, {
			projectId: scenario.projectId,
			prNumber: 7,
			headBranch: "feature/x",
		});
		const { id: liveId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: `${scenario.repo.repoPath}-live`,
			branch: "feature/x",
			pullRequestId,
		});
		const { id: shelvedId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: `${scenario.repo.repoPath}-shelved`,
			branch: "feature/x",
			pullRequestId,
		});
		scenario.host.db
			.update(workspaces)
			.set({ shelvedAt: Date.now(), updatedAt: Date.now() + 60_000 })
			.where(eq(workspaces.id, shelvedId))
			.run();

		const result =
			await scenario.host.trpc.pullRequests.getLinkedWorkspace.query({
				projectId: scenario.projectId,
				prNumber: 7,
			});
		expect(result).toEqual({ workspaceId: liveId, isShelved: false });
	});

	test("getLinkedWorkspace reports a shelved workspace without restoring it", async () => {
		const { id: pullRequestId } = seedPullRequest(scenario.host, {
			projectId: scenario.projectId,
			prNumber: 8,
			headBranch: "feature/y",
		});
		const { id: shelvedId } = seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: scenario.repo.repoPath,
			branch: "feature/y",
			pullRequestId,
		});
		scenario.host.db
			.update(workspaces)
			.set({ shelvedAt: Date.now() })
			.where(eq(workspaces.id, shelvedId))
			.run();

		const result =
			await scenario.host.trpc.pullRequests.getLinkedWorkspace.query({
				projectId: scenario.projectId,
				prNumber: 8,
			});
		expect(result).toEqual({ workspaceId: shelvedId, isShelved: true });
		expect(
			scenario.host.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, shelvedId) })
				.sync()?.shelvedAt,
		).not.toBeNull();
	});

	test("refreshByWorkspaces is a no-op for empty input", async () => {
		const result =
			await scenario.host.trpc.pullRequests.refreshByWorkspaces.mutate({
				workspaceIds: [],
			});
		expect(result).toEqual({ ok: true });
	});
});
