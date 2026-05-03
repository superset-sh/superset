import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import { recoverPrCheckoutAfterGhFailure } from "../../src/trpc/router/workspace-creation/utils/pr-checkout-recovery";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

/**
 * End-to-end exercise of `recoverPrCheckoutAfterGhFailure` against real
 * `git fetch` / `git checkout`. The unit tests use a mocked `git.raw`;
 * these tests run against an on-disk bare repo with a synthetic
 * `refs/pull/<N>/head` ref to verify the actual git plumbing works —
 * the most likely place for silent breakage when GitHub's wire format
 * or simple-git's behavior shifts.
 */

interface BareRemoteFixture {
	bareRepoPath: string;
	dispose: () => void;
	/** Push `refs/pull/<prNumber>/head` to the bare repo at `commitSha`. */
	publishSyntheticPrRef: (prNumber: number, commitSha: string) => Promise<void>;
}

async function createBareRemote(): Promise<BareRemoteFixture> {
	const bareRepoPath = realpathSync(
		mkdtempSync(join(tmpdir(), "host-service-test-bare-")),
	);
	await simpleGit().init(["--bare", "--initial-branch=main", bareRepoPath]);
	return {
		bareRepoPath,
		dispose: () => rmSync(bareRepoPath, { recursive: true, force: true }),
		publishSyntheticPrRef: async (prNumber, commitSha) => {
			await simpleGit().raw([
				"-C",
				bareRepoPath,
				"update-ref",
				`refs/pull/${prNumber}/head`,
				commitSha,
			]);
		},
	};
}

/**
 * Set up: `local` working repo with `origin` pointing at a bare remote that
 * already has a `refs/pull/<N>/head` ref but the named branch deleted.
 * This is the scenario the recovery code is designed for: PR was merged,
 * source branch was auto-deleted, but GitHub still keeps the head commit
 * accessible via the synthetic ref.
 */
async function createDeletedBranchScenario(prNumber: number): Promise<{
	local: GitFixture;
	bare: BareRemoteFixture;
	prHeadOid: string;
	worktreePath: string;
	worktreeGit: SimpleGit;
	dispose: () => void;
}> {
	const local = await createGitFixture();
	const bare = await createBareRemote();

	// Wire local → bare as `origin`. Push `main` so the bare repo has a
	// resolvable HEAD. Then create + push a PR commit on a separate
	// branch, capture its SHA, and *delete* the branch from the remote
	// while keeping the commit reachable through the synthetic PR ref.
	await local.git.addRemote("origin", bare.bareRepoPath);
	await local.git.push("origin", "main", ["--set-upstream"]);

	await local.git.checkoutBranch("feature/will-be-deleted", "main");
	const prHeadOid = await local.commit("PR head commit", {
		"feature.txt": "from the PR",
	});
	await local.git.push("origin", "feature/will-be-deleted");

	// Delete the named branch from the remote (simulates GitHub's
	// "delete branch on merge"). The commit is now only reachable via
	// the synthetic PR ref.
	await local.git.push("origin", undefined, [
		"--delete",
		"feature/will-be-deleted",
	]);
	await bare.publishSyntheticPrRef(prNumber, prHeadOid);

	// Switch back to main locally so the feature branch isn't checked out
	// anywhere when we add a worktree, and prune so the local fork doesn't
	// hold the only reference to the PR commit.
	await local.git.checkout("main");
	await local.git.deleteLocalBranch("feature/will-be-deleted", true);

	// Detached worktree where recovery will create the local branch —
	// mirrors what `checkout.ts` sets up before the recovery call.
	const worktreePath = realpathSync(
		mkdtempSync(join(tmpdir(), "host-service-test-worktree-")),
	);
	rmSync(worktreePath, { recursive: true, force: true });
	await local.git.raw(["worktree", "add", "--detach", worktreePath, "main"]);

	const worktreeGit = simpleGit(worktreePath);

	return {
		local,
		bare,
		prHeadOid,
		worktreePath,
		worktreeGit,
		dispose: () => {
			rmSync(worktreePath, { recursive: true, force: true });
			local.dispose();
			bare.dispose();
		},
	};
}

