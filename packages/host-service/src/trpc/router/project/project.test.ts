import { Database } from "bun:sqlite";
import { describe, expect, it, mock } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { projectRouter } from "./project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const MAIN_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const WORKTREE_WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";

function createTestDb() {
	const sqlite = new Database(":memory:");
	// Detach leans on the project→workspaces→pull_requests cascade, which is a
	// no-op unless foreign keys are enforced (production does the same).
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
}

/**
 * `git` and `api` throw on any use: a detach that shells out to git would
 * destroy the worktrees the target org just adopted, and a cloud call would
 * delete the project that was just moved. Both are failures, not warnings.
 */
function createCaller(db: ReturnType<typeof createTestDb>) {
	const git = mock(() => {
		throw new Error("detach must not touch the filesystem via git");
	});
	const cloudDelete = mock(() => {
		throw new Error("detach must not call the cloud");
	});
	const broadcastProjectChanged = mock((_event: unknown) => {});
	const broadcastWorkspaceChanged = mock((_event: unknown) => {});
	const ctx = {
		db,
		isAuthenticated: true,
		organizationId: "org-1",
		git,
		api: { v2Project: { delete: { mutate: cloudDelete } } },
		eventBus: { broadcastProjectChanged, broadcastWorkspaceChanged },
	} as unknown as HostServiceContext;
	return {
		caller: projectRouter.createCaller(ctx),
		mocks: { git, cloudDelete, broadcastProjectChanged },
	};
}

function seedProject(
	db: ReturnType<typeof createTestDb>,
	projectId: string,
	workspaceIds: string[],
) {
	db.insert(schema.projects)
		.values({ id: projectId, repoPath: `/repos/${projectId}`, createdAt: 1 })
		.run();
	for (const [index, workspaceId] of workspaceIds.entries()) {
		db.insert(schema.workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath:
					index === 0 ? `/repos/${projectId}` : `/worktrees/${workspaceId}`,
				branch: index === 0 ? "main" : `feature-${index}`,
				name: index === 0 ? "main" : `feature-${index}`,
				type: index === 0 ? "main" : "worktree",
				createdAt: 1,
			})
			.run();
		db.insert(schema.terminalSessions)
			.values({
				id: `term-${workspaceId}`,
				originWorkspaceId: workspaceId,
				status: "disposed",
				createdAt: 1,
			})
			.run();
		db.insert(schema.terminalAgentBindings)
			.values({
				terminalId: `term-${workspaceId}`,
				workspaceId,
				agentId: "claude",
				startedAt: 1,
				lastEventAt: 1,
				lastEventType: "started",
			})
			.run();
		db.insert(schema.acpSessions)
			.values({
				sessionId: `acp-${workspaceId}`,
				workspaceId,
				acpSessionId: `adapter-${workspaceId}`,
				harness: "claude-agent-acp",
				cwd: `/worktrees/${workspaceId}`,
				createdAt: 1,
				updatedAt: 1,
			})
			.run();
	}
	db.insert(schema.pullRequests)
		.values({
			id: `pr-${projectId}`,
			projectId,
			repoProvider: "github",
			repoOwner: "acme",
			repoName: projectId,
			prNumber: 1,
			url: "https://github.com/acme/repo/pull/1",
			title: "PR",
			state: "open",
			headBranch: "feature-1",
			headSha: "deadbeef",
		})
		.run();
}

describe("projectRouter.detach", () => {
	it("removes the project's local rows and leaves other projects alone", async () => {
		const db = createTestDb();
		seedProject(db, PROJECT_ID, [MAIN_WORKSPACE_ID, WORKTREE_WORKSPACE_ID]);
		seedProject(db, OTHER_PROJECT_ID, [OTHER_WORKSPACE_ID]);
		const { caller } = createCaller(db);

		const result = await caller.detach({ projectId: PROJECT_ID });

		expect(result).toEqual({
			success: true,
			repoPath: `/repos/${PROJECT_ID}`,
			workspaceIds: [MAIN_WORKSPACE_ID, WORKTREE_WORKSPACE_ID],
			warnings: [],
		});
		expect(
			db
				.select()
				.from(schema.projects)
				.all()
				.map((r) => r.id),
		).toEqual([OTHER_PROJECT_ID]);
		expect(
			db
				.select()
				.from(schema.workspaces)
				.all()
				.map((r) => r.projectId),
		).toEqual([OTHER_PROJECT_ID]);
		expect(
			db
				.select()
				.from(schema.pullRequests)
				.all()
				.map((r) => r.projectId),
		).toEqual([OTHER_PROJECT_ID]);
		// The no-foreign-key tables the project cascade can't reach.
		expect(
			db
				.select()
				.from(schema.terminalAgentBindings)
				.all()
				.map((r) => r.workspaceId),
		).toEqual([OTHER_WORKSPACE_ID]);
		expect(
			db
				.select()
				.from(schema.acpSessions)
				.all()
				.map((r) => r.workspaceId),
		).toEqual([OTHER_WORKSPACE_ID]);
		expect(
			db
				.select()
				.from(schema.terminalSessions)
				.all()
				.map((r) => r.originWorkspaceId),
		).toEqual([OTHER_WORKSPACE_ID]);
	});

	it("broadcasts the project deletion so this host's list drops it", async () => {
		const db = createTestDb();
		seedProject(db, PROJECT_ID, [MAIN_WORKSPACE_ID]);
		const { caller, mocks } = createCaller(db);

		await caller.detach({ projectId: PROJECT_ID });

		expect(mocks.broadcastProjectChanged).toHaveBeenCalledTimes(1);
		expect(mocks.broadcastProjectChanged.mock.calls[0]?.[0]).toMatchObject({
			projectId: PROJECT_ID,
			eventType: "deleted",
			project: null,
		});
	});

	it("never removes worktrees or deletes the cloud row", async () => {
		const db = createTestDb();
		seedProject(db, PROJECT_ID, [MAIN_WORKSPACE_ID, WORKTREE_WORKSPACE_ID]);
		const { caller, mocks } = createCaller(db);

		await caller.detach({ projectId: PROJECT_ID });

		expect(mocks.git).not.toHaveBeenCalled();
		expect(mocks.cloudDelete).not.toHaveBeenCalled();
	});

	it("is a quiet no-op for a project this host does not serve", async () => {
		const db = createTestDb();
		const { caller, mocks } = createCaller(db);

		const result = await caller.detach({ projectId: PROJECT_ID });

		expect(result).toEqual({
			success: true,
			repoPath: null,
			workspaceIds: [],
			warnings: [],
		});
		expect(mocks.broadcastProjectChanged).not.toHaveBeenCalled();
	});

	it("is idempotent — a second detach of the same project succeeds", async () => {
		const db = createTestDb();
		seedProject(db, PROJECT_ID, [MAIN_WORKSPACE_ID]);
		const { caller } = createCaller(db);

		await caller.detach({ projectId: PROJECT_ID });
		const second = await caller.detach({ projectId: PROJECT_ID });

		expect(second).toEqual({
			success: true,
			repoPath: null,
			workspaceIds: [],
			warnings: [],
		});
	});
});
