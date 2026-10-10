import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { projects, workspaces } from "../../../db/schema";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { workspaceCreationRouter } from "../workspace-creation/workspace-creation";
import { createFromImportLocal } from "./handlers";
import { projectRouter } from "./project";
import { createLocalWorkspace } from "./utils/create-local-workspace";

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

/** Detaches HEAD and returns the branch it was on, so a test can restore
 * the checkout without assuming git's default branch name. */
async function detachHead(root: string): Promise<string> {
	const git = createUserSimpleGit(root);
	const branch = (await git.raw(["symbolic-ref", "--short", "HEAD"])).trim();
	await git.raw(["checkout", "--detach"]);
	expect((await git.revparse(["--abbrev-ref", "HEAD"])).trim()).toBe("HEAD");
	return branch;
}

function createRecordingApiStub() {
	const calls: string[] = [];
	const api = {
		analytics: { captureEvent: { mutate: async () => {} } },
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

		const rows = db.select().from(projects).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe("Custom Name");
		expect(rows[0]?.color).toBe("#112233");
		expect(rows[0]?.icon).toBe("none");
	});
});

describe("project setup repository relinking", () => {
	it("does not persist or broadcast repeated setup with an unchanged explicit remote", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await createUserSimpleGit(root).addRemote(
			"origin",
			"git@github.com:acme/demo.git",
		);
		const projectId = randomUUID();
		const caller = createCallerFactory(projectRouter)(ctx);
		const input = {
			projectId,
			origin: {
				name: "Custom Name",
				repoCloneUrl: "https://github.com/acme/demo",
			},
			mode: { kind: "import" as const, repoPath: root },
		};
		await caller.setup(input);
		db.update(projects)
			.set({ updatedAt: 1 })
			.where(eq(projects.id, projectId))
			.run();
		const before = db.select().from(projects).get();
		const broadcastProjectChanged = mock(() => {});
		ctx.eventBus = {
			broadcastProjectChanged,
		} as unknown as typeof ctx.eventBus;

		expect(await caller.setup(input)).toEqual({ repoPath: root });
		expect(db.select().from(projects).get()).toEqual(before);
		expect(broadcastProjectChanged).not.toHaveBeenCalled();
	});

	it("refreshes an explicitly selected remote at the same path without changing project customizations", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		const git = createUserSimpleGit(root);
		await git.addRemote("origin", "git@github.com:my-fork/demo.git");
		await git.addRemote("upstream", "git@github.com:old-org/demo.git");
		const projectId = randomUUID();
		const caller = createCallerFactory(projectRouter)(ctx);
		await caller.setup({
			projectId,
			origin: {
				name: "Custom Name",
				repoCloneUrl: "https://github.com/old-org/demo",
			},
			mode: { kind: "import", repoPath: root },
		});
		db.update(projects)
			.set({ color: "#112233", icon: "none", worktreeBaseDir: "/custom" })
			.where(eq(projects.id, projectId))
			.run();
		const before = db.select().from(projects).get();
		if (!before) throw new Error("Project was not created");
		const broadcastProjectChanged = mock(() => {});
		ctx.eventBus = {
			broadcastProjectChanged,
		} as unknown as typeof ctx.eventBus;
		await git.remote([
			"set-url",
			"upstream",
			"git@github.com:new-org/renamed.git",
		]);

		const result = await caller.setup({
			projectId,
			origin: {
				name: "Ignored Name",
				repoCloneUrl: "https://github.com/new-org/renamed",
			},
			mode: { kind: "import", repoPath: root },
		});

		expect(result).toEqual({ repoPath: root });
		const rows = db.select().from(projects).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			...before,
			repoOwner: "new-org",
			repoName: "renamed",
			repoUrl: "https://github.com/new-org/renamed",
			updatedAt: expect.any(Number),
		});
		expect(await caller.get({ projectId })).toMatchObject({
			name: "Custom Name",
			repoOwner: "new-org",
			repoName: "renamed",
			repoUrl: "https://github.com/new-org/renamed",
		});
		expect(broadcastProjectChanged).toHaveBeenCalledTimes(1);
		expect(broadcastProjectChanged).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId,
				eventType: "updated",
				project: expect.objectContaining({
					repoUrl: "https://github.com/new-org/renamed",
				}),
			}),
		);
	});

	it("keeps a selected upstream remote when setup supplies no repository URL", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		const git = createUserSimpleGit(root);
		await git.addRemote("origin", "git@github.com:my-fork/demo.git");
		await git.addRemote("upstream", "git@github.com:acme/demo.git");
		const projectId = randomUUID();
		const caller = createCallerFactory(projectRouter)(ctx);
		await caller.setup({
			projectId,
			origin: {
				name: "Custom Name",
				repoCloneUrl: "https://github.com/acme/demo",
			},
			mode: { kind: "import", repoPath: root },
		});
		const before = db.select().from(projects).get();

		await caller.setup({
			projectId,
			mode: { kind: "import", repoPath: root },
		});

		expect(db.select().from(projects).get()).toEqual(before);
	});
});

