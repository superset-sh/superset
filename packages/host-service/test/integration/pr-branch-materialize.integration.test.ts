import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { materializePrBranch } from "../../src/trpc/router/workspace-creation/utils/pr-branch-materialize";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

interface BareRemoteFixture {
	bareRepoPath: string;
	dispose: () => void;
}

async function createBareRemote(): Promise<BareRemoteFixture> {
	const bareRepoPath = realpathSync(
		mkdtempSync(join(tmpdir(), "host-service-pr-branch-bare-")),
	);
	await simpleGit().init(["--bare", "--initial-branch=main", bareRepoPath]);
	return {
		bareRepoPath,
		dispose: () => rmSync(bareRepoPath, { recursive: true, force: true }),
	};
}

async function createPrScenario(prNumber: number): Promise<{
	local: GitFixture;
	bare: BareRemoteFixture;
	prHeadOid: string;
	dispose: () => void;
}> {
	const local = await createGitFixture();
	const bare = await createBareRemote();

	await local.commit("main lockfile", {
		"package-lock.json": "main lockfile\n",
	});
	await local.git.addRemote("origin", bare.bareRepoPath);
	await local.git.push("origin", "main", ["--set-upstream"]);

	await local.git.checkoutBranch("feature/pr-lockfile", "main");
	const prHeadOid = await local.commit("PR lockfile", {
		"package-lock.json": "pr lockfile\n",
		"feature.txt": "from the PR\n",
	});
	await local.git.raw([
		"push",
		"origin",
		`${prHeadOid}:refs/pull/${prNumber}/head`,
	]);
	await local.git.checkout("main");
	await local.git.deleteLocalBranch("feature/pr-lockfile", true);

	return {
		local,
		bare,
		prHeadOid,
		dispose: () => {
			local.dispose();
			bare.dispose();
		},
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

describe("materializePrBranch (real git)", () => {
	let scenario: Awaited<ReturnType<typeof createPrScenario>>;

	beforeEach(async () => {
		scenario = await createPrScenario(5252);
	});

	afterEach(() => {
		scenario?.dispose();
	});

	test("materialize-first worktree creation survives hooks that dirty tracked files during checkout", async () => {
		installDirtyPostCheckoutHook(scenario.local.repoPath);

		const materialized = await materializePrBranch({
			git: scenario.local.git,
			branch: "contributor/feature-pr-lockfile",
			remoteName: "origin",
			pr: {
				number: 5252,
				headRefName: "feature/pr-lockfile",
				headRefOid: scenario.prHeadOid,
				isCrossRepository: true,
			},
		});
		expect(materialized.sourceKind).toBe("synthetic-pr-ref");

		const oldFlowPath = realpathSync(
			mkdtempSync(join(tmpdir(), "host-service-old-pr-worktree-")),
		);
		rmSync(oldFlowPath, { recursive: true, force: true });
		try {
			await scenario.local.git.raw([
				"worktree",
				"add",
				"--detach",
				oldFlowPath,
				"main",
			]);
			const oldCheckoutError = await simpleGit(oldFlowPath)
				.raw(["checkout", "contributor/feature-pr-lockfile"])
				.then(() => null)
				.catch((err: Error) => err);
			expect(oldCheckoutError).toBeInstanceOf(Error);
			expect(oldCheckoutError?.message).toMatch(
				/would be overwritten by checkout/,
			);
		} finally {
			await scenario.local.git
				.raw(["worktree", "remove", "--force", oldFlowPath])
				.catch(() => {});
			rmSync(oldFlowPath, { recursive: true, force: true });
		}

		const worktreePath = realpathSync(
			mkdtempSync(join(tmpdir(), "host-service-new-pr-worktree-")),
		);
		rmSync(worktreePath, { recursive: true, force: true });
		try {
			await scenario.local.git.raw([
				"worktree",
				"add",
				worktreePath,
				"contributor/feature-pr-lockfile",
			]);

			const worktreeGit: SimpleGit = simpleGit(worktreePath);
			const head = (await worktreeGit.raw(["rev-parse", "HEAD"])).trim();
			expect(head).toBe(scenario.prHeadOid);

			const branch = (
				await worktreeGit.raw(["symbolic-ref", "--short", "HEAD"])
			).trim();
			expect(branch).toBe("contributor/feature-pr-lockfile");

			const lockStatus = (
				await worktreeGit.raw([
					"status",
					"--porcelain",
					"--",
					"package-lock.json",
				])
			).trim();
			expect(lockStatus).toContain("package-lock.json");
		} finally {
			await scenario.local.git
				.raw(["worktree", "remove", "--force", worktreePath])
				.catch(() => {});
			rmSync(worktreePath, { recursive: true, force: true });
		}
	});
});
