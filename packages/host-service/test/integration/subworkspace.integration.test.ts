import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLocalWorkspace } from "../../src/workspaces/local-workspace-store";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_ID = "22222222-2222-4222-8222-222222222222";

describe("logical subworkspaces", () => {
	let host: TestHost | null = null;
	let repo: GitFixture | null = null;
	let worktreeRoot: string | null = null;

	afterEach(async () => {
		await host?.dispose();
		host = null;
		repo?.dispose();
		repo = null;
		if (worktreeRoot) {
			rmSync(worktreeRoot, { recursive: true, force: true });
			worktreeRoot = null;
		}
	});

	test("creates and deletes a separate identity without touching the parent git context", async () => {
		host = await createTestHost();
		seedProject(host, { id: PROJECT_ID, repoPath: "/repo" });
		seedWorkspace(host, {
			id: PARENT_ID,
			projectId: PROJECT_ID,
			worktreePath: "/repo",
			branch: "feature/shared",
			name: "Parent",
			type: "main",
		});

		const created = await host.trpc.workspaces.createSubworkspace.mutate({
			parentWorkspaceId: PARENT_ID,
			name: "Research",
			agent: {
				agent: "not-a-real-agent",
				prompt: "Research the implementation.",
				delegationMode: "workspaces",
			},
		});

		expect(created.workspace).toMatchObject({
			name: "Research",
			type: "subworkspace",
			parentWorkspaceId: PARENT_ID,
			agentDelegationMode: "workspaces",
			projectId: PROJECT_ID,
			branch: "feature/shared",
		});
		expect(created.agent).toMatchObject({ ok: false });

		const child = await host.trpc.workspace.get.query({
			id: created.workspace.id,
		});
		expect(child.worktreePath).toBe("/repo");
		expect(child.branch).toBe("feature/shared");

		const deleted = await host.trpc.workspace.delete.mutate({
			id: created.workspace.id,
		});
		expect(deleted).toMatchObject({
			success: true,
			worktreeRemoved: false,
			branchDeleted: false,
		});

		const parent = await host.trpc.workspace.get.query({ id: PARENT_ID });
		expect(parent.worktreePath).toBe("/repo");
		expect(parent.branch).toBe("feature/shared");
	});

	test("re-creating an existing workspace preserves its delegation mode when omitted", async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		seedProject(host, { id: PROJECT_ID, repoPath: repo.repoPath });
		seedWorkspace(host, {
			id: PARENT_ID,
			projectId: PROJECT_ID,
			worktreePath: repo.repoPath,
			branch: "main",
			name: "Parent",
			type: "main",
			agentDelegationMode: "workspaces",
		});

		await host.trpc.workspaces.create.mutate({
			projectId: PROJECT_ID,
			name: "Parent",
			worktreePath: repo.repoPath,
		});

		expect(getLocalWorkspace(host.db, PARENT_ID)?.agentDelegationMode).toBe(
			"workspaces",
		);
	});

	test("adoption removes nested descendants of a conflicting workspace", async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		worktreeRoot = mkdtempSync(join(tmpdir(), "superset-adopt-worktree-"));
		const targetPath = join(worktreeRoot, "target");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/target",
			targetPath,
			"main",
		]);

		seedProject(host, { id: PROJECT_ID, repoPath: repo.repoPath });
		seedWorkspace(host, {
			id: "33333333-3333-4333-8333-333333333333",
			projectId: PROJECT_ID,
			worktreePath: repo.repoPath,
			branch: "main",
			name: "Main",
			type: "main",
		});
		const survivor = seedWorkspace(host, {
			id: "44444444-4444-4444-8444-444444444444",
			projectId: PROJECT_ID,
			worktreePath: targetPath,
			branch: "feature/old-name",
			name: "Survivor",
		});
		const conflict = seedWorkspace(host, {
			id: "55555555-5555-4555-8555-555555555555",
			projectId: PROJECT_ID,
			worktreePath: "/missing/conflict",
			branch: "feature/target",
			name: "Conflict",
		});
		const child = seedWorkspace(host, {
			id: "66666666-6666-4666-8666-666666666666",
			projectId: PROJECT_ID,
			worktreePath: "/missing/conflict",
			branch: "feature/target",
			name: "Child",
			type: "subworkspace",
			parentWorkspaceId: conflict.id,
		});
		const grandchild = seedWorkspace(host, {
			id: "77777777-7777-4777-8777-777777777777",
			projectId: PROJECT_ID,
			worktreePath: "/missing/conflict",
			branch: "feature/target",
			name: "Grandchild",
			type: "subworkspace",
			parentWorkspaceId: child.id,
		});

		await host.trpc.workspaces.create.mutate({
			projectId: PROJECT_ID,
			name: "Survivor",
			worktreePath: targetPath,
		});

		expect(getLocalWorkspace(host.db, survivor.id)?.branch).toBe(
			"feature/target",
		);
		expect(getLocalWorkspace(host.db, conflict.id)).toBeUndefined();
		expect(getLocalWorkspace(host.db, child.id)).toBeUndefined();
		expect(getLocalWorkspace(host.db, grandchild.id)).toBeUndefined();
	});
});
