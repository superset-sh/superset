import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { gitPrContextTask } from "./git";

/**
 * Real repos on a real filesystem, calling the task handler the way the
 * pool's inline fallback does — same pattern as commit-push.test.ts.
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
	await mkdir(join(cwd, name, ".."), { recursive: true });
	await writeFile(join(cwd, name), content);
	await git.raw(["add", "--", name]);
	await git.raw(["commit", "-m", message]);
}

function run(repo: string, patchByteBudget?: number) {
	return gitPrContextTask.handler({
		worktreePath: repo,
		gitEnv: {},
		...(patchByteBudget !== undefined ? { patchByteBudget } : {}),
	});
}

describe("gitPrContextTask", () => {
	let root: string;
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "git-pr-context-test-"));
		repo = join(root, "repo");
		await mkdir(repo);
		git = await initRepo(repo);
		await commitFile(git, repo, "base.txt", "base\n", "initial");
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("reads commits, diffstat, and a generated-free patch against the configured base", async () => {
		await git.checkoutBranch("feature", "main");
		await git.raw(["config", "branch.feature.base", "main"]);
		await commitFile(
			git,
			repo,
			"src/a.ts",
			"export const a = 1;\n",
			"feat: add a\n\nExplains why a exists.\n",
		);
		await writeFile(join(repo, "bun.lock"), "lock\n");
		await writeFile(join(repo, "src/b.ts"), "export const b = 2;\n");
		await git.raw(["add", "-A"]);
		await git.raw(["commit", "-m", "chore: add b and lockfile"]);

		const result = await run(repo);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { context } = result;

		expect(context.head).toBe("feature");
		// No remote, so the local base branch is the comparison ref.
		expect(context.base).toEqual({ name: "main", ref: "main" });
		expect(context.commits.map((c) => c.subject)).toEqual([
			"chore: add b and lockfile",
			"feat: add a",
		]);
		expect(context.commits[1]?.body).toBe("Explains why a exists.");
		expect(context.files.map((f) => [f.path, f.generated])).toEqual([
			["bun.lock", true],
			["src/a.ts", false],
			["src/b.ts", false],
		]);
		expect(context.patch.includedFiles).toBe(2);
		expect(context.patch.omittedFiles).toBe(0);
		expect(context.patch.text).toContain("diff --git a/src/a.ts");
		expect(context.patch.text).toContain("diff --git a/src/b.ts");
		expect(context.patch.text).not.toContain("bun.lock");
		expect(context.hasUncommitted).toBe(false);
		expect(context.unpushedCommits).toBeNull();
	});

	test("measures from the merge base so later base commits are not counted, and prefers the base's remote ref", async () => {
		const remote = join(root, "remote.git");
		await simpleGit(root).raw(["init", "--bare", remote]);
		await git.addRemote("origin", remote);
		await git.push(["-u", "origin", "main"]);
		await git.raw(["remote", "set-head", "origin", "main"]);

		await git.checkoutBranch("feature", "main");
		await commitFile(git, repo, "feature.txt", "f\n", "feat: feature work");
		await git.push(["-u", "origin", "feature"]);
		await commitFile(git, repo, "more.txt", "m\n", "feat: more work");

		// The base moves on after the fork.
		await git.checkout("main");
		await commitFile(git, repo, "landed.txt", "l\n", "feat: landed on main");
		await git.push(["origin", "main"]);
		await git.checkout("feature");

		const result = await run(repo);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { context } = result;
		// No branch.<name>.base: the repo default branch from origin/HEAD.
		expect(context.base).toEqual({ name: "main", ref: "origin/main" });
		expect(context.commits.map((c) => c.subject)).toEqual([
			"feat: more work",
			"feat: feature work",
		]);
		expect(context.files.map((f) => f.path)).toEqual([
			"feature.txt",
			"more.txt",
		]);
		expect(context.unpushedCommits).toBe(1);
	});

	test("reports uncommitted changes and honors the patch budget", async () => {
		await git.checkoutBranch("feature", "main");
		await git.raw(["config", "branch.feature.base", "main"]);
		await commitFile(
			git,
			repo,
			"big.txt",
			Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n"),
			"feat: big",
		);
		await commitFile(git, repo, "small.txt", "s\n", "feat: small");
		await writeFile(join(repo, "dirty.txt"), "dirty\n");

		const result = await run(repo, 300);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.context.hasUncommitted).toBe(true);
		expect(result.context.patch.includedFiles).toBe(1);
		expect(result.context.patch.omittedFiles).toBe(1);
		expect(result.context.patch.text).toContain("diff --git a/small.txt");
		expect(result.context.patch.text).not.toContain("diff --git a/big.txt");
	});

	test("skips the patch when only generated files changed", async () => {
		await git.checkoutBranch("feature", "main");
		await git.raw(["config", "branch.feature.base", "main"]);
		await commitFile(git, repo, "bun.lock", "lock\n", "chore: lock");

		const result = await run(repo);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.context.patch).toEqual({
			text: "",
			includedFiles: 0,
			omittedFiles: 0,
			truncated: false,
		});
	});

	test("rejects a detached HEAD, a missing base, and the base branch itself", async () => {
		const head = (await git.revparse(["HEAD"])).trim();
		await git.raw(["checkout", "--detach", head]);
		expect(await run(repo)).toEqual({ ok: false, reason: "detached-head" });

		await git.checkout("main");
		await git.checkoutBranch("feature", "main");
		expect(await run(repo)).toEqual({ ok: false, reason: "no-base" });

		await git.raw(["config", "branch.feature.base", "feature"]);
		expect(await run(repo)).toEqual({ ok: false, reason: "on-base" });
	});
});
