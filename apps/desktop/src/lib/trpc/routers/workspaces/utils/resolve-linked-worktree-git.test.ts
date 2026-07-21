import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLinkedWorktreeGit } from "./resolve-linked-worktree-git";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-resolve-linked-${process.pid}`,
);

function initRepo(path: string): void {
	mkdirSync(path, { recursive: true });
	execSync("git init", { cwd: path, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: path,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: path, stdio: "ignore" });
	writeFileSync(join(path, "README.md"), "# test\n");
	execSync("git add . && git commit -m init", { cwd: path, stdio: "ignore" });
}

describe("resolveLinkedWorktreeGit", () => {
	let mainRepo: string;

	beforeEach(() => {
		if (existsSync(TEST_DIR))
			rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
		mainRepo = join(TEST_DIR, "main-repo");
		initRepo(mainRepo);
	});

	afterEach(() => {
		if (existsSync(TEST_DIR))
			rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test("resolves a linked worktree to its main repo root", async () => {
		const wtPath = join(TEST_DIR, "feature-wt");
		execSync(`git worktree add "${wtPath}" -b feature`, {
			cwd: mainRepo,
			stdio: "ignore",
		});

		const result = await resolveLinkedWorktreeGit(wtPath);

		expect(result).not.toBeNull();
		expect(result?.mainRepoPath).toBe(realpathSync(mainRepo));
		expect(result?.toplevel).toBe(realpathSync(wtPath));
		expect(result?.branch).toBe("feature");
	});

	test("resolves a main checkout (toplevel equals mainRepoPath)", async () => {
		const result = await resolveLinkedWorktreeGit(mainRepo);

		expect(result).not.toBeNull();
		expect(result?.toplevel).toBe(realpathSync(mainRepo));
		expect(result?.mainRepoPath).toBe(realpathSync(mainRepo));
	});

	test("returns null for a non-git directory", async () => {
		const plain = join(TEST_DIR, "plain");
		mkdirSync(plain, { recursive: true });

		expect(await resolveLinkedWorktreeGit(plain)).toBeNull();
	});

	test("returns null for a detached HEAD worktree", async () => {
		const sha = execSync("git rev-parse HEAD", { cwd: mainRepo })
			.toString()
			.trim();
		const detached = join(TEST_DIR, "detached-wt");
		execSync(`git worktree add --detach "${detached}" ${sha}`, {
			cwd: mainRepo,
			stdio: "ignore",
		});

		expect(await resolveLinkedWorktreeGit(detached)).toBeNull();
	});

	test("returns null for an unborn HEAD (initialized, no commits)", async () => {
		const fresh = join(TEST_DIR, "fresh-repo");
		mkdirSync(fresh, { recursive: true });
		execSync("git init", { cwd: fresh, stdio: "ignore" });

		expect(await resolveLinkedWorktreeGit(fresh)).toBeNull();
	});

	test("returns null for a bare repo", async () => {
		const bare = join(TEST_DIR, "bare.git");
		execSync(`git init --bare "${bare}"`, { stdio: "ignore" });
		expect(await resolveLinkedWorktreeGit(bare)).toBeNull();
	});
});
