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
import { resolveWorktreeStartPoint } from "./git";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-workspace-init-${process.pid}`,
);

function gitExec(args: string, cwd: string): void {
	execSync(`git ${args}`, { cwd, stdio: "ignore" });
}

function createBareRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	gitExec("init --bare", repoPath);
	return repoPath;
}

function cloneRepo(bareRepoPath: string, name: string): string {
	const clonePath = join(TEST_DIR, name);
	gitExec(`clone ${bareRepoPath} ${clonePath}`, TEST_DIR);
	gitExec("config user.email 'test@test.com'", clonePath);
	gitExec("config user.name 'Test'", clonePath);
	return clonePath;
}

function makeCommit(repoPath: string, fileName: string, message: string): void {
	writeFileSync(join(repoPath, fileName), `${message}\n`);
	gitExec(`add ${fileName}`, repoPath);
	gitExec(`commit -m "${message}"`, repoPath);
}

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
});

describe("resolveWorktreeStartPoint", () => {
	test("prefers local branch over origin when local branch exists", async () => {
		// Set up a bare remote and clone it
		const bareRepo = createBareRepo("remote.git");
		const localRepo = cloneRepo(bareRepo, "local");

		// Seed an initial commit and push it so origin/main exists
		makeCommit(localRepo, "README.md", "init");
		gitExec("push origin HEAD:main", localRepo);
		gitExec("branch -M main", localRepo);

		// Add a local commit that has NOT been pushed (simulates unpushed work)
		makeCommit(localRepo, "unpushed.txt", "local-only commit");

		// Before the fix, this would return "origin/main" even though the local
		// "main" branch exists and is ahead of the remote.
		const result = await resolveWorktreeStartPoint(localRepo, "main");

		expect(result).toBe("main");
	});

	test("falls back to origin/<branch> when local branch does not exist", async () => {
		// Set up a bare remote with a "release" branch that the local clone
		// never checks out, so only origin/release exists locally.
		const bareRepo = createBareRepo("remote2.git");
		const localRepo = cloneRepo(bareRepo, "local2");

		// Push an initial commit to main and to a "release" branch on the remote
		makeCommit(localRepo, "README.md", "init");
		gitExec("branch -M main", localRepo);
		gitExec("push origin main", localRepo);
		gitExec("push origin main:release", localRepo);

		// Fetch so origin/release tracking ref exists locally, but never check it out
		gitExec("fetch origin release", localRepo);

		// "release" should only exist as a remote tracking ref, not a local branch
		const result = await resolveWorktreeStartPoint(localRepo, "release");

		expect(result).toBe("origin/release");
	});
});
