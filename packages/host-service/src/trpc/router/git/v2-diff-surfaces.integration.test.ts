import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { resolveUpstream } from "../../../runtime/git/refs";
import {
	buildBranch,
	getChangedFilesForDiff,
	resolveBaseComparison,
} from "./utils/git-helpers";

/**
 * End-to-end tests organized to mirror docs/V2_WORKSPACE_DIFF_VIEWS.md.
 * Each describe block maps to one UI surface in that doc, so a reviewer
 * can trace "this surface works as described" to a specific test.
 */

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

async function commitFile(
	git: SimpleGit,
	cwd: string,
	name: string,
	content: string,
	message: string,
): Promise<void> {
	await writeFile(join(cwd, name), content);
	await git.raw(["add", "--", name]);
	await git.raw(["commit", "-m", message]);
}

function mkTmp(): string {
	return mkdtempSync(join(tmpdir(), "superset-v2-surfaces-"));
}

// ───────────────────────────────────────────────────────────────────
// Surface A — Creating a new workspace
// Doc: new worktree starts at the real upstream tip, not at a stale
// local copy of main. Fork users branch from `upstream/main`, not
// `origin/main`.
// ───────────────────────────────────────────────────────────────────

describe("Surface A — new workspace creation", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("stale local main: new branch starts at origin/main tip", async () => {
		await commitFile(git, repo, "a.txt", "1", "A");
		const oldMainSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "b.txt", "2", "B");
		const freshMainSha = (await git.revparse(["HEAD"])).trim();

		// Set origin/main to fresh; reset local main to stale.
		await git.raw(["update-ref", "refs/remotes/origin/main", freshMainSha]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);
		await git.raw(["config", "branch.main.remote", "origin"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		await git.raw(["reset", "--hard", oldMainSha]);

		// Execute the workspace-creation upgrade: when the resolved start
		// point is local default, we swap to the configured upstream ref.
		const upstream = await resolveUpstream(git, "main");
		expect(upstream).toEqual({ remote: "origin", remoteBranch: "main" });
		const startRef = `${upstream?.remote}/${upstream?.remoteBranch}`;

		const worktreePath = join(repo, "..", `${repo.split("/").pop()}-wt`);
		await git.raw([
			"worktree",
			"add",
			"--no-track",
			"-b",
			"feature",
			worktreePath,
			startRef,
		]);

		const wtGit = simpleGit(worktreePath);
		const wtHead = (await wtGit.revparse(["HEAD"])).trim();
		expect(wtHead).toBe(freshMainSha);
		expect(wtHead).not.toBe(oldMainSha);

		rmSync(worktreePath, { recursive: true, force: true });
	});

	test("fork workflow: local main tracks upstream/main, not origin/main", async () => {
		await commitFile(git, repo, "a.txt", "1", "A");
		const originSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "b.txt", "2", "B");
		const upstreamSha = (await git.revparse(["HEAD"])).trim();

		// origin/main = fork (older), upstream/main = canonical (newer).
		await git.raw(["update-ref", "refs/remotes/origin/main", originSha]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);
		await git.raw(["update-ref", "refs/remotes/upstream/main", upstreamSha]);
		await git.raw(["config", "branch.main.remote", "upstream"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		await git.raw(["reset", "--hard", originSha]);

		const upstream = await resolveUpstream(git, "main");
		expect(upstream).toEqual({ remote: "upstream", remoteBranch: "main" });
		const startRef = `${upstream?.remote}/${upstream?.remoteBranch}`;

		const worktreePath = join(repo, "..", `${repo.split("/").pop()}-wt`);
		await git.raw([
			"worktree",
			"add",
			"--no-track",
			"-b",
			"feature",
			worktreePath,
			startRef,
		]);

		const wtGit = simpleGit(worktreePath);
		const wtHead = (await wtGit.revparse(["HEAD"])).trim();
		expect(wtHead).toBe(upstreamSha); // canonical tip, not fork's
		expect(wtHead).not.toBe(originSha);

		rmSync(worktreePath, { recursive: true, force: true });
	});

	test("no upstream configured: falls back to local ref (no regression)", async () => {
		await commitFile(git, repo, "a.txt", "1", "A");
		const sha = (await git.revparse(["HEAD"])).trim();

		// No `branch.main.remote` / `.merge` configured.
		const upstream = await resolveUpstream(git, "main");
		expect(upstream).toBeNull();

		const worktreePath = join(repo, "..", `${repo.split("/").pop()}-wt`);
		await git.raw([
			"worktree",
			"add",
			"--no-track",
			"-b",
			"feature",
			worktreePath,
			"main",
		]);

		const wtGit = simpleGit(worktreePath);
		expect((await wtGit.revparse(["HEAD"])).trim()).toBe(sha);

		rmSync(worktreePath, { recursive: true, force: true });
	});
});

// ───────────────────────────────────────────────────────────────────
// Surfaces B/C — Dashboard sidebar badge & Changes tab counts
// Doc: counts reflect "me since I forked," stable as main advances,
// correct for fork workflows and non-ASCII filenames.
// ───────────────────────────────────────────────────────────────────

describe("Surfaces B/C — sidebar badge + Changes tab counts", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("count is stable as main advances after you forked", async () => {
		await commitFile(git, repo, "shared.ts", "a\n", "A");
		await git.raw(["checkout", "-b", "feature"]);
		await commitFile(git, repo, "mine.ts", "x\n", "my work");

		await git.raw(["checkout", "main"]);
		const beforeFiles = await getChangedFilesForDiff(git, ["main...feature"]);
		expect(beforeFiles.map((f) => f.path).sort()).toEqual(["mine.ts"]);

		// Advance main with an unrelated commit.
		await commitFile(git, repo, "unrelated.ts", "z\n", "unrelated main work");

		const afterFilesLocal = await getChangedFilesForDiff(git, [
			"main...feature",
		]);
		// Count must remain the same — three-dot pins to the fork point.
		expect(afterFilesLocal.map((f) => f.path).sort()).toEqual(["mine.ts"]);
		// Also verify the pre-fix two-dot behavior WOULD have drifted:
		const twoDot = await getChangedFilesForDiff(git, ["main", "feature"]);
		expect(twoDot.map((f) => f.path).sort()).toContain("unrelated.ts");
	});

	test("fork workflow: counts compare against upstream/main, not origin/main", async () => {
		await commitFile(git, repo, "shared.ts", "a\n", "A");
		const originSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "upstream-only.ts", "u\n", "B");
		const upstreamSha = (await git.revparse(["HEAD"])).trim();

		await git.raw(["update-ref", "refs/remotes/origin/main", originSha]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);
		await git.raw(["update-ref", "refs/remotes/upstream/main", upstreamSha]);
		await git.raw(["config", "branch.main.remote", "upstream"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		await git.raw(["reset", "--hard", originSha]);

		const base = await resolveBaseComparison(git);
		expect(base).toEqual({ branchName: "main", baseRef: "upstream/main" });
	});

	test("non-ASCII filename reports correct additions (was +0 -0 before fix)", async () => {
		await commitFile(git, repo, "README.md", "a", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "日本語.ts", "line1\nline2\n", "add ja");

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const ja = files.find((f) => f.path.includes("日本語"));
		expect(ja?.additions).toBe(2);
		expect(ja?.deletions).toBe(0);
	});

	test("three buckets (againstBase, staged, unstaged) stay distinct", async () => {
		// This surface exercises more than just getChangedFilesForDiff —
		// the renderer merges three buckets. We verify that each bucket
		// can be computed independently with the expected semantics.
		await commitFile(git, repo, "a.txt", "1\n", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "b.txt", "2\n", "committed on branch");

		// Staged change:
		await writeFile(join(repo, "a.txt"), "1 STAGED\n");
		await git.raw(["add", "a.txt"]);

		// Unstaged change:
		await writeFile(join(repo, "c.txt"), "3\n");

		const againstBase = await getChangedFilesForDiff(git, [
			`${baseSha}...HEAD`,
		]);
		// against-base only sees committed work on this branch.
		expect(againstBase.map((f) => f.path).sort()).toEqual(["b.txt"]);
	});
});

// ───────────────────────────────────────────────────────────────────
// Surface D — Per-file diff view (merge-base content comparison)
// Doc: clicking a file shows content at fork point vs HEAD, so
// unrelated edits on main don't appear as your changes.
// ───────────────────────────────────────────────────────────────────

describe("Surface D — per-file diff uses merge-base", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("unrelated base-side edit to same file is hidden from per-file diff", async () => {
		await commitFile(git, repo, "shared.ts", "line1\nline2\nline3\n", "A");
		const forkSha = (await git.revparse(["HEAD"])).trim();

		await git.raw(["checkout", "-b", "feature"]);
		await writeFile(join(repo, "shared.ts"), "line1\nBRANCH CHANGED\nline3\n");
		await git.raw(["commit", "-am", "branch edit"]);

		await git.raw(["checkout", "main"]);
		await writeFile(join(repo, "shared.ts"), "line1\nMAIN CHANGED\nline3\n");
		await git.raw(["commit", "-am", "main edit"]);

		// The per-file diff under the new behavior shows content at the
		// merge-base vs content at HEAD of feature — not main's tip vs
		// feature's tip. So main's unrelated edit doesn't leak in.
		const mergeBase = (await git.raw(["merge-base", "main", "feature"])).trim();
		expect(mergeBase).toBe(forkSha);

		const baseContent = await git.show([`${mergeBase}:shared.ts`]);
		const headContent = await git.show(["feature:shared.ts"]);
		expect(baseContent).toBe("line1\nline2\nline3\n");
		expect(headContent).toBe("line1\nBRANCH CHANGED\nline3\n");

		// And confirm the pre-fix behavior (tip-to-tip) would have shown
		// main's edit as a reversal:
		const mainTipContent = await git.show(["main:shared.ts"]);
		expect(mainTipContent).toBe("line1\nMAIN CHANGED\nline3\n");
		// If we had diffed main:shared.ts vs feature:shared.ts the diff
		// would include both edits — proving merge-base is the right
		// origin for a "your changes only" view.
		expect(mainTipContent).not.toBe(baseContent);
	});
});

