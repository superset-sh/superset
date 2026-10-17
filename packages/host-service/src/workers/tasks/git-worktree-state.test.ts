import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type GitTaskEnv, gitWorktreeStateTask } from "./git";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function git(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" })
		.toString()
		.trim();
}

/** A bare remote plus its clone on `main` with a root commit pushed. */
function makeRemoteAndClone(): { remote: string; clone: string } {
	const remote = mkdtempSync(join(tmpdir(), "squash-origin-"));
	const clone = mkdtempSync(join(tmpdir(), "squash-clone-"));
	tempDirs.push(remote, clone);
	// mkdtempSync already created clean empty dirs; bare-init the remote and
	// clone into the existing (empty) clone dir.
	git(remote, ["init", "-q", "--bare"]);
	// `git init` can't take `-b` together with `--bare`; point HEAD at `main`
	// so the later `clone -b main` resolves against the unborn branch.
	git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
	git(clone, ["clone", "-q", remote, "."]);
	// The remote has no commits yet, so `clone -b` can't resolve it; set the
	// branch locally — the init commit and push below then create `main` there.
	git(clone, ["checkout", "-q", "-b", "main"]);
	git(clone, ["config", "user.email", "test@test.dev"]);
	git(clone, ["config", "user.name", "test"]);
	writeFileSync(join(clone, "readme.md"), "root\n");
	git(clone, ["add", "."]);
	git(clone, ["commit", "-qm", "init"]);
	git(clone, ["push", "-q", "origin", "main"]);
	return { remote, clone };
}

/** A 3-commit feature branch off `main`, pushed, its squash merged onto
 * `main`, and the head branch deleted + pruned — GitHub's squash flow. */
function makeSquashMergedWorktree(): string {
	const { remote, clone } = makeRemoteAndClone();
	git(clone, ["checkout", "-qb", "feature/x"]);
	for (let i = 1; i <= 3; i++) {
		writeFileSync(join(clone, `file-${i}.txt`), `content ${i}\n`);
		git(clone, ["add", "."]);
		git(clone, ["commit", "-qm", `feature c${i}`]);
	}
	git(clone, ["push", "-q", "origin", "feature/x"]);

	// Squash-merge: advance `main` with a single commit whose TREE equals the
	// feature tip (GitHub's squash carries the branch's final state).
	const tree = git(clone, ["rev-parse", "feature/x^{tree}"]);
	const parent = git(clone, ["rev-parse", "main"]);
	const squash = git(clone, [
		"commit-tree",
		tree,
		"-p",
		parent,
		"-m",
		"feat: merge the branch (#N)",
	]);
	git(clone, ["update-ref", "refs/heads/main", squash]);
	git(clone, ["push", "-q", "origin", "main"]);

	// GitHub deletes the head branch; fetch prunes its tracking ref.
	git(clone, ["push", "-q", "origin", ":feature/x"]);
	git(clone, ["fetch", "-q", "--prune", "origin"]);
	git(clone, ["checkout", "-q", "feature/x"]);
	return clone;
}

/** A squash merge whose base ADVANCED first: the squashed tree carries the
 * other change too, so it no longer equals the feature tip's tree. */
function makeSquashMergedWorktreeOnAdvancedBase(): string {
	const { clone } = makeRemoteAndClone();
	git(clone, ["checkout", "-qb", "feature/x"]);
	for (let i = 1; i <= 3; i++) {
		writeFileSync(join(clone, `file-${i}.txt`), `content ${i}\n`);
		git(clone, ["add", "."]);
		git(clone, ["commit", "-qm", `feature c${i}`]);
	}
	git(clone, ["push", "-q", "origin", "feature/x"]);

	// Another PR lands on main before the squash.
	git(clone, ["checkout", "-q", "main"]);
	writeFileSync(join(clone, "other.txt"), "other work\n");
	git(clone, ["add", "."]);
	git(clone, ["commit", "-qm", "other work on main"]);
	git(clone, ["push", "-q", "origin", "main"]);

	// The real squash flow, so the squashed tree differs from the branch tip's.
	git(clone, ["merge", "-q", "--squash", "feature/x"]);
	git(clone, ["commit", "-qm", "feat: merge the branch (#N)"]);
	git(clone, ["push", "-q", "origin", "main"]);

	git(clone, ["push", "-q", "origin", ":feature/x"]);
	git(clone, ["fetch", "-q", "--prune", "origin"]);
	git(clone, ["checkout", "-q", "feature/x"]);
	return clone;
}

const NOOP_ENV = {} as GitTaskEnv;

test("a squash-merged, pruned head branch is not 'unpushed commits'", async () => {
	// The branch's commits are flattened into a new sha on main, so
	// `HEAD --not --remotes` counts all of them as unpushed — but the squash
	// carries the branch's final tree onto the remote, which is the proof the
	// work is already upstream (#8035).
	const worktree = makeSquashMergedWorktree();

	const result = await gitWorktreeStateTask.handler(
		{ worktreePath: worktree, gitEnv: NOOP_ENV },
		() => {},
	);

	expect(result.hasUnpushedCommits).toBe(false);
});

