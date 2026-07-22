import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeGitTask, MAX_COMMIT_LIST_COUNT } from "./git-task-handlers";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-git-tasks-${process.pid}`,
);

function run(repoPath: string, command: string): string {
	return execSync(command, { cwd: repoPath, encoding: "utf8" });
}

function createBranchWithCommits(name: string, commitCount: number): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	run(repoPath, "git init -q -b main");
	run(repoPath, "git config user.email test@test.com");
	run(repoPath, "git config user.name Test");
	run(repoPath, "git commit -q --allow-empty -m base");
	const baseHash = run(repoPath, "git rev-parse HEAD").trim();
	run(repoPath, `git update-ref refs/remotes/origin/main ${baseHash}`);
	run(repoPath, "git checkout -q -b feature");

	// Bulk-create commits with a single fast-import instead of one process per commit.
	let stream = "";
	for (let i = 1; i <= commitCount; i++) {
		const message = `commit ${i}\n`;
		stream += `commit refs/heads/feature\n`;
		stream += `committer Test <test@test.com> ${1700000000 + i} +0000\n`;
		stream += `data ${Buffer.byteLength(message)}\n${message}`;
		if (i === 1) stream += `from refs/heads/feature^0\n`;
		stream += "\n";
	}
	execSync("git fast-import --quiet", { cwd: repoPath, input: stream });
	run(repoPath, "git reset -q --hard feature");
	return repoPath;
}

beforeAll(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("getStatus commit counting", () => {
	test("caps the commit list at the display limit but reports the true total", async () => {
		const commitCount = MAX_COMMIT_LIST_COUNT + 25;
		const repoPath = createBranchWithCommits("over-cap", commitCount);

		const status = await executeGitTask("getStatus", {
			worktreePath: repoPath,
			defaultBranch: "main",
			persistedWorktree: null,
		});

		expect(status.commits).toHaveLength(MAX_COMMIT_LIST_COUNT);
		expect(status.totalCommitCount).toBe(commitCount);
		expect(status.ahead).toBe(commitCount);
	}, 60_000);

	test("total matches the list length under the display limit", async () => {
		const repoPath = createBranchWithCommits("under-cap", 3);

		const status = await executeGitTask("getStatus", {
			worktreePath: repoPath,
			defaultBranch: "main",
			persistedWorktree: null,
		});

		expect(status.commits).toHaveLength(3);
		expect(status.totalCommitCount).toBe(3);
	}, 60_000);
});
