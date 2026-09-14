import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
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
	/** Canonical GitHub URL (lower-cased) → cloud project ids it resolves to. */
	const byRemoteUrl = new Map<string, string[]>();
	const api = {
		analytics: { captureEvent: { mutate: async () => {} } },
		v2Project: {
			findByGitHubRemote: {
				query: async ({ repoCloneUrl }: { repoCloneUrl: string }) => {
					calls.push("v2Project.findByGitHubRemote");
					const ids = byRemoteUrl.get(repoCloneUrl.toLowerCase()) ?? [];
					return { candidates: ids.map((id) => ({ id, name: id })) };
				},
			},
		},
	};
	return { api, calls, byRemoteUrl };
}

async function addRemotes(root: string, remotes: Record<string, string>) {
	const git = createUserSimpleGit(root);
	for (const [name, url] of Object.entries(remotes)) {
		await git.raw(["remote", "add", name, url]);
	}
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

	// #7241: repo B (origin → owner/b, secondary remote → owner/a) where
	// only owner/a is a cloud project. No expectedRemoteUrl hint, which is
	// what the importer sends in practice (v1 github_owner is empty).
	it("flags a lone candidate reached only via a secondary remote", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(true);
		expect(result.candidates).toEqual([
			expect.objectContaining({
				id: "project-a",
				source: "remote",
				viaOrigin: false,
				matchesExpected: false,
			}),
		]);
	});

	it("ranks the origin-derived candidate first without any hint", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		// Config order and alphabetical order both put `a` before origin's
		// project, so only origin ranking can win here.
		await addRemotes(root, {
			a: "git@github.com:owner/a.git",
			origin: "git@github.com:owner/b.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);
		byRemoteUrl.set("https://github.com/owner/b", ["project-b"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.candidates.map((c) => [c.id, c.viaOrigin])).toEqual([
			["project-b", true],
			["project-a", false],
		]);
	});

	it("keeps repoCloneUrl origin-derived when a secondary remote resolves the same project first", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		// Config order queries `mirror` before `origin`; both resolve to the
		// same cloud project, so the merge (not the insert) sets viaOrigin.
		await addRemotes(root, {
			mirror: "git@github.com:owner/mirror.git",
			origin: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/mirror", ["project-a"]);
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.candidates).toEqual([
			expect.objectContaining({
				id: "project-a",
				viaOrigin: true,
				repoCloneUrl: "https://github.com/owner/a",
			}),
		]);
	});

	it("origin-only repo: lone candidate is origin-derived", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, { origin: "git@github.com:owner/a.git" });
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(true);
		expect(result.candidates).toEqual([
			expect.objectContaining({ id: "project-a", viaOrigin: true }),
		]);
	});

	it("repo with no remotes: nothing to match, no origin", async () => {
		const db = createTestDb();
		const { api, calls } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result).toMatchObject({
			candidates: [],
			cloudErrors: [],
			hasOriginRemote: false,
		});
		expect(calls).toHaveLength(0);
	});

	it("secondary-only clone (no origin): candidate is not origin-derived but nothing marks it secondary", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, { upstream: "git@github.com:owner/a.git" });
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(false);
		expect(result.candidates[0]).toMatchObject({
			id: "project-a",
			viaOrigin: false,
		});
	});

	it("ssh vs https and mixed case for the same repo collapse into one origin-derived candidate", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl, calls } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			backup: "https://github.com/Owner/A.git",
			origin: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(calls).toHaveLength(1);
		expect(result.candidates).toEqual([
			expect.objectContaining({ id: "project-a", viaOrigin: true }),
		]);
	});

	it("origin ranking beats an expectedRemoteUrl hint that points at the secondary's project", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);
		byRemoteUrl.set("https://github.com/owner/b", ["project-b"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
			expectedRemoteUrl: "https://github.com/owner/a",
		});

		expect(
			result.candidates.map((c) => [c.id, c.viaOrigin, c.matchesExpected]),
		).toEqual([
			["project-b", true, false],
			["project-a", false, true],
		]);
	});

	it("origin lookup failing while the secondary succeeds still marks the survivor secondary", async () => {
		const db = createTestDb();
		const { byRemoteUrl } = createRecordingApiStub();
		const api = {
			v2Project: {
				findByGitHubRemote: {
					query: async ({ repoCloneUrl }: { repoCloneUrl: string }) => {
						if (repoCloneUrl.toLowerCase() === "https://github.com/owner/b") {
							throw new Error("cloud down");
						}
						const ids = byRemoteUrl.get(repoCloneUrl.toLowerCase()) ?? [];
						return { candidates: ids.map((id) => ({ id, name: id })) };
					},
				},
			},
		};
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(true);
		expect(result.candidates).toEqual([
			expect.objectContaining({ id: "project-a", viaOrigin: false }),
		]);
		expect(result.cloudErrors).toEqual([
			expect.objectContaining({ url: "https://github.com/owner/b" }),
		]);
	});

	it("keeps the origin URL when origin resolves the project before a secondary remote does", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			origin: "git@github.com:owner/a.git",
			mirror: "git@github.com:owner/mirror.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);
		byRemoteUrl.set("https://github.com/owner/mirror", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.candidates).toEqual([
			expect.objectContaining({
				id: "project-a",
				viaOrigin: true,
				repoCloneUrl: "https://github.com/owner/a",
			}),
		]);
	});

	it("an origin that is a local path still counts as the repo's identity", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			origin: "/srv/git/b.git",
			a: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(true);
		expect(result.candidates[0]?.viaOrigin).toBe(false);
	});

	it("reports hasOriginRemote for a non-GitHub origin", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();
		await addRemotes(root, {
			origin: "https://gitlab.com/owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		byRemoteUrl.set("https://github.com/owner/a", ["project-a"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(true);
		expect(result.candidates[0]?.viaOrigin).toBe(false);
	});
});

