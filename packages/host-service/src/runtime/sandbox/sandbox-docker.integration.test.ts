/**
 * Docker-gated integration test for the sandbox container lifecycle.
 * Exercises the REAL code path (git bootstrap → container ensure → exec →
 * destroy) against a local docker daemon. Skipped unless
 * SUPERSET_DOCKER_TESTS=1 — CI runs it in a linux job with docker.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	destroyWorkspaceSandbox,
	ensureContainer,
} from "./container-manager.ts";
import { resolveSandboxSettings } from "./docker-args.ts";
import { getDockerCliEnv, inspectContainer } from "./docker-cli.ts";
import { getSandboxContainerName, getWorkspaceSandboxPaths } from "./paths.ts";

const execFileAsync = promisify(execFile);
const DOCKER_TESTS = process.env.SUPERSET_DOCKER_TESTS === "1";

const TEST_IMAGE = "superset-sandbox-inttest:local";
const WORKSPACE_ID = "inttest-sandbox-ws";

async function run(
	command: string,
	args: string[],
	options?: { cwd?: string; input?: string },
): Promise<string> {
	const { stdout } = await execFileAsync(command, args, {
		cwd: options?.cwd,
		env: { ...process.env, ...getDockerCliEnv() },
		timeout: 5 * 60_000,
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout;
}

async function dockerExec(container: string, script: string): Promise<string> {
	return run("docker", ["exec", container, "bash", "-lc", script]);
}

describe.skipIf(!DOCKER_TESTS)("sandbox docker integration", () => {
	let fixtureRoot: string;
	let repoPath: string;
	let worktreePath: string;
	let savedHomeDir: string | undefined;
	const containerName = getSandboxContainerName(
		WORKSPACE_ID,
		"inttest-feature",
	);

	beforeAll(async () => {
		fixtureRoot = mkdtempSync(join(tmpdir(), "superset-sandbox-int-"));
		savedHomeDir = process.env.SUPERSET_HOME_DIR;
		process.env.SUPERSET_HOME_DIR = join(fixtureRoot, "superset-home");

		// Minimal image satisfying the sandbox contract (bash + git).
		// Debian keeps bash as /bin/bash; alpine would need a symlink.
		const dockerfilePath = join(fixtureRoot, "Dockerfile.inttest");
		await Bun.write(
			dockerfilePath,
			"FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*\n",
		);
		await run("docker", [
			"build",
			"-t",
			TEST_IMAGE,
			"-f",
			dockerfilePath,
			fixtureRoot,
		]);

		// Fixture: main repo + worktree, the shape Superset creates.
		repoPath = join(fixtureRoot, "repo");
		worktreePath = join(fixtureRoot, "wt");
		await run("git", ["init", "-q", repoPath]);
		const gitC = (...args: string[]) =>
			run("git", [
				"-C",
				repoPath,
				"-c",
				"user.email=t@t",
				"-c",
				"user.name=t",
				...args,
			]);
		await gitC("commit", "-q", "--allow-empty", "-m", "init");
		await run("git", [
			"-C",
			repoPath,
			"worktree",
			"add",
			"-q",
			worktreePath,
			"-b",
			"feature",
		]);
		await Bun.write(join(worktreePath, "file.txt"), "hello\n");
		await run("git", ["-C", worktreePath, "add", "file.txt"]);
		await run("git", [
			"-C",
			worktreePath,
			"-c",
			"user.email=t@t",
			"-c",
			"user.name=t",
			"commit",
			"-q",
			"-m",
			"one",
		]);
	}, 10 * 60_000);

	afterAll(async () => {
		await destroyWorkspaceSandbox(WORKSPACE_ID).catch(() => {});
		if (savedHomeDir === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = savedHomeDir;
		rmSync(fixtureRoot, { recursive: true, force: true });
	});

	test(
		"ensure → isolated git → destroy round-trip",
		async () => {
			// agentConfig off: the test must not mount the real ~/.claude.
			const settings = resolveSandboxSettings({
				image: TEST_IMAGE,
				agentConfig: false,
				ports: [38472],
			});
			await ensureContainer({
				workspaceId: WORKSPACE_ID,
				worktreePath,
				repoPath,
				branch: "feature",
				nameSlug: "inttest-feature",
				settings,
			});

			const inspection = await inspectContainer(containerName);
			expect(inspection.exists).toBe(true);
			expect(inspection.running).toBe(true);

			// Declared port published on loopback with the same number.
			const portMapping = await run("docker", ["port", containerName]);
			expect(portMapping).toContain("38472/tcp -> 127.0.0.1:38472");

			// Idempotent re-ensure.
			await ensureContainer({
				workspaceId: WORKSPACE_ID,
				worktreePath,
				repoPath,
				branch: "feature",
				nameSlug: "inttest-feature",
				settings,
			});

			// The per-workspace CLI token is mounted read-only at /sandbox/host.
			const tokenInContainer = await dockerExec(
				containerName,
				"cat /sandbox/host/token",
			);
			expect(tokenInContainer.trim().length).toBeGreaterThan(0);
			await expect(
				dockerExec(containerName, "echo x > /sandbox/host/token"),
			).rejects.toThrow();

			// In-container git resolves the isolated git dir via the mask.
			const gitDir = await dockerExec(
				containerName,
				`cd ${worktreePath} && git rev-parse --git-dir`,
			);
			expect(gitDir.trim()).toBe("/sandbox/git");

			const status = await dockerExec(
				containerName,
				`cd ${worktreePath} && git status --porcelain`,
			);
			expect(status.trim()).toBe("");

			// The mask is read-only and hides the real pointer.
			const maskContent = await dockerExec(
				containerName,
				`cat ${worktreePath}/.git`,
			);
			expect(maskContent).toContain("gitdir: /sandbox/git");
			await expect(
				dockerExec(containerName, `echo x > ${worktreePath}/.git`),
			).rejects.toThrow();

			// In-container commit stays sandbox-local.
			await dockerExec(
				containerName,
				`cd ${worktreePath} && echo changed >> file.txt && git add file.txt && git -c user.email=a@a -c user.name=agent commit -q -m in-container`,
			);
			const hostLog = await run("git", [
				"-C",
				worktreePath,
				"log",
				"--oneline",
			]);
			expect(hostLog).not.toContain("in-container");
			const hostStatus = await run("git", [
				"-C",
				worktreePath,
				"status",
				"--porcelain",
			]);
			expect(hostStatus).toContain("M file.txt");

			// Destroy removes container and host-side state.
			await destroyWorkspaceSandbox(WORKSPACE_ID);
			const afterDestroy = await inspectContainer(containerName);
			expect(afterDestroy.exists).toBe(false);
			expect(existsSync(getWorkspaceSandboxPaths(WORKSPACE_ID).stateDir)).toBe(
				false,
			);
		},
		10 * 60_000,
	);
});
