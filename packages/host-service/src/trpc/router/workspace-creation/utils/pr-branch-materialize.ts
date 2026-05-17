import type { GitClient } from "../shared/types";

export type PrBranchSourceKind = "head-branch" | "synthetic-pr-ref";

export interface PrBranchMetadata {
	number: number;
	headRefName: string;
	headRefOid: string;
	isCrossRepository: boolean;
	headRepositoryOwner?: string | null;
	headRepositoryName?: string | null;
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
	trackingRemote: string;
	mergeRef: string;
	remoteUrl?: string;
	pushRemote?: string;
	pushRef?: string;
	remoteTrackingBranch?: string;
	remoteTrackingOid?: string;
	warning?: string;
}

export class PrBranchConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PrBranchConflictError";
	}
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

export function getSyntheticPrFetchRef(prNumber: number): string {
	return `refs/superset/pr-fetch/${prNumber}/head`;
}

function normalizeOid(oid: string): string {
	return oid.trim().toLowerCase();
}

function normalizeRemoteUrl(url: string): string {
	return url
		.trim()
		.replace(/\.git$/, "")
		.toLowerCase();
}

function getForkRemoteName(prNumber: number): string {
	return `superset-pr-${prNumber}`;
}

function getHeadRepositoryUrl(pr: PrBranchMetadata): string | null {
	const owner = pr.headRepositoryOwner?.trim();
	const name = pr.headRepositoryName?.trim();
	if (!owner || !name) return null;
	return `https://github.com/${owner}/${name}.git`;
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

async function getRemoteUrl(
	git: GitClient,
	remoteName: string,
): Promise<string | null> {
	try {
		return (await git.raw(["remote", "get-url", remoteName])).trim() || null;
	} catch {
		return null;
	}
}

async function ensureRemoteUrl(args: {
	git: GitClient;
	remoteName: string;
	remoteUrl: string;
}): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const candidate =
			attempt === 0 ? args.remoteName : `${args.remoteName}-${attempt + 1}`;
		const existingUrl = await getRemoteUrl(args.git, candidate);
		if (existingUrl === null) {
			await args.git.raw(["remote", "add", candidate, args.remoteUrl]);
			return candidate;
		}
		if (
			normalizeRemoteUrl(existingUrl) === normalizeRemoteUrl(args.remoteUrl)
		) {
			return candidate;
		}
	}
	throw new Error(
		`Could not configure a remote for ${args.remoteUrl}; remote names based on "${args.remoteName}" are already in use`,
	);
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
	const actualOid = await assertRefMatchesExpectedOid({
		git: args.git,
		ref: remoteTrackingRef,
		expectedHeadOid: args.pr.headRefOid,
	});
	return {
		kind: "head-branch",
		startPoint: actualOid,
		trackingRemote: args.remoteName,
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
	const fetchRef = getSyntheticPrFetchRef(args.pr.number);
	await args.git.raw([
		"fetch",
		"--no-tags",
		"--quiet",
		args.remoteName,
		`+${syntheticRef}:${fetchRef}`,
	]);
	const actualOid = await assertRefMatchesExpectedOid({
		git: args.git,
		ref: fetchRef,
		expectedHeadOid: args.pr.headRefOid,
	});
	const forkRemoteUrl = args.pr.isCrossRepository
		? getHeadRepositoryUrl(args.pr)
		: null;
	const forkRemoteName = getForkRemoteName(args.pr.number);
	return {
		kind: "synthetic-pr-ref",
		startPoint: actualOid,
		trackingRemote: forkRemoteUrl ? forkRemoteName : args.remoteName,
		mergeRef: forkRemoteUrl
			? `refs/heads/${args.pr.headRefName}`
			: syntheticRef,
		remoteUrl: forkRemoteUrl ?? undefined,
		pushRemote: forkRemoteUrl ? forkRemoteName : undefined,
		pushRef: forkRemoteUrl
			? `HEAD:refs/heads/${args.pr.headRefName}`
			: undefined,
		remoteTrackingBranch: forkRemoteUrl ? args.pr.headRefName : undefined,
		remoteTrackingOid: forkRemoteUrl ? args.pr.headRefOid : undefined,
		warning:
			args.warning ??
			(args.pr.isCrossRepository && !forkRemoteUrl
				? `Superset checked out PR #${args.pr.number} through ${syntheticRef}, but GitHub did not return the fork repository. Plain git push may require manual remote configuration.`
				: undefined),
	};
}

