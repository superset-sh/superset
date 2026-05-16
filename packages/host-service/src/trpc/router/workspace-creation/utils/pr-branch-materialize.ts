import type { GitClient } from "../shared/types";

export type PrBranchSourceKind = "head-branch" | "synthetic-pr-ref";

export interface PrBranchMetadata {
	number: number;
	headRefName: string;
	headRefOid: string;
	isCrossRepository: boolean;
}

export interface MaterializePrBranchResult {
	branch: string;
	createdBranch: boolean;
	sourceKind: PrBranchSourceKind;
	startPoint: string;
	trackingRemote: string;
	trackingMergeRef: string;
	warning?: string;
}

interface PrBranchSource {
	kind: PrBranchSourceKind;
	startPoint: string;
	mergeRef: string;
	warning?: string;
}

class SameRepoBranchFetchError extends Error {
	constructor(
		message: string,
		readonly originalError: unknown,
	) {
		super(message);
		this.name = "SameRepoBranchFetchError";
	}
}

export function getSyntheticPrHeadRef(prNumber: number): string {
	return `refs/pull/${prNumber}/head`;
}

export function getSyntheticPrVerifiedRef(pr: PrBranchMetadata): string {
	return `refs/superset/pr-fetch/${pr.number}/${normalizeOid(pr.headRefOid)}`;
}

function normalizeOid(oid: string): string {
	return oid.trim().toLowerCase();
}

async function revParseCommit(git: GitClient, ref: string): Promise<string> {
	const oid = await git.raw(["rev-parse", "--verify", `${ref}^{commit}`]);
	const trimmed = oid.trim();
	if (!/^[0-9a-f]{40,}$/i.test(trimmed)) {
		throw new Error(`Expected ${ref} to resolve to a commit, got "${trimmed}"`);
	}
	return trimmed;
}

async function assertRefMatchesExpectedOid(args: {
	git: GitClient;
	ref: string;
	expectedHeadOid: string;
}): Promise<string> {
	const actualOid = await revParseCommit(args.git, args.ref);
	if (normalizeOid(actualOid) !== normalizeOid(args.expectedHeadOid)) {
		throw new Error(
			`Fetched PR head ${actualOid} did not match GitHub headRefOid ${args.expectedHeadOid}`,
		);
	}
	return actualOid;
}

async function getLocalBranchHead(
	git: GitClient,
	branch: string,
): Promise<string | null> {
	try {
		return await revParseCommit(git, `refs/heads/${branch}`);
	} catch {
		return null;
	}
}

