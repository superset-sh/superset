import { createHash } from "node:crypto";
import { parseGitRemote } from "@superset/shared/git-remote";
import type { GitCommandRunner } from "../shared/types";

export type PrBranchSourceKind = "head-branch" | "synthetic-pr-ref";

export interface PrBranchMetadata {
	provider?: "github" | "gitlab";
	host?: string;
	headRepositoryUrl?: string | null;
	selectedRepositoryUrl?: string;
	selectedRemoteName?: string;
	selectedOrganizationId?: string;
	projectId?: string;
	sourceProjectId?: string | null;
	targetProjectId?: string;
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
	provider?: "github" | "gitlab";
	checkoutIdentity?: string;
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

async function revParseCommit(
	git: GitCommandRunner,
	ref: string,
): Promise<string> {
	const oid = await git.raw(["rev-parse", "--verify", `${ref}^{commit}`]);
	const trimmed = oid.trim();
	if (!/^[0-9a-f]{40,}$/i.test(trimmed)) {
		throw new Error(`Expected ${ref} to resolve to a commit, got "${trimmed}"`);
	}
	return trimmed;
}

async function assertRefMatchesExpectedOid(args: {
	git: GitCommandRunner;
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
	git: GitCommandRunner,
	branch: string,
): Promise<string | null> {
	try {
		return await revParseCommit(git, `refs/heads/${branch}`);
	} catch {
		return null;
	}
}

async function getRemoteUrl(
	git: GitCommandRunner,
	remoteName: string,
): Promise<string | null> {
	try {
		return (await git.raw(["remote", "get-url", remoteName])).trim() || null;
	} catch {
		return null;
	}
}

async function ensureRemoteUrl(args: {
	git: GitCommandRunner;
	remoteName: string;
	remoteUrl: string;
	provider?: "github" | "gitlab";
}): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const candidate =
			attempt === 0 ? args.remoteName : `${args.remoteName}-${attempt + 1}`;
		const existingUrl =
			args.provider === "gitlab"
				? await getConfiguredGitlabRemoteUrl(args.git, candidate)
				: await getRemoteUrl(args.git, candidate);
		if (existingUrl === null) {
			await args.git.raw(["remote", "add", candidate, args.remoteUrl]);
			return candidate;
		}
		if (
			args.provider === "gitlab"
				? sameGitlabRemote(existingUrl, args.remoteUrl)
				: normalizeRemoteUrl(existingUrl) === normalizeRemoteUrl(args.remoteUrl)
		) {
			return candidate;
		}
	}
	throw new Error(
		`Could not configure a remote for ${args.remoteUrl}; remote names based on "${args.remoteName}" are already in use`,
	);
}

