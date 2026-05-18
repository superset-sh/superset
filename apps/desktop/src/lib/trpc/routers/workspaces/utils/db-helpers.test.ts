import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as realSchema from "../../../../../../../../packages/local-db/src/schema/schema";

mock.module("@superset/local-db", () => realSchema);

const sqlite = new Database(":memory:");
const db = drizzle(sqlite, { schema: realSchema });

mock.module("main/lib/local-db", () => ({ localDb: db }));

mock.module("../../ports/label-cache", () => ({
	invalidatePortLabelCache: () => {},
}));

const { activateProject, deleteWorkspace, hideProjectIfNoWorkspaces } =
	await import("./db-helpers");
const { computeVisualOrder } = await import("./visual-order");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID_2 = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID_2 = "44444444-4444-4444-8444-444444444444";

function resetDb(): void {
	sqlite.exec("DROP TABLE IF EXISTS workspaces");
	sqlite.exec("DROP TABLE IF EXISTS workspace_sections");
	sqlite.exec("DROP TABLE IF EXISTS worktrees");
	sqlite.exec("DROP TABLE IF EXISTS projects");
	sqlite.exec(`
		CREATE TABLE projects (
			id TEXT PRIMARY KEY NOT NULL,
			main_repo_path TEXT NOT NULL,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			tab_order INTEGER,
			last_opened_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			config_toast_dismissed INTEGER,
			default_branch TEXT,
			workspace_base_branch TEXT,
			github_owner TEXT,
			branch_prefix_mode TEXT,
			branch_prefix_custom TEXT,
			worktree_base_dir TEXT,
			hide_image INTEGER,
			icon_url TEXT,
			neon_project_id TEXT,
			default_app TEXT
		)
	`);
	sqlite.exec(`
		CREATE TABLE worktrees (
			id TEXT PRIMARY KEY NOT NULL,
			project_id TEXT NOT NULL,
			path TEXT NOT NULL,
			branch TEXT NOT NULL,
			base_branch TEXT,
			created_at INTEGER NOT NULL,
			git_status TEXT,
			github_status TEXT,
			created_by_superset INTEGER NOT NULL DEFAULT 1
		)
	`);
	sqlite.exec(`
		CREATE TABLE workspace_sections (
			id TEXT PRIMARY KEY NOT NULL,
			project_id TEXT NOT NULL,
			name TEXT NOT NULL,
			tab_order INTEGER NOT NULL,
			is_collapsed INTEGER DEFAULT 0,
			color TEXT,
			created_at INTEGER NOT NULL
		)
	`);
	sqlite.exec(`
		CREATE TABLE workspaces (
			id TEXT PRIMARY KEY NOT NULL,
			project_id TEXT NOT NULL,
			worktree_id TEXT,
			type TEXT NOT NULL,
			branch TEXT NOT NULL,
			name TEXT NOT NULL,
			tab_order INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			last_opened_at INTEGER NOT NULL,
			is_unread INTEGER DEFAULT 0,
			is_unnamed INTEGER DEFAULT 0,
			deleting_at INTEGER,
			port_base INTEGER,
			section_id TEXT
		)
	`);
}

function insertProject(id: string, name: string, tabOrder: number | null) {
	const now = Date.now();
	db.insert(realSchema.projects)
		.values({
			id,
			mainRepoPath: `/tmp/${name}`,
			name,
			color: "#000000",
			tabOrder,
			lastOpenedAt: now,
			createdAt: now,
		})
		.run();
}

function insertWorkspace(id: string, projectId: string, tabOrder: number) {
	const now = Date.now();
	db.insert(realSchema.workspaces)
		.values({
			id,
			projectId,
			worktreeId: null,
			type: "branch",
			branch: "main",
			name: "default",
			tabOrder,
			createdAt: now,
			updatedAt: now,
			lastOpenedAt: now,
		})
		.run();
}

function getProject(id: string) {
	return db
		.select()
		.from(realSchema.projects)
		.all()
		.find((p) => p.id === id);
}

function visualOrder(): string[] {
	const projects = db.select().from(realSchema.projects).all();
	const workspaces = db.select().from(realSchema.workspaces).all();
	return computeVisualOrder(
		projects.map((p) => ({ id: p.id, tabOrder: p.tabOrder })),
		workspaces.map((w) => ({
			id: w.id,
			projectId: w.projectId,
			sectionId: w.sectionId,
			tabOrder: w.tabOrder,
		})),
		[],
	);
}

describe("Issue #4165 — projects disappear from the sidebar", () => {
	beforeEach(() => {
		resetDb();
	});

	// Reported behavior: a user with a project in the sidebar deletes/closes
	// the only remaining workspace in that project, and the entire project
	// vanishes from the sidebar — the project record still exists in the DB
	// but has no UI to bring it back.
	test("project should remain visible after its only workspace is deleted", () => {
		insertProject(PROJECT_ID, "alpha", null);
		insertWorkspace(WORKSPACE_ID, PROJECT_ID, 0);
		const project = getProject(PROJECT_ID);
		if (!project) throw new Error("project not inserted");
		activateProject(project);

		// Sanity: project + workspace are visible in sidebar.
		expect(getProject(PROJECT_ID)?.tabOrder).toBe(0);
		expect(visualOrder()).toEqual([WORKSPACE_ID]);

		// User deletes/closes the workspace. Both the workspaces.delete and
		// workspaces.close mutations call deleteWorkspace + hideProjectIfNoWorkspaces.
		deleteWorkspace(WORKSPACE_ID);
		hideProjectIfNoWorkspaces(PROJECT_ID);

		// Bug: tab_order is wiped → project disappears from the sidebar query
		// (getAllGrouped only returns projects with non-null tab_order). The
		// expectation here is that the project stays pinned and shows up as an
		// empty section so the user can add another workspace, rather than
		// silently vanishing.
		expect(getProject(PROJECT_ID)?.tabOrder).toBe(0);
		expect(visualOrder()).toEqual([]);
	});

	test("deleting one of several workspaces keeps the project visible", () => {
		insertProject(PROJECT_ID_2, "beta", null);
		insertWorkspace(WORKSPACE_ID, PROJECT_ID_2, 0);
		insertWorkspace(WORKSPACE_ID_2, PROJECT_ID_2, 1);
		const project = getProject(PROJECT_ID_2);
		if (!project) throw new Error("project not inserted");
		activateProject(project);

		deleteWorkspace(WORKSPACE_ID);
		hideProjectIfNoWorkspaces(PROJECT_ID_2);

		expect(getProject(PROJECT_ID_2)?.tabOrder).toBe(0);
	});
});
