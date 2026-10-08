import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows } from "../helpers/cloud-fakes";
import {
	createFeatureWorktreeScenario,
	type FeatureWorktreeScenario,
} from "../helpers/scenarios";

describe("workspaces.restore integration", () => {
	let scenario: FeatureWorktreeScenario;

	beforeEach(async () => {
		scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
	});

	afterEach(async () => {
		await scenario.dispose();
	});

	function archivedAt(): number | null | undefined {
		return scenario.host.db
			.select({ archivedAt: workspaces.archivedAt })
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.get()?.archivedAt;
	}

	const REPO_LOCATION_VARS = [
		"GIT_DIR",
		"GIT_WORK_TREE",
		"GIT_INDEX_FILE",
		"GIT_COMMON_DIR",
		"GIT_OBJECT_DIRECTORY",
		"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	];

	function git(cwd: string, ...args: string[]) {
		const env = { ...process.env };
		for (const name of REPO_LOCATION_VARS) delete env[name];
		execFileSync("git", args, { cwd, env, stdio: "ignore" });
	}

	test("re-creates the worktree on the kept branch and un-archives the row", async () => {
		writeFileSync(join(scenario.worktreePath, "work.txt"), "committed work");
		git(scenario.worktreePath, "add", "work.txt");
		git(scenario.worktreePath, "commit", "-m", "work");
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});
		expect(existsSync(scenario.worktreePath)).toBe(false);
		expect(archivedAt()).toBeTruthy();

		const { workspace } = await scenario.host.trpc.workspaces.restore.mutate({
			workspaceId: scenario.featureWorkspaceId,
		});

		expect(workspace.id).toBe(scenario.featureWorkspaceId);
		expect(archivedAt()).toBeNull();
		expect(existsSync(join(scenario.worktreePath, "work.txt"))).toBe(true);
	});

	test("keeps the row archived when the branch is gone and no PR is linked", async () => {
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});

		const error = await scenario.host.trpc.workspaces.restore
			.mutate({ workspaceId: scenario.featureWorkspaceId })
			.catch((err: unknown) => err);
		expect(error).toMatchObject({
			data: {
				i18nKey: "serverError.workspaces.restoreBranchMissing",
				i18nParams: { branch: scenario.branch, remote: "origin" },
			},
		});
		expect(archivedAt()).toBeTruthy();
		expect(existsSync(scenario.worktreePath)).toBe(false);
	});

	async function withRemote(run: (remotePath: string) => Promise<void>) {
		const remotePath = mkdtempSync(join(tmpdir(), "restore-remote-"));
		try {
			git(remotePath, "init", "--bare", "--quiet");
			await run(remotePath);
		} finally {
			rmSync(remotePath, { recursive: true, force: true });
		}
	}

	async function deleteWithBranch() {
		await scenario.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: scenario.featureWorkspaceId,
			deleteBranch: true,
		});
	}

	function restoreError() {
		return scenario.host.trpc.workspaces.restore
			.mutate({ workspaceId: scenario.featureWorkspaceId })
			.catch((err: unknown) => err);
	}

	test("fetches a branch that is only on the remote", async () => {
		await withRemote(async (remotePath) => {
			const cwd = scenario.worktreePath;
			writeFileSync(join(cwd, "work.txt"), "pushed work");
			git(cwd, "add", "work.txt");
			git(cwd, "commit", "-m", "work");
			git(cwd, "remote", "add", "origin", remotePath);
			git(cwd, "push", "--quiet", "origin", "HEAD");
			git(cwd, "update-ref", "-d", `refs/remotes/origin/${scenario.branch}`);
			await deleteWithBranch();

			await scenario.host.trpc.workspaces.restore.mutate({
				workspaceId: scenario.featureWorkspaceId,
			});

			expect(archivedAt()).toBeNull();
			expect(existsSync(join(cwd, "work.txt"))).toBe(true);
		});
	});

	test("reports a missing branch when the remote answers without it", async () => {
		await withRemote(async (remotePath) => {
			git(scenario.worktreePath, "remote", "add", "origin", remotePath);
			await deleteWithBranch();

			expect(await restoreError()).toMatchObject({
				data: { i18nKey: "serverError.workspaces.restoreBranchMissing" },
			});
			expect(archivedAt()).toBeTruthy();
		});
	});

	test("reports an unreachable remote instead of a missing branch", async () => {
		git(
			scenario.worktreePath,
			"remote",
			"add",
			"origin",
			join(tmpdir(), "restore-remote-that-does-not-exist"),
		);
		await deleteWithBranch();

		expect(await restoreError()).toMatchObject({
			data: {
				i18nKey: "serverError.workspaces.restoreFetchFailed",
				i18nParams: { branch: scenario.branch, remote: "origin" },
			},
		});
		expect(archivedAt()).toBeTruthy();
	});
});
