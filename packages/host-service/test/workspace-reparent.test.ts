import { Database as BunDatabase } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../src/db";
import * as schema from "../src/db/schema";
import { projects } from "../src/db/schema";
import type { EventBus } from "../src/events";
import { workspaceRouter } from "../src/trpc/router/workspace/workspace";
import type { HostServiceContext } from "../src/types";
import {
	getLocalWorkspace,
	insertLocalWorkspace,
} from "../src/workspaces/local-workspace-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const PROJECT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PROJECT_B = "aaaaaaaa-0000-4000-8000-000000000002";

const WS = {
	root: "bbbbbbbb-0000-4000-8000-000000000001",
	child: "bbbbbbbb-0000-4000-8000-000000000002",
	grandchild: "bbbbbbbb-0000-4000-8000-000000000003",
	other: "bbbbbbbb-0000-4000-8000-000000000004",
	crossProject: "bbbbbbbb-0000-4000-8000-000000000005",
	main: "bbbbbbbb-0000-4000-8000-000000000006",
} as const;

let db: HostDb;
let ctx: HostServiceContext;
let broadcastWorkspaceChanged: ReturnType<typeof mock>;

beforeEach(() => {
	const dir = mkdtempSync(join(tmpdir(), "reparent-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA foreign_keys = ON");
	db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(projects).values({ id: PROJECT_A, repoPath: "/repo-a" }).run();
	db.insert(projects).values({ id: PROJECT_B, repoPath: "/repo-b" }).run();

	broadcastWorkspaceChanged = mock(() => {});
	ctx = {
		isAuthenticated: true,
		organizationId: "org-1",
		db,
		eventBus: { broadcastWorkspaceChanged } as unknown as EventBus,
		api: undefined,
	} as unknown as HostServiceContext;

	const storeCtx = { db, eventBus: ctx.eventBus };
	const insert = (
		id: string,
		values: Partial<Parameters<typeof insertLocalWorkspace>[1]> = {},
	) =>
		insertLocalWorkspace(storeCtx, {
			id,
			projectId: PROJECT_A,
			worktreePath: `/wt/${id}`,
			branch: `branch-${id.slice(-4)}`,
			name: `ws-${id.slice(-4)}`,
			...values,
		});
	insert(WS.root);
	insert(WS.child, { parentWorkspaceId: WS.root });
	insert(WS.grandchild, { parentWorkspaceId: WS.child });
	insert(WS.other);
	insert(WS.crossProject, { projectId: PROJECT_B });
	insert(WS.main, { type: "main" });
	broadcastWorkspaceChanged.mockClear();
});

const caller = () => workspaceRouter.createCaller(ctx);

describe("workspace.update parentWorkspaceId", () => {
	test("re-parents a root under another workspace and broadcasts", async () => {
		const updated = await caller().update({
			id: WS.other,
			parentWorkspaceId: WS.grandchild,
		});
		expect(updated.parentWorkspaceId).toBe(WS.grandchild);
		expect(getLocalWorkspace(db, WS.other)?.parentWorkspaceId).toBe(
			WS.grandchild,
		);
		expect(broadcastWorkspaceChanged).toHaveBeenCalledTimes(1);
	});

	test("explicit null detaches to the top level", async () => {
		const updated = await caller().update({
			id: WS.child,
			parentWorkspaceId: null,
		});
		expect(updated.parentWorkspaceId).toBeNull();
		// The subtree stays intact: the grandchild still points at child.
		expect(getLocalWorkspace(db, WS.grandchild)?.parentWorkspaceId).toBe(
			WS.child,
		);
	});

	test("omitting the field leaves lineage untouched", async () => {
		await caller().update({ id: WS.child, name: "renamed" });
		expect(getLocalWorkspace(db, WS.child)?.parentWorkspaceId).toBe(WS.root);
	});

	test("rejects self-parenting", async () => {
		await expect(
			caller().update({ id: WS.root, parentWorkspaceId: WS.root }),
		).rejects.toThrow("cannot be its own parent");
	});

	test("rejects moving a workspace under its own descendant", async () => {
		await expect(
			caller().update({ id: WS.root, parentWorkspaceId: WS.grandchild }),
		).rejects.toThrow("own descendant");
		expect(getLocalWorkspace(db, WS.root)?.parentWorkspaceId).toBeNull();
	});

	test("rejects a cross-project parent", async () => {
		await expect(
			caller().update({ id: WS.other, parentWorkspaceId: WS.crossProject }),
		).rejects.toThrow("different project");
	});

	test("rejects an unknown or archived parent", async () => {
		await expect(
			caller().update({
				id: WS.other,
				parentWorkspaceId: "bbbbbbbb-0000-4000-8000-00000000dead",
			}),
		).rejects.toThrow("not found");
	});

	test("rejects re-parenting the main workspace", async () => {
		await expect(
			caller().update({ id: WS.main, parentWorkspaceId: WS.root }),
		).rejects.toThrow("local workspace");
	});
});
