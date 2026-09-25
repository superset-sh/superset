import { Database as BunDatabase } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../src/db";
import * as schema from "../src/db/schema";
import { projects, workspaces } from "../src/db/schema";
import type { EventBus } from "../src/events";
import { createLocalWorkspace } from "../src/trpc/router/project/utils/create-local-workspace";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const REPO_PATH = "/repo";

function makeDb(): HostDb {
	const dir = mkdtempSync(join(tmpdir(), "create-local-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(projects).values({ id: "p-1", repoPath: REPO_PATH }).run();
	return db;
}

function makeCtx(db: HostDb, branch = "feat/main") {
	const eventBus = {
		broadcastWorkspaceChanged: mock(() => {}),
	} as unknown as EventBus;
	// Git stub: report a branch so the detached-HEAD guard passes.
	const git = mock(async () => ({
		raw: mock(async () => `${branch}\n`),
		revparse: mock(async () => branch),
	}));
	return { db, git: git as never, eventBus };
}

describe("createLocalWorkspace", () => {
	test("every call mints a new identity on the same checkout", async () => {
		const db = makeDb();
		const ctx = makeCtx(db);
		const a = await createLocalWorkspace(ctx, {
			projectId: "p-1",
			repoPath: REPO_PATH,
			name: "bugfix",
		});
		const b = await createLocalWorkspace(ctx, {
			projectId: "p-1",
			repoPath: REPO_PATH,
			name: "docs",
		});
		expect(a.id).not.toBe(b.id);
		expect(a.type).toBe("local");
		expect(a.worktreePath).toBe(REPO_PATH);
		expect(b.worktreePath).toBe(REPO_PATH);
		expect(a.branch).toBe("feat/main");
		expect(b.branch).toBe(a.branch);
		expect(db.select().from(workspaces).all()).toHaveLength(2);
	});

	test("records the checked-out branch at creation time without touching git", async () => {
		const db = makeDb();
		const first = await createLocalWorkspace(makeCtx(db, "main"), {
			projectId: "p-1",
			repoPath: REPO_PATH,
			name: "a",
		});
		const second = await createLocalWorkspace(makeCtx(db, "release"), {
			projectId: "p-1",
			repoPath: REPO_PATH,
			name: "b",
		});
		expect(first.branch).toBe("main");
		expect(second.branch).toBe("release");
	});

	test("refuses a detached HEAD", async () => {
		const db = makeDb();
		const ctx = {
			db,
			eventBus: { broadcastWorkspaceChanged: mock(() => {}) } as never,
			git: (async () => ({
				raw: async () => {
					throw new Error("not a symbolic ref");
				},
				revparse: async () => "HEAD",
			})) as never,
		};
		await expect(
			createLocalWorkspace(ctx, {
				projectId: "p-1",
				repoPath: REPO_PATH,
				name: "x",
			}),
		).rejects.toThrow(/detached-HEAD/);
	});
});
