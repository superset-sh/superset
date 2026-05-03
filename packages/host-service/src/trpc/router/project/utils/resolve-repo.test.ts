import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { cloneRepoInto, resolveLocalRepo } from "./resolve-repo";

/**
 * Integration tests against real on-disk git repositories. The point is
 * to catch regressions in the local-only project setup paths — every
 * negative case below has a paired assertion on the *specific* error
 * message or shape so a behavior change can't silently pass.
 */

async function initRepoAt(path: string): Promise<SimpleGit> {
	mkdirSync(path, { recursive: true });
	const git = simpleGit(path);
	await git.init();
	// Required for any commit (including --allow-empty) under bun's CI env.
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	return git;
}

async function seedCommit(git: SimpleGit): Promise<void> {
	await git.raw(["commit", "--allow-empty", "-m", "seed"]);
}

function eqRealpath(a: string, b: string): boolean {
	return realpathSync(a) === realpathSync(b);
}

let workRoot: string;

beforeEach(() => {
	workRoot = mkdtempSync(join(tmpdir(), "superset-resolve-repo-"));
});

afterEach(() => {
	rmSync(workRoot, { recursive: true, force: true });
});

// ── resolveLocalRepo ──────────────────────────────────────────────

describe("resolveLocalRepo", () => {
	test("accepts a git repo with no remotes at all", async () => {
		const repo = join(workRoot, "bare");
		await initRepoAt(repo);

		const resolved = await resolveLocalRepo(repo);

		expect(eqRealpath(resolved.repoPath, repo)).toBe(true);
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});

	test("returns origin when origin is a GitHub remote", async () => {
		const repo = join(workRoot, "with-origin");
		const git = await initRepoAt(repo);
		await git.addRemote("origin", "git@github.com:acme/example.git");

		const resolved = await resolveLocalRepo(repo);

		expect(resolved.remoteName).toBe("origin");
		expect(resolved.parsed).toEqual({
			provider: "github",
			owner: "acme",
			name: "example",
			url: "https://github.com/acme/example",
		});
	});

	test("treats a non-GitHub origin (gitlab) as local-only", async () => {
		const repo = join(workRoot, "gitlab-origin");
		const git = await initRepoAt(repo);
		await git.addRemote("origin", "git@gitlab.com:acme/example.git");

		const resolved = await resolveLocalRepo(repo);

		// getGitHubRemotes filters out non-GitHub URLs, so this looks
		// indistinguishable from a no-remote repo to v2 setup.
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});

	test("prefers origin over other GitHub remotes when both exist", async () => {
		const repo = join(workRoot, "multi-remote");
		const git = await initRepoAt(repo);
		// `aaa` sorts alphabetically before `origin`, so `git remote -v`
		// lists it first. If the origin-preference branch is removed and
		// the code falls back to "first remote", this test catches it.
		await git.addRemote("aaa", "https://github.com/Other/Repo.git");
		await git.addRemote("origin", "git@github.com:Acme/App.git");

		const resolved = await resolveLocalRepo(repo);

		expect(resolved.remoteName).toBe("origin");
		expect(resolved.parsed?.owner).toBe("Acme");
		expect(resolved.parsed?.name).toBe("App");
	});

	test("falls back to first GitHub remote when origin is missing", async () => {
		const repo = join(workRoot, "no-origin");
		const git = await initRepoAt(repo);
		await git.addRemote("upstream", "https://github.com/upstream-org/lib.git");

		const resolved = await resolveLocalRepo(repo);

		expect(resolved.remoteName).toBe("upstream");
		expect(resolved.parsed?.owner).toBe("upstream-org");
		expect(resolved.parsed?.name).toBe("lib");
	});

	test("falls back to first GitHub remote when origin is non-GitHub", async () => {
		const repo = join(workRoot, "mixed-remote");
		const git = await initRepoAt(repo);
		await git.addRemote("origin", "git@gitlab.com:hidden/origin.git");
		await git.addRemote("github", "https://github.com/visible/repo.git");

		const resolved = await resolveLocalRepo(repo);

		expect(resolved.remoteName).toBe("github");
		expect(resolved.parsed?.owner).toBe("visible");
		expect(resolved.parsed?.name).toBe("repo");
	});

	test("walks up from a subdirectory to the git toplevel", async () => {
		const repo = join(workRoot, "outer");
		await initRepoAt(repo);
		const inner = join(repo, "src", "deeply", "nested");
		mkdirSync(inner, { recursive: true });

		const resolved = await resolveLocalRepo(inner);

		expect(eqRealpath(resolved.repoPath, repo)).toBe(true);
	});

	test("rejects a path that does not exist", async () => {
		const missing = join(workRoot, "does-not-exist");

		await expect(resolveLocalRepo(missing)).rejects.toThrow(
			/Path does not exist/,
		);
	});

	test("rejects a path that points at a file", async () => {
		const file = join(workRoot, "a-file.txt");
		writeFileSync(file, "hello");

		await expect(resolveLocalRepo(file)).rejects.toThrow(
			/Path is not a directory/,
		);
	});

	test("rejects a directory that is not a git repo", async () => {
		const plain = join(workRoot, "plain-dir");
		mkdirSync(plain);

		await expect(resolveLocalRepo(plain)).rejects.toThrow(
			/Not a git repository/,
		);
	});
});

// ── cloneRepoInto ─────────────────────────────────────────────────

