import { Database } from "bun:sqlite";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { GitCredentialProvider } from "../runtime/git";
import { createUserSimpleGit } from "../runtime/git/simple-git";
import { listGitWorktrees } from "../trpc/router/workspace-creation/shared/worktree-list";
import {
	getLocalWorkspace,
	insertLocalWorkspace,
} from "./local-workspace-store";
import {
	type MovedWorktreeContext,
	movedWorktreeGitOps,
	repairMovedWorktree,
	validateWorktreePathUpdate,
} from "./moved-worktree";

const originalListWorktrees = movedWorktreeGitOps.listWorktrees;
movedWorktreeGitOps.listWorktrees = (_ctx, repoPath) =>
	listGitWorktrees(createUserSimpleGit(repoPath));

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-hs-moved-worktree-${process.pid}`,
);
const PROJECT_ID = "00000000-0000-0000-0000-00000000aa01";

function git(cwd: string, cmd: string): void {
	execSync(`git ${cmd}`, { cwd, stdio: "ignore" });
}

function createTestRepo(): string {
	const repoPath = join(TEST_DIR, "repo");
	mkdirSync(repoPath, { recursive: true });
	git(repoPath, "init -b main");
	git(repoPath, "config user.email test@test.com");
	git(repoPath, "config user.name Test");
	git(repoPath, "commit --allow-empty -m init");
	return repoPath;
}

function createContext(repoPath: string): MovedWorktreeContext {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	db.insert(projects).values({ id: PROJECT_ID, repoPath, name: "repo" }).run();
	const events: string[] = [];
	return {
		db: db as unknown as HostDb,
		eventBus: {
			broadcastWorkspaceChanged: (type: string) => {
				events.push(type);
			},
		} as unknown as EventBus,
		credentials: {} as GitCredentialProvider,
	};
}

afterAll(() => {
	movedWorktreeGitOps.listWorktrees = originalListWorktrees;
});

describe("repairMovedWorktree", () => {
	let repoPath: string;
	let ctx: MovedWorktreeContext;
	let oldPath: string;
	let newPath: string;

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		repoPath = createTestRepo();
		ctx = createContext(repoPath);
		oldPath = join(TEST_DIR, "worktrees", "feature");
		newPath = join(TEST_DIR, "moved", "feature");
		git(repoPath, `worktree add -b feature "${oldPath}"`);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test("re-points the row after `git worktree move`", async () => {
		const row = insertLocalWorkspace(ctx, {
			projectId: PROJECT_ID,
			worktreePath: oldPath,
			branch: "feature",
			name: "feature",
		});
		mkdirSync(join(TEST_DIR, "moved"), { recursive: true });
		git(repoPath, `worktree move "${oldPath}" "${newPath}"`);
		expect(existsSync(oldPath)).toBe(false);

		const repaired = await repairMovedWorktree(ctx, row);

		expect(repaired.worktreePath).toBe(newPath);
		expect(getLocalWorkspace(ctx.db, row.id)?.worktreePath).toBe(newPath);
	});

	test("leaves the row alone when the worktree still exists", async () => {
		const row = insertLocalWorkspace(ctx, {
			projectId: PROJECT_ID,
			worktreePath: oldPath,
			branch: "feature",
			name: "feature",
		});
		const result = await repairMovedWorktree(ctx, row);
		expect(result.worktreePath).toBe(oldPath);
	});

	test("leaves the row alone when the worktree was removed, not moved", async () => {
		const row = insertLocalWorkspace(ctx, {
			projectId: PROJECT_ID,
			worktreePath: oldPath,
			branch: "feature",
			name: "feature",
		});
		git(repoPath, `worktree remove --force "${oldPath}"`);
		const result = await repairMovedWorktree(ctx, row);
		expect(result.worktreePath).toBe(oldPath);
		expect(getLocalWorkspace(ctx.db, row.id)?.worktreePath).toBe(oldPath);
	});

	test("never touches main workspaces", async () => {
		const row = insertLocalWorkspace(ctx, {
			projectId: PROJECT_ID,
			worktreePath: join(TEST_DIR, "gone"),
			branch: "feature",
			name: "local",
			type: "main",
		});
		const result = await repairMovedWorktree(ctx, row);
		expect(result.worktreePath).toBe(join(TEST_DIR, "gone"));
	});
});

describe("validateWorktreePathUpdate", () => {
	let repoPath: string;
	let ctx: MovedWorktreeContext;
	let worktreePath: string;

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		repoPath = createTestRepo();
		ctx = createContext(repoPath);
		worktreePath = join(TEST_DIR, "worktrees", "feature");
		git(repoPath, `worktree add -b feature "${worktreePath}"`);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	function row(overrides: Partial<Parameters<typeof insertLocalWorkspace>[1]>) {
		return insertLocalWorkspace(ctx, {
			projectId: PROJECT_ID,
			worktreePath: join(TEST_DIR, "stale"),
			branch: "feature",
			name: "feature",
			...overrides,
		});
	}

	test("accepts a worktree of the project on the workspace branch", async () => {
		const result = await validateWorktreePathUpdate(ctx, row({}), worktreePath);
		expect(result).toEqual({ ok: true, worktreePath });
	});

	test("rejects a path that does not exist", async () => {
		const result = await validateWorktreePathUpdate(
			ctx,
			row({}),
			join(TEST_DIR, "nope"),
		);
		expect(result.ok).toBe(false);
	});

	test("rejects a directory that is not a worktree of the project", async () => {
		const stray = join(TEST_DIR, "stray");
		mkdirSync(stray);
		const result = await validateWorktreePathUpdate(ctx, row({}), stray);
		expect(result).toMatchObject({ ok: false });
		if (!result.ok) expect(result.message).toContain("not a worktree");
	});

	test("rejects a worktree on a different branch", async () => {
		const result = await validateWorktreePathUpdate(
			ctx,
			row({ branch: "other" }),
			worktreePath,
		);
		expect(result).toMatchObject({ ok: false });
		if (!result.ok) expect(result.message).toContain("branch feature");
	});

	test("rejects main workspaces", async () => {
		const result = await validateWorktreePathUpdate(
			ctx,
			row({ type: "main", worktreePath: repoPath }),
			worktreePath,
		);
		expect(result).toMatchObject({ ok: false });
	});
});
