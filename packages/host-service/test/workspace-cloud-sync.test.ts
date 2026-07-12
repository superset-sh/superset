import { Database as BunDatabase } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../src/db";
import * as schema from "../src/db/schema";
import { projects, workspaceCloudDeletes, workspaces } from "../src/db/schema";
import type { EventBus } from "../src/events";
import { runWorkspaceBackfill } from "../src/runtime/workspace-backfill";
import {
	pushWorkspaceCreateToCloud,
	startWorkspaceCloudSync,
} from "../src/runtime/workspace-cloud-sync";
import type { ApiClient } from "../src/types";
import {
	deleteLocalWorkspace,
	insertLocalWorkspace,
	updateLocalWorkspace,
} from "../src/workspaces/local-workspace-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const ORG_ID = "00000000-0000-0000-0000-000000000001";

function makeDb(): HostDb {
	const dir = mkdtempSync(join(tmpdir(), "ws-cloud-sync-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(projects).values({ id: "p-1", repoPath: "/repo" }).run();
	return db;
}

function makeEventBus() {
	const broadcastWorkspaceChanged = mock(() => {});
	return {
		bus: { broadcastWorkspaceChanged } as unknown as EventBus,
		broadcastWorkspaceChanged,
	};
}

interface FakeApiSpec {
	createResult?: (input: {
		id?: string;
		name: string;
		branch: string;
		taskId?: string;
	}) => Record<string, unknown>;
	createThrows?: boolean;
	getFromHost?: (input: { id: string }) => Record<string, unknown> | null;
	getFromHostThrows?: boolean;
	deleteThrows?: boolean;
}

function makeApi(spec: FakeApiSpec = {}) {
	const hostEnsure = mock(async () => ({ machineId: "machine-1" }));
	const create = mock(
		async (input: {
			id?: string;
			name: string;
			branch: string;
			taskId?: string;
		}) => {
			if (spec.createThrows) throw new Error("cloud unreachable");
			return (
				spec.createResult?.(input) ?? {
					id: input.id ?? randomUUID(),
					organizationId: ORG_ID,
					projectId: "p-1",
					hostId: "machine-1",
					name: input.name,
					branch: input.branch,
					type: "worktree",
					createdByUserId: null,
					taskId: input.taskId ?? null,
					createdAt: new Date(),
					updatedAt: new Date(),
					txid: 42,
				}
			);
		},
	);
	const updateNameFromHost = mock(async (input: Record<string, unknown>) => ({
		id: input.id,
	}));
	const del = mock(async () => {
		if (spec.deleteThrows) throw new Error("cloud unreachable");
		return { success: true };
	});
	const getFromHost = mock(async (input: { id: string }) => {
		if (spec.getFromHostThrows) throw new Error("cloud unreachable");
		return spec.getFromHost ? spec.getFromHost(input) : null;
	});

	const client = {
		host: { ensure: { mutate: hostEnsure } },
		v2Workspace: {
			create: { mutate: create },
			updateNameFromHost: { mutate: updateNameFromHost },
			delete: { mutate: del },
			getFromHost: { query: getFromHost },
		},
	} as unknown as ApiClient;
	return { client, create, updateNameFromHost, del, getFromHost };
}

function makeSyncCtx(apiSpec: FakeApiSpec = {}) {
	const db = makeDb();
	const { bus, broadcastWorkspaceChanged } = makeEventBus();
	const api = makeApi(apiSpec);
	return {
		ctx: {
			api: api.client,
			db,
			eventBus: bus,
			organizationId: ORG_ID,
		},
		db,
		api,
		broadcastWorkspaceChanged,
	};
}

describe("local-workspace-store", () => {
	test("insert/update/delete broadcast workspace:changed with the right kinds", () => {
		const { ctx, broadcastWorkspaceChanged } = makeSyncCtx();
		const store = { db: ctx.db, eventBus: ctx.eventBus };

		const row = insertLocalWorkspace(store, {
			projectId: "p-1",
			worktreePath: "/repo/.worktrees/a",
			branch: "feat/a",
			name: "A",
		});
		expect(row.cloudSyncedAt).toBeNull();
		expect(broadcastWorkspaceChanged.mock.calls[0]?.[0]).toMatchObject({
			eventType: "created",
			workspaceId: row.id,
			workspace: { name: "A", branch: "feat/a" },
		});

		updateLocalWorkspace(store, row.id, { name: "B" });
		expect(broadcastWorkspaceChanged.mock.calls[1]?.[0]).toMatchObject({
			eventType: "updated",
			workspace: { name: "B" },
		});

		deleteLocalWorkspace(store, row.id);
		expect(broadcastWorkspaceChanged.mock.calls[2]?.[0]).toMatchObject({
			eventType: "deleted",
			workspace: null,
		});
		const tombstones = ctx.db.select().from(workspaceCloudDeletes).all();
		expect(tombstones.map((t) => t.id)).toEqual([row.id]);
	});
});

describe("pushWorkspaceCreateToCloud", () => {
	test("marks the row cloud-synced on success", async () => {
		const { ctx, db } = makeSyncCtx();
		const row = insertLocalWorkspace(
			{ db, eventBus: ctx.eventBus },
			{
				projectId: "p-1",
				worktreePath: "/repo/.worktrees/a",
				branch: "feat/a",
				name: "A",
			},
		);
		const cloudRow = await pushWorkspaceCreateToCloud(ctx, row);
		expect(cloudRow?.id).toBe(row.id);
		const after = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, row.id) })
			.sync();
		expect(after?.cloudSyncedAt).not.toBeNull();
	});

	test("returns null and leaves the row dirty when the cloud is unreachable", async () => {
		const { ctx, db } = makeSyncCtx({ createThrows: true });
		const row = insertLocalWorkspace(
			{ db, eventBus: ctx.eventBus },
			{
				projectId: "p-1",
				worktreePath: "/repo/.worktrees/a",
				branch: "feat/a",
				name: "A",
			},
		);
		const cloudRow = await pushWorkspaceCreateToCloud(ctx, row);
		expect(cloudRow).toBeNull();
		const after = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, row.id) })
			.sync();
		expect(after?.cloudSyncedAt).toBeNull();
	});

	test("re-keys the local row when the cloud deduped onto another id", async () => {
		const survivingId = randomUUID();
		const { ctx, db } = makeSyncCtx({
			createResult: (input) => ({
				id: survivingId,
				organizationId: ORG_ID,
				projectId: "p-1",
				hostId: "machine-1",
				name: input.name,
				branch: input.branch,
				type: "main",
				createdByUserId: null,
				taskId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				txid: null,
			}),
		});
		const row = insertLocalWorkspace(
			{ db, eventBus: ctx.eventBus },
			{
				projectId: "p-1",
				worktreePath: "/repo",
				branch: "main",
				name: "main",
				type: "main",
			},
		);
		const cloudRow = await pushWorkspaceCreateToCloud(ctx, row);
		expect(cloudRow?.id).toBe(survivingId);
		const ids = db
			.select({ id: workspaces.id })
			.from(workspaces)
			.all()
			.map((r) => r.id);
		expect(ids).toEqual([survivingId]);
	});

	test("adopts a newer cloud-side rename instead of clobbering it", async () => {
		const now = Date.now();
		const { ctx, db, api } = makeSyncCtx({
			createResult: (input) => ({
				id: input.id,
				organizationId: ORG_ID,
				projectId: "p-1",
				hostId: "machine-1",
				name: "Renamed in cloud",
				branch: input.branch,
				type: "worktree",
				createdByUserId: null,
				taskId: null,
				createdAt: new Date(now - 60_000),
				updatedAt: new Date(now + 60_000),
				txid: null,
			}),
		});
		const row = insertLocalWorkspace(
			{ db, eventBus: ctx.eventBus },
			{
				projectId: "p-1",
				worktreePath: "/repo/.worktrees/a",
				branch: "feat/a",
				name: "Stale local name",
			},
		);
		await pushWorkspaceCreateToCloud(ctx, row);
		const after = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, row.id) })
			.sync();
		expect(after?.name).toBe("Renamed in cloud");
		expect(api.updateNameFromHost).not.toHaveBeenCalled();
	});

	test("pushes the local name when the local row is newer", async () => {
		const now = Date.now();
		const { ctx, db, api } = makeSyncCtx({
			createResult: (input) => ({
				id: input.id,
				organizationId: ORG_ID,
				projectId: "p-1",
				hostId: "machine-1",
				name: "Old cloud name",
				branch: input.branch,
				type: "worktree",
				createdByUserId: null,
				taskId: null,
				createdAt: new Date(now - 120_000),
				updatedAt: new Date(now - 60_000),
				txid: null,
			}),
		});
		const row = insertLocalWorkspace(
			{ db, eventBus: ctx.eventBus },
			{
				projectId: "p-1",
				worktreePath: "/repo/.worktrees/a",
				branch: "feat/a",
				name: "Fresh local name",
			},
		);
		await pushWorkspaceCreateToCloud(ctx, row);
		expect(api.updateNameFromHost).toHaveBeenCalledWith(
			expect.objectContaining({ id: row.id, name: "Fresh local name" }),
		);
	});
});

