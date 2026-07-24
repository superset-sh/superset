import { afterEach, describe, expect, test } from "bun:test";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { seedProject, seedWorkspace } from "../helpers/seed";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_ID = "22222222-2222-4222-8222-222222222222";

describe("logical subworkspaces", () => {
	let host: TestHost | null = null;

	afterEach(async () => {
		await host?.dispose();
		host = null;
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
});
