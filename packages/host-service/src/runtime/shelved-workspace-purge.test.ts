import { Database as BunDatabase } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import type { EventBus } from "../events";
import type { HostServiceContext } from "../types";
import {
	runShelvedWorkspacePurge,
	SHELF_RETENTION_MS,
	selectExpiredShelved,
} from "./shelved-workspace-purge";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("selectExpiredShelved", () => {
	const now = Date.now();

	test("picks a row past the retention window, not one still inside it", () => {
		const rows = [
			{ id: "expired", shelvedAt: now - SHELF_RETENTION_MS - 60_000 },
			{ id: "fresh", shelvedAt: now - 29 * DAY_MS },
		].map((row) => ({ ...row, archivedAt: null as number | null }));

		expect(
			selectExpiredShelved(rows, now, SHELF_RETENTION_MS).map((r) => r.id),
		).toEqual(["expired"]);
	});

	test("ignores tombstoned rows and live rows", () => {
		const rows = [
			{
				id: "tombstoned",
				shelvedAt: now - SHELF_RETENTION_MS - DAY_MS,
				archivedAt: now - 1000,
			},
			{ id: "live", shelvedAt: null, archivedAt: null },
		];

		expect(selectExpiredShelved(rows, now, SHELF_RETENTION_MS)).toEqual([]);
	});
});

