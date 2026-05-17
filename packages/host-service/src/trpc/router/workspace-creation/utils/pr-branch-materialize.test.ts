import { describe, expect, mock, test } from "bun:test";
import type { GitClient } from "../shared/types";
import {
	deleteMaterializedPrBranchIfSafe,
	getSyntheticPrFetchRef,
	materializePrBranch,
	normalizePrBranchTracking,
} from "./pr-branch-materialize";

const EXPECTED_HEAD_OID = "c4ecea7dec8c6d09cf54fe0ad2f9edb8a24fd45a";

function createMockGit() {
	const raw = mock(async (args: string[]) => {
		if (args[0] === "rev-parse") {
			const ref = args[2] ?? "";
			if (ref.startsWith("refs/heads/")) {
				throw new Error("branch does not exist");
			}
			return `${EXPECTED_HEAD_OID}\n`;
		}
		return "";
	});
	return {
		git: { raw } as unknown as GitClient,
		raw,
	};
}

describe("materializePrBranch", () => {
	test("same-repo PR fetches and tracks the source branch before creating the local branch", async () => {
		const { git, raw } = createMockGit();

		const result = await materializePrBranch({
			git,
			branch: "feature/x",
			remoteName: "upstream",
			pr: {
				number: 123,
				headRefName: "feature/x",
				headRefOid: EXPECTED_HEAD_OID,
				isCrossRepository: false,
			},
		});

		expect(result).toMatchObject({
			createdBranch: true,
			sourceKind: "head-branch",
			startPoint: EXPECTED_HEAD_OID,
			trackingRemote: "upstream",
			trackingMergeRef: "refs/heads/feature/x",
		});
		expect(raw).toHaveBeenNthCalledWith(1, [
			"fetch",
			"--no-tags",
			"--quiet",
			"upstream",
			"+refs/heads/feature/x:refs/remotes/upstream/feature/x",
		]);
		expect(raw).toHaveBeenNthCalledWith(4, [
			"branch",
			"--no-track",
			"--",
			"feature/x",
			EXPECTED_HEAD_OID,
		]);
		expect(raw).toHaveBeenNthCalledWith(5, [
			"config",
			"branch.feature/x.remote",
			"upstream",
		]);
		expect(raw).toHaveBeenNthCalledWith(6, [
			"config",
			"branch.feature/x.merge",
			"refs/heads/feature/x",
		]);
	});

	test("cross-repo PR configures fork push defaults from the synthetic PR ref", async () => {
		const { git, raw } = createMockGit();
		const pr = {
			number: 456,
			headRefName: "feature/x",
			headRefOid: EXPECTED_HEAD_OID,
			isCrossRepository: true,
			headRepositoryOwner: "alice",
			headRepositoryName: "fork",
		};
		const fetchRef = getSyntheticPrFetchRef(pr.number);

		const result = await materializePrBranch({
			git,
			branch: "alice/feature/x",
			remoteName: "origin",
			pr,
		});

		expect(result).toMatchObject({
			createdBranch: true,
			sourceKind: "synthetic-pr-ref",
			startPoint: EXPECTED_HEAD_OID,
			trackingRemote: "superset-pr-456",
			trackingMergeRef: "refs/heads/feature/x",
		});
		expect(raw).toHaveBeenNthCalledWith(1, [
			"fetch",
			"--no-tags",
			"--quiet",
			"origin",
			`+refs/pull/456/head:${fetchRef}`,
		]);
		expect(raw).toHaveBeenNthCalledWith(4, [
			"branch",
			"--no-track",
			"--",
			"alice/feature/x",
			EXPECTED_HEAD_OID,
		]);
		expect(raw).toHaveBeenNthCalledWith(6, [
			"remote",
			"add",
			"superset-pr-456",
			"https://github.com/alice/fork.git",
		]);
		expect(raw).toHaveBeenNthCalledWith(7, [
			"update-ref",
			"refs/remotes/superset-pr-456/feature/x",
			EXPECTED_HEAD_OID,
		]);
		expect(raw).toHaveBeenNthCalledWith(8, [
			"config",
			"branch.alice/feature/x.remote",
			"superset-pr-456",
		]);
		expect(raw).toHaveBeenNthCalledWith(9, [
			"config",
			"branch.alice/feature/x.merge",
			"refs/heads/feature/x",
		]);
		expect(raw).toHaveBeenNthCalledWith(10, [
			"config",
			"branch.alice/feature/x.pushRemote",
			"superset-pr-456",
		]);
		expect(raw).toHaveBeenNthCalledWith(11, [
			"config",
			"--replace-all",
			"remote.superset-pr-456.push",
			"HEAD:refs/heads/feature/x",
		]);
	});

	test("cross-repo PR warns when fork repository metadata is missing", async () => {
		const { git } = createMockGit();

		const result = await materializePrBranch({
			git,
			branch: "alice/feature/x",
			remoteName: "origin",
			pr: {
				number: 456,
				headRefName: "feature/x",
				headRefOid: EXPECTED_HEAD_OID,
				isCrossRepository: true,
			},
		});

		expect(result).toMatchObject({
			trackingRemote: "origin",
			trackingMergeRef: "refs/pull/456/head",
		});
		expect(result.warning).toContain("Plain git push may require");
	});

	test("normalizes fork push defaults for an existing matching branch", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				return `${EXPECTED_HEAD_OID}\n`;
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;
		const pr = {
			number: 456,
			headRefName: "feature/x",
			headRefOid: EXPECTED_HEAD_OID,
			isCrossRepository: true,
			headRepositoryOwner: "alice",
			headRepositoryName: "fork",
		};

		const result = await normalizePrBranchTracking({
			git,
			branch: "alice/feature/x",
			remoteName: "origin",
			pr,
		});

		expect(result).toMatchObject({
			createdBranch: false,
			sourceKind: "synthetic-pr-ref",
			startPoint: EXPECTED_HEAD_OID,
			trackingRemote: "superset-pr-456",
			trackingMergeRef: "refs/heads/feature/x",
		});
		expect(raw).not.toHaveBeenCalledWith([
			"branch",
			"--no-track",
			"--",
			"alice/feature/x",
			EXPECTED_HEAD_OID,
		]);
		expect(raw).toHaveBeenCalledWith([
			"config",
			"branch.alice/feature/x.pushRemote",
			"superset-pr-456",
		]);
		expect(raw).toHaveBeenCalledWith([
			"config",
			"--replace-all",
			"remote.superset-pr-456.push",
			"HEAD:refs/heads/feature/x",
		]);
	});

	test("deletes a materialized branch only when it still points at the verified PR head", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				return `${EXPECTED_HEAD_OID}\n`;
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;

		await expect(
			deleteMaterializedPrBranchIfSafe({
				git,
				branch: "alice/feature/x",
				expectedHeadOid: EXPECTED_HEAD_OID,
			}),
		).resolves.toBe(true);

		expect(raw).toHaveBeenNthCalledWith(2, [
			"branch",
			"-D",
			"--",
			"alice/feature/x",
		]);
	});

	test("does not delete a branch that moved away from the verified PR head", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				return "1111111111111111111111111111111111111111\n";
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;

		await expect(
			deleteMaterializedPrBranchIfSafe({
				git,
				branch: "alice/feature/x",
				expectedHeadOid: EXPECTED_HEAD_OID,
			}),
		).resolves.toBe(false);

		expect(raw).toHaveBeenCalledTimes(1);
		expect(raw).not.toHaveBeenCalledWith([
			"branch",
			"-D",
			"--",
			"alice/feature/x",
		]);
	});

	test("adopts an existing local branch that already points at the PR head", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				return `${EXPECTED_HEAD_OID}\n`;
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;

		const result = await materializePrBranch({
			git,
			branch: "feature/x",
			remoteName: "origin",
			pr: {
				number: 123,
				headRefName: "feature/x",
				headRefOid: EXPECTED_HEAD_OID,
				isCrossRepository: false,
			},
		});

		expect(result.createdBranch).toBe(false);
		expect(raw).not.toHaveBeenCalledWith([
			"branch",
			"--no-track",
			"--",
			"feature/x",
			"refs/remotes/origin/feature/x",
		]);
		expect(raw).toHaveBeenCalledWith([
			"config",
			"branch.feature/x.remote",
			"origin",
		]);
	});

	test("aborts before branch creation when the fetched ref does not match GitHub headRefOid", async () => {
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				return "1111111111111111111111111111111111111111\n";
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;

		await expect(
			materializePrBranch({
				git,
				branch: "feature/x",
				remoteName: "origin",
				pr: {
					number: 123,
					headRefName: "feature/x",
					headRefOid: EXPECTED_HEAD_OID,
					isCrossRepository: false,
				},
			}),
		).rejects.toThrow("did not match GitHub headRefOid");

		expect(raw).toHaveBeenCalledTimes(2);
		expect(raw).not.toHaveBeenCalledWith([
			"branch",
			"--no-track",
			"--",
			"feature/x",
			"refs/remotes/origin/feature/x",
		]);
	});

	test("adopts a matching branch created by a concurrent caller", async () => {
		let localBranchLookupCount = 0;
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				const ref = args[2] ?? "";
				if (ref === "refs/heads/feature/x^{commit}") {
					localBranchLookupCount += 1;
					if (localBranchLookupCount === 1) {
						throw new Error("branch does not exist before create");
					}
					return `${EXPECTED_HEAD_OID}\n`;
				}
				return `${EXPECTED_HEAD_OID}\n`;
			}
			if (args[0] === "branch" && args[1] === "--no-track") {
				throw new Error("branch was created concurrently");
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;

		const result = await materializePrBranch({
			git,
			branch: "feature/x",
			remoteName: "origin",
			pr: {
				number: 123,
				headRefName: "feature/x",
				headRefOid: EXPECTED_HEAD_OID,
				isCrossRepository: false,
			},
		});

		expect(result.createdBranch).toBe(false);
		expect(localBranchLookupCount).toBe(2);
		expect(raw).not.toHaveBeenCalledWith(["branch", "-D", "--", "feature/x"]);
	});

	test("surfaces rollback failure details after creating a branch", async () => {
		let localBranchLookupCount = 0;
		const raw = mock(async (args: string[]) => {
			if (args[0] === "rev-parse") {
				const ref = args[2] ?? "";
				if (ref === "refs/heads/feature/x^{commit}") {
					localBranchLookupCount += 1;
					if (localBranchLookupCount === 1) {
						throw new Error("branch does not exist before create");
					}
					return `${EXPECTED_HEAD_OID}\n`;
				}
				return `${EXPECTED_HEAD_OID}\n`;
			}
			if (args[0] === "config") {
				throw new Error("config failed");
			}
			if (args[0] === "branch" && args[1] === "-D") {
				throw new Error("cleanup denied");
			}
			return "";
		});
		const git = { raw } as unknown as GitClient;

		await expect(
			materializePrBranch({
				git,
				branch: "feature/x",
				remoteName: "origin",
				pr: {
					number: 123,
					headRefName: "feature/x",
					headRefOid: EXPECTED_HEAD_OID,
					isCrossRepository: false,
				},
			}),
		).rejects.toThrow(
			'Failed to materialize PR branch "feature/x": config failed. Failed to roll back created branch: cleanup denied',
		);

		expect(raw).toHaveBeenCalledWith(["branch", "-D", "--", "feature/x"]);
	});
});
