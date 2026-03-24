import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// In-memory DB mock (same pattern as create.test.ts)
// ---------------------------------------------------------------------------

type TableName =
	| "projects"
	| "workspaces"
	| "worktrees"
	| "settings"
	| "workspaceSections";

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
	"lastOpenedAt",
	"workspaceBaseBranch",
	"worktreeBaseDir",
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
	"lastOpenedAt",
	"updatedAt",
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

const settings = createTable("settings", [
	"id",
	"lastActiveWorkspaceId",
	"worktreeBaseDir",
] as const);

const workspaceSections = createTable("workspaceSections", [
	"id",
	"projectId",
	"tabOrder",
] as const);

function eq(column: Column, value: unknown): Predicate {
	return (row) => row[column.key] === value;
}
function and(...predicates: Predicate[]): Predicate {
	return (row) => predicates.every((p) => p(row));
}
function isNull(column: Column): Predicate {
	return (row) => row[column.key] == null;
}
function isNotNull(column: Column): Predicate {
	return (row) => row[column.key] != null;
}
function desc(column: Column) {
	return { kind: "desc" as const, column };
}

const dbState: Record<TableName, Row[]> = {
	projects: [],
	workspaces: [],
	worktrees: [],
	settings: [],
	workspaceSections: [],
};

let nextId = 1;

function resetLocalDb(): void {
	for (const table of Object.values(dbState)) {
		table.length = 0;
	}
	nextId = 1;
}

function cloneRow<T extends Row | undefined>(row: T): T {
	return row ? ({ ...row } as T) : row;
}

function getTableRows(table: { __tableName: TableName }): Row[] {
	return dbState[table.__tableName];
}

function withDefaults(tableName: TableName, row: Row): Row {
	switch (tableName) {
		case "projects":
			return {
				id: null,
				tabOrder: null,
				lastOpenedAt: null,
				workspaceBaseBranch: null,
				worktreeBaseDir: null,
				...row,
			};
		case "workspaces":
			return {
				id: null,
				sectionId: null,
				deletingAt: null,
				lastOpenedAt: null,
				updatedAt: null,
				isUnnamed: false,
				...row,
			};
		case "worktrees":
			return {
				id: null,
				gitStatus: null,
				createdBySuperset: true,
				...row,
			};
		case "settings":
			return {
				id: 1,
				lastActiveWorkspaceId: null,
				worktreeBaseDir: null,
				...row,
			};
		case "workspaceSections":
			return { tabOrder: 0, ...row };
	}
}

function normalizeInsertedRow(tableName: TableName, row: Row): Row {
	const nextRow = withDefaults(tableName, row);
	if (nextRow.id == null) {
		nextRow.id = `test-${nextId++}`;
	}
	return nextRow;
}

function projectSelection(
	row: Row,
	selection?: Record<string, Column>,
): Row | undefined {
	if (!row) return undefined;
	if (!selection) return cloneRow(row);
	const projected: Row = {};
	for (const [key, column] of Object.entries(selection)) {
		projected[key] = row[column.key];
	}
	return projected;
}

function runSelect(
	table: { __tableName: TableName },
	selection?: Record<string, Column>,
	predicate?: Predicate,
): Row[] {
	return getTableRows(table)
		.filter((row) => (predicate ? predicate(row) : true))
		.map((row) => projectSelection(row, selection) ?? {});
}

function createSelectResult(
	table: { __tableName: TableName },
	selection?: Record<string, Column>,
	predicate?: Predicate,
) {
	return {
		get: () => cloneRow(runSelect(table, selection, predicate)[0]),
		all: () => runSelect(table, selection, predicate).map(cloneRow),
		orderBy: () => createSelectResult(table, selection, predicate),
	};
}

