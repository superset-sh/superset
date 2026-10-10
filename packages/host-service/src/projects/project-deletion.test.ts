import { Database } from "bun:sqlite";
import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	projects,
	terminalAgentBindings,
	terminalSessions,
	workspacePurgeTombstones,
	workspaces,
} from "../db/schema";
import { runArchivedWorkspaceReconcile } from "../runtime/archived-workspace-reconcile";
import { createCallerFactory } from "../trpc";
import { projectRouter } from "../trpc/router/project/project";
import { workspaceRouter } from "../trpc/router/workspace/workspace";
import { cleanupGitOps } from "../trpc/router/workspace-cleanup/git-ops";
import * as missingPath from "../trpc/router/workspace-cleanup/is-missing-path";
import type { HostServiceContext } from "../types";
import {
	listDeletedProjects,
	PROJECT_RESTORE_WINDOW_MS,
	purgeDeletedProject,
	purgeExpiredProjects,
	readDeletionImpact,
	restoreProject,
	softDeleteProject,
} from "./project-deletion";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const root = mkdtempSync(join(tmpdir(), "project-deletion-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const originalGitOps = { ...cleanupGitOps };
const databases = new Set<Database>();
afterEach(() => {
	Object.assign(cleanupGitOps, originalGitOps);
	for (const sqlite of databases) sqlite.close();
	databases.clear();
});

function setup(dbPath = ":memory:") {
	const sqlite = new Database(dbPath);
	databases.add(sqlite);
	const db = drizzle(sqlite, {
		schema,
	}) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	const dir = mkdtempSync(join(root, "case-"));
	const repoPath = join(dir, "repo");
	mkdirSync(repoPath);
	db.insert(projects).values({ id: PROJECT_ID, repoPath, name: "demo" }).run();
	const addWorkspace = (
		id: string,
		values: Partial<typeof workspaces.$inferInsert> = {},
	) => {
		const worktreePath = join(dir, id);
		mkdirSync(worktreePath);
		db.insert(workspaces)
			.values({
				id,
				projectId: PROJECT_ID,
				worktreePath,
				branch: id,
				name: id,
				...values,
			})
			.run();
		return worktreePath;
	};
	const events: { kind: string; id: string; type: string }[] = [];
	const gitCalls: string[][] = [];
	cleanupGitOps.resolveGitEnv = async () => ({}) as never;
	cleanupGitOps.removeWorktree = async ({ worktreePath, force }) => {
		gitCalls.push(["worktree", "remove", worktreePath, `force=${force}`]);
		rmSync(worktreePath, { recursive: true, force: true });
		return { stillRegistered: false };
	};
	const ctx = {
		db,
		userId: "alice",
		isAuthenticated: true,
		organizationId: "org",
		api: null,

		eventBus: {
			broadcastProjectChanged: (e: { projectId: string; eventType: string }) =>
				events.push({ kind: "project", id: e.projectId, type: e.eventType }),
			broadcastTagFoldersChanged: () => {},
			broadcastWorkspaceChanged: (e: {
				workspaceId: string;
				eventType: string;
			}) =>
				events.push({
					kind: "workspace",
					id: e.workspaceId,
					type: e.eventType,
				}),
		},
	} as unknown as HostServiceContext;
	const project = () =>
		db.select().from(projects).where(eq(projects.id, PROJECT_ID)).get();
	const workspace = (id: string) =>
		db.select().from(workspaces).where(eq(workspaces.id, id)).get();
	return {
		sqlite,
		db,
		ctx,
		repoPath,
		addWorkspace,
		events,
		gitCalls,
		project,
		workspace,
	};
}

describe("soft delete", () => {
	test("hides the project and its live workspaces, keeping their files", async () => {
		const { ctx, addWorkspace, events, project, workspace } = setup();
		const live = addWorkspace("live");
		addWorkspace("earlier", { archivedAt: 1, archiveReason: "deleted" });

		const result = await softDeleteProject(ctx, PROJECT_ID);

		expect(result?.deletedAt).toBe(project()?.deletedAt as number);
		expect(project()?.deletedByUserId).toBe("alice");
		expect(workspace("live")?.archivedAt).toBe(project()?.deletedAt as number);
		expect(workspace("earlier")?.archivedAt).toBe(1);
		expect(existsSync(live)).toBe(true);
		expect(events).toContainEqual({
			kind: "workspace",
			id: "live",
			type: "deleted",
		});
		expect(events).toContainEqual({
			kind: "project",
			id: PROJECT_ID,
			type: "deleted",
		});
	});

	test("deleting twice keeps the first deletion time", async () => {
		const { ctx, project } = setup();
		const first = await softDeleteProject(ctx, PROJECT_ID);
		const second = await softDeleteProject(ctx, PROJECT_ID);
		expect(second?.deletedAt).toBe(first?.deletedAt as number);
		expect(project()?.deletedAt).toBe(first?.deletedAt as number);
	});

	test("an unknown project is a no-op", async () => {
		const { ctx } = setup();
		expect(
			await softDeleteProject(ctx, "00000000-0000-4000-8000-00000000000f"),
		).toBeNull();
	});
});

describe("restore", () => {
	test("brings back only the workspaces deleted with the project", async () => {
		const { ctx, addWorkspace, events, project, workspace } = setup();
		addWorkspace("live");
		addWorkspace("earlier", { archivedAt: 1, archiveReason: "deleted" });
		const gone = addWorkspace("gone");
		await softDeleteProject(ctx, PROJECT_ID);
		rmSync(gone, { recursive: true });

		expect(restoreProject(ctx, PROJECT_ID)).toEqual({
			restoredWorkspaceCount: 1,
		});
		expect(project()?.deletedAt).toBeNull();
		expect(workspace("live")?.archivedAt).toBeNull();
		expect(workspace("earlier")?.archivedAt).toBe(1);
		expect(workspace("gone")?.archivedAt).not.toBeNull();
		expect(events).toContainEqual({
			kind: "project",
			id: PROJECT_ID,
			type: "created",
		});
		expect(events).toContainEqual({
			kind: "workspace",
			id: "live",
			type: "created",
		});
	});

	test("restoring a project that is not deleted changes nothing", () => {
		const { ctx, project } = setup();
		expect(restoreProject(ctx, PROJECT_ID)).toEqual({
			restoredWorkspaceCount: 0,
		});
		expect(project()?.deletedAt).toBeNull();
	});
});

describe("listing", () => {
	test("deleted projects list with their purge time", async () => {
		const { ctx, addWorkspace } = setup();
		addWorkspace("live");
		const { deletedAt } = (await softDeleteProject(ctx, PROJECT_ID)) as {
			deletedAt: number;
		};
		expect(listDeletedProjects(ctx)).toEqual([
			expect.objectContaining({
				id: PROJECT_ID,
				name: "demo",
				deletedByUserId: "alice",
				purgeAt: deletedAt + PROJECT_RESTORE_WINDOW_MS,
				workspaceCount: 1,
			}),
		]);
	});

	test("project.list, project.get and workspace listings hide a deleted project", async () => {
		const { ctx, addWorkspace } = setup();
		addWorkspace("live");
		await softDeleteProject(ctx, PROJECT_ID);
		const projectsApi = createCallerFactory(projectRouter)(ctx);
		const workspacesApi = createCallerFactory(workspaceRouter)(ctx);
		expect(await projectsApi.list()).toEqual([]);
		expect(await projectsApi.get({ projectId: PROJECT_ID })).toBeNull();
		expect(await workspacesApi.list({ includeArchived: true })).toEqual([]);
	});

	test("the interrupted-delete reconciler leaves a deleted project's worktrees alone", async () => {
		const { ctx, addWorkspace, workspace } = setup();
		const live = addWorkspace("live");
		await softDeleteProject(ctx, PROJECT_ID);
		await runArchivedWorkspaceReconcile(ctx);
		expect(workspace("live")?.archivedAt).not.toBeNull();
		expect(existsSync(live)).toBe(true);
	});
});

describe("purge", () => {
	test("keeps projects inside the restore window", async () => {
		const { ctx, db, addWorkspace, project } = setup();
		addWorkspace("restorable");
		await softDeleteProject(ctx, PROJECT_ID);
		expect(await purgeExpiredProjects(ctx)).toBe(0);
		expect(project()).toBeDefined();
		expect(db.select().from(workspacePurgeTombstones).all()).toEqual([]);
		const api = createCallerFactory(workspaceRouter)(ctx);
		expect(await api.getArchivedIds({ workspaceIds: ["restorable"] })).toEqual(
			[],
		);
		restoreProject(ctx, PROJECT_ID);
		expect(await api.getArchivedIds({ workspaceIds: ["restorable"] })).toEqual(
			[],
		);
	});

	test("removes expired projects and their worktrees but never the repository", async () => {
		const { ctx, addWorkspace, repoPath, gitCalls, project, workspace } =
			setup();
		const live = addWorkspace("live");
		addWorkspace("checkout", { type: "local" });
		const { deletedAt } = (await softDeleteProject(ctx, PROJECT_ID)) as {
			deletedAt: number;
		};
		expect(
			await purgeExpiredProjects(
				ctx,
				deletedAt + PROJECT_RESTORE_WINDOW_MS + 1,
			),
		).toBe(1);
		expect(project()).toBeUndefined();
		expect(workspace("live")).toBeUndefined();
		expect(gitCalls).toEqual([["worktree", "remove", live, "force=false"]]);
		expect(existsSync(repoPath)).toBe(true);
		expect(
			await createCallerFactory(workspaceRouter)(ctx).getArchivedIds({
				workspaceIds: ["live", "checkout", "other-host"],
			}),
		).toEqual(["checkout", "live"]);
	});
});

describe("delete permanently", () => {
	test.each([
		true,
		false,
	])("archive confirmation preserves a new path owner (checkout created: %s) while another check waits", async (createCheckout) => {
		const { ctx, db, addWorkspace } = setup();
		const first = addWorkspace("a-archived", {
			archivedAt: 1,
			archiveReason: "deleted",
		});
		const second = addWorkspace("b-archived", {
			archivedAt: 1,
			archiveReason: "deleted",
		});
		rmSync(first, { recursive: true });
		rmSync(second, { recursive: true });
		const started = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		const original = missingPath.isMissingPath;
		let delayed = false;
		const check = spyOn(missingPath, "isMissingPath").mockImplementation(
			async (path) => {
				if (path === second && !delayed) {
					delayed = true;
					started.resolve();
					await finish.promise;
				}
				return original(path);
			},
		);
		const result = createCallerFactory(workspaceRouter)(ctx).getArchivedIds({
			workspaceIds: ["a-archived", "b-archived"],
		});
		try {
			await started.promise;
			if (createCheckout) mkdirSync(first);
			db.insert(workspaces)
				.values({
					id: "new-owner",
					projectId: PROJECT_ID,
					worktreePath: first,
					branch: "new-owner",
				})
				.run();
			finish.resolve();
			expect(await result).toEqual(["b-archived"]);
		} finally {
			finish.resolve();
			await result;
			check.mockRestore();
		}
	});
	test("purges a deleted project right away", async () => {
		const { ctx, addWorkspace, gitCalls, project, repoPath } = setup();
		const live = addWorkspace("live");
		await softDeleteProject(ctx, PROJECT_ID);
		expect(await purgeDeletedProject(ctx, PROJECT_ID)).toBe(true);
		expect(project()).toBeUndefined();
		expect(gitCalls).toEqual([["worktree", "remove", live, "force=false"]]);
		expect(existsSync(repoPath)).toBe(true);
		const api = createCallerFactory(workspaceRouter)(ctx);
		expect(
			await api.getArchivedIds({ workspaceIds: ["live", "other-host"] }),
		).toEqual(["live"]);
	});

	test("refuses a project that was never deleted", async () => {
		const { ctx, addWorkspace, gitCalls, project } = setup();
		addWorkspace("live");
		expect(await purgeDeletedProject(ctx, PROJECT_ID)).toBe(false);
		expect(project()).toBeDefined();
		expect(gitCalls).toEqual([]);
	});

	test("a rolled-back purge does not leave confirmation behind", async () => {
		const { ctx, db, sqlite, addWorkspace, project, workspace } = setup();
		addWorkspace("rollback", { type: "local" });
		await softDeleteProject(ctx, PROJECT_ID);
		sqlite.exec(
			"CREATE TRIGGER reject_workspace_delete BEFORE DELETE ON workspaces BEGIN SELECT RAISE(ABORT, 'fixture rejects deletion'); END",
		);
		await expect(purgeDeletedProject(ctx, PROJECT_ID)).rejects.toThrow(
			"fixture rejects deletion",
		);
		expect(project()).toBeDefined();
		expect(workspace("rollback")).toBeDefined();
		expect(db.select().from(workspacePurgeTombstones).all()).toEqual([]);
		expect(
			await createCallerFactory(workspaceRouter)(ctx).getArchivedIds({
				workspaceIds: ["rollback"],
			}),
		).toEqual([]);
		expect(restoreProject(ctx, PROJECT_ID)).toEqual({
			restoredWorkspaceCount: 1,
		});
	});

	test("refuses restore and a second purge while filesystem removal is pending", async () => {
		const { ctx, db, addWorkspace, project, workspace } = setup();
		const path = addWorkspace("restored-during-cleanup");
		await softDeleteProject(ctx, PROJECT_ID);
		const started = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		cleanupGitOps.removeWorktree = async () => {
			started.resolve();
			await finish.promise;
			rmSync(path, { recursive: true });
			return { stillRegistered: false };
		};
		const purge = purgeDeletedProject(ctx, PROJECT_ID);
		await started.promise;
		try {
			expect(() => restoreProject(ctx, PROJECT_ID)).toThrow(
				"Project deletion is in progress",
			);
			expect(await purgeDeletedProject(ctx, PROJECT_ID)).toBe(false);
			await expect(
				createCallerFactory(projectRouter)(ctx).restore({
					projectId: PROJECT_ID,
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(project()?.deletedAt).not.toBeNull();
			expect(workspace("restored-during-cleanup")?.archivedAt).not.toBeNull();
			expect(existsSync(path)).toBe(true);
		} finally {
			finish.resolve();
			await purge;
		}
		expect(existsSync(path)).toBe(false);
		expect(project()).toBeUndefined();
		expect(db.select().from(workspacePurgeTombstones).all()).toHaveLength(1);
		expect(
			await createCallerFactory(workspaceRouter)(ctx).getArchivedIds({
				workspaceIds: ["restored-during-cleanup"],
			}),
		).toEqual(["restored-during-cleanup"]);
	});

	test.each([
		"throws",
		"leaves-path",
	])("failed worktree removal (%s) retains retryable rows without purge confirmation", async (failure) => {
		const { ctx, db, addWorkspace, workspace, project } = setup();
		const path = addWorkspace("left-on-disk");
		await softDeleteProject(ctx, PROJECT_ID);
		cleanupGitOps.removeWorktree = async () => {
			if (failure === "throws") throw new Error("fixture worktree is locked");
			return { stillRegistered: false };
		};
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(await purgeDeletedProject(ctx, PROJECT_ID)).toBe(false);
			expect(existsSync(path)).toBe(true);
			expect(workspace("left-on-disk")).toBeDefined();
			expect(project()).toBeDefined();
			expect(db.select().from(workspacePurgeTombstones).all()).toEqual([]);
			if (failure === "throws") expect(warn).toHaveBeenCalled();
			expect(
				await createCallerFactory(workspaceRouter)(ctx).getArchivedIds({
					workspaceIds: ["left-on-disk", "unknown"],
				}),
			).toEqual([]);
			cleanupGitOps.removeWorktree = async () => {
				rmSync(path, { recursive: true });
				return { stillRegistered: false };
			};
			expect(await purgeDeletedProject(ctx, PROJECT_ID)).toBe(true);
			expect(workspace("left-on-disk")).toBeUndefined();
		} finally {
			warn.mockRestore();
		}
	});

	test("does not purge a workspace inserted while filesystem cleanup waits", async () => {
		const { ctx, db, addWorkspace, project, workspace } = setup();
		const path = addWorkspace("original");
		await softDeleteProject(ctx, PROJECT_ID);
		const started = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		cleanupGitOps.removeWorktree = async () => {
			started.resolve();
			await finish.promise;
			rmSync(path, { recursive: true });
			return { stillRegistered: false };
		};
		const purge = purgeDeletedProject(ctx, PROJECT_ID);
		await started.promise;
		const latePath = addWorkspace("late-create");
		finish.resolve();
		expect(await purge).toBe(false);
		expect(project()).toBeDefined();
		expect(workspace("original")).toBeDefined();
		expect(workspace("late-create")).toBeDefined();
		expect(existsSync(latePath)).toBe(true);
		expect(db.select().from(workspacePurgeTombstones).all()).toEqual([]);
		expect(restoreProject(ctx, PROJECT_ID)).toEqual({
			restoredWorkspaceCount: 0,
		});
	});

	test("purge confirmation survives reopening storage and never overrides a current workspace", async () => {
		const dbPath = join(mkdtempSync(join(root, "restart-")), "host.db");
		const { ctx, sqlite, addWorkspace, repoPath } = setup(dbPath);
		addWorkspace("purged");
		addWorkspace("unrequested");
		await softDeleteProject(ctx, PROJECT_ID);
		await purgeDeletedProject(ctx, PROJECT_ID);
		sqlite.close();
		databases.delete(sqlite);
		const reopened = new Database(dbPath);
		databases.add(reopened);
		const db = drizzle(reopened, { schema }) as unknown as HostDb;
		runMigrations(db, MIGRATIONS_FOLDER);
		const api = createCallerFactory(workspaceRouter)({ ...ctx, db });
		expect(
			await api.getArchivedIds({ workspaceIds: ["purged", "other-host"] }),
		).toEqual(["purged"]);
		expect(await api.getArchivedIds({ workspaceIds: [] })).toEqual([]);
		db.insert(workspaces)
			.values({
				id: "purged",
				type: "session",
				worktreePath: repoPath,
				branch: "main",
			})
			.run();
		expect(await api.getArchivedIds({ workspaceIds: ["purged"] })).toEqual([]);
	});
});

describe("deletion impact", () => {
	test("reports running terminals, agents and last activity per workspace", () => {
		const { db, ctx, addWorkspace } = setup();
		addWorkspace("busy", { createdByUserId: "bob", lastActivityAt: 100 });
		addWorkspace("idle", { createdByUserId: "alice", lastActivityAt: null });
		addWorkspace("old", { archivedAt: 5, archiveReason: "deleted" });
		db.insert(terminalSessions)
			.values([
				{ id: "t1", originWorkspaceId: "busy", lastAttachedAt: 300 },
				{ id: "t2", originWorkspaceId: "busy" },
				{ id: "t3", originWorkspaceId: "busy", disposeRequestedAt: 1 },
				{ id: "t4", originWorkspaceId: "busy", status: "exited" },
			])
			.run();
		db.insert(terminalAgentBindings)
			.values([
				{
					terminalId: "t1",
					workspaceId: "busy",
					agentId: "claude" as never,
					startedAt: 1,
					lastEventAt: 500,
					lastEventType: "tool",
				},
				{
					terminalId: "t2",
					workspaceId: "busy",
					agentId: "codex" as never,
					startedAt: 1,
					lastEventAt: 900,
					lastEventType: "stop",
					endedAt: 950,
				},
			])
			.run();
		expect(readDeletionImpact(ctx, PROJECT_ID)).toEqual([
			{
				workspaceId: "busy",
				name: "busy",
				createdByUserId: "bob",
				runningTerminalCount: 2,
				runningAgentCount: 1,
				lastActiveAt: 500,
			},
			{
				workspaceId: "idle",
				name: "idle",
				createdByUserId: "alice",
				runningTerminalCount: 0,
				runningAgentCount: 0,
				lastActiveAt: null,
			},
		]);
	});
});
