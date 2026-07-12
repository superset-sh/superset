import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
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
import { useWorkspaceTransactionsStore } from "renderer/stores/workspace-creates";
import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";
import { buildDashboardSidebarProjects } from "./buildDashboardSidebarProjects";
import {
	derivePullRequestQueryTargets,
	getDashboardSidebarPullRequestQueryKey,
	type PullRequestQueryTarget,
} from "./derivePullRequestQueryTargets";

const MAIN_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;

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

	const { data: hosts = [] } = useLiveQuery(
		(q) =>
			q.from({ hosts: collections.v2Hosts }).select(({ hosts }) => ({
				organizationId: hosts.organizationId,
				machineId: hosts.machineId,
				isOnline: hosts.isOnline,
			})),
		[collections],
	);
	const hostsByMachineId = useMemo(
		() => new Map(hosts.map((host) => [host.machineId, host])),
		[hosts],
	);

	const { data: rawSidebarProjects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProjects: collections.v2SidebarProjects })
				.innerJoin(
					{ projects: collections.v2Projects },
					({ sidebarProjects, projects }) =>
						eq(sidebarProjects.projectId, projects.id),
				)
				.leftJoin(
					{ repos: collections.githubRepositories },
					({ projects, repos }) => eq(projects.githubRepositoryId, repos.id),
				)
				.orderBy(({ sidebarProjects }) => sidebarProjects.tabOrder, "asc")
				.select(({ sidebarProjects, projects, repos }) => ({
					id: projects.id,
					name: projects.name,
					slug: projects.slug,
					githubRepositoryId: projects.githubRepositoryId,
					githubOwner: repos?.owner ?? null,
					githubRepoName: repos?.name ?? null,
					iconUrl: projects.iconUrl,
					createdAt: projects.createdAt,
					updatedAt: projects.updatedAt,
					isCollapsed: sidebarProjects.isCollapsed,
				})),
		[collections],
	);

	const sidebarProjects = useMemo(
		() =>
			rawSidebarProjects.map((project) => ({
				...project,
				githubOwner: project.githubOwner ?? null,
				githubRepoName: project.githubRepoName ?? null,
			})),
		[rawSidebarProjects],
	);

	const { data: sidebarSections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.select(({ sidebarSections }) => ({
					id: sidebarSections.sectionId,
					projectId: sidebarSections.projectId,
					name: sidebarSections.name,
					createdAt: sidebarSections.createdAt,
					isCollapsed: sidebarSections.isCollapsed,
					tabOrder: sidebarSections.tabOrder,
					color: sidebarSections.color,
				})),
		[collections],
	);

	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const hostWorkspacesById = useMemo(
		() => new Map(hostWorkspaces.map((workspace) => [workspace.id, workspace])),
		[hostWorkspaces],
	);

	const { data: sidebarLocalStateRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
				.orderBy(
					({ sidebarWorkspaces }) => sidebarWorkspaces.sidebarState.tabOrder,
					"asc",
				)
				.select(({ sidebarWorkspaces }) => ({
					workspaceId: sidebarWorkspaces.workspaceId,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					tabOrder: sidebarWorkspaces.sidebarState.tabOrder,
					sectionId: sidebarWorkspaces.sidebarState.sectionId,
					isHidden: sidebarWorkspaces.sidebarState.isHidden,
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
						isHidden: localState.isHidden,
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
				.filter((workspace) => workspace.type === "main")
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
				workspaces: visibleSidebarWorkspaces,
			}),
		[activeHostUrl, hosts, machineId, relayUrl, visibleSidebarWorkspaces],
	);

	const pullRequestQueries = useQueries({
		queries: pullRequestQueryTargets.map((target) => ({
			queryKey: getDashboardSidebarPullRequestQueryKey(target),
			refetchInterval: 10_000,
			queryFn: async () => {
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
			if (!target) return;

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

	const computedGroups = useMemo<DashboardSidebarProject[]>(
		() =>
			buildDashboardSidebarProjects({
				sidebarProjects,
				sidebarSections,
				visibleSidebarWorkspaces,
				machineId,
				pullRequestsByWorkspaceId,
			}),
		[
			machineId,
			pullRequestsByWorkspaceId,
			sidebarProjects,
			sidebarSections,
			visibleSidebarWorkspaces,
		],
	);
	const groups = useStableDashboardSidebarProjects(computedGroups);

	return {
		groups,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	};
}