describe("cloneRepoInto", () => {
	let parentDir: string;
	let source: string;
	let sourceGit: SimpleGit;

	beforeEach(async () => {
		parentDir = join(workRoot, "clones");
		mkdirSync(parentDir);
		source = join(workRoot, "source-repo");
		sourceGit = await initRepoAt(source);
		await seedCommit(sourceGit);
	});

	test("clones from a local-path source and resolves as local-only", async () => {
		const resolved = await cloneRepoInto(source, parentDir);

		expect(eqRealpath(resolved.repoPath, join(parentDir, "source-repo"))).toBe(
			true,
		);
		expect(resolved.remoteName).toBeNull();
		expect(resolved.parsed).toBeNull();
	});

	test("strips .git suffix when deriving the target directory name", async () => {
		// Source dir ends in ".git" — clone should land in "myrepo", not
		// "myrepo.git", because deriveCloneDirectoryName trims it.
		const dotGitSource = join(workRoot, "myrepo.git");
		const git = await initRepoAt(dotGitSource);
		await seedCommit(git);

		const resolved = await cloneRepoInto(dotGitSource, parentDir);

		expect(existsSync(join(parentDir, "myrepo"))).toBe(true);
		expect(existsSync(join(parentDir, "myrepo.git"))).toBe(false);
		expect(eqRealpath(resolved.repoPath, join(parentDir, "myrepo"))).toBe(true);
	});

	test("strips trailing slashes when deriving the target directory name", async () => {
		const resolved = await cloneRepoInto(`${source}/`, parentDir);

		expect(eqRealpath(resolved.repoPath, join(parentDir, "source-repo"))).toBe(
			true,
		);
	});

	test("throws when the URL normalizes to no usable segment", async () => {
		await expect(cloneRepoInto("/", parentDir)).rejects.toThrow(
			/Could not derive repository name/,
		);
	});

	test("throws when the URL normalizes to '.'", async () => {
		// "./" → after trim/strip-trailing-slash → "." which is a reserved
		// segment we refuse to use as a clone target.
		await expect(cloneRepoInto("./", parentDir)).rejects.toThrow(
			/Could not derive repository name/,
		);
	});

	test("throws when the URL normalizes to '..'", async () => {
		await expect(cloneRepoInto("../", parentDir)).rejects.toThrow(
			/Could not derive repository name/,
		);
	});

	test("throws when the URL is empty", async () => {
		await expect(cloneRepoInto("", parentDir)).rejects.toThrow(
			/Could not derive repository name/,
		);
	});

	test("rejects when target directory already exists", async () => {
		const targetPath = join(parentDir, "source-repo");
		mkdirSync(targetPath);
		// Drop a sentinel file so we can confirm we did NOT nuke the
		// pre-existing directory on the EEXIST failure path.
		writeFileSync(join(targetPath, "keep-me.txt"), "preserved");

		await expect(cloneRepoInto(source, parentDir)).rejects.toThrow(
			/Directory already exists/,
		);
		expect(existsSync(join(targetPath, "keep-me.txt"))).toBe(true);
	});

	test("rejects when parent directory does not exist", async () => {
		const missingParent = join(workRoot, "no-such-parent");

		await expect(cloneRepoInto(source, missingParent)).rejects.toThrow(
			/Parent directory does not exist/,
		);
	});

	test("rejects when parent directory points at a file", async () => {
		const fileParent = join(workRoot, "im-a-file.txt");
		writeFileSync(fileParent, "");

		await expect(cloneRepoInto(source, fileParent)).rejects.toThrow(
			/Parent directory is not a directory/,
		);
	});

	test("cleans up the target directory when the underlying clone fails", async () => {
		const bogusSource = join(workRoot, "not-a-repo");
		mkdirSync(bogusSource);
		const expectedTarget = join(parentDir, "not-a-repo");

		await expect(cloneRepoInto(bogusSource, parentDir)).rejects.toThrow(
			/Failed to clone repository/,
		);
		// No orphan directory should be left behind for the next attempt.
		expect(existsSync(expectedTarget)).toBe(false);
	});

	test("does not delete a pre-existing target dir when clone fails on a separate path", async () => {
		// Confirms the cleanup path only touches the dir we created.
		// We pre-create an unrelated dir under parentDir; if the rm path is
		// over-broad, the test will catch it.
		const sibling = join(parentDir, "do-not-touch");
		mkdirSync(sibling);
		writeFileSync(join(sibling, "marker"), "x");

		const bogusSource = join(workRoot, "not-a-repo-2");
		mkdirSync(bogusSource);

		await expect(cloneRepoInto(bogusSource, parentDir)).rejects.toThrow(
			/Failed to clone repository/,
		);
		expect(existsSync(join(sibling, "marker"))).toBe(true);
	});

	test("post-clone slug check is skipped for non-GitHub URLs", async () => {
		// Source has a github remote configured, but cloneRepoInto is
		// called with the local path. parseGitHubRemote(localPath) is
		// null → expectedSlug is null → no resolveMatchingSlug call → we
		// must not throw "No remote matches …" even though the cloned
		// repo's only remote (origin = source path) doesn't look like a
		// GitHub URL.
		await sourceGit.addRemote(
			"upstream",
			"git@github.com:acme/something-else.git",
		);

		const resolved = await cloneRepoInto(source, parentDir);

		expect(resolved.parsed).toBeNull();
		expect(resolved.remoteName).toBeNull();
	});
});
