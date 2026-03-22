import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Lightweight in-memory DB mock (mirrors the pattern in create.test.ts)
// ---------------------------------------------------------------------------

type TableName = "projects" | "workspaces" | "worktrees" | "workspaceSections";

type Row = Record<string, unknown>;

interface Column<Key extends string = string> {
	__kind: "column";
	tableName: TableName;
	key: Key;
}

type Table<Key extends string> = {
	__tableName: TableName;
} & Record<Key, Column<Key>>;

type Predicate = (row: Row) => boolean;

function createTable<Key extends string>(
	tableName: TableName,
	keys: readonly Key[],
): Table<Key> {
	const table = { __tableName: tableName } as {
		__tableName: TableName;
	} & Partial<Record<Key, Column<Key>>>;

	for (const key of keys) {
		(table as Record<string, Column>)[key] = {
			__kind: "column",
			tableName,
			key,
		};
	}
	return table as Table<Key>;
}

const projects = createTable("projects", [
	"id",
	"mainRepoPath",
	"name",
	"color",
	"defaultBranch",
	"tabOrder",
	"githubOwner",
	"hideImage",
	"iconUrl",
] as const);

const workspaces = createTable("workspaces", [
	"id",
	"projectId",
	"worktreeId",
	"type",
	"branch",
	"name",
	"tabOrder",
	"sectionId",
	"deletingAt",
	"createdAt",
	"updatedAt",
	"lastOpenedAt",
	"isUnread",
	"isUnnamed",
] as const);

const worktrees = createTable("worktrees", [
	"id",
	"projectId",
	"path",
	"branch",
	"baseBranch",
	"gitStatus",
	"createdBySuperset",
] as const);

const workspaceSections = createTable("workspaceSections", [
	"id",
	"projectId",
	"name",
	"tabOrder",
	"isCollapsed",
	"color",
] as const);

function eq(column: Column, value: unknown): Predicate {
	return (row) => row[column.key] === value;
}

function isNull(column: Column): Predicate {
	return (row) => row[column.key] == null;
}

function isNotNull(column: Column): Predicate {
	return (row) => row[column.key] != null;
}

// ---------------------------------------------------------------------------
// In-memory storage
// ---------------------------------------------------------------------------

const dbState: Record<TableName, Row[]> = {
	projects: [],
	workspaces: [],
	worktrees: [],
	workspaceSections: [],
};

function resetDb() {
	for (const table of Object.values(dbState)) {
		table.length = 0;
	}
}

function getTableRows(table: { __tableName: TableName }): Row[] {
	return dbState[table.__tableName];
}

function cloneRow<T extends Row | undefined>(row: T): T {
	return row ? ({ ...row } as T) : row;
}

function runSelect(
	table: { __tableName: TableName },
	predicate?: Predicate,
): Row[] {
	return getTableRows(table)
		.filter((row) => (predicate ? predicate(row) : true))
		.map(cloneRow);
}

const localDb = {
	select: () => ({
		from: (table: { __tableName: TableName }) => ({
			get: () => cloneRow(runSelect(table)[0]),
			all: () => runSelect(table),
			where: (predicate: Predicate) => ({
				get: () => cloneRow(runSelect(table, predicate)[0]),
				all: () => runSelect(table, predicate),
			}),
		}),
	}),
};

// ---------------------------------------------------------------------------
// Module mocks — must be registered before importing the procedure module
// ---------------------------------------------------------------------------

mock.module("drizzle-orm", () => ({ eq, isNotNull, isNull }));

mock.module("@superset/local-db", () => ({
	projects,
	workspaces,
	workspaceSections,
	worktrees,
}));

mock.module("main/lib/local-db", () => ({ localDb }));

// Stub out utility imports used by query.ts
mock.module("../utils/db-helpers", () => ({
	getWorkspace: () => null,
}));

