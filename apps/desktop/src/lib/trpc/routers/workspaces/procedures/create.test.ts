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
type OrderBy = { kind: "desc"; column: Column };

function createTable<Key extends string>(
	tableName: TableName,
	keys: readonly Key[],
): Table<Key> {
	const table = {
		__tableName: tableName,
	} as {
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
	return (row) => predicates.every((predicate) => predicate(row));
}

function isNull(column: Column): Predicate {
	return (row) => row[column.key] == null;
}

function isNotNull(column: Column): Predicate {
	return (row) => row[column.key] != null;
}

function desc(column: Column): OrderBy {
	return { kind: "desc", column };
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
	if (!row) {
		return row;
	}

	return { ...row } as T;
}

function getTableRows(table: { __tableName: TableName }): Row[] {
	return dbState[table.__tableName];
}

function withDefaults(tableName: TableName, row: Row): Row {
	switch (tableName) {
		case "projects":
			return {
				tabOrder: null,
				lastOpenedAt: null,
				workspaceBaseBranch: null,
				worktreeBaseDir: null,
				...row,
			};
		case "workspaces":
			return {
				sectionId: null,
				deletingAt: null,
				lastOpenedAt: null,
				updatedAt: null,
				...row,
			};
		case "worktrees":
			return {
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
			return {
				tabOrder: 0,
				...row,
			};
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
	if (!row) {
		return undefined;
	}

	if (!selection) {
		return cloneRow(row);
	}

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
	orderBy?: OrderBy,
): Row[] {
	const rows = getTableRows(table)
		.filter((row) => (predicate ? predicate(row) : true))
		.map((row) => projectSelection(row, selection) ?? {});

	if (orderBy?.kind === "desc") {
		rows.sort(
			(a, b) =>
				Number(b[orderBy.column.key] ?? 0) - Number(a[orderBy.column.key] ?? 0),
		);
	}

	return rows;
}

function createSelectResult(
	table: { __tableName: TableName },
	selection?: Record<string, Column>,
	predicate?: Predicate,
	orderBy?: OrderBy,
) {
	return {
		get: () => cloneRow(runSelect(table, selection, predicate, orderBy)[0]),
		all: () => runSelect(table, selection, predicate, orderBy).map(cloneRow),
		orderBy: (nextOrderBy: OrderBy) =>
			createSelectResult(table, selection, predicate, nextOrderBy),
	};
}

const localDb = {
	select: (selection?: Record<string, Column>) => ({
		from: (table: { __tableName: TableName }) => ({
			get: () => cloneRow(runSelect(table, selection)[0]),
			all: () => runSelect(table, selection).map(cloneRow),
			where: (predicate: Predicate) =>
				createSelectResult(table, selection, predicate),
			orderBy: (orderBy: OrderBy) =>
				createSelectResult(table, selection, undefined, orderBy),
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
				}: {
					target: Column;
					set: Row;
				}) => ({
					run: () => {
						const rows = getTableRows(table);
						const existingRow = rows.find(
							(row) => row[target.key] === value[target.key],
						);
						if (existingRow) {
							Object.assign(existingRow, set);
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
				for (let index = rows.length - 1; index >= 0; index -= 1) {
					if (predicate(rows[index])) {
						rows.splice(index, 1);
					}
				}
			},
		}),
	}),
};

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

afterAll(() => {
	mock.restore();
});

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-create-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init", { cwd: repoPath, stdio: "ignore" });
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

function createExternalWorktree(
	mainRepoPath: string,
	branch: string,
	worktreePath: string,
): void {
	mkdirSync(worktreePath, { recursive: true });
	execSync(`git worktree add "${worktreePath}" -b ${branch}`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
	// Add a commit to the worktree to make it real
	writeFileSync(join(worktreePath, "test.txt"), "external worktree content\n");
	execSync("git add . && git commit -m 'external work'", {
		cwd: worktreePath,
		stdio: "ignore",
	});
}

describe("Workspace creation with external worktree auto-import", () => {
	let mainRepoPath: string;
	let projectId: string;
	let externalWorktreePath: string;

	beforeEach(() => {
		resetLocalDb();

		// Clean test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });

		// Create test repository
		mainRepoPath = createTestRepo("main-repo");
		seedCommit(mainRepoPath, "initial commit");

		// Create project in DB
		const project = localDb
			.insert(projects)
			.values({
				mainRepoPath,
				name: "Test Project",
				color: "#000000",
				defaultBranch: "main",
			})
			.returning()
			.get();
		projectId = project.id as string;

		// Create external worktree
		externalWorktreePath = join(TEST_DIR, "external-worktree");
	});

	afterEach(() => {
		// Clean up database
		if (projectId) {
			localDb
				.delete(workspaces)
				.where(eq(workspaces.projectId, projectId))
				.run();
			localDb.delete(worktrees).where(eq(worktrees.projectId, projectId)).run();
			localDb.delete(projects).where(eq(projects.id, projectId)).run();
		}

		// Clean test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("should auto-import external worktree when creating workspace for existing branch", async () => {
		// Create external worktree manually
		createExternalWorktree(
			mainRepoPath,
			"feature-external",
			externalWorktreePath,
		);

		// Import the utility function
		const { createWorkspaceFromExternalWorktree } = await import(
			"../utils/workspace-creation"
		);

		// Try to create a workspace for the branch that has an external worktree
		const result = await createWorkspaceFromExternalWorktree({
			projectId,
			branch: "feature-external",
			name: "Test Workspace",
		});

		// Verify workspace was created
		expect(result).toBeDefined();
		expect(result?.workspace).toBeDefined();
		expect(result?.workspace.branch).toBe("feature-external");
		expect(result?.wasExisting).toBe(true);

		// Verify worktree was imported with correct flag
		const importedWorktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, result?.workspace.worktreeId as string))
			.get();

		expect(importedWorktree).toBeDefined();
		expect(importedWorktree?.createdBySuperset).toBe(false); // External worktree
		expect(importedWorktree?.path).toBe(externalWorktreePath);

		// Verify worktree still exists on disk
		expect(existsSync(externalWorktreePath)).toBe(true);
	});

	test("should return undefined when no external worktree exists for branch", async () => {
		// Import the utility function
		const { createWorkspaceFromExternalWorktree } = await import(
			"../utils/workspace-creation"
		);

		// Try to create a workspace for a branch with no external worktree
		const result = await createWorkspaceFromExternalWorktree({
			projectId,
			branch: "feature-nonexistent",
			name: "Test Workspace",
		});

		// Should return undefined (no external worktree found)
		expect(result).toBeUndefined();
	});

	test("should preserve external worktree on disk when workspace deletion fails", async () => {
		// Create external worktree
		createExternalWorktree(
			mainRepoPath,
			"feature-preserve",
			externalWorktreePath,
		);

		// Import and create workspace (auto-import)
		const { createWorkspaceFromExternalWorktree } = await import(
			"../utils/workspace-creation"
		);

		const createResult = await createWorkspaceFromExternalWorktree({
			projectId,
			branch: "feature-preserve",
			name: "Preserve Test",
		});

		expect(createResult).toBeDefined();
		const workspaceId = createResult?.workspace.id as string;
		const worktreeId = createResult?.workspace.worktreeId as string;

		// Verify worktree is marked as external
		const worktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, worktreeId))
			.get();
		expect(worktree?.createdBySuperset).toBe(false);

		// Mirror the actual delete flow: remove the workspace row and then the
		// imported worktree record, while preserving the external worktree on disk.
		const { deleteWorkspace, deleteWorktreeRecord } = await import(
			"../utils/db-helpers"
		);

		deleteWorkspace(workspaceId);
		deleteWorktreeRecord(worktreeId);

		// Verify workspace was deleted from DB
		const deletedWorkspace = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		expect(deletedWorkspace).toBeUndefined();

		// Verify worktree record was deleted from DB
		const deletedWorktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, worktreeId))
			.get();
		expect(deletedWorktree).toBeUndefined();

		// CRITICAL: Verify worktree still exists on disk (not deleted)
		expect(existsSync(externalWorktreePath)).toBe(true);
		expect(existsSync(join(externalWorktreePath, "test.txt"))).toBe(true);
	});
});

