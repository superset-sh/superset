import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

function createBaseRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	run(repoPath, "git init -q -b main");
	run(repoPath, "git config user.email test@test.com");
	run(repoPath, "git config user.name Test");
	return repoPath;
}

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

describe("getBranches", () => {
	test("lists branches, default branch, and worktree checkouts", async () => {
		const repoPath = createBaseRepo("branches");
		run(repoPath, "git commit -q --allow-empty -m base");
		run(repoPath, "git branch feature");
		run(repoPath, "git update-ref refs/remotes/origin/main HEAD");
		run(
			repoPath,
			"git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main",
		);
		const wtPath = join(TEST_DIR, "branches-wt");
		run(repoPath, `git worktree add -q ${wtPath} feature`);

		const result = await executeGitTask("getBranches", {
			worktreePath: repoPath,
			persistedWorktree: { branch: "main", baseBranch: "develop" },
		});

		expect(result.currentBranch).toBe("main");
		expect(result.defaultBranch).toBe("main");
		expect(result.local.map((b) => b.branch).sort()).toEqual([
			"feature",
			"main",
		]);
		expect(result.local.every((b) => b.lastCommitDate > 0)).toBe(true);
		expect(result.remote).toContain("main");
		expect(result.remote.some((name) => name.includes("HEAD"))).toBe(false);
		expect(result.checkedOutBranches).toEqual({ feature: wtPath });
		expect(result.worktreeBaseBranch).toBe("develop");
	}, 60_000);

	test("resolves base branch from git config over persisted metadata", async () => {
		const repoPath = createBaseRepo("branches-config");
		run(repoPath, "git commit -q --allow-empty -m base");
		run(repoPath, "git config branch.main.base release");

		const configured = await executeGitTask("getBranches", {
			worktreePath: repoPath,
			persistedWorktree: { branch: "main", baseBranch: "develop" },
		});
		expect(configured.worktreeBaseBranch).toBe("release");

		run(repoPath, "git config --unset branch.main.base");
		const mismatched = await executeGitTask("getBranches", {
			worktreePath: repoPath,
			persistedWorktree: { branch: "other", baseBranch: "develop" },
		});
		expect(mismatched.worktreeBaseBranch).toBeNull();
	}, 60_000);
});

describe("getAheadBehind", () => {
	test("counts commits relative to the remote base branch", async () => {
		const repoPath = createBranchWithCommits("ahead-behind", 2);
		const base = run(repoPath, "git rev-parse refs/remotes/origin/main").trim();
		const tree = run(repoPath, `git rev-parse "${base}^{tree}"`).trim();
		const upstream = run(
			repoPath,
			`git commit-tree -p ${base} -m upstream ${tree}`,
		).trim();
		run(repoPath, `git update-ref refs/remotes/origin/main ${upstream}`);

		const result = await executeGitTask("getAheadBehind", {
			repoPath,
			defaultBranch: "main",
		});

		expect(result).toEqual({ ahead: 2, behind: 1 });
	}, 60_000);

	test("returns zeros when the remote branch does not exist", async () => {
		const repoPath = createBranchWithCommits("ahead-behind-missing", 1);

		const result = await executeGitTask("getAheadBehind", {
			repoPath,
			defaultBranch: "does-not-exist",
		});

		expect(result).toEqual({ ahead: 0, behind: 0 });
	}, 60_000);
});

describe("getFileContents", () => {
	const TRUNCATED_MESSAGE = "[File content truncated - exceeds 2MB limit]";
	let repoPath: string;
	let secondCommit: string;

	beforeAll(() => {
		repoPath = createBaseRepo("file-contents");
		writeFileSync(join(repoPath, "file.txt"), "one\n");
		writeFileSync(join(repoPath, "file3.txt"), "gamma\n");
		run(repoPath, "git add .");
		run(repoPath, "git commit -q -m first");
		run(repoPath, "git update-ref refs/remotes/origin/main HEAD");
		writeFileSync(join(repoPath, "file.txt"), "two\n");
		writeFileSync(join(repoPath, "big.txt"), "a".repeat(2 * 1024 * 1024 + 1));
		run(repoPath, "git add .");
		run(repoPath, "git commit -q -m second");
		secondCommit = run(repoPath, "git rev-parse HEAD").trim();
		writeFileSync(join(repoPath, "file.txt"), "three\n");
		run(repoPath, "git add file.txt");
		run(repoPath, "git rm -q --cached file3.txt");
	});

	test("against-base compares origin base to HEAD", async () => {
		const result = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "file.txt",
			originalPath: "file.txt",
			category: "against-base",
			defaultBranch: "main",
		});
		expect(result).toEqual({ original: "one\n", modified: "two\n" });
	});

	test("committed compares a commit to its parent", async () => {
		const result = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "file.txt",
			originalPath: "file.txt",
			category: "committed",
			commitHash: secondCommit,
		});
		expect(result).toEqual({ original: "one\n", modified: "two\n" });
	});

	test("staged compares HEAD to the index", async () => {
		const result = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "file.txt",
			originalPath: "file.txt",
			category: "staged",
		});
		expect(result).toEqual({ original: "two\n", modified: "three\n" });
	});

	test("original prefers the index and falls back to HEAD", async () => {
		const staged = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "file.txt",
			originalPath: "file.txt",
			category: "original",
		});
		expect(staged).toEqual({ original: null, modified: "three\n" });

		const headOnly = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "file3.txt",
			originalPath: "file3.txt",
			category: "original",
		});
		expect(headOnly).toEqual({ original: "gamma\n", modified: null });
	});

	test("missing paths resolve to nulls", async () => {
		const result = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "nope.txt",
			originalPath: "nope.txt",
			category: "staged",
		});
		expect(result).toEqual({ original: null, modified: null });
	});

	test("blobs over the size cap are replaced with a truncation notice", async () => {
		const result = await executeGitTask("getFileContents", {
			worktreePath: repoPath,
			filePath: "big.txt",
			originalPath: "big.txt",
			category: "staged",
		});
		expect(result).toEqual({
			original: TRUNCATED_MESSAGE,
			modified: TRUNCATED_MESSAGE,
		});
	});
});
