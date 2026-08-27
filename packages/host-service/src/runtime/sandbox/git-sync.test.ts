import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ensureSandboxGit } from "./git-bootstrap.ts";
import { exportSandboxRefs, syncSandboxCommits } from "./git-sync.ts";
import { getWorkspaceSandboxPaths } from "./paths.ts";

const execFileAsync = promisify(execFile);

const WORKSPACE_ID = "git-sync-test-ws";
const GIT_USER = ["-c", "user.email=t@t", "-c", "user.name=t"];

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", [
		"-C",
		cwd,
		...GIT_USER,
		...args,
	]);
	return stdout;
}

/** Commit through the isolated sandbox git dir, like in-container git does. */
async function sandboxGit(
	worktreePath: string,
	args: string[],
): Promise<string> {
	const { gitDir } = getWorkspaceSandboxPaths(WORKSPACE_ID);
	const { stdout } = await execFileAsync("git", [...GIT_USER, ...args], {
		env: { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: worktreePath },
		cwd: worktreePath,
	});
	return stdout;
}

describe("sandbox git sync", () => {
	let fixtureRoot: string;
	let repoPath: string;
	let worktreePath: string;
	let savedHomeDir: string | undefined;

	beforeEach(async () => {
		fixtureRoot = mkdtempSync(join(tmpdir(), "superset-git-sync-"));
		savedHomeDir = process.env.SUPERSET_HOME_DIR;
		process.env.SUPERSET_HOME_DIR = join(fixtureRoot, "superset-home");

		repoPath = join(fixtureRoot, "repo");
		worktreePath = join(fixtureRoot, "wt");
		await execFileAsync("git", ["init", "-q", repoPath]);
		await git(repoPath, ["commit", "-q", "--allow-empty", "-m", "init"]);
		await git(repoPath, [
			"worktree",
			"add",
			"-q",
			worktreePath,
			"-b",
			"feature",
		]);
		writeFileSync(join(worktreePath, "file.txt"), "hello\n");
		await git(worktreePath, ["add", "file.txt"]);
		await git(worktreePath, ["commit", "-q", "-m", "one"]);

		await ensureSandboxGit({
			workspaceId: WORKSPACE_ID,
			repoPath,
			branch: "feature",
			worktreePath,
		});
	});

	afterEach(() => {
		if (savedHomeDir === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = savedHomeDir;
		rmSync(fixtureRoot, { recursive: true, force: true });
	});

	test("fast-forwards the common case: agent edited + committed via the shared worktree", async () => {
		// Shared bind mount semantics: the edit is visible host-side (dirty
		// worktree) while the commit exists only in the sandbox git dir.
		writeFileSync(join(worktreePath, "file.txt"), "hello\nagent change\n");
		await sandboxGit(worktreePath, ["add", "file.txt"]);
		await sandboxGit(worktreePath, ["commit", "-q", "-m", "agent commit"]);

		expect(await git(worktreePath, ["status", "--porcelain"])).toContain(
			"M file.txt",
		);
		expect(await git(worktreePath, ["log", "--oneline"])).not.toContain(
			"agent commit",
		);

		const result = await syncSandboxCommits({
			repoPath,
			worktreePath,
			workspaceId: WORKSPACE_ID,
			branch: "feature",
		});
		expect(result.status).toBe("fast-forwarded");
		expect(await git(worktreePath, ["log", "--oneline"])).toContain(
			"agent commit",
		);
		expect((await git(worktreePath, ["status", "--porcelain"])).trim()).toBe(
			"",
		);

		// Idempotent re-sync.
		const again = await syncSandboxCommits({
			repoPath,
			worktreePath,
			workspaceId: WORKSPACE_ID,
			branch: "feature",
		});
		expect(again.status).toBe("up-to-date");
	});

	test("reports no sandbox history when the sandbox never committed", async () => {
		const result = await syncSandboxCommits({
			repoPath,
			worktreePath,
			workspaceId: WORKSPACE_ID,
			branch: "feature",
		});
		// Sandbox HEAD equals host HEAD after bootstrap.
		expect(result.status).toBe("up-to-date");

		const missing = await syncSandboxCommits({
			repoPath,
			worktreePath,
			workspaceId: "never-bootstrapped",
			branch: "feature",
		});
		expect(missing.status).toBe("no-sandbox-history");
	});

	test("divergent host history leaves the exported ref for manual merge", async () => {
		writeFileSync(join(worktreePath, "sandbox.txt"), "from sandbox\n");
		await sandboxGit(worktreePath, ["add", "sandbox.txt"]);
		await sandboxGit(worktreePath, ["commit", "-q", "-m", "sandbox side"]);
		// Independent host-side commit → histories diverge.
		writeFileSync(join(worktreePath, "host.txt"), "from host\n");
		await git(worktreePath, ["add", "host.txt"]);
		await git(worktreePath, ["commit", "-q", "-m", "host side"]);

		const result = await syncSandboxCommits({
			repoPath,
			worktreePath,
			workspaceId: WORKSPACE_ID,
			branch: "feature",
		});
		expect(result.status).toBe("diverged");
		if (result.status === "diverged") {
			const refSha = await git(repoPath, ["rev-parse", result.ref]);
			expect(refSha.trim().length).toBe(40);
		}
	});

	test("export-on-destroy preserves commits as refs/sandbox/<id>/*", async () => {
		writeFileSync(join(worktreePath, "file.txt"), "hello\npreserved\n");
		await sandboxGit(worktreePath, ["add", "file.txt"]);
		await sandboxGit(worktreePath, ["commit", "-q", "-m", "preserved commit"]);

		const result = await exportSandboxRefs({
			repoPath,
			workspaceId: WORKSPACE_ID,
		});
		expect(result.exported).toBe(true);
		const log = await git(repoPath, [
			"log",
			"--oneline",
			`refs/sandbox/${WORKSPACE_ID}/feature`,
		]);
		expect(log).toContain("preserved commit");
	});
});