function makeDb(): HostDb {
	const dir = mkdtempSync(join(tmpdir(), "shelved-purge-"));
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

describe("runShelvedWorkspacePurge", () => {
	let db: HostDb;

	function makeCtx(): HostServiceContext {
		return {
			isAuthenticated: true,
			organizationId: "00000000-0000-0000-0000-000000000001",
			db,
			eventBus: {
				broadcastWorkspaceChanged: mock(() => {}),
			} as unknown as EventBus,
		} as unknown as HostServiceContext;
	}

	function seedShelved(id: string, shelvedAgoMs: number): void {
		const now = Date.now();
		db.insert(workspaces)
			.values({
				id,
				projectId: "p-1",
				worktreePath: `/wt/${id}`,
				branch: `feat/${id}`,
				name: id,
				type: "worktree",
				createdAt: now,
				updatedAt: now,
				shelvedAt: now - shelvedAgoMs,
			})
			.run();
	}

	function readRow(id: string) {
		return db.query.workspaces
			.findFirst({ where: eq(workspaces.id, id) })
			.sync();
	}

	const expired = SHELF_RETENTION_MS + 60_000;

	beforeEach(() => {
		db = makeDb();
	});

	test("a worktree whose git status cannot be read is kept, marked, and never destroyed", async () => {
		const dir = mkdtempSync(join(tmpdir(), "shelved-purge-wt-"));
		seedShelved("ws-odd", expired);
		db.update(workspaces)
			.set({ worktreePath: dir })
			.where(eq(workspaces.id, "ws-odd"))
			.run();
		const destroy = mock(async () => ({ success: true }));
		const readWorktreeState = mock(async () => {
			throw new Error("not a git repository");
		});

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
			readWorktreeState,
		);

		expect(destroy).not.toHaveBeenCalled();
		expect(readRow("ws-odd")?.purgeBlockedReason).toBe("unverifiable");
		expect(readRow("ws-odd")?.shelvedAt).not.toBeNull();
	});

	test("a restore during the worktree check wins over the purge", async () => {
		const dir = mkdtempSync(join(tmpdir(), "shelved-purge-wt-"));
		seedShelved("ws-back", expired);
		db.update(workspaces)
			.set({ worktreePath: dir })
			.where(eq(workspaces.id, "ws-back"))
			.run();
		const destroy = mock(async () => ({ success: true }));

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
			async () => {
				db.update(workspaces)
					.set({ shelvedAt: null })
					.where(eq(workspaces.id, "ws-back"))
					.run();
				return { hasChanges: false, hasUnpushedCommits: false };
			},
		);

		expect(destroy).not.toHaveBeenCalled();
		expect(readRow("ws-back")?.shelvedAt).toBeNull();
	});

	test("a worktree git reports dirty is kept without calling destroy", async () => {
		const dir = mkdtempSync(join(tmpdir(), "shelved-purge-wt-"));
		seedShelved("ws-wip", expired);
		db.update(workspaces)
			.set({ worktreePath: dir })
			.where(eq(workspaces.id, "ws-wip"))
			.run();
		const destroy = mock(async () => ({ success: true }));

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
			async () => ({ hasChanges: true, hasUnpushedCommits: false }),
		);

		expect(destroy).not.toHaveBeenCalled();
		expect(readRow("ws-wip")?.purgeBlockedReason).toBe("dirty");
	});

	test("a clean worktree with unpushed commits is kept without calling destroy", async () => {
		const dir = mkdtempSync(join(tmpdir(), "shelved-purge-wt-"));
		seedShelved("ws-unpushed", expired);
		db.update(workspaces)
			.set({ worktreePath: dir })
			.where(eq(workspaces.id, "ws-unpushed"))
			.run();
		const destroy = mock(async () => ({ success: true }));

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
			async () => ({ hasChanges: false, hasUnpushedCommits: true }),
		);

		expect(destroy).not.toHaveBeenCalled();
		expect(readRow("ws-unpushed")?.purgeBlockedReason).toBe("dirty");
		expect(readRow("ws-unpushed")?.shelvedAt).not.toBeNull();
	});

	test("a restore during the worktree check leaves no purge-blocked marker", async () => {
		const dir = mkdtempSync(join(tmpdir(), "shelved-purge-wt-"));
		seedShelved("ws-race", expired);
		db.update(workspaces)
			.set({ worktreePath: dir })
			.where(eq(workspaces.id, "ws-race"))
			.run();
		const destroy = mock(async () => ({ success: true }));

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
			async () => {
				db.update(workspaces)
					.set({ shelvedAt: null })
					.where(eq(workspaces.id, "ws-race"))
					.run();
				return { hasChanges: true, hasUnpushedCommits: false };
			},
		);

		expect(destroy).not.toHaveBeenCalled();
		expect(readRow("ws-race")?.purgeBlockedReason).toBeNull();
	});

	test("a restore during an unreadable git status leaves no purge-blocked marker", async () => {
		const dir = mkdtempSync(join(tmpdir(), "shelved-purge-wt-"));
		seedShelved("ws-race-odd", expired);
		db.update(workspaces)
			.set({ worktreePath: dir })
			.where(eq(workspaces.id, "ws-race-odd"))
			.run();
		const destroy = mock(async () => ({ success: true }));

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
			async () => {
				db.update(workspaces)
					.set({ shelvedAt: null })
					.where(eq(workspaces.id, "ws-race-odd"))
					.run();
				throw new Error("not a git repository");
			},
		);

		expect(destroy).not.toHaveBeenCalled();
		expect(readRow("ws-race-odd")?.purgeBlockedReason).toBeNull();
	});

	test("a restore during destroy leaves the CONFLICT unmarked", async () => {
		seedShelved("ws-race-conflict", expired);
		const destroy = mock(async () => {
			db.update(workspaces)
				.set({ shelvedAt: null })
				.where(eq(workspaces.id, "ws-race-conflict"))
				.run();
			throw new TRPCError({
				code: "CONFLICT",
				message: "Worktree has uncommitted changes",
			});
		});

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
		);

		expect(readRow("ws-race-conflict")?.purgeBlockedReason).toBeNull();
	});

	test("destroys every expired row, branch included", async () => {
		seedShelved("ws-old", expired);
		seedShelved("ws-fresh", 29 * DAY_MS);
		const destroy = mock(
			async (_ctx: unknown, _input: Record<string, unknown>) => ({
				success: true,
			}),
		);

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
		);

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(destroy.mock.calls[0]?.[1]).toEqual({
			workspaceId: "ws-old",
			deleteBranch: true,
			force: false,
			teardownMode: "best-effort",
		});
	});

	test("a dirty worktree CONFLICT marks the row and the sweep continues", async () => {
		seedShelved("ws-dirty", expired);
		seedShelved("ws-next", expired + 1000);
		const destroy = mock(
			async (_ctx: unknown, input: { workspaceId: string }) => {
				if (input.workspaceId === "ws-dirty") {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Worktree has uncommitted changes",
					});
				}
				return { success: true };
			},
		);

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
		);

		expect(destroy).toHaveBeenCalledTimes(2);
		expect(readRow("ws-dirty")?.purgeBlockedReason).toBe("dirty");
		expect(readRow("ws-dirty")?.shelvedAt).not.toBeNull();
	});

	test("a delete already in flight is skipped unmarked", async () => {
		seedShelved("ws-busy", expired);
		seedShelved("ws-next", expired + 1000);
		const destroy = mock(
			async (_ctx: unknown, input: { workspaceId: string }) => {
				if (input.workspaceId === "ws-busy") {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Deletion already in progress for this workspace",
						cause: { kind: "DELETE_IN_PROGRESS" },
					});
				}
				return { success: true };
			},
		);

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
		);

		expect(destroy).toHaveBeenCalledTimes(2);
		expect(readRow("ws-busy")?.purgeBlockedReason).toBeNull();
	});

	test("any other failure is left unmarked and does not abort the sweep", async () => {
		seedShelved("ws-broken", expired);
		seedShelved("ws-next", expired + 1000);
		const destroy = mock(
			async (_ctx: unknown, input: { workspaceId: string }) => {
				if (input.workspaceId === "ws-broken") throw new Error("git exploded");
				return { success: true };
			},
		);

		await runShelvedWorkspacePurge(
			makeCtx(),
			destroy as unknown as Parameters<typeof runShelvedWorkspacePurge>[1],
		);

		expect(destroy).toHaveBeenCalledTimes(2);
		expect(readRow("ws-broken")?.purgeBlockedReason).toBeNull();
	});

	test("a second sweep started while one runs returns immediately", async () => {
		seedShelved("ws-old", expired);
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const destroy = mock(async () => {
			await gate;
			return { success: true };
		});
		const ctx = makeCtx();
		const cast = destroy as unknown as Parameters<
			typeof runShelvedWorkspacePurge
		>[1];

		const first = runShelvedWorkspacePurge(ctx, cast);
		await runShelvedWorkspacePurge(ctx, cast);
		expect(destroy).toHaveBeenCalledTimes(1);

		release?.();
		await first;
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
