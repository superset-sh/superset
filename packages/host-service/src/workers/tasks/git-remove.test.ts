import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type GitTaskEnv, gitWorktreeRemoveTask } from "./git";

const tempDirs: string[] = [];

function git(cwd: string, ...args: string[]) {
	execFileSync("git", args, { cwd, stdio: "pipe" });
}

/** A real git repo with a worktree carrying a deep node_modules-shaped tree. */
function makeRepoWithHeavyWorktree(): { repo: string; worktree: string } {
	const repo = mkdtempSync(join(tmpdir(), "rm-by-hand-repo-"));
	tempDirs.push(repo);
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.email", "test@test.dev");
	git(repo, "config", "user.name", "test");
	writeFileSync(join(repo, "readme.md"), "root\n");
	git(repo, "add", ".");
	git(repo, "commit", "-qm", "init");

	const worktree = mkdtempSync(join(tmpdir(), "rm-by-hand-worktree-"));
	tempDirs.push(worktree);
	// A genuinely separate worktree dir, not a symlink.
	rmSync(worktree, { recursive: true, force: true });
	git(
		repo,
		"-c",
		"worktree.pruneExpire=never",
		"worktree",
		"add",
		"-b",
		"feature/heavy",
		worktree,
	);

	// node_modules-shaped payload: many nested dirs on disk in the worktree.
	// They don't need to be committed — the handler's job is to remove the
	// *directory*, heavy or not. `--force --force` clears uncommitted changes.
	const nodeModules = join(worktree, "node_modules");
	mkdirSync(join(nodeModules, "pkg-a", "deep"), { recursive: true });
	mkdirSync(join(nodeModules, "pkg-b"), { recursive: true });
	for (let i = 0; i < 50; i++) {
		writeFileSync(join(nodeModules, "pkg-a", `file-${i}.js`), "// x\n");
	}
	writeFileSync(join(worktree, "worktree-only.txt"), "uncommitted\n");

	return { repo, worktree };
}

afterEach(() => {
	for (const d of tempDirs.splice(0)) {
		rmSync(d, { recursive: true, force: true });
	}
});

test("nativeRm deletes the directory with the native rm before git unregisters", async () => {
	const { repo, worktree } = makeRepoWithHeavyWorktree();

	const phases: string[] = [];
	const result = await gitWorktreeRemoveTask.handler(
		{
			repoPath: repo,
			worktreePath: worktree,
			gitEnv: {} as GitTaskEnv,
			nativeRm: true,
		},
		(phase) => phases.push(phase),
	);

	// The native rm path actually ran — this is the #6887 speedup, not just
	// git doing `remove --force --force`. Without the flag the caller would
	// still get a removed directory, so asserting on `reportPhase("delete-files")`
	// is what discriminates the new code path from the git-only fallback.
	expect(phases).toContain("delete-files");
	expect(phases).toContain("worktree-remove");

	// The directory is gone — the #6887 guarantee: before this change git's
	// own remove_dir_recursively could not finish a heavy tree in budget, so
	// the node_modules-shaped dir could be left on disk next to a clean
	// registry read.
	expect(existsSync(worktree)).toBe(false);
	expect(result.stillRegistered).toBe(false);

	// The working tree of the main repo is untouched.
	expect(readdirSync(repo)).toContain("readme.md");
});

test("without nativeRm the task still unregisters via git (caller falls back)", async () => {
	const { repo, worktree } = makeRepoWithHeavyWorktree();

	const phases: string[] = [];
	const result = await gitWorktreeRemoveTask.handler(
		{ repoPath: repo, worktreePath: worktree, gitEnv: {} as GitTaskEnv },
		(phase) => phases.push(phase),
	);

	// Path not confirmed safe: no native rm — the caller's guarded disk-recheck
	// fallback owns direct removal instead.
	expect(phases).not.toContain("delete-files");
	expect(existsSync(worktree)).toBe(false);
	expect(result.stillRegistered).toBe(false);
});

test("nativeRm is a no-op for an already-missing path", async () => {
	const { repo, worktree } = makeRepoWithHeavyWorktree();
	rmSync(worktree, { recursive: true, force: true }); // pre-deleted

	const result = await gitWorktreeRemoveTask.handler(
		{
			repoPath: repo,
			worktreePath: worktree,
			gitEnv: {} as GitTaskEnv,
			nativeRm: true,
		},
		() => {},
	);

	// `force: true` on a missing path is a no-op and git still registers the
	// empty directory as removed.
	expect(result.stillRegistered).toBe(false);
});