const localDb = {
	select: (selection?: Record<string, Column>) => ({
		from: (table: { __tableName: TableName }) => ({
			get: () => cloneRow(runSelect(table, selection)[0]),
			all: () => runSelect(table, selection).map(cloneRow),
			where: (predicate: Predicate) =>
				createSelectResult(table, selection, predicate),
			orderBy: () => createSelectResult(table, selection),
		}),
	}),
	insert: (table: { __tableName: TableName }) => ({
		values: (value: Row) => {
			const insertRow = () => {
				const row = normalizeInsertedRow(table.__tableName, value);
				getTableRows(table).push(row);
				return row;
			};
			return {
				returning: () => ({
					get: () => cloneRow(insertRow()),
				}),
				onConflictDoUpdate: ({
					target,
					set,
				}: { target: Column; set: Row }) => ({
					run: () => {
						const rows = getTableRows(table);
						const existing = rows.find(
							(row) => row[target.key] === value[target.key],
						);
						if (existing) {
							Object.assign(existing, set);
							return;
						}
						rows.push(normalizeInsertedRow(table.__tableName, value));
					},
				}),
				run: () => {
					insertRow();
				},
			};
		},
	}),
	update: (table: { __tableName: TableName }) => ({
		set: (patch: Row) => ({
			where: (predicate: Predicate) => ({
				run: () => {
					for (const row of getTableRows(table)) {
						if (predicate(row)) {
							Object.assign(row, patch);
						}
					}
				},
			}),
		}),
	}),
	delete: (table: { __tableName: TableName }) => ({
		where: (predicate: Predicate) => ({
			run: () => {
				const rows = getTableRows(table);
				for (let i = rows.length - 1; i >= 0; i--) {
					if (predicate(rows[i])) {
						rows.splice(i, 1);
					}
				}
			},
		}),
	}),
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

mock.module("drizzle-orm", () => ({
	and,
	desc,
	eq,
	isNotNull,
	isNull,
}));

mock.module("@superset/local-db", () => ({
	projects,
	settings,
	workspaces,
	workspaceSections,
	worktrees,
}));

mock.module("@superset/local-db/schema", () => ({
	projects,
	settings,
	workspaces,
	workspaceSections,
	worktrees,
}));

mock.module("main/lib/local-db", () => ({
	localDb,
}));

mock.module("main/lib/analytics", () => ({
	track: () => {},
}));

mock.module("main/lib/workspace-init-manager", () => ({
	workspaceInitManager: {
		startJob: () => {},
	},
}));

afterAll(() => {
	mock.restore();
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-deeplink-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init -b main", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	return repoPath;
}

function seedCommit(repoPath: string, message = "init"): void {
	writeFileSync(join(repoPath, "README.md"), `# test\n${message}\n`);
	execSync(`git add . && git commit -m '${message}'`, {
		cwd: repoPath,
		stdio: "ignore",
	});
}

function seedProject(mainRepoPath: string, name = "test-project"): string {
	const project = localDb
		.insert(projects)
		.values({
			mainRepoPath,
			name,
			color: "#000000",
			defaultBranch: "main",
		})
		.returning()
		.get();
	return project.id as string;
}

function params(obj: Record<string, string>): URLSearchParams {
	return new URLSearchParams(obj);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleWorkspaceCreateDeepLink", () => {
	let mainRepoPath: string;
	let projectId: string;

	beforeEach(() => {
		resetLocalDb();

		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });

		mainRepoPath = createTestRepo("main-repo");
		seedCommit(mainRepoPath, "initial commit");
		projectId = seedProject(mainRepoPath, "test-project");
	});

	afterEach(() => {
		if (projectId) {
			localDb
				.delete(workspaces)
				.where(eq(workspaces.projectId, projectId))
				.run();
			localDb.delete(worktrees).where(eq(worktrees.projectId, projectId)).run();
			localDb.delete(projects).where(eq(projects.id, projectId)).run();
		}
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("should return error when no project specified", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(params({}));
		expect("error" in result).toBe(true);
	});

	test("should return error when project not found by id", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({ projectId: "nonexistent-id" }),
		);
		expect("error" in result).toBe(true);
		expect((result as { error: string }).error).toContain("Project not found");
	});

	test("should return error when project not found by name", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({ projectName: "nonexistent" }),
		);
		expect("error" in result).toBe(true);
		expect((result as { error: string }).error).toContain("Project not found");
	});

	test("should create workspace by projectId with auto-generated branch", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({ projectId }),
		);
		expect("workspaceId" in result).toBe(true);

		const wsId = (result as { workspaceId: string }).workspaceId;
		const ws = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, wsId))
			.get();
		expect(ws).toBeDefined();
		expect(ws?.projectId).toBe(projectId);
		expect(ws?.type).toBe("worktree");
	});

	test("should create workspace by projectName", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({ projectName: "test-project" }),
		);
		expect("workspaceId" in result).toBe(true);
	});

	test("should create workspace with specific branch name", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				branchName: "feature/deep-link-test",
				name: "Deep Link Test",
			}),
		);
		expect("workspaceId" in result).toBe(true);

		const wsId = (result as { workspaceId: string }).workspaceId;
		const ws = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, wsId))
			.get();
		expect(ws?.name).toBe("Deep Link Test");

		const wt = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, ws?.worktreeId as string))
			.get();
		expect(wt?.branch).toContain("feature/deep-link-test");
		expect(wt?.createdBySuperset).toBe(true);
	});

	test("should reuse existing workspace for same branch", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		// Create first workspace
		const result1 = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				branchName: "feature/reuse-test",
				name: "First",
			}),
		);
		expect("workspaceId" in result1).toBe(true);
		const wsId1 = (result1 as { workspaceId: string }).workspaceId;

		// Try to create again with same branch
		const result2 = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				branchName: "feature/reuse-test",
				name: "Second",
			}),
		);
		expect("workspaceId" in result2).toBe(true);
		const wsId2 = (result2 as { workspaceId: string }).workspaceId;

		// Should return the same workspace, not create a new one
		expect(wsId2).toBe(wsId1);
	});

	test("should create workspace from existing branch", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		// Create a branch in the repo
		execSync("git checkout -b existing-branch", {
			cwd: mainRepoPath,
			stdio: "ignore",
		});
		writeFileSync(join(mainRepoPath, "test.txt"), "test");
		execSync("git add . && git commit -m 'branch commit'", {
			cwd: mainRepoPath,
			stdio: "ignore",
		});
		execSync("git checkout main", { cwd: mainRepoPath, stdio: "ignore" });

		const result = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				branchName: "existing-branch",
				useExistingBranch: "true",
			}),
		);
		expect("workspaceId" in result).toBe(true);

		const wsId = (result as { workspaceId: string }).workspaceId;
		const wt = localDb
			.select()
			.from(worktrees)
			.where(
				and(
					eq(worktrees.projectId, projectId),
					eq(worktrees.branch, "existing-branch"),
				),
			)
			.get();
		expect(wt).toBeDefined();
	});

	test("should error when useExistingBranch but branch missing", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				useExistingBranch: "true",
			}),
		);
		expect("error" in result).toBe(true);
		expect((result as { error: string }).error).toContain("branchName is required");
	});

	test("should error when useExistingBranch with nonexistent branch", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				branchName: "does-not-exist",
				useExistingBranch: "true",
			}),
		);
		expect("error" in result).toBe(true);
		expect((result as { error: string }).error).toContain("does not exist");
	});

	test("should create worktree on disk", async () => {
		const { handleWorkspaceCreateDeepLink } = await import("./workspace");

		const result = await handleWorkspaceCreateDeepLink(
			params({
				projectId,
				branchName: "feature/disk-test",
			}),
		);
		expect("workspaceId" in result).toBe(true);

		const wsId = (result as { workspaceId: string }).workspaceId;
		const ws = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, wsId))
			.get();
		const wt = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, ws?.worktreeId as string))
			.get();

		expect(wt?.path).toBeDefined();
		expect(existsSync(wt?.path as string)).toBe(true);
	});
});
