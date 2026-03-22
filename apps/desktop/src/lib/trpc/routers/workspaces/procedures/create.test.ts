import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
import { projects, workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

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
		projectId = project.id;

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

		// Now delete the workspace using the delete utility
		const { deleteWorkspace } = await import("../utils/db-helpers");

		deleteWorkspace(workspaceId);

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
		projectId = project.id;

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
