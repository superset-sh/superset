import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
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
	const dirAtPhase: Record<string, boolean> = {};
	const result = await gitWorktreeRemoveTask.handler(
		{
			repoPath: repo,
			worktreePath: worktree,
			gitEnv: {} as GitTaskEnv,
			nativeRm: true,
		},
		(phase) => {
			phases.push(phase);
			dirAtPhase[phase] = existsSync(worktree);
		},
	);

	// The native rm path actually ran — this is the #6887 speedup, not just
	// git doing `remove --force --force`. Without the flag the caller would
	// still get a removed directory, so asserting on `reportPhase("delete-files")`
	// is what discriminates the new code path from the git-only fallback.
	expect(phases).toContain("delete-files");
	expect(phases).toContain("worktree-remove");

	// Order, not just membership (#6887 review): the delete has to be FINISHED
	// when git's unregister starts. Both phases firing with the directory still
	// on disk would mean git owns the recursive walk this change exists to
	// avoid, while the `existsSync` assertion below would still hold at the end
	// — a git-only removal leaves the directory missing too.
	expect(dirAtPhase["delete-files"]).toBe(true);
	expect(dirAtPhase["worktree-remove"]).toBe(false);

	// The directory is gone — the #6887 guarantee: before this change git's
	// own remove_dir_recursively could not finish a heavy tree in budget, so
	// the node_modules-shaped dir could be left on disk next to a clean
	// registry read.
	expect(existsSync(worktree)).toBe(false);
	expect(result.stillRegistered).toBe(false);

	// The working tree of the main repo is untouched.
	expect(readdirSync(repo)).toContain("readme.md");
});

test("nativeRm is skipped when the caller did not force removal", async () => {
	// With `force: false` git's own `worktree remove` is meant to refuse a
	// dirty worktree — the documented safety check. Running the native delete
	// anyway would silently erase uncommitted work before that check can
	// refuse, so `nativeRm` must be a no-op unless `force` is also set.
	const { repo, worktree } = makeRepoWithHeavyWorktree();
	const phases: string[] = [];

	const result = await gitWorktreeRemoveTask.handler(
		{
			repoPath: repo,
			worktreePath: worktree,
			gitEnv: {} as GitTaskEnv,
			nativeRm: true,
			force: false,
		},
		(phase) => phases.push(phase),
	);

	expect(phases).not.toContain("delete-files");
	// Git keeps its safety check: a dirty worktree is still refused and stays
	// registered, because nothing deleted the tree in front of that refusal.
	expect(result.stillRegistered).toBe(true);
});

test("a failing native rm still lets git unregister, and reports why", async () => {
	const { repo, worktree } = makeRepoWithHeavyWorktree();
	// Make the recursive delete fail for real instead of mocking it: an
	// unreadable directory stops `rm -r` with EACCES for a non-root user.
	// (This is the deterministic-on-CI-non-root form; a root-run cannot be
	// forced to fail by a permission bit, so everything below tolerates the
	// case where the delete actually succeeded.)
	const blocked = join(worktree, "node_modules", "pkg-a");
	chmodSync(blocked, 0o000);
	let rmFailed = false;
	try {
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

		// The point of the guard: the handler does not reject at the delete step.
		// Before it, an EPERM/EBUSY escaped the task and the caller reported a
		// removal failure for a worktree git could still have unregistered.
		rmFailed = existsSync(blocked);
		expect(phases).toContain("worktree-remove");
		if (rmFailed) {
			expect(result.removeError).toBeTruthy();
		}
	} finally {
		// Never throw a stray ENOENT when the tree actually got deleted
		// (which is what happens when the test process runs as root and the
		// chmod bit cannot hold it back).
		if (existsSync(blocked)) chmodSync(blocked, 0o700);
	}
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
