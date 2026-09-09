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
	// Map github repo URL (lowercased) -> candidate ids to return, so a test
	// can simulate which remotes resolve to which cloud projects. Uses the
	// same v2Project.findByGitHubRemote shape.
	const byRemoteUrl = new Map<string, string[]>();
	const api = {
		v2Project: {
			findByGitHubRemote: {
				query: async ({ repoCloneUrl }: { repoCloneUrl: string }) => {
					calls.push("v2Project.findByGitHubRemote");
					const ids = byRemoteUrl.get(repoCloneUrl.toLowerCase()) ?? [];
					return {
						candidates: ids.map((id) => ({ id, name: id })),
					};
				},
			},
		},
	};
	return { api, calls, byRemoteUrl };
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

	it("marks origin-derived candidates viaOrigin and ranks them first", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		// Set up the exact #7241 shape: a repo with origin -> owner/kogan and a
		// secondary `oms-service` remote -> owner/oms-service. Only the
		// secondary remote is a cloud v2 project; the origin repo is not yet
		// imported, so its lookup returns no candidates.
		await (async () => {
			const git = createUserSimpleGit(root);
			const remoteUrls = new Map([
				["origin", "https://github.com/owner/kogan.git"],
				["oms-service", "https://github.com/owner/oms-service.git"],
			]);
			for (const [name, url] of remoteUrls) {
				await git.raw(["remote", "add", name, url]);
			}
		})();
		// The hijack candidate is the oms-service project.
		byRemoteUrl.set("https://github.com/owner/oms-service", [
			"7efcc5af-oms-service",
		]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.hasOriginRemote).toBe(true);
		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]).toEqual(
			expect.objectContaining({
				id: "7efcc5af-oms-service",
				source: "remote",
				viaOrigin: false,
			}),
		);
	});

	it("origin-derived candidate wins the sort over a secondary-remote one", async () => {
		const db = createTestDb();
		const { api, byRemoteUrl } = createRecordingApiStub();
		const ctx = createTestContext(db, api);
		const root = await createTempGitRepo();

		// origin and a secondary remote BOTH map to a (distinct) cloud project:
		// the origin one must sort first so `candidates[0]` is this repo's own.
		await (async () => {
			const git = createUserSimpleGit(root);
			await git.raw([
				"remote",
				"add",
				"origin",
				"https://github.com/owner/myrepo.git",
			]);
			await git.raw([
				"remote",
				"add",
				"upstream",
				"https://github.com/other/upstream.git",
			]);
		})();
		byRemoteUrl.set("https://github.com/owner/myrepo", ["myrepo-id"]);
		byRemoteUrl.set("https://github.com/other/upstream", ["upstream-id"]);

		const caller = createCallerFactory(projectRouter)(ctx);
		const result = await caller.findByPath({
			repoPath: root,
			walkAllRemotes: true,
		});

		expect(result.candidates.map((c) => c.id)).toEqual([
			"myrepo-id",
			"upstream-id",
		]);
		expect(result.candidates[0]?.viaOrigin).toBe(true);
		expect(result.candidates[1]?.viaOrigin).toBe(false);
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
