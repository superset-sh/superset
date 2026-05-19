import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { eq } from "drizzle-orm";
import simpleGit, { type SimpleGit } from "simple-git";
import { workspaces } from "../../src/db/schema";
import { safeResolveWorktreePath } from "../../src/trpc/router/workspace-creation/shared/worktree-paths";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

interface BareRemoteFixture {
	bareRepoPath: string;
	dispose: () => void;
}

async function createBareRemote(): Promise<BareRemoteFixture> {
	const bareRepoPath = realpathSync(
		mkdtempSync(join(tmpdir(), "host-service-workspace-pr-bare-")),
	);
	await simpleGit().init(["--bare", "--initial-branch=main", bareRepoPath]);
	return {
		bareRepoPath,
		dispose: () => rmSync(bareRepoPath, { recursive: true, force: true }),
	};
}

function installDirtyPostCheckoutHook(repoPath: string): void {
	const hookPath = join(repoPath, ".git", "hooks", "post-checkout");
	writeFileSync(
		hookPath,
		[
			"#!/bin/sh",
			"printf 'dirty lockfile from post-checkout hook\\n' > package-lock.json",
			"",
		].join("\n"),
	);
	chmodSync(hookPath, 0o755);
}

async function removeWorktree(git: SimpleGit, worktreePath: string) {
	await git
		.raw(["worktree", "remove", "--force", worktreePath])
		.catch(() => {});
	rmSync(worktreePath, { recursive: true, force: true });
}

function getWorkspaceRow(
	scenario: Awaited<ReturnType<typeof createProjectScenario>>,
	branch: string,
) {
	return scenario.host.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.branch, branch))
		.get();
}