export async function configurePrBranchTracking(args: {
	git: GitClient;
	branch: string;
	remoteName: string;
	mergeRef: string;
	remoteUrl?: string;
	pushRemote?: string;
	pushRef?: string;
	remoteTrackingBranch?: string;
	remoteTrackingOid?: string;
}): Promise<string> {
	const trackingRemote = args.remoteUrl
		? await ensureRemoteUrl({
				git: args.git,
				remoteName: args.remoteName,
				remoteUrl: args.remoteUrl,
			})
		: args.remoteName;
	const pushRemote =
		args.pushRemote && args.pushRemote === args.remoteName
			? trackingRemote
			: args.pushRemote;

	if (args.remoteTrackingBranch && args.remoteTrackingOid) {
		await args.git.raw([
			"update-ref",
			`refs/remotes/${trackingRemote}/${args.remoteTrackingBranch}`,
			args.remoteTrackingOid,
		]);
	}
	await args.git.raw([
		"config",
		`branch.${args.branch}.remote`,
		trackingRemote,
	]);
	await args.git.raw(["config", `branch.${args.branch}.merge`, args.mergeRef]);
	if (pushRemote) {
		await args.git.raw([
			"config",
			`branch.${args.branch}.pushRemote`,
			pushRemote,
		]);
	}
	if (pushRemote && args.pushRef) {
		await args.git.raw([
			"config",
			"--replace-all",
			`remote.${pushRemote}.push`,
			args.pushRef,
		]);
	}
	return trackingRemote;
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

async function resolvePrBranchSource(args: {
	git: GitClient;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<PrBranchSource> {
	if (args.pr.isCrossRepository) {
		return await fetchSyntheticPrBranch({
			git: args.git,
			remoteName: args.remoteName,
			pr: args.pr,
		});
	}

	try {
		return await fetchSameRepoPrBranch({
			git: args.git,
			remoteName: args.remoteName,
			pr: args.pr,
		});
	} catch (err) {
		if (!(err instanceof SameRepoBranchFetchError)) {
			throw err;
		}
		return await fetchSyntheticPrBranch({
			git: args.git,
			remoteName: args.remoteName,
			pr: args.pr,
			warning: `The PR head branch "${args.pr.headRefName}" was unavailable from ${args.remoteName}, so Superset fetched ${getSyntheticPrHeadRef(args.pr.number)} instead. Original error: ${err.originalError instanceof Error ? err.originalError.message : String(err.originalError)}`,
		});
	}
}

async function configureTrackingFromSource(args: {
	git: GitClient;
	branch: string;
	source: PrBranchSource;
	createdBranch: boolean;
}): Promise<MaterializePrBranchResult> {
	const trackingRemote = await configurePrBranchTracking({
		git: args.git,
		branch: args.branch,
		remoteName: args.source.trackingRemote,
		mergeRef: args.source.mergeRef,
		remoteUrl: args.source.remoteUrl,
		pushRemote: args.source.pushRemote,
		pushRef: args.source.pushRef,
		remoteTrackingBranch: args.source.remoteTrackingBranch,
		remoteTrackingOid: args.source.remoteTrackingOid,
	});
	return {
		branch: args.branch,
		createdBranch: args.createdBranch,
		sourceKind: args.source.kind,
		startPoint: args.source.startPoint,
		trackingRemote,
		trackingMergeRef: args.source.mergeRef,
		warning: args.source.warning,
	};
}

export async function normalizePrBranchTracking(args: {
	git: GitClient;
	branch: string;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<MaterializePrBranchResult> {
	const source = await resolvePrBranchSource(args);
	const existingOid = await getLocalBranchHead(args.git, args.branch);
	if (existingOid === null) {
		throw new PrBranchConflictError(
			`Local branch "${args.branch}" no longer exists while preparing PR #${args.pr.number}`,
		);
	}
	if (normalizeOid(existingOid) !== normalizeOid(args.pr.headRefOid)) {
		throw new PrBranchConflictError(
			`Local branch "${args.branch}" exists and points at ${existingOid}, not PR head ${args.pr.headRefOid}`,
		);
	}
	return await configureTrackingFromSource({
		git: args.git,
		branch: args.branch,
		source,
		createdBranch: false,
	});
}

export async function materializePrBranch(args: {
	git: GitClient;
	branch: string;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<MaterializePrBranchResult> {
	const source = await resolvePrBranchSource(args);

	const existingOid = await getLocalBranchHead(args.git, args.branch);
	if (existingOid !== null) {
		if (normalizeOid(existingOid) !== normalizeOid(args.pr.headRefOid)) {
			throw new PrBranchConflictError(
				`Local branch "${args.branch}" exists and points at ${existingOid}, not PR head ${args.pr.headRefOid}`,
			);
		}
		return await configureTrackingFromSource({
			git: args.git,
			branch: args.branch,
			source,
			createdBranch: false,
		});
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
		return await configureTrackingFromSource({
			git: args.git,
			branch: args.branch,
			source,
			createdBranch: true,
		});
	} catch (err) {
		if (!branchCreated) {
			const concurrentOid = await getLocalBranchHead(args.git, args.branch);
			if (concurrentOid !== null) {
				if (normalizeOid(concurrentOid) === normalizeOid(args.pr.headRefOid)) {
					return await configureTrackingFromSource({
						git: args.git,
						branch: args.branch,
						source,
						createdBranch: false,
					});
				}
				throw new PrBranchConflictError(
					`Local branch "${args.branch}" exists and points at ${concurrentOid}, not PR head ${args.pr.headRefOid}`,
				);
			}
		}
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
}
