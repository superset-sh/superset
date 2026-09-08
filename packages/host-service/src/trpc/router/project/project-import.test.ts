import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { projects } from "../../../db/schema";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { createFromImportLocal } from "./handlers";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

const tempRepoDirs: string[] = [];
afterAll(() => {
	for (const dir of tempRepoDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** Real git repo in a temp dir; returns the canonical git root (macOS
 * /var → /private/var symlinks resolved by rev-parse, which is exactly
 * what findByPath compares against). Dirs are removed in afterAll. */
async function createTempGitRepo(): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "v1-import-test-"));
	tempRepoDirs.push(dir);
	const git = createUserSimpleGit(dir);
	try {
		await git.init(["--initial-branch=main"]);
	} catch {
		await git.init();
	}
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	return (await git.revparse(["--show-toplevel"])).trim();
}

function createRecordingApiStub() {
	const calls: string[] = [];
	const api = {
		v2Project: {
			findByGitHubRemote: {
				query: async () => {
					calls.push("v2Project.findByGitHubRemote");
					return { candidates: [] };
				},
			},
		},
	};
	return { api, calls };
}

function createTestContext(db: HostDb, api: unknown): HostServiceContext {
	// Absorbs any broadcast method emitProjectChanged / workspace stores call.
	const eventBus = new Proxy({}, { get: () => () => {} });
	return {
		db,
		api,
		eventBus,
		git: async (path: string) => createUserSimpleGit(path),
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
}

describe("findByPath walkAllRemotes (v1 importer)", () => {
	it("returns the local row as authoritative without consulting the cloud", async () => {
		const db = createTestDb();
		const { api, calls } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		// Local-first project: exists only in the host's local DB — the
		// cloud has never heard of it (this is the bug's exact setup).
		db.insert(projects)
			.values({
				id: randomUUID(),
				repoPath: root,
				name: "My Project",
				updatedAt: 1,
			})
			.run();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]?.source).toBe("local-path");
		expect(result.candidates[0]?.name).toBe("My Project");
		expect(result.cloudErrors).toHaveLength(0);
		// The whole point: no staleness probe, no remote walk.
		expect(calls).toHaveLength(0);
	});

	it("still walks cloud remotes when no local row exists", async () => {
		const db = createTestDb();
		const { api, calls } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
			expectedRemoteUrl: "https://github.com/acme/demo",
		});

		expect(result.candidates).toHaveLength(0);
		expect(calls).toContain("v2Project.findByGitHubRemote");
	});
});

describe("createFromImportLocal idempotency", () => {
	it("reuses the existing project for the same repo path and preserves identity", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		const first = await createFromImportLocal(ctx, {
			name: "Imported",
			repoPath: root,
		});
		expect(first.created).toBe(true);
		expect(first.mainWorkspaceId).toBeTruthy();

		// User customizes the project in v2 — a re-import must not undo this.
		db.update(projects)
			.set({ name: "Custom Name", color: "#112233", icon: "none" })
			.where(eq(projects.id, first.projectId))
			.run();

		const second = await createFromImportLocal(ctx, {
			name: "Imported (again)",
			repoPath: root,
		});

		expect(second.projectId).toBe(first.projectId);
		expect(second.created).toBe(false);
		expect(second.mainWorkspaceId).toBe(first.mainWorkspaceId);

		const rows = db.select().from(projects).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe("Custom Name");
		expect(rows[0]?.color).toBe("#112233");
		expect(rows[0]?.icon).toBe("none");
	});
});

describe("createFromImportLocal root policy", () => {
	it("refuses discovery before offering initialization, then accepts an ordinary folder", async () => {
		const root = mkdtempSync(join(tmpdir(), "import-discovery-"));
		tempRepoDirs.push(root);
		const previous = process.env.SUPERSET_HOME_DIR;
		process.env.SUPERSET_HOME_DIR = join(root, ".superset");
		try {
			const db = createTestDb();
			const { api } = createRecordingApiStub();
			const caller = createCallerFactory(projectRouter)(
				createTestContext(db, api),
			);
			await expect(caller.findByPath({ repoPath: root })).rejects.toMatchObject(
				{
					code: "PRECONDITION_FAILED",
					message: expect.stringContaining("Pick the repository folder itself"),
				},
			);
			expect(existsSync(join(root, ".git"))).toBe(false);
			const ordinary = join(root, "ordinary-repo");
			mkdirSync(ordinary);
			expect(await caller.findByPath({ repoPath: ordinary })).toMatchObject({
				needsGitInit: true,
			});
			expect(existsSync(join(ordinary, ".git"))).toBe(false);
			const created = await caller.create({
				name: "Ordinary",
				mode: { kind: "importLocal", repoPath: ordinary, initIfNeeded: true },
			});
			expect(created.mainWorkspaceId).toBeTruthy();
			expect(existsSync(join(ordinary, ".git"))).toBe(true);
			expect(db.select().from(projects).all()).toHaveLength(1);
		} finally {
			if (previous === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = previous;
		}
	});
	it.each([
		false,
		true,
	])("rejects initialization before creating .git (symlink: %s)", async (useAlias) => {
		const root = mkdtempSync(join(tmpdir(), "forbidden-init-"));
		tempRepoDirs.push(root);
		const directory = join(root, "data");
		mkdirSync(directory);
		writeFileSync(join(directory, "keep.txt"), "existing user content");
		const alias = join(root, "alias");
		symlinkSync(directory, alias, "junction");
		const previous = process.env.SUPERSET_HOME_DIR;
		process.env.SUPERSET_HOME_DIR = join(directory, ".superset");
		try {
			const db = createTestDb();
			const { api } = createRecordingApiStub();
			await expect(
				createFromImportLocal(createTestContext(db, api), {
					name: "Forbidden",
					repoPath: useAlias ? alias : directory,
					initIfNeeded: true,
				}),
			).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
			expect(existsSync(join(directory, ".git"))).toBe(false);
			expect(readFileSync(join(directory, "keep.txt"), "utf8")).toBe(
				"existing user content",
			);
			expect(db.select().from(projects).all()).toHaveLength(0);
		} finally {
			if (previous === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = previous;
		}
	});

	it("still rejects a forbidden git root resolved from an allowed subdirectory", async () => {
		const repoPath = await createTempGitRepo();
		const child = join(repoPath, "child");
		mkdirSync(child);
		const previous = process.env.SUPERSET_HOME_DIR;
		process.env.SUPERSET_HOME_DIR = join(repoPath, ".superset");
		try {
			const db = createTestDb();
			const { api } = createRecordingApiStub();
			await expect(
				createFromImportLocal(createTestContext(db, api), {
					name: "Child",
					repoPath: child,
					initIfNeeded: true,
				}),
			).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
			expect(existsSync(join(child, ".git"))).toBe(false);
			expect(db.select().from(projects).all()).toHaveLength(0);
		} finally {
			if (previous === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = previous;
		}
	});
	it("refuses a repository that contains Superset's own data folder", async () => {
		const repoPath = await createTempGitRepo();
		const previous = process.env.SUPERSET_HOME_DIR;
		process.env.SUPERSET_HOME_DIR = join(repoPath, ".superset");
		try {
			const db = createTestDb();
			const { api } = createRecordingApiStub();
			const ctx = createTestContext(db, api);
			await expect(
				createFromImportLocal(ctx, { name: "home", repoPath }),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				message: expect.stringContaining("Superset's own data folder"),
			});
			expect(db.select().from(projects).all()).toHaveLength(0);
		} finally {
			if (previous === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = previous;
		}
	});
});
