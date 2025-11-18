import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceType } from "../../../types/workspace";
import { LowdbAdapter } from "../../storage/lowdb-adapter";
import { ChangeOrchestrator } from "../change-orchestrator";
import { EnvironmentOrchestrator } from "../environment-orchestrator";
import { WorkspaceOrchestrator } from "../workspace-orchestrator";

describe("ChangeOrchestrator", () => {
	let tempDir: string;
	let adapter: LowdbAdapter;
	let orchestrator: ChangeOrchestrator;
	let workspaceOrchestrator: WorkspaceOrchestrator;
	let environmentOrchestrator: EnvironmentOrchestrator;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "change-test-"));
		const dbPath = join(tempDir, "test-db.json");
		adapter = new LowdbAdapter(dbPath);
		orchestrator = new ChangeOrchestrator(adapter);
		workspaceOrchestrator = new WorkspaceOrchestrator(adapter);
		environmentOrchestrator = new EnvironmentOrchestrator(adapter);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		test("creates change with generated ID and timestamp", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);

			const change = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Test change",
				createdAt: new Date(),
			});

			expect(change.id).toBeDefined();
			expect(change.workspaceId).toBe(workspace.id);
			expect(change.summary).toBe("Test change");
			expect(change.createdAt).toBeInstanceOf(Date);
		});
	});

	describe("list", () => {
		test("returns empty array when no changes", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);

			const changes = await orchestrator.list(workspace.id);
			expect(changes).toHaveLength(0);
		});

		test("returns changes for specific workspace", async () => {
			const env = await environmentOrchestrator.create();
			const ws1 = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test1",
			);
			const ws2 = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test2",
			);

			const c1 = await orchestrator.create({
				workspaceId: ws1.id,
				summary: "Change 1",
				createdAt: new Date(),
			});
			await orchestrator.create({
				workspaceId: ws2.id,
				summary: "Change 2",
				createdAt: new Date(),
			});

			const changes = await orchestrator.list(ws1.id);
			expect(changes).toHaveLength(1);
			expect(changes[0]?.id).toBe(c1.id);
		});

		test("returns multiple changes in order", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);

			const c1 = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Change 1",
				createdAt: new Date(),
			});
			const c2 = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Change 2",
				createdAt: new Date(),
			});

			const changes = await orchestrator.list(workspace.id);
			expect(changes).toHaveLength(2);
			expect(changes.map((c) => c.id)).toContain(c1.id);
			expect(changes.map((c) => c.id)).toContain(c2.id);
		});
	});

	describe("update", () => {
		test("updates change properties", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);
			const change = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Original summary",
				createdAt: new Date(),
			});

			await orchestrator.update(change.id, { summary: "Updated summary" });

			const changes = await orchestrator.list(workspace.id);
			expect(changes[0]?.summary).toBe("Updated summary");
		});

		test("throws error for non-existent change", async () => {
			expect(
				orchestrator.update("non-existent", { summary: "Updated" }),
			).rejects.toThrow("Change with id non-existent not found");
		});
	});

	describe("delete", () => {
		test("deletes change", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);
			const change = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Test change",
				createdAt: new Date(),
			});

			await orchestrator.delete(change.id);

			const changes = await orchestrator.list(workspace.id);
			expect(changes).toHaveLength(0);
		});

		test("cascade deletes file diffs", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);
			const change = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Test change",
				createdAt: new Date(),
			});

			// Add file diffs
			await adapter.set("fileDiffs", "diff-1", {
				id: "diff-1",
				changeId: change.id,
				path: "test1.ts",
				status: "added",
				additions: 10,
				deletions: 0,
			});
			await adapter.set("fileDiffs", "diff-2", {
				id: "diff-2",
				changeId: change.id,
				path: "test2.ts",
				status: "modified",
				additions: 5,
				deletions: 3,
			});

			await orchestrator.delete(change.id);

			const diff1 = await adapter.get("fileDiffs", "diff-1");
			const diff2 = await adapter.get("fileDiffs", "diff-2");
			expect(diff1).toBeUndefined();
			expect(diff2).toBeUndefined();
		});

		test("deletes only file diffs for specific change", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);
			const c1 = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Change 1",
				createdAt: new Date(),
			});
			const c2 = await orchestrator.create({
				workspaceId: workspace.id,
				summary: "Change 2",
				createdAt: new Date(),
			});

			await adapter.set("fileDiffs", "diff-1", {
				id: "diff-1",
				changeId: c1.id,
				path: "test1.ts",
				status: "added",
				additions: 10,
				deletions: 0,
			});
			await adapter.set("fileDiffs", "diff-2", {
				id: "diff-2",
				changeId: c2.id,
				path: "test2.ts",
				status: "added",
				additions: 5,
				deletions: 0,
			});

			await orchestrator.delete(c1.id);

			const diff1 = await adapter.get("fileDiffs", "diff-1");
			const diff2 = await adapter.get("fileDiffs", "diff-2");
			expect(diff1).toBeUndefined();
			expect(diff2).toBeDefined();
		});
	});
});
