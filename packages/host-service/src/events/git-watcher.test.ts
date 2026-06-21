import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWorktreeWatchPaths } from "./git-watcher";

// Reproduction for https://github.com/.../issues/5232
//
// PR linking became unreliable for worktrees that Superset creates. Those
// worktrees are made with `git worktree add --no-track -b <branch>` and rely on
// `push.autoSetupRemote` to establish the branch's upstream on the FIRST push.
// Branches checked out "by other means" use `--track`, so their upstream exists
// at creation time and the initial sync records it — those link correctly.
//
// `GitWatcher` only watches the per-worktree git-dir (`--git-dir`,
// i.e. `.git/worktrees/<name>`). But the upstream tracking config
// (`branch.<name>.remote`/`.merge`) and the remote-tracking refs that a push
// establishes live in the shared *common dir* (`--git-common-dir`, i.e. `.git`).
// So the push that first makes the workspace PR-linkable is invisible to the
// watcher: no `git:changed` fires, the workspace's upstream stays null, and the
// PR never shows up in the sidebar.

let tmp: string;
let remote: string;
let mainRepo: string;
let worktree: string;

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t.co",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t.co",
		},
	})
		.toString()
		.trim();
}

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "gw-5232-"));
	remote = join(tmp, "remote.git");
	mainRepo = join(tmp, "main");
	worktree = join(tmp, "wt");

	git(tmp, "init", "-q", "--bare", remote);
	git(tmp, "clone", "-q", remote, mainRepo);
	git(mainRepo, "commit", "-q", "--allow-empty", "-m", "init");
	git(mainRepo, "push", "-q", "origin", "HEAD:main");

	// Mirror Superset's `createWorktree`: new branch, --no-track, first-push
	// tracking via push.autoSetupRemote.
	git(
		mainRepo,
		"worktree",
		"add",
		"-q",
		"--no-track",
		"-b",
		"agent/fix-foo",
		worktree,
		"origin/main",
	);
	git(worktree, "config", "--local", "push.autoSetupRemote", "true");
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

describe("GitWatcher worktree watch targets (issue #5232)", () => {
	test("a push establishes upstream tracking in the common dir, not the watched git-dir", () => {
		const gitDir = git(worktree, "rev-parse", "--absolute-git-dir");
		const commonDir = git(worktree, "rev-parse", "--git-common-dir");

		// A linked worktree's git-dir differs from the shared common dir.
		expect(gitDir).not.toBe(commonDir);
		expect(gitDir).toContain("worktrees");

		// Before the push there is no upstream — nothing to link yet.
		expect(() =>
			git(worktree, "rev-parse", "--abbrev-ref", "agent/fix-foo@{upstream}"),
		).toThrow();

		// The user pushes (this is when a PR becomes linkable). Tracking config is
		// now set...
		git(worktree, "commit", "-q", "--allow-empty", "-m", "work");
		git(worktree, "push");
		expect(
			git(worktree, "rev-parse", "--abbrev-ref", "agent/fix-foo@{upstream}"),
		).toBe("origin/agent/fix-foo");

		// ...but it was written to the COMMON dir's config, which the per-worktree
		// git-dir watcher never sees.
		const commonConfig = readFileSync(join(commonDir, "config"), "utf8");
		expect(commonConfig).toContain('[branch "agent/fix-foo"]');
		expect(commonConfig).toContain("merge = refs/heads/agent/fix-foo");
	});

	test("getWorktreeWatchPaths includes the common dir so push-time upstream setup is observed", async () => {
		const paths = await getWorktreeWatchPaths(worktree);
		const commonDir = git(worktree, "rev-parse", "--git-common-dir");

		// The fix: the watcher must also observe the common dir, where push
		// establishes upstream tracking and remote-tracking refs. Watching only
		// the per-worktree git-dir (the pre-fix behavior) misses them.
		expect(paths).toContain(commonDir);
		expect(paths.length).toBe(2);
	});
});
