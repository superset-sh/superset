import { describe, expect, mock, test } from "bun:test";
import type { GitClient } from "../shared/types";
import {
	getPrCheckoutRecoveryKind,
	getSyntheticPrHeadRef,
	recoverPrCheckoutAfterGhFailure,
} from "./pr-checkout-recovery";

const EXPECTED_HEAD_OID = "c4ecea7dec8c6d09cf54fe0ad2f9edb8a24fd45a";

function createMockGit(fetchHeadOid = EXPECTED_HEAD_OID) {
	const raw = mock(async (args: string[]) => {
		if (args.includes("rev-parse")) {
			return `${fetchHeadOid}\n`;
		}
		return "";
	});
	return {
		git: { raw } as unknown as GitClient,
		raw,
	};
}

describe("getPrCheckoutRecoveryKind", () => {
	test("recovers missing PR head branch via the synthetic PR ref", () => {
		expect(
			getPrCheckoutRecoveryKind(
				new Error(
					"Command failed: gh pr checkout 3711 --branch debug-pty-termination --force\nfatal: couldn't find remote ref refs/heads/debug-pty-termination\nfailed to run git: exit status 128",
				),
			),
		).toBe("synthetic-pr-ref");
	});

	test("recovers deleted or inaccessible fork via the synthetic PR ref", () => {
		expect(
			getPrCheckoutRecoveryKind(
				new Error("fatal: could not read from remote repository"),
			),
		).toBe("synthetic-pr-ref");
		expect(
			getPrCheckoutRecoveryKind(new Error("remote: Repository not found")),
		).toBe("synthetic-pr-ref");
	});

	test("recovers gh tracking failures via FETCH_HEAD", () => {
		expect(
			getPrCheckoutRecoveryKind(
				new Error("fatal: 'origin/user/feature' is not a branch"),
			),
		).toBe("fetch-head");
	});

	test("does not match unrelated 'is not a branch' errors", () => {
		// Plain ref expressions and pathspec failures both use the same phrase
		// but are unrelated to gh's tracking-ref failure. Falling through to
		// the fetch-head path here would consume a stale FETCH_HEAD.
		expect(
			getPrCheckoutRecoveryKind(new Error("fatal: 'HEAD~5' is not a branch")),
		).toBeNull();
		expect(
			getPrCheckoutRecoveryKind(
				new Error("error: pathspec 'foo' is not a branch"),
			),
		).toBeNull();
	});

	test("does not recover auth or PR lookup failures", () => {
		expect(
			getPrCheckoutRecoveryKind(new Error("not logged in to GitHub")),
		).toBeNull();
		expect(
			getPrCheckoutRecoveryKind(
				new Error("could not find any pull requests matching 99999"),
			),
		).toBeNull();
	});
});

describe("getSyntheticPrHeadRef", () => {
	test("builds the GitHub PR head ref", () => {
		expect(getSyntheticPrHeadRef(3711)).toBe("refs/pull/3711/head");
	});
});

describe("recoverPrCheckoutAfterGhFailure", () => {
	test("fetches and verifies refs/pull/N/head before checking out missing head branches", async () => {
		const { git, raw } = createMockGit();
		const result = await recoverPrCheckoutAfterGhFailure({
			git,
			worktreePath: "/tmp/worktree",
			branch: "debug-pty-termination",
			prNumber: 3711,
			remoteName: "origin",
			expectedHeadOid: EXPECTED_HEAD_OID,
			error: new Error(
				"fatal: couldn't find remote ref refs/heads/debug-pty-termination",
			),
		});

		expect(result.recovered).toBe(true);
		expect(raw).toHaveBeenNthCalledWith(1, [
			"-C",
			"/tmp/worktree",
			"fetch",
			"--no-tags",
			"--quiet",
			"origin",
			"refs/pull/3711/head",
		]);
		expect(raw).toHaveBeenNthCalledWith(2, [
			"-C",
			"/tmp/worktree",
			"rev-parse",
			"--verify",
			"FETCH_HEAD^{commit}",
		]);
		expect(raw).toHaveBeenNthCalledWith(3, [
			"-C",
			"/tmp/worktree",
			"checkout",
			"-B",
			"debug-pty-termination",
			"--no-track",
			"FETCH_HEAD",
		]);
	});

	test("uses configured base remote when fetching synthetic PR refs", async () => {
		const { git, raw } = createMockGit();
		await recoverPrCheckoutAfterGhFailure({
			git,
			worktreePath: "/tmp/worktree",
			branch: "debug-pty-termination",
			prNumber: 3711,
			remoteName: "upstream",
			expectedHeadOid: EXPECTED_HEAD_OID,
			error: new Error(
				"fatal: couldn't find remote ref refs/heads/debug-pty-termination",
			),
		});

		expect(raw).toHaveBeenNthCalledWith(1, [
			"-C",
			"/tmp/worktree",
			"fetch",
			"--no-tags",
			"--quiet",
			"upstream",
			"refs/pull/3711/head",
		]);
	});

	test("uses verified FETCH_HEAD directly for gh tracking failures", async () => {
		const { git, raw } = createMockGit();
		const result = await recoverPrCheckoutAfterGhFailure({
			git,
			worktreePath: "/tmp/worktree",
			branch: "user/feature",
			prNumber: 42,
			remoteName: "origin",
			expectedHeadOid: EXPECTED_HEAD_OID,
			error: new Error("fatal: 'origin/user/feature' is not a branch"),
		});

		expect(result.recovered).toBe(true);
		expect(raw).toHaveBeenCalledTimes(2);
		expect(raw).toHaveBeenNthCalledWith(1, [
			"-C",
			"/tmp/worktree",
			"rev-parse",
			"--verify",
			"FETCH_HEAD^{commit}",
		]);
		expect(raw).toHaveBeenNthCalledWith(2, [
			"-C",
			"/tmp/worktree",
			"checkout",
			"-B",
			"user/feature",
			"--no-track",
			"FETCH_HEAD",
		]);
	});

	test("does not checkout when fetched PR ref does not match GitHub headRefOid", async () => {
		const { git, raw } = createMockGit(
			"1111111111111111111111111111111111111111",
		);

		await expect(
			recoverPrCheckoutAfterGhFailure({
				git,
				worktreePath: "/tmp/worktree",
				branch: "debug-pty-termination",
				prNumber: 3711,
				remoteName: "origin",
				expectedHeadOid: EXPECTED_HEAD_OID,
				error: new Error(
					"fatal: couldn't find remote ref refs/heads/debug-pty-termination",
				),
			}),
		).rejects.toThrow("did not match GitHub headRefOid");

		expect(raw).toHaveBeenCalledTimes(2);
		expect(raw).not.toHaveBeenCalledWith([
			"-C",
			"/tmp/worktree",
			"checkout",
			"-B",
			"debug-pty-termination",
			"--no-track",
			"FETCH_HEAD",
		]);
	});

	test("returns false for unrecoverable errors", async () => {
		const { git, raw } = createMockGit();
		const result = await recoverPrCheckoutAfterGhFailure({
			git,
			worktreePath: "/tmp/worktree",
			branch: "feature",
			prNumber: 42,
			remoteName: "origin",
			expectedHeadOid: EXPECTED_HEAD_OID,
			error: new Error("not logged in to GitHub"),
		});

		expect(result).toEqual({ recovered: false });
		expect(raw).not.toHaveBeenCalled();
	});
});
