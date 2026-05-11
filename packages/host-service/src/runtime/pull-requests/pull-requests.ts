import { randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { and, eq, inArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects, pullRequests, workspaces } from "../../db/schema";
import type { GitWatcher } from "../../events/git-watcher";
import type { ExecGh } from "../../trpc/router/workspace-creation/utils/exec-gh";
import type { GitFactory } from "../git";
import {
	fetchPullRequestByHead,
	fetchPullRequestByHeadFromGh,
	fetchPullRequestChecks,
	fetchPullRequestChecksFromGh,
	fetchPullRequestReviewDecision,
	fetchPullRequestReviewDecisionFromGh,
} from "./utils/github-query";
import type {
	GitHubPullRequestHeadRef,
	GitHubPullRequestNode,
	GitHubPullRequestReviewDecision,
} from "./utils/github-query/types";
import {
	type ChecksStatus,
	coerceChecksStatus,
	coercePullRequestState,
	coerceReviewDecision,
	computeChecksStatus,
	mapPullRequestState,
	mapReviewDecision,
	type PullRequestCheck,
	type PullRequestState,
	parseCheckContexts,
	parseChecksJson,
	type ReviewDecision,
} from "./utils/pull-request-mappers";

// Long-cadence sweep that catches anything `GitWatcher` might miss
// (overflow, fs.watch errors, transient watcher failures). Steady-state
// branch syncs are event-driven via `GitWatcher.onChanged`; this is a
// belt-and-braces backup, not the primary path.
const SAFETY_NET_INTERVAL_MS = 5 * 60_000;
// Long-cadence safety net for project-level PR refresh. Steady-state
// refreshes are triggered by `syncOneWorkspace` whenever a workspace's
// branch/HEAD/upstream changes. The 60s repo-PR cache deduplicates across
// concurrent triggers.
const PROJECT_REFRESH_INTERVAL_MS = 5 * 60_000;
// Must exceed every polling interval that hits this cache (SAFETY_NET and
// PROJECT_REFRESH). Otherwise the cache is always stale at poll time and
// each tick fires fresh GitHub calls for the same upstream branch.
const REPO_PULL_REQUEST_CACHE_TTL_MS = 60_000;
const UNBORN_HEAD_ERROR_PATTERNS = [
	"ambiguous argument 'head'",
	"unknown revision or path not in the working tree",
	"bad revision 'head'",
	"not a valid object name head",
	"needed a single revision",
];

async function getCurrentBranchName(git: Awaited<ReturnType<GitFactory>>) {
	try {
		const branch = await git.raw(["symbolic-ref", "--short", "HEAD"]);
		const trimmed = branch.trim();
		return trimmed || null;
	} catch {
		try {
			const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
			const trimmed = branch.trim();
			return trimmed && trimmed !== "HEAD" ? trimmed : null;
		} catch {
			return null;
		}
	}
}

async function getHeadSha(git: Awaited<ReturnType<GitFactory>>) {
	try {
		const branch = await git.revparse(["HEAD"]);
		const trimmed = branch.trim();
		return trimmed || null;
	} catch (error) {
		const message =
			error instanceof Error
				? error.message.toLowerCase()
				: String(error).toLowerCase();
		if (
			UNBORN_HEAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
		) {
			return null;
		}

		throw error;
	}
}

// `pushRemote` / `branch.remote` accept a remote name or a URL.
async function resolveRemoteValueToUrl(
	git: Awaited<ReturnType<GitFactory>>,
	value: string,
): Promise<string | null> {
	if (/^(https?:|git@|ssh:)/.test(value)) return value;
	try {
		const url = await git.remote(["get-url", value]);
		return typeof url === "string" ? url.trim() || null : null;
	} catch {
		return null;
	}
}

async function resolveWorkspaceUpstream(
	git: Awaited<ReturnType<GitFactory>>,
	localBranch: string,
): Promise<{ owner: string; name: string; branch: string } | null> {
	// `@{push}` resolves remote+branch respecting all config precedence in one call.
	const pushRef = await tryRaw(git, [
		"rev-parse",
		"--abbrev-ref",
		`${localBranch}@{push}`,
	]);
	if (pushRef) {
		const slash = pushRef.indexOf("/");
		if (slash > 0) {
			const url = await resolveRemoteValueToUrl(git, pushRef.slice(0, slash));
			const parsed = url ? parseGitHubRemote(url) : null;
			if (parsed) {
				return {
					owner: parsed.owner,
					name: parsed.name,
					branch: pushRef.slice(slash + 1),
				};
			}
		}
	}

	// Fallback when `@{push}` isn't configured — mirrors gh's config chain.
	// Require `branch.<n>.merge`; without it, `remote.pushDefault` alone would
	// re-open the same-name collision hole on untracked branches.
	const mergeRef = await tryConfig(git, `branch.${localBranch}.merge`);
	const trackedBranch = mergeRef?.replace(/^refs\/heads\//, "");
	if (!trackedBranch) return null;

	const remoteValue =
		(await tryConfig(git, `branch.${localBranch}.pushRemote`)) ??
		(await tryConfig(git, "remote.pushDefault")) ??
		(await tryConfig(git, `branch.${localBranch}.remote`));
	if (!remoteValue) return null;

	const url = await resolveRemoteValueToUrl(git, remoteValue);
	const parsed = url ? parseGitHubRemote(url) : null;
	if (!parsed) return null;

	// `gh pr checkout` renames the local branch on collision (`main` →
	// `quueli-main`) but the PR's headRefName stays `main`, so we key on the
	// tracked remote branch, not the local name.
	return { owner: parsed.owner, name: parsed.name, branch: trackedBranch };
}

async function tryRaw(
	git: Awaited<ReturnType<GitFactory>>,
	args: string[],
): Promise<string | null> {
	try {
		return (await git.raw(args)).trim() || null;
	} catch {
		return null;
	}
}

async function tryConfig(
	git: Awaited<ReturnType<GitFactory>>,
	key: string,
): Promise<string | null> {
	return tryRaw(git, ["config", "--get", key]);
}

function upstreamKey(
	owner: string | null,
	repo: string | null,
	branch: string,
): string | null {
	if (!owner || !repo) return null;
	// GitHub owner/repo are case-insensitive; branch names are case-sensitive.
	return `${owner.toLowerCase()}/${repo.toLowerCase()}#${branch}`;
}

type RepoProvider = "github";

export interface PullRequestStateSnapshot {
	url: string;
	number: number;
	title: string;
	state: PullRequestState;
	reviewDecision: ReviewDecision;
	checksStatus: ChecksStatus;
	checks: PullRequestCheck[];
}

export interface PullRequestWorkspaceSnapshot {
	workspaceId: string;
	pullRequest: PullRequestStateSnapshot | null;
	error: string | null;
	lastFetchedAt: string | null;
}

export interface PullRequestRuntimeManagerOptions {
	db: HostDb;
	execGh: ExecGh;
	git: GitFactory;
	github: () => Promise<Octokit>;
	gitWatcher: GitWatcher;
}

interface NormalizedRepoIdentity {
	provider: RepoProvider;
	owner: string;
	name: string;
	url: string;
	remoteName: string;
}

type PullRequestRow = typeof pullRequests.$inferSelect;

export interface CheckoutPullRequestMetadata {
	number: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft?: boolean;
	headRefName: string;
	headRefOid: string;
	headRepositoryOwner?: string | null;
	headRepositoryName?: string | null;
	isCrossRepository: boolean;
}

function mapCheckoutPullRequestState(
	state: CheckoutPullRequestMetadata["state"],
	isDraft: boolean,
): PullRequestState {
	if (state === "merged") return "merged";
	if (state === "closed") return "closed";
	if (isDraft) return "draft";
	return "open";
}

function deriveCheckoutPullRequestUpstream(
	repo: NormalizedRepoIdentity,
	pr: CheckoutPullRequestMetadata,
): { owner: string; name: string; branch: string } | null {
	if (!pr.isCrossRepository) {
		return { owner: repo.owner, name: repo.name, branch: pr.headRefName };
	}

	const owner = pr.headRepositoryOwner?.trim();
	const name = pr.headRepositoryName?.trim();
	if (!owner || !name) return null;
	return { owner, name, branch: pr.headRefName };
}

export class PullRequestRuntimeManager {
	private readonly db: HostDb;
	private readonly execGh: ExecGh;
	private readonly git: GitFactory;
	private readonly github: () => Promise<Octokit>;
	private readonly gitWatcher: GitWatcher;
	private safetyNetTimer: ReturnType<typeof setInterval> | null = null;
	private projectRefreshTimer: ReturnType<typeof setInterval> | null = null;
	private unsubscribeFromGitWatcher: (() => void) | null = null;
	private readonly inFlightProjects = new Map<string, Promise<void>>();
	private readonly workspaceSyncState = new Map<
		string,
		{ running: Promise<void>; rerunPending: boolean }
	>();
	private readonly pullRequestHeadCache = new Map<
		string,
		{ promise: Promise<GitHubPullRequestNode | null>; fetchedAt: number }
	>();

	constructor(options: PullRequestRuntimeManagerOptions) {
		this.db = options.db;
		this.execGh = options.execGh;
		this.git = options.git;
		this.github = options.github;
		this.gitWatcher = options.gitWatcher;
	}

	start() {
		if (
			this.safetyNetTimer ||
			this.projectRefreshTimer ||
			this.unsubscribeFromGitWatcher
		)
			return;

		// One initial sweep so workspaces that existed before this manager
		// started have correct branch/sha/upstream rows even if no `.git/`
		// activity has happened since the last process boot.
		void this.syncWorkspaceBranches();
		void this.refreshEligibleProjects();

		// Steady-state: react to real `.git/` activity per workspace. Per-workspace
		// debounce lives in `GitWatcher` (300 ms), and concurrent project refreshes
		// are deduplicated by `inFlightProjects`. We additionally serialize per
		// workspace so two debounce-separated bursts can't race their git reads
		// and have the slower one overwrite the newer snapshot.
		this.unsubscribeFromGitWatcher = this.gitWatcher.onChanged((event) => {
			void this.enqueueWorkspaceSync(event.workspaceId);
		});

		// Long-cadence safety net for `GitWatcher` overflow / error paths.
		this.safetyNetTimer = setInterval(() => {
			void this.syncWorkspaceBranches();
		}, SAFETY_NET_INTERVAL_MS);
		this.projectRefreshTimer = setInterval(() => {
			void this.refreshEligibleProjects();
		}, PROJECT_REFRESH_INTERVAL_MS);
	}

	stop() {
		if (this.safetyNetTimer) clearInterval(this.safetyNetTimer);
		if (this.projectRefreshTimer) clearInterval(this.projectRefreshTimer);
		this.unsubscribeFromGitWatcher?.();
		this.safetyNetTimer = null;
		this.projectRefreshTimer = null;
		this.unsubscribeFromGitWatcher = null;
	}

	async getPullRequestsByWorkspaces(
		workspaceIds: string[],
	): Promise<PullRequestWorkspaceSnapshot[]> {
		if (workspaceIds.length === 0) return [];

		const rows = this.db
			.select({
				workspaceId: workspaces.id,
				pullRequestUrl: pullRequests.url,
				pullRequestNumber: pullRequests.prNumber,
				pullRequestTitle: pullRequests.title,
				pullRequestState: pullRequests.state,
				pullRequestReviewDecision: pullRequests.reviewDecision,
				pullRequestChecksStatus: pullRequests.checksStatus,
				pullRequestChecksJson: pullRequests.checksJson,
				pullRequestLastFetchedAt: pullRequests.lastFetchedAt,
				pullRequestError: pullRequests.error,
			})
			.from(workspaces)
			.leftJoin(pullRequests, eq(workspaces.pullRequestId, pullRequests.id))
			.where(inArray(workspaces.id, workspaceIds))
			.all();

		return rows.map((row) => ({
			workspaceId: row.workspaceId,
			pullRequest:
				row.pullRequestUrl &&
				row.pullRequestNumber !== null &&
				row.pullRequestNumber !== undefined
					? {
							url: row.pullRequestUrl,
							number: row.pullRequestNumber,
							title: row.pullRequestTitle ?? "",
							state: coercePullRequestState(row.pullRequestState),
							reviewDecision: coerceReviewDecision(
								row.pullRequestReviewDecision,
							),
							checksStatus: coerceChecksStatus(row.pullRequestChecksStatus),
							checks: parseChecksJson(row.pullRequestChecksJson),
						}
					: null,
			error: row.pullRequestError ?? null,
			lastFetchedAt: row.pullRequestLastFetchedAt
				? new Date(row.pullRequestLastFetchedAt).toISOString()
				: null,
		}));
	}

	async refreshPullRequestsByWorkspaces(workspaceIds: string[]): Promise<void> {
		if (workspaceIds.length === 0) return;

		const rows = this.db
			.select({
				projectId: workspaces.projectId,
			})
			.from(workspaces)
			.where(inArray(workspaces.id, workspaceIds))
			.all();

		const projectIds = [...new Set(rows.map((row) => row.projectId))];
		await Promise.all(
			projectIds.map((projectId) =>
				this.refreshProject(projectId, { bypassCache: true }),
			),
		);
	}

	async linkWorkspaceToCheckoutPullRequest({
		workspaceId,
		projectId,
		pullRequest,
	}: {
		workspaceId: string;
		projectId: string;
		pullRequest: CheckoutPullRequestMetadata;
	}): Promise<string | null> {
		const repo = await this.getProjectRepository(projectId);
		if (!repo) {
			console.warn(
				"[host-service:pull-request-runtime] linkWorkspaceToCheckoutPullRequest: skipping; project repo metadata unavailable",
				{ projectId, workspaceId, prNumber: pullRequest.number },
			);
			return null;
		}

		const existing = this.findPullRequestRow(repo, pullRequest.number);
		const existingChecks = parseChecksJson(existing?.checksJson ?? null);
		const now = Date.now();
		const isDraft = pullRequest.isDraft ?? false;
		const rowId = this.upsertPullRequestRow({
			existing,
			projectId,
			repo,
			prNumber: pullRequest.number,
			url: pullRequest.url,
			title: pullRequest.title,
			state: mapCheckoutPullRequestState(pullRequest.state, isDraft),
			isDraft,
			headBranch: pullRequest.headRefName,
			headSha: pullRequest.headRefOid,
			reviewDecision: coerceReviewDecision(existing?.reviewDecision ?? null),
			checksStatus: coerceChecksStatus(existing?.checksStatus ?? null),
			checksJson: JSON.stringify(existingChecks),
			lastFetchedAt: existing?.lastFetchedAt ?? now,
			error: null,
			now,
		});

		const upstream = deriveCheckoutPullRequestUpstream(repo, pullRequest);
		this.db
			.update(workspaces)
			.set({
				pullRequestId: rowId,
				headSha: pullRequest.headRefOid,
				upstreamOwner: upstream?.owner ?? null,
				upstreamRepo: upstream?.name ?? null,
				upstreamBranch: upstream?.branch ?? null,
			})
			.where(eq(workspaces.id, workspaceId))
			.run();

		return rowId;
	}

	private async syncWorkspaceBranches(): Promise<void> {
		// Route every workspace through the same per-workspace queue as the
		// watcher path, so a concurrent watcher-triggered sync can't race the
		// sweep's read+write and clobber the newer snapshot. enqueueWorkspaceSync
		// coalesces — if a sync is already running for a workspace, this just
		// flips its rerunPending flag.
		const ids = this.db.select({ id: workspaces.id }).from(workspaces).all();

		// Sequential to keep git subprocess concurrency bounded; matches the
		// original sweep's behavior. refreshProject inside each sync still
		// dedupes across workspaces in the same project via inFlightProjects.
		for (const row of ids) {
			await this.enqueueWorkspaceSync(row.id);
		}
	}

	private enqueueWorkspaceSync(workspaceId: string): Promise<void> {
		// Coalesce: if a sync is already running for this workspace, just mark
		// "rerun pending" — there's no value in queuing N back-to-back syncs
		// when only the final state matters. At most one sync runs and one
		// rerun is queued, regardless of how many events fire.
		const existing = this.workspaceSyncState.get(workspaceId);
		if (existing) {
			existing.rerunPending = true;
			return existing.running;
		}

		const run = async (): Promise<void> => {
			try {
				do {
					const state = this.workspaceSyncState.get(workspaceId);
					if (state) state.rerunPending = false;
					await this.syncOneWorkspace(workspaceId);
				} while (this.workspaceSyncState.get(workspaceId)?.rerunPending);
			} finally {
				this.workspaceSyncState.delete(workspaceId);
			}
		};

		const running = run();
		this.workspaceSyncState.set(workspaceId, {
			running,
			rerunPending: false,
		});
		return running;
	}

	private async syncOneWorkspace(workspaceId: string): Promise<void> {
		// Look up the row fresh — the workspace may have been deleted between
		// the GitWatcher event firing and this handler running. That's expected
		// during teardown / workspace removal; silently no-op.
		const workspace = this.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (!workspace) return;

		const projectId = await this.syncWorkspaceRow(workspace);
		if (projectId) await this.refreshProject(projectId);
	}

	private async syncWorkspaceRow(
		workspace: typeof workspaces.$inferSelect,
	): Promise<string | null> {
		try {
			const git = await this.git(workspace.worktreePath);
			const branch = await getCurrentBranchName(git);
			if (!branch) return null;

			const headSha = await getHeadSha(git);
			const upstream = await resolveWorkspaceUpstream(git, branch);
			const upstreamOwner = upstream?.owner ?? null;
			const upstreamRepo = upstream?.name ?? null;
			const upstreamBranch = upstream?.branch ?? null;
			const pullRequestId =
				upstream ||
				this.pullRequestHeadMatches(workspace.pullRequestId, headSha)
					? workspace.pullRequestId
					: null;

			if (
				branch === workspace.branch &&
				headSha === workspace.headSha &&
				upstreamOwner === workspace.upstreamOwner &&
				upstreamRepo === workspace.upstreamRepo &&
				upstreamBranch === workspace.upstreamBranch &&
				pullRequestId === workspace.pullRequestId
			) {
				return null;
			}

			this.db
				.update(workspaces)
				.set({
					branch,
					headSha,
					upstreamOwner,
					upstreamRepo,
					upstreamBranch,
					pullRequestId,
				})
				.where(eq(workspaces.id, workspace.id))
				.run();

			return workspace.projectId;
		} catch (error) {
			console.warn(
				"[host-service:pull-request-runtime] Failed to sync workspace branch",
				{
					workspaceId: workspace.id,
					worktreePath: workspace.worktreePath,
					error,
				},
			);
			return null;
		}
	}

	private async refreshEligibleProjects(): Promise<void> {
		const rows = this.db
			.select({
				projectId: workspaces.projectId,
			})
			.from(workspaces)
			.all();
		const projectIds = [...new Set(rows.map((row) => row.projectId))];
		await Promise.all(
			projectIds.map((projectId) => this.refreshProject(projectId)),
		);
	}

	private async refreshProject(
		projectId: string,
		options: { bypassCache?: boolean } = {},
	): Promise<void> {
		const existing = this.inFlightProjects.get(projectId);
		if (existing) {
			await existing;
			return;
		}

		const refreshPromise = this.performProjectRefresh(projectId, options)
			.catch((error) => {
				console.warn(
					"[host-service:pull-request-runtime] Project refresh failed",
					{
						projectId,
						error,
					},
				);
			})
			.finally(() => {
				this.inFlightProjects.delete(projectId);
			});

		this.inFlightProjects.set(projectId, refreshPromise);
		await refreshPromise;
	}

	private async performProjectRefresh(
		projectId: string,
		options: { bypassCache?: boolean } = {},
	): Promise<void> {
		const repo = await this.getProjectRepository(projectId);
		if (!repo) return;

		const projectWorkspaces = this.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, projectId))
			.all();
		if (projectWorkspaces.length === 0) return;

		const wantedRefs = new Map<string, GitHubPullRequestHeadRef>();
		for (const workspace of projectWorkspaces) {
			const upstreamOwner = workspace.upstreamOwner;
			const upstreamRepo = workspace.upstreamRepo;
			const upstreamBranch = workspace.upstreamBranch ?? workspace.branch;
			const key = upstreamKey(upstreamOwner, upstreamRepo, upstreamBranch);
			if (key && upstreamOwner && upstreamRepo) {
				wantedRefs.set(key, {
					owner: upstreamOwner,
					repo: upstreamRepo,
					branch: upstreamBranch,
				});
			}
		}

		const { failedKeys, matched: keyToPullRequest } =
			await this.fetchRepoPullRequests(projectId, repo, wantedRefs, options);

		for (const workspace of projectWorkspaces) {
			const key = upstreamKey(
				workspace.upstreamOwner,
				workspace.upstreamRepo,
				workspace.upstreamBranch ?? workspace.branch,
			);
			if (!key) {
				// PR checkouts recovered from GitHub's archived refs intentionally
				// have no upstream. Keep the explicit PR link only while the
				// workspace HEAD still matches the selected PR head.
				if (
					this.pullRequestHeadMatches(
						workspace.pullRequestId,
						workspace.headSha,
					)
				) {
					continue;
				}
				if (workspace.pullRequestId) {
					this.db
						.update(workspaces)
						.set({ pullRequestId: null })
						.where(eq(workspaces.id, workspace.id))
						.run();
				}
				continue;
			}
			const match = keyToPullRequest.get(key);
			if (match) {
				this.db
					.update(workspaces)
					.set({ pullRequestId: match.id })
					.where(eq(workspaces.id, workspace.id))
					.run();
				continue;
			}

			if (failedKeys.has(key)) continue;

			this.db
				.update(workspaces)
				.set({ pullRequestId: null })
				.where(eq(workspaces.id, workspace.id))
				.run();
		}
	}

	private async getProjectRepository(
		projectId: string,
	): Promise<NormalizedRepoIdentity | null> {
		const project = this.db.query.projects
			.findFirst({ where: eq(projects.id, projectId) })
			.sync();
		if (!project) return null;

		if (
			project.repoProvider === "github" &&
			project.repoOwner &&
			project.repoName &&
			project.repoUrl &&
			project.remoteName
		) {
			return {
				provider: "github",
				owner: project.repoOwner,
				name: project.repoName,
				url: project.repoUrl,
				remoteName: project.remoteName,
			};
		}

		const git = await this.git(project.repoPath);
		const remoteName = "origin";
		let remoteUrl: string;
		try {
			const value = await git.remote(["get-url", remoteName]);
			if (typeof value !== "string") {
				return null;
			}
			remoteUrl = value.trim();
		} catch {
			return null;
		}

		const parsedRemote = parseGitHubRemote(remoteUrl);
		if (!parsedRemote) return null;

		this.db
			.update(projects)
			.set({
				repoProvider: parsedRemote.provider,
				repoOwner: parsedRemote.owner,
				repoName: parsedRemote.name,
				repoUrl: parsedRemote.url,
				remoteName,
			})
			.where(eq(projects.id, projectId))
			.run();

		return {
			...parsedRemote,
			remoteName,
		};
	}

	private findPullRequestRow(
		repo: NormalizedRepoIdentity,
		prNumber: number,
	): PullRequestRow | undefined {
		return this.db.query.pullRequests
			.findFirst({
				where: and(
					eq(pullRequests.repoProvider, repo.provider),
					eq(pullRequests.repoOwner, repo.owner),
					eq(pullRequests.repoName, repo.name),
					eq(pullRequests.prNumber, prNumber),
				),
			})
			.sync();
	}

	private findPullRequestRowById(id: string): PullRequestRow | undefined {
		return this.db.query.pullRequests
			.findFirst({ where: eq(pullRequests.id, id) })
			.sync();
	}

	private pullRequestHeadMatches(
		pullRequestId: string | null,
		headSha: string | null,
	): boolean {
		if (!pullRequestId || !headSha) return false;
		const pr = this.findPullRequestRowById(pullRequestId);
		return pr?.headSha.toLowerCase() === headSha.trim().toLowerCase();
	}

	private upsertPullRequestRow({
		existing,
		projectId,
		repo,
		prNumber,
		url,
		title,
		state,
		isDraft,
		headBranch,
		headSha,
		reviewDecision,
		checksStatus,
		checksJson,
		lastFetchedAt,
		error,
		now,
	}: {
		existing: PullRequestRow | undefined;
		projectId: string;
		repo: NormalizedRepoIdentity;
		prNumber: number;
		url: string;
		title: string;
		state: PullRequestState;
		isDraft: boolean;
		headBranch: string;
		headSha: string;
		reviewDecision: ReviewDecision;
		checksStatus: ChecksStatus;
		checksJson: string;
		lastFetchedAt: number | null;
		error: string | null;
		now: number;
	}): string {
		const rowId = existing?.id ?? randomUUID();
		const data = {
			projectId,
			repoProvider: repo.provider,
			repoOwner: repo.owner,
			repoName: repo.name,
			prNumber,
			url,
			title,
			state,
			isDraft,
			headBranch,
			headSha,
			reviewDecision,
			checksStatus,
			checksJson,
			lastFetchedAt,
			error,
			updatedAt: now,
		};

		if (existing) {
			this.db
				.update(pullRequests)
				.set(data)
				.where(eq(pullRequests.id, rowId))
				.run();
		} else {
			this.db
				.insert(pullRequests)
				.values({
					id: rowId,
					createdAt: now,
					...data,
				})
				.run();
		}

		return rowId;
	}

	private async getCachedPullRequestByHead(
		repo: NormalizedRepoIdentity,
		head: GitHubPullRequestHeadRef,
		options: { bypassCache?: boolean } = {},
	): Promise<GitHubPullRequestNode | null> {
		const cacheKey = [
			repo.owner.toLowerCase(),
			repo.name.toLowerCase(),
			head.owner.toLowerCase(),
			head.repo.toLowerCase(),
			head.branch,
		].join("/");
		if (!options.bypassCache) {
			const cached = this.pullRequestHeadCache.get(cacheKey);
			if (
				cached &&
				Date.now() - cached.fetchedAt < REPO_PULL_REQUEST_CACHE_TTL_MS
			) {
				return cached.promise;
			}
		}

		const fetchedAt = Date.now();
		const promise = (async () => {
			try {
				return await fetchPullRequestByHeadFromGh(
					this.execGh,
					{
						owner: repo.owner,
						name: repo.name,
					},
					head,
				);
			} catch (ghError) {
				console.warn(
					"[host-service:pull-request-runtime] gh PR head lookup failed; falling back to Octokit",
					{
						owner: repo.owner,
						name: repo.name,
						head,
						error: ghError,
					},
				);
				const octokit = await this.github();
				return fetchPullRequestByHead(
					octokit,
					{
						owner: repo.owner,
						name: repo.name,
					},
					head,
				);
			}
		})();
		// Observer to silence unhandledRejection warnings; real consumers
		// observe the rejection via their own await on the cached promise.
		promise.catch(() => {});
		// Keep failed promises cached for the full TTL so subsequent polls
		// share the rejection without firing new GitHub calls. Evicting on
		// every error caused a self-perpetuating storm under rate-limit /
		// abuse-detection responses: the failure invalidated the cache, the
		// next 20s tick retried, hit the same 403, and re-evicted. Network
		// blips heal at the next TTL boundary instead.
		this.pullRequestHeadCache.set(cacheKey, { promise, fetchedAt });
		return promise;
	}

	private async fetchRepoPullRequests(
		projectId: string,
		repo: NormalizedRepoIdentity,
		wantedRefs: Map<string, GitHubPullRequestHeadRef>,
		options: { bypassCache?: boolean } = {},
	): Promise<{
		matched: Map<string, { id: string }>;
		failedKeys: Set<string>;
	}> {
		const matched = new Map<string, { id: string }>();
		const failedKeys = new Set<string>();
		if (wantedRefs.size === 0) return { matched, failedKeys };

		const latestByKey = new Map<string, GitHubPullRequestNode>();
		await Promise.all(
			Array.from(wantedRefs.entries()).map(async ([key, head]) => {
				try {
					const node = await this.getCachedPullRequestByHead(
						repo,
						head,
						options,
					);
					if (!node) return;

					const nodeKey = upstreamKey(
						node.headRepositoryOwner?.login ?? null,
						node.headRepository?.name ?? null,
						node.headRefName,
					);
					if (nodeKey === key) latestByKey.set(key, node);
				} catch (error) {
					failedKeys.add(key);
					console.warn(
						"[host-service:pull-request-runtime] Failed to fetch PR by head",
						{
							projectId,
							owner: repo.owner,
							name: repo.name,
							head,
							error,
						},
					);
				}
			}),
		);

		const now = Date.now();

		const checksByNumber = new Map<
			number,
			Awaited<ReturnType<typeof fetchPullRequestChecks>>
		>();
		const reviewDecisionByNumber = new Map<
			number,
			GitHubPullRequestReviewDecision
		>();
		let octokitPromise: Promise<Octokit> | null = null;
		await Promise.all(
			Array.from(latestByKey.values()).map(async (node) => {
				try {
					const [reviewDecision, checks] = await Promise.all([
						fetchPullRequestReviewDecisionFromGh(
							this.execGh,
							repo,
							node.number,
							node.state,
						),
						fetchPullRequestChecksFromGh(this.execGh, repo, node.headRefOid),
					]);
					reviewDecisionByNumber.set(node.number, reviewDecision);
					checksByNumber.set(node.number, checks);
				} catch (ghError) {
					try {
						octokitPromise ??= this.github();
						const octokit = await octokitPromise;
						const [reviewDecision, checks] = await Promise.all([
							fetchPullRequestReviewDecision(
								octokit,
								repo,
								node.number,
								node.state,
							),
							fetchPullRequestChecks(octokit, repo, node.headRefOid),
						]);
						reviewDecisionByNumber.set(node.number, reviewDecision);
						checksByNumber.set(node.number, checks);
					} catch (error) {
						console.warn(
							"[host-service:pull-request-runtime] Failed to fetch PR review/check state",
							{
								projectId,
								owner: repo.owner,
								name: repo.name,
								prNumber: node.number,
								ghError,
								error,
							},
						);
					}
				}
			}),
		);

		for (const [key, node] of latestByKey) {
			const existing = this.findPullRequestRow(repo, node.number);
			const checks = checksByNumber.has(node.number)
				? parseCheckContexts(checksByNumber.get(node.number) ?? [])
				: parseChecksJson(existing?.checksJson ?? null);
			const reviewDecision = reviewDecisionByNumber.has(node.number)
				? mapReviewDecision(reviewDecisionByNumber.get(node.number) ?? null)
				: coerceReviewDecision(existing?.reviewDecision ?? null);
			const rowId = this.upsertPullRequestRow({
				existing,
				projectId,
				prNumber: node.number,
				repo,
				url: node.url,
				title: node.title,
				state: mapPullRequestState(node.state, node.isDraft),
				isDraft: node.isDraft,
				headBranch: node.headRefName,
				headSha: node.headRefOid,
				reviewDecision,
				checksStatus: computeChecksStatus(checks),
				checksJson: JSON.stringify(checks),
				lastFetchedAt: now,
				error: null,
				now,
			});

			matched.set(key, { id: rowId });
		}

		return { matched, failedKeys };
	}
}
