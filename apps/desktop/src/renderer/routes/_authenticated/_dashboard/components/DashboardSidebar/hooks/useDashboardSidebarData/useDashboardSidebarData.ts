import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";

// Sits above every real workspace so the pending row lines up with the real one,
// which is inserted via getPrependTabOrder.
const PENDING_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;
const MAIN_WORKSPACE_TAB_ORDER = Number.MIN_SAFE_INTEGER;

type LocalPullRequest = DashboardSidebarWorkspace["pullRequest"];
type PullRequestWorkspaceRow = {
	workspaceId: string;
	pullRequest: LocalPullRequest;
};

function haveSameStrings(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

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

function useStableStringArray(values: string[]): string[] {
	const previousRef = useRef<string[] | null>(null);

	return useMemo(() => {
		const previous = previousRef.current;
		if (previous && haveSameStrings(previous, values)) {
			return previous;
		}

		previousRef.current = values;
		return values;
	}, [values]);
}

function useStableLocalPullRequestsByWorkspaceId(
	rows: PullRequestWorkspaceRow[] | undefined,
): Map<string, LocalPullRequest> {
	const previousRef = useRef<{
		fingerprint: string;
		map: Map<string, LocalPullRequest>;
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

	const { data: rawSidebarWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
				.innerJoin(
					{ workspaces: collections.v2Workspaces },
					({ sidebarWorkspaces, workspaces }) =>
						eq(sidebarWorkspaces.workspaceId, workspaces.id),
				)
				.innerJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.orderBy(
					({ sidebarWorkspaces }) => sidebarWorkspaces.sidebarState.tabOrder,
					"asc",
				)
				.select(({ sidebarWorkspaces, workspaces, hosts }) => ({
					id: workspaces.id,
					projectId: sidebarWorkspaces.sidebarState.projectId,
					hostId: workspaces.hostId,
					type: workspaces.type,
					hostIsOnline: hosts.isOnline,
					name: workspaces.name,
					branch: workspaces.branch,
					createdAt: workspaces.createdAt,
					updatedAt: workspaces.updatedAt,
					tabOrder: sidebarWorkspaces.sidebarState.tabOrder,
					sectionId: sidebarWorkspaces.sidebarState.sectionId,
					isHidden: sidebarWorkspaces.sidebarState.isHidden,
				})),
		[collections],
	);

	const sidebarWorkspaces = useMemo(
		() => getVisibleSidebarWorkspaces(rawSidebarWorkspaces),
		[rawSidebarWorkspaces],
	);

	const localStateWorkspaceIds = useMemo(
		() => new Set(rawSidebarWorkspaces.map((workspace) => workspace.id)),
		[rawSidebarWorkspaces],
	);

	const { data: localMainWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.innerJoin({ hosts: collections.v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.where(({ workspaces }) => eq(workspaces.type, "main"))
				.select(({ workspaces, hosts }) => ({
					id: workspaces.id,
					projectId: workspaces.projectId,
					hostId: workspaces.hostId,
					type: workspaces.type,
					hostIsOnline: hosts.isOnline,
					name: workspaces.name,
					branch: workspaces.branch,
					createdAt: workspaces.createdAt,
					updatedAt: workspaces.updatedAt,
					tabOrder: MAIN_WORKSPACE_TAB_ORDER,
					sectionId: null as string | null,
				})),
		[collections],
	);

	const visibleSidebarWorkspaces = useMemo(() => {
		const sidebarProjectIds = new Set(
			sidebarProjects.map((project) => project.id),
		);
		const autoLocalMainWorkspaces = localMainWorkspaces.filter(
			(workspace) =>
				!localStateWorkspaceIds.has(workspace.id) &&
				workspace.hostId === machineId &&
				sidebarProjectIds.has(workspace.projectId),
		);

		return [...autoLocalMainWorkspaces, ...sidebarWorkspaces];
	}, [
		localMainWorkspaces,
		localStateWorkspaceIds,
		machineId,
		sidebarProjects,
		sidebarWorkspaces,
	]);

	const computedLocalWorkspaceIds = useMemo(
		() =>
			visibleSidebarWorkspaces
				.filter((workspace) => workspace.hostId === machineId)
				.map((workspace) => workspace.id)
				.sort(),
		[machineId, visibleSidebarWorkspaces],
	);
	const localWorkspaceIds = useStableStringArray(computedLocalWorkspaceIds);

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

	const localPullRequestsByWorkspaceId =
		useStableLocalPullRequestsByWorkspaceId(pullRequestData?.workspaces);

	const computedGroups = useMemo<DashboardSidebarProject[]>(() => {
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

		for (const workspace of visibleSidebarWorkspaces) {
			const project = projectsById.get(workspace.projectId);
			if (!project) continue;

			const hostType: DashboardSidebarWorkspace["hostType"] =
				workspace.hostId === machineId ? "local-device" : "remote-device";

			const sidebarWorkspace: DashboardSidebarWorkspace = {
				id: workspace.id,
				projectId: workspace.projectId,
				hostId: workspace.hostId,
				hostType,
				type: workspace.type,
				hostIsOnline:
					hostType === "remote-device" ? workspace.hostIsOnline : null,
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
				type: "worktree",
				hostIsOnline: null,
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

			const sortedChildren = childEntries
				.sort((left, right) => left.tabOrder - right.tabOrder)
				.map(({ child }) => child);

			// Ungrouped workspaces rendered after a section header are visually
			// grouped with that section (shared accent, collapse-together) and will
			// be committed into it on next DnD. Reparent them here so section counts
			// match what the user sees.
			const children: DashboardSidebarProjectChild[] = [];
			let currentSection: DashboardSidebarSection | null = null;
			for (const child of sortedChildren) {
				if (child.type === "section") {
					currentSection = child.section;
					children.push(child);
				} else if (currentSection) {
					currentSection.workspaces.push({
						...child.workspace,
						accentColor: currentSection.color,
					});
				} else {
					children.push(child);
				}
			}
			sidebarProject.children = children;
			return [sidebarProject];
		});
	}, [
		machineId,
		localPullRequestsByWorkspaceId,
		pendingWorkspaces,
		sidebarProjects,
		sidebarSections,
		visibleSidebarWorkspaces,
	]);
	const groups = useStableDashboardSidebarProjects(computedGroups);

	return {
		groups,
		refetchPullRequests,
		refreshWorkspacePullRequest,
		toggleProjectCollapsed,
	};
}
