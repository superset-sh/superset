import { Database as BunDatabase } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../src/db";
import * as schema from "../src/db/schema";
import { projects, workspaces } from "../src/db/schema";
import type { EventBus } from "../src/events";
import { workspaceRouter } from "../src/trpc/router/workspace/workspace";
import type { HostServiceContext } from "../src/types";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const ORG_ID = "00000000-0000-0000-0000-000000000001";

function makeDb(): HostDb {
	const dir = mkdtempSync(join(tmpdir(), "workspace-shelve-"));
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

let db: HostDb;
let broadcastWorkspaceChanged: ReturnType<typeof mock>;

function makeCtx(): HostServiceContext {
	broadcastWorkspaceChanged = mock(() => {});
	return {
		isAuthenticated: true,
		organizationId: ORG_ID,
		db,
		eventBus: { broadcastWorkspaceChanged } as unknown as EventBus,
		api: {} as never,
		git: (async () => {
			throw new Error("unexpected ctx.git call");
		}) as never,
	} as unknown as HostServiceContext;
}

function seedWorkspace(
	id: string,
	overrides: Partial<typeof workspaces.$inferInsert> = {},
): void {
	const now = Date.now();
	db.insert(workspaces)
		.values({
			id,
			projectId: "p-1",
			worktreePath: `/repo/../wt/${id}`,
			branch: `feat/${id}`,
			name: id,
			type: "worktree",
			createdAt: now,
			updatedAt: now,
			...overrides,
		})
		.run();
}

function readRow(id: string) {
	return db.query.workspaces.findFirst({ where: eq(workspaces.id, id) }).sync();
}

beforeEach(() => {
	db = makeDb();
});

describe("workspace.shelve / workspace.unshelve", () => {
	test("shelving a worktree stamps shelvedAt and hides it from list()", async () => {
		seedWorkspace("ws-1");
		const caller = workspaceRouter.createCaller(makeCtx());
		const before = Date.now();
		await caller.shelve({ workspaceId: "ws-1" });

		const row = readRow("ws-1");
		expect(row?.shelvedAt).toBeGreaterThanOrEqual(before);

		const visible = await caller.list();
		expect(visible.map((w) => w.id)).not.toContain("ws-1");

		const withShelved = await caller.list({ includeShelved: true });
		const listed = withShelved.find((w) => w.id === "ws-1");
		expect(listed?.shelvedAt).toBe(row?.shelvedAt ?? null);

		expect(broadcastWorkspaceChanged).toHaveBeenCalled();
		expect(broadcastWorkspaceChanged.mock.calls.at(-1)?.[0].eventType).toBe(
			"updated",
		);
	});

	test("unshelving clears shelvedAt and purgeBlockedReason", async () => {
		seedWorkspace("ws-1", {
			shelvedAt: Date.now() - 1000,
			purgeBlockedReason: "uncommitted-changes",
		});
		const caller = workspaceRouter.createCaller(makeCtx());
		await caller.unshelve({ workspaceId: "ws-1" });

		const row = readRow("ws-1");
		expect(row?.shelvedAt).toBeNull();
		expect(row?.purgeBlockedReason).toBeNull();
		expect((await caller.list()).map((w) => w.id)).toContain("ws-1");
	});

	test("shelving twice keeps the original shelvedAt", async () => {
		const original = Date.now() - 60_000;
		seedWorkspace("ws-1", { shelvedAt: original });
		const caller = workspaceRouter.createCaller(makeCtx());
		await caller.shelve({ workspaceId: "ws-1" });
		expect(readRow("ws-1")?.shelvedAt).toBe(original);
	});

	test("shelving a main or session workspace is a BAD_REQUEST", async () => {
		seedWorkspace("ws-main", { type: "main" });
		seedWorkspace("ws-session", { type: "session", projectId: null });
		const caller = workspaceRouter.createCaller(makeCtx());

		await expect(
			caller.shelve({ workspaceId: "ws-main" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			caller.shelve({ workspaceId: "ws-session" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(readRow("ws-main")?.shelvedAt).toBeNull();
		expect(readRow("ws-session")?.shelvedAt).toBeNull();
	});

	test("shelving a tombstoned row is a NOT_FOUND", async () => {
		seedWorkspace("ws-gone", {
			archivedAt: Date.now(),
			archiveReason: "deleted",
		});
		const caller = workspaceRouter.createCaller(makeCtx());
		await expect(
			caller.shelve({ workspaceId: "ws-gone" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(readRow("ws-gone")?.shelvedAt).toBeNull();
	});

	test("shelving an unknown row is a NOT_FOUND", async () => {
		const caller = workspaceRouter.createCaller(makeCtx());
		await expect(caller.shelve({ workspaceId: "nope" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	test("includeArchived still returns tombstones; includeShelved does not", async () => {
		seedWorkspace("ws-gone", {
			archivedAt: Date.now(),
			archiveReason: "deleted",
		});
		seedWorkspace("ws-shelved", { shelvedAt: Date.now() });
		const caller = workspaceRouter.createCaller(makeCtx());

		const archived = await caller.list({ includeArchived: true });
		expect(archived.map((w) => w.id)).toContain("ws-gone");

		const shelved = await caller.list({ includeShelved: true });
		expect(shelved.map((w) => w.id)).toContain("ws-shelved");
		expect(shelved.map((w) => w.id)).not.toContain("ws-gone");
	});

	test("a purged row keeps its shelf stamps yet still counts as a tombstone", async () => {
		seedWorkspace("ws-purged", {
			shelvedAt: Date.now() - 1000,
			purgeBlockedReason: null,
			archivedAt: Date.now(),
			archiveReason: "deleted",
		});
		const caller = workspaceRouter.createCaller(makeCtx());

		expect((await caller.list()).map((w) => w.id)).not.toContain("ws-purged");
		expect(
			(await caller.list({ includeShelved: true })).map((w) => w.id),
		).not.toContain("ws-purged");
		expect(
			(await caller.list({ includeArchived: true })).map((w) => w.id),
		).toContain("ws-purged");
	});
});
