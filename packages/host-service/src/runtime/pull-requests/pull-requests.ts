import { randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { and, eq, inArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import { projects, pullRequests, workspaces } from "../../db/schema";
import type { GitFactory } from "../git";
import { fetchRepositoryPullRequests } from "./utils/github-query";
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

const BRANCH_SYNC_INTERVAL_MS = 30_000;
const PROJECT_REFRESH_INTERVAL_MS = 10_000;
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
	git: GitFactory;
	github: () => Promise<Octokit>;
}

interface NormalizedRepoIdentity {
	provider: RepoProvider;
	owner: string;
	name: string;
	url: string;
	remoteName: string;
}

export class PullRequestRuntimeManager {
	private readonly db: HostDb;
	private readonly git: GitFactory;
	private readonly github: () => Promise<Octokit>;
	private branchSyncTimer: ReturnType<typeof setInterval> | null = null;
	private projectRefreshTimer: ReturnType<typeof setInterval> | null = null;
	private readonly inFlightProjects = new Map<string, Promise<void>>();
	private readonly nextProjectRefreshAt = new Map<string, number>();

	constructor(options: PullRequestRuntimeManagerOptions) {
		this.db = options.db;
		this.git = options.git;
		this.github = options.github;
	}

	start() {
		if (this.branchSyncTimer || this.projectRefreshTimer) return;

		this.branchSyncTimer = setInterval(() => {
			void this.syncWorkspaceBranches();
		}, BRANCH_SYNC_INTERVAL_MS);
		this.projectRefreshTimer = setInterval(() => {
			void this.refreshEligibleProjects();
		}, PROJECT_REFRESH_INTERVAL_MS);

		void this.syncWorkspaceBranches();
		void this.refreshEligibleProjects(true);
	}

	stop() {
		if (this.branchSyncTimer) clearInterval(this.branchSyncTimer);
		if (this.projectRefreshTimer) clearInterval(this.projectRefreshTimer);
		this.branchSyncTimer = null;
		this.projectRefreshTimer = null;
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
			projectIds.map((projectId) => this.refreshProject(projectId, true)),
		);
	}

	private async syncWorkspaceBranches(): Promise<void> {
		const allWorkspaces = this.db.select().from(workspaces).all();
		const changedProjectIds = new Set<string>();

		for (const workspace of allWorkspaces) {
			try {
				const git = await this.git(workspace.worktreePath);
				const branch = await getCurrentBranchName(git);
				if (!branch) {
					continue;
				}
				const headSha = await getHeadSha(git);
				const upstream = await resolveWorkspaceUpstream(git, branch);
				const upstreamOwner = upstream?.owner ?? null;
				const upstreamRepo = upstream?.name ?? null;
				const upstreamBranch = upstream?.branch ?? null;

				if (
					branch === workspace.branch &&
					headSha === workspace.headSha &&
					upstreamOwner === workspace.upstreamOwner &&
					upstreamRepo === workspace.upstreamRepo &&
					upstreamBranch === workspace.upstreamBranch
				) {
					continue;
				}

				this.db
					.update(workspaces)
					.set({
						branch,
						headSha,
						upstreamOwner,
						upstreamRepo,
						upstreamBranch,
					})
					.where(eq(workspaces.id, workspace.id))
					.run();

				changedProjectIds.add(workspace.projectId);
			} catch (error) {
				console.warn(
					"[host-service:pull-request-runtime] Failed to sync workspace branch",
					{
						workspaceId: workspace.id,
						worktreePath: workspace.worktreePath,
						error,
					},
				);
			}
		}

		await Promise.all(
			[...changedProjectIds].map((projectId) =>
				this.refreshProject(projectId, true),
			),
		);
	}

	private async refreshEligibleProjects(force = false): Promise<void> {
		const rows = this.db
			.select({
				projectId: workspaces.projectId,
			})
			.from(workspaces)
			.all();
		const projectIds = [...new Set(rows.map((row) => row.projectId))];
		await Promise.all(
			projectIds.map((projectId) => this.refreshProject(projectId, force)),
		);
	}

	private async refreshProject(
		projectId: string,
		force = false,
	): Promise<void> {
		const now = Date.now();
		const existing = this.inFlightProjects.get(projectId);
		if (existing) {
			await existing;
			return;
		}

		const nextEligibleRefreshAt = this.nextProjectRefreshAt.get(projectId) ?? 0;
		if (!force && nextEligibleRefreshAt > now) {
			return;
		}

		const refreshPromise = this.performProjectRefresh(projectId)
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
				this.nextProjectRefreshAt.set(
					projectId,
					Date.now() + PROJECT_REFRESH_INTERVAL_MS,
				);
			});

		this.inFlightProjects.set(projectId, refreshPromise);
		await refreshPromise;
	}

	private async performProjectRefresh(projectId: string): Promise<void> {
		const repo = await this.getProjectRepository(projectId);
		if (!repo) return;

		const projectWorkspaces = this.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.projectId, projectId))
			.all();
		if (projectWorkspaces.length === 0) return;

		const wantedKeys = new Set<string>();
		for (const workspace of projectWorkspaces) {
			const key = upstreamKey(
				workspace.upstreamOwner,
				workspace.upstreamRepo,
				workspace.upstreamBranch ?? workspace.branch,
			);
			if (key) wantedKeys.add(key);
		}

		const keyToPullRequest = await this.fetchRepoPullRequests(
			projectId,
			repo,
			wantedKeys,
		);

		for (const workspace of projectWorkspaces) {
			const key = upstreamKey(
				workspace.upstreamOwner,
				workspace.upstreamRepo,
				workspace.upstreamBranch ?? workspace.branch,
			);
			const match = key ? keyToPullRequest.get(key) : undefined;
			this.db
				.update(workspaces)
				.set({ pullRequestId: match?.id ?? null })
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

	private async fetchRepoPullRequests(
		projectId: string,
		repo: NormalizedRepoIdentity,
		wantedKeys: Set<string>,
	): Promise<Map<string, { id: string }>> {
		if (wantedKeys.size === 0) return new Map();

		const octokit = await this.github();
		const nodes = await fetchRepositoryPullRequests(octokit, {
			owner: repo.owner,
			name: repo.name,
		});

		const latestByKey = new Map<string, (typeof nodes)[number]>();

		for (const node of nodes) {
			const key = upstreamKey(
				node.headRepositoryOwner?.login ?? null,
				node.headRepository?.name ?? null,
				node.headRefName,
			);
			if (!key || !wantedKeys.has(key)) continue;
			const existing = latestByKey.get(key);
			if (
				!existing ||
				new Date(node.updatedAt).getTime() >
					new Date(existing.updatedAt).getTime()
			) {
				latestByKey.set(key, node);
			}
		}

		const keyToRow = new Map<string, { id: string }>();
		const now = Date.now();

		for (const [key, node] of latestByKey) {
			const existing = this.db.query.pullRequests
				.findFirst({
					where: and(
						eq(pullRequests.repoProvider, repo.provider),
						eq(pullRequests.repoOwner, repo.owner),
						eq(pullRequests.repoName, repo.name),
						eq(pullRequests.prNumber, node.number),
					),
				})
				.sync();

			const rowId = existing?.id ?? randomUUID();
			const checks = parseCheckContexts(
				node.statusCheckRollup?.contexts?.nodes ?? [],
			);
			const data = {
				projectId,
				repoProvider: repo.provider,
				repoOwner: repo.owner,
				repoName: repo.name,
				prNumber: node.number,
				url: node.url,
				title: node.title,
				state: mapPullRequestState(node.state, node.isDraft),
				isDraft: node.isDraft,
				headBranch: node.headRefName,
				headSha: node.headRefOid,
				reviewDecision: mapReviewDecision(node.reviewDecision),
				checksStatus: computeChecksStatus(checks),
				checksJson: JSON.stringify(checks),
				lastFetchedAt: now,
				error: null,
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

			keyToRow.set(key, { id: rowId });
		}

		return keyToRow;
	}
}
