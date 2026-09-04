import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Octokit } from "@octokit/rest";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { HostDb } from "../../db";
import {
	projects,
	pullRequests,
	workspacePullRequests,
	workspaces,
} from "../../db/schema";
import type { EventBus } from "../../events/event-bus";
import type { GitWatcher } from "../../events/git-watcher";
import type { ExecGh } from "../../trpc/router/workspace-creation/utils/exec-gh";
import { type GitFactory, resolveDefaultBranchName } from "../git";
import {
	fetchOpenPullRequests,
	fetchOpenPullRequestsFromGh,
	fetchPullRequestByHead,
	fetchPullRequestByHeadFromGh,
	fetchPullRequestChecks,
	fetchPullRequestChecksFromGh,
	fetchPullRequestMergeQueueState,
	fetchPullRequestMergeQueueStateFromGh,
	fetchPullRequestReviewDecision,
	fetchPullRequestReviewDecisionFromGh,
	parseMergedAt,
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
import {
	readWorkspaceRefs,
	type WorkspaceRefsSnapshot,
} from "./utils/workspace-refs";

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
// A fetch that keeps failing (payload over maxBuffer, revoked auth, …) must
// not respawn `gh` at full cadence forever: each consecutive failure doubles
// the effective TTL of the cached rejection, capped here.
const REPO_PULL_REQUEST_CACHE_MAX_TTL_MS = 30 * 60_000;
// Re-probe cadence for worktrees observed missing on disk. existsSync-only —
// cheap enough to run every tick; spawning git against a missing dir is not.
const MISSING_WORKTREE_PROBE_INTERVAL_MS = 30_000;
// Dedup + link-assignment key. Branch stays case-sensitive: `feature` and
// `Feature` are distinct branches with distinct PRs, so collapsing them here
// would mislink. Case drift is tolerated only in the fallback in
// `fetchRepoPullRequests`, never in this key.
function upstreamKey(
	owner: string | null,
	repo: string | null,
	branch: string,
): string | null {
	if (!owner || !repo) return null;
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
	/** GitHub merge time when available, observation time only as fallback; epoch ms. Never cleared once set. */
	mergedAt: number | null;
}

export interface PullRequestWorkspaceSnapshot {
	workspaceId: string;
	pullRequest: PullRequestStateSnapshot | null;
	error: string | null;
	lastFetchedAt: string | null;
}

export interface WorkspacePullRequestHistoryEntry {
	repoOwner: string;
	repoName: string;
	number: number;
	url: string;
	title: string;
	state: PullRequestState;
	isDraft: boolean;
	headBranch: string;
	reviewDecision: ReviewDecision;
	checksStatus: ChecksStatus;
	/** GitHub merge time when available, observation time only as fallback; epoch ms. Never cleared once set. */
	mergedAt: number | null;
	/** Row refresh time, epoch ms — ordering, not GitHub's own clock. */
	updatedAt: number;
	/** When this workspace first linked to the PR, epoch ms. */
	linkedAt: number;
	/** True for the PR the sidebar shows: the one on the current branch. */
	isCurrent: boolean;
}

export interface WorkspacePullRequestHistory {
	workspaceId: string;
	pullRequests: WorkspacePullRequestHistoryEntry[];
}

export interface PullRequestRuntimeManagerOptions {
	db: HostDb;
	execGh: ExecGh;
	git: GitFactory;
	github: () => Promise<Octokit>;
	gitWatcher: GitWatcher;
	/** Override to run the per-workspace branch/HEAD/upstream read off the
	 * event loop (app wiring passes a worker-pool-backed reader). Defaults
	 * to reading in-process via `git`. */
	readWorkspaceRefs?: (worktreePath: string) => Promise<WorkspaceRefsSnapshot>;
	/** Test seam for the missing-worktree gate. Defaults to `existsSync`. */
	worktreeExists?: (worktreePath: string) => boolean;
}

interface NormalizedRepoIdentity {
	provider: RepoProvider;
	owner: string;
	name: string;
	url: string;
	remoteName: string;
	// Null when the repo can't be opened. Drives the default-branch link guard.
	defaultBranch: string | null;
}

type PullRequestRow = typeof pullRequests.$inferSelect;

export interface CheckoutPullRequestMetadata {
	number: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft?: boolean;
	/** GitHub's `merged_at` (ISO 8601) when the caller has it. */
	mergedAt?: string | null;
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
	private unsubscribeFromWorkspaceEvents: (() => void) | null = null;
	private readonly inFlightProjects = new Map<string, Promise<void>>();
	private readonly workspaceSyncState = new Map<
		string,
		{ running: Promise<void>; rerunPending: boolean }
	>();
	private readonly pullRequestHeadCache = new Map<
		string,
		{
			promise: Promise<GitHubPullRequestNode | null>;
			fetchedAt: number;
			consecutiveFailures: number;
		}
	>();
	private readonly openPullRequestsCache = new Map<
		string,
		{
			promise: Promise<GitHubPullRequestNode[]>;
			fetchedAt: number;
			consecutiveFailures: number;
		}
	>();
	private readonly readWorkspaceRefs: (
		worktreePath: string,
	) => Promise<WorkspaceRefsSnapshot>;
	private readonly worktreeExists: (worktreePath: string) => boolean;
	// Worktrees deleted out from under us (external `rm`, crashed teardown).
	// While a workspace is listed here, sync attempts cost one existsSync and
	// spawn no git; the probe timer re-enters the normal sync path when the
	// directory reappears. One log line per transition, never per attempt.
	private readonly missingWorktrees = new Map<string, string>();
	private missingWorktreeProbeTimer: ReturnType<typeof setInterval> | null =
		null;

	constructor(options: PullRequestRuntimeManagerOptions) {
		this.db = options.db;
		this.execGh = options.execGh;
		this.git = options.git;
		this.github = options.github;
		this.gitWatcher = options.gitWatcher;
		this.readWorkspaceRefs =
			options.readWorkspaceRefs ??
			(async (worktreePath) => readWorkspaceRefs(await this.git(worktreePath)));
		this.worktreeExists = options.worktreeExists ?? existsSync;
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
		//
		// Deliberately never calls `gitWatcher.watchWorkspace()` here: this
		// manager cares about every non-session workspace (see
		// `syncWorkspaceBranches`'s scan below), the same scope `GitWatcher`
		// used to watch unconditionally before #6729/#6848. Establishing that
		// same interest here would put every workspace back under a live
		// fs.watch permanently, regardless of whether any renderer is looking
		// at it — reintroducing the exact watcher/subprocess fan-out #6848
		// fixed, just from a different caller. So for a workspace no renderer
		// currently watches, branch/HEAD/upstream sync degrades to the
		// `SAFETY_NET_INTERVAL_MS` sweep below instead of firing instantly —
		// an accepted staleness tradeoff, not a gap to close by watching more.
		this.unsubscribeFromGitWatcher = this.gitWatcher.onChanged((event) => {
			void this.enqueueWorkspaceSync(event.workspaceId);
		});

		// Long-cadence safety net for `GitWatcher` overflow / error paths, and —
		// per the comment above — the primary (not just backup) sync path for
		// any workspace nobody currently holds a live git-watch on.
		this.safetyNetTimer = setInterval(() => {
			void this.syncWorkspaceBranches();
		}, SAFETY_NET_INTERVAL_MS);
		this.projectRefreshTimer = setInterval(() => {
			void this.refreshEligibleProjects();
		}, PROJECT_REFRESH_INTERVAL_MS);
	}

	// A brand-new worktree is git-idle, so `GitWatcher` never fires for it and
	// its row (NULL upstream/head) is invisible to PR matching until the 5-min
	// safety net. Reacting to `created` closes that gap via the same coalesced
	// sync path. Wired post-construction because app.ts builds the EventBus
	// after this manager. Only `created`: renames/branch edits already arrive
	// through GitWatcher, and this manager's own row writes bypass the store
	// emitters, so syncing can't re-trigger itself.
	subscribeToWorkspaceEvents(
		eventBus: Pick<EventBus, "onWorkspaceChanged">,
	): void {
		if (this.unsubscribeFromWorkspaceEvents) return;
		this.unsubscribeFromWorkspaceEvents = eventBus.onWorkspaceChanged(
			(event) => {
				if (event.eventType !== "created") return;
				void this.enqueueWorkspaceSync(event.workspaceId);
			},
		);
	}

	stop() {
		if (this.safetyNetTimer) clearInterval(this.safetyNetTimer);
		if (this.projectRefreshTimer) clearInterval(this.projectRefreshTimer);
		if (this.missingWorktreeProbeTimer)
			clearInterval(this.missingWorktreeProbeTimer);
		this.unsubscribeFromGitWatcher?.();
		this.unsubscribeFromWorkspaceEvents?.();
		this.safetyNetTimer = null;
		this.projectRefreshTimer = null;
		this.missingWorktreeProbeTimer = null;
		this.missingWorktrees.clear();
		this.unsubscribeFromGitWatcher = null;
		this.unsubscribeFromWorkspaceEvents = null;
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
				pullRequestMergedAt: pullRequests.mergedAt,
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
							mergedAt: row.pullRequestMergedAt ?? null,
						}
					: null,
			error: row.pullRequestError ?? null,
			lastFetchedAt: row.pullRequestLastFetchedAt
				? new Date(row.pullRequestLastFetchedAt).toISOString()
				: null,
		}));
	}

	/**
	 * Every PR each workspace has ever been linked to, currently-linked one
	 * first and then newest link first. Suppressed ("Remove PR Link") PRs stay
	 * listed — suppression governs the sidebar pointer, not the history.
	 */
	async getPullRequestHistoryByWorkspaces(
		workspaceIds: string[],
	): Promise<WorkspacePullRequestHistory[]> {
		if (workspaceIds.length === 0) return [];

		const rows = this.db
			.select({
				workspaceId: workspacePullRequests.workspaceId,
				linkedAt: workspacePullRequests.linkedAt,
				currentPullRequestId: workspaces.pullRequestId,
				pullRequestRowId: pullRequests.id,
				repoOwner: pullRequests.repoOwner,
				repoName: pullRequests.repoName,
				prNumber: pullRequests.prNumber,
				url: pullRequests.url,
				title: pullRequests.title,
				state: pullRequests.state,
				isDraft: pullRequests.isDraft,
				headBranch: pullRequests.headBranch,
				reviewDecision: pullRequests.reviewDecision,
				checksStatus: pullRequests.checksStatus,
				mergedAt: pullRequests.mergedAt,
				updatedAt: pullRequests.updatedAt,
			})
			.from(workspacePullRequests)
			.innerJoin(
				pullRequests,
				eq(workspacePullRequests.pullRequestId, pullRequests.id),
			)
			.innerJoin(
				workspaces,
				eq(workspacePullRequests.workspaceId, workspaces.id),
			)
			.where(inArray(workspacePullRequests.workspaceId, workspaceIds))
			.all();

		const byWorkspace = new Map<string, WorkspacePullRequestHistoryEntry[]>();
		for (const row of rows) {
			const entry: WorkspacePullRequestHistoryEntry = {
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				number: row.prNumber,
				url: row.url,
				title: row.title,
				state: coercePullRequestState(row.state),
				isDraft: row.isDraft,
				headBranch: row.headBranch,
				reviewDecision: coerceReviewDecision(row.reviewDecision),
				checksStatus: coerceChecksStatus(row.checksStatus),
				mergedAt: row.mergedAt ?? null,
				updatedAt: row.updatedAt,
				linkedAt: row.linkedAt,
				isCurrent: row.pullRequestRowId === row.currentPullRequestId,
			};
			const list = byWorkspace.get(row.workspaceId);
			if (list) list.push(entry);
			else byWorkspace.set(row.workspaceId, [entry]);
		}

		return workspaceIds.map((workspaceId) => {
			const entries = byWorkspace.get(workspaceId) ?? [];
			entries.sort((a, b) => {
				if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
				return b.linkedAt - a.linkedAt;
			});
			return { workspaceId, pullRequests: entries };
		});
	}

	async refreshPullRequestsByWorkspaces(workspaceIds: string[]): Promise<void> {
		if (workspaceIds.length === 0) return;

		const rows = this.db
			.select()
			.from(workspaces)
			.where(inArray(workspaces.id, workspaceIds))
			.all();

		// Session workspaces (null projectId) have no remote to sync; archived
		// workspaces keep their PR state frozen at destroy time.
		const active = rows.filter(
			(row) => row.archivedAt == null && row.projectId != null,
		);

		// Re-read each workspace's git refs before matching: callers hit this
		// right after changing git state (first push, PR create, merge), and
		// the project refresh matches PRs by the row's recorded upstream — a
		// stale row (e.g. still tracking the base branch it forked from) would
		// miss the freshly created PR entirely until the next watcher sweep.
		// Through the per-workspace queue, so an overlapping watcher sync can't
		// interleave with this read+write and clobber the newer snapshot.
		await Promise.all(
			active.map((workspace) =>
				this.enqueueWorkspaceSync(workspace.id).catch(() => null),
			),
		);

		const projectIds = [
			...new Set(
				active.map((row) => row.projectId).filter((id) => id !== null),
			),
		];
		await Promise.all(
			projectIds.map((projectId) =>
				this.refreshProject(projectId, { bypassCache: true }),
			),
		);
	}

	// User-initiated "Remove PR Link". Recording the removed PR id keeps the
	// refresh sweep from re-linking it while its branch still matches; a
	// different PR on the branch (or an explicit re-link) still links.
	unlinkWorkspacePullRequest(workspaceId: string): void {
		const workspace = this.db
			.select({ pullRequestId: workspaces.pullRequestId })
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (!workspace?.pullRequestId) return;

		this.db
			.update(workspaces)
			.set({
				pullRequestId: null,
				suppressedPullRequestId: workspace.pullRequestId,
			})
			.where(eq(workspaces.id, workspaceId))
			.run();
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
			mergedAt: parseMergedAt(pullRequest.mergedAt ?? null),
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
				// An explicit checkout link overrides an earlier "Remove PR Link".
				suppressedPullRequestId: null,
				headSha: pullRequest.headRefOid,
				upstreamOwner: upstream?.owner ?? null,
				upstreamRepo: upstream?.name ?? null,
				upstreamBranch: upstream?.branch ?? null,
			})
			.where(eq(workspaces.id, workspaceId))
			.run();
		this.recordWorkspacePullRequestLink(workspaceId, rowId, now);

		return rowId;
	}

	/**
	 * Append-only memory of every PR a workspace has been linked to. The
	 * current-link pointer moves on when the branch does; this row stays, so
	 * the workspace's whole PR history remains listable. Unlinking hides a PR
	 * from the sidebar surfaces, never from here.
	 */
	private recordWorkspacePullRequestLink(
		workspaceId: string,
		pullRequestId: string,
		linkedAt: number,
	): void {
		this.db
			.insert(workspacePullRequests)
			.values({ workspaceId, pullRequestId, linkedAt })
			.onConflictDoNothing()
			.run();
	}

	private async syncWorkspaceBranches(): Promise<void> {
		// Route every workspace through the same per-workspace queue as the
		// watcher path, so a concurrent watcher-triggered sync can't race the
		// sweep's read+write and clobber the newer snapshot. enqueueWorkspaceSync
		// coalesces — if a sync is already running for a workspace, this just
		// flips its rerunPending flag.
		// Session workspaces (null projectId) have no remote and no PRs, and
		// archived workspaces are frozen. Filtered in JS: the unit-test fakes
		// stub select().from().all() without a where() builder.
		const ids = this.db
			.select({
				id: workspaces.id,
				projectId: workspaces.projectId,
				archivedAt: workspaces.archivedAt,
			})
			.from(workspaces)
			.all()
			.filter((row) => row.projectId !== null && row.archivedAt == null);

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
		if (!workspace) {
			this.forgetMissingWorktree(workspaceId);
			return;
		}
		// Session workspaces (null projectId) have no remote and no PRs; the
		// GitWatcher still fires for their repos, so gate here too. Archived
		// workspaces are frozen tombstones — never resync or relink them.
		if (workspace.projectId === null || workspace.archivedAt !== null) {
			this.forgetMissingWorktree(workspaceId);
			return;
		}

		const projectId = await this.syncWorkspaceRow(workspace);
		if (projectId) await this.refreshProject(projectId);
	}

	private async syncWorkspaceRow(
		workspace: typeof workspaces.$inferSelect,
	): Promise<string | null> {
		// A worktree deleted outside the app is a routine lifecycle state, not
		// an error to retry: skip the git spawn entirely until the directory is
		// back on disk (external restore, workspace repair).
		if (!this.worktreeExists(workspace.worktreePath)) {
			this.noteWorktreeMissing(workspace.id, workspace.worktreePath);
			return null;
		}
		this.noteWorktreePresent(workspace.id);
		try {
			const { branch, headSha, upstream } = await this.readWorkspaceRefs(
				workspace.worktreePath,
			);
			if (!branch) return null;

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
					...(branch !== workspace.branch ? { updatedAt: Date.now() } : {}),
				})
				// Guard: the workspace can archive during the awaited ref read;
				// a tombstone's branch/PR link is frozen.
				.where(
					and(eq(workspaces.id, workspace.id), isNull(workspaces.archivedAt)),
				)
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

	private noteWorktreeMissing(workspaceId: string, worktreePath: string): void {
		if (this.missingWorktrees.has(workspaceId)) return;
		this.missingWorktrees.set(workspaceId, worktreePath);
		console.warn(
			"[host-service:pull-request-runtime] Worktree missing on disk; pausing branch sync until it reappears",
			{ workspaceId, worktreePath },
		);
		this.missingWorktreeProbeTimer ??= setInterval(() => {
			for (const [id, path] of this.missingWorktrees) {
				if (this.worktreeExists(path)) void this.enqueueWorkspaceSync(id);
			}
		}, MISSING_WORKTREE_PROBE_INTERVAL_MS);
	}

	private noteWorktreePresent(workspaceId: string): void {
		const worktreePath = this.missingWorktrees.get(workspaceId);
		if (worktreePath === undefined) return;
		this.forgetMissingWorktree(workspaceId);
		console.warn(
			"[host-service:pull-request-runtime] Worktree reappeared; resuming branch sync",
			{ workspaceId, worktreePath },
		);
	}

	private forgetMissingWorktree(workspaceId: string): void {
		if (!this.missingWorktrees.delete(workspaceId)) return;
		if (this.missingWorktrees.size === 0 && this.missingWorktreeProbeTimer) {
			clearInterval(this.missingWorktreeProbeTimer);
			this.missingWorktreeProbeTimer = null;
		}
	}

	private async refreshEligibleProjects(): Promise<void> {
		const rows = this.db
			.select({
				projectId: workspaces.projectId,
				archivedAt: workspaces.archivedAt,
			})
			.from(workspaces)
			.all();
		// Session workspaces (null projectId) have no remote to sync; archived
		// workspaces are frozen. Filtered in JS for the same fake-friendly
		// reason as syncWorkspaceBranches.
		const projectIds = [
			...new Set(
				rows
					.filter((row) => row.archivedAt == null)
					.map((row) => row.projectId)
					.filter((id) => id !== null),
			),
		];
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
			.all()
			// JS-filtered like the sweeps: archived rows keep their frozen PR
			// link; refreshing them could clear it (e.g. branch deleted).
			.filter((workspace) => workspace.archivedAt == null);
		if (projectWorkspaces.length === 0) return;

		const wantedRefs = new Map<string, GitHubPullRequestHeadRef>();
		for (const workspace of projectWorkspaces) {
			const upstreamOwner = workspace.upstreamOwner;
			const upstreamRepo = workspace.upstreamRepo;
			const upstreamBranch = workspace.upstreamBranch ?? workspace.branch;
			const key = this.effectiveUpstreamKey(workspace, repo);
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
			const key = this.effectiveUpstreamKey(workspace, repo);
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
						.where(
							and(
								eq(workspaces.id, workspace.id),
								isNull(workspaces.archivedAt),
							),
						)
						.run();
				}
				continue;
			}
			const rawMatch = keyToPullRequest.get(key);
			// A PR the user unlinked stays unlinked; a different PR still links.
			const match =
				rawMatch?.id === workspace.suppressedPullRequestId
					? undefined
					: rawMatch;
			if (match) {
				this.db
					.update(workspaces)
					.set({ pullRequestId: match.id })
					.where(
						and(eq(workspaces.id, workspace.id), isNull(workspaces.archivedAt)),
					)
					.run();
				// The sweep re-asserts the link every pass, so this also heals
				// history rows for links that predate the table.
				this.recordWorkspacePullRequestLink(workspace.id, match.id, Date.now());
				continue;
			}

			if (failedKeys.has(key)) continue;

			if (workspace.pullRequestId) {
				this.db
					.update(workspaces)
					.set({ pullRequestId: null })
					.where(
						and(eq(workspaces.id, workspace.id), isNull(workspaces.archivedAt)),
					)
					.run();
			}
		}
	}

	private async getProjectRepository(
		projectId: string,
	): Promise<NormalizedRepoIdentity | null> {
		const project = this.db.query.projects
			.findFirst({ where: eq(projects.id, projectId) })
			.sync();
		if (!project) return null;

		let identity: Omit<NormalizedRepoIdentity, "defaultBranch">;
		if (
			project.repoProvider === "github" &&
			project.repoOwner &&
			project.repoName &&
			project.repoUrl &&
			project.remoteName
		) {
			identity = {
				provider: "github",
				owner: project.repoOwner,
				name: project.repoName,
				url: project.repoUrl,
				remoteName: project.remoteName,
			};
		} else {
			const remoteName = "origin";
			let remoteUrl: string;
			// The construct sits inside the try: a repoPath that vanished from
			// disk throws GitConstructError, which is "no repo" here, not a
			// refresh failure to warn about every sweep.
			try {
				const git = await this.git(project.repoPath);
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

			identity = { ...parsedRemote, remoteName };
		}

		const defaultBranch = await this.resolveDefaultBranch(project.repoPath);
		return { ...identity, defaultBranch };
	}

	// Shared origin/HEAD resolver; a repo-open failure disables the guard
	// rather than aborting the whole refresh.
	private async resolveDefaultBranch(repoPath: string): Promise<string | null> {
		try {
			return await resolveDefaultBranchName(await this.git(repoPath));
		} catch {
			return null;
		}
	}

	// Guard: a workspace that merely tracks `origin/<default>` (branched off it,
	// never pushed) must not key on `<default>` and grab a head=<default> PR —
	// only its own default-branch workspace may. Base repo only, so fork /
	// `gh pr checkout` renames whose head is `<default>` still link.
	private effectiveUpstreamKey(
		workspace: typeof workspaces.$inferSelect,
		repo: NormalizedRepoIdentity,
	): string | null {
		const upstreamBranch = workspace.upstreamBranch ?? workspace.branch;
		if (
			repo.defaultBranch &&
			upstreamBranch === repo.defaultBranch &&
			workspace.branch !== repo.defaultBranch &&
			workspace.upstreamOwner?.toLowerCase() === repo.owner.toLowerCase() &&
			workspace.upstreamRepo?.toLowerCase() === repo.name.toLowerCase()
		) {
			return null;
		}
		return upstreamKey(
			workspace.upstreamOwner,
			workspace.upstreamRepo,
			upstreamBranch,
		);
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
		mergedAt,
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
		/** GitHub's merged_at as epoch ms; null when the source has none. */
		mergedAt: number | null;
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
			// GitHub's merged_at wins, so a PR merged on day D but first seen on
			// D+3 is attributed to D. A row stamped at observation time heals
			// when that PR head is fetched again; fetches cover heads of
			// unarchived active workspaces, so other rows keep what they have.
			// The stored value is the fallback for a source with no usable
			// timestamp; a merged row with neither takes the observation time,
			// keeping every merged row visible to "merged in the last N days"
			// windows.
			mergedAt:
				mergedAt ?? existing?.mergedAt ?? (state === "merged" ? now : null),
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

	// Keep failed promises cached for the full TTL so subsequent polls share
	// the rejection without firing new GitHub calls. Evicting on every error
	// caused a self-perpetuating storm under rate-limit / abuse-detection
	// responses: the failure invalidated the cache, the next 20s tick
	// retried, hit the same 403, and re-evicted. Network blips heal at the
	// next TTL boundary instead.
	private cachedGitHubFetch<T>(
		cache: Map<
			string,
			{ promise: Promise<T>; fetchedAt: number; consecutiveFailures: number }
		>,
		cacheKey: string,
		options: { bypassCache?: boolean },
		fetcher: () => Promise<T>,
	): Promise<T> {
		const cached = cache.get(cacheKey);
		if (!options.bypassCache && cached) {
			const ttl = Math.min(
				REPO_PULL_REQUEST_CACHE_TTL_MS * 2 ** cached.consecutiveFailures,
				REPO_PULL_REQUEST_CACHE_MAX_TTL_MS,
			);
			if (Date.now() - cached.fetchedAt < ttl) {
				return cached.promise;
			}
		}

		// Carry the failure streak forward so an in-flight retry keeps the
		// backed-off TTL until it actually resolves.
		const entry = {
			promise: fetcher(),
			fetchedAt: Date.now(),
			consecutiveFailures: cached?.consecutiveFailures ?? 0,
		};
		// The rejection observer also silences unhandledRejection warnings;
		// real consumers observe it via their own await on the cached promise.
		entry.promise.then(
			() => {
				entry.consecutiveFailures = 0;
			},
			() => {
				// Re-anchor at the failure: a fetch that out-lives its own backoff
				// window before rejecting must not be retried immediately.
				entry.fetchedAt = Date.now();
				entry.consecutiveFailures += 1;
			},
		);
		cache.set(cacheKey, entry);
		return entry.promise;
	}

	private async getCachedPullRequestByHead(
		repo: NormalizedRepoIdentity,
		head: GitHubPullRequestHeadRef,
		options: { bypassCache?: boolean } = {},
	): Promise<GitHubPullRequestNode | null> {
		// Branch stays case-sensitive so two case-variant branches can't share
		// a cache entry and return each other's PR.
		const cacheKey = [
			repo.owner.toLowerCase(),
			repo.name.toLowerCase(),
			head.owner.toLowerCase(),
			head.repo.toLowerCase(),
			head.branch,
		].join("/");
		return this.cachedGitHubFetch(
			this.pullRequestHeadCache,
			cacheKey,
			options,
			async () => {
				try {
					return await fetchPullRequestByHeadFromGh(
						this.execGh,
						{ owner: repo.owner, name: repo.name },
						head,
					);
				} catch (ghError) {
					console.warn(
						"[host-service:pull-request-runtime] gh PR head lookup failed; falling back to Octokit",
						{ owner: repo.owner, name: repo.name, head, error: ghError },
					);
					const octokit = await this.github();
					return fetchPullRequestByHead(
						octokit,
						{ owner: repo.owner, name: repo.name },
						head,
					);
				}
			},
		);
	}

	// Deliberately narrow: repo-wide listing was removed in #4268/#4291 (the
	// GraphQL sweep 504'd on large repos). This is a shallow `pulls?state=open`
	// page, no checks, once per repo per TTL, only when a per-head lookup missed.
	private async getCachedOpenPullRequests(
		repo: NormalizedRepoIdentity,
		options: { bypassCache?: boolean } = {},
	): Promise<GitHubPullRequestNode[]> {
		const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
		return this.cachedGitHubFetch(
			this.openPullRequestsCache,
			cacheKey,
			options,
			async () => {
				try {
					return await fetchOpenPullRequestsFromGh(this.execGh, {
						owner: repo.owner,
						name: repo.name,
					});
				} catch (ghError) {
					console.warn(
						"[host-service:pull-request-runtime] gh open-PR sweep failed; falling back to Octokit",
						{ owner: repo.owner, name: repo.name, error: ghError },
					);
					const octokit = await this.github();
					return fetchOpenPullRequests(octokit, {
						owner: repo.owner,
						name: repo.name,
					});
				}
			},
		);
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

		// GitHub's `head=` filter is case-sensitive on the branch component, so
		// a workspace whose local branch casing drifted from the PR's
		// headRefName gets nothing from the per-head lookups above. Sweep the
		// repo's open PRs once and fill the gaps case-insensitively.
		const unmatchedKeys = Array.from(wantedRefs.keys()).filter(
			(key) => !latestByKey.has(key) && !failedKeys.has(key),
		);
		if (unmatchedKeys.length > 0) {
			try {
				const openNodes = await this.getCachedOpenPullRequests(repo, options);
				// The one place drift is tolerated: index open PRs by a lowercased
				// key. latestByKey stays keyed by the exact workspace key, so link
				// assignment downstream is unchanged.
				const openByLowerKey = new Map<string, GitHubPullRequestNode>();
				for (const node of openNodes) {
					const nodeKey = upstreamKey(
						node.headRepositoryOwner?.login ?? null,
						node.headRepository?.name ?? null,
						node.headRefName,
					);
					if (!nodeKey) continue;
					const lower = nodeKey.toLowerCase();
					// Sweep is sorted by updated desc; first hit per key wins.
					if (!openByLowerKey.has(lower)) openByLowerKey.set(lower, node);
				}
				for (const key of unmatchedKeys) {
					const node = openByLowerKey.get(key.toLowerCase());
					if (node) latestByKey.set(key, node);
				}
			} catch (error) {
				// Treat the whole sweep as failed lookups so existing links are
				// kept rather than cleared on a transient error.
				for (const key of unmatchedKeys) failedKeys.add(key);
				console.warn(
					"[host-service:pull-request-runtime] Open-PR sweep failed",
					{ projectId, owner: repo.owner, name: repo.name, error },
				);
			}
		}

		const now = Date.now();

		const checksByNumber = new Map<
			number,
			Awaited<ReturnType<typeof fetchPullRequestChecks>>
		>();
		const reviewDecisionByNumber = new Map<
			number,
			GitHubPullRequestReviewDecision
		>();
		// Only open, non-draft PRs can sit in a merge queue, so skip the extra
		// GraphQL round-trip for everything else.
		const mergeQueueByNumber = new Map<number, boolean>();
		let octokitPromise: Promise<Octokit> | null = null;
		const getOctokit = () => {
			octokitPromise ??= this.github();
			return octokitPromise;
		};
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
						const octokit = await getOctokit();
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

				// Merge-queue detection stays on its own error boundary: only open,
				// non-draft PRs can be queued, and the `mergeQueueEntry` GraphQL field
				// is absent on older GitHub Enterprise schemas. Coupling it with the
				// review/checks fetch above would let that failure stale their data.
				if (node.state !== "OPEN" || node.isDraft) return;
				try {
					mergeQueueByNumber.set(
						node.number,
						await fetchPullRequestMergeQueueStateFromGh(
							this.execGh,
							repo,
							node.number,
						),
					);
				} catch (ghError) {
					try {
						mergeQueueByNumber.set(
							node.number,
							await fetchPullRequestMergeQueueState(
								await getOctokit(),
								repo,
								node.number,
							),
						);
					} catch (error) {
						console.warn(
							"[host-service:pull-request-runtime] Failed to fetch PR merge-queue state",
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
			const isInMergeQueue = mergeQueueByNumber.has(node.number)
				? (mergeQueueByNumber.get(node.number) ?? false)
				: coercePullRequestState(existing?.state ?? null) === "queued";
			const rowId = this.upsertPullRequestRow({
				existing,
				projectId,
				prNumber: node.number,
				repo,
				url: node.url,
				title: node.title,
				state: mapPullRequestState(node.state, node.isDraft, isInMergeQueue),
				isDraft: node.isDraft,
				headBranch: node.headRefName,
				headSha: node.headRefOid,
				mergedAt: node.mergedAt,
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