describe("workspaces.create PR checkout integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("creates a PR worktree from the verified PR head without running gh pr checkout", async () => {
		const prNumber = 6060;
		const ghCalls: Array<{ args: string[]; cwd?: string }> = [];
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: cloudFlows.workspaceCreateOk(),
				execGh: async (args, options?: unknown) => {
					ghCalls.push({
						args,
						cwd: (options as { cwd?: string } | undefined)?.cwd,
					});
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "PR with lockfile hook",
							headRefName: "feature/pr-lockfile",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "Contributor" },
							headRepository: { name: "hello-fork" },
							isCrossRepository: true,
							state: "OPEN",
						};
					}
					if (args[0] === "pr" && args[1] === "checkout") {
						throw new Error("workspaces.create must not run gh pr checkout");
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		const forkBare = await createBareRemote();
		let worktreePath: string | undefined;
		dispose = async () => {
			if (worktreePath) {
				await removeWorktree(scenario.repo.git, worktreePath);
			}
			forkBare.dispose();
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main lockfile", {
			"package-lock.json": "main lockfile\n",
		});
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.raw([
			"config",
			`url.${forkBare.bareRepoPath}.insteadOf`,
			"https://github.com/Contributor/hello-fork.git",
		]);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/pr-lockfile", "main");
		prHeadOid = await scenario.repo.commit("PR lockfile", {
			"package-lock.json": "pr lockfile\n",
			"feature.txt": "from the PR\n",
		});
		await scenario.repo.git.raw([
			"push",
			forkBare.bareRepoPath,
			`${prHeadOid}:refs/heads/feature/pr-lockfile`,
		]);
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/pr-lockfile", true);
		installDirtyPostCheckoutHook(scenario.repo.repoPath);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "PR workspace",
			pr: prNumber,
		});

		const expectedBranch = "contributor/feature/pr-lockfile";
		expect(result.workspace.branch).toBe(expectedBranch);
		expect(
			ghCalls.some((call) => call.args[0] === "pr" && call.args[1] === "view"),
		).toBe(true);
		expect(
			ghCalls.some(
				(call) => call.args[0] === "pr" && call.args[1] === "checkout",
			),
		).toBe(false);

		const persisted = getWorkspaceRow(scenario, expectedBranch);
		worktreePath = persisted?.worktreePath;
		expect(worktreePath).toBeTruthy();
		if (!worktreePath) {
			throw new Error("expected PR workspace path to be persisted");
		}
		expect(existsSync(worktreePath)).toBe(true);

		const worktreeGit = simpleGit(worktreePath);
		const head = (await worktreeGit.raw(["rev-parse", "HEAD"])).trim();
		expect(head).toBe(prHeadOid);
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					"branch.contributor/feature/pr-lockfile.pushRemote",
				])
			).trim(),
		).toBe("superset-pr-6060");
		expect(
			(
				await scenario.repo.git.raw(["config", "remote.superset-pr-6060.push"])
			).trim(),
		).toBe("HEAD:refs/heads/feature/pr-lockfile");
		const dryRunOutput = await worktreeGit.raw(["push", "--dry-run"]);
		expect(typeof dryRunOutput).toBe("string");
		expect(result.warnings).toEqual([]);

		const lockStatus = (
			await worktreeGit.raw([
				"status",
				"--porcelain",
				"--",
				"package-lock.json",
			])
		).trim();
		expect(lockStatus).toContain("package-lock.json");
	});

	test("normalizes fork push config when adopting an existing matching local PR branch", async () => {
		const prNumber = 6061;
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: cloudFlows.workspaceCreateOk(),
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Adopt local fork branch",
							headRefName: "feature/adopt-local",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "Contributor" },
							headRepository: { name: "hello-fork" },
							isCrossRepository: true,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		const forkBare = await createBareRemote();
		let worktreePath: string | undefined;
		dispose = async () => {
			if (worktreePath) {
				await removeWorktree(scenario.repo.git, worktreePath);
			}
			forkBare.dispose();
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.raw([
			"config",
			`url.${forkBare.bareRepoPath}.insteadOf`,
			"https://github.com/Contributor/hello-fork.git",
		]);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch(
			"contributor/feature/adopt-local",
			"main",
		);
		prHeadOid = await scenario.repo.commit("local branch at PR head", {
			"feature.txt": "from adopted branch\n",
		});
		await scenario.repo.git.raw([
			"push",
			forkBare.bareRepoPath,
			`${prHeadOid}:refs/heads/feature/adopt-local`,
		]);
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "Adopted PR workspace",
			pr: prNumber,
		});

		const expectedBranch = "contributor/feature/adopt-local";
		expect(result.workspace.branch).toBe(expectedBranch);
		worktreePath = getWorkspaceRow(scenario, expectedBranch)?.worktreePath;
		expect(worktreePath).toBeTruthy();
		if (!worktreePath) throw new Error("expected adopted worktree path");
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					`branch.${expectedBranch}.remote`,
				])
			).trim(),
		).toBe(`superset-pr-${prNumber}`);
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					`branch.${expectedBranch}.pushRemote`,
				])
			).trim(),
		).toBe(`superset-pr-${prNumber}`);
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					`remote.superset-pr-${prNumber}.push`,
				])
			).trim(),
		).toBe("HEAD:refs/heads/feature/adopt-local");
		expect(await simpleGit(worktreePath).raw(["push", "--dry-run"])).toEqual(
			expect.any(String),
		);
	});

	test("removes a materialized PR branch when registration fails after worktree add", async () => {
		const prNumber = 6062;
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: {
					"host.ensure.mutate": () => ({ machineId: "test-machine-1" }),
					"v2Workspace.create.mutate": (input: unknown) => {
						const i = input as {
							id?: string;
							projectId: string;
							branch: string;
							name: string;
							type?: "main";
						};
						if (i.type === "main") {
							return {
								id: i.id ?? randomUUID(),
								projectId: i.projectId,
								branch: i.branch,
								name: i.name,
								type: "main" as const,
							};
						}
						throw new Error("cloud workspace create failed");
					},
				},
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Rollback PR",
							headRefName: "feature/rollback",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "Contributor" },
							headRepository: { name: "hello-fork" },
							isCrossRepository: true,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		const expectedBranch = "contributor/feature/rollback";
		const expectedWorktreePath = safeResolveWorktreePath(
			scenario.projectId,
			expectedBranch,
		);
		dispose = async () => {
			await removeWorktree(scenario.repo.git, expectedWorktreePath);
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/rollback", "main");
		prHeadOid = await scenario.repo.commit("rollback PR head", {
			"feature.txt": "rollback\n",
		});
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/rollback", true);

		const error = await scenario.host.trpc.workspaces.create
			.mutate({
				projectId: scenario.projectId,
				name: "Rollback PR workspace",
				pr: prNumber,
			})
			.catch((err: unknown) => err);

		expect(error).toBeInstanceOf(TRPCClientError);
		expect(String((error as Error).message)).toContain(
			"cloud workspace create failed",
		);
		expect(getWorkspaceRow(scenario, expectedBranch)).toBeUndefined();
		expect(existsSync(expectedWorktreePath)).toBe(false);
		const branchStillExists = await scenario.repo.git
			.raw(["rev-parse", "--verify", `refs/heads/${expectedBranch}`])
			.then(
				() => true,
				() => false,
			);
		expect(branchStillExists).toBe(false);
	});

	test("reports PR head verification failures as internal errors", async () => {
		const prNumber = 7070;
		const staleHeadOid = "1111111111111111111111111111111111111111";
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: cloudFlows.workspaceCreateOk(),
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Stale PR metadata",
							headRefName: "feature/stale",
							headRefOid: staleHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "Contributor" },
							headRepository: { name: "hello-fork" },
							isCrossRepository: true,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		dispose = async () => {
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/stale", "main");
		prHeadOid = await scenario.repo.commit("actual PR head", {
			"feature.txt": "actual\n",
		});
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/stale", true);

		const error = await scenario.host.trpc.workspaces.create
			.mutate({
				projectId: scenario.projectId,
				name: "Stale PR workspace",
				pr: prNumber,
			})
			.catch((err: unknown) => err);

		expect(error).toBeInstanceOf(TRPCClientError);
		expect((error as { data?: { code?: string } }).data?.code).toBe(
			"INTERNAL_SERVER_ERROR",
		);
		expect(error).toHaveProperty("message");
		expect(String((error as Error).message)).toContain(
			"did not match GitHub headRefOid",
		);
	});

	test("same-repo PR tracks the real head branch without synthetic fallback", async () => {
		const prNumber = 8080;
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: cloudFlows.workspaceCreateOk(),
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Same repo PR",
							headRefName: "feature/same-repo",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "octocat" },
							headRepository: { name: "hello" },
							isCrossRepository: false,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		let worktreePath: string | undefined;
		dispose = async () => {
			if (worktreePath) {
				await removeWorktree(scenario.repo.git, worktreePath);
			}
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/same-repo", "main");
		prHeadOid = await scenario.repo.commit("same repo PR head", {
			"feature.txt": "same repo\n",
		});
		await scenario.repo.git.push("origin", "feature/same-repo");
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/same-repo", true);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "Same repo PR workspace",
			pr: prNumber,
		});

		worktreePath = getWorkspaceRow(scenario, "feature/same-repo")?.worktreePath;
		expect(worktreePath).toBeTruthy();
		if (!worktreePath) throw new Error("expected worktree path");
		expect(result.workspace.branch).toBe("feature/same-repo");
		expect(result.warnings).toEqual([]);
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					"branch.feature/same-repo.remote",
				])
			).trim(),
		).toBe("origin");
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					"branch.feature/same-repo.merge",
				])
			).trim(),
		).toBe("refs/heads/feature/same-repo");
		expect(
			(await simpleGit(worktreePath).raw(["rev-parse", "HEAD"])).trim(),
		).toBe(prHeadOid);
	});

	test("same-repo PR falls back to synthetic ref with a user-visible warning when the head branch is gone", async () => {
		const prNumber = 8081;
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: cloudFlows.workspaceCreateOk(),
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Deleted head branch PR",
							headRefName: "feature/deleted-head",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "octocat" },
							headRepository: { name: "hello" },
							isCrossRepository: false,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		let worktreePath: string | undefined;
		dispose = async () => {
			if (worktreePath) {
				await removeWorktree(scenario.repo.git, worktreePath);
			}
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/deleted-head", "main");
		prHeadOid = await scenario.repo.commit("deleted head PR", {
			"feature.txt": "deleted\n",
		});
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/deleted-head", true);

		const result = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "Deleted branch PR workspace",
			pr: prNumber,
		});

		worktreePath = getWorkspaceRow(
			scenario,
			"feature/deleted-head",
		)?.worktreePath;
		expect(worktreePath).toBeTruthy();
		if (!worktreePath) throw new Error("expected worktree path");
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("was unavailable from origin");
		expect(
			(
				await scenario.repo.git.raw([
					"config",
					"branch.feature/deleted-head.merge",
				])
			).trim(),
		).toBe(`refs/pull/${prNumber}/head`);
		expect(
			(await simpleGit(worktreePath).raw(["rev-parse", "HEAD"])).trim(),
		).toBe(prHeadOid);
	});

	test("rejects an existing local branch at the wrong commit without creating a workspace", async () => {
		const prNumber = 9090;
		let prHeadOid = "";

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: cloudFlows.workspaceCreateOk(),
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Conflicting local branch",
							headRefName: "feature/conflict",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "Contributor" },
							headRepository: { name: "hello-fork" },
							isCrossRepository: true,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		dispose = async () => {
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/conflict", "main");
		prHeadOid = await scenario.repo.commit("actual PR head", {
			"feature.txt": "actual\n",
		});
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/conflict", true);
		await scenario.repo.git.checkoutBranch(
			"contributor/feature/conflict",
			"main",
		);
		await scenario.repo.commit("wrong local branch head", {
			"wrong.txt": "wrong\n",
		});
		await scenario.repo.git.checkout("main");

		const error = await scenario.host.trpc.workspaces.create
			.mutate({
				projectId: scenario.projectId,
				name: "Conflict PR workspace",
				pr: prNumber,
			})
			.catch((err: unknown) => err);

		expect(error).toBeInstanceOf(TRPCClientError);
		expect((error as { data?: { code?: string } }).data?.code).toBe("CONFLICT");
		expect(getWorkspaceRow(scenario, "contributor/feature/conflict")).toBe(
			undefined,
		);
	});

	test("serializes concurrent creates for the same PR and reuses the first workspace", async () => {
		const prNumber = 9191;
		let prHeadOid = "";
		const cloudRows = new Map<
			string,
			{
				id: string;
				projectId: string;
				branch: string;
				name: string;
				type: "worktree";
			}
		>();

		const scenario = await createProjectScenario({
			hostOptions: {
				apiOverrides: {
					"host.ensure.mutate": () => ({ machineId: "m1" }),
					"v2Workspace.create.mutate": (input: unknown) => {
						const i = input as {
							id?: string;
							projectId: string;
							branch: string;
							name: string;
						};
						const row = {
							id: i.id ?? randomUUID(),
							projectId: i.projectId,
							branch: i.branch,
							name: i.name,
							type: "worktree" as const,
						};
						cloudRows.set(row.id, row);
						return row;
					},
					"v2Workspace.getFromHost.query": (input: unknown) => {
						const i = input as { id: string };
						return cloudRows.get(i.id) ?? null;
					},
				},
				execGh: async (args) => {
					if (args[0] === "pr" && args[1] === "view") {
						return {
							number: prNumber,
							url: `https://github.com/octocat/hello/pull/${prNumber}`,
							title: "Concurrent PR",
							headRefName: "feature/concurrent",
							headRefOid: prHeadOid,
							baseRefName: "main",
							headRepositoryOwner: { login: "Contributor" },
							headRepository: { name: "hello-fork" },
							isCrossRepository: true,
							state: "OPEN",
						};
					}
					return {};
				},
			},
		});
		const bare = await createBareRemote();
		const worktreePaths = new Set<string>();
		dispose = async () => {
			for (const worktreePath of worktreePaths) {
				await removeWorktree(scenario.repo.git, worktreePath);
			}
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main", { "README.md": "main\n" });
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/concurrent", "main");
		prHeadOid = await scenario.repo.commit("concurrent PR head", {
			"feature.txt": "concurrent\n",
		});
		await scenario.repo.git.raw([
			"push",
			"origin",
			`${prHeadOid}:refs/pull/${prNumber}/head`,
		]);
		await scenario.repo.git.checkout("main");
		await scenario.repo.git.deleteLocalBranch("feature/concurrent", true);

		const [first, second] = await Promise.all([
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "Concurrent PR workspace",
				pr: prNumber,
			}),
			scenario.host.trpc.workspaces.create.mutate({
				projectId: scenario.projectId,
				name: "Concurrent PR workspace",
				pr: prNumber,
			}),
		]);

		expect(first.workspace.id).toBe(second.workspace.id);
		expect([first.alreadyExists, second.alreadyExists].sort()).toEqual([
			false,
			true,
		]);
		const row = getWorkspaceRow(scenario, "contributor/feature/concurrent");
		expect(row).toBeTruthy();
		if (!row) throw new Error("expected concurrent workspace row");
		worktreePaths.add(row.worktreePath);
		expect(existsSync(row.worktreePath)).toBe(true);
		expect(
			(await simpleGit(row.worktreePath).raw(["rev-parse", "HEAD"])).trim(),
		).toBe(prHeadOid);
		expect(
			scenario.host.apiCalls.filter(
				(call) =>
					call.path === "v2Workspace.create.mutate" &&
					(call.input as { branch?: string }).branch ===
						"contributor/feature/concurrent",
			),
		).toHaveLength(1);
	});
});