async function fetchSameRepoPrBranch(args: {
	git: GitClient;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<PrBranchSource> {
	const remoteTrackingRef = `refs/remotes/${args.remoteName}/${args.pr.headRefName}`;
	try {
		await args.git.raw([
			"fetch",
			"--no-tags",
			"--quiet",
			args.remoteName,
			`+refs/heads/${args.pr.headRefName}:${remoteTrackingRef}`,
		]);
	} catch (err) {
		throw new SameRepoBranchFetchError(
			`Failed to fetch ${args.pr.headRefName} from ${args.remoteName}`,
			err,
		);
	}
	await assertRefMatchesExpectedOid({
		git: args.git,
		ref: remoteTrackingRef,
		expectedHeadOid: args.pr.headRefOid,
	});
	return {
		kind: "head-branch",
		startPoint: remoteTrackingRef,
		mergeRef: `refs/heads/${args.pr.headRefName}`,
	};
}

async function fetchSyntheticPrBranch(args: {
	git: GitClient;
	remoteName: string;
	pr: PrBranchMetadata;
	warning?: string;
}): Promise<PrBranchSource> {
	const syntheticRef = getSyntheticPrHeadRef(args.pr.number);
	const verifiedRef = getSyntheticPrVerifiedRef(args.pr);
	await args.git.raw([
		"fetch",
		"--no-tags",
		"--quiet",
		args.remoteName,
		`+${syntheticRef}:${verifiedRef}`,
	]);
	await assertRefMatchesExpectedOid({
		git: args.git,
		ref: verifiedRef,
		expectedHeadOid: args.pr.headRefOid,
	});
	return {
		kind: "synthetic-pr-ref",
		startPoint: verifiedRef,
		mergeRef: syntheticRef,
		warning: args.warning,
	};
}

export async function configurePrBranchTracking(args: {
	git: GitClient;
	branch: string;
	remoteName: string;
	mergeRef: string;
	pushRemote?: string;
}): Promise<void> {
	await args.git.raw([
		"config",
		`branch.${args.branch}.remote`,
		args.remoteName,
	]);
	await args.git.raw(["config", `branch.${args.branch}.merge`, args.mergeRef]);
	if (args.pushRemote) {
		await args.git.raw([
			"config",
			`branch.${args.branch}.pushRemote`,
			args.pushRemote,
		]);
	}
}

export async function deleteMaterializedPrBranchIfSafe(args: {
	git: GitClient;
	branch: string;
	expectedHeadOid: string;
}): Promise<boolean> {
	const localOid = await getLocalBranchHead(args.git, args.branch);
	if (localOid === null) return false;
	if (normalizeOid(localOid) !== normalizeOid(args.expectedHeadOid)) {
		return false;
	}
	await args.git.raw(["branch", "-D", "--", args.branch]);
	return true;
}

export async function materializePrBranch(args: {
	git: GitClient;
	branch: string;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<MaterializePrBranchResult> {
	let source: PrBranchSource;

	if (args.pr.isCrossRepository) {
		source = await fetchSyntheticPrBranch({
			git: args.git,
			remoteName: args.remoteName,
			pr: args.pr,
		});
	} else {
		try {
			source = await fetchSameRepoPrBranch({
				git: args.git,
				remoteName: args.remoteName,
				pr: args.pr,
			});
		} catch (err) {
			if (!(err instanceof SameRepoBranchFetchError)) {
				throw err;
			}
			source = await fetchSyntheticPrBranch({
				git: args.git,
				remoteName: args.remoteName,
				pr: args.pr,
				warning: `The PR head branch "${args.pr.headRefName}" was unavailable from ${args.remoteName}, so Superset fetched ${getSyntheticPrHeadRef(args.pr.number)} instead. Original error: ${err.originalError instanceof Error ? err.originalError.message : String(err.originalError)}`,
			});
		}
	}

	const existingOid = await getLocalBranchHead(args.git, args.branch);
	if (existingOid !== null) {
		if (normalizeOid(existingOid) !== normalizeOid(args.pr.headRefOid)) {
			throw new Error(
				`Local branch "${args.branch}" exists and points at ${existingOid}, not PR head ${args.pr.headRefOid}`,
			);
		}
		await configurePrBranchTracking({
			git: args.git,
			branch: args.branch,
			remoteName: args.remoteName,
			mergeRef: source.mergeRef,
		});
		return {
			branch: args.branch,
			createdBranch: false,
			sourceKind: source.kind,
			startPoint: source.startPoint,
			trackingRemote: args.remoteName,
			trackingMergeRef: source.mergeRef,
			warning: source.warning,
		};
	}

	let branchCreated = false;
	try {
		await args.git.raw([
			"branch",
			"--no-track",
			"--",
			args.branch,
			source.startPoint,
		]);
		branchCreated = true;
		await configurePrBranchTracking({
			git: args.git,
			branch: args.branch,
			remoteName: args.remoteName,
			mergeRef: source.mergeRef,
		});
	} catch (err) {
		if (branchCreated) {
			try {
				await deleteMaterializedPrBranchIfSafe({
					git: args.git,
					branch: args.branch,
					expectedHeadOid: args.pr.headRefOid,
				});
			} catch (cleanupErr) {
				throw new Error(
					`Failed to materialize PR branch "${args.branch}": ${err instanceof Error ? err.message : String(err)}. Failed to roll back created branch: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
				);
			}
		}
		throw err;
	}

	return {
		branch: args.branch,
		createdBranch: true,
		sourceKind: source.kind,
		startPoint: source.startPoint,
		trackingRemote: args.remoteName,
		trackingMergeRef: source.mergeRef,
		warning: source.warning,
	};
}