async function fetchSameRepoPrBranch(args: {
	git: GitCommandRunner;
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
	git: GitCommandRunner;
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
	git: GitCommandRunner;
	branch: string;
	remoteName: string;
	mergeRef: string;
	remoteUrl?: string;
	provider?: "github" | "gitlab";
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
				provider: args.provider,
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
	git: GitCommandRunner;
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

function sameGitlabRemote(left: string, right: string): boolean {
	const a = parseGitRemote(left),
		b = parseGitRemote(right);
	return (
		a !== null &&
		b !== null &&
		a.host === b.host &&
		a.owner === b.owner &&
		a.name === b.name
	);
}

async function getConfiguredGitlabRemoteUrl(
	git: GitCommandRunner,
	name: string,
): Promise<string | null> {
	return (
		(
			await git.raw(["config", "--default", "", "--get", `remote.${name}.url`])
		).trim() || null
	);
}

export function gitlabPrFetchRef(pr: PrBranchMetadata): string {
	const identity = createHash("sha256")
		.update(pr.selectedRepositoryUrl ?? "")
		.digest("hex")
		.slice(0, 24);
	return `refs/superset/gitlab-fetch/${identity}/${pr.number}/head`;
}

export function gitlabCheckoutIdentity(pr: PrBranchMetadata): string {
	if (!pr.selectedOrganizationId || !pr.selectedRepositoryUrl || !pr.projectId)
		throw new PrBranchConflictError("Invalid GitLab checkout authority");
	return JSON.stringify([
		pr.selectedOrganizationId,
		pr.selectedRepositoryUrl,
		pr.projectId,
		pr.number,
	]);
}

async function readGitlabCheckoutIdentity(
	git: GitCommandRunner,
	branch: string,
): Promise<string> {
	return (
		await git.raw([
			"config",
			"--default",
			"",
			"--get",
			`branch.${branch}.supersetGitlabCheckout`,
		])
	).trim();
}

async function resolveGitlabBranchSource(args: {
	git: GitCommandRunner;
	branch: string;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<PrBranchSource> {
	const pr = args.pr,
		remoteName = pr.selectedRemoteName;
	const checkoutIdentity = gitlabCheckoutIdentity(pr);
	const recordedIdentity = await readGitlabCheckoutIdentity(
		args.git,
		args.branch,
	);
	if (recordedIdentity && recordedIdentity !== checkoutIdentity)
		throw new PrBranchConflictError(
			"Local branch belongs to another GitLab checkout",
		);
	if (
		!remoteName ||
		!pr.selectedRepositoryUrl ||
		!pr.host ||
		!pr.projectId ||
		pr.targetProjectId !== pr.projectId ||
		pr.sourceProjectId === undefined ||
		pr.isCrossRepository !== (pr.sourceProjectId !== pr.targetProjectId)
	)
		throw new PrBranchConflictError("Invalid GitLab checkout identity");
	const selected = parseGitRemote(pr.selectedRepositoryUrl);
	if (!selected || selected.provider === "github" || selected.host !== pr.host)
		throw new PrBranchConflictError("Invalid GitLab checkout identity");
	const currentUrl = await getConfiguredGitlabRemoteUrl(args.git, remoteName);
	if (!currentUrl || !sameGitlabRemote(currentUrl, pr.selectedRepositoryUrl))
		throw new PrBranchConflictError(
			"GitLab remote changed while preparing checkout",
		);
	const syntheticRef = `refs/merge-requests/${pr.number}/head`,
		fetchRef = gitlabPrFetchRef(pr);
	await args.git.raw([
		"-c",
		"http.followRedirects=false",
		"fetch",
		"--no-tags",
		"--quiet",
		pr.selectedRepositoryUrl,
		`+${syntheticRef}:${fetchRef}`,
	]);
	const actualOid = await revParseCommit(args.git, fetchRef);
	if (normalizeOid(actualOid) !== normalizeOid(pr.headRefOid))
		throw new PrBranchConflictError(
			"Fetched GitLab MR head does not match current metadata",
		);
	const stillCurrent = await getConfiguredGitlabRemoteUrl(args.git, remoteName);
	if (
		!stillCurrent ||
		!sameGitlabRemote(stillCurrent, pr.selectedRepositoryUrl)
	)
		throw new PrBranchConflictError(
			"GitLab remote changed while preparing checkout",
		);
	if (!pr.isCrossRepository)
		return {
			provider: "gitlab",
			checkoutIdentity,
			kind: "synthetic-pr-ref",
			startPoint: actualOid,
			trackingRemote: remoteName,
			mergeRef: `refs/heads/${pr.headRefName}`,
		};
	let forkUrl: string | null = null;
	if (pr.headRepositoryUrl) {
		const source = parseGitRemote(pr.headRepositoryUrl);
		const url = new URL(pr.headRepositoryUrl);
		if (
			!source ||
			source.provider === "github" ||
			source.host !== pr.host ||
			source.owner !== pr.headRepositoryOwner ||
			source.name !== pr.headRepositoryName ||
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== `/${source.owner}/${source.name}.git`
		)
			throw new PrBranchConflictError("Invalid GitLab source repository");
		forkUrl = pr.headRepositoryUrl;
	}
	const forkRemoteName = getForkRemoteName(pr.number);
	return {
		provider: "gitlab",
		checkoutIdentity,
		kind: "synthetic-pr-ref",
		startPoint: actualOid,
		trackingRemote: forkUrl ? forkRemoteName : remoteName,
		mergeRef: forkUrl ? `refs/heads/${pr.headRefName}` : syntheticRef,
		remoteUrl: forkUrl ?? undefined,
		pushRemote: forkUrl ? forkRemoteName : undefined,
		pushRef: forkUrl ? `HEAD:refs/heads/${pr.headRefName}` : undefined,
		remoteTrackingBranch: forkUrl ? pr.headRefName : undefined,
		remoteTrackingOid: forkUrl ? pr.headRefOid : undefined,
	};
}

async function resolvePrBranchSource(args: {
	git: GitCommandRunner;
	branch: string;
	remoteName: string;
	pr: PrBranchMetadata;
}): Promise<PrBranchSource> {
	if (args.pr.provider === "gitlab") return resolveGitlabBranchSource(args);
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
	git: GitCommandRunner;
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
		provider: args.source.provider,
		pushRemote: args.source.pushRemote,
		pushRef: args.source.pushRef,
		remoteTrackingBranch: args.source.remoteTrackingBranch,
		remoteTrackingOid: args.source.remoteTrackingOid,
	});
	if (args.source.checkoutIdentity)
		await args.git.raw([
			"config",
			`branch.${args.branch}.supersetGitlabCheckout`,
			args.source.checkoutIdentity,
		]);
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
	git: GitCommandRunner;
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
	git: GitCommandRunner;
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

export async function refreshGitlabPrBranch(args: {
	git: GitCommandRunner;
	branch: string;
	worktreePath: string;
	remoteName: string;
	pr: PrBranchMetadata;
	verifiedExistingCheckout?: boolean;
}): Promise<MaterializePrBranchResult> {
	const recordedIdentity = await readGitlabCheckoutIdentity(
		args.git,
		args.branch,
	);
	const source = await resolveGitlabBranchSource(args);
	const currentBranch = (
		await args.git.raw([
			"-C",
			args.worktreePath,
			"symbolic-ref",
			"--quiet",
			"--short",
			"HEAD",
		])
	).trim();
	if (currentBranch !== args.branch)
		throw new PrBranchConflictError("GitLab workspace branch changed");
	const existingOid = await getLocalBranchHead(args.git, args.branch);
	if (existingOid === null)
		throw new PrBranchConflictError("GitLab workspace branch no longer exists");
	if (normalizeOid(existingOid) !== normalizeOid(source.startPoint)) {
		if (!recordedIdentity && !args.verifiedExistingCheckout)
			throw new PrBranchConflictError(
				"Unverified existing GitLab workspace head",
			);
		const dirty = (
			await args.git.raw([
				"-C",
				args.worktreePath,
				"status",
				"--porcelain",
				"--untracked-files=all",
			])
		).trim();
		if (dirty)
			throw new PrBranchConflictError(
				"GitLab workspace contains local changes",
			);
		try {
			await args.git.raw([
				"merge-base",
				"--is-ancestor",
				existingOid,
				source.startPoint,
			]);
		} catch {
			throw new PrBranchConflictError(
				"GitLab workspace contains commits outside the current MR head",
			);
		}
		await args.git.raw([
			"-C",
			args.worktreePath,
			"merge",
			"--ff-only",
			"--no-edit",
			source.startPoint,
		]);
		const updated = await getLocalBranchHead(args.git, args.branch);
		if (!updated || normalizeOid(updated) !== normalizeOid(source.startPoint))
			throw new PrBranchConflictError(
				"GitLab workspace did not reach the verified MR head",
			);
	}
	return configureTrackingFromSource({
		git: args.git,
		branch: args.branch,
		source,
		createdBranch: false,
	});
}
