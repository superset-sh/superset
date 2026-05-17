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
import {
	deleteMaterializedPrBranchIfSafe,
	getSyntheticPrFetchRef,
	materializePrBranch,
} from "../../src/trpc/router/workspace-creation/utils/pr-branch-materialize";
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
		expect(materialized.startPoint).toBe(scenario.prHeadOid);

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

	test("synthetic PR fetch uses a stable ref while branches start from verified OIDs", async () => {
		const prMetadata = {
			number: 5252,
			headRefName: "feature/pr-lockfile",
			headRefOid: scenario.prHeadOid,
			isCrossRepository: true,
		};
		const stableRef = getSyntheticPrFetchRef(prMetadata.number);

		const first = await materializePrBranch({
			git: scenario.local.git,
			branch: "contributor/stable-pr-lockfile-one",
			remoteName: "origin",
			pr: prMetadata,
		});

		expect(stableRef).toBe("refs/superset/pr-fetch/5252/head");
		expect(first.startPoint).toBe(scenario.prHeadOid);
		expect(
			(
				await scenario.local.git.raw([
					"rev-parse",
					"--verify",
					"refs/heads/contributor/stable-pr-lockfile-one",
				])
			).trim(),
		).toBe(scenario.prHeadOid);
		expect(
			(
				await scenario.local.git.raw([
					"for-each-ref",
					"--format=%(refname)",
					"refs/superset/pr-fetch/5252",
				])
			)
				.trim()
				.split("\n")
				.filter(Boolean),
		).toEqual([stableRef]);

		await scenario.local.git.checkoutBranch(
			"feature/pr-lockfile-force-push",
			"main",
		);
		const nextPrHeadOid = await scenario.local.commit("force-pushed PR head", {
			"package-lock.json": "force pushed lockfile\n",
			"feature.txt": "from the updated PR\n",
		});
		await scenario.local.git.raw([
			"push",
			"--force",
			"origin",
			`${nextPrHeadOid}:refs/pull/5252/head`,
		]);
		await scenario.local.git.checkout("main");
		await scenario.local.git.deleteLocalBranch(
			"feature/pr-lockfile-force-push",
			true,
		);

		const second = await materializePrBranch({
			git: scenario.local.git,
			branch: "contributor/stable-pr-lockfile-two",
			remoteName: "origin",
			pr: {
				...prMetadata,
				headRefOid: nextPrHeadOid,
			},
		});

		expect(second.startPoint).toBe(nextPrHeadOid);
		expect(
			(
				await scenario.local.git.raw([
					"for-each-ref",
					"--format=%(refname)",
					"refs/superset/pr-fetch/5252",
				])
			)
				.trim()
				.split("\n")
				.filter(Boolean),
		).toEqual([stableRef]);
		expect(
			(
				await scenario.local.git.raw(["rev-parse", "--verify", stableRef])
			).trim(),
		).toBe(nextPrHeadOid);
		expect(
			(
				await scenario.local.git.raw([
					"rev-parse",
					"--verify",
					"refs/heads/contributor/stable-pr-lockfile-one",
				])
			).trim(),
		).toBe(scenario.prHeadOid);
		expect(
			(
				await scenario.local.git.raw([
					"rev-parse",
					"--verify",
					"refs/heads/contributor/stable-pr-lockfile-two",
				])
			).trim(),
		).toBe(nextPrHeadOid);
	});

	test("safe cleanup deletes only branches still at the verified PR head", async () => {
		await materializePrBranch({
			git: scenario.local.git,
			branch: "contributor/cleanup-pr-lockfile",
			remoteName: "origin",
			pr: {
				number: 5252,
				headRefName: "feature/pr-lockfile",
				headRefOid: scenario.prHeadOid,
				isCrossRepository: true,
			},
		});

		await expect(
			deleteMaterializedPrBranchIfSafe({
				git: scenario.local.git,
				branch: "contributor/cleanup-pr-lockfile",
				expectedHeadOid: "1111111111111111111111111111111111111111",
			}),
		).resolves.toBe(false);
		const branchHeadBeforeCleanup = (
			await scenario.local.git.raw([
				"rev-parse",
				"--verify",
				"refs/heads/contributor/cleanup-pr-lockfile",
			])
		).trim();
		expect(branchHeadBeforeCleanup).toBe(scenario.prHeadOid);

		await expect(
			deleteMaterializedPrBranchIfSafe({
				git: scenario.local.git,
				branch: "contributor/cleanup-pr-lockfile",
				expectedHeadOid: scenario.prHeadOid,
			}),
		).resolves.toBe(true);
		const branchStillExists = await scenario.local.git
			.raw([
				"rev-parse",
				"--verify",
				"refs/heads/contributor/cleanup-pr-lockfile",
			])
			.then(() => true)
			.catch(() => false);
		expect(branchStillExists).toBe(false);
	});
});
