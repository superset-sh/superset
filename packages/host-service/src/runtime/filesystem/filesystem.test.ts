import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { invalidateAllSearchIndexes } from "@superset/workspace-fs/host";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { projects, workspaces } from "../../db/schema";
import { WorkspaceFilesystemManager } from "./filesystem";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function insertWorkspace(db: HostDb, rootPath: string): string {
	const projectId = randomUUID();
	const workspaceId = randomUUID();
	db.insert(projects)
		.values({ id: projectId, repoPath: rootPath, name: "p", updatedAt: 1 })
		.run();
	db.insert(workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath: rootPath,
			branch: "main",
			name: "Main",
			type: "main",
			updatedAt: 1,
		})
		.run();
	return workspaceId;
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) {
		await cleanup();
	}
	invalidateAllSearchIndexes();
});

function createTempRoot(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "ws-fs-manager-")));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function withSupersetHomeInside(rootPath: string): void {
	const previous = process.env.SUPERSET_HOME_DIR;
	process.env.SUPERSET_HOME_DIR = join(rootPath, ".superset");
	cleanups.push(() => {
		if (previous === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previous;
	});
}

async function nextEventsOrTimeout(
	iterator: AsyncIterator<{ events: unknown[] }>,
	ms: number,
): Promise<"delivered" | "timeout"> {
	return await Promise.race([
		iterator.next().then(() => "delivered" as const),
		new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), ms),
		),
	]);
}

describe("WorkspaceFilesystemManager.getServiceForRootPath", () => {
	it("gives a forbidden root a watcher that attaches and never delivers, and no index walk", async () => {
		const rootPath = createTempRoot();
		withSupersetHomeInside(rootPath);
		await writeFile(join(rootPath, "ghost.txt"), "x");
		const db = createTestDb();
		const workspaceId = insertWorkspace(db, rootPath);
		const manager = new WorkspaceFilesystemManager({ db });
		cleanups.push(() => manager.close());
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		cleanups.push(() => warn.mockRestore());

		const service = manager.getServiceForWorkspace(workspaceId);
		expect(manager.getServiceForWorkspace(workspaceId)).toBe(service);
		const refusals = warn.mock.calls.filter(
			([message]) => message === "[workspace-fs] not watching this root",
		);
		expect(refusals).toHaveLength(1);
		expect(refusals[0]?.[1]).toEqual({
			rootPath,
			reason: "contains-superset-home",
		});

		// Attaches without error, then stays silent through a real change (a
		// native watcher on this root reports the write well inside 2 s once it
		// has had its post-subscribe moment; see the allowed-root case).
		const iterator = service
			.watchPath({ absolutePath: rootPath })
			[Symbol.asyncIterator]();
		await new Promise((resolve) => setTimeout(resolve, 300));
		await writeFile(join(rootPath, "changed.txt"), "y");
		expect(await nextEventsOrTimeout(iterator, 2_000)).toBe("timeout");
		await iterator.return?.();

		// No index walk was started by creating the service: the first search
		// builds the index from what is on disk *now*, so a file removed after
		// creation is absent. A pre-warmed index would still list it.
		rmSync(join(rootPath, "ghost.txt"));
		const { matches } = await service.searchFiles({ query: "ghost" });
		expect(matches).toHaveLength(0);
	});

	it("gives an allowed root a real watcher that delivers events", async () => {
		const rootPath = createTempRoot();
		const db = createTestDb();
		const workspaceId = insertWorkspace(db, rootPath);
		const manager = new WorkspaceFilesystemManager({ db });
		cleanups.push(() => manager.close());
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		cleanups.push(() => warn.mockRestore());

		const service = manager.getServiceForWorkspace(workspaceId);
		expect(
			warn.mock.calls.some(
				([message]) => message === "[workspace-fs] not watching this root",
			),
		).toBe(false);

		const iterator = service
			.watchPath({ absolutePath: rootPath })
			[Symbol.asyncIterator]();
		// The native watcher needs a moment after subscribe() before it reports.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await writeFile(join(rootPath, "changed.txt"), "y");
		expect(await nextEventsOrTimeout(iterator, 5_000)).toBe("delivered");
		await iterator.return?.();
	});
});
