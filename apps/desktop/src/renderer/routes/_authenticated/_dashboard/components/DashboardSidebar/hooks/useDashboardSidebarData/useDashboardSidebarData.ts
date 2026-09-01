import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getVisibleSidebarWorkspaces,
	isAutoIncludedLocalMainWorkspace,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import {
	deriveTagFolders,
	useTagFolderContext,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { useWorkspaceTransactionsStore } from "renderer/stores/workspace-creates";
import type {
	DashboardSidebarPinnedWorkspace,
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";
import {
	buildDashboardSidebarPinnedWorkspaces,
	buildDashboardSidebarProjects,
	buildDashboardSidebarSessions,
	partitionSidebarWorkspacesByPinned,
} from "./buildDashboardSidebarProjects";
import {
	derivePullRequestQueryTargets,
	getDashboardSidebarPullRequestQueryKey,
	type PullRequestQueryTarget,
} from "./derivePullRequestQueryTargets";
import { createPullRequestRefreshGate } from "./pullRequestRefreshCooldown";

const MAIN_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;

// Module-level so remounting the sidebar doesn't reset the cool-down.
const pullRequestRefreshGate = createPullRequestRefreshGate();

type SidebarPullRequest = DashboardSidebarWorkspace["pullRequest"];
type PullRequestWorkspaceRow = {
	workspaceId: string;
	pullRequest: SidebarPullRequest;
};

function haveSameProjects(
	left: DashboardSidebarProject[],
	right: DashboardSidebarProject[],
): boolean {
	return (
		left.length === right.length &&
		left.every((project, index) => project === right[index])
	);
}

function getPullRequestRowsFingerprint(
	rows: PullRequestWorkspaceRow[],
): string {
	return JSON.stringify(
		rows
			.map((row) => [row.workspaceId, row.pullRequest] as const)
			.sort(([leftWorkspaceId], [rightWorkspaceId]) =>
				leftWorkspaceId.localeCompare(rightWorkspaceId),
			),
	);
}

function getDashboardSidebarProjectFingerprint(
	project: DashboardSidebarProject,
): string {
	return JSON.stringify(project);
}

function useStablePullRequestsByWorkspaceId(
	rows: PullRequestWorkspaceRow[] | undefined,
): Map<string, SidebarPullRequest> {
	const previousRef = useRef<{
		fingerprint: string;
		map: Map<string, SidebarPullRequest>;
	} | null>(null);

	return useMemo(() => {
		const nextRows = rows ?? [];
		const fingerprint = getPullRequestRowsFingerprint(nextRows);
		const previous = previousRef.current;
		if (previous?.fingerprint === fingerprint) {
			return previous.map;
		}

		const map = new Map(
			nextRows.map((workspace) => [
				workspace.workspaceId,
				workspace.pullRequest,
			]),
		);
		previousRef.current = { fingerprint, map };
		return map;
	}, [rows]);
}

/**
 * Returns the previous reference while the JSON serialization is unchanged.
 * Same purpose as the fingerprinted hooks below: the sidebar builders produce
 * fresh arrays every run, and downstream memoization needs stable identities.
 */
function useJsonStable<Value>(value: Value): Value {
	const previousRef = useRef<{ fingerprint: string; value: Value } | null>(
		null,
	);
	return useMemo(() => {
		const fingerprint = JSON.stringify(value);
		const previous = previousRef.current;
		if (previous?.fingerprint === fingerprint) {
			return previous.value;
		}
		previousRef.current = { fingerprint, value };
		return value;
	}, [value]);
}

function useStableDashboardSidebarProjects(
	projects: DashboardSidebarProject[],
): DashboardSidebarProject[] {
	const previousRef = useRef<{
		projects: DashboardSidebarProject[];
		byId: Map<
			string,
			{ fingerprint: string; project: DashboardSidebarProject }
		>;
	} | null>(null);

	return useMemo(() => {
		const previous = previousRef.current;
		const nextById = new Map<
			string,
			{ fingerprint: string; project: DashboardSidebarProject }
		>();
		const nextProjects = projects.map((project) => {
			const fingerprint = getDashboardSidebarProjectFingerprint(project);
			const previousProject = previous?.byId.get(project.id);
			const stableProject =
				previousProject?.fingerprint === fingerprint
					? previousProject.project
					: project;

			nextById.set(project.id, { fingerprint, project: stableProject });
			return stableProject;
		});

		if (previous && haveSameProjects(previous.projects, nextProjects)) {
			previousRef.current = { projects: previous.projects, byId: nextById };
			return previous.projects;
		}

		previousRef.current = { projects: nextProjects, byId: nextById };
		return nextProjects;
	}, [projects]);
}

export function useDashboardSidebarData() {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const { toggleProjectCollapsed } = useDashboardSidebarState();
	const queryClient = useQueryClient();
	const workspaceTransactionsById = useWorkspaceTransactionsStore(
		(state) => state.byWorkspaceId,
	);

	const { hosts, organizationId: knownHostsOrgId } = useKnownHosts();
	const hostsByMachineId = useMemo(
		() => new Map(hosts.map((host) => [host.machineId, host])),
		[hosts],
	);

	// Placement (order/collapse) is local; project identity comes from the
	// host fan-out (useHostProjects) — projects are fully local, so the
	// sidebar joins the two in JS on the project id.
	const { data: sidebarProjectRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProjects: collections.v2SidebarProjects })
				.select(({ sidebarProjects }) => ({
					projectId: sidebarProjects.projectId,
					isCollapsed: sidebarProjects.isCollapsed,
					tabOrder: sidebarProjects.tabOrder,
				})),
		[collections],
	);
	// Sorted in JS, not via the query's orderBy: the incremental orderBy
	// does not reliably re-sort on row inserts/renumbers (a newly added
	// project stayed appended at the bottom until reload), and tabOrders
	// can collide (bulk ensure paths mint duplicates) so ties need a
	// stable secondary key. Workspaces/sections don't need this — the
	// project-tree builder re-sorts them by tabOrder itself.
	const orderedSidebarProjectRows = useMemo(
		() =>
			[...sidebarProjectRows].sort(
				(left, right) =>
					left.tabOrder - right.tabOrder ||
					left.projectId.localeCompare(right.projectId),
			),
		[sidebarProjectRows],
	);

	const { projects: hostProjects } = useHostProjects();

	const sidebarProjects = useMemo(() => {
		const projectsByKey = new Map(
			hostProjects.map((project) => [project.projectKey, project]),
		);
		return orderedSidebarProjectRows.flatMap((row) => {
			const project = projectsByKey.get(row.projectId);
			// No host serves it: stale placement row (deleted project) — drop
			// it, same as the old inner join did.
			if (!project) return [];
			return [
				{
					id: project.projectKey,
					name: project.name,
					githubOwner: project.repoOwner,
					githubRepoName: project.repoName,
					iconUrl: resolveProjectIconUrl(project),
					color: project.color,
					createdAt: new Date(project.createdAt),
					updatedAt: new Date(project.updatedAt),
					isCollapsed: row.isCollapsed,
				},
			];
		});
	}, [orderedSidebarProjectRows, hostProjects]);

	const { data: storedSidebarSections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				// Same tie-breaking rationale as the projects query above.
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.orderBy(({ sidebarSections }) => sidebarSections.sectionId, "asc")
				.select(({ sidebarSections }) => ({
					sectionId: sidebarSections.sectionId,
					projectId: sidebarSections.projectId,
					name: sidebarSections.name,
					createdAt: sidebarSections.createdAt,
					isCollapsed: sidebarSections.isCollapsed,
					tabOrder: sidebarSections.tabOrder,
					color: sidebarSections.color,
					tag: sidebarSections.tag,
				})),
		[collections],
	);

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { targets: sandboxes } = useSandboxAccess();
	const hostWorkspacesById = useMemo(
		() => new Map(hostWorkspaces.map((workspace) => [workspace.id, workspace])),
		[hostWorkspaces],
	);

	// The section lane the builder consumes is the deriveTagFolders union:
	// stored presentation rows PLUS folders that exist only because some
	// workspace carries the tag. A folder must exist because a workspace
	// carries the tag, not because a local row does.
	const tagFolderContext = useTagFolderContext();
	const sidebarSections = useMemo(
		() =>
			deriveTagFolders(
				storedSidebarSections,
				hostWorkspaces,
				tagFolderContext,
			).map((section) => ({
				id: section.sectionId,
				projectId: section.projectId,
				name: section.name,
				createdAt: section.createdAt,
				isCollapsed: section.isCollapsed,
				tabOrder: section.tabOrder,
				color: section.color,
				tag: section.tag,
			})),
		[hostWorkspaces, storedSidebarSections, tagFolderContext],
	);

	const { data: sidebarLocalStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
				// Same tie-breaking rationale as the projects query above.
				.orderBy(
					({ sidebarWorkspaces }) => sidebarWorkspaces.sidebarState.tabOrder,
					"asc",
				)
				.orderBy(
					({ sidebarWorkspaces }) => sidebarWorkspaces.workspaceId,
					"asc",
				)
				.select(({ sidebarWorkspaces }) => ({
					workspaceId: sidebarWorkspaces.workspaceId,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					tabOrder: sidebarWorkspaces.sidebarState.tabOrder,
					sectionId: sidebarWorkspaces.sidebarState.sectionId,
					isHidden: sidebarWorkspaces.sidebarState.isHidden,
					pinnedAt: sidebarWorkspaces.sidebarState.pinnedAt,
				})),
		[collections],
	);
	const rawSidebarWorkspaces = useMemo(
		() =>
			sidebarLocalStateRows.flatMap((localState) => {
				const workspace = hostWorkspacesById.get(localState.workspaceId);
				if (!workspace) return [];
				return [
					{
						id: workspace.id,
						projectId: localState.projectId,
						hostId: workspace.hostId,
						type: workspace.type,
						name: workspace.name,
						branch: workspace.branch,
						taskId: workspace.taskId,
						createdAt: workspace.createdAt,
						updatedAt: workspace.updatedAt,
						tabOrder: localState.tabOrder,
						sectionId: localState.sectionId,
						tags: workspace.tags,
						isHidden: localState.isHidden,
						pinnedAt: localState.pinnedAt,
					},
				];
			}),
		[hostWorkspacesById, sidebarLocalStateRows],
	);
	const rawSidebarWorkspacesWithHostStatus = useMemo(
		() =>
			rawSidebarWorkspaces.map((workspace) => ({
				...workspace,
				hostIsOnline: hostsByMachineId.get(workspace.hostId)?.isOnline ?? false,
				pendingTransaction: workspaceTransactionsById[workspace.id] ?? null,
			})),
		[hostsByMachineId, rawSidebarWorkspaces, workspaceTransactionsById],
	);

	const sidebarWorkspaces = useMemo(
		() => getVisibleSidebarWorkspaces(rawSidebarWorkspacesWithHostStatus),
		[rawSidebarWorkspacesWithHostStatus],
	);

	const localStateWorkspaceIds = useMemo(
		() => new Set(rawSidebarWorkspaces.map((workspace) => workspace.id)),
		[rawSidebarWorkspaces],
	);

	const rawLocalMainWorkspaces = useMemo(
		() =>
			hostWorkspaces
				.filter(
					(
						workspace,
					): workspace is (typeof hostWorkspaces)[number] & {
						projectId: string;
					} => workspace.type === "main" && workspace.projectId !== null,
				)
				.map((workspace) => ({
					id: workspace.id,
					projectId: workspace.projectId,
					hostId: workspace.hostId,
					type: workspace.type,
					name: workspace.name,
					branch: workspace.branch,
					taskId: workspace.taskId,
					createdAt: workspace.createdAt,
					updatedAt: workspace.updatedAt,
					tabOrder: MAIN_WORKSPACE_TAB_ORDER,
					sectionId: null as string | null,
					tags: workspace.tags,
					// Auto-included mains have no local-state row; pinning one
					// creates a row first (see setWorkspacePinned).
					pinnedAt: null as number | null,
				})),
		[hostWorkspaces],
	);
	const localMainWorkspaces = useMemo(
		() =>
			rawLocalMainWorkspaces.map((workspace) => ({
				...workspace,
				hostIsOnline: hostsByMachineId.get(workspace.hostId)?.isOnline ?? false,
				pendingTransaction: workspaceTransactionsById[workspace.id] ?? null,
			})),
		[hostsByMachineId, rawLocalMainWorkspaces, workspaceTransactionsById],
	);

	const visibleSidebarWorkspaces = useMemo(() => {
		const sidebarProjectIds = new Set(
			sidebarProjects.map((project) => project.id),
		);
		const autoLocalMainWorkspaces = localMainWorkspaces.filter((workspace) =>
			isAutoIncludedLocalMainWorkspace(workspace, {
				localStateWorkspaceIds,
				sidebarProjectIds,
				machineId,
			}),
		);

		return [...autoLocalMainWorkspaces, ...sidebarWorkspaces];
	}, [
		localMainWorkspaces,
		localStateWorkspaceIds,
		machineId,
		sidebarProjects,
		sidebarWorkspaces,
	]);

	const pullRequestQueryTargets = useMemo<PullRequestQueryTarget[]>(
		() =>
			derivePullRequestQueryTargets({
				activeHostUrl,
				hosts,
				machineId,
				relayUrl,
				// Sessions (null projectId) have no remote and never carry PRs.
				workspaces: visibleSidebarWorkspaces.filter(
					(workspace) => workspace.projectId !== null,
				),
				fallbackOrganizationId: knownHostsOrgId,
				sandboxes,
			}),
		[
			activeHostUrl,
			hosts,
			knownHostsOrgId,
			machineId,
			relayUrl,
			sandboxes,
			visibleSidebarWorkspaces,
		],
	);

	const pullRequestQueries = useQueries({
		queries: pullRequestQueryTargets.map((target) => ({
			queryKey: getDashboardSidebarPullRequestQueryKey(target),
			refetchInterval: 10_000,
			// Unreachable host: keep the query mounted so cached chips stay
			// rendered through the outage; fetches resume when the URL returns.
			enabled: target.hostUrl !== null,
			queryFn: async () => {
				if (!target.hostUrl) return { workspaces: [] };
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.pullRequests.getByWorkspaces.query({
					workspaceIds: target.workspaceIds,
				});
			},
		})),
	});

	const pullRequestRows = useMemo<PullRequestWorkspaceRow[]>(() => {
		const rows: PullRequestWorkspaceRow[] = [];
		for (const query of pullRequestQueries) {
			const data = query.data;
			if (!data) continue;
			for (const row of data.workspaces) {
				rows.push({
					workspaceId: row.workspaceId,
					pullRequest: row.pullRequest,
				});
			}
		}
		return rows;
	}, [pullRequestQueries]);

	const refreshWorkspacePullRequest = useCallback(
		async (workspaceId: string) => {
			const workspace = visibleSidebarWorkspaces.find(
				(candidate) => candidate.id === workspaceId,
			);
			if (!workspace) return;
			const target = pullRequestQueryTargets.find(
				(candidate) => candidate.machineId === workspace.hostId,
			);
			if (!target?.hostUrl) return;
			if (!pullRequestRefreshGate.shouldRefresh(workspaceId, Date.now())) {
				return;
			}

			const client = getHostServiceClientByUrl(target.hostUrl);
			await client.pullRequests.refreshByWorkspaces.mutate({
				workspaceIds: [workspaceId],
			});
			await queryClient.invalidateQueries({
				queryKey: getDashboardSidebarPullRequestQueryKey(target),
			});
		},
		[pullRequestQueryTargets, queryClient, visibleSidebarWorkspaces],
	);

	const pullRequestsByWorkspaceId =
		useStablePullRequestsByWorkspaceId(pullRequestRows);

	// Pinned rows render only in the top-level Pinned section, so they are
	// partitioned out before the per-project tree is built. PR polling targets
	// derive from the pre-partition list above, so pinned rows keep PR status.
	const { pinned: pinnedRows, unpinned: unpinnedRows } = useMemo(
		() => partitionSidebarWorkspacesByPinned(visibleSidebarWorkspaces),
		[visibleSidebarWorkspaces],
	);

	// Unpinned sessions render in the top-level Sessions section; pinned
	// sessions stay in Pinned like any other row.
	const { sessionRows, projectRows } = useMemo(() => {
		const sessions: typeof unpinnedRows = [];
		const projectScoped: typeof unpinnedRows = [];
		for (const row of unpinnedRows) {
			(row.projectId === null ? sessions : projectScoped).push(row);
		}
		return { sessionRows: sessions, projectRows: projectScoped };
	}, [unpinnedRows]);

	const computedGroups = useMemo<DashboardSidebarProject[]>(
		() =>
			buildDashboardSidebarProjects({
				sidebarProjects,
				sidebarSections,
				visibleSidebarWorkspaces: projectRows,
				machineId,
				pullRequestsByWorkspaceId,
			}),
		[
			machineId,
			pullRequestsByWorkspaceId,
			sidebarProjects,
			sidebarSections,
			projectRows,
		],
	);
	const groups = useStableDashboardSidebarProjects(computedGroups);

	const computedSessions = useMemo(
		() =>
			buildDashboardSidebarSessions({
				sessionSidebarWorkspaces: sessionRows,
				machineId,
				pullRequestsByWorkspaceId,
			}),
		[machineId, pullRequestsByWorkspaceId, sessionRows],
	);
	const sessions = useJsonStable(computedSessions);
	const sessionWorkspaces = sessions.orderedWorkspaces;

	const computedPinnedWorkspaces = useMemo<DashboardSidebarPinnedWorkspace[]>(
		() =>
			buildDashboardSidebarPinnedWorkspaces({
				pinnedSidebarWorkspaces: pinnedRows,
				sidebarProjects,
				machineId,
				pullRequestsByWorkspaceId,
			}),
		[machineId, pinnedRows, pullRequestsByWorkspaceId, sidebarProjects],
	);
	const pinnedWorkspaces = useJsonStable(computedPinnedWorkspaces);

	return {
		groups,
		pinnedWorkspaces,
		sessionWorkspaces,
		sessionTagGroups: sessions.tagGroups,
		ungroupedSessionWorkspaces: sessions.ungroupedWorkspaces,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	};
}
