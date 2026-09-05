import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import type { EventBus } from "../../../events";
import type { WorkspaceChangedMessage } from "../../../events/types";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { workspaceCleanupRouter } from "./workspace-cleanup";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const PROJECT_ID = "1f0e8c7e-1234-4abc-8def-0123456789ab";
const MAIN_WORKSPACE_ID = "2f0e8c7e-1234-4abc-8def-0123456789ab";
const WORKSPACE_ID = "3f0e8c7e-1234-4abc-8def-0123456789ab";
const TERMINAL_ID = "term-1";

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.run("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function createHarness() {
	const db = createTestDb();
	db.insert(schema.projects)
		.values({ id: PROJECT_ID, repoPath: "/tmp/repo", updatedAt: 1 })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: MAIN_WORKSPACE_ID,
			projectId: PROJECT_ID,
			worktreePath: "/tmp/repo",
			branch: "main",
			name: "main",
			type: "main",
		})
		.run();
	db.insert(schema.workspaces)
		.values({
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			worktreePath: "/tmp/repo-worktree",
			branch: "feature",
			name: "feature",
			type: "worktree",
		})
		.run();

	const broadcasts: WorkspaceChangedMessage[] = [];
	const eventBus = {
		broadcastWorkspaceChanged: (
			message: Omit<WorkspaceChangedMessage, "type">,
		) => {
			broadcasts.push({ type: "workspace:changed", ...message });
		},
	} as unknown as EventBus;

	const tracked: { event: string; properties: Record<string, unknown> }[] = [];
	const api = {
		analytics: {
			captureEvent: {
				mutate: async (input: {
					event: string;
					properties: Record<string, unknown>;
				}) => {
					tracked.push({ event: input.event, properties: input.properties });
				},
			},
		},
	};

	const ctx = {
		db,
		eventBus,
		api,
		isAuthenticated: true,
		organizationId: "org-1",
	} as unknown as HostServiceContext;

	return {
		caller: createCallerFactory(workspaceCleanupRouter)(ctx),
		db,
		broadcasts,
		tracked,
	};
}

function readWorkspace(db: HostDb, id: string) {
	return db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, id) }).sync();
}

