import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessType } from "../../../types/process";
import { WorkspaceType } from "../../../types/workspace";
import { LowdbAdapter } from "../../storage/lowdb-adapter";
import { EnvironmentOrchestrator } from "../environment-orchestrator";
import { ProcessOrchestrator } from "../process-orchestrator";
import { WorkspaceOrchestrator } from "../workspace-orchestrator";

describe("EnvironmentOrchestrator", () => {
	let tempDir: string;
	let adapter: LowdbAdapter;
	let orchestrator: EnvironmentOrchestrator;
	let workspaceOrchestrator: WorkspaceOrchestrator;
	let processOrchestrator: ProcessOrchestrator;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "env-test-"));
		const dbPath = join(tempDir, "test-db.json");
		adapter = new LowdbAdapter(dbPath);
		orchestrator = new EnvironmentOrchestrator(adapter);
		workspaceOrchestrator = new WorkspaceOrchestrator(adapter);
		processOrchestrator = new ProcessOrchestrator(adapter);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		test("creates environment with generated ID", async () => {
			const env = await orchestrator.create();

			expect(env.id).toBeDefined();
			expect(typeof env.id).toBe("string");
		});

		test("persists environment to storage", async () => {
			const env = await orchestrator.create();
			const retrieved = await orchestrator.get(env.id);

			expect(retrieved).toEqual(env);
		});
	});

	describe("get", () => {
		test("retrieves existing environment", async () => {
			const env = await orchestrator.create();
			const retrieved = await orchestrator.get(env.id);

			expect(retrieved.id).toBe(env.id);
		});

		test("throws error for non-existent environment", async () => {
			expect(orchestrator.get("non-existent")).rejects.toThrow(
				"Environment with id non-existent not found",
			);
		});
	});

	describe("list", () => {
		test("returns empty array when no environments", async () => {
			const environments = await orchestrator.list();
			expect(environments).toHaveLength(0);
		});

		test("returns all environments", async () => {
			const env1 = await orchestrator.create();
			const env2 = await orchestrator.create();

			const environments = await orchestrator.list();

			expect(environments).toHaveLength(2);
			expect(environments.map((e) => e.id)).toContain(env1.id);
			expect(environments.map((e) => e.id)).toContain(env2.id);
		});
	});

	describe("update", () => {
		test("prevents updating immutable id field", async () => {
			const env = await orchestrator.create();
			const originalId = env.id;

			// Try to update id - should be ignored
			await orchestrator.update(env.id, { id: "updated-id" });
			const retrieved = await orchestrator.get(originalId);

			// ID should remain unchanged
			expect(retrieved.id).toBe(originalId);
		});

		test("throws error for non-existent environment", async () => {
			expect(orchestrator.update("non-existent", {})).rejects.toThrow();
		});
	});

	describe("delete", () => {
		test("deletes environment", async () => {
			const env = await orchestrator.create();
			await orchestrator.delete(env.id);

			expect(orchestrator.get(env.id)).rejects.toThrow();
		});

		test("cascade deletes workspaces", async () => {
			const env = await orchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);

			await orchestrator.delete(env.id);

			expect(workspaceOrchestrator.get(workspace.id)).rejects.toThrow();
		});

		test("cascade deletes processes through workspace", async () => {
			const env = await orchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				"/tmp/test",
			);
			const process = await processOrchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);

			await orchestrator.delete(env.id);

			expect(processOrchestrator.get(process.id)).rejects.toThrow();
		});

		test("cascade deletes multiple workspaces and their children", async () => {
			const env = await orchestrator.create();
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

			await processOrchestrator.create(ProcessType.TERMINAL, ws1);
			await processOrchestrator.create(ProcessType.TERMINAL, ws2);

			await orchestrator.delete(env.id);

			expect(workspaceOrchestrator.get(ws1.id)).rejects.toThrow();
			expect(workspaceOrchestrator.get(ws2.id)).rejects.toThrow();
			expect((await processOrchestrator.list()).length).toBe(0);
		});
	});
});
