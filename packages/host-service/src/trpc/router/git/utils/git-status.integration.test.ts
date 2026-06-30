import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { getGitStatusSnapshot } from "./git-status";

/**
 * Reproduces #5114: the sidebar "against main" (Diffs) count stopped
 * showing committed changes in 1.12.2.
 *
 * The Diffs tab renders `status.againstBase.length`. `againstBase` is the
 * 3-dot diff `${baseRef}...HEAD`, where `baseRef` comes from
 * `resolveBaseComparison`. That resolver only consults the remote default
 * branch (`refs/remotes/origin/HEAD`). When a workspace has no
 * `origin/HEAD` symbolic ref — a local-only repo, a worktree where the
 * remote default was never tracked, a shallow/CI clone — the resolver
 * returns null and `baseRef` falls back to `"HEAD"`. `HEAD...HEAD` is
 * empty, so "against main" silently shows nothing even though the branch
 * has committed changes against its local default branch.
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
	return mkdtempSync(join(tmpdir(), "superset-git-status-"));
}

describe("getGitStatusSnapshot — againstBase / 'against main' (#5114)", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
		// main with one commit, then a feature branch with a committed change.
		await commitFile(git, repo, "README.md", "hello\n", "initial");
		await git.raw(["checkout", "-b", "feature"]);
		await commitFile(git, repo, "feature.ts", "export const x = 1;\n", "feat");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("shows committed change against local default when origin/HEAD is unset", async () => {
		// No refs/remotes/origin/HEAD here — the common workspace case.
		const snapshot = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});

		const paths = snapshot.againstBase.map((f) => f.path).sort();
		expect(paths).toEqual(["feature.ts"]);
	});

	test("still works when origin/HEAD is set", async () => {
		await git.raw(["update-ref", "refs/remotes/origin/main", "main"]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);

		const snapshot = await getGitStatusSnapshot({
			git,
			worktreePath: repo,
		});

		const paths = snapshot.againstBase.map((f) => f.path).sort();
		expect(paths).toEqual(["feature.ts"]);
	});
});
