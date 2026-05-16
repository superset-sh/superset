import { describe, expect, mock, test } from "bun:test";
import type { GitClient } from "../shared/types";
import { materializePrBranch } from "./pr-branch-materialize";

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
			startPoint: "refs/remotes/upstream/feature/x",
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
			"refs/remotes/upstream/feature/x",
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

	test("cross-repo PR fetches the synthetic PR ref and configures it as the merge ref", async () => {
		const { git, raw } = createMockGit();

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
			createdBranch: true,
			sourceKind: "synthetic-pr-ref",
			startPoint: "FETCH_HEAD",
			trackingRemote: "origin",
			trackingMergeRef: "refs/pull/456/head",
		});
		expect(raw).toHaveBeenNthCalledWith(1, [
			"fetch",
			"--no-tags",
			"--quiet",
			"origin",
			"refs/pull/456/head",
		]);
		expect(raw).toHaveBeenNthCalledWith(4, [
			"branch",
			"--no-track",
			"--",
			"alice/feature/x",
			"FETCH_HEAD",
		]);
		expect(raw).toHaveBeenNthCalledWith(6, [
			"config",
			"branch.alice/feature/x.merge",
			"refs/pull/456/head",
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
});
