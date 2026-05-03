import type { GitClient } from "../shared/types";

export type PrCheckoutRecoveryKind = "fetch-head" | "synthetic-pr-ref";

export type PrCheckoutRecoveryResult =
	| { recovered: true; warning: string }
	| { recovered: false };

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function getPrCheckoutRecoveryKind(
	error: unknown,
): PrCheckoutRecoveryKind | null {
	const message = getErrorMessage(error).toLowerCase();

	// Match the precise gh-tracking-failure phrasing — `'<remote>/<branch>' is
	// not a branch`. Plain `"is not a branch"` matches unrelated git errors
	// (`'HEAD~5' is not a branch`, pathspec failures) that could let the
	// fetch-head fallback consume a stale FETCH_HEAD from a prior fetch. The
	// OID check still rejects mismatches, but only after a confusing path.
	if (/'[^']+\/[^']+' is not a branch/.test(message)) {
		return "fetch-head";
	}

	if (
		message.includes("couldn't find remote ref") ||
		message.includes("could not read from remote repository") ||
		message.includes("does not appear to be a git repository") ||
		message.includes("repository not found")
	) {
		return "synthetic-pr-ref";
	}

	return null;
}

export function getSyntheticPrHeadRef(prNumber: number): string {
	return `refs/pull/${prNumber}/head`;
}

async function revParseFetchHead({
	git,
	worktreePath,
}: {
	git: GitClient;
	worktreePath: string;
}): Promise<string> {
	const oid = await git.raw([
		"-C",
		worktreePath,
		"rev-parse",
		"--verify",
		"FETCH_HEAD^{commit}",
	]);
	return oid.trim();
}

async function assertFetchHeadMatchesExpectedOid({
	git,
	worktreePath,
	expectedHeadOid,
}: {
	git: GitClient;
	worktreePath: string;
	expectedHeadOid: string;
}): Promise<void> {
	const actualOid = await revParseFetchHead({ git, worktreePath });
	if (actualOid.toLowerCase() !== expectedHeadOid.trim().toLowerCase()) {
		throw new Error(
			`Fetched PR head ${actualOid} did not match GitHub headRefOid ${expectedHeadOid}`,
		);
	}
}

export async function fetchSyntheticPrHead({
	git,
	worktreePath,
	remoteName,
	prNumber,
}: {
	git: GitClient;
	worktreePath: string;
	remoteName: string;
	prNumber: number;
}): Promise<void> {
	await git.raw([
		"-C",
		worktreePath,
		"fetch",
		"--no-tags",
		"--quiet",
		remoteName,
		getSyntheticPrHeadRef(prNumber),
	]);
}

export async function checkoutFetchHeadAsBranch({
	git,
	worktreePath,
	branch,
}: {
	git: GitClient;
	worktreePath: string;
	branch: string;
}): Promise<void> {
	await git.raw([
		"-C",
		worktreePath,
		"checkout",
		"-B",
		branch,
		"--no-track",
		"FETCH_HEAD",
	]);
}

/**
 * Recover from `gh pr checkout` failures that still have a safe git fallback.
 *
 * GitHub Desktop uses the same broad strategy: resolve/fetch the PR ref first,
 * then create a local branch from that ref instead of depending only on a
 * named head branch. This is especially important after a PR has been merged
 * and the source branch or fork has been deleted.
 *
 * The two recovery paths diverge in how `FETCH_HEAD` gets populated:
 *   - `synthetic-pr-ref`: we run an explicit `git fetch refs/pull/N/head`,
 *     so `FETCH_HEAD` is freshly written by us before the OID check.
 *   - `fetch-head`: we rely on `gh pr checkout` having already fetched the
 *     PR head before it failed at the `--branch` tracking step, leaving a
 *     valid `FETCH_HEAD` behind. The OID check against `expectedHeadOid`
 *     is the safety net — a stale or unrelated `FETCH_HEAD` from a prior
 *     unrelated fetch will mismatch and abort the recovery.
 */
export async function recoverPrCheckoutAfterGhFailure({
	git,
	worktreePath,
	branch,
	prNumber,
	remoteName,
	expectedHeadOid,
	error,
}: {
	git: GitClient;
	worktreePath: string;
	branch: string;
	prNumber: number;
	remoteName: string;
	expectedHeadOid: string;
	error: unknown;
}): Promise<PrCheckoutRecoveryResult> {
	const kind = getPrCheckoutRecoveryKind(error);
	if (!kind) return { recovered: false };

	if (kind === "synthetic-pr-ref") {
		await fetchSyntheticPrHead({ git, worktreePath, remoteName, prNumber });
		await assertFetchHeadMatchesExpectedOid({
			git,
			worktreePath,
			expectedHeadOid,
		});
		await checkoutFetchHeadAsBranch({ git, worktreePath, branch });
		return {
			recovered: true,
			warning: `The PR head branch was unavailable, so Superset checked out GitHub's PR head ref (${getSyntheticPrHeadRef(prNumber)}) with no upstream. Push a new branch if you need to continue from it.`,
		};
	}

	await assertFetchHeadMatchesExpectedOid({
		git,
		worktreePath,
		expectedHeadOid,
	});
	await checkoutFetchHeadAsBranch({ git, worktreePath, branch });
	return {
		recovered: true,
		warning:
			"gh pr checkout could not attach upstream tracking for this PR branch, so Superset checked out FETCH_HEAD with no upstream.",
	};
}