describe("startWorkspaceCloudSync", () => {
	test("runNow drains tombstones and dirty rows, skipping unbackfilled ones", async () => {
		const { ctx, db, api } = makeSyncCtx();
		const store = { db, eventBus: ctx.eventBus };

		// Dirty row (normal), unbackfilled row (skipped), tombstone (replayed).
		insertLocalWorkspace(store, {
			projectId: "p-1",
			worktreePath: "/repo/.worktrees/a",
			branch: "feat/a",
			name: "A",
		});
		db.insert(workspaces)
			.values({
				id: randomUUID(),
				projectId: "p-1",
				worktreePath: "/repo/.worktrees/legacy",
				branch: "legacy",
				// Pre-ownership row: empty name, updatedAt 0 → backfill's job.
			})
			.run();
		const tombstoneId = randomUUID();
		db.insert(workspaceCloudDeletes)
			.values({ id: tombstoneId, queuedAt: Date.now() })
			.run();

		const sync = startWorkspaceCloudSync(ctx);
		try {
			await sync.runNow();
		} finally {
			sync.stop();
		}

		expect(api.del).toHaveBeenCalledWith({ id: tombstoneId });
		expect(db.select().from(workspaceCloudDeletes).all()).toHaveLength(0);
		// Only the backfilled row was pushed.
		expect(api.create).toHaveBeenCalledTimes(1);
		const dirty = db.query.workspaces
			.findFirst({ where: eq(workspaces.branch, "legacy") })
			.sync();
		expect(dirty?.cloudSyncedAt).toBeNull();
	});

	test("keeps tombstones when the cloud delete fails", async () => {
		const { ctx, db, api } = makeSyncCtx({ deleteThrows: true });
		const tombstoneId = randomUUID();
		db.insert(workspaceCloudDeletes)
			.values({ id: tombstoneId, queuedAt: Date.now() })
			.run();

		const sync = startWorkspaceCloudSync(ctx);
		try {
			await sync.runNow();
		} finally {
			sync.stop();
		}
		expect(api.del).toHaveBeenCalledWith({ id: tombstoneId });
		expect(db.select().from(workspaceCloudDeletes).all()).toHaveLength(1);
	});
});

