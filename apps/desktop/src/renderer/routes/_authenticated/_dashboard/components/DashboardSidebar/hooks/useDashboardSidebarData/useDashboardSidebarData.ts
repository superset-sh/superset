import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectBackingState,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

// Pending workspaces are always rendered at the end of the project's workspace list
const PENDING_WORKSPACE_TAB_ORDER = Number.MAX_SAFE_INTEGER;

// Module-level stable fallbacks. The destructure `= []` default creates a
// NEW array every render while a query's data is undefined, which cascades
// new references through our useMemo/useCallback chain and — eventually —
// causes dnd-kit's sortable items to re-register their refs on every
// render. That produces a Radix/compose-refs setState loop when the item
// is a draggable button. Pinning the empty fallbacks keeps references
// stable across renders and stops the churn.
type LocalProjectListRow = { id: string; repoPath: string };
type RemoteBackingRow = {
	projectId: string;
	hostId: string;
	hostMachineId: string;
	isOnline: boolean;
};
const EMPTY_LOCAL_PROJECT_LIST: LocalProjectListRow[] = [];
const EMPTY_REMOTE_BACKING_ROWS: RemoteBackingRow[] = [];

export function useDashboardSidebarData() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { toggleProjectCollapsed } = useDashboardSidebarState();

	// Query pending workspaces from the local collection
	const { data: pendingWorkspaces = [] } = useLiveQuery(
		(q) =>
			q.from({ pw: collections.pendingWorkspaces }).select(({ pw }) => ({
				id: pw.id,
				projectId: pw.projectId,
				name: pw.name,
				branchName: pw.branchName,
				status: pw.status,
			})),
		[collections],
	);
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const activeHostClient = activeHostUrl
		? getHostServiceClientByUrl(activeHostUrl)
		: null;

	// Local backing — authoritative for this machine. Invalidated by
	// project.create / project.setup / project.remove mutations and by
	// operations that surface a vanished-path error.
	const { data: localProjectList = EMPTY_LOCAL_PROJECT_LIST } = useQuery<
		LocalProjectListRow[]
	>({
		queryKey: ["project", "list", activeHostUrl],
		enabled: activeHostClient !== null,
		queryFn: () =>
			activeHostClient?.project.list.query() ?? EMPTY_LOCAL_PROJECT_LIST,
	});

	const locallyBackedProjectIds = useMemo(
		() => new Set(localProjectList.map((p) => p.id)),
		[localProjectList],
	);

	// Remote backing — v2_host_projects ⋈ v2_hosts, excluding rows for the
	// current machine (current host's backing is covered by localProjectList
	// above, which is authoritative and lag-free).
	const { data: remoteBackingRows = EMPTY_REMOTE_BACKING_ROWS } = useLiveQuery(
		(q) =>
			q
				.from({ hp: collections.v2HostProjects })
				.innerJoin({ h: collections.v2Hosts }, ({ hp, h }) =>
					eq(hp.hostId, h.id),
				)
				.select(({ hp, h }) => ({
					projectId: hp.projectId,
					hostId: h.id,
					hostMachineId: h.machineId,
					isOnline: h.isOnline,
				})),
		[collections],
	);

	const remoteBackingByProject = useMemo(() => {
		const byProject = new Map<
			string,
			{ online: Set<string>; offline: Set<string> }
		>();
		for (const row of remoteBackingRows) {
			if (row.hostMachineId === machineId) continue;
			let entry = byProject.get(row.projectId);
			if (!entry) {
				entry = { online: new Set(), offline: new Set() };
				byProject.set(row.projectId, entry);
			}
			(row.isOnline ? entry.online : entry.offline).add(row.hostId);
		}
		return byProject;
	}, [remoteBackingRows, machineId]);

	const deriveBackingState = useCallback(
		(projectId: string): DashboardSidebarProjectBackingState => {
			if (locallyBackedProjectIds.has(projectId)) return "normal";
			const remote = remoteBackingByProject.get(projectId);
			if (remote?.online.size) return "normal";
			if (remote?.offline.size) return "host-offline";
			return "not-set-up-here";
		},
		[locallyBackedProjectIds, remoteBackingByProject],
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

	const { data: sidebarWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
				.innerJoin(
					{ workspaces: collections.v2Workspaces },
					({ sidebarWorkspaces, workspaces }) =>
						eq(sidebarWorkspaces.workspaceId, workspaces.id),
				)
				.leftJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.id),
				)
				.orderBy(
					({ sidebarWorkspaces }) => sidebarWorkspaces.sidebarState.tabOrder,
					"asc",
				)
				.select(({ sidebarWorkspaces, workspaces, hosts }) => ({
					id: workspaces.id,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					hostId: workspaces.hostId,
					hostMachineId: hosts?.machineId ?? null,
					name: workspaces.name,
					branch: workspaces.branch,
					createdAt: workspaces.createdAt,
					updatedAt: workspaces.updatedAt,
					tabOrder: sidebarWorkspaces.sidebarState.tabOrder,
					sectionId: sidebarWorkspaces.sidebarState.sectionId,
				})),
		[collections],
	);

	const localWorkspaceIds = useMemo(
		() =>
			sidebarWorkspaces
				.filter(
					(workspace) =>
						workspace.hostMachineId != null &&
						workspace.hostMachineId === machineId,
				)
				.map((workspace) => workspace.id)
				.sort(),
		[machineId, sidebarWorkspaces],
	);

	const { data: pullRequestData, refetch: refetchPullRequests } = useQuery({
		queryKey: [
			"dashboard-sidebar",
			"pull-requests",
			activeOrganizationId,
			localWorkspaceIds,
		],
		enabled: activeHostClient !== null && localWorkspaceIds.length > 0,
		refetchInterval: 10_000,
		queryFn: () =>
			activeHostClient?.pullRequests.getByWorkspaces.query({
				workspaceIds: localWorkspaceIds,
			}) ?? Promise.resolve({ workspaces: [] }),
	});

	const refreshWorkspacePullRequest = useCallback(
		async (workspaceId: string) => {
			if (!activeHostClient || !localWorkspaceIds.includes(workspaceId)) {
				return;
			}

			await activeHostClient.pullRequests.refreshByWorkspaces.mutate({
				workspaceIds: [workspaceId],
			});
			await refetchPullRequests();
		},
		[activeHostClient, localWorkspaceIds, refetchPullRequests],
	);

	const localPullRequestsByWorkspaceId = useMemo(
		() =>
			new Map(
				(pullRequestData?.workspaces ?? []).map((workspace) => [
					workspace.workspaceId,
					workspace.pullRequest,
				]),
			),
		[pullRequestData?.workspaces],
	);

	const groups = useMemo<DashboardSidebarProject[]>(() => {
		const projectsById = new Map<
			string,
			DashboardSidebarProject & {
				sectionMap: Map<string, DashboardSidebarSection>;
				childEntries: Array<{
					tabOrder: number;
					child: DashboardSidebarProjectChild;
				}>;
			}
		>();

		for (const project of sidebarProjects) {
			projectsById.set(project.id, {
				...project,
				backingState: deriveBackingState(project.id),
				children: [],
				sectionMap: new Map(),
				childEntries: [],
			});
		}

		for (const section of sidebarSections) {
			const project = projectsById.get(section.projectId);
			if (!project) continue;

			const sidebarSection: DashboardSidebarSection = {
				...section,
				workspaces: [],
			};

			project.sectionMap.set(section.id, sidebarSection);
			project.childEntries.push({
				tabOrder: section.tabOrder,
				child: {
					type: "section",
					section: sidebarSection,
				},
			});
		}

		for (const workspace of sidebarWorkspaces) {
			const project = projectsById.get(workspace.projectId);
			if (!project) continue;

			const hostType: DashboardSidebarWorkspace["hostType"] =
				workspace.hostMachineId == null
					? "cloud"
					: workspace.hostMachineId === machineId
						? "local-device"
						: "remote-device";

			const sidebarWorkspace: DashboardSidebarWorkspace = {
				id: workspace.id,
				projectId: workspace.projectId,
				hostId: workspace.hostId,
				hostType,
				accentColor: null,
				name: workspace.name,
				branch: workspace.branch,
				pullRequest:
					hostType === "local-device"
						? (localPullRequestsByWorkspaceId.get(workspace.id) ?? null)
						: null,
				repoUrl:
					project.githubOwner && project.githubRepoName
						? `https://github.com/${project.githubOwner}/${project.githubRepoName}`
						: null,
				branchExistsOnRemote:
					project.githubOwner !== null && project.githubRepoName !== null,
				previewUrl: null,
				needsRebase: null,
				behindCount: null,
				createdAt: workspace.createdAt,
				updatedAt: workspace.updatedAt,
			};

			if (workspace.sectionId) {
				const section = project.sectionMap.get(workspace.sectionId);
				if (section) {
					section.workspaces.push({
						...sidebarWorkspace,
						accentColor: section.color,
					});
				}
				continue;
			}

			project.childEntries.push({
				tabOrder: workspace.tabOrder,
				child: {
					type: "workspace",
					workspace: sidebarWorkspace,
				},
			});
		}

		// Inject pending workspaces (creating / failed)
		for (const pw of pendingWorkspaces) {
			if (pw.status === "succeeded") continue; // will appear as a real workspace
			const project = projectsById.get(pw.projectId);
			if (!project) continue;

			const pendingItem: DashboardSidebarWorkspace = {
				id: pw.id,
				projectId: pw.projectId,
				hostId: "",
				hostType: "local-device",
				accentColor: null,
				name: pw.name,
				branch: pw.branchName,
				pullRequest: null,
				repoUrl:
					project.githubOwner && project.githubRepoName
						? `https://github.com/${project.githubOwner}/${project.githubRepoName}`
						: null,
				branchExistsOnRemote: false,
				previewUrl: null,
				needsRebase: null,
				behindCount: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				creationStatus: pw.status,
			};

			project.childEntries.push({
				tabOrder: PENDING_WORKSPACE_TAB_ORDER,
				child: {
					type: "workspace",
					workspace: pendingItem,
				},
			});
		}

		return sidebarProjects.flatMap((project) => {
			const resolvedProject = projectsById.get(project.id);
			if (!resolvedProject) return [];
			const {
				childEntries,
				sectionMap: _sectionMap,
				...sidebarProject
			} = resolvedProject;
			sidebarProject.children = childEntries
				.sort((left, right) => left.tabOrder - right.tabOrder)
				.map(({ child }) => child);
			return [sidebarProject];
		});
	}, [
		deriveBackingState,
		machineId,
		localPullRequestsByWorkspaceId,
		pendingWorkspaces,
		sidebarProjects,
		sidebarSections,
		sidebarWorkspaces,
	]);

	return {
		groups,
		refetchPullRequests,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	};
}
