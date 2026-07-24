import type { CheckItem } from "@superset/local-db";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostWorkspacesSource } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { derivePullRequestQueryTargets } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import {
	DEVICE_FILTER_THIS_DEVICE,
	PROJECT_FILTER_ALL,
	type V2WorkspacesDeviceFilter,
	type V2WorkspacesProjectFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { isSidebarWorkspaceVisible } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

export type V2WorkspaceHostType = "local-device" | "remote-device";

export type V2WorkspacePrState = "open" | "merged" | "closed" | "draft";

export type V2WorkspacePrReviewDecision =
	| "approved"
	| "changes_requested"
	| "pending";

export type V2WorkspacePrChecksStatus =
	| "none"
	| "pending"
	| "success"
	| "failure";

export interface V2WorkspacePrSummary {
	prNumber: number;
	title: string;
	url: string;
	state: V2WorkspacePrState;
	checksStatus: V2WorkspacePrChecksStatus;
	reviewDecision: V2WorkspacePrReviewDecision;
	checks: CheckItem[];
	additions: number;
	deletions: number;
	updatedAt: Date;
}

export interface AccessibleV2Workspace {
	id: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdAt: Date;
	createdByUserId: string | null;
	createdByName: string | null;
	createdByImage: string | null;
	isCreatedByCurrentUser: boolean;
	projectId: string;
	projectName: string;
	projectRepoId: string | null;
	projectGithubOwner: string | null;
	hostId: string;
	hostName: string;
	hostIsOnline: boolean;
	hostType: V2WorkspaceHostType;
	isInSidebar: boolean;
	pr: V2WorkspacePrSummary | null;
}

export interface V2WorkspaceHostOption {
	hostId: string;
	hostName: string;
	isOnline: boolean;
	isLocal: boolean;
}

export interface V2WorkspaceProjectOption {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	count: number;
}

export interface UseAccessibleV2WorkspacesResult {
	all: AccessibleV2Workspace[];
	/** Row-source settlement — gates empty states only, never rendered rows. */
	isReady: boolean;
	hostOptions: V2WorkspaceHostOption[];
	projectOptions: V2WorkspaceProjectOption[];
	hostsById: Map<
		string,
		{ hostName: string; isOnline: boolean; isLocal: boolean }
	>;
	projectsById: Map<
		string,
		{ projectName: string; githubOwner: string | null }
	>;
}

interface UseAccessibleV2WorkspacesOptions {
	searchQuery?: string;
	/** Omitted = no device scoping (programmatic callers like the palette). */
	deviceFilter?: V2WorkspacesDeviceFilter;
	projectFilter?: V2WorkspacesProjectFilter;
}

function workspaceMatchesSearch(
	workspace: AccessibleV2Workspace,
	searchQuery: string,
): boolean {
	if (!searchQuery.trim()) return true;
	const query = searchQuery.trim().toLowerCase();
	return (
		workspace.name.toLowerCase().includes(query) ||
		workspace.projectName.toLowerCase().includes(query) ||
		workspace.branch.toLowerCase().includes(query) ||
		workspace.hostName.toLowerCase().includes(query) ||
		(workspace.createdByName ?? "").toLowerCase().includes(query) ||
		(workspace.pr ? `#${workspace.pr.prNumber}`.includes(query) : false) ||
		(workspace.pr?.title.toLowerCase().includes(query) ?? false)
	);
}

function matchesProjectFilter(
	workspace: AccessibleV2Workspace,
	projectFilter: V2WorkspacesProjectFilter,
): boolean {
	if (projectFilter === PROJECT_FILTER_ALL) return true;
	return workspace.projectId === projectFilter;
}

function prStateFor(
	state: string,
	isDraft: boolean,
	mergedAt: Date | string | null,
): V2WorkspacePrState {
	if (mergedAt != null) return "merged";
	if (isDraft) return "draft";
	if (state === "closed") return "closed";
	return "open";
}

function reviewDecisionFor(
	raw: string | null | undefined,
): V2WorkspacePrReviewDecision {
	if (raw === "APPROVED") return "approved";
	if (raw === "CHANGES_REQUESTED") return "changes_requested";
	return "pending";
}

type RawCheckEntry = {
	name: string;
	status: string;
	conclusion: string | null;
	detailsUrl?: string;
};

function checkItemStatusFor(
	rawStatus: string,
	rawConclusion: string | null,
): CheckItem["status"] {
	if (rawStatus !== "completed") return "pending";
	switch (rawConclusion) {
		case "success":
		case "neutral":
			return "success";
		case "skipped":
			return "skipped";
		case "cancelled":
			return "cancelled";
		case "failure":
		case "timed_out":
		case "action_required":
		case "stale":
		case "startup_failure":
			return "failure";
		default:
			return "pending";
	}
}

function mapChecks(rawChecks: RawCheckEntry[] | null | undefined): CheckItem[] {
	if (!rawChecks) return [];
	return rawChecks.map((entry) => ({
		name: entry.name,
		status: checkItemStatusFor(entry.status, entry.conclusion),
		url: entry.detailsUrl,
	}));
}

// useQueries returns a fresh array each render; key the map on a content
// fingerprint so its identity only changes when the entries do.
function useStableWorkspacePrNumbers(
	entries: [string, number][],
): Map<string, number> {
	const fingerprint = useMemo(
		() => JSON.stringify([...entries].sort(([a], [b]) => a.localeCompare(b))),
		[entries],
	);
	return useMemo<Map<string, number>>(
		() => new Map(JSON.parse(fingerprint) as [string, number][]),
		[fingerprint],
	);
}

export function useAccessibleV2Workspaces(
	options: UseAccessibleV2WorkspacesOptions = {},
): UseAccessibleV2WorkspacesResult {
	const searchQuery = options.searchQuery ?? "";
	const deviceFilter = options.deviceFilter;
	const projectFilter = options.projectFilter ?? PROJECT_FILTER_ALL;
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	// With a device filter (the page), rows come from a single `workspace.list`
	// against that host — no fan-out, so ten idle hosts can't slow down or
	// silently thin out the list. Without one (palette, dev seeding), rows come
	// from the provider's already-running fan-out. Both hooks always run per the
	// rules of hooks; the unused one is passed null / left unread and does no
	// work of its own.
	const selectedHostId =
		deviceFilter === undefined
			? null
			: deviceFilter === DEVICE_FILTER_THIS_DEVICE
				? machineId
				: deviceFilter;
	const scopedSource = useHostWorkspacesSource(selectedHostId);
	const fanoutSource = useHostWorkspaces();
	const { workspaces: hostWorkspaces, isReady } =
		deviceFilter === undefined ? fanoutSource : scopedSource;

	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				name: hosts.name,
				isOnline: hosts.isOnline,
			})),
		[collections],
	);

	const { data: userHostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ userHosts: collections.v2UsersHosts })
				.where(({ userHosts }) => eq(userHosts.userId, currentUserId ?? ""))
				.select(({ userHosts }) => ({ hostId: userHosts.hostId })),
		[collections, currentUserId],
	);

	// Projects are fully local — the host fan-out is the identity source.
	const { projects: hostProjects } = useHostProjects();

	const { data: sidebarStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarState: collections.v2WorkspaceLocalState })
				.select(({ sidebarState }) => ({
					workspaceId: sidebarState.workspaceId,
					isHidden: sidebarState.sidebarState.isHidden,
				})),
		[collections],
	);

	const { data: sidebarProjectRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProject: collections.v2SidebarProjects })
				.select(({ sidebarProject }) => ({
					projectId: sidebarProject.projectId,
				})),
		[collections],
	);

	const { data: repoRows = [] } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
				name: repos.name,
			})),
		[collections],
	);

	const { data: creatorRows = [] } = useLiveQuery(
		(q) =>
			q.from({ creators: collections.users }).select(({ creators }) => ({
				id: creators.id,
				name: creators.name,
				image: creators.image,
			})),
		[collections],
	);

	// Reproduces the former Electric join: workspaces scoped to the active org,
	// inner-joined to hosts the current user can access (v2UsersHosts), their
	// project, and left-joined sidebar/repo/creator metadata.
	const rows = useMemo(() => {
		if (activeOrganizationId == null || currentUserId == null) return [];
		const hostsById = new Map(hostRows.map((host) => [host.machineId, host]));
		const accessibleHostIds = new Set(userHostRows.map((row) => row.hostId));
		const projectsById = new Map(
			hostProjects.map((project) => [project.projectKey, project]),
		);
		const sidebarStateByWorkspaceId = new Map(
			sidebarStateRows.map((row) => [row.workspaceId, row]),
		);
		const sidebarProjectIds = new Set(
			sidebarProjectRows.map((row) => row.projectId),
		);
		// Host rows carry owner/name (from the git remote), not the cloud repo
		// UUID — resolve the repo row by coordinates for PR enrichment.
		const reposByFullName = new Map(
			repoRows.map((repo) => [
				`${repo.owner}/${repo.name}`.toLowerCase(),
				repo,
			]),
		);
		const creatorsById = new Map(
			creatorRows.map((creator) => [creator.id, creator]),
		);

		return hostWorkspaces.flatMap((workspace) => {
			if (workspace.organizationId !== activeOrganizationId) return [];
			const host = hostsById.get(workspace.hostId);
			// A host-served row is its own proof of existence and access — the
			// host answered this caller's credentials. Only cloud-fallback rows
			// need the v2Hosts/v2UsersHosts gate; stale or unsynced cloud host
			// tables must not hide live host data.
			if (
				workspace.source !== "host" &&
				(!host || !accessibleHostIds.has(workspace.hostId))
			)
				return [];
			const project = projectsById.get(workspace.projectId);
			if (!project) return [];
			const sidebarState = sidebarStateByWorkspaceId.get(workspace.id);
			const repo =
				project.repoOwner && project.repoName
					? reposByFullName.get(
							`${project.repoOwner}/${project.repoName}`.toLowerCase(),
						)
					: undefined;
			const creator = workspace.createdByUserId
				? creatorsById.get(workspace.createdByUserId)
				: undefined;
			return [
				{
					id: workspace.id,
					name: workspace.name,
					branch: workspace.branch,
					type: workspace.type,
					createdAt: workspace.createdAt,
					createdByUserId: workspace.createdByUserId,
					createdByName: creator?.name ?? null,
					createdByImage: creator?.image ?? null,
					projectId: project.projectKey,
					projectName: project.name,
					projectRepoId: repo?.id ?? null,
					projectGithubOwner: project.repoOwner ?? repo?.owner ?? null,
					hostId: workspace.hostId,
					hostName:
						host?.name ??
						(workspace.hostId === machineId ? "This device" : "Unknown device"),
					hostIsOnline: host?.isOnline ?? workspace.hostReachable,
					sidebarProjectId: sidebarProjectIds.has(project.projectKey)
						? project.projectKey
						: null,
					sidebarWorkspaceId: sidebarState?.workspaceId ?? null,
					sidebarIsHidden: sidebarState?.isHidden ?? false,
				},
			];
		});
	}, [
		activeOrganizationId,
		currentUserId,
		machineId,
		hostWorkspaces,
		hostRows,
		userHostRows,
		hostProjects,
		sidebarStateRows,
		sidebarProjectRows,
		repoRows,
		creatorRows,
	]);

	// The authoritative link lives in host.db (`workspace.pullRequestId`), not
	// any collection. With host-scoped rows this derives a single target; a
	// client-side `repositoryId::branch` map mistracks on fork branch
	// collisions. Unscoped callers (palette, dev seeding) don't render PR data,
	// so skip the queries entirely rather than fanning them out per host.
	const pullRequestQueryTargets = useMemo(
		() =>
			deviceFilter === undefined
				? []
				: derivePullRequestQueryTargets({
						activeHostUrl,
						hosts: hostRows,
						machineId,
						relayUrl,
						workspaces: rows,
					}),
		[deviceFilter, activeHostUrl, hostRows, machineId, relayUrl, rows],
	);

	const pullRequestQueries = useQueries({
		queries: pullRequestQueryTargets.map((target) => ({
			queryKey: [
				"v2-workspaces",
				"pull-requests",
				target.machineId,
				target.hostUrl,
				target.workspaceIds,
			] as const,
			refetchInterval: 10_000,
			queryFn: async () => {
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.pullRequests.getByWorkspaces.query({
					workspaceIds: target.workspaceIds,
				});
			},
		})),
	});

	const prNumberEntries = useMemo<[string, number][]>(() => {
		const entries: [string, number][] = [];
		for (const query of pullRequestQueries) {
			const data = query.data;
			if (!data) continue;
			for (const row of data.workspaces) {
				if (row.pullRequest)
					entries.push([row.workspaceId, row.pullRequest.number]);
			}
		}
		return entries;
	}, [pullRequestQueries]);
	const prNumberByWorkspaceId = useStableWorkspacePrNumbers(prNumberEntries);

	const { data: prRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ prs: collections.githubPullRequests })
				.where(({ prs }) => eq(prs.organizationId, activeOrganizationId ?? ""))
				.select(({ prs }) => ({
					id: prs.id,
					repositoryId: prs.repositoryId,
					prNumber: prs.prNumber,
					title: prs.title,
					url: prs.url,
					state: prs.state,
					isDraft: prs.isDraft,
					checksStatus: prs.checksStatus,
					checks: prs.checks,
					reviewDecision: prs.reviewDecision,
					additions: prs.additions,
					deletions: prs.deletions,
					updatedAt: prs.updatedAt,
					mergedAt: prs.mergedAt,
				})),
		[collections, activeOrganizationId],
	);

	// Unique (repositoryId, prNumber) key — no branch collisions, no first-match-wins.
	const prByRepoNumber = useMemo(() => {
		const map = new Map<string, V2WorkspacePrSummary>();
		for (const row of prRows) {
			map.set(`${row.repositoryId}::${row.prNumber}`, {
				prNumber: row.prNumber,
				title: row.title,
				url: row.url,
				state: prStateFor(row.state, row.isDraft, row.mergedAt),
				checksStatus: (row.checksStatus as V2WorkspacePrChecksStatus) ?? "none",
				reviewDecision: reviewDecisionFor(row.reviewDecision),
				checks: mapChecks(row.checks as RawCheckEntry[] | null | undefined),
				additions: row.additions,
				deletions: row.deletions,
				updatedAt: new Date(row.updatedAt),
			});
		}
		return map;
	}, [prRows]);

	const enriched = useMemo<AccessibleV2Workspace[]>(() => {
		const deduped = new Map<string, AccessibleV2Workspace>();
		for (const row of rows) {
			if (deduped.has(row.id)) continue;
			const hostType: V2WorkspaceHostType =
				row.hostId === machineId ? "local-device" : "remote-device";
			const isAutoVisibleMain =
				row.type === "main" &&
				row.hostId === machineId &&
				row.sidebarProjectId != null;
			const isInSidebar =
				isSidebarWorkspaceVisible({ isHidden: row.sidebarIsHidden }) &&
				(row.sidebarWorkspaceId != null || isAutoVisibleMain);
			const prNumber = prNumberByWorkspaceId.get(row.id);
			const pr =
				row.projectRepoId != null && prNumber != null
					? (prByRepoNumber.get(`${row.projectRepoId}::${prNumber}`) ?? null)
					: null;

			deduped.set(row.id, {
				id: row.id,
				name: row.name,
				branch: row.branch,
				type: row.type,
				createdAt: new Date(row.createdAt),
				createdByUserId: row.createdByUserId,
				createdByName: row.createdByName ?? null,
				createdByImage: row.createdByImage ?? null,
				isCreatedByCurrentUser:
					currentUserId != null && row.createdByUserId === currentUserId,
				projectId: row.projectId,
				projectName: row.projectName,
				projectRepoId: row.projectRepoId,
				projectGithubOwner: row.projectGithubOwner ?? null,
				hostId: row.hostId,
				hostName: row.hostName,
				hostIsOnline: row.hostIsOnline,
				hostType,
				isInSidebar,
				pr,
			});
		}
		return Array.from(deduped.values()).sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
	}, [rows, machineId, currentUserId, prByRepoNumber, prNumberByWorkspaceId]);

	const searchFiltered = useMemo(
		() =>
			enriched.filter((workspace) =>
				workspaceMatchesSearch(workspace, searchQuery),
			),
		[enriched, searchQuery],
	);

	const fullyFiltered = useMemo(
		() =>
			searchFiltered.filter((workspace) =>
				matchesProjectFilter(workspace, projectFilter),
			),
		[searchFiltered, projectFilter],
	);

	// Hosts come straight from the (locally cached) hosts collections so the
	// picker is populated immediately — before the selected host's workspace
	// query answers, and including hosts with zero workspaces. No per-host
	// counts: counting other hosts' workspaces would itself be a fan-out.
	const hostOptions = useMemo<V2WorkspaceHostOption[]>(() => {
		if (activeOrganizationId == null) return [];
		const accessibleHostIds = new Set(userHostRows.map((row) => row.hostId));
		return hostRows
			.filter(
				(host) =>
					host.organizationId === activeOrganizationId &&
					accessibleHostIds.has(host.machineId),
			)
			.map((host) => ({
				hostId: host.machineId,
				hostName: host.name,
				isOnline: host.isOnline,
				isLocal: host.machineId === machineId,
			}))
			.sort((a, b) => {
				if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
				return a.hostName.localeCompare(b.hostName);
			});
	}, [activeOrganizationId, hostRows, userHostRows, machineId]);

	const projectOptions = useMemo<V2WorkspaceProjectOption[]>(() => {
		const byProject = new Map<string, V2WorkspaceProjectOption>();
		for (const workspace of searchFiltered) {
			const existing = byProject.get(workspace.projectId);
			if (existing) {
				existing.count += 1;
				continue;
			}
			byProject.set(workspace.projectId, {
				projectId: workspace.projectId,
				projectName: workspace.projectName,
				githubOwner: workspace.projectGithubOwner,
				count: 1,
			});
		}
		return Array.from(byProject.values()).sort((a, b) =>
			a.projectName.localeCompare(b.projectName),
		);
	}, [searchFiltered]);

	const hostsById = useMemo(() => {
		const map = new Map<
			string,
			{ hostName: string; isOnline: boolean; isLocal: boolean }
		>();
		for (const host of hostRows) {
			if (
				activeOrganizationId != null &&
				host.organizationId !== activeOrganizationId
			)
				continue;
			map.set(host.machineId, {
				hostName: host.name,
				isOnline: host.isOnline,
				isLocal: host.machineId === machineId,
			});
		}
		return map;
	}, [hostRows, activeOrganizationId, machineId]);

	const projectsById = useMemo(() => {
		const map = new Map<
			string,
			{ projectName: string; githubOwner: string | null }
		>();
		for (const workspace of enriched) {
			if (map.has(workspace.projectId)) continue;
			map.set(workspace.projectId, {
				projectName: workspace.projectName,
				githubOwner: workspace.projectGithubOwner,
			});
		}
		return map;
	}, [enriched]);

	return {
		all: fullyFiltered,
		isReady,
		hostOptions,
		projectOptions,
		hostsById,
		projectsById,
	};
}