describe("runWorkspaceBackfill", () => {
	function seedUnbackfilled(db: HostDb, id: string, branch: string) {
		db.insert(workspaces)
			.values({
				id,
				projectId: "p-1",
				worktreePath: `/repo/.worktrees/${branch}`,
				branch,
			})
			.run();
	}

	test("copies cloud fields onto unbackfilled rows and marks them synced", async () => {
		const id = randomUUID();
		const cloudCreatedAt = new Date(1_700_000_000_000);
		const cloudUpdatedAt = new Date(1_700_000_100_000);
		const { ctx, db } = makeSyncCtx({
			getFromHost: () => ({
				id,
				organizationId: ORG_ID,
				projectId: "p-1",
				hostId: "machine-1",
				name: "Cloud name",
				branch: "feat/a",
				type: "main",
				createdByUserId: "user-1",
				taskId: null,
				createdAt: cloudCreatedAt,
				updatedAt: cloudUpdatedAt,
			}),
		});
		seedUnbackfilled(db, id, "feat/a");

		await runWorkspaceBackfill(ctx);

		const after = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, id) })
			.sync();
		expect(after?.name).toBe("Cloud name");
		expect(after?.type).toBe("main");
		expect(after?.createdByUserId).toBe("user-1");
		expect(after?.createdAt).toBe(cloudCreatedAt.getTime());
		expect(after?.updatedAt).toBe(cloudUpdatedAt.getTime());
		expect(after?.cloudSyncedAt).not.toBeNull();
	});

	test("leaves rows whose cloud counterpart is gone untouched (never deletes on null)", async () => {
		const id = randomUUID();
		const { ctx, db, broadcastWorkspaceChanged } = makeSyncCtx({
			getFromHost: () => null,
		});
		seedUnbackfilled(db, id, "feat/gone");

		await runWorkspaceBackfill(ctx);

		// Backfill only fills — a cloud null (genuinely-gone OR wrong-org) must
		// not delete the local row; validity is a disk question, not a cloud one.
		const after = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, id) })
			.sync();
		expect(after?.name).toBe("");
		expect(after?.cloudSyncedAt).toBeNull();
		expect(db.select().from(workspaceCloudDeletes).all()).toHaveLength(0);
		expect(broadcastWorkspaceChanged).not.toHaveBeenCalled();
	});

	test("leaves rows untouched when the cloud is unreachable", async () => {
		const id = randomUUID();
		const { ctx, db } = makeSyncCtx({ getFromHostThrows: true });
		seedUnbackfilled(db, id, "feat/offline");

		await runWorkspaceBackfill(ctx);

		const after = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, id) })
			.sync();
		expect(after?.name).toBe("");
		expect(after?.cloudSyncedAt).toBeNull();
	});
});
