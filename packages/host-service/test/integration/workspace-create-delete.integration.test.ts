import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
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

	test("create() with an existing remote-only branch checks out the remote tip, not a fresh fork from base (regress #4364)", async () => {
		// Regress: when the user picks an existing remote branch in the
		// workspace-create flow, `workspaces.create` must check it out into
		// a worktree that tracks the remote — not silently create a new
		// branch from the default base. The bug surfaced as "the worktree
		// for `claude/...-1UFT7` opens at main's HEAD" instead of the
		// remote branch's tip, leading the next push to open a *new* PR
		// instead of continuing the existing one.
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const bareRepoPath = realpathSync(
			mkdtempSync(join(tmpdir(), "host-service-test-bare-")),
		);
		try {
			await simpleGit().init(["--bare", "--initial-branch=main", bareRepoPath]);
			await scenario.repo.git.addRemote("origin", bareRepoPath);
			await scenario.repo.git.push("origin", "main", ["--set-upstream"]);

			// Mixed-case branch name copied from the linked issue. Push it
			// to origin, capture the tip, then delete it locally so only the
			// remote-tracking ref remains — this is the state the user is in
			// when they open the picker fresh on a different machine.
			const remoteBranch = "claude/auto-balance-logo-sizing-1UFT7";
			await scenario.repo.git.checkoutBranch(remoteBranch, "main");
			const remoteTipOid = await scenario.repo.commit("remote work", {
				"feature.txt": "remote feature work",
			});
			await scenario.repo.git.push("origin", remoteBranch);
			await scenario.repo.git.checkout("main");
			await scenario.repo.git.deleteLocalBranch(remoteBranch, true);
			await scenario.repo.git.fetch(["origin", "--prune"]);

			const result = await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "continue remote work",
				branch: remoteBranch,
			});

			expect(result?.workspace?.branch).toBe(remoteBranch);

			const persisted = scenario.host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, result?.workspace?.id ?? ""))
				.get();
			expect(persisted?.worktreePath).toBeTruthy();
			expect(existsSync(persisted?.worktreePath ?? "")).toBe(true);

			// The worktree's HEAD must equal the remote branch tip — not
			// main. If `workspaces.create` forked from main instead of
			// checking out the remote, this is what would catch it.
			const worktreeGit = simpleGit(persisted?.worktreePath ?? "");
			const worktreeHead = (
				await worktreeGit.raw(["rev-parse", "HEAD"])
			).trim();
			expect(worktreeHead).toBe(remoteTipOid);

			// And the local branch must track origin/<branch> so subsequent
			// pushes/pulls land on the same remote ref the picker pointed at.
			const upstream = (
				await worktreeGit.raw([
					"rev-parse",
					"--abbrev-ref",
					`${remoteBranch}@{upstream}`,
				])
			).trim();
			expect(upstream).toBe(`origin/${remoteBranch}`);
		} finally {
			rmSync(bareRepoPath, { recursive: true, force: true });
		}
	});

	test("create() with a remote branch typed in a different case checks out the existing remote branch (regress #4364)", async () => {
		// Regress: the user's exact #4364 scenario. The picker showed a
		// remote branch `claude/auto-balance-logo-sizing-1UFT7`, the user
		// pasted `claude/auto-balance-logo-sizing-1uft7` (case-folded by
		// the cmdk Mod+Enter pathway and/or the OS), and the server
		// silently created a *new* branch with the typed casing instead
		// of opening a worktree on the remote tip. The next push then
		// opened a brand-new PR.
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const bareRepoPath = realpathSync(
			mkdtempSync(join(tmpdir(), "host-service-test-bare-")),
		);
		try {
			await simpleGit().init(["--bare", "--initial-branch=main", bareRepoPath]);
			await scenario.repo.git.addRemote("origin", bareRepoPath);
			await scenario.repo.git.push("origin", "main", ["--set-upstream"]);

			const remoteBranch = "claude/auto-balance-logo-sizing-1UFT7";
			const typedBranch = "claude/auto-balance-logo-sizing-1uft7";
			await scenario.repo.git.checkoutBranch(remoteBranch, "main");
			const remoteTipOid = await scenario.repo.commit("remote work", {
				"feature.txt": "remote feature work",
			});
			await scenario.repo.git.push("origin", remoteBranch);
			await scenario.repo.git.checkout("main");
			await scenario.repo.git.deleteLocalBranch(remoteBranch, true);
			await scenario.repo.git.fetch(["origin", "--prune"]);

			const result = await scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "continue remote work",
				branch: typedBranch,
			});

			const persisted = scenario.host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, result?.workspace?.id ?? ""))
				.get();
			expect(persisted?.worktreePath).toBeTruthy();

			// The worktree should be on the remote branch tip, not a fresh
			// fork from main. If the server created a brand-new branch the
			// HEAD would equal main's commit.
			const worktreeGit = simpleGit(persisted?.worktreePath ?? "");
			const worktreeHead = (
				await worktreeGit.raw(["rev-parse", "HEAD"])
			).trim();
			expect(worktreeHead).toBe(remoteTipOid);
		} finally {
			rmSync(bareRepoPath, { recursive: true, force: true });
		}
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
