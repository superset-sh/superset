import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server, type ServerOptions } from "@superset/pty-daemon";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaceCloudDeletes, workspaces } from "../../src/db/schema";
import { disposeDaemonClient } from "../../src/terminal/daemon-client-singleton";
import {
	initTerminalBaseEnv,
	resetTerminalBaseEnvForTests,
} from "../../src/terminal/env";
import { __resetSessionsForTesting } from "../../src/terminal/terminal";
import { __setAccountShellForTesting } from "../../src/terminal/user-shell";
import { cloudFlows, cloudOk } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import {
	createBasicScenario,
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedProject, seedWorkspace } from "../helpers/seed";

describe("workspaceCleanup.destroy integration", () => {
	let scenario: FeatureWorktreeScenario;
	let teardownServer: Server | null = null;
	let teardownTmp: string | null = null;
	let previousPtyDaemonSocket: string | undefined;
	let previousSupersetHomeDir: string | undefined;

	beforeEach(async () => {
		previousPtyDaemonSocket = process.env.SUPERSET_PTY_DAEMON_SOCKET;
		previousSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
	});

	afterEach(async () => {
		__resetSessionsForTesting();
		await disposeDaemonClient();
		resetTerminalBaseEnvForTests();
		__setAccountShellForTesting(undefined);
		restoreEnv("SUPERSET_PTY_DAEMON_SOCKET", previousPtyDaemonSocket);
		restoreEnv("SUPERSET_HOME_DIR", previousSupersetHomeDir);
		if (teardownServer) {
			await teardownServer.close().catch(() => {});
			teardownServer = null;
		}
		if (teardownTmp) {
			rmSync(teardownTmp, { recursive: true, force: true });
			teardownTmp = null;
		}
		await scenario.dispose();
	});

	test("rejects deleting a main workspace (worktreePath === repoPath)", async () => {
		// Use the main workspace (id), not the feature one — that's the row
		// whose worktreePath equals the project's repoPath.
		await expect(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: scenario.workspaceId,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("rejects deleting a workspace flagged as main by local type", async () => {
		// Different scenario: the local row says type=main even though the
		// path doesn't match repoPath. Build a fresh host for it.
		await scenario.dispose();
		const host = await createTestHost();
		const repo = await createGitFixture();
		const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
		const worktreePath = join(repo.repoPath, ".worktrees", "feature-cleanup");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/cleanup",
			worktreePath,
		]);
		const { id: workspaceId } = seedWorkspace(host, {
			projectId,
			worktreePath,
			branch: "feature/cleanup",
			type: "main",
		});

		try {
			await expect(
				host.trpc.workspaceCleanup.destroy.mutate({ workspaceId }),
			).rejects.toBeInstanceOf(TRPCClientError);
		} finally {
			await host.dispose();
			repo.dispose();
		}
	});

	test("blocks on dirty worktree with CONFLICT (no force)", async () => {
		writeFileSync(join(scenario.worktreePath, "dirty.txt"), "uncommitted");

		await expect(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
		).rejects.toThrow(/uncommitted changes/i);

		// Cloud delete should NOT have been called — we're past the dirty check.
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(false);
	});

	test("force=true skips preflight and runs cloud delete + db cleanup", async () => {
		writeFileSync(join(scenario.worktreePath, "dirty.txt"), "uncommitted");

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);

		const remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(true);
	});

	test("force=true removes a locked worktree whose directory still exists", async () => {
		await scenario.repo.git.raw(["worktree", "lock", scenario.worktreePath]);

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(result.branchDeleted).toBe(true);
		expect(result.warnings).toEqual([]);
		expect(existsSync(scenario.worktreePath)).toBe(false);

		const worktreeList = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktreeList).not.toContain(scenario.worktreePath);
		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).not.toContain(scenario.branch);
	});

	test("teardown failure blocks local and cloud delete until force retry", async () => {
		teardownTmp = mkdtempSync(join(tmpdir(), "workspace-cleanup-teardown-"));
		const socketPath = join(teardownTmp, "pty-daemon.sock");
		const teardownWrites: string[] = [];
		teardownServer = new Server({
			socketPath,
			daemonVersion: "0.0.0-workspace-cleanup-test",
			spawnPty: createFailingTeardownPtySpawner(teardownWrites),
		});
		await teardownServer.listen();

		process.env.SUPERSET_PTY_DAEMON_SOCKET = socketPath;
		process.env.SUPERSET_HOME_DIR = teardownTmp;
		__setAccountShellForTesting("/bin/bash");
		initTerminalBaseEnv({
			HOME: process.env.HOME ?? teardownTmp,
			LANG: "en_US.UTF-8",
			PATH: process.env.PATH ?? "/usr/bin:/bin",
			SHELL: "/bin/bash",
		});

		const scriptDir = join(scenario.worktreePath, ".superset");
		mkdirSync(scriptDir, { recursive: true });
		writeFileSync(
			join(scriptDir, "teardown.sh"),
			"#!/usr/bin/env bash\necho teardown failed\nexit 42\n",
			{ mode: 0o755 },
		);
		await scenario.repo.git.raw([
			"-C",
			scenario.worktreePath,
			"add",
			".superset/teardown.sh",
		]);
		await scenario.repo.git.raw([
			"-C",
			scenario.worktreePath,
			"commit",
			"-m",
			"add failing teardown",
		]);

		await expect(
			scenario.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: scenario.featureWorkspaceId,
			}),
		).rejects.toThrow(/Teardown script failed/i);
		expect(teardownWrites).toHaveLength(1);
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(false);
		expect(existsSync(scenario.worktreePath)).toBe(true);
		let remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(1);

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			force: true,
		});
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(existsSync(scenario.worktreePath)).toBe(false);
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(true);

		remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);
	});

	test("clean worktree destroys without force and removes db row", async () => {
		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(true);

		const remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);
	});

	test("deleteBranch=true also removes the branch after worktree teardown", async () => {
		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
		expect(result.branchDeleted).toBe(true);

		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).not.toContain(scenario.branch);
	});

	test("missing worktree is removed and can still delete the branch", async () => {
		rmSync(scenario.worktreePath, { recursive: true, force: true });

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(result.branchDeleted).toBe(true);

		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).not.toContain(scenario.branch);
	});

	test("missing worktree cleanup does not prune unrelated stale worktree metadata", async () => {
		const otherBranch = "feature/other-missing";
		const otherWorktreePath = join(
			scenario.repo.repoPath,
			".worktrees",
			"feature-other-missing",
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			otherBranch,
			otherWorktreePath,
		]);
		seedWorkspace(scenario.host, {
			projectId: scenario.projectId,
			worktreePath: otherWorktreePath,
			branch: otherBranch,
		});
		rmSync(scenario.worktreePath, { recursive: true, force: true });
		rmSync(otherWorktreePath, { recursive: true, force: true });

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(result.worktreeRemoved).toBe(true);

		const worktreeList = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktreeList).not.toContain(scenario.worktreePath);
		expect(worktreeList).toContain(otherWorktreePath);
	});

	test("missing worktree that was locked is still removed without warnings", async () => {
		// A locked worktree whose dir was manually deleted is the scenario
		// that breaks the substring-based error matcher: git says
		// "fatal: cannot remove a locked working tree" and single `--force`
		// is not enough. `--force --force` plus the existsSync fallback
		// closes the loop so the user always gets a clean delete.
		await scenario.repo.git.raw(["worktree", "lock", scenario.worktreePath]);
		rmSync(scenario.worktreePath, { recursive: true, force: true });

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(result.branchDeleted).toBe(true);
		expect(result.warnings).toEqual([]);

		const worktreeList = await scenario.repo.git.raw([
			"worktree",
			"list",
			"--porcelain",
		]);
		expect(worktreeList).not.toContain(scenario.worktreePath);
		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).not.toContain(scenario.branch);
	});

	test("cloud delete failure still completes locally and tombstones the id", async () => {
		let cloudDeleteCalls = 0;
		scenario.host.setApi("v2Workspace.delete.mutate", () => {
			cloudDeleteCalls += 1;
			throw new Error("cloud delete unavailable");
		});

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(false);
		expect(result.worktreeRemoved).toBe(true);
		expect(
			result.warnings.some((w) => w.includes("Cloud delete deferred")),
		).toBe(true);
		expect(cloudDeleteCalls).toBe(1);
		expect(existsSync(scenario.worktreePath)).toBe(false);

		// Local row is gone — the local delete is the commit point.
		const remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);

		// The id is tombstoned for the reconciler to replay against the cloud.
		const tombstones = scenario.host.db
			.select()
			.from(workspaceCloudDeletes)
			.where(eq(workspaceCloudDeletes.id, scenario.featureWorkspaceId))
			.all();
		expect(tombstones).toHaveLength(1);
	});

	test("cloud delete failure does not block the opted-in branch delete", async () => {
		scenario.host.setApi("v2Workspace.delete.mutate", () => {
			throw new Error("cloud delete unavailable");
		});

		const result = await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
		expect(result.success).toBe(true);
		expect(result.cloudDeleted).toBe(false);
		expect(result.branchDeleted).toBe(true);
		expect(existsSync(scenario.worktreePath)).toBe(false);

		const branches = await scenario.repo.git.branchLocal();
		expect(branches.all).not.toContain(scenario.branch);

		const remaining = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(remaining).toHaveLength(0);
	});

	test("returns success when no local workspace row exists, still calls cloud delete", async () => {
		await scenario.dispose();
		const fresh = await createBasicScenario({
			hostOptions: {
				apiOverrides: {
					"v2Workspace.getFromHost.query": () => null,
					"v2Workspace.delete.mutate": cloudOk.workspaceDelete(),
				},
			},
		});
		try {
			const result = await fresh.host.trpc.workspaceCleanup.destroy.mutate({
				workspaceId: randomUUID(),
			});
			expect(result.success).toBe(true);
			expect(result.cloudDeleted).toBe(true);
		} finally {
			await fresh.dispose();
		}
	});
});

function createFailingTeardownPtySpawner(
	writes: string[],
): NonNullable<ServerOptions["spawnPty"]> {
	return ({ meta }) => {
		let dataCallback: ((data: Buffer) => void) | null = null;
		let exitCallback:
			| ((info: { code: number | null; signal: number | null }) => void)
			| null = null;

		queueMicrotask(() => {
			dataCallback?.(Buffer.from("\x1b]133;A\x07"));
		});

		return {
			pid: 42,
			meta,
			write(data) {
				writes.push(data.toString("utf8").trim());
				dataCallback?.(Buffer.from("teardown failed\n"));
				exitCallback?.({ code: 42, signal: null });
			},
			resize(cols, rows) {
				meta.cols = cols;
				meta.rows = rows;
			},
			kill(signal) {
				exitCallback?.({ code: null, signal: signal === "SIGKILL" ? 9 : 1 });
			},
			onData(cb) {
				dataCallback = cb;
			},
			onExit(cb) {
				exitCallback = cb;
			},
			getMasterFd() {
				return 0;
			},
		};
	};
}

function restoreEnv(name: string, previousValue: string | undefined): void {
	if (previousValue === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = previousValue;
}
