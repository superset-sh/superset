import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitWorktreeRemoveTask } from "./git";

/**
 * Worktree removal used to hand the whole recursive delete to git, whose
 * single threaded walk cannot finish a node_modules heavy tree inside the
 * task budget (GH #6887). The task now deletes the tree itself first, under
 * the same managed root guard the destroy saga uses, and calls git only to
 * unregister. These tests run the real handler against real repos.
 */
describe("gitWorktreeRemoveTask", () => {
	let tmp: string;
	let repoPath: string;
	let worktreesBase: string;
	const projectId = "p-1";
	const gitEnv = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
		GIT_OPTIONAL_LOCKS: "0",
		LC_ALL: "C",
	};

	function git(args: string[], cwd: string): void {
		execFileSync("git", args, { cwd, env: { ...process.env, ...gitEnv } });
	}

	function addWorktree(worktreePath: string, branch: string): void {
		git(["worktree", "add", "-b", branch, worktreePath], repoPath);
		const nested = path.join(worktreePath, "node_modules", "dep", "sub");
		fs.mkdirSync(nested, { recursive: true });
		fs.writeFileSync(path.join(nested, "index.js"), "module.exports = 1;\n");
	}

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "worktree-remove-task-"));
		repoPath = path.join(tmp, "repo");
		worktreesBase = path.join(tmp, "worktrees");
		fs.mkdirSync(repoPath, { recursive: true });
		git(["init"], repoPath);
		git(["config", "user.email", "test@example.com"], repoPath);
		git(["config", "user.name", "test"], repoPath);
		git(["config", "commit.gpgsign", "false"], repoPath);
		fs.writeFileSync(path.join(repoPath, "a.txt"), "hello\n");
		git(["add", "."], repoPath);
		git(["commit", "-m", "initial"], repoPath);
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	test("deletes the tree itself when the worktree is inside the managed root", async () => {
		const worktreePath = path.join(worktreesBase, projectId, "wt-1");
		addWorktree(worktreePath, "feature/inside");

		const result = await gitWorktreeRemoveTask.handler(
			{
				repoPath,
				worktreePath,
				gitEnv,
				projectId,
				worktreeBaseDir: worktreesBase,
			},
			undefined,
		);

		expect(result.removedByApp).toBe(true);
		expect(result.stillRegistered).toBe(false);
		expect(fs.existsSync(worktreePath)).toBe(false);
	});

	test("leaves the delete to git when the path is outside the managed root", async () => {
		const worktreePath = path.join(tmp, "elsewhere", "wt-2");
		addWorktree(worktreePath, "feature/outside");

		const result = await gitWorktreeRemoveTask.handler(
			{
				repoPath,
				worktreePath,
				gitEnv,
				projectId,
				worktreeBaseDir: worktreesBase,
			},
			undefined,
		);

		expect(result.removedByApp).toBe(false);
		expect(result.stillRegistered).toBe(false);
		expect(fs.existsSync(worktreePath)).toBe(false);
	});

	test("unregisters a worktree whose directory is already gone", async () => {
		const worktreePath = path.join(worktreesBase, projectId, "wt-3");
		addWorktree(worktreePath, "feature/gone");
		fs.rmSync(worktreePath, { recursive: true, force: true });

		const result = await gitWorktreeRemoveTask.handler(
			{
				repoPath,
				worktreePath,
				gitEnv,
				projectId,
				worktreeBaseDir: worktreesBase,
			},
			undefined,
		);

		expect(result.stillRegistered).toBe(false);
	});
});