describe("setup import refuses to move a project between repos (#7241)", () => {
	const projectA = "6b8d3c1e-6f7a-4b9c-8d1e-2f3a4b5c6d7e";
	const setupInput = (repoPath: string, allowRelocate = false) => ({
		projectId: projectA,
		origin: { repoCloneUrl: "https://github.com/owner/a", name: "a" },
		mode: { kind: "import" as const, repoPath, allowRelocate },
	});

	it("rejects a folder whose origin is another repo when the project has no local row", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const repoB = await createTempGitRepo();
		await addRemotes(repoB, {
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});

		const caller = createCallerFactory(projectRouter)(ctx);
		await expect(caller.setup(setupInput(repoB))).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(db.select().from(projects).all()).toHaveLength(0);
	});

	it("rejects the same folder even when the caller allows relocating", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const repoA = await createTempGitRepo();
		await addRemotes(repoA, { origin: "git@github.com:owner/a.git" });
		const repoB = await createTempGitRepo();
		await addRemotes(repoB, {
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		db.insert(projects)
			.values({
				id: projectA,
				repoPath: repoA,
				name: "a",
				repoUrl: "https://github.com/owner/a",
				updatedAt: 1,
			})
			.run();

		const caller = createCallerFactory(projectRouter)(ctx);
		await expect(caller.setup(setupInput(repoB, true))).rejects.toMatchObject({
			code: "CONFLICT",
		});
		const row = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectA))
			.get();
		expect(row?.repoPath).toBe(repoA);
		expect(row?.repoUrl).toBe("https://github.com/owner/a");
	});

	it("rejects without allowRelocate too, and never as a relocate prompt", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const repoA = await createTempGitRepo();
		await addRemotes(repoA, { origin: "git@github.com:owner/a.git" });
		const repoB = await createTempGitRepo();
		await addRemotes(repoB, {
			origin: "git@github.com:owner/b.git",
			a: "git@github.com:owner/a.git",
		});
		db.insert(projects)
			.values({ id: projectA, repoPath: repoA, name: "a", updatedAt: 1 })
			.run();

		const caller = createCallerFactory(projectRouter)(ctx);
		const err = await caller.setup(setupInput(repoB)).catch((e) => e);
		expect(err).toMatchObject({ code: "CONFLICT" });
		// The wizard turns this phrase into "Use this folder"; the origin
		// mismatch must never be offered as a relocate.
		expect(err.message).not.toContain("already set up on this device at");
		expect(err.message).toContain("git@github.com:owner/b.git");
	});

	it("accepts a secondary-only clone that has no origin", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const repo = await createTempGitRepo();
		await addRemotes(repo, { upstream: "git@github.com:owner/a.git" });

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.setup(setupInput(repo));
		expect(result.repoPath).toBe(repo);
		const row = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectA))
			.get();
		expect(row?.remoteName).toBe("upstream");
	});

	it("records origin when a duplicate secondary remote precedes it in config order", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const repo = await createTempGitRepo();
		await addRemotes(repo, {
			backup: "https://github.com/owner/a.git",
			origin: "git@github.com:owner/a.git",
		});

		const caller = createCallerFactory(projectRouter)(ctx);
		await caller.setup(setupInput(repo));
		const row = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectA))
			.get();
		expect(row?.remoteName).toBe("origin");
		expect(row?.repoUrl).toBe("https://github.com/owner/a");
	});

	it("still relocates to another checkout of the same repo", async () => {
		const db = createTestDb();
		const { api } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const oldCheckout = await createTempGitRepo();
		await addRemotes(oldCheckout, { origin: "git@github.com:owner/a.git" });
		const newCheckout = await createTempGitRepo();
		await addRemotes(newCheckout, {
			upstream: "git@github.com:other/fork.git",
			origin: "git@github.com:owner/a.git",
		});
		db.insert(projects)
			.values({ id: projectA, repoPath: oldCheckout, name: "a", updatedAt: 1 })
			.run();

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.setup(setupInput(newCheckout, true));
		expect(result.repoPath).toBe(newCheckout);
		const row = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectA))
			.get();
		expect(row?.remoteName).toBe("origin");
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