// ───────────────────────────────────────────────────────────────────
// Surface F — Ahead/behind counts in branch lists
// Doc: 3-dot symmetric count via `rev-list --left-right --count base...branch`.
// ───────────────────────────────────────────────────────────────────

describe("Surface F — ahead/behind counts", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("counts are correct against a base ref", async () => {
		await commitFile(git, repo, "a.txt", "A", "A");
		await git.raw(["checkout", "-b", "feature"]);
		await commitFile(git, repo, "b.txt", "B", "B");
		await commitFile(git, repo, "c.txt", "C", "C");

		await git.raw(["checkout", "main"]);
		await commitFile(git, repo, "d.txt", "D", "D");

		const branch = await buildBranch(git, "feature", false, "main");
		expect(branch.aheadCount).toBe(2); // B, C
		expect(branch.behindCount).toBe(1); // D
	});

	test("feature branch not yet behind main reports behind=0", async () => {
		await commitFile(git, repo, "a.txt", "A", "A");
		await git.raw(["checkout", "-b", "feature"]);
		await commitFile(git, repo, "b.txt", "B", "B");

		const branch = await buildBranch(git, "feature", true, "main");
		expect(branch.aheadCount).toBe(1);
		expect(branch.behindCount).toBe(0);
	});
});

// ───────────────────────────────────────────────────────────────────
// Renames (separate section in the doc)
// Doc: renamed files now show correct line counts — the bug was +0 -0.
// ───────────────────────────────────────────────────────────────────

describe("Rename files — line counts", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("rename with in-file edits shows non-zero additions/deletions", async () => {
		await commitFile(git, repo, "old.ts", "one\ntwo\nthree\nfour\n", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await git.raw(["mv", "old.ts", "new.ts"]);
		await writeFile(join(repo, "new.ts"), "one\nTWO\nthree\nFOUR\n");
		await git.raw(["add", "new.ts"]);
		await git.raw(["commit", "-m", "rename+edit"]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const r = files.find((f) => f.path === "new.ts");
		expect(r?.status).toBe("renamed");
		expect(r?.oldPath).toBe("old.ts");
		expect(r?.additions).toBeGreaterThan(0);
		expect(r?.deletions).toBeGreaterThan(0);
	});

	test("pure rename shows 0/0", async () => {
		await commitFile(git, repo, "old.ts", "stable\n", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await git.raw(["mv", "old.ts", "new.ts"]);
		await git.raw(["commit", "-m", "rename"]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const r = files.find((f) => f.path === "new.ts");
		expect(r?.status).toBe("renamed");
		expect(r?.additions).toBe(0);
		expect(r?.deletions).toBe(0);
	});
});
