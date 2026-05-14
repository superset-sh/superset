import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { cloudFlows, cloudOk } from "../helpers/cloud-fakes";
import {
	createBasicScenario,
	createFeatureWorktreeScenario,
	createProjectScenario,
} from "../helpers/scenarios";

describe("workspace.create + workspace.delete integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("create() adds a worktree, calls cloud, and persists workspace row", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "new ws",
			branch: "feature/new",
		});

		expect(result?.workspace?.branch).toBe("feature/new");

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get();
		expect(persisted?.branch).toBe("feature/new");
		expect(persisted?.worktreePath).toBeTruthy();
		// Path scheme is `~/.superset/worktrees/<projectId>/<branch>` —
		// pin the suffix rather than the absolute path so the test isn't
		// HOME-dependent.
		expect(persisted?.worktreePath).toMatch(/feature\/new$/);
		expect(existsSync(persisted?.worktreePath ?? "")).toBe(true);
	});

	test("create() adopts an existing worktree at a non-canonical path instead of failing on `git worktree add`", async () => {
		// Regress: when the user typed a branch that already has a worktree
		// somewhere outside `~/.superset/worktrees/<projectId>/<branch>`,
		// `workspaces.create` used to call `git worktree add` and crash with
		// `fatal: '<branch>' is already used by worktree at ...`. Adopt the
		// existing path instead.
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const branch = "new-workspace-9";
		const nonCanonicalPath = join(
			scenario.repo.repoPath,
			".worktrees",
			"glorious-ground",
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			branch,
			nonCanonicalPath,
		]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "adopted",
			branch,
		});

		expect(result?.workspace?.branch).toBe(branch);
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get();
		expect(persisted?.worktreePath).toBe(nonCanonicalPath);
		expect(existsSync(nonCanonicalPath)).toBe(true);
	});

	test("create() adopts a worktree created by another tool (e.g. `.watt-worktrees/`) instead of bubbling git's `is already used by worktree` fatal", async () => {
		// Regress: when another tool already ran `git worktree add` for the
		// branch, `workspaces.create` surfaced git's raw `'<branch>' is
		// already used by worktree at ...` fatal instead of adopting.
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const branch = "Roshvan/mcp-1013-trust-wattdata-xyz";
		const externalToolPath = join(
			scenario.repo.repoPath,
			".watt-worktrees",
			branch,
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			branch,
			externalToolPath,
		]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "adopted-from-watt",
			branch,
		});

		expect(result?.workspace?.branch).toBe(branch);
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get();
		expect(persisted?.worktreePath).toBe(externalToolPath);
		expect(existsSync(externalToolPath)).toBe(true);
	});

	test("create() with explicit worktreePath reads the current branch from git when the UI branch label is stale", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const staleBranch = "smoke-ui-stale-original";
		const actualBranch = "smoke-ui-stale-actual";
		const explicitPath = join(
			scenario.repo.repoPath,
			".worktrees",
			"smoke-ui-stale-original",
		);
		await scenario.repo.git.raw([
			"worktree",
			"add",
			"-b",
			staleBranch,
			explicitPath,
		]);
		await scenario.repo.git.raw([
			"-C",
			explicitPath,
			"branch",
			"-m",
			actualBranch,
		]);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: staleBranch,
			branch: staleBranch,
			worktreePath: explicitPath,
		});

		expect(result?.workspace?.branch).toBe(actualBranch);
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get();
		expect(persisted?.worktreePath).toBe(explicitPath);
		expect(persisted?.branch).toBe(actualBranch);
		expect(existsSync(explicitPath)).toBe(true);
		const pushAutoSetupRemote = (
			await scenario.repo.git.raw([
				"-C",
				explicitPath,
				"config",
				"--local",
				"--get",
				"push.autoSetupRemote",
			])
		).trim();
		expect(pushAutoSetupRemote).toBe("true");
	});

	test("create() prunes a stale worktree (rm-ed dir) before adding a new one", async () => {
		// Regress: when a worktree's directory was deleted without
		// `git worktree remove`, git still lists it (prunable) and claims
		// the branch. `workspaces.create` used to either adopt the missing
		// path or fail on `git worktree add`. It should now prune first
		// and check the branch out at the canonical path.
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const branch = "stale-feature";
		const stalePath = join(
			scenario.repo.repoPath,
			".worktrees",
			"stale-feature",
		);
		await scenario.repo.git.raw(["worktree", "add", "-b", branch, stalePath]);
		// Simulate the user `rm -rf`-ing the worktree without git's blessing.
		rmSync(stalePath, { recursive: true, force: true });

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "fresh",
			branch,
		});

		expect(result?.workspace?.branch).toBe(branch);
		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result?.workspace?.id ?? ""))
			.get();
		// Should land at the canonical path, not the missing one.
		expect(persisted?.worktreePath).not.toBe(stalePath);
		expect(persisted?.worktreePath).toMatch(/stale-feature$/);
		expect(existsSync(persisted?.worktreePath ?? "")).toBe(true);
	});

	test("create() rolls back the worktree if cloud v2Workspace.create fails", async () => {
		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: {
					"host.ensure.mutate": cloudOk.hostEnsure(),
					"v2Workspace.create.mutate": () => {
						throw new Error("cloud-down");
					},
				},
			},
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "ws",
				branch: "feature/rollback",
			}),
		).rejects.toThrow(/cloud-down/);

		// New worktree scheme is `~/.superset/worktrees/<projectId>/<branch>`.
		// Rollback should leave nothing behind in the workspaces table either.
		const rows = scenario.host.db.select().from(workspaces).all();
		expect(rows).toHaveLength(0);
	});

	test("delete() rejects deleting a main workspace by path equality", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspace.delete.mutate({ id: scenario.workspaceId }),
		).rejects.toThrow(/Main workspaces cannot be deleted/i);
	});

	test("delete() removes the worktree and the local row on success", async () => {
		const scenario = await createFeatureWorktreeScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceDeleteOk() },
		});
		dispose = scenario.dispose;

		const result = await scenario.host.trpc.workspace.delete.mutate({
			id: scenario.featureWorkspaceId,
		});
		expect(result).toEqual({ success: true });

		expect(existsSync(scenario.worktreePath)).toBe(false);
		const rows = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, scenario.featureWorkspaceId))
			.all();
		expect(rows).toHaveLength(0);
		expect(
			scenario.host.apiCalls.some(
				(c) => c.path === "v2Workspace.delete.mutate",
			),
		).toBe(true);
	});

	test("delete() requires authentication", async () => {
		const scenario = await createBasicScenario();
		dispose = scenario.dispose;

		await expect(
			scenario.host.unauthenticatedTrpc.workspace.delete.mutate({
				id: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
