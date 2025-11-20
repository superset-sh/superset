import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalWorkspace } from "../../../types/workspace";
import { WorkspaceType } from "../../../types/workspace";
import { LowdbAdapter } from "../../storage/lowdb-adapter";
import { ChangeOrchestrator } from "../change-orchestrator";
import { EnvironmentOrchestrator } from "../environment-orchestrator";
import { WorkspaceOrchestrator } from "../workspace-orchestrator";

describe("WorkspaceOrchestrator", () => {
	let tempDir: string;
	let adapter: LowdbAdapter;
	let orchestrator: WorkspaceOrchestrator;
	let environmentOrchestrator: EnvironmentOrchestrator;
	let changeOrchestrator: ChangeOrchestrator;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "workspace-test-"));
		const dbPath = join(tempDir, "test-db.json");
		adapter = new LowdbAdapter(dbPath);
		orchestrator = new WorkspaceOrchestrator(adapter);
		environmentOrchestrator = new EnvironmentOrchestrator(adapter);
		changeOrchestrator = new ChangeOrchestrator(adapter);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		test("creates local workspace with path", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test",
			});

			expect(workspace.id).toBeDefined();
			expect(workspace.type).toBe(WorkspaceType.LOCAL);
			expect(workspace.environmentId).toBe(env.id);
			expect((workspace as LocalWorkspace).path).toBe("/tmp/test");
		});

		test("creates cloud workspace without path", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.CLOUD);

			expect(workspace.id).toBeDefined();
			expect(workspace.type).toBe(WorkspaceType.CLOUD);
			expect(workspace.environmentId).toBe(env.id);
		});
	});

	describe("get", () => {
		test("retrieves existing workspace", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test",
			});

			const retrieved = await orchestrator.get(workspace.id);
			expect(retrieved).toEqual(workspace);
		});

		test("throws error for non-existent workspace", async () => {
			expect(orchestrator.get("non-existent")).rejects.toThrow(
				"Workspace with id non-existent not found",
			);
		});
	});

	describe("list", () => {
		test("returns empty array when no workspaces", async () => {
			const workspaces = await orchestrator.list();
			expect(workspaces).toHaveLength(0);
		});

		test("returns all workspaces", async () => {
			const env = await environmentOrchestrator.create();
			const ws1 = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test1",
			});
			const ws2 = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test2",
			});

			const workspaces = await orchestrator.list();
			expect(workspaces).toHaveLength(2);
			expect(workspaces.map((w) => w.id)).toContain(ws1.id);
			expect(workspaces.map((w) => w.id)).toContain(ws2.id);
		});

		test("filters workspaces by environmentId", async () => {
			const env1 = await environmentOrchestrator.create();
			const env2 = await environmentOrchestrator.create();

			const ws1 = await orchestrator.create(env1.id, WorkspaceType.LOCAL, {
				path: "/tmp/test1",
			});
			await orchestrator.create(env2.id, WorkspaceType.LOCAL, {
				path: "/tmp/test2",
			});

			const workspaces = await orchestrator.list(env1.id);
			expect(workspaces).toHaveLength(1);
			expect(workspaces[0]?.id).toBe(ws1.id);
		});
	});

	describe("update", () => {
		test("updates workspace properties", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test",
			});

			await orchestrator.update(workspace.id, { type: WorkspaceType.CLOUD });
			const retrieved = await orchestrator.get(workspace.id);

			expect(retrieved.type).toBe(WorkspaceType.CLOUD);
		});
	});

	describe("delete", () => {
		test("deletes workspace", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test",
			});

			await orchestrator.delete(workspace.id);
			expect(orchestrator.get(workspace.id)).rejects.toThrow();
		});

		test("cascade deletes changes", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test",
			});
			const change = await changeOrchestrator.create({
				workspaceId: workspace.id,
				summary: "Test change",
				createdAt: new Date(),
			});

			await orchestrator.delete(workspace.id);

			const changes = await changeOrchestrator.list(workspace.id);
			expect(changes).toHaveLength(0);
		});

		test("cascade deletes file diffs through changes", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await orchestrator.create(env.id, WorkspaceType.LOCAL, {
				path: "/tmp/test",
			});
			const change = await changeOrchestrator.create({
				workspaceId: workspace.id,
				summary: "Test change",
				createdAt: new Date(),
			});

			// Add a file diff
			await adapter.set("fileDiffs", "diff-1", {
				id: "diff-1",
				changeId: change.id,
				path: "test.ts",
				status: "added",
				additions: 10,
				deletions: 0,
			});

			await orchestrator.delete(workspace.id);

			const fileDiff = await adapter.get("fileDiffs", "diff-1");
			expect(fileDiff).toBeUndefined();
		});
	});
});