mock.module("../utils/project-children-order", () => {
	// Re-implement a minimal version inlined for testing
	return {
		getProjectChildItems: (
			projectId: string,
			workspacesArr: Array<{
				id: string;
				projectId: string;
				sectionId: string | null;
				tabOrder: number;
			}>,
			sections: Array<{
				id: string;
				projectId: string;
				tabOrder: number;
			}>,
		) => {
			const projectSections = sections.filter((s) => s.projectId === projectId);
			const sectionIds = new Set(projectSections.map((s) => s.id));
			const topLevel = workspacesArr.filter(
				(w) =>
					w.projectId === projectId &&
					(w.sectionId === null || !sectionIds.has(w.sectionId)),
			);
			return [
				...topLevel.map((w) => ({
					id: w.id,
					kind: "workspace" as const,
					projectId: w.projectId,
					tabOrder: w.tabOrder,
				})),
				...projectSections.map((s) => ({
					id: s.id,
					kind: "section" as const,
					projectId: s.projectId,
					tabOrder: s.tabOrder,
				})),
			].sort((a, b) => a.tabOrder - b.tabOrder);
		},
	};
});

mock.module("../utils/setup", () => ({
	loadSetupConfig: () => null,
}));

mock.module("../utils/visual-order", () => ({
	computeVisualOrder: () => [],
}));

mock.module("../utils/worktree", () => ({
	getWorkspacePath: () => "",
}));

// Stub the tRPC core — we only need the router/procedure shells
mock.module("../../..", () => {
	type Handler = (...args: unknown[]) => unknown;

	const publicProcedure = {
		input: () => publicProcedure,
		query: (fn: Handler) => fn,
	};
	const router = (routes: Record<string, unknown>) => routes;
	return { publicProcedure, router };
});

mock.module("@trpc/server", () => ({
	TRPCError: class TRPCError extends Error {
		code: string;
		constructor({ code, message }: { code: string; message: string }) {
			super(message);
			this.code = code;
		}
	},
}));

mock.module("zod", () => ({
	z: {
		object: () => ({ string: () => ({}) }),
		string: () => ({}),
	},
}));

// ---------------------------------------------------------------------------
// Import the procedure factory AFTER mocks are set up
// ---------------------------------------------------------------------------

const { createQueryProcedures } = await import("./query");