describe("recoverPrCheckoutAfterGhFailure (real git)", () => {
	let scenario: Awaited<ReturnType<typeof createDeletedBranchScenario>>;

	beforeEach(async () => {
		scenario = await createDeletedBranchScenario(4242);
	});

	afterEach(() => {
		scenario?.dispose();
	});

	test("synthetic-pr-ref recovery: fetches refs/pull/N/head and creates the local branch at the verified OID", async () => {
		const result = await recoverPrCheckoutAfterGhFailure({
			git: scenario.local.git,
			worktreePath: scenario.worktreePath,
			branch: "feature/will-be-deleted",
			prNumber: 4242,
			remoteName: "origin",
			expectedHeadOid: scenario.prHeadOid,
			error: new Error(
				"fatal: couldn't find remote ref refs/heads/feature/will-be-deleted",
			),
		});

		expect(result.recovered).toBe(true);
		if (!result.recovered) throw new Error("recovery should have succeeded");
		expect(result.warning).toContain("refs/pull/4242/head");

		// Branch was actually created and points at the PR head commit.
		const head = (await scenario.worktreeGit.raw(["rev-parse", "HEAD"])).trim();
		expect(head).toBe(scenario.prHeadOid);

		const branch = (
			await scenario.worktreeGit.raw(["symbolic-ref", "--short", "HEAD"])
		).trim();
		expect(branch).toBe("feature/will-be-deleted");

		// `--no-track` was honored — recovered branch has no upstream so
		// `git push` won't accidentally try to push to the deleted ref.
		const upstream = await scenario.worktreeGit
			.raw(["rev-parse", "--abbrev-ref", "feature/will-be-deleted@{u}"])
			.catch((err: Error) => err.message);
		expect(typeof upstream).toBe("string");
		expect(upstream as string).toMatch(/no upstream|no such ref|^@\{u\}$/i);
	});

	test("OID mismatch aborts recovery without checking out", async () => {
		const wrongOid = "0000000000000000000000000000000000000000";
		const mainOid = (
			await scenario.local.git.raw(["rev-parse", "main"])
		).trim();

		await expect(
			recoverPrCheckoutAfterGhFailure({
				git: scenario.local.git,
				worktreePath: scenario.worktreePath,
				branch: "feature/will-be-deleted",
				prNumber: 4242,
				remoteName: "origin",
				expectedHeadOid: wrongOid,
				error: new Error(
					"fatal: couldn't find remote ref refs/heads/feature/will-be-deleted",
				),
			}),
		).rejects.toThrow(/did not match GitHub headRefOid/);

		// Worktree HEAD must still point at main's commit — the detached
		// state from setup. Recovery aborted before `checkout -B` ran, so
		// no `feature/will-be-deleted` branch should exist either.
		const head = (await scenario.worktreeGit.raw(["rev-parse", "HEAD"])).trim();
		expect(head).toBe(mainOid);

		const branchExists = await scenario.worktreeGit
			.raw(["show-ref", "--verify", "refs/heads/feature/will-be-deleted"])
			.then(() => true)
			.catch(() => false);
		expect(branchExists).toBe(false);
	});

	test("fetch-head recovery: gh attached the ref but failed to set up tracking — checkout FETCH_HEAD as new branch", async () => {
		// Simulate the state gh leaves behind when --branch tracking fails:
		// FETCH_HEAD is set (from a prior fetch) but no local branch exists.
		// We pre-fetch the synthetic ref so FETCH_HEAD has a real SHA.
		await scenario.worktreeGit.raw([
			"fetch",
			"--no-tags",
			"--quiet",
			"origin",
			"refs/pull/4242/head",
		]);

		const result = await recoverPrCheckoutAfterGhFailure({
			git: scenario.worktreeGit,
			worktreePath: scenario.worktreePath,
			branch: "user/feature",
			prNumber: 4242,
			remoteName: "origin",
			expectedHeadOid: scenario.prHeadOid,
			error: new Error("fatal: 'origin/user/feature' is not a branch"),
		});

		expect(result.recovered).toBe(true);
		if (!result.recovered) throw new Error("recovery should have succeeded");

		const branch = (
			await scenario.worktreeGit.raw(["symbolic-ref", "--short", "HEAD"])
		).trim();
		expect(branch).toBe("user/feature");

		const head = (await scenario.worktreeGit.raw(["rev-parse", "HEAD"])).trim();
		expect(head).toBe(scenario.prHeadOid);
	});

	test("unrecoverable error returns recovered:false and leaves worktree untouched", async () => {
		const mainOid = (
			await scenario.local.git.raw(["rev-parse", "main"])
		).trim();

		const result = await recoverPrCheckoutAfterGhFailure({
			git: scenario.local.git,
			worktreePath: scenario.worktreePath,
			branch: "feature/will-be-deleted",
			prNumber: 4242,
			remoteName: "origin",
			expectedHeadOid: scenario.prHeadOid,
			error: new Error("not logged in to GitHub"),
		});

		expect(result.recovered).toBe(false);

		// Worktree still detached at main's commit; no recovery branch ref
		// was written.
		const head = (await scenario.worktreeGit.raw(["rev-parse", "HEAD"])).trim();
		expect(head).toBe(mainOid);

		const branchExists = await scenario.worktreeGit
			.raw(["show-ref", "--verify", "refs/heads/feature/will-be-deleted"])
			.then(() => true)
			.catch(() => false);
		expect(branchExists).toBe(false);
	});
});