test("branch facts survive the squash — hasChanges still reflects working tree", async () => {
	const worktree = makeSquashMergedWorktree();
	writeFileSync(join(worktree, "uncommitted.txt"), "dirty\n");

	const result = await gitWorktreeStateTask.handler(
		{ worktreePath: worktree, gitEnv: NOOP_ENV },
		() => {},
	);

	expect(result.hasChanges).toBe(true);
	expect(result.hasUnpushedCommits).toBe(false);
});

test("a genuinely unpushed branch still reports 'unpushed commits'", async () => {
	// Regression guard: the squash-aware check must only clear the flag when
	// the work is provably upstream. A branch never pushed has a different
	// tree than any remote tip, so it must still warn.
	const { remote, clone } = makeRemoteAndClone();
	git(clone, ["checkout", "-qb", "feature/abandoned"]);
	for (let i = 1; i <= 3; i++) {
		writeFileSync(join(clone, `abandoned-${i}.txt`), `x${i}\n`);
		git(clone, ["add", "."]);
		git(clone, ["commit", "-qm", `abandoned c${i}`]);
	}
	// Not pushed: origin has only `main`.

	const result = await gitWorktreeStateTask.handler(
		{ worktreePath: clone, gitEnv: NOOP_ENV },
		() => {},
	);

	expect(result.hasUnpushedCommits).toBe(true);
});

test("a squash merge onto an ADVANCED base is still recognised", async () => {
	// The ordinary case on an active repo, and the one a tip-tree comparison
	// misses: `main` gained other work before the squash, so the squashed tree
	// is not the branch tip's tree. What is true either way is that merging this
	// branch into main changes nothing — its work is already there (#8035).
	const worktree = makeSquashMergedWorktreeOnAdvancedBase();

	const result = await gitWorktreeStateTask.handler(
		{ worktreePath: worktree, gitEnv: NOOP_ENV },
		() => {},
	);

	expect(result.hasUnpushedCommits).toBe(false);
});

test("the remote's default branch answers, not a branch that merely exists", async () => {
	// A repo that kept a `main` next to a `master` default: this branch's work
	// sits in `main`, so reading `main` because the name exists answers for a
	// ref the work would never land in — and clears the warning while the
	// default branch lacks it (#8103 review).
	const { remote, clone } = makeRemoteAndClone();
	writeFileSync(join(clone, "work.txt"), "work\n");
	git(clone, ["add", "."]);
	git(clone, ["commit", "-qm", "work"]);
	git(clone, ["push", "-q", "origin", "main"]);

	// `master` exists too, and is the remote's default.
	git(clone, ["checkout", "-q", "-b", "master", "HEAD~1"]);
	git(clone, ["push", "-q", "origin", "master"]);
	git(remote, ["symbolic-ref", "HEAD", "refs/heads/master"]);
	git(clone, ["remote", "set-head", "origin", "--auto"]);

	git(clone, ["checkout", "-q", "main"]);
	// No upstream, which is what sends the probe to the remote's default.
	git(clone, ["branch", "--unset-upstream", "main"]);
	// Rewritten locally, so the commit is unreachable from every remote ref
	// while its tree is still the tip of `origin/main`.
	git(clone, ["commit", "-q", "--amend", "-m", "work (local)"]);

	const result = await gitWorktreeStateTask.handler(
		{ worktreePath: clone, gitEnv: NOOP_ENV },
		() => {},
	);

	expect(result.hasUnpushedCommits).toBe(true);
});

test("an identical tree on another branch does not clear a real warning", async () => {
	// The mirror failure of a tip-tree comparison: this branch's content is
	// pushed under a DIFFERENT name, so some remote tip carries its tree, while
	// its own work is nowhere in the branch it targets. Only the base may
	// answer, so the warning stays (#8035).
	const { clone } = makeRemoteAndClone();
	git(clone, ["checkout", "-qb", "feature/other"]);
	writeFileSync(join(clone, "other.txt"), "other work\n");
	git(clone, ["add", "."]);
	git(clone, ["commit", "-qm", "other work"]);

	// Pushed under another name, so that remote tip carries this tree...
	git(clone, ["push", "-q", "origin", "feature/other:feature/twin"]);
	// ...and the local commit is then rewritten, which keeps the tree while
	// making the commit itself unreachable from any remote ref: exactly the
	// state a tip-tree comparison reads as "already pushed".
	git(clone, ["commit", "-q", "--amend", "-m", "other work (local)"]);
	git(clone, ["fetch", "-q", "origin"]);

	const result = await gitWorktreeStateTask.handler(
		{ worktreePath: clone, gitEnv: NOOP_ENV },
		() => {},
	);

	expect(result.hasUnpushedCommits).toBe(true);
});
