import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Change, Environment, Process } from "../../../types/index";
import { ProcessStatus, ProcessType } from "../../../types/process";
import { LowdbAdapter } from "../lowdb-adapter";

describe("LowdbAdapter", () => {
	let tempDir: string;
	let dbPath: string;
	let adapter: LowdbAdapter;

	beforeEach(async () => {
		// Create a temporary directory for each test
		tempDir = await mkdtemp(join(tmpdir(), "lowdb-test-"));
		dbPath = join(tempDir, "test-db.json");
		adapter = new LowdbAdapter(dbPath);
	});

	afterEach(async () => {
		// Clean up temporary directory
		if (existsSync(tempDir)) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	describe("initialization", () => {
		test("initializes with empty collections", async () => {
			const data = await adapter.read();
			expect(Object.keys(data.environments)).toHaveLength(0);
			expect(Object.keys(data.workspaces)).toHaveLength(0);
			expect(Object.keys(data.processes)).toHaveLength(0);
			expect(Object.keys(data.changes)).toHaveLength(0);
			expect(Object.keys(data.fileDiffs)).toHaveLength(0);
			expect(Object.keys(data.agentSummaries)).toHaveLength(0);
		});

		test("creates and persists data", async () => {
			await adapter.clear();
			const data = await adapter.read();
			expect(data).toBeDefined();
			expect(data.environments).toBeDefined();
		});
	});

	describe("CRUD operations", () => {
		test("set and get entity", async () => {
			const environment: Environment = {
				id: "env-1",
			};

			await adapter.set("environments", "env-1", environment);
			const retrieved = await adapter.get("environments", "env-1");

			expect(retrieved).toEqual(environment);
		});

		test("delete entity", async () => {
			const environment: Environment = { id: "env-1" };
			await adapter.set("environments", "env-1", environment);

			await adapter.delete("environments", "env-1");
			const retrieved = await adapter.get("environments", "env-1");

			expect(retrieved).toBeUndefined();
		});

		test("has entity", async () => {
			const environment: Environment = { id: "env-1" };
			await adapter.set("environments", "env-1", environment);

			expect(await adapter.has("environments", "env-1")).toBe(true);
			expect(await adapter.has("environments", "env-2")).toBe(false);
		});

		test("clear all data", async () => {
			const environment: Environment = { id: "env-1" };
			await adapter.set("environments", "env-1", environment);

			await adapter.clear();
			const data = await adapter.read();

			expect(Object.keys(data.environments)).toHaveLength(0);
		});
	});

	describe("collection operations", () => {
		test("getCollection returns all entities", async () => {
			const env1: Environment = { id: "env-1" };
			const env2: Environment = { id: "env-2" };

			await adapter.set("environments", "env-1", env1);
			await adapter.set("environments", "env-2", env2);

			const collection = await adapter.getCollection("environments");
			expect(Object.keys(collection)).toHaveLength(2);
			expect(collection["env-1"]).toEqual(env1);
			expect(collection["env-2"]).toEqual(env2);
		});

		test("updateCollection replaces entire collection", async () => {
			await adapter.set("environments", "env-1", { id: "env-1" });

			const newCollection = {
				"env-2": { id: "env-2" },
				"env-3": { id: "env-3" },
			};

			await adapter.updateCollection("environments", newCollection);
			const collection = await adapter.getCollection("environments");

			expect(Object.keys(collection)).toHaveLength(2);
			expect(collection["env-1"]).toBeUndefined();
			expect(collection["env-2"]).toEqual({ id: "env-2" });
		});
	});

	describe("date serialization", () => {
		test("serializes and deserializes Date objects", async () => {
			const now = new Date("2024-01-15T10:30:00.000Z");
			const process: Process = {
				id: "proc-1",
				type: ProcessType.TERMINAL,
				workspaceId: "ws-1",
				status: ProcessStatus.RUNNING,
				title: "Test Process",
				createdAt: now,
				updatedAt: now,
			};

			await adapter.set("processes", "proc-1", process);
			const retrieved = await adapter.get("processes", "proc-1");

			expect(retrieved?.createdAt).toBeInstanceOf(Date);
			expect(retrieved?.createdAt.toISOString()).toBe(now.toISOString());
			expect(retrieved?.updatedAt).toBeInstanceOf(Date);
		});

		test("handles optional Date fields", async () => {
			const now = new Date("2024-01-15T10:30:00.000Z");
			const process: Process = {
				id: "proc-1",
				type: ProcessType.TERMINAL,
				workspaceId: "ws-1",
				status: ProcessStatus.RUNNING,
				title: "Test Process",
				createdAt: now,
				updatedAt: now,
				endedAt: undefined,
			};

			await adapter.set("processes", "proc-1", process);
			const retrieved = await adapter.get("processes", "proc-1");

			expect(retrieved?.endedAt).toBeUndefined();
		});

		test("handles nested dates", async () => {
			const now = new Date("2024-01-15T10:30:00.000Z");
			const change: Change = {
				id: "change-1",
				workspaceId: "ws-1",
				summary: "Test change",
				createdAt: now,
			};

			await adapter.set("changes", "change-1", change);
			const retrieved = await adapter.get("changes", "change-1");

			expect(retrieved?.createdAt).toBeInstanceOf(Date);
			expect(retrieved?.createdAt.toISOString()).toBe(now.toISOString());
		});
	});

	describe("concurrent operations", () => {
		test("handles multiple writes", async () => {
			const writes = Array.from({ length: 10 }, (_, i) =>
				adapter.set("environments", `env-${i}`, { id: `env-${i}` }),
			);

			await Promise.all(writes);
			const collection = await adapter.getCollection("environments");

			expect(Object.keys(collection)).toHaveLength(10);
		});
	});
});