describe("External worktree import via openExternalWorktree", () => {
	let mainRepoPath: string;
	let projectId: string;
	let externalWorktreePath: string;

	beforeEach(() => {
		resetLocalDb();

		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });

		mainRepoPath = createTestRepo("main-repo");
		seedCommit(mainRepoPath, "initial commit");

		const project = localDb
			.insert(projects)
			.values({
				mainRepoPath,
				name: "Test Project",
				color: "#000000",
				defaultBranch: "main",
			})
			.returning()
			.get();
		projectId = project.id as string;

		externalWorktreePath = join(TEST_DIR, "external-worktree");
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

	test("should mark worktree as external when using openExternalWorktree", async () => {
		// Create external worktree
		createExternalWorktree(
			mainRepoPath,
			"feature-manual",
			externalWorktreePath,
		);

		const { openExternalWorktree } = await import(
			"../utils/workspace-creation"
		);

		// Explicitly import external worktree
		const result = await openExternalWorktree({
			projectId,
			worktreePath: externalWorktreePath,
			branch: "feature-manual",
		});

		// Verify worktree was marked as external
		const importedWorktree = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.id, result.workspace.worktreeId as string))
			.get();

		expect(importedWorktree).toBeDefined();
		expect(importedWorktree?.createdBySuperset).toBe(false);
	});
});