afterAll(() => {
	mock.restore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedProject(overrides: Partial<Row> = {}): Row {
	const row: Row = {
		id: `proj-${Math.random().toString(36).slice(2, 8)}`,
		name: "Test Project",
		mainRepoPath: "/tmp/test-repo",
		color: "#000000",
		defaultBranch: "main",
		tabOrder: 0,
		githubOwner: null,
		hideImage: false,
		iconUrl: null,
		...overrides,
	};
	getTableRows(projects).push(row);
	return row;
}

function seedWorkspace(overrides: Partial<Row> = {}): Row {
	const row: Row = {
		id: `ws-${Math.random().toString(36).slice(2, 8)}`,
		projectId: "proj-1",
		worktreeId: null,
		type: "branch",
		branch: "main",
		name: "My Workspace",
		tabOrder: 0,
		sectionId: null,
		deletingAt: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		lastOpenedAt: Date.now(),
		isUnread: false,
		isUnnamed: false,
		...overrides,
	};
	getTableRows(workspaces).push(row);
	return row;
}

function seedWorktree(overrides: Partial<Row> = {}): Row {
	const row: Row = {
		id: `wt-${Math.random().toString(36).slice(2, 8)}`,
		projectId: "proj-1",
		path: "/tmp/test-worktree",
		branch: "feature-branch",
		baseBranch: "main",
		gitStatus: null,
		createdBySuperset: true,
		...overrides,
	};
	getTableRows(worktrees).push(row);
	return row;
}

function seedSection(overrides: Partial<Row> = {}): Row {
	const row: Row = {
		id: `sec-${Math.random().toString(36).slice(2, 8)}`,
		projectId: "proj-1",
		name: "Section A",
		tabOrder: 0,
		isCollapsed: false,
		color: null,
		...overrides,
	};
	getTableRows(workspaceSections).push(row);
	return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getAllGrouped", () => {
	let getAllGrouped: () => unknown;

	beforeEach(() => {
		resetDb();
		const procedures = createQueryProcedures();
		// In our mock, router() returns the raw handlers keyed by name.
		// getAllGrouped is the query handler function itself.
		getAllGrouped = procedures.getAllGrouped as unknown as () => unknown;
	});

	test("returns empty array when no projects exist", () => {
		const result = getAllGrouped();
		expect(result).toEqual([]);
	});

	test("returns empty array when all projects have null tabOrder (inactive)", () => {
		seedProject({ id: "proj-1", tabOrder: null });
		seedWorkspace({ projectId: "proj-1" });

		const result = getAllGrouped();
		expect(result).toEqual([]);
	});

	test("returns grouped workspaces for active projects", () => {
		const _project = seedProject({ id: "proj-1", tabOrder: 0 });
		const _workspace = seedWorkspace({
			id: "ws-1",
			projectId: "proj-1",
			tabOrder: 0,
		});

		const result = getAllGrouped() as Array<{
			project: { id: string };
			workspaces: Array<{ id: string }>;
		}>;

		expect(result).toHaveLength(1);
		expect(result[0].project.id).toBe("proj-1");
		expect(result[0].workspaces).toHaveLength(1);
		expect(result[0].workspaces[0].id).toBe("ws-1");
	});

	test("excludes workspaces with non-null deletingAt", () => {
		seedProject({ id: "proj-1", tabOrder: 0 });
		seedWorkspace({
			id: "ws-active",
			projectId: "proj-1",
			tabOrder: 0,
			deletingAt: null,
		});
		seedWorkspace({
			id: "ws-deleting",
			projectId: "proj-1",
			tabOrder: 1,
			deletingAt: Date.now(),
		});

		const result = getAllGrouped() as Array<{
			workspaces: Array<{ id: string }>;
		}>;

		expect(result).toHaveLength(1);
		expect(result[0].workspaces).toHaveLength(1);
		expect(result[0].workspaces[0].id).toBe("ws-active");
	});

	test("groups workspaces into sections correctly", () => {
		seedProject({ id: "proj-1", tabOrder: 0 });
		const _section = seedSection({
			id: "sec-1",
			projectId: "proj-1",
			tabOrder: 1,
		});
		seedWorkspace({
			id: "ws-ungrouped",
			projectId: "proj-1",
			tabOrder: 0,
			sectionId: null,
		});
		seedWorkspace({
			id: "ws-in-section",
			projectId: "proj-1",
			tabOrder: 1,
			sectionId: "sec-1",
		});

		const result = getAllGrouped() as Array<{
			workspaces: Array<{ id: string }>;
			sections: Array<{ id: string; workspaces: Array<{ id: string }> }>;
		}>;

		expect(result).toHaveLength(1);
		// Ungrouped workspaces
		expect(result[0].workspaces).toHaveLength(1);
		expect(result[0].workspaces[0].id).toBe("ws-ungrouped");
		// Section workspaces
		expect(result[0].sections).toHaveLength(1);
		expect(result[0].sections[0].id).toBe("sec-1");
		expect(result[0].sections[0].workspaces).toHaveLength(1);
		expect(result[0].sections[0].workspaces[0].id).toBe("ws-in-section");
	});

	test("sorts projects by tabOrder", () => {
		seedProject({ id: "proj-b", tabOrder: 2, name: "Project B" });
		seedProject({ id: "proj-a", tabOrder: 1, name: "Project A" });
		seedWorkspace({ projectId: "proj-a", tabOrder: 0 });
		seedWorkspace({ projectId: "proj-b", tabOrder: 0 });

		const result = getAllGrouped() as Array<{
			project: { id: string; tabOrder: number };
		}>;

		expect(result).toHaveLength(2);
		expect(result[0].project.id).toBe("proj-a");
		expect(result[1].project.id).toBe("proj-b");
	});

	test("resolves worktree path for worktree-type workspaces", () => {
		seedProject({ id: "proj-1", tabOrder: 0 });
		const _worktree = seedWorktree({
			id: "wt-1",
			projectId: "proj-1",
			path: "/tmp/my-worktree",
		});
		seedWorkspace({
			id: "ws-wt",
			projectId: "proj-1",
			type: "worktree",
			worktreeId: "wt-1",
			tabOrder: 0,
		});

		const result = getAllGrouped() as Array<{
			workspaces: Array<{ id: string; worktreePath: string }>;
		}>;

		expect(result).toHaveLength(1);
		expect(result[0].workspaces[0].worktreePath).toBe("/tmp/my-worktree");
	});

	test("uses mainRepoPath for branch-type workspaces", () => {
		seedProject({
			id: "proj-1",
			tabOrder: 0,
			mainRepoPath: "/home/user/repo",
		});
		seedWorkspace({
			id: "ws-br",
			projectId: "proj-1",
			type: "branch",
			tabOrder: 0,
		});

		const result = getAllGrouped() as Array<{
			workspaces: Array<{ id: string; worktreePath: string }>;
		}>;

		expect(result).toHaveLength(1);
		expect(result[0].workspaces[0].worktreePath).toBe("/home/user/repo");
	});

	test("orphan section workspace falls back to ungrouped", () => {
		seedProject({ id: "proj-1", tabOrder: 0 });
		// Workspace references a section that doesn't exist
		seedWorkspace({
			id: "ws-orphan",
			projectId: "proj-1",
			tabOrder: 0,
			sectionId: "nonexistent-section",
		});

		const result = getAllGrouped() as Array<{
			workspaces: Array<{ id: string }>;
			sections: Array<{ workspaces: Array<{ id: string }> }>;
		}>;

		expect(result).toHaveLength(1);
		// Should be in ungrouped workspaces, not lost
		expect(result[0].workspaces).toHaveLength(1);
		expect(result[0].workspaces[0].id).toBe("ws-orphan");
	});

	test("returns consistent results across multiple calls (simulates reload)", () => {
		seedProject({ id: "proj-1", tabOrder: 0 });
		seedWorkspace({
			id: "ws-1",
			projectId: "proj-1",
			tabOrder: 0,
		});
		seedWorkspace({
			id: "ws-2",
			projectId: "proj-1",
			tabOrder: 1,
		});

		// Call multiple times to simulate what happens after CMD+R reload:
		// The query should return identical results each time since the
		// underlying SQLite data hasn't changed
		const result1 = JSON.stringify(getAllGrouped());
		const result2 = JSON.stringify(getAllGrouped());
		const result3 = JSON.stringify(getAllGrouped());

		expect(result1).toBe(result2);
		expect(result2).toBe(result3);

		const parsed = JSON.parse(result1) as Array<{
			workspaces: Array<{ id: string }>;
		}>;
		expect(parsed).toHaveLength(1);
		expect(parsed[0].workspaces).toHaveLength(2);
	});

	test("ignores workspaces for inactive (null tabOrder) projects", () => {
		seedProject({ id: "proj-active", tabOrder: 0 });
		seedProject({ id: "proj-inactive", tabOrder: null });
		seedWorkspace({
			id: "ws-active",
			projectId: "proj-active",
			tabOrder: 0,
		});
		seedWorkspace({
			id: "ws-inactive",
			projectId: "proj-inactive",
			tabOrder: 0,
		});

		const result = getAllGrouped() as Array<{
			project: { id: string };
			workspaces: Array<{ id: string }>;
		}>;

		expect(result).toHaveLength(1);
		expect(result[0].project.id).toBe("proj-active");
		expect(result[0].workspaces).toHaveLength(1);
		expect(result[0].workspaces[0].id).toBe("ws-active");
	});

	test("multiple projects each get their own workspaces", () => {
		seedProject({ id: "proj-1", tabOrder: 0 });
		seedProject({ id: "proj-2", tabOrder: 1 });
		seedWorkspace({ id: "ws-1a", projectId: "proj-1", tabOrder: 0 });
		seedWorkspace({ id: "ws-1b", projectId: "proj-1", tabOrder: 1 });
		seedWorkspace({ id: "ws-2a", projectId: "proj-2", tabOrder: 0 });

		const result = getAllGrouped() as Array<{
			project: { id: string };
			workspaces: Array<{ id: string }>;
		}>;

		expect(result).toHaveLength(2);
		expect(result[0].project.id).toBe("proj-1");
		expect(result[0].workspaces).toHaveLength(2);
		expect(result[1].project.id).toBe("proj-2");
		expect(result[1].workspaces).toHaveLength(1);
	});
});
