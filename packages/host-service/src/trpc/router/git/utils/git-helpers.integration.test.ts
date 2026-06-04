import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { resolveUpstream } from "../../../../runtime/git/refs";
import {
	getChangedFilesForDiff,
	getDefaultBranchName,
	resolveBaseComparison,
} from "./git-helpers";

/**
 * Integration tests that exercise the git-correctness fixes against real
 * on-disk repositories. Validates the exact scenarios the user-facing
 * fixes are meant to handle — stale local default branches, fork
 * workflows with a distinct upstream remote, non-ASCII filenames, etc.
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
	return mkdtempSync(join(tmpdir(), "superset-git-integration-"));
}

// ── resolveUpstream ────────────────────────────────────────────────

describe("resolveUpstream (integration)", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
		await commitFile(git, repo, "README.md", "hello", "initial");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("returns null when no upstream configured", async () => {
		expect(await resolveUpstream(git, "main")).toBeNull();
	});

	test("returns origin/<branch> when tracking origin", async () => {
		await git.raw(["config", "branch.main.remote", "origin"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		expect(await resolveUpstream(git, "main")).toEqual({
			remote: "origin",
			remoteBranch: "main",
		});
	});

	test("returns upstream/<branch> for fork workflow", async () => {
		await git.raw(["config", "branch.main.remote", "upstream"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		expect(await resolveUpstream(git, "main")).toEqual({
			remote: "upstream",
			remoteBranch: "main",
		});
	});

	test("handles local-tracking (remote = '.')", async () => {
		await git.raw(["checkout", "-b", "feature"]);
		await git.raw(["config", "branch.feature.remote", "."]);
		await git.raw(["config", "branch.feature.merge", "refs/heads/main"]);
		expect(await resolveUpstream(git, "feature")).toEqual({
			remote: ".",
			remoteBranch: "main",
		});
	});

	test("handles tracking a differently-named remote branch", async () => {
		await git.raw(["config", "branch.main.remote", "upstream"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/master"]);
		expect(await resolveUpstream(git, "main")).toEqual({
			remote: "upstream",
			remoteBranch: "master",
		});
	});

	test("returns null for nonexistent branch", async () => {
		expect(await resolveUpstream(git, "does-not-exist")).toBeNull();
	});
});

// ── resolveBaseComparison ──────────────────────────────────────────

describe("resolveBaseComparison (integration)", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
		await commitFile(git, repo, "README.md", "hello", "initial");
		// Simulate a remote so origin/HEAD can be set. We don't need an
		// actual remote to fetch from — `symbolic-ref` on the remote HEAD
		// is all getDefaultBranchName reads.
		await git.raw(["update-ref", "refs/remotes/origin/main", "HEAD"]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("falls back to origin/<default> when no upstream configured", async () => {
		const result = await resolveBaseComparison(git);
		expect(result).toEqual({ branchName: "main", baseRef: "origin/main" });
	});

	test("honors configured upstream remote (fork workflow)", async () => {
		await git.raw(["update-ref", "refs/remotes/upstream/main", "HEAD"]);
		await git.raw(["config", "branch.main.remote", "upstream"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		expect(await resolveBaseComparison(git)).toEqual({
			branchName: "main",
			baseRef: "upstream/main",
		});
	});

	test("local-tracking branch resolves to bare branch name (not ./name)", async () => {
		await git.raw(["checkout", "-b", "integration"]);
		await git.raw(["config", "branch.integration.remote", "."]);
		await git.raw(["config", "branch.integration.merge", "refs/heads/main"]);
		expect(await resolveBaseComparison(git, "integration")).toEqual({
			branchName: "integration",
			baseRef: "main",
		});
	});

	test("explicit branch with upstream uses upstream remote", async () => {
		await git.raw(["update-ref", "refs/remotes/upstream/main", "HEAD"]);
		await git.raw(["config", "branch.main.remote", "upstream"]);
		await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
		expect(await resolveBaseComparison(git, "main")).toEqual({
			branchName: "main",
			baseRef: "upstream/main",
		});
	});

	test("returns null when no default branch can be resolved", async () => {
		const emptyRepo = mkTmp();
		try {
			const emptyGit = await initRepo(emptyRepo);
			await commitFile(emptyGit, emptyRepo, "a.txt", "a", "init");
			expect(await resolveBaseComparison(emptyGit)).toBeNull();
		} finally {
			rmSync(emptyRepo, { recursive: true, force: true });
		}
	});
});

// ── getDefaultBranchName ───────────────────────────────────────────

describe("getDefaultBranchName (integration)", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
		await commitFile(git, repo, "README.md", "hello", "initial");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("returns null when origin/HEAD not set", async () => {
		expect(await getDefaultBranchName(git)).toBeNull();
	});

	test("returns 'main' when origin/HEAD points at origin/main", async () => {
		await git.raw(["update-ref", "refs/remotes/origin/main", "HEAD"]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);
		expect(await getDefaultBranchName(git)).toBe("main");
	});

	test("returns 'master' when origin/HEAD points at origin/master", async () => {
		await git.raw(["branch", "master"]);
		await git.raw(["update-ref", "refs/remotes/origin/master", "HEAD"]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/master",
		]);
		expect(await getDefaultBranchName(git)).toBe("master");
	});
});

// ── getChangedFilesForDiff ─────────────────────────────────────────

describe("getChangedFilesForDiff (integration)", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("returns adds/modifies/deletes correctly", async () => {
		await commitFile(git, repo, "keep.ts", "a\nb\nc\n", "base");
		await commitFile(git, repo, "drop.ts", "x\n", "base2");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "new.ts", "hello\nworld\n", "add");
		await writeFile(join(repo, "keep.ts"), "a\nB\nc\n");
		await git.raw(["add", "keep.ts"]);
		await git.raw(["commit", "-m", "modify"]);
		await git.raw(["rm", "drop.ts"]);
		await git.raw(["commit", "-m", "delete"]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const byPath = new Map(files.map((f) => [f.path, f]));
		expect(byPath.get("new.ts")?.status).toBe("added");
		expect(byPath.get("new.ts")?.additions).toBe(2);
		expect(byPath.get("keep.ts")?.status).toBe("modified");
		expect(byPath.get("keep.ts")?.additions).toBe(1);
		expect(byPath.get("keep.ts")?.deletions).toBe(1);
		expect(byPath.get("drop.ts")?.status).toBe("deleted");
	});

	test("rename with line changes reports correct additions/deletions", async () => {
		await commitFile(
			git,
			repo,
			"old.ts",
			"one\ntwo\nthree\nfour\nfive\n",
			"base",
		);
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await git.raw(["mv", "old.ts", "new.ts"]);
		// Change a couple of lines inside the rename.
		await writeFile(join(repo, "new.ts"), "one\nTWO\nthree\nfour\nFIVE\n");
		await git.raw(["add", "new.ts"]);
		await git.raw(["commit", "-m", "rename+edit"]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const rename = files.find((f) => f.path === "new.ts");
		expect(rename?.status).toBe("renamed");
		expect(rename?.oldPath).toBe("old.ts");
		// With 2 line edits we should see non-zero add/del — the bug
		// before this PR was that these came back as 0/0.
		expect(rename?.additions).toBeGreaterThan(0);
		expect(rename?.deletions).toBeGreaterThan(0);
	});

	test("pure rename (no edits) reports 0/0 correctly", async () => {
		await commitFile(git, repo, "old.ts", "stable\n", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await git.raw(["mv", "old.ts", "new.ts"]);
		await git.raw(["commit", "-m", "rename"]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const rename = files.find((f) => f.path === "new.ts");
		expect(rename?.status).toBe("renamed");
		expect(rename?.additions).toBe(0);
		expect(rename?.deletions).toBe(0);
	});

	test("non-ASCII filename reports correct additions/deletions", async () => {
		await commitFile(git, repo, "README.md", "a", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		await commitFile(git, repo, "日本語.ts", "hello\nworld\n", "add ja");

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const ja = files.find((f) => f.path.includes("日本語"));
		expect(ja).toBeDefined();
		expect(ja?.status).toBe("added");
		// Pre-fix: additions would be 0 because --name-status quoted the
		// path as "\346\227\245\346\234\254\350\252\236.ts" while
		// --numstat -z emitted it raw — the lookup never matched.
		expect(ja?.additions).toBe(2);
	});

	test("binary file reports 0/0", async () => {
		await commitFile(git, repo, "README.md", "a", "base");
		const baseSha = (await git.revparse(["HEAD"])).trim();
		// A NUL byte forces git's "binary" classification.
		const bin = Buffer.from([0x00, 0x01, 0x02, 0x03]);
		await writeFile(join(repo, "img.bin"), bin);
		await git.raw(["add", "img.bin"]);
		await git.raw(["commit", "-m", "add binary"]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const bin2 = files.find((f) => f.path === "img.bin");
		expect(bin2?.status).toBe("added");
		expect(bin2?.additions).toBe(0);
		expect(bin2?.deletions).toBe(0);
	});

	test("3-dot diff excludes changes on base after divergence", async () => {
		// base: A — B
		//        \
		// branch: X
		// Then advance base with commit C that branch doesn't know about.
		// A 2-dot diff origin-main HEAD would include C as a delete.
		// Our 3-dot baseSha...HEAD pins to the merge base and excludes C.
		await commitFile(git, repo, "shared.ts", "a\n", "A");
		await git.raw(["checkout", "-b", "branch"]);
		await commitFile(git, repo, "branch-only.ts", "x\n", "X");
		const branchSha = (await git.revparse(["HEAD"])).trim();

		await git.raw(["checkout", "main"]);
		await commitFile(git, repo, "main-only.ts", "c\n", "C");
		const baseSha = (await git.revparse(["HEAD"])).trim();

		await git.raw(["checkout", branchSha]);

		const files = await getChangedFilesForDiff(git, [`${baseSha}...HEAD`]);
		const paths = files.map((f) => f.path).sort();
		// Only our branch's file should show — C on main is excluded by 3-dot.
		expect(paths).toEqual(["branch-only.ts"]);
	});
});
