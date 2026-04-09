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
import { usePendingWorkspace } from "renderer/stores/new-workspace-modal";
import { MOCK_ORG_ID } from "shared/constants";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

// Pending workspaces are always rendered at the end of the project's workspace list
const PENDING_WORKSPACE_TAB_ORDER = Number.MAX_SAFE_INTEGER;

export function useDashboardSidebarData() {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { toggleProjectCollapsed } = useDashboardSidebarState();
	const pendingWorkspace = usePendingWorkspace();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const activeHostClient = activeHostUrl
		? getHostServiceClientByUrl(activeHostUrl)
		: null;

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

		// Inject pending workspace if it exists
		if (pendingWorkspace && machineId) {
			const project = projectsById.get(pendingWorkspace.projectId);
			if (!project) {
				// Log warning if pending workspace references non-existent project
				console.warn(
					`Pending workspace ${pendingWorkspace.id} references non-existent project ${pendingWorkspace.projectId}`,
				);
			} else {
				const pendingItem: DashboardSidebarWorkspace = {
					id: pendingWorkspace.id,
					projectId: pendingWorkspace.projectId,
					hostId: "",
					hostType: "local-device",
					accentColor: null,
					name: pendingWorkspace.name,
					branch: "",
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
					creationStatus: pendingWorkspace.status,
				};

				project.childEntries.push({
					tabOrder: PENDING_WORKSPACE_TAB_ORDER,
					child: {
						type: "workspace",
						workspace: pendingItem,
					},
				});
			}
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
		machineId,
		localPullRequestsByWorkspaceId,
		pendingWorkspace,
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