// A v1 project whose checkout sits on a detached HEAD must still import;
// the v1→v2 auto-migration ledgers a throwing import as `error`, which
// blocks the flip gate for the whole machine. The branch requirement lives
// only on local-workspace creation, and the importer never reaches it for
// a detached main checkout (listProjectWorktrees drops it), so the v1 main
// workspace lands as a non-blocking skip instead.
describe("detached-HEAD repos (v1 importer)", () => {
	it("importLocal persists the project row without a main workspace", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await detachHead(root);

		const result = await createFromImportLocal(ctx, {
			name: "Detached",
			repoPath: root,
		});

		expect(result.created).toBe(true);
		expect(result.repoPath).toBe(root);
		const row = db
			.select()
			.from(projects)
			.where(eq(projects.id, result.projectId))
			.get();
		expect(row?.repoPath).toBe(root);
		expect(db.select().from(workspaces).all()).toHaveLength(0);
	});

	it("setup mode=import links the project without a main workspace", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await detachHead(root);
		const projectId = randomUUID();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.setup({
			projectId,
			origin: { name: "Detached" },
			mode: { kind: "import", repoPath: root, allowRelocate: false },
		});

		expect(result.repoPath).toBe(root);
		const row = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		expect(row?.repoPath).toBe(root);
		expect(db.select().from(workspaces).all()).toHaveLength(0);
	});

	it("listProjectWorktrees omits the detached main checkout, so the importer skips its v1 workspace instead of creating a local one", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		const branch = await detachHead(root);
		const { projectId } = await createFromImportLocal(ctx, {
			name: "Detached",
			repoPath: root,
		});

		const caller = createCallerFactory(workspaceCreationRouter)(ctx);
		const detached = await caller.listProjectWorktrees({ projectId });
		expect(detached.worktrees.find((w) => w.isMainWorktree)).toBeUndefined();

		await createUserSimpleGit(root).raw(["checkout", branch]);
		const onBranch = await caller.listProjectWorktrees({ projectId });
		expect(onBranch.worktrees.find((w) => w.isMainWorktree)?.branch).toBe(
			branch,
		);
	});

	it("local workspace creation still requires a branch, and succeeds once one is checked out", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		const branch = await detachHead(root);
		const { projectId } = await createFromImportLocal(ctx, {
			name: "Detached",
			repoPath: root,
		});

		const attempt = createLocalWorkspace(ctx, {
			projectId,
			repoPath: root,
			name: "local",
		});
		await expect(attempt).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			message: expect.stringContaining("detached-HEAD"),
		});
		expect(db.select().from(workspaces).all()).toHaveLength(0);

		await createUserSimpleGit(root).raw(["checkout", branch]);
		const created = await createLocalWorkspace(ctx, {
			projectId,
			repoPath: root,
			name: "local",
		});
		expect(created.projectId).toBe(projectId);
		expect(created.type).toBe("local");
		expect(created.branch).toBe(branch);
		expect(created.worktreePath).toBe(root);
	});
});
