import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { WorkspaceChangedMessage } from "../../../events/types";
import type { HostServiceContext } from "../../../types";
import { workspaceCleanupRouter } from "./workspace-cleanup";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");
const PROJECT_ID = "1f0e8c7e-1234-4abc-8def-0123456789ab";
const WORKSPACE_ID = "2f0e8c7e-1234-4abc-8def-0123456789ab";
const MAIN_WORKSPACE_ID = "3f0e8c7e-1234-4abc-8def-0123456789ab";

function createHarness() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(schema.projects)
		.values({ id: PROJECT_ID, repoPath: "/tmp/does-not-exist-repo" })
		.run();
	db.insert(schema.workspaces)
		.values([
			{
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				worktreePath: "/tmp/does-not-exist-worktree",
				branch: "feature",
				name: "Feature",
				type: "worktree",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
			{
				id: MAIN_WORKSPACE_ID,
				projectId: PROJECT_ID,
				worktreePath: "/tmp/does-not-exist-main",
				branch: "main",
				name: "local",
				type: "main",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		])
		.run();

	const broadcasts: WorkspaceChangedMessage[] = [];
	const eventBus = {
		broadcastWorkspaceChanged: (msg: Omit<WorkspaceChangedMessage, "type">) => {
			broadcasts.push({ type: "workspace:changed", ...msg });
		},
	};
	const ctx = {
		db,
		eventBus,
		isAuthenticated: true,
		organizationId: "org-1",
	} as unknown as HostServiceContext;
	return { caller: workspaceCleanupRouter.createCaller(ctx), db, broadcasts };
}

function getRow(db: ReturnType<typeof createHarness>["db"], id: string) {
	return db.query.workspaces
		.findFirst({ where: (t, { eq }) => eq(t.id, id) })
		.sync();
}

describe("workspaceCleanup.archive", () => {
	it("sets archivedAt and broadcasts the updated snapshot", async () => {
		const { caller, db, broadcasts } = createHarness();
		const result = await caller.archive({ workspaceId: WORKSPACE_ID });

		expect(result.success).toBe(true);
		expect(result.warnings).toEqual([]);
		expect(getRow(db, WORKSPACE_ID)?.archivedAt).toBe(result.archivedAt);

		const updated = broadcasts.find((b) => b.eventType === "updated");
		expect(updated?.workspace?.archivedAt).toBe(result.archivedAt);
	});

	it("leaves terminal sessions untouched (undo grace; reaper suspends later)", async () => {
		const { caller, db } = createHarness();
		db.insert(schema.terminalSessions)
			.values({
				id: "term-1",
				originWorkspaceId: WORKSPACE_ID,
				status: "active",
				createdAt: Date.now(),
			})
			.run();

		await caller.archive({ workspaceId: WORKSPACE_ID });

		const session = db.query.terminalSessions
			.findFirst({ where: (t, { eq }) => eq(t.id, "term-1") })
			.sync();
		expect(session?.status).toBe("active");
		expect(session?.disposeRequestedAt ?? null).toBeNull();
	});

	it("is idempotent when already archived", async () => {
		const { caller, broadcasts } = createHarness();
		const first = await caller.archive({ workspaceId: WORKSPACE_ID });
		const broadcastCount = broadcasts.length;
		const second = await caller.archive({ workspaceId: WORKSPACE_ID });

		expect(second.archivedAt).toBe(first.archivedAt);
		expect(broadcasts.length).toBe(broadcastCount);
	});

	it("rejects main workspaces", async () => {
		const { caller, db } = createHarness();
		await expect(
			caller.archive({ workspaceId: MAIN_WORKSPACE_ID }),
		).rejects.toThrow(/Main workspaces cannot be deleted/);
		expect(getRow(db, MAIN_WORKSPACE_ID)?.archivedAt).toBeNull();
	});

	it("rejects unknown workspaces", async () => {
		const { caller } = createHarness();
		await expect(
			caller.archive({ workspaceId: "9f0e8c7e-1234-4abc-8def-0123456789ab" }),
		).rejects.toThrow(/Workspace not found/);
	});
});

describe("workspaceCleanup.unarchive", () => {
	it("clears archivedAt and returns the cloud-shaped row", async () => {
		const { caller, db } = createHarness();
		await caller.archive({ workspaceId: WORKSPACE_ID });

		const row = await caller.unarchive({ workspaceId: WORKSPACE_ID });
		expect(row.id).toBe(WORKSPACE_ID);
		expect(row.archivedAt).toBeNull();
		expect(getRow(db, WORKSPACE_ID)?.archivedAt).toBeNull();
	});

	it("rejects unknown workspaces", async () => {
		const { caller } = createHarness();
		await expect(
			caller.unarchive({ workspaceId: "9f0e8c7e-1234-4abc-8def-0123456789ab" }),
		).rejects.toThrow(/Workspace not found/);
	});
});
