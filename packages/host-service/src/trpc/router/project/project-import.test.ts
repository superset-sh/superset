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
	/** Canonical GitHub URL (lower-cased) → cloud project ids it resolves to. */
	const byRemoteUrl = new Map<string, string[]>();
	const api = {
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
