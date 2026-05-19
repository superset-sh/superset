import type { CheckItem } from "@superset/local-db";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import {
	DEVICE_FILTER_ALL,
	DEVICE_FILTER_THIS_DEVICE,
	PROJECT_FILTER_ALL,
	type V2WorkspacesDeviceFilter,
	type V2WorkspacesProjectFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { isSidebarWorkspaceVisible } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
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

export interface V2WorkspaceProjectGroup {
	projectId: string;
	projectName: string;
	workspaces: AccessibleV2Workspace[];
}

export interface V2WorkspaceDeviceCounts {
	all: number;
	thisDevice: number;
}

export interface V2WorkspaceHostOption {
	hostId: string;
	hostName: string;
	isOnline: boolean;
	isLocal: boolean;
	count: number;
}

export interface V2WorkspaceProjectOption {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	count: number;
}

export interface UseAccessibleV2WorkspacesResult {
	all: AccessibleV2Workspace[];
	pinned: AccessibleV2Workspace[];
	others: AccessibleV2Workspace[];
	counts: V2WorkspaceDeviceCounts;
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

function matchesDeviceFilter(
	workspace: AccessibleV2Workspace,
	deviceFilter: V2WorkspacesDeviceFilter,
	machineId: string | null,
): boolean {
	if (deviceFilter === DEVICE_FILTER_ALL) return true;
	if (deviceFilter === DEVICE_FILTER_THIS_DEVICE) {
		return machineId == null || workspace.hostId === machineId;
	}
	return workspace.hostId === deviceFilter;
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

export function useAccessibleV2Workspaces(
	options: UseAccessibleV2WorkspacesOptions = {},
): UseAccessibleV2WorkspacesResult {
	const searchQuery = options.searchQuery ?? "";
	const deviceFilter = options.deviceFilter ?? DEVICE_FILTER_ALL;
	const projectFilter = options.projectFilter ?? PROJECT_FILTER_ALL;
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId } = useLocalHostService();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.innerJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.innerJoin(
					{ userHosts: collections.v2UsersHosts },
					({ hosts, userHosts }) => eq(userHosts.hostId, hosts.machineId),
				)
				.innerJoin(
					{ projects: collections.v2Projects },
					({ workspaces, projects }) => eq(workspaces.projectId, projects.id),
				)
				.leftJoin(
					{ sidebarState: collections.v2WorkspaceLocalState },
					({ workspaces, sidebarState }) =>
						eq(sidebarState.workspaceId, workspaces.id),
				)
				.leftJoin(
					{ sidebarProject: collections.v2SidebarProjects },
					({ projects, sidebarProject }) =>
						eq(sidebarProject.projectId, projects.id),
				)
				.leftJoin(
					{ repos: collections.githubRepositories },
					({ projects, repos }) => eq(projects.githubRepositoryId, repos.id),
				)
				.leftJoin({ creators: collections.users }, ({ workspaces, creators }) =>
					eq(workspaces.createdByUserId, creators.id),
				)
				.where(({ workspaces, userHosts }) =>
					and(
						eq(workspaces.organizationId, activeOrganizationId ?? ""),
						eq(userHosts.userId, currentUserId ?? ""),
					),
				)
				.select(
					({
						workspaces,
						hosts,
						projects,
						sidebarState,
						sidebarProject,
						repos,
						creators,
					}) => ({
						id: workspaces.id,
						name: workspaces.name,
						branch: workspaces.branch,
						type: workspaces.type,
						createdAt: workspaces.createdAt,
						createdByUserId: workspaces.createdByUserId,
						createdByName: creators?.name ?? null,
						createdByImage: creators?.image ?? null,
						projectId: projects.id,
						projectName: projects.name,
						projectRepoId: projects.githubRepositoryId,
						projectGithubOwner: repos?.owner ?? null,
						hostId: workspaces.hostId,
						hostName: hosts.name,
						hostIsOnline: hosts.isOnline,
						sidebarProjectId: sidebarProject?.projectId ?? null,
						sidebarWorkspaceId: sidebarState?.workspaceId ?? null,
						sidebarIsHidden: sidebarState?.sidebarState.isHidden ?? false,
					}),
				),
		[activeOrganizationId, collections, currentUserId],
	);

	const { data: prRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ prs: collections.githubPullRequests })
				.where(({ prs }) => eq(prs.organizationId, activeOrganizationId ?? ""))
				.select(({ prs }) => ({
					id: prs.id,
					repositoryId: prs.repositoryId,
					prNumber: prs.prNumber,
					headBranch: prs.headBranch,
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

	const prsByRepoBranch = useMemo(() => {
		const map = new Map<string, V2WorkspacePrSummary>();
		const stateRank: Record<string, number> = {
			open: 0,
			draft: 1,
			merged: 2,
			closed: 3,
		};
		for (const row of prRows) {
			const key = `${row.repositoryId}::${row.headBranch}`;
			const candidate: V2WorkspacePrSummary = {
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
			};
			const existing = map.get(key);
			if (!existing) {
				map.set(key, candidate);
				continue;
			}
			const cmpState = stateRank[candidate.state] - stateRank[existing.state];
			if (cmpState < 0) {
				map.set(key, candidate);
			} else if (
				cmpState === 0 &&
				candidate.updatedAt.getTime() > existing.updatedAt.getTime()
			) {
				map.set(key, candidate);
			}
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
			const pr = row.projectRepoId
				? (prsByRepoBranch.get(`${row.projectRepoId}::${row.branch}`) ?? null)
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
	}, [rows, machineId, currentUserId, prsByRepoBranch]);

	const searchFiltered = useMemo(
		() =>
			enriched.filter((workspace) =>
				workspaceMatchesSearch(workspace, searchQuery),
			),
		[enriched, searchQuery],
	);

	const deviceFiltered = useMemo(
		() =>
			searchFiltered.filter((workspace) =>
				matchesDeviceFilter(workspace, deviceFilter, machineId),
			),
		[searchFiltered, deviceFilter, machineId],
	);

	const fullyFiltered = useMemo(
		() =>
			deviceFiltered.filter((workspace) =>
				matchesProjectFilter(workspace, projectFilter),
			),
		[deviceFiltered, projectFilter],
	);

	const pinned = useMemo(
		() => fullyFiltered.filter((workspace) => workspace.isInSidebar),
		[fullyFiltered],
	);

	const others = useMemo(
		() => fullyFiltered.filter((workspace) => !workspace.isInSidebar),
		[fullyFiltered],
	);

	const counts = useMemo<V2WorkspaceDeviceCounts>(() => {
		let thisDevice = 0;
		for (const workspace of searchFiltered) {
			if (workspace.hostId === machineId) thisDevice += 1;
		}
		return {
			all: searchFiltered.length,
			thisDevice,
		};
	}, [searchFiltered, machineId]);

	const hostOptions = useMemo<V2WorkspaceHostOption[]>(() => {
		const byHost = new Map<string, V2WorkspaceHostOption>();
		for (const workspace of searchFiltered) {
			const existing = byHost.get(workspace.hostId);
			if (existing) {
				existing.count += 1;
				continue;
			}
			byHost.set(workspace.hostId, {
				hostId: workspace.hostId,
				hostName: workspace.hostName,
				isOnline: workspace.hostIsOnline,
				isLocal: workspace.hostId === machineId,
				count: 1,
			});
		}
		return Array.from(byHost.values()).sort((a, b) => {
			if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
			return a.hostName.localeCompare(b.hostName);
		});
	}, [searchFiltered, machineId]);

	const projectOptions = useMemo<V2WorkspaceProjectOption[]>(() => {
		const byProject = new Map<string, V2WorkspaceProjectOption>();
		for (const workspace of deviceFiltered) {
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
	}, [deviceFiltered]);

	const hostsById = useMemo(() => {
		const map = new Map<
			string,
			{ hostName: string; isOnline: boolean; isLocal: boolean }
		>();
		for (const workspace of enriched) {
			if (map.has(workspace.hostId)) continue;
			map.set(workspace.hostId, {
				hostName: workspace.hostName,
				isOnline: workspace.hostIsOnline,
				isLocal: workspace.hostId === machineId,
			});
		}
		return map;
	}, [enriched, machineId]);

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
		pinned,
		others,
		counts,
		hostOptions,
		projectOptions,
		hostsById,
		projectsById,
	};
}
