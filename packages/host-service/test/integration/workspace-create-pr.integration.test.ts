import { afterEach, describe, expect, test } from "bun:test";
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
import simpleGit from "simple-git";
import { workspaces } from "../../src/db/schema";
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
		let worktreePath: string | undefined;
		dispose = async () => {
			if (worktreePath) {
				await scenario.repo.git
					.raw(["worktree", "remove", "--force", worktreePath])
					.catch(() => {});
				rmSync(worktreePath, { recursive: true, force: true });
			}
			bare.dispose();
			await scenario.dispose();
		};

		await scenario.repo.commit("main lockfile", {
			"package-lock.json": "main lockfile\n",
		});
		await scenario.repo.git.addRemote("origin", bare.bareRepoPath);
		await scenario.repo.git.push("origin", "main", ["--set-upstream"]);
		await scenario.repo.git.checkoutBranch("feature/pr-lockfile", "main");
		prHeadOid = await scenario.repo.commit("PR lockfile", {
			"package-lock.json": "pr lockfile\n",
			"feature.txt": "from the PR\n",
		});
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

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.branch, expectedBranch))
			.get();
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
});
