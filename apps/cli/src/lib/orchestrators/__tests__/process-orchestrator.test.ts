import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "../../../types/process";
import { AgentType, ProcessStatus, ProcessType } from "../../../types/process";
import { WorkspaceType } from "../../../types/workspace";
import { LowdbAdapter } from "../../storage/lowdb-adapter";
import { EnvironmentOrchestrator } from "../environment-orchestrator";
import { ProcessOrchestrator } from "../process-orchestrator";
import { WorkspaceOrchestrator } from "../workspace-orchestrator";

describe("ProcessOrchestrator", () => {
	let tempDir: string;
	let adapter: LowdbAdapter;
	let orchestrator: ProcessOrchestrator;
	let workspaceOrchestrator: WorkspaceOrchestrator;
	let environmentOrchestrator: EnvironmentOrchestrator;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "process-test-"));
		const dbPath = join(tempDir, "test-db.json");
		adapter = new LowdbAdapter(dbPath);
		orchestrator = new ProcessOrchestrator(adapter);
		workspaceOrchestrator = new WorkspaceOrchestrator(adapter);
		environmentOrchestrator = new EnvironmentOrchestrator(adapter);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("create", () => {
		test("creates terminal process", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);

			const process = await orchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);

			expect(process.id).toBeDefined();
			expect(process.type).toBe(ProcessType.TERMINAL);
			expect(process.workspaceId).toBe(workspace.id);
			expect(process.title).toBe("Terminal");
			expect(process.createdAt).toBeInstanceOf(Date);
			expect(process.updatedAt).toBeInstanceOf(Date);
		});

		test("creates agent process", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);

			const process = (await orchestrator.create(
				ProcessType.AGENT,
				workspace,
				AgentType.CLAUDE,
			)) as Agent;

			expect(process.type).toBe(ProcessType.AGENT);
			expect(process.agentType).toBe(AgentType.CLAUDE);
			expect(process.status).toBe(ProcessStatus.IDLE);
		});
	});

	describe("get", () => {
		test("retrieves existing process", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = await orchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);

			const retrieved = await orchestrator.get(process.id);
			expect(retrieved).toEqual(process);
		});

		test("throws error for non-existent process", async () => {
			expect(orchestrator.get("non-existent")).rejects.toThrow(
				"Process with id non-existent not found",
			);
		});
	});

	describe("list", () => {
		test("returns empty array when no processes", async () => {
			const processes = await orchestrator.list();
			expect(processes).toHaveLength(0);
		});

		test("returns all processes", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);

			const p1 = await orchestrator.create(ProcessType.TERMINAL, workspace);
			const p2 = await orchestrator.create(
				ProcessType.AGENT,
				workspace,
				AgentType.CLAUDE,
			);

			const processes = await orchestrator.list();
			expect(processes).toHaveLength(2);
			expect(processes.map((p) => p.id)).toContain(p1.id);
			expect(processes.map((p) => p.id)).toContain(p2.id);
		});

		test("filters processes by workspaceId", async () => {
			const env = await environmentOrchestrator.create();
			const ws1 = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test1" },
			);
			const ws2 = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test2" },
			);

			const p1 = await orchestrator.create(ProcessType.TERMINAL, ws1);
			await orchestrator.create(ProcessType.TERMINAL, ws2);

			const processes = await orchestrator.list(ws1.id);
			expect(processes).toHaveLength(1);
			expect(processes[0]?.id).toBe(p1.id);
		});
	});

	describe("update", () => {
		test("updates process properties", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = await orchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);

			await orchestrator.update(process.id, { title: "Updated Title" });
			const retrieved = await orchestrator.get(process.id);

			expect(retrieved.title).toBe("Updated Title");
			expect(retrieved.updatedAt.getTime()).toBeGreaterThanOrEqual(
				process.updatedAt.getTime(),
			);
		});

		test("prevents updating immutable fields", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = await orchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);
			const originalId = process.id;
			const originalWorkspaceId = process.workspaceId;
			const originalCreatedAt = process.createdAt;

			// Try to update immutable fields - should be ignored
			await orchestrator.update(process.id, {
				id: "new-id",
				workspaceId: "different-workspace",
				createdAt: new Date("2020-01-01"),
			});

			const retrieved = await orchestrator.get(originalId);

			// Immutable fields should remain unchanged
			expect(retrieved.id).toBe(originalId);
			expect(retrieved.workspaceId).toBe(originalWorkspaceId);
			expect(retrieved.createdAt.getTime()).toBe(originalCreatedAt.getTime());
		});
	});

	describe("stop", () => {
		test("stops process by setting endedAt", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = await orchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);

			await orchestrator.stop(process.id);
			const retrieved = await orchestrator.get(process.id);

			expect(retrieved.endedAt).toBeInstanceOf(Date);
		});

		test("stops agent process and updates status", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = (await orchestrator.create(
				ProcessType.AGENT,
				workspace,
				AgentType.CLAUDE,
			)) as Agent;

			await orchestrator.stop(process.id);
			const retrieved = (await orchestrator.get(process.id)) as Agent;

			expect(retrieved.status).toBe(ProcessStatus.STOPPED);
			expect(retrieved.endedAt).toBeInstanceOf(Date);
		});
	});

	describe("stopAll", () => {
		test("stops all running agents (but not terminals)", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);

			const terminal = await orchestrator.create(ProcessType.TERMINAL, workspace);
			const agent = await orchestrator.create(
				ProcessType.AGENT,
				workspace,
				AgentType.CLAUDE,
			);

			await orchestrator.stopAll();

			const retrievedTerminal = await orchestrator.get(terminal.id);
			const retrievedAgent = (await orchestrator.get(agent.id)) as Agent;

			// Terminal should NOT be stopped (stopAll only stops agents)
			expect(retrievedTerminal.endedAt).toBeUndefined();

			// Agent should be stopped
			expect(retrievedAgent.endedAt).toBeInstanceOf(Date);
			expect(retrievedAgent.status).toBe(ProcessStatus.STOPPED);
		});

		test("does not update already stopped agents", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);

			const agent = await orchestrator.create(
				ProcessType.AGENT,
				workspace,
				AgentType.CLAUDE,
			);
			await orchestrator.stop(agent.id);

			const firstStopped = await orchestrator.get(agent.id);
			const firstEndedAt = firstStopped.endedAt!;

			await orchestrator.stopAll();

			const secondStopped = await orchestrator.get(agent.id);
			expect(secondStopped.endedAt!.getTime()).toBe(firstEndedAt.getTime());
		});
	});

	describe("delete", () => {
		test("deletes process", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = await orchestrator.create(
				ProcessType.TERMINAL,
				workspace,
			);

			await orchestrator.delete(process.id);
			expect(orchestrator.get(process.id)).rejects.toThrow();
		});

		test("cascade deletes agent summaries", async () => {
			const env = await environmentOrchestrator.create();
			const workspace = await workspaceOrchestrator.create(
				env.id,
				WorkspaceType.LOCAL,
				{ path: "/tmp/test" },
			);
			const process = await orchestrator.create(
				ProcessType.AGENT,
				workspace,
				AgentType.CLAUDE,
			);

			// Add agent summary
			await adapter.set("agentSummaries", "summary-1", {
				id: "summary-1",
				agentId: process.id,
				summary: "Test summary",
				createdAt: new Date(),
			});

			await orchestrator.delete(process.id);

			const summary = await adapter.get("agentSummaries", "summary-1");
			expect(summary).toBeUndefined();
		});
	});
});