describe("workspaceCleanup.shelve", () => {
	it("stamps shelvedAt and broadcasts one `updated` event carrying it", async () => {
		const { caller, db, broadcasts } = createHarness();

		const result = await caller.shelve({
			workspaceId: WORKSPACE_ID,
			source: "sidebar",
		});

		expect(result.success).toBe(true);
		expect(result.shelvedAt).toEqual(expect.any(Number));
		expect(readWorkspace(db, WORKSPACE_ID)?.shelvedAt).toBe(result.shelvedAt);
		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0]?.eventType).toBe("updated");
		expect(broadcasts[0]?.workspace?.shelvedAt).toBe(result.shelvedAt);
	});

	it("is idempotent: a repeat keeps the timestamp and broadcasts nothing", async () => {
		const { caller, broadcasts, tracked } = createHarness();

		const first = await caller.shelve({
			workspaceId: WORKSPACE_ID,
			source: "sidebar",
		});
		const second = await caller.shelve({
			workspaceId: WORKSPACE_ID,
			source: "hotkey",
		});

		expect(second.shelvedAt).toBe(first.shelvedAt);
		expect(broadcasts).toHaveLength(1);
		expect(tracked.filter((t) => t.event === "workspace_archived")).toHaveLength(
			1,
		);
	});

	it("refuses a main workspace", async () => {
		const { caller, db } = createHarness();
		await expect(
			caller.shelve({ workspaceId: MAIN_WORKSPACE_ID, source: "sidebar" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(readWorkspace(db, MAIN_WORKSPACE_ID)?.shelvedAt).toBeNull();
	});

	it("refuses a tombstoned (already destroyed) row", async () => {
		const { caller, db } = createHarness();
		db.update(schema.workspaces)
			.set({ archivedAt: Date.now(), archiveReason: "deleted" })
			.where(eq(schema.workspaces.id, WORKSPACE_ID))
			.run();

		await expect(
			caller.shelve({ workspaceId: WORKSPACE_ID, source: "sidebar" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(readWorkspace(db, WORKSPACE_ID)?.shelvedAt).toBeNull();
	});

	it("answers NOT_FOUND for an unknown id", async () => {
		const { caller } = createHarness();
		await expect(
			caller.shelve({ workspaceId: "does-not-exist", source: "sidebar" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("leaves terminal session rows and agent bindings untouched", async () => {
		const { caller, db } = createHarness();
		const startedAt = Date.now();
		db.insert(schema.terminalSessions)
			.values({
				id: TERMINAL_ID,
				originWorkspaceId: WORKSPACE_ID,
				status: "active",
			})
			.run();
		db.insert(schema.terminalAgentBindings)
			.values({
				terminalId: TERMINAL_ID,
				workspaceId: WORKSPACE_ID,
				agentId: "claude",
				agentSessionId: "session-1",
				startedAt,
				lastEventAt: startedAt,
				lastEventType: "attached",
			})
			.run();

		await caller.shelve({ workspaceId: WORKSPACE_ID, source: "bulk" });

		const session = db.query.terminalSessions
			.findFirst({ where: eq(schema.terminalSessions.id, TERMINAL_ID) })
			.sync();
		expect(session?.status).toBe("active");
		expect(session?.endedAt).toBeNull();
		expect(session?.disposeRequestedAt).toBeNull();
		const binding = db.query.terminalAgentBindings
			.findFirst({ where: eq(schema.terminalAgentBindings.terminalId, TERMINAL_ID) })
			.sync();
		expect(binding?.endedAt).toBeNull();
		expect(binding?.agentSessionId).toBe("session-1");
	});

	it("emits workspace_archived host-side with the caller's source", async () => {
		const { caller, tracked } = createHarness();
		await caller.shelve({
			workspaceId: WORKSPACE_ID,
			source: "command-palette",
		});
		const event = tracked.find((t) => t.event === "workspace_archived");
		expect(event?.properties).toMatchObject({
			workspace_id: WORKSPACE_ID,
			source: "command-palette",
		});
	});
});

describe("workspaceCleanup.unshelve", () => {
	it("clears shelvedAt and broadcasts `updated` with null", async () => {
		const { caller, db, broadcasts, tracked } = createHarness();
		await caller.shelve({ workspaceId: WORKSPACE_ID, source: "sidebar" });
		broadcasts.length = 0;

		const result = await caller.unshelve({
			workspaceId: WORKSPACE_ID,
			source: "undo-toast",
		});

		expect(result.shelvedAt).toBeNull();
		expect(readWorkspace(db, WORKSPACE_ID)?.shelvedAt).toBeNull();
		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0]?.eventType).toBe("updated");
		expect(broadcasts[0]?.workspace?.shelvedAt).toBeNull();
		expect(
			tracked.find((t) => t.event === "workspace_unarchived")?.properties,
		).toMatchObject({ source: "undo-toast" });
	});

	it("is a no-op on a live row", async () => {
		const { caller, broadcasts, tracked } = createHarness();
		const result = await caller.unshelve({
			workspaceId: WORKSPACE_ID,
			source: "workspaces-page",
		});
		expect(result.shelvedAt).toBeNull();
		expect(broadcasts).toHaveLength(0);
		expect(tracked).toHaveLength(0);
	});

	it("refuses a tombstoned row", async () => {
		const { caller, db } = createHarness();
		await caller.shelve({ workspaceId: WORKSPACE_ID, source: "sidebar" });
		db.update(schema.workspaces)
			.set({ archivedAt: Date.now(), archiveReason: "deleted" })
			.where(eq(schema.workspaces.id, WORKSPACE_ID))
			.run();
		await expect(
			caller.unshelve({ workspaceId: WORKSPACE_ID, source: "deep-link" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
